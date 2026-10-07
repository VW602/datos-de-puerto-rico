/**
 * Offline half of the USAspending pipeline: verified raw API responses ->
 * validation -> data/generated/usaspending-pr.json. Pure; no network.
 *
 * Aggregation unit. Every obligation total here is USAspending's sum of
 * transaction-level `federal_action_obligation` for prime-award transactions
 * whose action date falls in one federal fiscal year, grouped by recorded
 * primary place of performance. Award-level figures (lifetime obligation and
 * reported outlays of the awards active in the year) are kept apart and never
 * added to transaction-level figures.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { planFingerprint, planRequests } from "./plan.ts";
import {
  AWARD_GROUP_KEYS,
  EXPECTED_MUNICIPIOS,
  GEO_STATES,
  HISTORY_YEARS,
  MANIFEST,
  SITE,
  TERMS,
  USA_ATTRIBUTION,
  USA_GENERATOR_VERSION,
  fiscalYearBounds,
  latestCompleteFiscalYear,
  type AwardGroup,
  type GeoState,
} from "./source.ts";

export const sha256 = (data: Buffer | string) => createHash("sha256").update(data).digest("hex");

export type UsaManifest = {
  schema: 1;
  generator: string;
  generatorVersion: number;
  publisher: string;
  dataset: string;
  api: string;
  retrievedAt: string;
  retrievedUntil: string;
  retrievedAtNote: string;
  sourceLastUpdated: string;
  sourceLastUpdatedNote: string;
  fiscalYear: number;
  planFingerprint: string;
  terms: typeof TERMS;
  municipios: { id: string; name: string }[];
  files: {
    path: string;
    key: string;
    page: number | null;
    method: "GET" | "POST";
    endpoint: string;
    body: Record<string, unknown> | null;
    retrievedAt: string;
    bytes: number;
    sha256: string;
  }[];
};

export function readManifest(root: string): UsaManifest {
  return JSON.parse(readFileSync(join(root, MANIFEST), "utf8")) as UsaManifest;
}

/** Checks the municipio list itself: 78 unique Puerto Rico FIPS codes with names. */
export function assertMunicipios(list: { id: string; name: string }[]): void {
  if (list.length !== EXPECTED_MUNICIPIOS)
    throw new Error(`${list.length} municipios (se esperan ${EXPECTED_MUNICIPIOS})`);
  if (new Set(list.map((m) => m.id)).size !== list.length)
    throw new Error("Código FIPS repetido en la lista de municipios");
  for (const { id, name } of list) {
    if (!/^72\d{3}$/.test(id)) throw new Error(`${id} no es un municipio de Puerto Rico`);
    if (!name) throw new Error(`${id} sin nombre`);
  }
}

// ---------------------------------------------------------------------------
// Reading and checking the raw snapshot

type GeoRow = {
  shape_code: string;
  display_name: string | null;
  aggregated_amount: number;
  total_outlays?: number | null;
};
type CategoryRow = {
  amount: number;
  total_outlays?: number | null;
  name: string | null;
  code: string | null;
  id?: number | null;
};
type AwardCount = {
  grants: number;
  loans: number;
  contracts: number;
  direct_payments: number;
  other: number;
  idvs: number;
};

export type RawSnapshot = {
  manifest: UsaManifest;
  json: (key: string) => unknown;
  pages: <T>(key: string) => T[];
};

