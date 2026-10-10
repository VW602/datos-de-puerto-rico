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
import { stationState, type StationState } from "./waterModel";

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
  measures: { obs: Observation; state: StationState }[];
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
    row.measures.push({ obs, state: stationState(obs, now, s.stationFreshness) });
    rows.set(station.id, row);
  }
  return [...rows.values()].sort(
    (a, b) =>
      (a.municipio ?? "~").localeCompare(b.municipio ?? "~", "es") ||
      a.station.name.localeCompare(b.station.name, "es"),
  );
}

export type KindCounts = { reporting: number; stale: number; noData: number; total: number };

/** Per measure kind in a view: how many series report now, stopped reporting, or have no value. */
export function viewCounts(
  s: WaterSnapshot,
  view: WaterView,
  now: Date,
): Partial<Record<Observation["kind"], KindCounts>> {
  const out: Partial<Record<Observation["kind"], KindCounts>> = {};
  for (const obs of s.data.observations) {
    if (obs.view !== view) continue;
    const c = (out[obs.kind] ??= { reporting: 0, stale: 0, noData: 0, total: 0 });
    const state = stationState(obs, now, s.stationFreshness);
    c.total += 1;
    if (state === "CURRENT" || state === "AGING") c.reporting += 1;
    else if (state === "STALE") c.stale += 1;
    else c.noData += 1;
  }
  return out;
}

/**
 * What the water block may say. Station values are shown as "now" only from
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
