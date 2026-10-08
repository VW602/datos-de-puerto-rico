/**
 * Offline half of the OpenFEMA pipeline: verified raw API responses ->
 * validation -> data/generated/fema-pr.json (summary, in the site bundle) and
 * data/generated/fema-projects/<disaster>.json (Public Assistance projects,
 * loaded only when someone opens that disaster's table). Pure; no network.
 *
 * Aggregation unit. Each Public Assistance measure is a sum over project
 * records (one record per disaster number + project worksheet number); each
 * household measure is a sum over FEMA's own aggregated rows; each mitigation
 * measure is a sum over project records. Nothing from USAspending is added.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { EXTRACT_NOTE, FORBIDDEN_FIELDS, extractResponse } from "./extract.ts";
import { planFingerprint, planRequests } from "./plan.ts";
import {
  DATASETS,
  DATASET_KEYS,
  EXPECTED_MUNICIPIOS,
  FEMA_ATTRIBUTION,
  FEMA_GENERATOR_VERSION,
  GEO_STATES,
  MANIFEST,
  PAGE_SIZE,
  TERMS,
  type DatasetKey,
  type GeoState,
} from "./source.ts";

export const sha256 = (data: Buffer | string) => createHash("sha256").update(data).digest("hex");

export type FemaManifest = {
  schema: 1;
  generator: string;
  generatorVersion: number;
  publisher: string;
  api: string;
  retrievedAt: string;
  retrievedUntil: string;
  retrievedAtNote: string;
  planFingerprint: string;
  terms: typeof TERMS;
  municipios: { id: string; name: string }[];
  files: {
    path: string;
    key: string;
    page: number | null;
    endpoint: string;
    params: Record<string, string>;
    retrievedAt: string;
    /** SHA-256 and size of the exact bytes OpenFEMA returned (kept only in the local cache). */
    rawSha256: string;
    rawBytes: number;
    /** OpenFEMA's metadata.count for paged datasets; records in this page. */
    sourceCount: number | null;
    records: number;
    /** SHA-256 and size of the committed PUBLIC-SAFE EXTRACT. */
    sha256: string;
    bytes: number;
  }[];
};

export function readManifest(root: string): FemaManifest {
  return JSON.parse(readFileSync(join(root, MANIFEST), "utf8")) as FemaManifest;
}

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
// Snapshot

type Snapshot = {
  manifest: FemaManifest;
  records: (key: DatasetKey) => Record<string, unknown>[];
  catalog: (key: DatasetKey) => Record<string, unknown>;
};

