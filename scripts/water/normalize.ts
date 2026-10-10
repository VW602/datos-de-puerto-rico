/**
 * Pure: exact USGS Water Data API responses → the stations, observations and
 * short series the site publishes. Throws when a REQUIRED response is broken;
 * a problem with one station or series excludes that series with a reason,
 * never the whole update. Never guesses, clamps or fills in values. No network.
 */

import { contentHash, isoUtc, sha256 } from "../live/normalize.ts";
import {
  ACTIVE_DAYS,
  ELEVATION_PREFERENCE,
  OBSERVATION_FIELDS,
  PARAMETER_BY_CODE,
  PR_BOX,
  RAIN_MAX_GAP_MINUTES,
  RESERVOIR_SITE_TYPES,
  RIVER_SITE_TYPES,
  SERIES_HOURS,
  STATION_FIELDS,
  STATION_FRESHNESS,
  TREND_HOURS,
  WATER,
  WATER_FRESHNESS,
  WATER_SCHEMA_VERSION,
  siteUrl,
  type ParameterSpec,
  type WaterView,
} from "./source.ts";
import { stationState, type StationState } from "../../src/data/pr/waterModel.ts";

export { contentHash, sha256 };
const fail = (message: string): never => {
  throw new Error(message);
};
const SKEW_MS = 5 * 60_000;
const HOUR = 3600_000;

type Feature = {
  id?: unknown;
  properties?: Record<string, unknown>;
  geometry?: { type?: string; coordinates?: unknown } | null;
};
export type WaterRaw = {
  latest: Feature[];
  meta: Feature[];
  locations: Feature[];
  /** Null when the optional 24-hour request failed: values are still published, without series. */
  continuous: Feature[] | null;
};

export type Station = {
  id: string;
  name: string;
  siteTypeCode: string;
  siteType: string;
  latitude: number;
  longitude: number;
  /** Census GEOID of the municipio in USGS site metadata (state 72 + county code). Where the station is, nothing more. */
  municipio: string | null;
  countyName: string | null;
  url: string;
};
export type Trend = {
  hours: number;
  fromAt: string;
  fromValueText: string;
  deltaText: string;
  direction: "UP" | "DOWN" | "SAME";
};
export type Rain24h = {
  from: string;
  to: string;
  /** Sum of the 15-minute increments in the window; null when they do not cover it. */
  totalText: string | null;
  complete: boolean;
  points: number;
};
export type Observation = {
  stationId: string;
  timeSeriesId: string;
  view: WaterView;
  parameterCode: string;
  kind: ParameterSpec["kind"];
  datum: string | null;
  unit: string;
  statisticId: string | null;
  computation: string;
  /** When the station measured it (UTC). Never the retrieval time. */
  observedAt: string;
  /** Null when USGS publishes no value (NO_DATA). 0 is a measured zero. */
  value: number | null;
  /** The value exactly as USGS published it (keeps its precision). */
  valueText: string | null;
  approval: "Provisional" | "Approved";
  qualifiers: string[];
  flags: string[];
  trend: Trend | null;
  rain24h: Rain24h | null;
};
export type ExclusionReason =
  | "INACTIVE"
  | "ALTERNATE_DATUM_OR_UNIT"
  | "AMBIGUOUS_DUPLICATE"
  | "SITE_TYPE_OUT_OF_SCOPE"
  | "NOT_USGS"
  | "NO_METADATA"
  | "NO_SITE_METADATA"
  | "METADATA_MISMATCH"
  | "INVALID_COORDINATES"
  | "INVALID_VALUE"
  | "FUTURE_OBSERVATION";
/** Reasons listed one by one in the snapshot; the others are counted only. */
const LISTED: ExclusionReason[] = [
  "AMBIGUOUS_DUPLICATE",
  "SITE_TYPE_OUT_OF_SCOPE",
  "NOT_USGS",
  "NO_METADATA",
  "NO_SITE_METADATA",
  "METADATA_MISMATCH",
  "INVALID_COORDINATES",
  "INVALID_VALUE",
  "FUTURE_OBSERVATION",
];
export type Exclusion = {
  stationId: string;
  parameterCode: string;
  timeSeriesIds: string[];
  reason: ExclusionReason;
  detail: string;
};
export type HourlySeries = {
  kind: "SAMPLE" | "SUM";
  /** UTC hour of the first value; one value per hour. */
  start: string;
  values: (number | null)[];
};

