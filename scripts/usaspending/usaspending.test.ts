import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildFunds,
  classify,
  readManifest,
  sha256,
  sumOutlays,
  tolerance,
  type Geo,
  type UsaManifest,
} from "./pipeline.ts";
import { canonical, planFingerprint, planRequests, requestId } from "./plan.ts";
import {
  ASSISTANCE_CODES,
  AWARD_GROUPS,
  GEO_STATES,
  MANIFEST,
  OUTPUT,
  PROCUREMENT_CODES,
  RAW_DIR,
  fiscalYearBounds,
  latestCompleteFiscalYear,
} from "./source.ts";
import { cacheMatches, responseProblem, type StagedMeta } from "./staging.ts";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");
const committed = read(OUTPUT);
const { data } = buildFunds(ROOT);
const manifest = readManifest(ROOT);
const census = JSON.parse(read("data/generated/census-municipios.json")) as {
  municipios: Record<string, { name: string }>;
};
const SAN_JUAN = "72127";
const PONCE = "72113";

const temps: string[] = [];
afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** A throwaway copy of the raw snapshot and output, so tamper tests never touch the repo. */
function scratch(): string {
  const dir = mkdtempSync(join(tmpdir(), "usa-test-"));
  temps.push(dir);
  cpSync(join(ROOT, RAW_DIR), join(dir, RAW_DIR), { recursive: true });
  cpSync(join(ROOT, OUTPUT), join(dir, OUTPUT));
  return dir;
}

/** Edits one raw response in a scratch copy and re-records its checksum, as a real (changed) download would. */
function edit(
  dir: string,
  key: string,
  change: (json: Record<string, unknown>) => void,
  page = 1,
): void {
  const m = readManifest(dir);
  const file = m.files.find((f) => f.key === key && (f.page === null || f.page === page))!;
  const json = JSON.parse(readFileSync(join(dir, file.path), "utf8")) as Record<string, unknown>;
  change(json);
  const text = JSON.stringify(json);
  writeFileSync(join(dir, file.path), text);
  file.sha256 = sha256(text);
  file.bytes = Buffer.byteLength(text);
  writeFileSync(join(dir, MANIFEST), JSON.stringify(m, null, 2) + "\n");
}
type Row = {
  shape_code: string;
  display_name?: string | null;
  aggregated_amount: number;
  total_outlays?: number | null;
};
const rows = (json: Record<string, unknown>) => json.results as Row[];
const fy = data.fiscalYear;

describe("USAspending: plan de pedidos", () => {
  it("los grupos de tipo de adjudicación cubren todos los códigos que acepta la API, sin repetir", () => {
    // Valid values listed by the API itself for filters|award_type_codes.
    const api = [
      "IDV_A",
      "IDV_B",
      "IDV_B_A",
      "IDV_B_B",
      "IDV_B_C",
      "IDV_C",
      "IDV_D",
      "IDV_E",
      "02",
      "03",
      "04",
      "05",
      "06",
      "07",
      "08",
      "09",
      "10",
      "11",
      "A",
      "B",
      "C",
      "D",
      "-1",
      "F001",
      "F002",
      "F003",
      "F004",
      "F005",
      "F006",
      "F007",
      "F008",
      "F009",
      "F010",
    ];
    const all = Object.values(AWARD_GROUPS).flat();
    expect(new Set(all).size).toBe(all.length);
    expect([...all].sort()).toEqual([...api].sort());
    expect([...PROCUREMENT_CODES, ...ASSISTANCE_CODES].sort()).toEqual([...api].sort());
  });

  it("la huella del plan es determinista y cambia si cambia un pedido", () => {
    const ids = Object.keys(census.municipios);
    const plan = planRequests(ids, fy);
    expect(planFingerprint(plan)).toBe(planFingerprint(planRequests([...ids].reverse(), fy)));
    expect(planFingerprint(plan)).toBe(manifest.planFingerprint);
    expect(planFingerprint(planRequests(ids, fy - 1))).not.toBe(planFingerprint(plan));
    const changed = structuredClone(plan);
    (changed[5].body as { scope: string }).scope = "recipient_location";
    expect(planFingerprint(changed)).not.toBe(planFingerprint(plan));
    expect(new Set(plan.map((p) => p.key)).size).toBe(plan.length);
  });

  it("todo es por lugar de ejecución: nunca por ubicación de quien recibe", () => {
    for (const request of planRequests(Object.keys(census.municipios), fy)) {
      const body = JSON.stringify(request.body ?? {});
      expect(body).not.toMatch(/recipient_location|recipient_locations|recipient_search_text/);
      if (request.endpoint === "search/spending_by_geography/")
        expect((request.body as { scope: string }).scope).toBe("place_of_performance");
    }
  });

  it("el ID de un pedido no depende del orden de las claves", () => {
    expect(requestId("POST", "x/", { a: 1, b: [1, 2] })).toBe(
      requestId("POST", "x/", { b: [1, 2], a: 1 }),
    );
    expect(canonical({ b: 1, a: { d: 1, c: 2 } })).toBe('{"a":{"c":2,"d":1},"b":1}');
    expect(requestId("POST", "x/", { a: 1, page: 1 })).not.toBe(
      requestId("POST", "x/", { a: 1, page: 2 }),
    );
  });
});