export function readSnapshot(root: string): Snapshot {
  const manifest = readManifest(root);
  assertMunicipios(manifest.municipios);
  const planned = planRequests();
  if (manifest.planFingerprint !== planFingerprint(planned))
    throw new Error("La copia se hizo con otro plan de pedidos (huella distinta)");

  const byKey = new Map<string, { page: number | null; data: Record<string, unknown> }[]>();
  const seen = new Set<string>();
  for (const file of manifest.files) {
    if (seen.has(file.path)) throw new Error(`Archivo repetido en el manifiesto: ${file.path}`);
    seen.add(file.path);
    const bytes = readFileSync(join(root, file.path));
    if (bytes.length !== file.bytes) throw new Error(`Tamaño no coincide para ${file.path}`);
    const actual = sha256(bytes);
    if (actual !== file.sha256)
      throw new Error(
        `Checksum no coincide para ${file.path}: manifiesto ${file.sha256}, archivo ${actual}`,
      );
    if (!/^[0-9a-f]{64}$/.test(file.rawSha256))
      throw new Error(`${file.path}: falta el SHA-256 de la respuesta original`);
    const text = bytes.toString("utf8");
    // Only allowlisted fields: the extract of the extract must be itself.
    const request = planned.find((p) => p.key === file.key);
    if (!request) throw new Error(`Archivo no esperado en la copia: ${file.key}`);
    const again = extractResponse(text, file.key, request.dataset);
    if (again.text !== text)
      throw new Error(
        `${file.path}: no es un extracto limpio (campos fuera de la lista permitida)`,
      );
    if (again.records !== file.records)
      throw new Error(`${file.path}: número de registros distinto del manifiesto`);
    const data = JSON.parse(text) as Record<string, unknown>;
    if (data.extract !== EXTRACT_NOTE) throw new Error(`${file.path}: falta la marca de extracto`);
    for (const field of FORBIDDEN_FIELDS)
      if (text.includes(`"${field}"`)) throw new Error(`${file.path}: campo no permitido ${field}`);
    const list = byKey.get(file.key) ?? [];
    list.push({ page: file.page, data });
    byKey.set(file.key, list);
  }

  const plannedKeys = new Set(planned.map((p) => p.key));
  for (const key of byKey.keys())
    if (!plannedKeys.has(key)) throw new Error(`Archivo no esperado en la copia: ${key}`);
  for (const request of planned) {
    const files = byKey.get(request.key);
    if (!files) throw new Error(`Falta el pedido ${request.key}`);
    for (const entry of manifest.files.filter((f) => f.key === request.key)) {
      const expected = request.paged
        ? { ...request.params, $skip: String(((entry.page ?? 1) - 1) * PAGE_SIZE) }
        : request.params;
      if (
        JSON.stringify(Object.entries(entry.params).sort()) !==
        JSON.stringify(Object.entries(expected).sort())
      ) {
        throw new Error(`${request.key}: el pedido guardado no es el planificado`);
      }
      if (entry.endpoint !== request.endpoint) throw new Error(`${request.key}: endpoint distinto`);
    }
    if (!request.paged) {
      if (files.length !== 1) throw new Error(`${request.key}: se esperaba un archivo`);
      continue;
    }
    // Paged: pages 1..n, each reporting the same count, and the records add up to it.
    const name = DATASETS[request.dataset!].name;
    files.forEach((f, i) => {
      if (f.page !== i + 1) throw new Error(`${request.key}: páginas incompletas`);
    });
    const counts = new Set(files.map((f) => (f.data.metadata as { count: number }).count));
    if (counts.size !== 1)
      throw new Error(
        `${request.key}: las páginas reportan totales distintos (${[...counts].join(", ")}); el dataset cambió durante la descarga`,
      );
    const count = [...counts][0];
    for (const f of manifest.files.filter((x) => x.key === request.key))
      if (f.sourceCount !== count)
        throw new Error(`${request.key}: el manifiesto y el extracto no dicen el mismo total`);
    const rows = files.reduce((a, f) => a + (f.data[name] as unknown[]).length, 0);
    if (rows !== count)
      throw new Error(`${request.key}: ${rows} registros, OpenFEMA dice ${count}`);
  }
  return {
    manifest,
    records: (key) =>
      (byKey.get(`data/${key}`) ?? []).flatMap(
        (f) => f.data[DATASETS[key].name] as Record<string, unknown>[],
      ),
    catalog: (key) => {
      const entry = (byKey.get(`catalog/${key}`)![0].data.DataSets as Record<string, unknown>[])[0];
      if (!entry) throw new Error(`catalog/${key}: sin entrada`);
      if (entry.name !== DATASETS[key].name || entry.version !== DATASETS[key].version)
        throw new Error(`catalog/${key}: no es la versión fijada`);
      return entry;
    },
  };
}

// ---------------------------------------------------------------------------
// Values and geography

const fail = (message: string): never => {
  throw new Error(message);
};
export const cents = (value: number) => Math.round(value * 100) / 100;
/** One cent, plus half a cent per amount added. */
export const tolerance = (items: number) => 0.01 + 0.005 * items;

/** A FEMA amount: a finite number, or null when FEMA leaves it empty. Never invented. */
export function amount(value: unknown, where: string): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "number" || !Number.isFinite(value))
    fail(`${where}: monto no numérico (${String(value)})`);
  return value as number;
}
function count(value: unknown, where: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0)
    fail(`${where}: conteo inválido (${String(value)})`);
  return value as number;
}
function isoDay(value: unknown, where: string): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}(T|$)/.test(value) ||
    Number.isNaN(Date.parse(value))
  )
    fail(`${where}: fecha inválida (${String(value)})`);
  return (value as string).slice(0, 10);
}
function disasterNumber(value: unknown, where: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 9999)
    fail(`${where}: número de desastre inválido (${String(value)})`);
  return value as number;
}