const str = (value: unknown): string | null =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : null;
const decimals = (text: string) => (text.includes(".") ? text.split(".")[1]!.length : 0);
const NUMBER = /^-?\d+(\.\d+)?$/;
/** Exact decimal arithmetic on published values: "50.5" → 505 at 1 decimal. */
const scaled = (text: string, d: number) => {
  const [i, f = ""] = text.replace("-", "").split(".");
  const n = Number(`${i}${f.padEnd(d, "0")}`);
  return text.startsWith("-") ? -n : n;
};
const formatScaled = (n: number, d: number) => {
  const sign = n < 0 ? "-" : "";
  const s = String(Math.abs(n)).padStart(d + 1, "0");
  return d === 0 ? `${sign}${s}` : `${sign}${s.slice(0, -d)}.${s.slice(-d)}`;
};
const qualifierList = (value: unknown): string[] =>
  Array.isArray(value) ? value.map(String) : typeof value === "string" && value ? [value] : [];

function parseValue(raw: unknown): { ok: true; text: string | null } | { ok: false } {
  if (raw === null || raw === undefined || raw === "") return { ok: true, text: null };
  const text = typeof raw === "number" ? String(raw) : typeof raw === "string" ? raw.trim() : "";
  return NUMBER.test(text) ? { ok: true, text } : { ok: false };
}
const inBox = (lat: number, lon: number) =>
  lat >= PR_BOX.minLat && lat <= PR_BOX.maxLat && lon >= PR_BOX.minLon && lon <= PR_BOX.maxLon;

/** Whether points (sorted UTC ms) cover (start, end] with no gap longer than maxGap. */
export function covers(times: number[], start: number, end: number, maxGapMs: number): boolean {
  if (times.length === 0) return false;
  if (times[0]! - start > maxGapMs || end - times[times.length - 1]! > maxGapMs) return false;
  for (let i = 1; i < times.length; i += 1) if (times[i]! - times[i - 1]! > maxGapMs) return false;
  return true;
}

type Point = { time: number; text: string | null };

