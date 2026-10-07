/**
 * Offline half of the BLS pipeline: verified raw API responses -> validation
 * -> data/generated/bls-laus.json. Pure; no network. Values are copied as BLS
 * publishes them; nothing is recomputed, and a missing value stays null.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  BLS_ATTRIBUTION,
  BLS_GENERATOR_VERSION,
  EXPECTED_MUNICIPIOS,
  MANIFEST,
  MEASURE_KEYS,
  SOURCE_PAGE,
  TERMS,
  municipioSeries,
  puertoRicoSeries,
  type Measure,
} from "./source.ts";

export const sha256 = (data: Buffer | string) => createHash("sha256").update(data).digest("hex");

export type BlsManifest = {
  schema: 1;
  generator: string;
  generatorVersion: number;
  agency: string;
  dataset: string;
  api: string;
  apiVersion: "v1" | "v2";
  retrievedAt: string;
  retrievedAtNote: string;
  startYear: number;
  endYear: number;
  terms: typeof TERMS;
  municipios: { id: string; name: string }[];
  batches: {
    path: string;
    request: { seriesid: string[]; startyear: string; endyear: string };
    bytes: number;
    sha256: string;
  }[];
};

type ApiPoint = {
  year: string;
  period: string;
  value: string;
  latest?: string;
  footnotes?: ({ code?: string; text?: string } | null)[];
};
type ApiSeries = { seriesID: string; data: ApiPoint[] };
type ApiResponse = { status: string; message?: string[]; Results?: { series: ApiSeries[] } };

export type MissingValue = {
  series: string;
  month: string;
  reason: "not_published" | "not_numeric";
};

export type SeriesValues = Record<Measure, (number | null)[]>;

export type GeneratedLaus = {
  generated: string;
  schema: 1;
  generatorVersion: number;
  source: {
    agency: string;
    dataset: string;
    api: string;
    page: string;
    retrievedAt: string;
    seasonalAdjustment: string;
    terms: typeof TERMS;
    attribution: string;
  };
  months: string[];
  latest: string;
  preliminary: string[];
  puertoRico: { series: Record<Measure, string> } & SeriesValues;
  municipios: Record<string, { name: string; series: Record<Measure, string> } & SeriesValues>;
  missing: MissingValue[];
};

export function readManifest(root: string): BlsManifest {
  return JSON.parse(readFileSync(join(root, MANIFEST), "utf8")) as BlsManifest;
}

/** Every batch file must match the SHA-256 recorded when it was downloaded. */
export function readBatches(root: string, manifest: BlsManifest): ApiResponse[] {
  return manifest.batches.map((batch) => {
    const bytes = readFileSync(join(root, batch.path));
    const actual = sha256(bytes);
    if (actual !== batch.sha256)
      throw new Error(
        `Checksum no coincide para ${batch.path}: manifiesto ${batch.sha256}, archivo ${actual}`,
      );
    const parsed = JSON.parse(bytes.toString("utf8")) as ApiResponse;
    if (parsed.status !== "REQUEST_SUCCEEDED")
      throw new Error(`${batch.path}: la API respondió ${parsed.status}`);
    return parsed;
  });
}

const monthKey = (year: string, period: string) => `${year}-${period.slice(1)}`;

/** Checks the municipio list itself: 78 unique Puerto Rico FIPS codes with names. */
export function assertMunicipios(list: { id: string; name: string }[]): void {
  if (list.length !== EXPECTED_MUNICIPIOS)
    throw new Error(`${list.length} municipios (se esperan ${EXPECTED_MUNICIPIOS})`);
  const ids = new Set(list.map((m) => m.id));
  if (ids.size !== list.length) throw new Error("Código FIPS repetido en la lista de municipios");
  if (new Set(list.map((m) => m.name)).size !== list.length)
    throw new Error("Nombre repetido en la lista de municipios");
  for (const { id, name } of list) {
    if (!/^72\d{3}$/.test(id)) throw new Error(`${id} no es un municipio de Puerto Rico`);
    if (!name) throw new Error(`${id} sin nombre`);
  }
}

/** All series the pipeline expects, in a fixed order: Puerto Rico first, then municipios by FIPS. */
export function expectedSeries(municipios: { id: string }[]): string[] {
  const out = MEASURE_KEYS.map((m) => puertoRicoSeries(m));
  for (const { id } of [...municipios].sort((a, b) => a.id.localeCompare(b.id))) {
    for (const m of MEASURE_KEYS) out.push(municipioSeries(id, m));
  }
  return out;
}