export const normalizeName = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s*\((municipio|municipality)\)\s*$/i, "")
    .toLowerCase()
    .trim();

export type Geo = { state: GeoState; municipio: string | null };

export function geoResolver(municipios: { id: string; name: string }[]) {
  const byName = new Map(municipios.map((m) => [normalizeName(m.name), m.id]));
  const pad = (code: unknown) =>
    typeof code === "string" && /^\d{1,3}$/.test(code) ? `72${code.padStart(3, "0")}` : null;
  const statewide = (s: unknown) => typeof s === "string" && /^statewide$/i.test(s.trim());
  return {
    /**
     * A county name and code as FEMA gives them. "Statewide" wins over any code
     * (Public Assistance codes many Statewide projects 127, which is San Juan).
     * A name and code that disagree are uncertain, never guessed.
     */
    county(name: unknown, code: unknown): Geo {
      if (statewide(name)) return { state: "PUERTO_RICO_STATEWIDE", municipio: null };
      if (typeof name !== "string" || name.trim() === "")
        return { state: "NO_MUNICIPIO_GEOGRAPHY", municipio: null };
      const id = byName.get(normalizeName(name)) ?? null;
      const fromCode = pad(code);
      if (id && (code === undefined || fromCode === id))
        return { state: "MUNICIPIO_ATTRIBUTABLE", municipio: id };
      return { state: "MUNICIPIO_UNCERTAIN", municipio: null };
    },
    isStatewide: statewide,
    byName: (name: string) => byName.get(normalizeName(name)) ?? null,
  };
}

// ---------------------------------------------------------------------------
// Generated file

/** Order of the per-disaster measure arrays. */
export const MEASURES = [
  "paObligated", // Σ federalShareObligated, Public Assistance
  "paProjects", // number of Public Assistance project records
  "paProjectAmount", // Σ projectAmount
  "paTotalObligated", // Σ totalObligated (federal share + admin costs)
  "ihpApproved", // Σ totalApprovedIhpAmount, owners + renters
  "ihpApprovedCount", // Σ approvedForFemaAssistance
  "ihpValidRegistrations", // Σ validRegistrations
  "hmaFederalObligated", // Σ federalShareObligated, Hazard Mitigation Assistance (null when FEMA reports none)
  "hmaProjects", // number of HMA project records
  "hmaProjectAmount", // Σ projectAmount, HMA
] as const;
export type Measure = (typeof MEASURES)[number];
type Values = (number | null)[];
/** Disaster key: the disaster number, or "none" for mitigation projects outside a disaster (PDM, FMA). */
export type DisasterKey = string;

export type GeneratedFema = {
  generated: string;
  schema: 1;
  generatorVersion: number;
  source: {
    publisher: string;
    api: string;
    retrievedAt: string;
    retrievedUntil: string;
    planFingerprint: string;
    datasets: Record<
      DatasetKey,
      {
        name: string;
        version: number;
        endpoint: string;
        page: string;
        lastRefresh: string | null;
        lastDataSetRefresh: string | null;
        nationalRecords: number | null;
        prRecords: number;
      }
    >;
    terms: typeof TERMS;
    attribution: string;
  };
  measures: readonly Measure[];
  disasters: {
    key: DisasterKey;
    number: number | null;
    declaration: string | null;
    type: string | null;
    title: string | null;
    incidentType: string | null;
    declarationDate: string | null;
    incidentBegin: string | null;
    incidentEnd: string | null;
    closeoutDate: string | null;
    /** False for a disaster number found in Puerto Rico records but declared for another state (or a non-disaster bucket). */
    declaredInPuertoRico: boolean;
    /** Programs declared for at least one area (FEMA flags). */
    programs: { ih: boolean; ia: boolean; pa: boolean; hm: boolean };
    statewideDesignation: boolean;
    designatedMunicipios: number;
    paProjectsFile: string | null;
  }[];
  /** Per municipio: declarations (program flags "ih,ia,pa,hm" as 4 booleans) and per-disaster measures. */
  municipios: Record<
    string,
    {
      name: string;
      designations: Record<DisasterKey, [boolean, boolean, boolean, boolean]>;
      values: Record<DisasterKey, Values>;
    }
  >;
  /** Puerto Rico per disaster and measure: total and its four geographic states. */
  island: Record<
    DisasterKey,
    Record<Measure, ({ total: number | null } & Record<GeoState, number | null>) | null>
  >;
  /** Mitigation project counts by FEMA status, verbatim, per disaster. */
  hmaStatus: Record<DisasterKey, Record<string, number>>;
  damageCategories: Record<string, string>;
  /** Amount fields with nulls left out of a sum (never counted as 0). */
  nulls: Record<string, number>;
};