export function normalizeWater(
  raw: WaterRaw,
  retrievedAt: string,
  municipioIds: Set<string>,
): {
  stations: Station[];
  observations: Observation[];
  exclusions: Exclusion[];
  exclusionCounts: Record<ExclusionReason, number>;
  series: Record<string, HourlySeries> | null;
} {
  const retrieved = Date.parse(retrievedAt);
  if (!Number.isFinite(retrieved)) fail("agua: hora de obtención inválida");
  const activeSince = retrieved - ACTIVE_DAYS * 24 * HOUR;

  // Metadata and sites, by ID.
  const meta = new Map<string, Record<string, unknown>>();
  for (const f of raw.meta) {
    const id = str(f.id) ?? fail("agua: serie sin ID en time-series-metadata");
    if (meta.has(id)) fail(`agua: serie repetida en time-series-metadata (${id})`);
    meta.set(id, f.properties ?? {});
  }
  const sites = new Map<string, Feature>();
  for (const f of raw.locations) {
    const id = str(f.id) ?? fail("agua: sitio sin ID en monitoring-locations");
    if (sites.has(id)) fail(`agua: sitio repetido en monitoring-locations (${id})`);
    sites.set(id, f);
  }

  // Latest observation of every series (required); one record per series.
  type Candidate = {
    tsid: string;
    site: string;
    spec: ParameterSpec;
    p: Record<string, unknown>;
    time: number;
  };
  const seen = new Set<string>();
  const groups = new Map<string, Candidate[]>();
  for (const [i, f] of raw.latest.entries()) {
    const p = f.properties ?? fail(`agua: registro #${i} sin propiedades`);
    const tsid = str(p.time_series_id) ?? fail(`agua: registro #${i} sin serie`);
    if (seen.has(tsid)) fail(`agua: la serie ${tsid} aparece dos veces en latest-continuous`);
    seen.add(tsid);
    const site = str(p.monitoring_location_id) ?? fail(`agua: serie ${tsid} sin sitio`);
    const code = str(p.parameter_code) ?? fail(`agua: serie ${tsid} sin parámetro`);
    const spec = PARAMETER_BY_CODE.get(code) ?? fail(`agua: parámetro no pedido (${code})`);
    const time = Date.parse(isoUtc(p.time, `agua ${tsid} time`) ?? fail(`agua: ${tsid} sin hora`));
    const key = `${site}|${spec.kind === "RESERVOIR_ELEVATION" ? "ELEV" : code}`;
    groups.set(key, [...(groups.get(key) ?? []), { tsid, site, spec, p, time }]);
  }

  const exclusions: Exclusion[] = [];
  const counts = Object.fromEntries(
    [...LISTED, "INACTIVE", "ALTERNATE_DATUM_OR_UNIT"].map((r) => [r, 0]),
  ) as Record<ExclusionReason, number>;
  const exclude = (c: Candidate[], reason: ExclusionReason, detail: string) => {
    counts[reason] += c.length;
    if (LISTED.includes(reason))
      exclusions.push({
        stationId: c[0]!.site,
        parameterCode: c[0]!.spec.code,
        timeSeriesIds: c.map((x) => x.tsid).sort(),
        reason,
        detail,
      });
  };

  // Deterministic series selection per site and parameter.
  const selected: Candidate[] = [];
  for (const [key, unsorted] of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const all = [...unsorted].sort((a, b) => a.tsid.localeCompare(b.tsid));
    const active = all.filter((c) => c.time >= activeSince);
    const inactive = all.filter((c) => c.time < activeSince);
    if (inactive.length) exclude(inactive, "INACTIVE", `sin observaciones en ${ACTIVE_DAYS} días`);
    if (!active.length) continue;
    if (key.endsWith("|ELEV")) {
      const code = ELEVATION_PREFERENCE.find((c) => active.some((x) => x.spec.code === c))!;
      const chosen = active.filter((x) => x.spec.code === code);
      const others = active.filter((x) => x.spec.code !== code);
      if (others.length)
        exclude(
          others,
          "ALTERNATE_DATUM_OR_UNIT",
          `misma superficie publicada en otro datum o unidad; se usa ${code}`,
        );
      if (chosen.length > 1) {
        exclude(
          chosen,
          "AMBIGUOUS_DUPLICATE",
          `${chosen.length} series activas del parámetro ${code} con valores ${chosen.map((x) => String(x.p.value)).join(" y ")}; no se elige una`,
        );
        continue;
      }
      selected.push(chosen[0]!);
    } else if (active.length > 1) {
      exclude(
        active,
        "AMBIGUOUS_DUPLICATE",
        `${active.length} series activas del parámetro ${active[0]!.spec.code} en el mismo sitio; no se elige una`,
      );
    } else selected.push(active[0]!);
  }

  const stations = new Map<string, Station>();
  const observations: Observation[] = [];
  for (const c of selected) {
    const one = [c];
    if (!/^USGS-\d{8,15}$/.test(c.site)) {
      exclude(one, "NOT_USGS", "el sitio no es de la agencia USGS");
      continue;
    }
    const m = meta.get(c.tsid);
    if (!m) {
      exclude(one, "NO_METADATA", "la serie no aparece en time-series-metadata");
      continue;
    }
    const unit = str(c.p.unit_of_measure);
    const mismatch =
      str(m.parameter_code) !== c.spec.code
        ? "parámetro"
        : unit !== c.spec.unit || str(m.unit_of_measure) !== c.spec.unit
          ? `unidad (${unit ?? "sin unidad"})`
          : (str(c.p.statistic_id) ?? null) !== c.spec.statisticId ||
              (str(m.statistic_id) ?? null) !== c.spec.statisticId
            ? `estadístico (${String(c.p.statistic_id)})`
            : str(m.computation_identifier) !== c.spec.computation
              ? `cómputo (${String(m.computation_identifier)})`
              : str(m.computation_period_identifier) !== "Points"
                ? `periodo (${String(m.computation_period_identifier)})`
                : null;
    if (mismatch) {
      exclude(one, "METADATA_MISMATCH", `la serie no tiene el significado esperado: ${mismatch}`);
      continue;
    }
    const site = sites.get(c.site);
    const sp = site?.properties;
    if (!site || !sp) {
      exclude(one, "NO_SITE_METADATA", "el sitio no aparece en monitoring-locations");
      continue;
    }
    const typeCode = str(sp.site_type_code) ?? "";
    const view: WaterView | null =
      c.spec.kind === "PRECIPITATION"
        ? "LLUVIA"
        : c.spec.kind === "RESERVOIR_ELEVATION"
          ? RESERVOIR_SITE_TYPES.includes(typeCode)
            ? "EMBALSES"
            : null
          : RIVER_SITE_TYPES.includes(typeCode)
            ? "RIOS"
            : c.spec.kind === "GAGE_HEIGHT" && RESERVOIR_SITE_TYPES.includes(typeCode)
              ? "EMBALSES"
              : null;
    if (!view) {
      exclude(
        one,
        "SITE_TYPE_OUT_OF_SCOPE",
        `tipo de sitio ${typeCode} (${str(sp.site_type) ?? "?"}) fuera de esta vista`,
      );
      continue;
    }
    const coords = site.geometry?.coordinates;
    const lon = Array.isArray(coords) ? Number(coords[0]) : NaN;
    const lat = Array.isArray(coords) ? Number(coords[1]) : NaN;
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !inBox(lat, lon)) {
      exclude(one, "INVALID_COORDINATES", "coordenadas fuera de Puerto Rico o ausentes");
      continue;
    }
    const parsed = parseValue(c.p.value);
    if (!parsed.ok) {
      exclude(one, "INVALID_VALUE", `valor no numérico (${String(c.p.value)})`);
      continue;
    }
    if (c.time > retrieved + SKEW_MS) {
      exclude(one, "FUTURE_OBSERVATION", "observación con hora posterior a la obtención");
      continue;
    }
    const approval = str(c.p.approval_status);
    if (approval !== "Provisional" && approval !== "Approved") {
      exclude(one, "METADATA_MISMATCH", `estado de aprobación desconocido (${String(approval)})`);
      continue;
    }
    if (!stations.has(c.site)) {
      const county = str(sp.county_code);
      const fips = str(sp.state_code) === "72" && county ? `72${county}` : null;
      stations.set(c.site, {
        id: c.site,
        name: str(sp.monitoring_location_name) ?? c.site,
        siteTypeCode: typeCode,
        siteType: str(sp.site_type) ?? typeCode,
        latitude: lat,
        longitude: lon,
        municipio: fips && municipioIds.has(fips) ? fips : null,
        countyName: str(sp.county_name),
        url: siteUrl(c.site),
      });
    }
    const value = parsed.text === null ? null : Number(parsed.text);
    const flags: string[] = [];
    if (value !== null && value < 0 && c.spec.kind === "PRECIPITATION")
      flags.push("NEGATIVE_PRECIPITATION");
    if (value !== null && value < 0 && c.spec.kind === "DISCHARGE")
      flags.push("NEGATIVE_DISCHARGE");
    observations.push({
      stationId: c.site,
      timeSeriesId: c.tsid,
      view,
      parameterCode: c.spec.code,
      kind: c.spec.kind,
      datum: c.spec.datum,
      unit: c.spec.unit,
      statisticId: c.spec.statisticId,
      computation: c.spec.computation,
      observedAt: new Date(c.time).toISOString(),
      value,
      valueText: parsed.text,
      approval,
      qualifiers: qualifierList(c.p.qualifier),
      flags,
      trend: null,
      rain24h: null,
    });
  }

  // 24-hour context from the optional continuous request.
  let series: Record<string, HourlySeries> | null = null;
  if (raw.continuous) {
    series = {};
    const wanted = new Set(observations.map((o) => o.timeSeriesId));
    const points = new Map<string, Point[]>();
    for (const f of raw.continuous) {
      const p = f.properties ?? {};
      const tsid = str(p.time_series_id);
      if (!tsid || !wanted.has(tsid)) continue;
      const iso = isoUtc(p.time, `agua ${tsid} serie`);
      const parsed = parseValue(p.value);
      if (!iso || !parsed.ok) fail(`agua: punto inválido en la serie ${tsid}`);
      points.set(tsid, [
        ...(points.get(tsid) ?? []),
        { time: Date.parse(iso!), text: parsed.ok ? parsed.text : null },
      ]);
    }
    const lastHour = Math.floor(retrieved / HOUR) * HOUR;
    const firstHour = lastHour - (SERIES_HOURS - 1) * HOUR;
    for (const o of observations) {
      const pts = (points.get(o.timeSeriesId) ?? []).sort((a, b) => a.time - b.time);
      if (new Set(pts.map((x) => x.time)).size !== pts.length) continue; // duplicate instants: no series, no trend
      if (pts.some((x) => x.time > retrieved + SKEW_MS)) continue;
      const at = new Map(pts.map((x) => [x.time, x.text]));
      const observed = Date.parse(o.observedAt);
      if (o.kind === "PRECIPITATION") {
        const hourly: (number | null)[] = [];
        for (let h = firstHour; h <= lastHour; h += HOUR) {
          const inHour = pts.filter((x) => x.time > h - HOUR && x.time <= h);
          const ok =
            inHour.every((x) => x.text !== null) &&
            covers(
              inHour.map((x) => x.time),
              h - HOUR,
              h,
              RAIN_MAX_GAP_MINUTES * 60_000,
            );
          const hd = Math.max(2, ...inHour.map((x) => (x.text ? decimals(x.text) : 0)));
          hourly.push(
            ok
              ? Number(
                  formatScaled(
                    inHour.reduce((s, x) => s + scaled(x.text!, hd), 0),
                    hd,
                  ),
                )
              : null,
          );
        }
        series[o.timeSeriesId] = {
          kind: "SUM",
          start: new Date(firstHour).toISOString(),
          values: hourly,
        };
        const from = observed - 24 * HOUR;
        const inDay = pts.filter((x) => x.time > from && x.time <= observed);
        const complete =
          inDay.every((x) => x.text !== null) &&
          covers(
            inDay.map((x) => x.time),
            from,
            observed,
            RAIN_MAX_GAP_MINUTES * 60_000,
          );
        const d = Math.max(2, ...inDay.filter((x) => x.text).map((x) => decimals(x.text!)));
        o.rain24h = {
          from: new Date(from).toISOString(),
          to: o.observedAt,
          totalText: complete
            ? formatScaled(
                inDay.reduce((s, x) => s + scaled(x.text!, d), 0),
                d,
              )
            : null,
          complete,
          points: inDay.length,
        };
      } else {
        const hourly: (number | null)[] = [];
        for (let h = firstHour; h <= lastHour; h += HOUR) {
          const t = at.get(h);
          hourly.push(t === undefined || t === null ? null : Number(t));
        }
        series[o.timeSeriesId] = {
          kind: "SAMPLE",
          start: new Date(firstHour).toISOString(),
          values: hourly,
        };
        const fromAt = observed - TREND_HOURS * HOUR;
        const fromText = at.get(fromAt);
        if (o.valueText !== null && fromText) {
          const d = Math.max(decimals(o.valueText), decimals(fromText));
          const delta = scaled(o.valueText, d) - scaled(fromText, d);
          o.trend = {
            hours: TREND_HOURS,
            fromAt: new Date(fromAt).toISOString(),
            fromValueText: fromText,
            deltaText: formatScaled(delta, d),
            direction: delta > 0 ? "UP" : delta < 0 ? "DOWN" : "SAME",
          };
        }
      }
    }
  }

  const viewOrder: WaterView[] = ["RIOS", "LLUVIA", "EMBALSES"];
  observations.sort(
    (a, b) =>
      viewOrder.indexOf(a.view) - viewOrder.indexOf(b.view) ||
      a.stationId.localeCompare(b.stationId) ||
      a.parameterCode.localeCompare(b.parameterCode),
  );
  exclusions.sort(
    (a, b) =>
      a.reason.localeCompare(b.reason) ||
      a.stationId.localeCompare(b.stationId) ||
      a.parameterCode.localeCompare(b.parameterCode),
  );
  for (const o of observations)
    if (Object.keys(o).join() !== OBSERVATION_FIELDS.join())
      fail(`agua ${o.timeSeriesId}: campos fuera de la lista permitida`);
  const stationList = [...stations.values()].sort((a, b) => a.id.localeCompare(b.id));
  for (const s of stationList)
    if (Object.keys(s).join() !== STATION_FIELDS.join())
      fail(`agua ${s.id}: campos fuera de la lista permitida`);
  const sortedSeries = series
    ? Object.fromEntries(Object.entries(series).sort(([a], [b]) => a.localeCompare(b)))
    : null;
  return {
    stations: stationList,
    observations,
    exclusions,
    exclusionCounts: counts,
    series: sortedSeries,
  };
}

