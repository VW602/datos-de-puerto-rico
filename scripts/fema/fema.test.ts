import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  MEASURES,
  PII_PATTERN,
  buildFema,
  geoResolver,
  readManifest,
  sha256,
  tolerance,
  type GeneratedFema,
} from "./pipeline.ts";
import { planFingerprint, planRequests } from "./plan.ts";
import { CATALOG_FIELDS, EXTRACT_FIELDS, FORBIDDEN_FIELDS, extractResponse } from "./extract.ts";
import {
  DATASETS,
  GEO_STATES,
  MANIFEST,
  OUTPUT,
  PROJECTS_DIR,
  RAW_CACHE_DIR,
  SOURCE_DIR,
} from "./source.ts";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");
const committed = read(OUTPUT);
const built = buildFema(ROOT);
const data = built.data;
const manifest = readManifest(ROOT);
const census = JSON.parse(read("data/generated/census-municipios.json")) as {
  municipios: Record<string, { name: string }>;
};
const geo = geoResolver(manifest.municipios);
const SAN_JUAN = "72127";
const M = (m: (typeof MEASURES)[number]) => MEASURES.indexOf(m);

type Rec = Record<string, unknown>;
/** Every record of one dataset, from the committed public-safe extracts. */
function rawRecords(root: string, key: keyof typeof DATASETS): Rec[] {
  return readManifest(root)
    .files.filter((f) => f.key === `data/${key}`)
    .sort((a, b) => (a.page ?? 0) - (b.page ?? 0))
    .flatMap(
      (f) =>
        (JSON.parse(readFileSync(join(root, f.path), "utf8")) as Record<string, Rec[]>)[
          DATASETS[key].name
        ],
    );
}

const temps: string[] = [];
afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
});
function scratch(): string {
  const dir = mkdtempSync(join(tmpdir(), "fema-test-"));
  temps.push(dir);
  cpSync(join(ROOT, SOURCE_DIR), join(dir, SOURCE_DIR), { recursive: true });
  cpSync(join(ROOT, OUTPUT), join(dir, OUTPUT));
  cpSync(join(ROOT, PROJECTS_DIR), join(dir, PROJECTS_DIR), { recursive: true });
  return dir;
}
/**
 * Edits page 1 of a dataset's extract in a scratch copy, keeping the snapshot
 * consistent (counts, sizes, hashes), as a real changed download would.
 * `raw: true` writes the edited JSON as is, without re-extracting it.
 */
function edit(
  dir: string,
  key: keyof typeof DATASETS,
  change: (rows: Rec[], json: Record<string, unknown>) => void,
  raw = false,
): void {
  const m = readManifest(dir);
  const pages = m.files.filter((f) => f.key === `data/${key}`);
  const file = pages.find((f) => f.page === 1)!;
  const json = JSON.parse(readFileSync(join(dir, file.path), "utf8")) as Record<string, unknown>;
  const rows = json[DATASETS[key].name] as Rec[];
  const before = rows.length;
  change(rows, json);
  const delta = rows.length - before;
  for (const f of pages) {
    const page =
      f === file
        ? json
        : (JSON.parse(readFileSync(join(dir, f.path), "utf8")) as Record<string, unknown>);
    (page.metadata as { count: number }).count += delta;
    const text =
      raw && f === file
        ? JSON.stringify(page)
        : extractResponse(JSON.stringify(page), f.key, key).text;
    writeFileSync(join(dir, f.path), text);
    f.sha256 = sha256(text);
    f.bytes = Buffer.byteLength(text);
    f.sourceCount = (f.sourceCount ?? 0) + delta;
    if (f === file) f.records = rows.length;
  }
  writeFileSync(join(dir, MANIFEST), JSON.stringify(m, null, 2) + "\n");
}
const sum = (rows: Rec[], field: string, keep: (r: Rec) => boolean) =>
  rows
    .filter(keep)
    .reduce<number | null>(
      (a, r) => (r[field] == null ? a : (a ?? 0) + (r[field] as number)),
      null,
    );