export type ProjectRow = [
  pwNumber: number,
  /** A attributable, P applicant's municipio, S Statewide, U uncertain, N none. */
  geo: "A" | "P" | "S" | "U" | "N",
  municipio: string | null,
  damageCategory: string,
  projectAmount: number | null,
  federalShareObligated: number | null,
  totalObligated: number | null,
  projectProcessStep: string | null,
  projectStatus: string | null,
  firstObligationDate: string | null,
  lastObligationDate: string | null,
];
const GEO_CODE: Record<GeoState, ProjectRow[1]> = {
  MUNICIPIO_ATTRIBUTABLE: "A",
  APPLICANT_MUNICIPIO: "P",
  PUERTO_RICO_STATEWIDE: "S",
  MUNICIPIO_UNCERTAIN: "U",
  NO_MUNICIPIO_GEOGRAPHY: "N",
};

/** Free text that looks like contact details or personal identifiers is not published. */
export const PII_PATTERN =
  /[\w.+-]+@[\w-]+\.[\w.]+|\(?\b\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b|\b\d{3}-\d{2}-\d{4}\b/;

export function buildFema(root: string): {
  summary: string;
  projects: Record<string, string>;
  data: GeneratedFema;
} {
  const snapshot = readSnapshot(root);
  const { manifest } = snapshot;
  const geo = geoResolver(manifest.municipios);
  const ids = manifest.municipios.map((m) => m.id).sort();
  const nulls: Record<string, number> = {};
  const noteNull = (field: string) => (nulls[field] = (nulls[field] ?? 0) + 1);

  // --- Declarations -------------------------------------------------------
  type Disaster = GeneratedFema["disasters"][number];
  const disasters = new Map<DisasterKey, Disaster>();
  const designations = new Map<string, Record<DisasterKey, [boolean, boolean, boolean, boolean]>>(
    ids.map((id) => [id, {}]),
  );
  const seenAreas = new Set<string>();
  for (const r of snapshot.records("declarations")) {
    const n = disasterNumber(r.disasterNumber, "Declaración");
    if (r.state !== "PR" || r.fipsStateCode !== "72")
      fail(`Declaración ${n}: no es de Puerto Rico`);
    const declaration = String(r.femaDeclarationString);
    if (!new RegExp(`^(DR|EM|FM)-${n}-PR$`).test(declaration))
      fail(`Declaración ${n}: identificador inválido ${declaration}`);
    if (!declaration.startsWith(String(r.declarationType)))
      fail(`Declaración ${n}: tipo ${String(r.declarationType)} no coincide con ${declaration}`);
    const area = String(r.designatedArea);
    if (seenAreas.has(`${n}|${area}`)) fail(`Declaración ${n}: ${area} repetida`);
    seenAreas.add(`${n}|${area}`);
    const begin = isoDay(r.incidentBeginDate, `Declaración ${n}`);
    const end = isoDay(r.incidentEndDate, `Declaración ${n}`);
    if (begin && end && end < begin)
      fail(`Declaración ${n}: el incidente termina antes de empezar`);
    const flags: [boolean, boolean, boolean, boolean] = [
      r.ihProgramDeclared === true,
      r.iaProgramDeclared === true,
      r.paProgramDeclared === true,
      r.hmProgramDeclared === true,
    ];
    const key = String(n);
    const fields = {
      number: n,
      declaration,
      type: String(r.declarationType),
      title: (r.declarationTitle as string | null) ?? null,
      incidentType: (r.incidentType as string | null) ?? null,
      declarationDate: isoDay(r.declarationDate, `Declaración ${n}`),
      incidentBegin: begin,
      incidentEnd: end,
      closeoutDate: isoDay(r.disasterCloseoutDate, `Declaración ${n}`),
    };
    const existing = disasters.get(key);
    if (existing) {
      for (const [k, v] of Object.entries(fields))
        if ((existing as Record<string, unknown>)[k] !== v)
          fail(`Declaración ${n}: ${k} distinto entre áreas`);
    } else {
      disasters.set(key, {
        key,
        ...fields,
        declaredInPuertoRico: true,
        programs: { ih: false, ia: false, pa: false, hm: false },
        statewideDesignation: false,
        designatedMunicipios: 0,
        paProjectsFile: null,
      });
    }
    const d = disasters.get(key)!;
    d.programs = {
      ih: d.programs.ih || flags[0],
      ia: d.programs.ia || flags[1],
      pa: d.programs.pa || flags[2],
      hm: d.programs.hm || flags[3],
    };
    if (geo.isStatewide(area)) {
      d.statewideDesignation = true;
      continue;
    }
    const g = geo.county(area, r.fipsCountyCode);
    if (g.state !== "MUNICIPIO_ATTRIBUTABLE")
      fail(`Declaración ${n}: área designada desconocida ${area} (${String(r.fipsCountyCode)})`);
    designations.get(g.municipio!)![key] = flags;
    d.designatedMunicipios += 1;
  }

  function emptyDisaster(key: DisasterKey): Disaster {
    return {
      key,
      number: null,
      declaration: null,
      type: null,
      title: null,
      incidentType: null,
      declarationDate: null,
      incidentBegin: null,
      incidentEnd: null,
      closeoutDate: null,
      declaredInPuertoRico: false,
      programs: { ih: false, ia: false, pa: false, hm: false },
      statewideDesignation: false,
      designatedMunicipios: 0,
      paProjectsFile: null,
    };
  }

  // --- Accumulators -------------------------------------------------------
  const blank = (): Values => MEASURES.map(() => null);
  const perMunicipio = new Map<string, Map<DisasterKey, Values>>(ids.map((id) => [id, new Map()]));
  type Cell = { total: number | null } & Record<GeoState, number | null>;
  const island = new Map<DisasterKey, Map<Measure, Cell>>();
  const raw = new Map<string, { sum: number | null; items: number }>(); // independent totals for reconciliation
  const add = (a: number | null, b: number | null) => (b === null ? a : (a ?? 0) + b);
  const put = (d: DisasterKey, g: Geo, m: Measure, v: number | null) => {
    const i = MEASURES.indexOf(m);
    // Per-municipio values: attributable money, or (Public Assistance) money of applicants located there.
    if (g.state === "MUNICIPIO_ATTRIBUTABLE" || g.state === "APPLICANT_MUNICIPIO") {
      const row = perMunicipio.get(g.municipio!)!;
      const values = row.get(d) ?? blank();
      values[i] = add(values[i], v);
      row.set(d, values);
    }
    const byMeasure = island.get(d) ?? new Map<Measure, Cell>();
    const cell =
      byMeasure.get(m) ??
      ({
        total: null,
        MUNICIPIO_ATTRIBUTABLE: null,
        APPLICANT_MUNICIPIO: null,
        MUNICIPIO_UNCERTAIN: null,
        PUERTO_RICO_STATEWIDE: null,
        NO_MUNICIPIO_GEOGRAPHY: null,
      } as Cell);
    cell[g.state] = add(cell[g.state], v);
    cell.total = add(cell.total, v);
    byMeasure.set(m, cell);
    island.set(d, byMeasure);
    const r = raw.get(`${d}|${m}`) ?? { sum: null, items: 0 };
    raw.set(`${d}|${m}`, { sum: add(r.sum, v), items: r.items + 1 });
  };
  /**
   * A disaster number from a program record. Numbers declared for Puerto Rico
   * get their declaration; a number declared for another state (households in
   * Puerto Rico registered under it) keeps its number, flagged, with no title.
   */
  const disasterKey = (n: number) => {
    const key = String(n);
    if (!disasters.has(key)) disasters.set(key, { ...emptyDisaster(key), number: n });
    return key;
  };

  // --- Public Assistance --------------------------------------------------
  const projects = new Map<DisasterKey, ProjectRow[]>();
  const damageCategories: Record<string, string> = {};
  const seenProjects = new Set<string>();
  for (const r of snapshot.records("publicAssistance")) {
    const n = disasterNumber(r.disasterNumber, "Asistencia Pública");
    const where = `Asistencia Pública ${n}/${String(r.pwNumber)}`;
    if (r.stateAbbreviation !== "PR" || r.stateNumberCode !== "72")
      fail(`${where}: no es de Puerto Rico`);
    if (typeof r.pwNumber !== "number" || !Number.isInteger(r.pwNumber))
      fail(`${where}: número de proyecto inválido`);
    const projectKey = `${n}|${r.pwNumber as number}`;
    if (seenProjects.has(projectKey)) fail(`${where}: proyecto repetido`);
    seenProjects.add(projectKey);
    const d = disasterKey(n);
    // Public Assistance `county` is the applicant's location (FEMA's field
    // definition), not necessarily the work site: never "attributable".
    const located = geo.county(r.county, r.countyCode);
    const g: Geo =
      located.state === "MUNICIPIO_ATTRIBUTABLE"
        ? { state: "APPLICANT_MUNICIPIO", municipio: located.municipio }
        : located;
    const projectAmount = amount(r.projectAmount, `${where} projectAmount`);
    const fso = amount(r.federalShareObligated, `${where} federalShareObligated`);
    const totalObligated = amount(r.totalObligated, `${where} totalObligated`);
    if (projectAmount === null) noteNull("publicAssistance.projectAmount");
    if (fso === null) noteNull("publicAssistance.federalShareObligated");
    if (totalObligated === null) noteNull("publicAssistance.totalObligated");
    put(d, g, "paObligated", fso);
    put(d, g, "paProjects", 1);
    put(d, g, "paProjectAmount", projectAmount);
    put(d, g, "paTotalObligated", totalObligated);
    const category = String(r.damageCategoryCode ?? "");
    if (category) damageCategories[category] = String(r.damageCategoryDescrip ?? category);
    // FEMA's free-text applicationTitle never reaches the repository (see extract.ts).
    const row: ProjectRow = [
      r.pwNumber as number,
      GEO_CODE[g.state],
      g.municipio,
      category,
      projectAmount,
      fso,
      totalObligated,
      (r.projectProcessStep as string | null) ?? null,
      (r.projectStatus as string | null) ?? null,
      isoDay(r.firstObligationDate, where),
      isoDay(r.lastObligationDate, where),
    ];
    const list = projects.get(d) ?? [];
    list.push(row);
    projects.set(d, list);
  }

  // --- Hazard Mitigation Assistance ---------------------------------------
  const hmaStatus: GeneratedFema["hmaStatus"] = {};
  const seenHma = new Set<string>();
  for (const r of snapshot.records("mitigation")) {
    const pid = String(r.projectIdentifier);
    const where = `Mitigación ${pid}`;
    if (r.state !== "Puerto Rico" || r.stateNumberCode !== "72")
      fail(`${where}: no es de Puerto Rico`);
    if (seenHma.has(pid)) fail(`${where}: proyecto repetido`);
    seenHma.add(pid);
    // Non-disaster programs (PDM, FMA, BRIC) go to "none", whatever number
    // their system of record carries (FEMA notes some do, e.g. 9008, 9082).
    const disasterProgram = r.programArea === "HMGP";
    const d =
      !disasterProgram || r.disasterNumber === null || r.disasterNumber === undefined
        ? "none"
        : disasterKey(disasterNumber(r.disasterNumber, where));
    // Several municipios in projectCounties: the money cannot be placed in one.
    // "PUERTO RICO" or "ISLANDWIDE" there is FEMA saying the whole territory.
    const counties =
      typeof r.projectCounties === "string"
        ? r.projectCounties
            .split(";")
            .map((s) => s.trim())
            .filter(Boolean)
        : [];
    const islandToken = (c: string) => geo.isStatewide(c) || /^(puerto rico|islandwide)$/i.test(c);
    const g: Geo =
      geo.isStatewide(r.county) || counties.some(islandToken)
        ? { state: "PUERTO_RICO_STATEWIDE", municipio: null }
        : counties.length > 1
          ? { state: "MUNICIPIO_UNCERTAIN", municipio: null }
          : geo.county(r.county, r.countyCode);
    const fso = amount(r.federalShareObligated, `${where} federalShareObligated`);
    const projectAmount = amount(r.projectAmount, `${where} projectAmount`);
    if (fso === null) noteNull("mitigation.federalShareObligated");
    if (projectAmount === null) noteNull("mitigation.projectAmount");
    put(d, g, "hmaFederalObligated", fso);
    put(d, g, "hmaProjects", 1);
    put(d, g, "hmaProjectAmount", projectAmount);
    const status = String(r.status ?? "Sin estado");
    hmaStatus[d] = hmaStatus[d] ?? {};
    hmaStatus[d][status] = (hmaStatus[d][status] ?? 0) + 1;
  }

  // --- Household assistance (FEMA's aggregated rows only) ------------------
  const seenHousing = new Set<string>();
  for (const key of ["housingOwners", "housingRenters"] as const) {
    for (const r of snapshot.records(key)) {
      const where = `${DATASETS[key].name} ${String(r.id)}`;
      for (const forbidden of ["zipCode", "city", "addressLine1", "name"])
        if (forbidden in r) fail(`${where}: campo no permitido ${forbidden}`);
      if (seenHousing.has(String(r.id))) fail(`${where}: registro repetido`);
      seenHousing.add(String(r.id));
      if (r.state !== "PR") fail(`${where}: no es de Puerto Rico`);
      const d = disasterKey(disasterNumber(r.disasterNumber, where));
      const g = geo.county(r.county, undefined);
      const approved = amount(r.totalApprovedIhpAmount, `${where} totalApprovedIhpAmount`);
      if (approved === null) noteNull(`${key}.totalApprovedIhpAmount`);
      put(d, g, "ihpApproved", approved);
      put(
        d,
        g,
        "ihpApprovedCount",
        count(r.approvedForFemaAssistance, `${where} approvedForFemaAssistance`),
      );
      put(
        d,
        g,
        "ihpValidRegistrations",
        count(r.validRegistrations, `${where} validRegistrations`),
      );
    }
  }

  // --- Reconciliation: the four states add up to every total ---------------
  for (const [d, byMeasure] of island) {
    for (const [m, cell] of byMeasure) {
      const r = raw.get(`${d}|${m}`)!;
      const parts = GEO_STATES.reduce<number | null>((a, s) => add(a, cell[s]), null);
      if ((parts === null) !== (r.sum === null)) fail(`${d} ${m}: nulos que no cuadran`);
      if (parts !== null && Math.abs(parts - r.sum!) > tolerance(r.items))
        fail(`${d} ${m}: estados ${cents(parts)} ≠ total ${cents(r.sum!)}`);
      const muni = [...perMunicipio.values()].reduce<number | null>(
        (a, row) => add(a, row.get(d)?.[MEASURES.indexOf(m)] ?? null),
        null,
      );
      const placed = (cell.MUNICIPIO_ATTRIBUTABLE ?? 0) + (cell.APPLICANT_MUNICIPIO ?? 0);
      if (Math.abs((muni ?? 0) - placed) > tolerance(r.items))
        fail(`${d} ${m}: municipios ≠ atribuible + solicitante`);
      // One measure never mixes the two kinds of municipio geography.
      if (cell.MUNICIPIO_ATTRIBUTABLE !== null && cell.APPLICANT_MUNICIPIO !== null)
        fail(`${d} ${m}: mezcla lugar del proyecto y lugar del solicitante`);
    }
  }

  // --- Disasters that have any data, newest first ---------------------------
  const keys = [...island.keys()];
  if (keys.includes("none") && !disasters.has("none")) disasters.set("none", emptyDisaster("none"));
  for (const d of projects.keys()) disasters.get(d)!.paProjectsFile = `fema-projects/${d}.json`;
  const disasterList = [...disasters.values()].sort(
    (a, b) =>
      (b.declarationDate ?? "").localeCompare(a.declarationDate ?? "") ||
      (b.number ?? 0) - (a.number ?? 0),
  );

  const round = (v: number | null) => (v === null ? null : cents(v));
  const datasets = Object.fromEntries(
    DATASET_KEYS.map((key) => {
      const c = snapshot.catalog(key);
      return [
        key,
        {
          name: DATASETS[key].name,
          version: DATASETS[key].version,
          endpoint: `${manifest.api}v${DATASETS[key].version}/${DATASETS[key].name}`,
          page: DATASETS[key].page,
          lastRefresh: (c.lastRefresh as string | null) ?? null,
          lastDataSetRefresh: (c.lastDataSetRefresh as string | null) ?? null,
          nationalRecords: (c.recordCount as number | null) ?? null,
          prRecords: snapshot.records(key).length,
        },
      ];
    }),
  ) as GeneratedFema["source"]["datasets"];

  const data: GeneratedFema = {
    generated:
      "GENERADO por scripts/fema/generate.ts desde data/source/fema (extracto público). NO EDITAR A MANO.",
    schema: 1,
    generatorVersion: FEMA_GENERATOR_VERSION,
    source: {
      publisher: manifest.publisher,
      api: manifest.api,
      retrievedAt: manifest.retrievedAt,
      retrievedUntil: manifest.retrievedUntil,
      planFingerprint: manifest.planFingerprint,
      datasets,
      terms: manifest.terms,
      attribution: FEMA_ATTRIBUTION,
    },
    measures: MEASURES,
    disasters: disasterList,
    municipios: Object.fromEntries(
      ids.map((id) => [
        id,
        {
          name: manifest.municipios.find((m) => m.id === id)!.name,
          designations: Object.fromEntries(
            Object.entries(designations.get(id)!).sort(([a], [b]) => a.localeCompare(b)),
          ),
          values: Object.fromEntries(
            [...perMunicipio.get(id)!.entries()]
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([d, v]) => [d, v.map(round)]),
          ),
        },
      ]),
    ),
    island: Object.fromEntries(
      [...island.keys()].sort().map((d) => [
        d,
        Object.fromEntries(
          MEASURES.map((m) => {
            const cell = island.get(d)!.get(m);
            return [
              m,
              cell
                ? (Object.fromEntries(Object.entries(cell).map(([k, v]) => [k, round(v)])) as Cell)
                : null,
            ];
          }),
        ) as Record<Measure, Cell | null>,
      ]),
    ),
    hmaStatus: Object.fromEntries(
      Object.entries(hmaStatus)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([d, s]) => [d, Object.fromEntries(Object.entries(s).sort())]),
    ),
    damageCategories: Object.fromEntries(Object.entries(damageCategories).sort()),
    nulls: Object.fromEntries(Object.entries(nulls).sort()),
  };

  const projectFiles: Record<string, string> = {};
  for (const [d, rows] of [...projects.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    rows.sort((a, b) => a[0] - b[0]);
    projectFiles[d] =
      `{"generated":"GENERADO por scripts/fema/generate.ts. NO EDITAR A MANO.","disaster":${JSON.stringify(d)},` +
      `"columns":["pwNumber","geo","municipio","damageCategory","projectAmount","federalShareObligated","totalObligated","projectProcessStep","projectStatus","firstObligationDate","lastObligationDate"],"rows":[\n` +
      rows.map((r) => JSON.stringify(r)).join(",\n") +
      "\n]}\n";
  }
  return { summary: stableJson(data), projects: projectFiles, data };
}

/** One municipio per line: readable diffs, identical bytes every run. */
export function stableJson(data: GeneratedFema): string {
  const { municipios, ...rest } = data;
  const head = JSON.stringify(rest, null, 1).replace(/\n}$/, "");
  const rows = Object.entries(municipios).map(
    ([id, value]) => ` ${JSON.stringify(id)}: ${JSON.stringify(value)}`,
  );
  return `${head},\n "municipios": {\n${rows.join(",\n")}\n }\n}\n`;
}
