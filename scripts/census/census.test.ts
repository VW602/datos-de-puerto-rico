import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildPublicRegistry, PUBLIC_FIELDS } from "../registry/public.ts";
import { METRIC_FORMULAS } from "./formulas.ts";
import { parseCensusCell } from "./normalize.ts";
import {
  assertMunicipioRows,
  buildCensusArtifacts,
  decode,
  normalizeRelease,
  readManifest,
  sha256,
  type GeneratedCensus,
} from "./pipeline.ts";
import { RELEASES } from "./releases.ts";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");
const manifest = readManifest(ROOT);
const geoManifest = JSON.parse(readFileSync(join(ROOT, "data/raw/geo/tiger-2024/manifest.json"), "utf8"));
const blsManifest = JSON.parse(readFileSync(join(ROOT, "data/raw/bls/laus/manifest.json"), "utf8"));
const usaManifest = JSON.parse(readFileSync(join(ROOT, "data/raw/usaspending/manifest.json"), "utf8"));
const femaManifest = JSON.parse(readFileSync(join(ROOT, "data/source/fema/manifest.json"), "utf8"));
const generated = JSON.parse(read("data/generated/census-municipios.json")) as GeneratedCensus;
const registry = JSON.parse(read("data/registry/sources.json"));
const publicRegistry = JSON.parse(read("data/generated/sources.public.json"));
const normalized = Object.fromEntries(manifest.snapshots.map((s) => [s.snapshotId, normalizeRelease(ROOT, s)]));
const ids = Object.keys(generated.municipios);

describe("78 municipios", () => {
  it("el resultado generado tiene exactamente 78 municipios con GEO_ID únicos de Puerto Rico", () => {
    expect(ids).toHaveLength(78);
    expect(new Set(ids).size).toBe(78);
    for (const id of ids) expect(id).toMatch(/^72\d{3}$/);
  });

  it("no hay nombres repetidos", () => {
    const names = ids.map((id) => generated.municipios[id].name);
    expect(new Set(names).size).toBe(78);
  });

  it("cada archivo de la copia oficial trae 78 filas de Puerto Rico y nada más", () => {
    for (const snapshot of manifest.snapshots) {
      for (const file of snapshot.files) {
        expect(file.rows, file.path).toBe(78);
        const lines = read(file.path).trim().split("\n").slice(1);
        expect(lines, file.path).toHaveLength(78);
      }
    }
  });

  it("la validación falla si sobra, falta o se repite un municipio, o si entra otro estado", () => {
    const good = ids.map((id) => `0500000US${id}`);
    expect(() => assertMunicipioRows(good, "ok")).not.toThrow();
    expect(() => assertMunicipioRows(good.slice(1), "falta")).toThrow(/78/);
    expect(() => assertMunicipioRows([...good.slice(1), good[0].replace("US72", "US01")], "otro estado")).toThrow();
    expect(() => assertMunicipioRows([...good.slice(1), good[1]], "repetido")).toThrow(/repetido/);
  });
});