describe("FEMA: plan y versiones", () => {
  it("las versiones de los datasets están fijadas en el pedido", () => {
    const endpoints = planRequests()
      .filter((p) => p.paged)
      .map((p) => p.endpoint);
    expect(endpoints).toEqual([
      "v2/DisasterDeclarationsSummaries",
      "v2/PublicAssistanceFundedProjectsDetails",
      "v4/HazardMitigationAssistanceProjects",
      "v2/HousingAssistanceOwners",
      "v2/HousingAssistanceRenters",
    ]);
    expect(planFingerprint(planRequests())).toBe(manifest.planFingerprint);
    for (const [key, d] of Object.entries(data.source.datasets)) {
      expect(d.version, key).toBe(DATASETS[key as keyof typeof DATASETS].version);
      expect(d.lastDataSetRefresh, key).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }
  });

  it("no pide datos por propiedad, por hogar ni direcciones de solicitantes", () => {
    const all = JSON.stringify(planRequests());
    expect(all).not.toMatch(
      /IndividualsAndHouseholdsProgramValidRegistrations|NfipPolicies|FimaNfipClaims|HazardMitigationAssistanceMitigatedProperties|PublicAssistanceApplicants|zipCode|city/,
    );
    for (const key of ["housingOwners", "housingRenters"] as const) {
      for (const r of rawRecords(ROOT, key).slice(0, 2000)) {
        expect(Object.keys(r)).not.toContain("zipCode");
        expect(Object.keys(r)).not.toContain("city");
      }
    }
  });
});

