import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { buildLaus, readManifest, sha256, type BlsManifest } from "./pipeline.ts";
import {
  MANIFEST,
  MEASURE_KEYS,
  OUTPUT,
  RAW_DIR,
  TERMS,
  municipioSeries,
  puertoRicoSeries,
} from "./source.ts";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");
const committed = read(OUTPUT);
const { data } = buildLaus(ROOT);
const census = JSON.parse(read("data/generated/census-municipios.json")) as {
  municipios: Record<string, { name: string }>;
};

type Point = {
  year: string;
  period: string;
  value: string;
  footnotes?: ({ code?: string } | null)[];
};
type Batch = { Results: { series: { seriesID: string; data: Point[] }[] } };

const temps: string[] = [];
afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** A throwaway copy of the raw snapshot and generated file, so tamper tests never touch the repo. */
function scratch(): string {
  const dir = mkdtempSync(join(tmpdir(), "bls-test-"));
  temps.push(dir);
  cpSync(join(ROOT, RAW_DIR), join(dir, RAW_DIR), { recursive: true });
  cpSync(join(ROOT, OUTPUT), join(dir, OUTPUT));
  return dir;
}

/** Edits one series in a scratch copy and re-records the batch checksum, as a real (changed) download would. */
function editSeries(dir: string, seriesId: string, edit: (points: Point[]) => Point[]): void {
  const manifest = readManifest(dir);
  const batch = manifest.batches.find((b) => b.request.seriesid.includes(seriesId))!;
  const body = JSON.parse(readFileSync(join(dir, batch.path), "utf8")) as Batch;
  const series = body.Results.series.find((s) => s.seriesID === seriesId)!;
  series.data = edit(series.data);
  const text = JSON.stringify(body);
  writeFileSync(join(dir, batch.path), text);
  batch.sha256 = sha256(text);
  batch.bytes = Buffer.byteLength(text);
  writeFileSync(join(dir, MANIFEST), JSON.stringify(manifest, null, 2) + "\n");
}

const PONCE = "72113";

describe("BLS LAUS: identidad y cobertura", () => {
  it("cubre los 78 municipios del Censo, con los mismos códigos y nombres", () => {
    expect(Object.keys(data.municipios)).toHaveLength(78);
    expect(Object.keys(data.municipios).sort()).toEqual(Object.keys(census.municipios).sort());
    for (const [id, block] of Object.entries(data.municipios))
      expect(block.name, id).toBe(census.municipios[id].name);
  });

  it("cada municipio usa sus propias series LAUCN{FIPS}, sin repetir", () => {
    const all: string[] = [];
    for (const [id, block] of Object.entries(data.municipios)) {
      for (const m of MEASURE_KEYS) {
        expect(block.series[m]).toBe(municipioSeries(id, m));
        expect(block.series[m]).toMatch(new RegExp(`^LAUCN${id}00000000\\d{2}$`));
        all.push(block.series[m]);
      }
    }
    expect(new Set(all).size).toBe(78 * 4);
    expect(data.puertoRico.series.rate).toBe("LAUST720000000000003");
    for (const m of MEASURE_KEYS) expect(data.puertoRico.series[m]).toBe(puertoRicoSeries(m));
  });

  it("los IDs de serie tienen 20 caracteres y las medidas son 03/04/05/06", () => {
    expect(municipioSeries(PONCE, "rate")).toBe("LAUCN721130000000003");
    expect(municipioSeries(PONCE, "unemployment")).toBe("LAUCN721130000000004");
    expect(municipioSeries(PONCE, "employment")).toBe("LAUCN721130000000005");
    expect(municipioSeries(PONCE, "laborForce")).toBe("LAUCN721130000000006");
    expect(() => municipioSeries("12086", "rate")).toThrow();
  });
});