describe("USAspending: copia temporal reanudable", () => {
  const request = { endpoint: "search/spending_by_geography/", paged: false };
  const text = JSON.stringify({ results: [] });
  const meta: StagedMeta = {
    id: "abc",
    key: "k",
    page: null,
    method: "POST",
    endpoint: request.endpoint,
    body: { a: 1 },
    planFingerprint: "plan-1",
    retrievedAt: "2026-10-07T00:00:00Z",
    status: 200,
    bytes: text.length,
    sha256: sha256(text),
  };
  const expected = {
    id: "abc",
    key: "k",
    page: null,
    method: "POST" as const,
    endpoint: request.endpoint,
    body: { a: 1 },
    planFingerprint: "plan-1",
  };

  it("reusa solo una respuesta a un pedido idéntico, intacta y válida", () => {
    expect(cacheMatches(meta, expected, Buffer.from(text), request)).toBe(true);
    // Same request under a new plan: validated against it and reusable (the updater logs the plan change).
    expect(
      cacheMatches(meta, { ...expected, planFingerprint: "plan-2" }, Buffer.from(text), request),
    ).toBe(true);
    expect(cacheMatches(meta, { ...expected, id: "otro" }, Buffer.from(text), request)).toBe(false);
    expect(cacheMatches(meta, { ...expected, page: 2 }, Buffer.from(text), request)).toBe(false);
    expect(cacheMatches(meta, { ...expected, body: { a: 2 } }, Buffer.from(text), request)).toBe(
      false,
    );
    expect(cacheMatches(meta, expected, Buffer.from(text.replace("[]", "[1]")), request)).toBe(
      false,
    );
  });

  it("no acepta respuestas vacías, cortadas o con error de la API", () => {
    expect(responseProblem("", request)).toMatch(/JSON/);
    expect(responseProblem('{"results":[', request)).toMatch(/JSON/);
    expect(responseProblem('{"detail":"bad"}', request)).toMatch(/error de la API/);
    expect(responseProblem("{}", request)).toMatch(/results/);
    expect(responseProblem('{"results":[]}', { endpoint: "search/x/", paged: true })).toMatch(
      /page_metadata/,
    );
  });
});

describe("USAspending: años fiscales", () => {
  it("un año fiscal federal va del 1 de octubre al 30 de septiembre", () => {
    expect(fiscalYearBounds(2026)).toEqual({ start: "2025-10-01", end: "2026-09-30" });
    expect(latestCompleteFiscalYear("2026-09-30")).toBe(2025);
    expect(latestCompleteFiscalYear("2026-10-01")).toBe(2026);
    expect(data.period).toEqual(fiscalYearBounds(fy));
    expect(data.history).toEqual([fy - 4, fy - 3, fy - 2, fy - 1, fy]);
  });

  it("falla si un pedido no cubre el año fiscal completo", () => {
    const dir = scratch();
    const m = readManifest(dir) as UsaManifest;
    const file = m.files.find((f) => f.key === `fy${fy}/geo-state-transactions-all`)!;
    (
      file.body as { filters: { time_period: { start_date: string }[] } }
    ).filters.time_period[0].start_date = `${fy - 1}-09-30`;
    writeFileSync(join(dir, MANIFEST), JSON.stringify(m));
    expect(() => buildFunds(dir)).toThrow();
  });
});