export function readSnapshot(root: string): RawSnapshot {
  const manifest = readManifest(root);
  assertMunicipios(manifest.municipios);
  const planned = planRequests(
    manifest.municipios.map((m) => m.id),
    manifest.fiscalYear,
  );
  if (manifest.planFingerprint !== planFingerprint(planned))
    throw new Error("La copia se hizo con otro plan de pedidos (huella distinta)");

  const byKey = new Map<string, { page: number | null; data: unknown }[]>();
  const seenPaths = new Set<string>();
  for (const file of manifest.files) {
    if (seenPaths.has(file.path))
      throw new Error(`Archivo repetido en el manifiesto: ${file.path}`);
    seenPaths.add(file.path);
    const bytes = readFileSync(join(root, file.path));
    const actual = sha256(bytes);
    if (actual !== file.sha256)
      throw new Error(
        `Checksum no coincide para ${file.path}: manifiesto ${file.sha256}, archivo ${actual}`,
      );
    const data = JSON.parse(bytes.toString("utf8")) as { detail?: unknown };
    if (data.detail) throw new Error(`${file.path}: la API devolvió un error`);
    const list = byKey.get(file.key) ?? [];
    list.push({ page: file.page, data });
    byKey.set(file.key, list);
  }

  // Every planned request is there, with the exact body, and paged ones are complete.
  const plannedKeys = new Set(planned.map((p) => p.key));
  for (const key of byKey.keys())
    if (!plannedKeys.has(key)) throw new Error(`Archivo no esperado en la copia: ${key}`);
  for (const request of planned) {
    const files = byKey.get(request.key);
    if (!files) throw new Error(`Falta el pedido ${request.key}`);
    for (const entry of manifest.files.filter((f) => f.key === request.key)) {
      const expected = request.body
        ? request.paged
          ? { ...request.body, page: entry.page }
          : request.body
        : null;
      if (JSON.stringify(entry.body) !== JSON.stringify(expected))
        throw new Error(`${request.key}: el pedido guardado no es el planificado`);
      if (entry.endpoint !== request.endpoint || entry.method !== request.method)
        throw new Error(`${request.key}: endpoint distinto`);
    }
    if (request.paged) {
      files.forEach((file, index) => {
        if (file.page !== index + 1) throw new Error(`${request.key}: páginas incompletas`);
      });
      const last = files[files.length - 1].data as { page_metadata?: { hasNext?: boolean } };
      if (last.page_metadata?.hasNext) throw new Error(`${request.key}: falta la página siguiente`);
    } else if (files.length !== 1) {
      throw new Error(`${request.key}: se esperaba un archivo`);
    }
  }
  return {
    manifest,
    json: (key) => {
      const files = byKey.get(key);
      if (!files || files.length !== 1) throw new Error(`Falta ${key}`);
      return files[0].data;
    },
    pages: <T>(key: string) =>
      (byKey.get(key) ?? []).flatMap((f) => (f.data as { results: T[] }).results),
  };
}

const finite = (value: unknown, where: string): number => {
  if (typeof value !== "number" || !Number.isFinite(value))
    throw new Error(`${where}: monto no numérico (${String(value)})`);
  return value;
};
const outlayOf = (value: unknown, where: string): number | null =>
  value === null || value === undefined ? null : finite(value, where);
export const cents = (value: number) => Math.round(value * 100) / 100;

/**
 * Rounding tolerance for reconciliations: one cent, plus half a cent per
 * amount added (each API amount is already rounded to the cent).
 */
export function tolerance(items: number): number {
  return 0.01 + 0.005 * items;
}
function assertSum(actual: number, expected: number, what: string, items = 1): void {
  if (Math.abs(actual - expected) > tolerance(items))
    throw new Error(`${what}: ${cents(actual)} ≠ ${cents(expected)}`);
}

export type Geo = { byId: Map<string, GeoRow>; noCounty: GeoRow | null; state: GeoRow | null };

/** Rows of a geography response, checked: Puerto Rico only, real municipios, no repeats, finite amounts. */
function geoRows(snapshot: RawSnapshot, key: string, names: Map<string, string>): Geo {
  const data = snapshot.json(key) as { scope: string; geo_layer: string; results: GeoRow[] };
  if (data.scope !== "place_of_performance")
    throw new Error(`${key}: no es por lugar de ejecución`);
  const out: Geo = { byId: new Map(), noCounty: null, state: null };
  for (const row of data.results) {
    finite(row.aggregated_amount, `${key} ${row.shape_code}`);
    if ("total_outlays" in row) outlayOf(row.total_outlays, `${key} ${row.shape_code}`);
    if (data.geo_layer === "state") {
      if (row.shape_code !== "PR" || out.state)
        throw new Error(`${key}: estado inesperado ${row.shape_code}`);
      out.state = row;
      continue;
    }
    if (row.shape_code === "" && row.display_name === null) {
      if (out.noCounty) throw new Error(`${key}: dos filas sin municipio`);
      out.noCounty = row;
      continue;
    }
    const name = names.get(row.shape_code);
    if (!name) throw new Error(`${key}: ${row.shape_code} no es un municipio de Puerto Rico`);
    if (row.display_name !== `${name} Municipio`)
      throw new Error(
        `${key}: ${row.shape_code} se llama «${row.display_name}», se esperaba «${name} Municipio»`,
      );
    if (out.byId.has(row.shape_code)) throw new Error(`${key}: ${row.shape_code} repetido`);
    out.byId.set(row.shape_code, row);
  }
  return out;
}