describe("BLS LAUS: meses y valores", () => {
  it("el último mes es el último común de todas las series, no uno fijo en el código", () => {
    expect(data.latest).toBe(data.months[data.months.length - 1]);
    expect(data.latest).toMatch(/^\d{4}-(0[1-9]|1[0-2])$/);
    const manifest = readManifest(ROOT);
    for (const batch of manifest.batches) {
      const body = JSON.parse(read(batch.path)) as Batch;
      for (const s of body.Results.series) {
        const newest = s.data
          .filter((p) => p.period !== "M13")
          .map((p) => `${p.year}-${p.period.slice(1)}`)
          .sort()
          .pop();
        expect(newest, s.seriesID).toBe(data.latest);
      }
    }
  });

  it("guarda historia suficiente para el mes anterior, el cambio de 12 meses y la tendencia, sin décadas", () => {
    expect(data.months.length).toBeGreaterThanOrEqual(13);
    expect(data.months.length).toBeLessThanOrEqual(36);
    for (let i = 1; i < data.months.length; i++)
      expect(data.months[i] > data.months[i - 1]).toBe(true);
  });

  it("las cuatro medidas tienen un valor por mes, dentro de rango", () => {
    for (const block of [data.puertoRico, ...Object.values(data.municipios)]) {
      for (const m of MEASURE_KEYS) expect(block[m]).toHaveLength(data.months.length);
      for (let i = 0; i < data.months.length; i++) {
        const rate = block.rate[i];
        if (rate != null) expect(rate >= 0 && rate <= 100).toBe(true);
        for (const m of ["laborForce", "employment", "unemployment"] as const) {
          const v = block[m][i];
          if (v != null) expect(Number.isInteger(v) && v >= 0).toBe(true);
        }
        const [lf, emp, un] = [block.laborForce[i], block.employment[i], block.unemployment[i]];
        if (lf != null && emp != null && un != null) expect(emp + un).toBe(lf);
      }
    }
  });

  it("Ponce: los valores son los que publica BLS", () => {
    const ponce = data.municipios[PONCE];
    const i = data.months.indexOf(data.latest);
    const manifest = readManifest(ROOT);
    const batch = manifest.batches.find((b) => b.request.seriesid.includes(ponce.series.rate))!;
    const body = JSON.parse(read(batch.path)) as Batch;
    const raw = body.Results.series
      .find((s) => s.seriesID === ponce.series.rate)!
      .data.find((p) => `${p.year}-${p.period.slice(1)}` === data.latest)!;
    expect(ponce.rate[i]).toBe(Number(raw.value));
  });

  it("marca como preliminar el mes que BLS marca con P", () => {
    const flagged = new Set<string>();
    for (const batch of readManifest(ROOT).batches) {
      const body = JSON.parse(read(batch.path)) as Batch;
      for (const s of body.Results.series)
        for (const p of s.data)
          if ((p.footnotes ?? []).some((f) => f?.code === "P"))
            flagged.add(`${p.year}-${p.period.slice(1)}`);
    }
    expect(data.preliminary).toEqual([...flagged].sort());
    expect(data.preliminary).toContain(data.latest);
  });

  it("los datos guardados no tienen huecos, y la lista de faltantes lo dice", () => {
    expect(data.missing).toEqual([]);
  });

  it("un valor que BLS no publica queda vacío con su razón, nunca 0", () => {
    const dir = scratch();
    const month = data.months[5];
    editSeries(dir, municipioSeries(PONCE, "rate"), (points) =>
      points.filter((p) => `${p.year}-${p.period.slice(1)}` !== month),
    );
    const built = buildLaus(dir).data;
    const i = built.months.indexOf(month);
    expect(built.municipios[PONCE].rate[i]).toBeNull();
    expect(built.missing).toEqual([
      { series: municipioSeries(PONCE, "rate"), month, reason: "not_published" },
    ]);
  });

  it("un valor no numérico (p. ej. '-') queda vacío con su razón, nunca 0", () => {
    const dir = scratch();
    const month = data.months[3];
    editSeries(dir, municipioSeries(PONCE, "unemployment"), (points) =>
      points.map((p) => (`${p.year}-${p.period.slice(1)}` === month ? { ...p, value: "-" } : p)),
    );
    const built = buildLaus(dir).data;
    expect(built.municipios[PONCE].unemployment[built.months.indexOf(month)]).toBeNull();
    expect(built.missing).toEqual([
      { series: municipioSeries(PONCE, "unemployment"), month, reason: "not_numeric" },
    ]);
  });
});