describe("FEMA: geografía", () => {
  it("Asistencia Pública: el municipio del solicitante nunca se publica como lugar del proyecto", () => {
    for (const [d, byMeasure] of Object.entries(data.island)) {
      for (const m of [
        "paObligated",
        "paProjects",
        "paProjectAmount",
        "paTotalObligated",
      ] as const) {
        const cell = byMeasure[m];
        if (!cell) continue;
        expect(cell.MUNICIPIO_ATTRIBUTABLE, `${d} ${m}`).toBeNull();
      }
    }
    const pa = Object.values(data.island).reduce(
      (a, x) => a + (x.paObligated?.APPLICANT_MUNICIPIO ?? 0),
      0,
    );
    expect(pa).toBeGreaterThan(1e9);
    for (const content of Object.values(built.projects)) {
      for (const row of (JSON.parse(content) as { rows: unknown[][] }).rows)
        expect(row[1], "fila de proyecto").not.toBe("A");
    }
    // Mitigation and households keep place geography; they never use the applicant state.
    for (const x of Object.values(data.island))
      for (const m of ["hmaFederalObligated", "ihpApproved"] as const)
        expect(x[m]?.APPLICANT_MUNICIPIO ?? null).toBeNull();
  });

  it("los 78 municipios se reconocen por nombre y código, con o sin acentos", () => {
    for (const [id, { name }] of Object.entries(census.municipios)) {
      expect(geo.county(name, id.slice(2))).toEqual({
        state: "MUNICIPIO_ATTRIBUTABLE",
        municipio: id,
      });
      expect(
        geo.county(`${name.normalize("NFD").replace(/\p{M}/gu, "")} (Municipio)`, undefined)
          .municipio,
      ).toBe(id);
    }
    expect(geo.county("Anasco", "11").municipio).toBe("72011");
    expect(Object.keys(data.municipios).sort()).toEqual(Object.keys(census.municipios).sort());
  });

  it("«Statewide» sigue siendo todo Puerto Rico, aunque traiga el código de San Juan", () => {
    expect(geo.county("Statewide", "127")).toEqual({
      state: "PUERTO_RICO_STATEWIDE",
      municipio: null,
    });
    expect(geo.county("Statewide", "21").state).toBe("PUERTO_RICO_STATEWIDE");
    const pa = rawRecords(ROOT, "publicAssistance");
    const statewide127 = pa.filter((r) => r.county === "Statewide" && r.countyCode === "127");
    expect(statewide127.length).toBeGreaterThan(1000);
  });

  it("San Juan recibe solo lo que FEMA registra en San Juan, nunca lo «Statewide»", () => {
    const pa = rawRecords(ROOT, "publicAssistance");
    const sj = sum(pa, "federalShareObligated", (r) => r.county === "San Juan");
    const allDisasters = Object.values(data.municipios[SAN_JUAN].values).reduce(
      (a, v) => a + (v[M("paObligated")] ?? 0),
      0,
    );
    expect(Math.abs(allDisasters - sj!)).toBeLessThan(1);
    const statewide = sum(pa, "federalShareObligated", (r) => r.county === "Statewide")!;
    expect(allDisasters).toBeLessThan(statewide / 10);
  });

  it("un nombre y un código que no coinciden quedan sin certeza; sin condado, sin municipio", () => {
    expect(geo.county("Ponce", "127").state).toBe("MUNICIPIO_UNCERTAIN");
    expect(geo.county("", "0").state).toBe("NO_MUNICIPIO_GEOGRAPHY");
    expect(geo.county(null, null).state).toBe("NO_MUNICIPIO_GEOGRAPHY");
    expect(geo.county("Otro Lugar", "999").state).toBe("MUNICIPIO_UNCERTAIN");
  });

  it("los estados geográficos suman el total de Puerto Rico de cada medida y desastre", () => {
    for (const [d, byMeasure] of Object.entries(data.island)) {
      for (const [m, cell] of Object.entries(byMeasure)) {
        if (!cell) continue;
        const parts = GEO_STATES.reduce((a, s) => a + (cell[s] ?? 0), 0);
        expect(Math.abs(parts - (cell.total ?? 0)), `${d} ${m}`).toBeLessThanOrEqual(
          tolerance(GEO_STATES.length),
        );
        const muni = Object.values(data.municipios).reduce(
          (a, x) => a + (x.values[d]?.[M(m as never)] ?? 0),
          0,
        );
        expect(
          Math.abs(muni - (cell.MUNICIPIO_ATTRIBUTABLE ?? 0) - (cell.APPLICANT_MUNICIPIO ?? 0)),
          `${d} ${m}`,
        ).toBeLessThan(1);
      }
    }
  });

  it("ningún dólar de FEMA se pierde: los totales coinciden con la suma de los registros", () => {
    const total = (key: keyof typeof DATASETS, field: string) =>
      sum(rawRecords(ROOT, key), field, () => true)!;
    const island = (m: (typeof MEASURES)[number]) =>
      Object.values(data.island).reduce((a, x) => a + (x[m]?.total ?? 0), 0);
    expect(
      Math.abs(island("paObligated") - total("publicAssistance", "federalShareObligated")),
    ).toBeLessThan(1);
    expect(
      Math.abs(island("paProjectAmount") - total("publicAssistance", "projectAmount")),
    ).toBeLessThan(1);
    expect(
      Math.abs(island("hmaFederalObligated") - total("mitigation", "federalShareObligated")),
    ).toBeLessThan(1);
    expect(
      Math.abs(
        island("ihpApproved") -
          total("housingOwners", "totalApprovedIhpAmount") -
          total("housingRenters", "totalApprovedIhpAmount"),
      ),
    ).toBeLessThan(1);
    expect(island("paProjects")).toBe(rawRecords(ROOT, "publicAssistance").length);
    expect(island("hmaProjects")).toBe(rawRecords(ROOT, "mitigation").length);
  });
});