describe("manifiesto y checksums", () => {
  it("tiene los campos de procedencia de cada snapshot", () => {
    expect(manifest.snapshots.map((s) => s.snapshotId).sort()).toEqual(RELEASES.map((r) => r.snapshotId).sort());
    for (const s of manifest.snapshots) {
      expect(s.sourceURL).toMatch(/^https:\/\/www2\.census\.gov\//);
      expect(s.retrievedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(s.recordCount).toBe(78);
      expect(s.extractionMethod.length).toBeGreaterThan(20);
      const release = RELEASES.find((r) => r.snapshotId === s.snapshotId)!;
      const tables = s.files.filter((f) => f.kind === "table").map((f) => f.table);
      expect(tables.sort()).toEqual([...release.tables].sort());
      expect(s.files.filter((f) => f.kind === "geos")).toHaveLength(1);
    }
    expect(manifest.attribution).toMatch(/U\.S\. Census Bureau/);
  });

  it("cada archivo guardado coincide con su SHA-256, y el del archivo oficial completo queda registrado", () => {
    for (const s of manifest.snapshots) {
      for (const file of s.files) {
        expect(file.sha256).toMatch(/^[0-9a-f]{64}$/);
        expect(file.upstream.sha256).toMatch(/^[0-9a-f]{64}$/);
        expect(file.upstream.bytes).toBeGreaterThan(file.rows);
        expect(file.sourceURL).toMatch(/^https:\/\/www2\.census\.gov\//);
        expect(sha256(readFileSync(join(ROOT, file.path))), file.path).toBe(file.sha256);
      }
    }
  });
});

describe("valores especiales del Censo", () => {
  it.each([
    ["-666666666", "not_computable"],
    ["-999999999", "insufficient_sample"],
    ["-888888888", "not_applicable"],
    ["-222222222", "moe_not_computable"],
    ["-333333333", "moe_open_ended_median"],
    ["-555555555", "moe_controlled"],
    ["", "missing"],
    ["null", "missing"],
  ])("%s se vuelve null con razón %s, nunca 0", (raw, status) => {
    expect(parseCensusCell(raw)).toEqual({ value: null, status });
  });

  it("un 0 publicado sigue siendo 0", () => {
    expect(parseCensusCell("0")).toEqual({ value: 0, status: "ok" });
    const maricao = normalized["acs-2020-2024"].municipios["72093"];
    expect(maricao.variables.B23025_E005).toBe(0);
    expect(generated.municipios["72093"].metrics.unemployment.estimate).toBe(0);
  });

  it("un valor que no se entiende detiene el proceso en vez de colarse", () => {
    expect(() => parseCensusCell("abc")).toThrow();
    expect(() => parseCensusCell("-12")).toThrow();
  });

  it("los sentinelas de la copia real quedan como null con su razón", () => {
    const base = normalized["acs-2019-2023"].municipios["72001"];
    expect(base.variables.B01001_M001).toBeNull();
    expect(base.statuses.B01001_M001).toBe("moe_controlled");
    expect(generated.municipios["72001"].metrics.population.moe).toBeNull();
  });
});

describe("estimados y márgenes de error", () => {
  it("se conservan todos los estimados y márgenes de la copia oficial, sin cambiarlos", () => {
    let checked = 0;
    for (const snapshot of manifest.snapshots) {
      for (const file of snapshot.files.filter((f) => f.kind === "table")) {
        const [head, ...rows] = decode(readFileSync(join(ROOT, file.path))).trim().split("\n");
        const header = head.split("|");
        expect(header.some((c) => /_M\d{3}$/.test(c)), file.path).toBe(true);
        for (const row of rows) {
          const cells = row.split("|");
          const target = normalized[snapshot.snapshotId].municipios[cells[0].slice(-5)];
          header.slice(1).forEach((column, i) => {
            expect(target.variables[column], `${file.path} ${cells[0]} ${column}`).toBe(parseCensusCell(cells[i + 1]).value);
            checked += 1;
          });
        }
      }
    }
    expect(checked).toBeGreaterThan(10_000);
  });

  it("las medidas de una sola variable llevan su margen de error oficial", () => {
    const formulas = METRIC_FORMULAS.filter((f) => f.moe);
    expect(formulas.map((f) => f.id).sort()).toEqual(["homevalue", "income", "medianage", "percapita", "population", "rent"]);
    for (const formula of formulas) {
      for (const id of ids) {
        const variables = normalized[formula.snapshotId].municipios[id].variables;
        expect(generated.municipios[id].metrics[formula.id].moe, `${id} ${formula.id}`).toBe(variables[formula.moe!]);
      }
    }
    expect(generated.municipios["72113"].metrics.income.moe).toBeGreaterThan(0);
  });
});

describe("reproducción exacta de los valores verificados", () => {
  it("2020–2024: 15 medidas × 78 municipios = 1,170 valores verificados", () => {
    const count = METRIC_FORMULAS.filter((f) => f.snapshotId === "acs-2020-2024").length * 78;
    expect(count).toBe(1170);
  });

  it("cada medida del Censo del registro tiene fórmula, y viceversa", () => {
    const acs = registry.records.filter((r: { datasetId: string }) => r.datasetId.startsWith("acs-"));
    const registered = acs.flatMap((r: { metrics: string[] }) => r.metrics).sort();
    expect(METRIC_FORMULAS.map((f) => f.id).sort()).toEqual(registered);
  });
});

describe("generación reproducible sin red", () => {
  it("lo generado desde la copia guardada es idéntico, byte por byte, a lo que está en el repositorio", () => {
    const artifacts = buildCensusArtifacts(ROOT);
    for (const [path, content] of Object.entries(artifacts)) expect(read(path), path).toBe(content);
  });

  it("generar dos veces da el mismo resultado", () => {
    expect(buildCensusArtifacts(ROOT)).toEqual(buildCensusArtifacts(ROOT));
    expect(buildPublicRegistry(registry, manifest, geoManifest, blsManifest, usaManifest, femaManifest)).toBe(buildPublicRegistry(registry, manifest, geoManifest, blsManifest, usaManifest, femaManifest));
  });

  it("los archivos generados avisan que no se editan a mano", () => {
    for (const path of ["data/generated/census-municipios.json", "data/generated/sources.public.json", "data/normalized/census/acs-2020-2024.json"]) {
      expect(JSON.parse(read(path)).generated, path).toMatch(/NO EDITAR A MANO/);
    }
  });
});

describe("registro público", () => {
  it("está al día con el registro interno", () => {
    expect(read("data/generated/sources.public.json")).toBe(buildPublicRegistry(registry, manifest, geoManifest, blsManifest, usaManifest, femaManifest));
  });

  it("no lleva campos internos ni fuentes excluidas", () => {
    const allowed = new Set<string>([
      ...PUBLIC_FIELDS,
      "sourceURL",
      "methodology",
      "verified",
      "retrievedAt",
      "marginOfErrorAvailable",
      "valueExclusions",
    ]);
    const text = read("data/generated/sources.public.json");
    for (const record of publicRegistry.records) {
      for (const key of Object.keys(record)) expect(allowed.has(key), `${record.datasetId}.${key}`).toBe(true);
      expect(record.publicStatus).not.toBe("PUBLIC_EXCLUDED");
    }
    for (const word of ["rightsEvidence", "notes", "readiness", "publicationDecision", "redistributionStatus"]) {
      expect(text.toLowerCase(), word).not.toContain(word.toLowerCase());
    }
  });

  it("las fuentes del Censo dicen de dónde salen, cuándo se descargaron y que el Censo no respalda el proyecto", () => {
    for (const id of ["acs-2019-2023-base", "acs-2020-2024-layers"]) {
      const record = publicRegistry.records.find((r: { datasetId: string }) => r.datasetId === id);
      expect(record.attribution).toMatch(/U\.S\. Census Bureau/);
      expect(record.attribution).toMatch(/no lo respalda ni lo certifica/);
      expect(record.sourceURL).toMatch(/^https:\/\/www2\.census\.gov\//);
      expect(record.retrievedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(record.marginOfErrorAvailable).toBe(true);
    }
  });
});

describe("sin Census Reporter ni consultas al Censo en el producto", () => {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.(ts|tsx|mjs|js)$/.test(name) && !/\.test\.ts$/.test(name)) files.push(path);
    }
  };
  walk(join(ROOT, "src"));
  walk(join(ROOT, "scripts"));

  it("ningún archivo de código menciona Census Reporter", () => {
    for (const file of files) expect(readFileSync(file, "utf8"), file).not.toMatch(/censusreporter/i);
  });

  it("el código del sitio no consulta al Censo ni tiene funciones de servidor para eso", () => {
    for (const file of files.filter((f) => f.includes(`${join(ROOT, "src")}`))) {
      const text = readFileSync(file, "utf8");
      expect(text, file).not.toMatch(/census\.gov|createServerFn|fetchLive/);
    }
  });

  it("el sitio solo carga el registro público, nunca el interno", () => {
    for (const file of files.filter((f) => f.includes(`${join(ROOT, "src")}`))) {
      if (file.endsWith("sources.internal.ts")) continue;
      const text = readFileSync(file, "utf8");
      expect(text, file).not.toMatch(/(from|import\()\s*["'][^"']*(sources\.internal|registry\/sources\.json)/);
    }
  });
});