function categoryRows(snapshot: RawSnapshot, key: string): CategoryRow[] {
  const rows = snapshot.pages<CategoryRow>(key);
  const seen = new Set<string>();
  for (const row of rows) {
    finite(row.amount, `${key} ${row.code}`);
    if (!row.code) throw new Error(`${key}: fila sin código (${row.name})`);
    const id = `${row.code}|${row.id ?? ""}`;
    if (seen.has(id)) throw new Error(`${key}: ${row.code} repetido`);
    seen.add(id);
  }
  return rows;
}

const total = (rows: { amount: number }[]) => rows.reduce((a, r) => a + r.amount, 0);
const amountOf = (row: GeoRow | null | undefined) => row?.aggregated_amount ?? 0;

// ---------------------------------------------------------------------------
// The generated file

export type Ranked = [code: string, amount: number];
export type States = Record<GeoState, number>;

export type MunicipioFunds = {
  name: string;
  /** Everything USAspending records with this municipio as place of performance (transaction level). */
  recorded: number | null;
  /** MUNICIPIO_ATTRIBUTABLE: contracts + assistance to individuals. The map value. */
  attributable: number | null;
  contracts: number;
  individuals: number;
  /** MUNICIPIO_UNCERTAIN: other assistance recorded here (may serve the whole island). */
  uncertain: number;
  /** Award level, awards active in the year (lifetime amounts). */
  award: {
    attributableObligations: number | null;
    /** Reported outlays of the attributable awards; null when none reported. */
    attributableOutlays: number | null;
    uncertainObligations: number | null;
    uncertainOutlays: number | null;
  };
  /** Prime awards with activity in the year: all recorded here, and the attributable ones. */
  awards: { recorded: number; attributable: number };
  contractAgencies: Ranked[];
  individualPrograms: Ranked[];
  uncertainPrograms: Ranked[];
  /** Per fiscal year in `history`. */
  history: { attributable: (number | null)[]; uncertain: (number | null)[] };
};

export type GeneratedFunds = {
  generated: string;
  schema: 1;
  generatorVersion: number;
  source: {
    publisher: string;
    site: string;
    api: string;
    retrievedAt: string;
    retrievedUntil: string;
    sourceLastUpdated: string;
    outlaysReportedThrough: { fiscalYear: number; fiscalMonth: number; periodEnd: string };
    planFingerprint: string;
    terms: typeof TERMS;
    attribution: string;
  };
  fiscalYear: number;
  period: { start: string; end: string };
  history: number[];
  island: {
    total: number;
    states: States;
    /** Part of PUERTO_RICO_STATEWIDE that is assistance to individuals with no municipio. */
    statewideIndividuals: number;
    byAwardType: Record<AwardGroup, number>;
    award: {
      obligations: number;
      outlays: number | null;
      states: Record<GeoState, { obligations: number; outlays: number | null }>;
      /** Municipios missing from USAspending's island-wide award-level county response; taken from their own request. */
      municipiosAskedOneByOne: string[];
    };
    awards: { recorded: number; byType: AwardCount };
    agencies: Ranked[];
    programs: Ranked[];
    history: { fiscalYear: number; total: number; states: States }[];
  };
  municipios: Record<string, MunicipioFunds>;
  missing: {
    municipioId: string;
    measure: string;
    fiscalYear: number;
    reason: "no_records" | "no_attributable_records" | "outlays_not_reported";
  }[];
  cdbg: {
    awardId: string;
    obligated: number;
    outlays: number | null;
    start: string | null;
    end: string | null;
  }[];
  names: { agencies: Record<string, string>; programs: Record<string, string> };
};

const TOP = 5;
const rank = (entries: [string, number][], limit = TOP): Ranked[] =>
  entries
    .filter(([, amount]) => cents(amount) !== 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([code, amount]) => [code, cents(amount)]);

/** "10/06/2026" → "2026-10-06". */
export function isoFromUsDate(value: string): string {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if (!match) throw new Error(`Fecha de actualización inválida: ${value}`);
  return `${match[3]}-${match[1]}-${match[2]}`;
}

/** Sum of outlay parts: a null part is "not reported", never 0. All null (or none) → null. */
export function sumOutlays(parts: (number | null)[]): number | null {
  const known = parts.filter((p): p is number => p !== null);
  return known.length === 0 ? null : cents(known.reduce((a, b) => a + b, 0));
}

/**
 * The four geographic states of one fiscal year's obligations, from three
 * slices of the same transactions (all, procurement, assistance to
 * individuals), each by municipio and for Puerto Rico.
 */