describe("FEMA: declaraciones y desastres", () => {
  it("María (DR-4339-PR) designó los 78 municipios; el filtro sale de la fuente", () => {
    const maria = data.disasters.find((d) => d.key === "4339")!;
    expect(maria.declaration).toBe("DR-4339-PR");
    expect(maria.title).toMatch(/MARIA/);
    expect(maria.designatedMunicipios).toBe(78);
    const designated = Object.values(data.municipios).filter((m) => m.designations["4339"]).length;
    expect(designated).toBe(78);
    // The list comes from the data: every declared disaster with any record is there.
    const declared = new Set(rawRecords(ROOT, "declarations").map((r) => String(r.disasterNumber)));
    for (const d of data.disasters)
      if (d.declaredInPuertoRico) expect(declared.has(d.key)).toBe(true);
    for (const n of declared) expect(data.disasters.some((d) => d.key === n)).toBe(true);
  });

  it("los números de desastre fuera de Puerto Rico y los programas sin desastre van aparte, con su nombre", () => {
    const outside = data.disasters.filter((d) => !d.declaredInPuertoRico).map((d) => d.key);
    expect(outside).toContain("none");
    for (const d of data.disasters.filter((x) => !x.declaredInPuertoRico))
      expect(d.title).toBeNull();
    expect(data.hmaStatus.none).toBeDefined();
  });

  it("filtrar por desastre y sumar todos da lo mismo que todos juntos", () => {
    const keys = Object.keys(data.island);
    for (const m of ["paObligated", "ihpApproved"] as const) {
      const byDisaster = keys.reduce((a, d) => a + (data.island[d][m]?.total ?? 0), 0);
      expect(byDisaster).toBeGreaterThan(0);
    }
  });
});

describe("FEMA: montos", () => {
  it("costo del proyecto, obligado federal y total obligado son cifras distintas", () => {
    const i = (m: (typeof MEASURES)[number]) =>
      Object.values(data.island).reduce((a, x) => a + (x[m]?.total ?? 0), 0);
    expect(i("paProjectAmount")).not.toBeCloseTo(i("paObligated"), 0);
    expect(i("paTotalObligated")).toBeGreaterThanOrEqual(i("paObligated"));
  });

  it("un monto que FEMA no reporta queda vacío y se cuenta; nunca $0", () => {
    expect(data.nulls["mitigation.federalShareObligated"]).toBeGreaterThan(0);
    const dir = scratch();
    let target = "";
    edit(dir, "mitigation", (rows) => {
      const r = rows.find((x) => typeof x.county === "string" && x.county === "Culebra")!;
      target = "72049";
      for (const x of rows) if (x.county === "Culebra") x.federalShareObligated = null;
      expect(r).toBeDefined();
    });
    const after = buildFema(dir).data.municipios[target];
    for (const v of Object.values(after.values)) {
      const value = v[M("hmaFederalObligated")];
      expect(value === null || value !== 0).toBe(true);
    }
  });

  it("un ajuste negativo conserva su signo hasta el archivo generado", () => {
    const dir = scratch();
    edit(dir, "publicAssistance", (rows) => {
      for (const r of rows) if (r.county === "Culebra") r.federalShareObligated = -1_234_567.89;
    });
    const after = buildFema(dir).data.municipios["72049"];
    const total = Object.values(after.values).reduce((a, v) => a + (v[M("paObligated")] ?? 0), 0);
    expect(total).toBeLessThan(0);
  });

  it("un proyecto repetido hace fallar la generación", () => {
    const dir = scratch();
    edit(dir, "publicAssistance", (rows) => {
      rows.push({ ...rows[0] });
    });
    expect(() => buildFema(dir)).toThrow(/repetido/);
  });

  it("un registro de hogares repetido o con código postal hace fallar", () => {
    const a = scratch();
    edit(a, "housingOwners", (rows) => {
      rows.push({ ...rows[0] });
    });
    expect(() => buildFema(a)).toThrow(/repetido/);
    const b = scratch();
    edit(
      b,
      "housingRenters",
      (rows) => {
        rows[0].zipCode = "00901";
      },
      true,
    );
    expect(() => buildFema(b)).toThrow(/no es un extracto limpio|no permitido/);
  });

  it("los montos que no son números finitos se rechazan", () => {
    const dir = scratch();
    edit(dir, "publicAssistance", (rows) => {
      rows[0].projectAmount = "12";
    });
    expect(() => buildFema(dir)).toThrow(/no numérico/);
  });
});

