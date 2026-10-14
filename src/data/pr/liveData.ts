/**
 * Live data read layer: the checks a stored live value must pass before the
 * site prefers it over the copy built into the site, and the same-origin
 * routes the page reads. Shared by the /live/* routes (src/server) and the
 * page. Read-only: nothing here writes anywhere.
 *
 * Values are fully validated before they are stored (scripts/live and
 * scripts/water); these checks are the cheap guard on the way out: shape,
 * schema version, source identity, thresholds and a content hash present.
 */
import { FRESHNESS, LIVE_SCHEMA_VERSION, NWS, USGS } from "../../../scripts/live/source.ts";
import {
  SERIES_FRESHNESS,
  WATER,
  WATER_FRESHNESS,
  WATER_SCHEMA_VERSION,
} from "../../../scripts/water/source.ts";
import type { NwsSnapshot, UsgsSnapshot } from "./current";
import type { SeriesFile, WaterSnapshot } from "./water";

/** Keys in the LIVE_DATA KV namespace. */
export const LIVE_KEYS = {
  nws: "live:nws",
  earthquakes: "live:earthquakes",
  /** Water snapshot and its 24-hour series, stored together so they always match. */
  water: "live:water",
} as const;

/** Same-origin routes the page reads; the browser never calls NWS, USGS or GitHub. */
export const LIVE_ROUTES = {
  nws: "/live/nws.json",
  earthquakes: "/live/usgs.json",
  water: "/live/water.json",
  waterSeries: "/live/water-series.json",
  status: "/live/status.json",
} as const;

export type WaterBundle = { snapshot: WaterSnapshot; series: SeriesFile };

type Obj = Record<string, unknown>;
type Thresholds = { currentMinutes: number; staleMinutes: number };
const HEX64 = /^[0-9a-f]{64}$/;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const isTime = (v: unknown): v is string => typeof v === "string" && Number.isFinite(Date.parse(v));
const isHash = (v: unknown) => typeof v === "string" && HEX64.test(v);
const sameThresholds = (v: unknown, t: Thresholds) =>
  isObj(v) && v.currentMinutes === t.currentMinutes && v.staleMinutes === t.staleMinutes;

/** Fields every stored snapshot needs: schema, source identity, a retrieval time and a content hash. */
function snapshotBase(
  v: unknown,
  schemaVersion: number,
  endpoint: string,
): v is Obj & { data: Obj } {
  return (
    isObj(v) &&
    v.schemaVersion === schemaVersion &&
    isObj(v.source) &&
    v.source.endpoint === endpoint &&
    isTime(v.retrievedAt) &&
    isHash(v.contentSha256) &&
    isObj(v.lastAttempt) &&
    isObj(v.data)
  );
}

export function isNwsSnapshot(v: unknown): v is NwsSnapshot {
  return (
    snapshotBase(v, LIVE_SCHEMA_VERSION, NWS.endpoint) &&
    sameThresholds(v.freshness, FRESHNESS.nws) &&
    Array.isArray(v.data.alerts)
  );
}

export function isUsgsSnapshot(v: unknown): v is UsgsSnapshot {
  return (
    snapshotBase(v, LIVE_SCHEMA_VERSION, USGS.endpoint) &&
    sameThresholds(v.freshness, FRESHNESS.usgs) &&
    isObj(v.region) &&
    Array.isArray(v.data.events)
  );
}

export function isWaterSnapshot(v: unknown): v is WaterSnapshot {
  return (
    snapshotBase(v, WATER_SCHEMA_VERSION, WATER.endpoint) &&
    sameThresholds(v.sourceFreshness, WATER_FRESHNESS) &&
    sameThresholds(v.seriesFreshness, SERIES_FRESHNESS) &&
    isObj(v.data.siteInventory) &&
    Array.isArray(v.data.observations)
  );
}

export function isWaterSeries(v: unknown): v is SeriesFile {
  return (
    isObj(v) &&
    v.schemaVersion === WATER_SCHEMA_VERSION &&
    isTime(v.retrievedAt) &&
    isHash(v.snapshotContentSha256) &&
    isHash(v.contentSha256) &&
    isObj(v.series)
  );
}

/** A stored water value: snapshot and series from the same retrieval. */
export function isWaterBundle(v: unknown): v is WaterBundle {
  return (
    isObj(v) &&
    isWaterSnapshot(v.snapshot) &&
    isWaterSeries(v.series) &&
    v.series.snapshotContentSha256 === v.snapshot.contentSha256 &&
    v.series.retrievedAt === v.snapshot.retrievedAt
  );
}

/** Whether `a` was retrieved strictly later than `b` (a missing time is never newer). */
export function isNewer(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!isTime(a)) return false;
  if (!isTime(b)) return true;
  return Date.parse(a) > Date.parse(b);
}

/**
 * Reads one same-origin live route in the browser. Any failure (network,
 * status, JSON, shape) gives null, and the caller keeps the copy it has.
 */
export async function readLiveRoute<T>(
  path: (typeof LIVE_ROUTES)[keyof typeof LIVE_ROUTES],
  check: (v: unknown) => v is T,
): Promise<T | null> {
  try {
    const response = await fetch(path, { headers: { accept: "application/json" } });
    if (!response.ok) return null;
    const value: unknown = await response.json();
    return check(value) ? value : null;
  } catch {
    return null;
  }
}