describe("USAspending: geografía", () => {
  it("los 78 municipios con sus códigos y nombres del Censo; ningún municipio inventado", () => {
    expect(Object.keys(data.municipios).sort()).toEqual(Object.keys(census.municipios).sort());
    for (const [id, m] of Object.entries(data.municipios))
      expect(m.name).toBe(census.municipios[id].name);
  });

  it("falla con un código de municipio que no existe o con otro nombre", () => {
    const a = scratch();
    edit(a, `fy${fy}/geo-county-transactions-all`, (json) => {
      rows(json)[0].shape_code = "72999";
    });
    expect(() => buildFunds(a)).toThrow(/no es un municipio/);
    const b = scratch();
    edit(b, `fy${fy}/geo-county-transactions-all`, (json) => {
      rows(json)[0].display_name = "Otro Municipio";
    });
    expect(() => buildFunds(b)).toThrow(/se llama/);
  });

  it("los cuatro estados geográficos suman el total de Puerto Rico, cada año", () => {
    for (const year of data.island.history) {
      const sum = GEO_STATES.reduce((a, k) => a + year.states[k], 0);
      expect(Math.abs(sum - year.total)).toBeLessThanOrEqual(tolerance(GEO_STATES.length));
    }
    const s = data.island.states;
    expect(s.PUERTO_RICO_STATEWIDE).toBeGreaterThan(0);
    const attributable = Object.values(data.municipios).reduce(
      (a, m) => a + (m.attributable ?? 0),
      0,
    );
    expect(Math.abs(attributable - s.MUNICIPIO_ATTRIBUTABLE)).toBeLessThanOrEqual(tolerance(78));
    const uncertain = Object.values(data.municipios).reduce((a, m) => a + m.uncertain, 0);
    expect(Math.abs(uncertain - s.MUNICIPIO_UNCERTAIN)).toBeLessThanOrEqual(tolerance(78));
  });

  it("lo que es para todo Puerto Rico no se le asigna a ningún municipio", () => {
    const statewide = data.island.states.PUERTO_RICO_STATEWIDE;
    for (const m of Object.values(data.municipios)) {
      expect(m.attributable ?? 0).toBeLessThan(statewide);
      if (m.recorded !== null)
        expect(
          Math.abs(m.recorded - m.contracts - m.individuals - m.uncertain),
        ).toBeLessThanOrEqual(0.02);
    }
  });

  it("San Juan: lo atribuible es mucho menos que lo registrado allí", () => {
    const sj = data.municipios[SAN_JUAN];
    expect(sj.recorded!).toBeGreaterThan(sj.attributable!);
    expect(sj.uncertain).toBeGreaterThan(0);
    expect(sj.attributable).toBe(Math.round((sj.contracts + sj.individuals) * 100) / 100);
    // Title I and FEMA Public Assistance recorded in San Juan are not attributable to it.
    const attributablePrograms = sj.individualPrograms.map(([code]) => code);
    expect(attributablePrograms).not.toContain("84.010");
    expect(attributablePrograms).not.toContain("97.036");
  });

  it("clasificar no depende del orden ni reasigna por concentración", () => {
    const geo = (rows: [string, number][], state: number): Geo => ({
      byId: new Map(
        rows.map(([id, v]) => [id, { shape_code: id, display_name: "", aggregated_amount: v }]),
      ),
      noCounty: null,
      state: { shape_code: "PR", display_name: "Puerto Rico", aggregated_amount: state },
    });
    // One municipio with all the money: still split only by documented fields.
    const r = classify(
      geo([["72127", 100]], 130),
      geo([["72127", 10]], 15),
      geo([["72127", 30]], 35),
      ["72113", "72127"],
    );
    expect(r.perMunicipio.get("72127")).toEqual({
      recorded: 100,
      contracts: 10,
      individuals: 30,
      attributable: 40,
      uncertain: 60,
    });
    expect(r.perMunicipio.get("72113")!.recorded).toBeNull();
    expect(r.perMunicipio.get("72113")!.attributable).toBeNull();
    expect(r.states).toEqual({
      MUNICIPIO_ATTRIBUTABLE: 40,
      MUNICIPIO_UNCERTAIN: 60,
      PUERTO_RICO_STATEWIDE: 25,
      NO_MUNICIPIO_GEOGRAPHY: 5,
    });
  });
});