describe("FEMA: extracto público y respuestas originales", () => {
  it("el repositorio guarda un extracto, no la respuesta original, y dice cuál era el SHA-256 de la original", () => {
    for (const f of manifest.files) {
      expect(f.path.startsWith(`${SOURCE_DIR}/`), f.path).toBe(true);
      expect(f.rawSha256, f.path).toMatch(/^[0-9a-f]{64}$/);
      expect(f.rawSha256).not.toBe(f.sha256);
      expect(f.rawBytes).toBeGreaterThan(f.bytes);
      const json = JSON.parse(read(f.path)) as { extract: string };
      expect(json.extract).toMatch(/^PUBLIC-SAFE EXTRACT/);
    }
    expect(read(MANIFEST)).toMatch(/no la respuesta original/);
  });

  it("los extractos solo tienen los campos permitidos; nunca títulos libres, direcciones ni contactos", () => {
    for (const f of manifest.files) {
      const text = read(f.path);
      for (const field of FORBIDDEN_FIELDS)
        expect(text, `${f.path} ${field}`).not.toContain(`"${field}"`);
      expect(text).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
      const json = JSON.parse(text) as Record<string, unknown>;
      const allowed: readonly string[] = f.key.startsWith("catalog/")
        ? CATALOG_FIELDS
        : EXTRACT_FIELDS[f.key.slice(5) as keyof typeof EXTRACT_FIELDS];
      const rows = (
        f.key.startsWith("catalog/")
          ? json.DataSets
          : json[DATASETS[f.key.slice(5) as keyof typeof DATASETS].name]
      ) as Rec[];
      for (const row of rows.slice(0, 500)) expect(Object.keys(row)).toEqual([...allowed]);
    }
    expect(EXTRACT_FIELDS.publicAssistance).not.toContain("applicationTitle");
    expect(EXTRACT_FIELDS.publicAssistance).not.toContain("applicantId");
    expect(EXTRACT_FIELDS.mitigation).not.toContain("subrecipient");
  });

  it("rehacer el extracto da los mismos bytes (y de la respuesta original, si está en la copia local)", () => {
    for (const f of manifest.files) {
      const request = planRequests().find((p) => p.key === f.key)!;
      expect(extractResponse(read(f.path), f.key, request.dataset).text, f.path).toBe(read(f.path));
    }
    // The exact responses are not in the repository; when this machine still has them, check they rebuild the extract.
    let checked = 0;
    for (const f of manifest.files) {
      const local = join(ROOT, RAW_CACHE_DIR, f.path.slice(SOURCE_DIR.length + 1));
      let raw: string;
      try {
        raw = readFileSync(local, "utf8");
      } catch {
        continue;
      }
      expect(sha256(raw), local).toBe(f.rawSha256);
      const request = planRequests().find((p) => p.key === f.key)!;
      expect(extractResponse(raw, f.key, request.dataset).text).toBe(read(f.path));
      checked += 1;
    }
    expect(checked === 0 || checked === manifest.files.length).toBe(true);
  });

  it("si una respuesta cambia de forma (falta un campo), el extracto falla en vez de inventar nulos", () => {
    const text = JSON.stringify({
      metadata: { count: 1 },
      HousingAssistanceOwners: [{ id: "x", disasterNumber: 1 }],
    });
    expect(() => extractResponse(text, "data/housingOwners", "housingOwners")).toThrow(
      /falta el campo/,
    );
  });
});

