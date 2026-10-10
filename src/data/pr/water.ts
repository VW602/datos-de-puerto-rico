/**
 * Current water conditions for "Ahora en Puerto Rico" › "Agua ahora": the
 * validated snapshot written by scripts/water/update.ts. The site never calls
 * USGS. Both files are loaded on demand (the snapshot when the panel mounts,
 * the 24-hour series when the reader opens the water view), so they stay out
 * of the page's initial bundle.
 */
import type {
  HourlySeries,
  Observation,
  SeriesFile,
  Station,
  WaterSnapshot,
} from "../../../scripts/water/normalize.ts";
import type { WaterView } from "../../../scripts/water/source.ts";
import { canSpeakForNow, freshness, type Freshness } from "./currentModel";
import { municipioName } from "./current";
import { seriesState, type SeriesState } from "./waterModel";

export type { HourlySeries, Observation, SeriesFile, Station, WaterSnapshot, WaterView };

export const loadWater = (): Promise<WaterSnapshot> =>
  import("../../../data/current/usgs-water.json").then(
    (m) => m.default as unknown as WaterSnapshot,
  );
export const loadWaterSeries = (): Promise<SeriesFile> =>
  import("../../../data/current/usgs-water-series.json").then(
    (m) => m.default as unknown as SeriesFile,
  );

export const VIEW_ES: Record<WaterView, string> = {
  RIOS: "Ríos y canales",
  LLUVIA: "Lluvia",
  EMBALSES: "Embalses y lagos",
};

/** Snapshot freshness, the same four states as alerts and earthquakes. */
export const waterFreshness = (s: WaterSnapshot, now: Date): Freshness =>
  freshness(s.retrievedAt, now, s.sourceFreshness);

/** One station's row in a view: its measures there, each with its own state. */
export type StationRow = {
  station: Station;
  municipio: string | null;
  measures: { obs: Observation; state: SeriesState }[];
};

/** Stations of a view, by municipio and then by name; each measure keeps its own state. */
export function viewRows(s: WaterSnapshot, view: WaterView, now: Date): StationRow[] {
  const byId = new Map(s.data.siteInventory.stations.map((st) => [st.id, st]));
  const rows = new Map<string, StationRow>();
  for (const obs of s.data.observations) {
    if (obs.view !== view) continue;
    const station = byId.get(obs.stationId);
    if (!station) continue;
    const row = rows.get(station.id) ?? {
      station,
      municipio: station.municipio ? municipioName(station.municipio) : null,
      measures: [],
    };
    row.measures.push({ obs, state: seriesState(obs, now, s.seriesFreshness) });
    rows.set(station.id, row);
  }
  return [...rows.values()].sort(
    (a, b) =>
      (a.municipio ?? "~").localeCompare(b.municipio ?? "~", "es") ||
      a.station.name.localeCompare(b.station.name, "es"),
  );
}

/** Freshness tally of measurement series (not stations). */
export type SeriesCounts = {
  reporting: number;
  stale: number;
  noData: number;
  seriesCount: number;
};
const emptyCounts = (): SeriesCounts => ({ reporting: 0, stale: 0, noData: 0, seriesCount: 0 });
function tally(c: SeriesCounts, state: SeriesState) {
  c.seriesCount += 1;
  if (state === "CURRENT" || state === "AGING") c.reporting += 1;
  else if (state === "STALE") c.stale += 1;
  else c.noData += 1;
}

/** Unique monitoring locations (site IDs) with at least one series in a view. */
export function stationCount(s: WaterSnapshot, view: WaterView): number {
  return new Set(s.data.observations.filter((o) => o.view === view).map((o) => o.stationId)).size;
}

/** Measurement series in a view (a station with discharge and gage height counts twice). */
export function seriesCount(s: WaterSnapshot, view: WaterView): number {
  return s.data.observations.filter((o) => o.view === view).length;
}

/** Per measure kind in a view: how many series report now, stopped reporting, or have no value. */
export function seriesCountsByKind(
  s: WaterSnapshot,
  view: WaterView,
  now: Date,
): Partial<Record<Observation["kind"], SeriesCounts>> {
  const out: Partial<Record<Observation["kind"], SeriesCounts>> = {};
  for (const obs of s.data.observations)
    if (obs.view === view)
      tally((out[obs.kind] ??= emptyCounts()), seriesState(obs, now, s.seriesFreshness));
  return out;
}

/** A view at a glance: stations and series counted separately; freshness per series. */
export type ViewSummary = { stationCount: number; series: SeriesCounts };
export function viewSummary(s: WaterSnapshot, view: WaterView, now: Date): ViewSummary {
  const series = emptyCounts();
  for (const obs of s.data.observations)
    if (obs.view === view) tally(series, seriesState(obs, now, s.seriesFreshness));
  return { stationCount: stationCount(s, view), series };
}

/**
 * The state of one station's map point, from all its series in the view:
 * every series current → CURRENT; no series with a value → NO_DATA; anything
 * else (some series stale or without value) → STALE. A current series never
 * hides a stale or missing one at the same station.
 */
export function stationMarkerState(row: StationRow): SeriesState {
  const states = row.measures.map((m) => m.state);
  if (states.every((x) => x === "CURRENT" || x === "AGING")) return "CURRENT";
  if (states.every((x) => x === "NO_DATA")) return "NO_DATA";
  return "STALE";
}

/**
 * What the water block may say. Measurements are shown as "now" only from
 * a CURRENT or AGING snapshot; otherwise they are the last saved values, with
 * their times, and the block says so.
 */
export type WaterStatus = { kind: "UNCONFIRMED" | "CURRENT"; source: Freshness };
export function waterStatus(s: WaterSnapshot, now: Date): WaterStatus {
  const source = waterFreshness(s, now);
  return { kind: canSpeakForNow(source) ? "CURRENT" : "UNCONFIRMED", source };
}

export const hourlyFor = (series: SeriesFile | null, tsid: string): HourlySeries | null =>
  series?.series[tsid] ?? null;
