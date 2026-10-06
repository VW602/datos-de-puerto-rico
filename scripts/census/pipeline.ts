/**
 * Offline half of the Census pipeline: raw snapshot -> checksum check ->
 * validation -> normalization -> generated data. Pure functions over the
 * files in data/raw/census; no network. scripts/census/generate.ts writes the
 * results; the tests call the same functions.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AGE_BANDS, METRIC_FORMULAS, sexAndAge, type VariableValues } from "./formulas.ts";
import { parseCensusCell, type CellStatus } from "./normalize.ts";
import { EXPECTED_MUNICIPIOS, PR_COUNTY_GEO_PREFIX, RELEASES, type CensusRelease } from "./releases.ts";

export const GENERATOR_VERSION = 1;

export type ManifestFile = {
  kind: "table" | "geos";
  table: string | null;
  sourceURL: string;
  upstream: { bytes: number; sha256: string; lastModified: string | null; etag: string | null };
  path: string;
  sha256: string;
  rows: number;
};

export type ManifestSnapshot = {
  snapshotId: CensusRelease["snapshotId"];
  datasetId: CensusRelease["datasetId"];
  dataset: string;
  release: string;
  vintage: number;
  sourceURL: string;
  retrievedAt: string;
  geography: string;
  recordCount: number;
  extractionMethod: string;
  files: ManifestFile[];
};

export type CensusManifest = {
  schema: 1;
  generator: string;
  generatorVersion: number;
  attribution: string;
  retrievedAtNote: string;
  snapshots: ManifestSnapshot[];
};

export function sha256(bytes: Buffer | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Summary File text: UTF-8 when valid, otherwise Latin-1. */
export function decode(bytes: Buffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return bytes.toString("latin1");
  }
}

function readVerified(root: string, file: ManifestFile): string {
  const bytes = readFileSync(join(root, file.path));
  const actual = sha256(bytes);
  if (actual !== file.sha256) {
    throw new Error(`Checksum no coincide para ${file.path}: manifiesto ${file.sha256}, archivo ${actual}`);
  }
  return decode(bytes);
}

function rowsOf(text: string): { header: string[]; rows: string[][] } {
  const lines = text.split(/\r?\n/).filter((line) => line.length > 0);
  const [head, ...rest] = lines;
  if (!head) throw new Error("Archivo vacío");
  return { header: head.split("|"), rows: rest.map((line) => line.split("|")) };
}

/** The 78-municipio invariant. Throws with a clear reason if any part fails. */
export function assertMunicipioRows(geoIds: string[], label: string): void {
  if (geoIds.length !== EXPECTED_MUNICIPIOS) {
    throw new Error(`${label}: se esperaban ${EXPECTED_MUNICIPIOS} municipios y hay ${geoIds.length}`);
  }
  const unique = new Set(geoIds);
  if (unique.size !== geoIds.length) throw new Error(`${label}: GEO_ID repetido`);
  for (const id of geoIds) {
    if (!new RegExp(`^${PR_COUNTY_GEO_PREFIX}\\d{3}$`).test(id)) throw new Error(`${label}: fila fuera de Puerto Rico o mal formada: ${id}`);
  }
}

export type NormalizedMunicipio = {
  name: string;
  /** Every estimate (_E) and margin of error (_M) of the snapshot; null = no usable value. */
  variables: Record<string, number | null>;
  /** Why a variable is null (Census sentinel or empty cell). Only non-numeric cells appear here. */
  statuses: Record<string, Exclude<CellStatus, "ok">>;
};

export type NormalizedRelease = {
  snapshotId: CensusRelease["snapshotId"];
  release: string;
  municipios: Record<string, NormalizedMunicipio>;
};

/** Reads one release's snapshot and returns every estimate and MOE, normalized. */
export function normalizeRelease(root: string, snapshot: ManifestSnapshot): NormalizedRelease {
  const release = RELEASES.find((item) => item.snapshotId === snapshot.snapshotId);
  if (!release) throw new Error(`Snapshot desconocido: ${snapshot.snapshotId}`);

  const geos = snapshot.files.find((file) => file.kind === "geos");
  if (!geos) throw new Error(`${snapshot.snapshotId}: falta el archivo de geografías`);
  const geoTable = rowsOf(readVerified(root, geos));
  const geoCol = geoTable.header.indexOf("GEO_ID");
  const nameCol = geoTable.header.indexOf("NAME");
  if (geoCol < 0 || nameCol < 0) throw new Error(`${geos.path}: faltan las columnas GEO_ID o NAME`);
  const names = new Map<string, string>();
  for (const row of geoTable.rows) {
    const name = row[nameCol].replace(/ Municipio, Puerto Rico$/, "");
    if (name === row[nameCol]) throw new Error(`${geos.path}: nombre inesperado "${row[nameCol]}"`);
    names.set(row[geoCol], name);
  }
  assertMunicipioRows([...names.keys()], geos.path);
  if (new Set(names.values()).size !== EXPECTED_MUNICIPIOS) throw new Error(`${geos.path}: nombres de municipio repetidos`);

  const municipios: NormalizedRelease["municipios"] = {};
  for (const [geoId, name] of [...names].sort(([a], [b]) => a.localeCompare(b))) {
    municipios[geoId.slice(-5)] = { name, variables: {}, statuses: {} };
  }

  for (const table of release.tables) {
    const file = snapshot.files.find((item) => item.kind === "table" && item.table === table);
    if (!file) throw new Error(`${snapshot.snapshotId}: falta la tabla ${table}`);
    const { header, rows } = rowsOf(readVerified(root, file));
    if (header[0] !== "GEO_ID") throw new Error(`${file.path}: la primera columna no es GEO_ID`);
    const columns = header.slice(1);
    for (const column of columns) {
      if (!new RegExp(`^${table}_[EM]\\d{3}$`).test(column)) throw new Error(`${file.path}: columna inesperada ${column}`);
    }
    const geoIds = rows.map((row) => row[0]);
    assertMunicipioRows(geoIds, file.path);
    for (const row of rows) {
      if (row.length !== header.length) throw new Error(`${file.path}: fila ${row[0]} con ${row.length} columnas`);
      const target = municipios[row[0].slice(-5)];
      if (!target) throw new Error(`${file.path}: ${row[0]} no está en el archivo de geografías`);
      columns.forEach((column, index) => {
        const cell = parseCensusCell(row[index + 1]);
        target.variables[column] = cell.value;
        if (cell.status !== "ok") target.statuses[column] = cell.status;
      });
    }
  }
  return { snapshotId: snapshot.snapshotId, release: snapshot.release, municipios };
}