describe("USAspending: dinero", () => {
  it("un desembolso no reportado queda vacío; un $0 real queda en $0", () => {
    expect(sumOutlays([null, null])).toBeNull();
    expect(sumOutlays([])).toBeNull();
    expect(sumOutlays([0, null])).toBe(0);
    expect(sumOutlays([0])).toBe(0);
  });

  it("al tocar la copia: desembolsos nulos siguen nulos; un monto $0 sigue en $0", () => {
    // Ponce's outlays become "not reported" in every award-level response, and
    // the Puerto Rico totals lose them too, so the snapshot stays consistent.
    const dir = scratch();
    for (const s of ["procurement", "individuals"]) {
      let removed = 0;
      edit(dir, `fy${fy}/geo-county-awards-${s}`, (json) => {
        for (const r of rows(json))
          if (r.shape_code === PONCE) {
            removed = r.total_outlays ?? 0;
            r.total_outlays = null;
          }
      });
      edit(dir, `fy${fy}/geo-state-awards-${s}`, (json) => {
        rows(json)[0].total_outlays = rows(json)[0].total_outlays! - removed;
      });
    }
    const built = buildFunds(dir).data;
    expect(built.municipios[PONCE].award.attributableOutlays).toBeNull();
    expect(built.missing).toContainEqual({
      municipioId: PONCE,
      measure: "outlays",
      fiscalYear: fy,
      reason: "outlays_not_reported",
    });
  });

  it("un neto negativo sobrevive de la copia cruda al archivo generado, con su signo", () => {
    // Make one municipio's contracts net negative, consistently in every response that adds them up.
    const id = Object.keys(data.municipios).find(
      (k) => data.municipios[k].contracts > 0 && data.municipios[k].contractAgencies.length > 0,
    )!;
    const before = data.municipios[id];
    const K = before.attributable! + 1_234_567.89;
    const dir = scratch();
    const minus = (
      key: string,
      match: (r: Record<string, unknown>) => boolean,
      field = "aggregated_amount",
    ) =>
      edit(dir, key, (json) => {
        const row = (json.results as Record<string, unknown>[]).find(match)!;
        row[field] = (row[field] as number) - K;
      });
    const county = (r: Record<string, unknown>) => r.shape_code === id;
    const state = (r: Record<string, unknown>) => r.shape_code === "PR";
    minus(`fy${fy}/geo-county-transactions-all`, county);
    minus(`fy${fy}/geo-state-transactions-all`, state);
    minus(`fy${fy}/geo-county-transactions-procurement`, county);
    minus(`fy${fy}/geo-state-transactions-procurement`, state);
    minus(`fy${fy}/geo-county-transactions-type-contracts`, county);
    minus(`fy${fy}/geo-state-transactions-type-contracts`, state);
    const agency = readManifest(dir).files.find(
      (f) => f.key === `fy${fy}/municipio/${id}/agency-procurement` && f.page === 1,
    )!;
    const code = (
      JSON.parse(readFileSync(join(dir, agency.path), "utf8")) as { results: { code: string }[] }
    ).results[0].code;
    minus(`fy${fy}/municipio/${id}/agency-procurement`, (r) => r.code === code, "amount");
    minus(`fy${fy}/island/agency-all`, (r) => r.code === code, "amount");

    const after = buildFunds(dir).data.municipios[id];
    expect(after.attributable).toBeLessThan(0);
    expect(after.attributable).toBeCloseTo(before.attributable! - K, 2);
    expect(after.attributable).not.toBeNull();
    expect(after.attributable).not.toBe(0);
    expect(buildFunds(dir).content).toContain(`"attributable":${after.attributable}`);
  });

  it("los montos que no son números finitos se rechazan", () => {
    const dir = scratch();
    edit(dir, `fy${fy}/geo-county-transactions-all`, (json) => {
      (rows(json)[0] as { aggregated_amount: unknown }).aggregated_amount = "12";
    });
    expect(() => buildFunds(dir)).toThrow(/no numérico/);
  });

  it("los desgloses suman su parte: un dólar de más en un programa hace fallar", () => {
    const dir = scratch();
    edit(dir, `fy${fy}/municipio/${PONCE}/program-all`, (json) => {
      (json.results as { amount: number }[])[0].amount += 1;
    });
    expect(() => buildFunds(dir)).toThrow(/programas vs. asistencia/);
  });

  it("una página repetida no se cuenta dos veces: falla", () => {
    const dir = scratch();
    edit(dir, `fy${fy}/municipio/${SAN_JUAN}/program-all`, (json) => {
      const r = json.results as unknown[];
      r.push(r[0]);
    });
    expect(() => buildFunds(dir)).toThrow(/repetido/);
  });

  it("un municipio repetido en la respuesta hace fallar", () => {
    const dir = scratch();
    edit(dir, `fy${fy}/geo-county-transactions-procurement`, (json) => {
      rows(json).push({ ...rows(json)[0] });
    });
    expect(() => buildFunds(dir)).toThrow(/repetido/);
  });

  it("obligado y desembolsado son cifras distintas: CDBG-DR de Puerto Rico", () => {
    const byId = new Map(data.cdbg.map((c) => [c.awardId, c]));
    for (const id of ["B-18-DP-72-0001", "B-18-DP-72-0002", "B-18-DE-72-0001", "B-17-DM-72-0001"]) {
      const award = byId.get(id)!;
      expect(award, id).toBeDefined();
      expect(award.obligated).toBeGreaterThan(1e9);
      expect(award.outlays).not.toBeNull();
      expect(award.outlays!).toBeLessThan(award.obligated);
    }
    // Mitigation grant: obligated in the billions, a fraction paid out.
    expect(
      byId.get("B-18-DP-72-0002")!.outlays! / byId.get("B-18-DP-72-0002")!.obligated,
    ).toBeLessThan(0.5);
  });

  it("no guarda nombres ni direcciones de recipientes", () => {
    expect(committed).not.toMatch(/recipient|Recipient|DUNS|UEI|address/);
    for (const file of manifest.files.filter((f) => f.key === "cdbg-dr/awards")) {
      expect(readFileSync(join(ROOT, file.path), "utf8")).not.toMatch(
        /Recipient Name|recipient_name/,
      );
    }
  });
});