// ---------------------------------------------------------------------------
// Snapshot

export type Attempt = { at: string; ok: boolean; error: string | null };
export type RequestRecord = {
  name: "latest" | "meta" | "locations" | "continuous";
  page: number;
  url: string;
  sha256: string;
  bytes: number;
  required: boolean;
};
export type ViewCounts = Record<StationState, number>;
export type WaterData = {
  siteInventory: {
    stations: Station[];
    byView: Record<WaterView, number>;
  };
  observations: Observation[];
  exclusions: { counts: Record<ExclusionReason, number>; listed: Exclusion[] };
};
export type WaterSnapshot = {
  schemaVersion: number;
  source: typeof WATER;
  generated: string;
  /** Last successful retrieval (UTC). Null only if there has never been one. */
  retrievedAt: string | null;
  lastAttempt: Attempt;
  sourceFreshness: { currentMinutes: number; staleMinutes: number };
  stationFreshness: {
    currentMinutes: number;
    staleMinutes: number;
    basis: string;
    atRetrieval: Record<WaterView, ViewCounts>;
  };
  provenance: {
    requests: RequestRecord[];
    series: "OK" | "UNAVAILABLE";
    note: string;
  };
  rules: {
    activeDays: number;
    elevationPreference: string[];
    riverSiteTypes: string[];
    reservoirSiteTypes: string[];
    trendHours: number;
    seriesHours: number;
    rainMaxGapMinutes: number;
  };
  data: WaterData;
  contentSha256: string;
};
export type SeriesFile = {
  schemaVersion: number;
  generated: string;
  retrievedAt: string | null;
  snapshotContentSha256: string;
  hours: number;
  series: Record<string, HourlySeries>;
  contentSha256: string;
};