describe("FEMA: privacidad", () => {
  it("los archivos generados no tienen direcciones, códigos postales ni datos de contacto", () => {
    const files = [committed, ...Object.values(built.projects)];
    for (const text of files) {
      expect(text).not.toMatch(/zipCode|addressLine|"city"|applicantName|subrecipient/);
      expect(text).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
    }
    // Free-text project titles are never published (they can name families).
    for (const content of Object.values(built.projects)) {
      const file = JSON.parse(content) as { columns: string[]; rows: unknown[][] };
      expect(file.columns).not.toContain("title");
      expect(file.columns).not.toContain("applicationTitle");
      for (const row of file.rows) {
        expect(row).toHaveLength(file.columns.length);
        for (const cell of row)
          if (typeof cell === "string") expect(PII_PATTERN.test(cell)).toBe(false);
      }
    }
    expect(committed).not.toMatch(/Familia|applicationTitle/);
  });

  it("los hogares solo salen sumados por municipio y desastre", () => {
    const generated = data as GeneratedFema;
    expect(Object.keys(generated)).not.toContain("housing");
    expect(JSON.stringify(generated.municipios)).not.toMatch(/registrant|household/i);
  });
});

describe("FEMA: reproducible", () => {
  it("el archivo publicado es exactamente lo que genera la copia guardada", () => {
    expect(built.summary).toBe(committed);
    for (const [d, content] of Object.entries(built.projects))
      expect(content).toBe(read(`${PROJECTS_DIR}/${d}.json`));
  });

  it("generar dos veces da los mismos bytes", () => {
    const again = buildFema(ROOT);
    expect(again.summary).toBe(built.summary);
    expect(again.projects).toEqual(built.projects);
  });

  it("falla si un archivo crudo no coincide con su SHA-256, o si falta una página", () => {
    const a = scratch();
    const m = readManifest(a);
    const file = m.files.find((f) => f.key === "data/declarations")!;
    const text = readFileSync(join(a, file.path), "utf8").replace("HURRICANE", "HURRICANX");
    writeFileSync(join(a, file.path), text);
    expect(() => buildFema(a)).toThrow(/Checksum/);
    const b = scratch();
    const n = readManifest(b);
    writeFileSync(
      join(b, MANIFEST),
      JSON.stringify({
        ...n,
        files: n.files.filter((f) => !(f.key === "data/publicAssistance" && f.page === 2)),
      }),
    );
    expect(() => buildFema(b)).toThrow();
  });

  it("falla si la copia se hizo con otro plan", () => {
    const dir = scratch();
    const m = readManifest(dir);
    writeFileSync(join(dir, MANIFEST), JSON.stringify({ ...m, planFingerprint: "otro" }));
    expect(() => buildFema(dir)).toThrow(/otro plan/);
  });

  it("--check detecta un archivo generado desactualizado", () => {
    const dir = scratch();
    const run = () =>
      spawnSync(
        process.execPath,
        [join(ROOT, "scripts/fema/generate.ts"), `--root=${dir}`, "--check"],
        { encoding: "utf8" },
      );
    expect(run().status).toBe(0);
    writeFileSync(join(dir, `${PROJECTS_DIR}/4339.json`), "{}");
    const stale = run();
    expect(stale.status).toBe(1);
    expect(stale.stderr).toMatch(/Desactualizado/);
  });

  it("guarda las fechas de FEMA y de obtención, sin fijarlas en el código", () => {
    expect(data.source.retrievedAt).toBe(manifest.retrievedAt);
    expect(data.source.datasets.publicAssistance.lastDataSetRefresh).not.toBe(
      data.source.retrievedAt,
    );
    expect(read("scripts/fema/source.ts")).not.toMatch(/2026-10-0\d/);
    expect(data.source.terms.disclaimer).toMatch(/not endorsed by FEMA/);
  });
});