describe("USAspending: reproducible", () => {
  it("el archivo publicado es exactamente lo que genera la copia guardada", () => {
    expect(buildFunds(ROOT).content).toBe(committed);
  });

  it("generar dos veces da los mismos bytes", () => {
    expect(buildFunds(ROOT).content).toBe(buildFunds(ROOT).content);
  });

  it("falla si un archivo crudo no coincide con su SHA-256", () => {
    const dir = scratch();
    const m = readManifest(dir);
    const path = join(dir, m.files[5].path);
    writeFileSync(path, readFileSync(path, "utf8") + " ");
    expect(() => buildFunds(dir)).toThrow(/Checksum/);
  });

  it("falla si la copia se hizo con otro plan, o le falta un pedido", () => {
    const a = scratch();
    const m = readManifest(a);
    writeFileSync(join(a, MANIFEST), JSON.stringify({ ...m, planFingerprint: "otro" }));
    expect(() => buildFunds(a)).toThrow(/otro plan/);
    const b = scratch();
    const n = readManifest(b);
    writeFileSync(
      join(b, MANIFEST),
      JSON.stringify({ ...n, files: n.files.filter((f) => f.key !== `fy${fy}/island/count-all`) }),
    );
    expect(() => buildFunds(b)).toThrow(/Falta el pedido/);
  });

  it("--check detecta un archivo generado desactualizado", () => {
    const dir = scratch();
    const run = () =>
      spawnSync(
        process.execPath,
        [join(ROOT, "scripts/usaspending/generate.ts"), `--root=${dir}`, "--check"],
        { encoding: "utf8" },
      );
    expect(run().status).toBe(0);
    writeFileSync(join(dir, OUTPUT), committed.replace(/"fiscalYear": \d+/, '"fiscalYear": 1999'));
    const stale = run();
    expect(stale.status).toBe(1);
    expect(stale.stderr).toMatch(/Desactualizado/);
  });

  it("guarda la fecha de obtención y la fecha de actualización de USAspending, sin fijarlas en el código", () => {
    expect(manifest.retrievedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(data.source.retrievedAt).toBe(manifest.retrievedAt);
    expect(data.source.sourceLastUpdated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const lastUpdated = JSON.parse(
      read(manifest.files.find((f) => f.key === "meta/last-updated")!.path),
    ) as { last_updated: string };
    const [mm, dd, yyyy] = lastUpdated.last_updated.split("/");
    expect(data.source.sourceLastUpdated).toBe(`${yyyy}-${mm}-${dd}`);
    expect(read("scripts/usaspending/source.ts")).not.toMatch(/2026-10-0\d/);
  });
});