const VIEWS: WaterView[] = ["RIOS", "LLUVIA", "EMBALSES"];

/**
 * Freshness counts per view, one per published series (a station with flow
 * and gage height counts twice), so a series with no value is never hidden
 * behind another series at the same station.
 */
export function countStates(observations: Observation[], at: Date): Record<WaterView, ViewCounts> {
  const out = Object.fromEntries(
    VIEWS.map((v) => [v, { CURRENT: 0, AGING: 0, STALE: 0, NO_DATA: 0 }]),
  ) as Record<WaterView, ViewCounts>;
  for (const o of observations) out[o.view][stationState(o, at, STATION_FRESHNESS)] += 1;
  return out;
}

export function waterSnapshot(args: {
  retrievedAt: string | null;
  lastAttempt: Attempt;
  requests: RequestRecord[];
  seriesOk: boolean;
  data: WaterData;
}): WaterSnapshot {
  return {
    schemaVersion: WATER_SCHEMA_VERSION,
    source: { ...WATER },
    generated: "GENERADO por scripts/water/update.ts. NO EDITAR A MANO.",
    retrievedAt: args.retrievedAt,
    lastAttempt: args.lastAttempt,
    sourceFreshness: { ...WATER_FRESHNESS },
    stationFreshness: {
      ...STATION_FRESHNESS,
      basis:
        "Por serie publicada: minutos desde la observación más reciente de esa serie (no desde la obtención). Sin valor publicado: NO_DATA.",
      atRetrieval: args.retrievedAt
        ? countStates(args.data.observations, new Date(args.retrievedAt))
        : countStates([], new Date(0)),
    },
    provenance: {
      requests: args.requests,
      series: args.seriesOk ? "OK" : "UNAVAILABLE",
      note: "Respuestas exactas solo en la copia local (.cache/live/raw). Requeridas: latest-continuous, time-series-metadata y monitoring-locations. Opcional: continuous (24 horas); si falla, se publican los valores actuales sin series ni tendencias.",
    },
    rules: {
      activeDays: ACTIVE_DAYS,
      elevationPreference: [...ELEVATION_PREFERENCE],
      riverSiteTypes: [...RIVER_SITE_TYPES],
      reservoirSiteTypes: [...RESERVOIR_SITE_TYPES],
      trendHours: TREND_HOURS,
      seriesHours: SERIES_HOURS,
      rainMaxGapMinutes: RAIN_MAX_GAP_MINUTES,
    },
    data: args.data,
    contentSha256: contentHash(args.data),
  };
}