export type MetricValue = { estimate: number | null; moe: number | null };

export type GeneratedCensus = {
  generated: string;
  schema: 1;
  generatorVersion: number;
  releases: { snapshotId: string; datasetId: string; period: string }[];
  /** How MOEs are reported: published MOE for single-variable metrics; null for derived ratios (component MOEs are in data/normalized/census). */
  moePolicy: string;
  municipios: Record<
    string,
    {
      name: string;
      metrics: Record<string, MetricValue>;
      male: MetricValue;
      female: MetricValue;
      ages: { label: string; male: number | null; female: number | null }[];
    }
  >;
};

function flat(release: NormalizedRelease, id: string): VariableValues {
  return release.municipios[id].variables;
}

export function buildGenerated(normalized: NormalizedRelease[]): GeneratedCensus {
  const byId = new Map(normalized.map((item) => [item.snapshotId, item]));
  const base = byId.get("acs-2019-2023");
  const layers = byId.get("acs-2020-2024");
  if (!base || !layers) throw new Error("Faltan releases del Censo");
  const ids = Object.keys(base.municipios).sort();
  if (ids.join() !== Object.keys(layers.municipios).sort().join()) throw new Error("Los releases no tienen los mismos municipios");

  const municipios: GeneratedCensus["municipios"] = {};
  for (const id of ids) {
    if (base.municipios[id].name !== layers.municipios[id].name) {
      throw new Error(`Nombre distinto para ${id}: ${base.municipios[id].name} / ${layers.municipios[id].name}`);
    }
    const values = { "acs-2019-2023": flat(base, id), "acs-2020-2024": flat(layers, id) };
    const metrics: Record<string, MetricValue> = {};
    for (const formula of METRIC_FORMULAS) {
      const v = values[formula.snapshotId];
      metrics[formula.id] = { estimate: formula.compute(v), moe: formula.moe ? (v[formula.moe] ?? null) : null };
    }
    const structure = sexAndAge(values["acs-2019-2023"]);
    municipios[id] = { name: base.municipios[id].name, metrics, ...structure };
  }
  return {
    generated: "GENERADO por scripts/census/generate.ts desde data/raw/census. NO EDITAR A MANO.",
    schema: 1,
    generatorVersion: GENERATOR_VERSION,
    releases: RELEASES.map((r) => ({ snapshotId: r.snapshotId, datasetId: r.datasetId, period: r.period })),
    moePolicy:
      "moe = margen de error oficial (90%) cuando la medida es una sola variable publicada; null cuando la medida se calcula con varias variables. Los márgenes de cada variable están en data/normalized/census.",
    municipios,
  };
}

/** One municipio per line: readable diffs, small files, same bytes every run. */
export function normalizedJson(item: NormalizedRelease): string {
  const lines = Object.entries(item.municipios).map(([id, m]) => `    ${JSON.stringify(id)}: ${JSON.stringify(m)}`);
  return [
    "{",
    `  "generated": ${JSON.stringify("GENERADO por scripts/census/generate.ts. NO EDITAR A MANO.")},`,
    `  "snapshotId": ${JSON.stringify(item.snapshotId)},`,
    `  "release": ${JSON.stringify(item.release)},`,
    '  "municipios": {',
    lines.join(",\n"),
    "  }",
    "}",
    "",
  ].join("\n");
}

export function stableJson(value: unknown): string {
  return JSON.stringify(value, null, 2) + "\n";
}

export function readManifest(root: string): CensusManifest {
  return JSON.parse(readFileSync(join(root, "data/raw/census/manifest.json"), "utf8")) as CensusManifest;
}

/** Everything generate.ts writes, as path -> file contents. Deterministic for the same raw input. */
export function buildCensusArtifacts(root: string): Record<string, string> {
  const manifest = readManifest(root);
  const normalized = RELEASES.map((release) => {
    const snapshot = manifest.snapshots.find((item) => item.snapshotId === release.snapshotId);
    if (!snapshot) throw new Error(`El manifiesto no tiene ${release.snapshotId}`);
    return normalizeRelease(root, snapshot);
  });
  const out: Record<string, string> = {};
  for (const item of normalized) {
    out[`data/normalized/census/${item.snapshotId}.json`] = normalizedJson(item);
  }
  out["data/generated/census-municipios.json"] = stableJson(buildGenerated(normalized));
  return out;
}

export { AGE_BANDS };