export function buildLaus(root: string): { content: string; data: GeneratedLaus } {
  const manifest = readManifest(root);
  assertMunicipios(manifest.municipios);
  const responses = readBatches(root, manifest);

  const expected = expectedSeries(manifest.municipios);
  const requested = manifest.batches.flatMap((b) => b.request.seriesid);
  if ([...requested].sort().join() !== [...expected].sort().join()) {
    throw new Error(
      "Las series pedidas no son las 4 medidas de Puerto Rico y de los 78 municipios",
    );
  }

  const bySeries = new Map<string, ApiSeries>();
  for (const response of responses) {
    for (const series of response.Results?.series ?? []) {
      if (bySeries.has(series.seriesID)) throw new Error(`Serie repetida: ${series.seriesID}`);
      bySeries.set(series.seriesID, series);
    }
  }
  for (const id of expected) {
    const series = bySeries.get(id);
    if (!series || series.data.length === 0)
      throw new Error(`Falta la serie ${id} (o vino sin datos)`);
  }

  // Monthly points only (M13 is an annual average), validated.
  const points = new Map<string, Map<string, ApiPoint>>();
  for (const id of expected) {
    const map = new Map<string, ApiPoint>();
    for (const point of bySeries.get(id)!.data) {
      if (point.period === "M13") continue;
      if (!/^M(0[1-9]|1[0-2])$/.test(point.period))
        throw new Error(`${id}: periodo inválido ${point.period}`);
      const year = Number(point.year);
      if (!Number.isInteger(year) || year < manifest.startYear || year > manifest.endYear) {
        throw new Error(`${id}: año fuera de lo pedido ${point.year}`);
      }
      map.set(monthKey(point.year, point.period), point);
    }
    points.set(id, map);
  }

  // Latest month: the newest month every series has. Series must not disagree.
  const latestBySeries = expected.map((id) => [...points.get(id)!.keys()].sort().pop()!);
  const latest = [...latestBySeries].sort()[0];
  const ahead = expected.filter((_, i) => latestBySeries[i] !== latest);
  if (ahead.length > 0) {
    throw new Error(
      `Las series no terminan en el mismo mes (${latest}); adelantadas: ${ahead.slice(0, 5).join(", ")}`,
    );
  }

  const months: string[] = [];
  for (let y = manifest.startYear; y <= Number(latest.slice(0, 4)); y += 1) {
    for (let m = 1; m <= 12; m += 1) {
      const key = `${y}-${String(m).padStart(2, "0")}`;
      if (key <= latest) months.push(key);
    }
  }

  const missing: MissingValue[] = [];
  const preliminary = new Set<string>();
  const valuesFor = (id: string): (number | null)[] =>
    months.map((month) => {
      const point = points.get(id)!.get(month);
      if (!point) {
        missing.push({ series: id, month, reason: "not_published" });
        return null;
      }
      if ((point.footnotes ?? []).some((f) => f?.code === "P")) preliminary.add(month);
      const text = point.value.trim();
      if (!/^-?\d+(\.\d+)?$/.test(text)) {
        missing.push({ series: id, month, reason: "not_numeric" });
        return null;
      }
      return Number(text);
    });

  const block = (series: Record<Measure, string>) => {
    const values = Object.fromEntries(
      MEASURE_KEYS.map((m) => [m, valuesFor(series[m])]),
    ) as SeriesValues;
    for (const [i, month] of months.entries()) {
      const rate = values.rate[i];
      if (rate != null && (rate < 0 || rate > 100))
        throw new Error(`${series.rate} ${month}: tasa fuera de rango (${rate})`);
      for (const m of ["laborForce", "employment", "unemployment"] as const) {
        const v = values[m][i];
        if (v != null && (v < 0 || !Number.isInteger(v)))
          throw new Error(`${series[m]} ${month}: conteo inválido (${v})`);
      }
      const { laborForce, employment, unemployment } = {
        laborForce: values.laborForce[i],
        employment: values.employment[i],
        unemployment: values.unemployment[i],
      };
      if (
        laborForce != null &&
        employment != null &&
        unemployment != null &&
        employment + unemployment !== laborForce
      ) {
        throw new Error(
          `${series.laborForce} ${month}: empleo + desempleo no suma la fuerza laboral`,
        );
      }
    }
    return { series, ...values };
  };

  const puertoRico = block(
    Object.fromEntries(MEASURE_KEYS.map((m) => [m, puertoRicoSeries(m)])) as Record<
      Measure,
      string
    >,
  );
  const municipios: GeneratedLaus["municipios"] = {};
  for (const { id, name } of [...manifest.municipios].sort((a, b) => a.id.localeCompare(b.id))) {
    municipios[id] = {
      name,
      ...block(
        Object.fromEntries(MEASURE_KEYS.map((m) => [m, municipioSeries(id, m)])) as Record<
          Measure,
          string
        >,
      ),
    };
  }

  const data: GeneratedLaus = {
    generated: "GENERADO por scripts/bls/generate.ts desde data/raw/bls. NO EDITAR A MANO.",
    schema: 1,
    generatorVersion: BLS_GENERATOR_VERSION,
    source: {
      agency: manifest.agency,
      dataset: manifest.dataset,
      api: manifest.api,
      page: SOURCE_PAGE,
      retrievedAt: manifest.retrievedAt,
      seasonalAdjustment: "Sin ajuste estacional (la única versión que BLS publica por municipio).",
      terms: manifest.terms,
      attribution: BLS_ATTRIBUTION,
    },
    months,
    latest,
    preliminary: [...preliminary].sort(),
    puertoRico,
    municipios,
    missing,
  };
  return { content: stableJson(data), data };
}

/** One municipio per line: readable diffs, identical bytes every run. */
export function stableJson(data: GeneratedLaus): string {
  const { municipios, ...rest } = data;
  const head = JSON.stringify(rest, null, 2).replace(/\n}$/, "");
  const rows = Object.entries(municipios).map(
    ([id, value]) => `    ${JSON.stringify(id)}: ${JSON.stringify(value)}`,
  );
  return `${head},\n  "municipios": {\n${rows.join(",\n")}\n  }\n}\n`;
}