export function buildData(n: ReturnType<typeof normalizeWater>): WaterData {
  const byView = Object.fromEntries(
    VIEWS.map((v) => [
      v,
      new Set(n.observations.filter((o) => o.view === v).map((o) => o.stationId)).size,
    ]),
  ) as Record<WaterView, number>;
  return {
    siteInventory: { stations: n.stations, byView },
    observations: n.observations,
    exclusions: { counts: n.exclusionCounts, listed: n.exclusions },
  };
}

export const EMPTY_DATA: WaterData = {
  siteInventory: { stations: [], byView: { RIOS: 0, LLUVIA: 0, EMBALSES: 0 } },
  observations: [],
  exclusions: {
    counts: Object.fromEntries(
      [...LISTED, "INACTIVE", "ALTERNATE_DATUM_OR_UNIT"].map((r) => [r, 0]),
    ) as Record<ExclusionReason, number>,
    listed: [],
  },
};

export function seriesFile(
  snapshot: WaterSnapshot,
  series: Record<string, HourlySeries>,
): SeriesFile {
  const sorted = Object.fromEntries(Object.entries(series).sort(([a], [b]) => a.localeCompare(b)));
  return {
    schemaVersion: WATER_SCHEMA_VERSION,
    generated: "GENERADO por scripts/water/update.ts. NO EDITAR A MANO.",
    retrievedAt: snapshot.retrievedAt,
    snapshotContentSha256: snapshot.contentSha256,
    hours: SERIES_HOURS,
    series: sorted,
    contentSha256: contentHash(sorted),
  };
}