export function classify(all: Geo, procurement: Geo, individuals: Geo, ids: string[]) {
  const S = amountOf(all.state);
  const procurementState = amountOf(procurement.state);
  const perMunicipio = new Map<
    string,
    {
      recorded: number | null;
      contracts: number;
      individuals: number;
      attributable: number | null;
      uncertain: number;
    }
  >();
  let attributable = 0;
  let uncertain = 0;
  let recordedSum = 0;
  let procurementSum = 0;
  let individualsSum = 0;
  for (const id of ids) {
    const r = all.byId.get(id) ?? null;
    const c = procurement.byId.get(id) ?? null;
    const i = individuals.byId.get(id) ?? null;
    if (!r && (c || i)) throw new Error(`${id}: hay contratos o asistencia a personas sin total`);
    const recorded = r ? r.aggregated_amount : null;
    const contracts = amountOf(c);
    const indiv = amountOf(i);
    const attr = c || i ? contracts + indiv : null;
    const unc = recorded === null ? 0 : recorded - contracts - indiv;
    perMunicipio.set(id, {
      recorded,
      contracts,
      individuals: indiv,
      attributable: attr,
      uncertain: unc,
    });
    attributable += attr ?? 0;
    uncertain += unc;
    recordedSum += recorded ?? 0;
    procurementSum += contracts;
    individualsSum += indiv;
  }
  const states: States = {
    MUNICIPIO_ATTRIBUTABLE: attributable,
    MUNICIPIO_UNCERTAIN: uncertain,
    // Assistance for Puerto Rico with no municipio (FABS "State-wide").
    PUERTO_RICO_STATEWIDE: S - procurementState - (recordedSum - procurementSum),
    // Contracts for Puerto Rico with no municipio.
    NO_MUNICIPIO_GEOGRAPHY: procurementState - procurementSum,
  };
  return {
    total: S,
    states,
    perMunicipio,
    statewideIndividuals: amountOf(individuals.state) - individualsSum,
  };
}