describe("BLS LAUS: la generación falla en vez de adivinar", () => {
  it("falla si una serie no termina en el mismo mes que las demás", () => {
    const dir = scratch();
    editSeries(dir, municipioSeries(PONCE, "rate"), (points) =>
      points.filter((p) => `${p.year}-${p.period.slice(1)}` !== data.latest),
    );
    expect(() => buildLaus(dir)).toThrow(/mismo mes/);
  });

  it("falla si falta la serie de un municipio", () => {
    const dir = scratch();
    editSeries(dir, municipioSeries(PONCE, "laborForce"), () => []);
    expect(() => buildLaus(dir)).toThrow(/Falta la serie/);
  });

  it("falla si faltan municipios en la lista", () => {
    const dir = scratch();
    const manifest = readManifest(dir);
    manifest.municipios = manifest.municipios.slice(1);
    writeFileSync(join(dir, MANIFEST), JSON.stringify(manifest));
    expect(() => buildLaus(dir)).toThrow(/77 municipios/);
  });

  it("falla si un archivo crudo no coincide con su SHA-256", () => {
    const dir = scratch();
    const manifest = readManifest(dir) as BlsManifest;
    const path = join(dir, manifest.batches[0].path);
    writeFileSync(path, readFileSync(path, "utf8").replace('"6.5"', '"6.6"'));
    expect(() => buildLaus(dir)).toThrow(/Checksum/);
  });

  it("falla con un periodo inválido", () => {
    const dir = scratch();
    editSeries(dir, municipioSeries(PONCE, "rate"), (points) => [
      ...points,
      { ...points[0], period: "M14" },
    ]);
    expect(() => buildLaus(dir)).toThrow(/periodo inválido/);
  });

  it("falla si empleo + desempleo no suma la fuerza laboral", () => {
    const dir = scratch();
    editSeries(dir, municipioSeries(PONCE, "employment"), (points) =>
      points.map((p, i) => (i === 0 ? { ...p, value: String(Number(p.value) + 1) } : p)),
    );
    expect(() => buildLaus(dir)).toThrow(/no suma/);
  });
});

describe("BLS LAUS: reproducible", () => {
  it("el archivo publicado es exactamente lo que genera la copia guardada", () => {
    expect(buildLaus(ROOT).content).toBe(committed);
  });

  it("generar dos veces da los mismos bytes", () => {
    expect(buildLaus(ROOT).content).toBe(buildLaus(ROOT).content);
  });

  it("--check detecta un archivo generado desactualizado", () => {
    const dir = scratch();
    const run = () =>
      spawnSync(
        process.execPath,
        [join(ROOT, "scripts/bls/generate.ts"), `--root=${dir}`, "--check"],
        { encoding: "utf8" },
      );
    expect(run().status).toBe(0);
    writeFileSync(join(dir, OUTPUT), committed.replace(/"latest": "[^"]+"/, '"latest": "1999-01"'));
    const stale = run();
    expect(stale.status).toBe(1);
    expect(stale.stderr).toMatch(/Desactualizado/);
  });

  it("guarda la fecha de descarga, los términos y el aviso textual de BLS", () => {
    const manifest = readManifest(ROOT);
    expect(manifest.retrievedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(data.source.retrievedAt).toBe(manifest.retrievedAt);
    expect(data.source.terms).toEqual(TERMS);
    expect(data.source.attribution).toContain(TERMS.disclaimer);
    expect(manifest.api).toMatch(/^https:\/\/api\.bls\.gov\//);
    // The registry and the public record carry the same date as the snapshot (UTC).
    const record = (
      JSON.parse(read("data/registry/sources.json")) as {
        records: { datasetId: string; originalRetrievalAt: string }[];
      }
    ).records.find((r) => r.datasetId === "bls-laus-municipios")!;
    expect(record.originalRetrievalAt).toBe(manifest.retrievedAt);
    const publicRecord = (
      JSON.parse(read("data/generated/sources.public.json")) as {
        records: { datasetId: string; retrievedAt: string | null }[];
      }
    ).records.find((r) => r.datasetId === "bls-laus-municipios")!;
    expect(publicRecord.retrievedAt).toBe(manifest.retrievedAt);
  });
});