/**
 * After a failed required request, the last known good snapshot keeps its
 * data and retrieval time; only the attempt is recorded. Never zero stations,
 * zero rain or zero flow.
 */
export function recordWaterFailure(
  previous: WaterSnapshot | null,
  attempt: Attempt,
): WaterSnapshot {
  if (attempt.ok) fail("recordWaterFailure: el intento no falló");
  if (previous && previous.retrievedAt) {
    const kept = waterSnapshot({
      retrievedAt: previous.retrievedAt,
      lastAttempt: attempt,
      requests: previous.provenance.requests,
      seriesOk: previous.provenance.series === "OK",
      data: previous.data,
    });
    return kept;
  }
  return waterSnapshot({
    retrievedAt: null,
    lastAttempt: attempt,
    requests: [],
    seriesOk: false,
    data: EMPTY_DATA,
  });
}

/** One record per line; identical inputs give identical bytes. */
export function stableWaterJson(s: WaterSnapshot): string {
  const { data, ...rest } = s;
  const rows = (list: unknown[]) =>
    list.length === 0 ? "[]" : `[\n${list.map((r) => "  " + JSON.stringify(r)).join(",\n")}\n ]`;
  const head = JSON.stringify(
    {
      ...rest,
      data: {
        siteInventory: { stations: "@@STATIONS@@", byView: data.siteInventory.byView },
        observations: "@@OBS@@",
        exclusions: { counts: data.exclusions.counts, listed: "@@EXCL@@" },
      },
    },
    null,
    1,
  );
  return (
    head
      .replace('"@@STATIONS@@"', rows(data.siteInventory.stations))
      .replace('"@@OBS@@"', rows(data.observations))
      .replace('"@@EXCL@@"', rows(data.exclusions.listed)) + "\n"
  );
}
export function stableSeriesJson(f: SeriesFile): string {
  const { series, ...rest } = f;
  const entries = Object.entries(series);
  const head = JSON.stringify({ ...rest, series: "@@SERIES@@" }, null, 1);
  const body =
    entries.length === 0
      ? "{}"
      : `{\n${entries.map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(",\n")}\n }`;
  return head.replace('"@@SERIES@@"', body) + "\n";
}