export function buildFunds(root: string): { content: string; data: GeneratedFunds } {
  const snapshot = readSnapshot(root);
  const { manifest } = snapshot;
  const fy = manifest.fiscalYear;
  const ids = manifest.municipios.map((m) => m.id).sort();
  const names = new Map(manifest.municipios.map((m) => [m.id, m.name]));
  const years = Array.from({ length: HISTORY_YEARS }, (_, i) => fy - HISTORY_YEARS + 1 + i);
  if (fy !== latestCompleteFiscalYear(manifest.retrievedAt.slice(0, 10)))
    throw new Error(`AF ${fy} no es el último año fiscal cerrado al ${manifest.retrievedAt}`);

  // Every time-period filter is one whole federal fiscal year (1 Oct – 30 Sep).
  for (const file of manifest.files) {
    const match = /^fy(\d{4})\//.exec(file.key);
    if (!match) continue;
    const { start, end } = fiscalYearBounds(Number(match[1]));
    const tp = (
      file.body as { filters: { time_period: { start_date: string; end_date: string }[] } }
    ).filters.time_period;
    if (tp.length !== 1 || tp[0].start_date !== start || tp[0].end_date !== end)
      throw new Error(`${file.key}: el periodo pedido no es el AF completo`);
  }

  const programNames = new Map<string, string>();
  const agencyNames = new Map<string, string>();
  const keepNames = (map: Map<string, string>, rows: CategoryRow[]) => {
    for (const row of rows) if (row.name) map.set(row.code!, row.name);
  };
  const missing: GeneratedFunds["missing"] = [];

  // Obligations by geographic state, every fiscal year.
  const perYear = new Map(
    years.map((year) => {
      const slice = (s: string): Geo => {
        const county = geoRows(snapshot, `fy${year}/geo-county-transactions-${s}`, names);
        if (county.noCounty)
          throw new Error(`AF ${year}: fila sin municipio a nivel de transacción`);
        return {
          byId: county.byId,
          noCounty: null,
          state: geoRows(snapshot, `fy${year}/geo-state-transactions-${s}`, names).state,
        };
      };
      const result = classify(slice("all"), slice("procurement"), slice("individuals"), ids);
      if (result.total === 0) throw new Error(`AF ${year}: falta el total de Puerto Rico`);
      assertSum(
        GEO_STATES.reduce((a, k) => a + result.states[k], 0),
        result.total,
        `AF ${year}: estados geográficos vs. total de Puerto Rico`,
        ids.length * 3 + 2,
      );
      for (const id of ids) {
        const m = result.perMunicipio.get(id)!;
        if (m.recorded === null)
          missing.push({
            municipioId: id,
            measure: "obligations",
            fiscalYear: year,
            reason: "no_records",
          });
        else if (m.attributable === null)
          missing.push({
            municipioId: id,
            measure: "attributable",
            fiscalYear: year,
            reason: "no_attributable_records",
          });
      }
      return [year, result] as const;
    }),
  );
  const current = perYear.get(fy)!;

  // Detailed year: award type groups partition the Puerto Rico total and each municipio.
  const types = Object.fromEntries(
    AWARD_GROUP_KEYS.map((g) => [
      g,
      {
        county: geoRows(snapshot, `fy${fy}/geo-county-transactions-type-${g}`, names),
        state: geoRows(snapshot, `fy${fy}/geo-state-transactions-type-${g}`, names),
      },
    ]),
  ) as Record<AwardGroup, { county: Geo; state: Geo }>;
  const byAwardType = Object.fromEntries(
    AWARD_GROUP_KEYS.map((g) => [g, cents(amountOf(types[g].state.state))]),
  ) as Record<AwardGroup, number>;
  assertSum(
    Object.values(byAwardType).reduce((a, b) => a + b, 0),
    current.total,
    `AF ${fy}: tipos de adjudicación vs. total de Puerto Rico`,
    AWARD_GROUP_KEYS.length,
  );
  assertSum(
    byAwardType.contracts + byAwardType.idvs,
    amountOf(geoRows(snapshot, `fy${fy}/geo-state-transactions-procurement`, names).state),
    `AF ${fy}: contratos por tipo vs. contratos`,
    2,
  );

  // Award level (lifetime amounts of awards active in the year), same slices.
  const awardSlice = (s: string) => {
    const county = geoRows(snapshot, `fy${fy}/geo-county-awards-${s}`, names);
    const state = geoRows(snapshot, `fy${fy}/geo-state-awards-${s}`, names).state;
    const rows = [...county.byId.values(), ...(county.noCounty ? [county.noCounty] : [])];
    assertSum(
      rows.reduce((a, r) => a + r.aggregated_amount, 0),
      amountOf(state),
      `AF ${fy}: adjudicaciones (${s}) por municipio vs. Puerto Rico`,
      rows.length,
    );
    assertSum(
      rows.reduce((a, r) => a + (r.total_outlays ?? 0), 0),
      state?.total_outlays ?? 0,
      `AF ${fy}: desembolsos (${s}) por municipio vs. Puerto Rico`,
      rows.length,
    );
    return { county, state };
  };
  // All awards: each municipio from its own request; the island-wide county
  // request only supplies the row with no municipio.
  const awardAllIsland = geoRows(snapshot, `fy${fy}/geo-county-awards-all`, names);
  const awardAllState = geoRows(snapshot, `fy${fy}/geo-state-awards-all`, names).state;
  const awardAllById = new Map<string, GeoRow>();
  for (const id of ids) {
    const one = geoRows(snapshot, `fy${fy}/municipio/${id}/awards-all`, names);
    if (one.noCounty || one.byId.size > 1 || [...one.byId.keys()].some((k) => k !== id))
      throw new Error(`${id}: la respuesta de adjudicaciones no es solo de ese municipio`);
    const row = one.byId.get(id);
    if (row) awardAllById.set(id, row);
    const islandRow = awardAllIsland.byId.get(id);
    if (
      islandRow &&
      row &&
      (Math.abs(islandRow.aggregated_amount - row.aggregated_amount) > 0.01 ||
        (islandRow.total_outlays ?? null) !== (row.total_outlays ?? null))
    ) {
      throw new Error(
        `${id}: adjudicaciones distintas en la respuesta de la isla y la del municipio`,
      );
    }
  }
  const awardAll = {
    county: { byId: awardAllById, noCounty: awardAllIsland.noCounty, state: null } as Geo,
    state: awardAllState,
  };
  {
    const rows = [
      ...awardAllById.values(),
      ...(awardAllIsland.noCounty ? [awardAllIsland.noCounty] : []),
    ];
    assertSum(
      rows.reduce((a, r) => a + r.aggregated_amount, 0),
      amountOf(awardAllState),
      `AF ${fy}: adjudicaciones (todas) por municipio vs. Puerto Rico`,
      rows.length,
    );
    assertSum(
      rows.reduce((a, r) => a + (r.total_outlays ?? 0), 0),
      awardAllState?.total_outlays ?? 0,
      `AF ${fy}: desembolsos (todos) por municipio vs. Puerto Rico`,
      rows.length,
    );
  }
  /** Municipios the island-wide award request left out (kept for the record). */
  const awardRowsMissingInIsland = ids.filter(
    (id) => awardAllById.has(id) && !awardAllIsland.byId.has(id),
  );
  const awardProcurement = awardSlice("procurement");
  const awardIndividuals = awardSlice("individuals");

  const municipios: Record<string, MunicipioFunds> = {};
  const awardStates = {
    attributable: { o: 0, d: [] as (number | null)[] },
    uncertain: { o: 0, d: [] as (number | null)[] },
  };
  let attributableAwardCount = 0;
  for (const id of ids) {
    const name = names.get(id)!;
    const m = current.perMunicipio.get(id)!;
    const programsAll = categoryRows(snapshot, `fy${fy}/municipio/${id}/program-all`);
    const programsIndiv = categoryRows(snapshot, `fy${fy}/municipio/${id}/program-individuals`);
    const agencies = categoryRows(snapshot, `fy${fy}/municipio/${id}/agency-procurement`);
    keepNames(programNames, programsAll);
    keepNames(programNames, programsIndiv);
    keepNames(agencyNames, agencies);
    if (m.recorded !== null) {
      // No dollar counted twice: each breakdown adds back to its slice.
      assertSum(
        total(programsAll),
        m.recorded - m.contracts,
        `${name}: programas vs. asistencia`,
        programsAll.length + 2,
      );
      assertSum(
        total(programsIndiv),
        m.individuals,
        `${name}: programas a personas vs. asistencia a personas`,
        programsIndiv.length + 1,
      );
      assertSum(
        total(agencies),
        m.contracts,
        `${name}: agencias vs. contratos`,
        agencies.length + 1,
      );
      assertSum(
        AWARD_GROUP_KEYS.reduce((a, g) => a + amountOf(types[g].county.byId.get(id)), 0),
        m.recorded,
        `${name}: tipos de adjudicación vs. total`,
        AWARD_GROUP_KEYS.length,
      );
    } else if (programsAll.length || agencies.length) {
      throw new Error(`${name}: hay desglose pero no total`);
    }
    const indivByCode = new Map(programsIndiv.map((p) => [p.code!, p.amount]));
    for (const code of indivByCode.keys())
      if (!programsAll.some((p) => p.code === code))
        throw new Error(`${name}: programa a personas ${code} fuera del total`);
    const uncertainPrograms = programsAll.map(
      (p) => [p.code!, p.amount - (indivByCode.get(p.code!) ?? 0)] as [string, number],
    );

    // Award level for this municipio.
    const aAll = awardAll.county.byId.get(id) ?? null;
    const aProc = awardProcurement.county.byId.get(id) ?? null;
    const aInd = awardIndividuals.county.byId.get(id) ?? null;
    const outlay = (row: GeoRow | null) =>
      row ? outlayOf(row.total_outlays, `${name} desembolsos`) : null;
    const attributableObligations = aProc || aInd ? cents(amountOf(aProc) + amountOf(aInd)) : null;
    const attributableOutlays = sumOutlays([outlay(aProc), outlay(aInd)]);
    const uncertainObligations = aAll
      ? cents(amountOf(aAll) - amountOf(aProc) - amountOf(aInd))
      : null;
    const allOutlays = outlay(aAll);
    const uncertainOutlays =
      allOutlays === null ? null : cents(allOutlays - (outlay(aProc) ?? 0) - (outlay(aInd) ?? 0));
    if (attributableObligations !== null && attributableOutlays === null)
      missing.push({
        municipioId: id,
        measure: "outlays",
        fiscalYear: fy,
        reason: "outlays_not_reported",
      });
    awardStates.attributable.o += attributableObligations ?? 0;
    awardStates.attributable.d.push(attributableOutlays);
    awardStates.uncertain.o += uncertainObligations ?? 0;
    awardStates.uncertain.d.push(uncertainOutlays);

    const countAll = (snapshot.json(`fy${fy}/municipio/${id}/count-all`) as { results: AwardCount })
      .results;
    const countIndiv = (
      snapshot.json(`fy${fy}/municipio/${id}/count-individuals`) as { results: AwardCount }
    ).results;
    const sumCount = (c: AwardCount) =>
      Object.values(c).reduce((a, n) => a + finite(n, `${name}: número de adjudicaciones`), 0);
    const recordedAwards = sumCount(countAll);
    if (countIndiv.contracts || countIndiv.idvs)
      throw new Error(`${name}: contratos en la asistencia a personas`);
    const attributableAwards = countAll.contracts + countAll.idvs + sumCount(countIndiv);
    if (attributableAwards > recordedAwards)
      throw new Error(`${name}: más adjudicaciones atribuibles que registradas`);
    attributableAwardCount += attributableAwards;

    municipios[id] = {
      name,
      recorded: m.recorded === null ? null : cents(m.recorded),
      attributable: m.attributable === null ? null : cents(m.attributable),
      contracts: cents(m.contracts),
      individuals: cents(m.individuals),
      uncertain: cents(m.uncertain),
      award: {
        attributableObligations,
        attributableOutlays,
        uncertainObligations,
        uncertainOutlays,
      },
      awards: { recorded: recordedAwards, attributable: attributableAwards },
      contractAgencies: rank(agencies.map((a) => [a.code!, a.amount])),
      individualPrograms: rank(programsIndiv.map((p) => [p.code!, p.amount])),
      uncertainPrograms: rank(uncertainPrograms),
      history: {
        attributable: years.map((y) => {
          const v = perYear.get(y)!.perMunicipio.get(id)!.attributable;
          return v === null ? null : cents(v);
        }),
        uncertain: years.map((y) => {
          const v = perYear.get(y)!.perMunicipio.get(id)!;
          return v.recorded === null ? null : cents(v.uncertain);
        }),
      },
    };
  }

  // Award level for the island, by state.
  const noCountyAll = awardAll.county.noCounty;
  const noCountyProc = awardProcurement.county.noCounty;
  const awardStateTotals: GeneratedFunds["island"]["award"]["states"] = {
    MUNICIPIO_ATTRIBUTABLE: {
      obligations: cents(awardStates.attributable.o),
      outlays: sumOutlays(awardStates.attributable.d),
    },
    MUNICIPIO_UNCERTAIN: {
      obligations: cents(awardStates.uncertain.o),
      outlays: sumOutlays(awardStates.uncertain.d),
    },
    PUERTO_RICO_STATEWIDE: {
      obligations: cents(amountOf(noCountyAll) - amountOf(noCountyProc)),
      outlays:
        noCountyAll?.total_outlays == null
          ? null
          : cents(noCountyAll.total_outlays - (noCountyProc?.total_outlays ?? 0)),
    },
    NO_MUNICIPIO_GEOGRAPHY: {
      obligations: cents(amountOf(noCountyProc)),
      outlays: noCountyProc?.total_outlays == null ? null : cents(noCountyProc.total_outlays),
    },
  };
  assertSum(
    GEO_STATES.reduce((a, k) => a + awardStateTotals[k].obligations, 0),
    amountOf(awardAll.state),
    `AF ${fy}: adjudicaciones por estado geográfico vs. Puerto Rico`,
    ids.length * 3 + 4,
  );

  const islandAgencies = categoryRows(snapshot, `fy${fy}/island/agency-all`);
  const islandPrograms = categoryRows(snapshot, `fy${fy}/island/program-all`);
  keepNames(agencyNames, islandAgencies);
  keepNames(programNames, islandPrograms);
  assertSum(
    total(islandAgencies),
    current.total,
    `AF ${fy}: agencias vs. total de Puerto Rico`,
    islandAgencies.length,
  );
  assertSum(
    total(islandPrograms),
    current.total - byAwardType.contracts - byAwardType.idvs,
    `AF ${fy}: programas vs. asistencia de Puerto Rico`,
    islandPrograms.length + 2,
  );
  const islandCount = (snapshot.json(`fy${fy}/island/count-all`) as { results: AwardCount })
    .results;
  const islandAwards = Object.values(islandCount).reduce(
    (a, n) => a + finite(n, "Puerto Rico: número de adjudicaciones"),
    0,
  );
  if (attributableAwardCount > islandAwards)
    throw new Error("Más adjudicaciones atribuibles que en todo Puerto Rico");

  // Outlays are reported monthly by agencies: the latest period published by the retrieval date.
  const periods = (
    snapshot.json("meta/submission-periods") as {
      available_periods: {
        period_end_date: string;
        submission_reveal_date: string;
        submission_fiscal_year: number;
        submission_fiscal_month: number;
      }[];
    }
  ).available_periods
    .filter((p) => p.submission_reveal_date <= manifest.retrievedAt)
    .sort((a, b) => a.period_end_date.localeCompare(b.period_end_date));
  const latestPeriod = periods[periods.length - 1];
  if (!latestPeriod) throw new Error("No hay periodo de reporte publicado");

  const cdbg = snapshot
    .pages<Record<string, unknown>>("cdbg-dr/awards")
    .map((row) => {
      for (const key of Object.keys(row))
        if (/recipient/i.test(key))
          throw new Error(`CDBG: campo de recipiente no esperado (${key})`);
      if (row["CFDA Number"] !== "14.228")
        throw new Error(`CDBG: programa inesperado ${String(row["CFDA Number"])}`);
      const awardId = String(row["Award ID"]);
      const outlays = outlayOf(row["Total Outlays"], `CDBG ${awardId}`);
      return {
        awardId,
        obligated: cents(finite(row["Award Amount"], `CDBG ${awardId}`)),
        outlays: outlays === null ? null : cents(outlays),
        start: (row["Start Date"] as string | null) ?? null,
        end: (row["End Date"] as string | null) ?? null,
      };
    })
    .sort((a, b) => b.obligated - a.obligated || a.awardId.localeCompare(b.awardId));
  if (new Set(cdbg.map((c) => c.awardId)).size !== cdbg.length)
    throw new Error("CDBG: adjudicación repetida");

  const islandRankedAgencies = rank(
    islandAgencies.map((a) => [a.code!, a.amount]),
    8,
  );
  const islandRankedPrograms = rank(
    islandPrograms.map((p) => [p.code!, p.amount]),
    8,
  );
  const usedAgencies = new Set(islandRankedAgencies.map(([c]) => c));
  const usedPrograms = new Set(islandRankedPrograms.map(([c]) => c));
  for (const m of Object.values(municipios)) {
    for (const [c] of m.contractAgencies) usedAgencies.add(c);
    for (const [c] of [...m.individualPrograms, ...m.uncertainPrograms]) usedPrograms.add(c);
  }
  const pick = (map: Map<string, string>, used: Set<string>) =>
    Object.fromEntries([...used].sort().map((code) => [code, map.get(code) ?? code]));
  const roundStates = (s: States): States =>
    Object.fromEntries(GEO_STATES.map((k) => [k, cents(s[k])])) as States;

  const data: GeneratedFunds = {
    generated:
      "GENERADO por scripts/usaspending/generate.ts desde data/raw/usaspending. NO EDITAR A MANO.",
    schema: 1,
    generatorVersion: USA_GENERATOR_VERSION,
    source: {
      publisher: manifest.publisher,
      site: SITE,
      api: manifest.api,
      retrievedAt: manifest.retrievedAt,
      retrievedUntil: manifest.retrievedUntil,
      sourceLastUpdated: isoFromUsDate(manifest.sourceLastUpdated),
      outlaysReportedThrough: {
        fiscalYear: latestPeriod.submission_fiscal_year,
        fiscalMonth: latestPeriod.submission_fiscal_month,
        periodEnd: latestPeriod.period_end_date.slice(0, 10),
      },
      planFingerprint: manifest.planFingerprint,
      terms: manifest.terms,
      attribution: USA_ATTRIBUTION,
    },
    fiscalYear: fy,
    period: fiscalYearBounds(fy),
    history: years,
    island: {
      total: cents(current.total),
      states: roundStates(current.states),
      statewideIndividuals: cents(current.statewideIndividuals),
      byAwardType,
      award: {
        obligations: cents(amountOf(awardAll.state)),
        outlays: awardAll.state?.total_outlays == null ? null : cents(awardAll.state.total_outlays),
        states: awardStateTotals,
        municipiosAskedOneByOne: awardRowsMissingInIsland,
      },
      awards: { recorded: islandAwards, byType: islandCount },
      agencies: islandRankedAgencies,
      programs: islandRankedPrograms,
      history: years.map((y) => ({
        fiscalYear: y,
        total: cents(perYear.get(y)!.total),
        states: roundStates(perYear.get(y)!.states),
      })),
    },
    municipios,
    missing,
    cdbg,
    names: {
      agencies: pick(agencyNames, usedAgencies),
      programs: pick(programNames, usedPrograms),
    },
  };
  return { content: stableJson(data), data };
}

/** One municipio per line: readable diffs, identical bytes every run. */
export function stableJson(data: GeneratedFunds): string {
  const { municipios, ...rest } = data;
  const head = JSON.stringify(rest, null, 2).replace(/\n}$/, "");
  const rows = Object.entries(municipios).map(
    ([id, value]) => `    ${JSON.stringify(id)}: ${JSON.stringify(value)}`,
  );
  return `${head},\n  "municipios": {\n${rows.join(",\n")}\n  }\n}\n`;
}
