/**
 * Water-conditions rules shared by the site and the update scripts. Pure: no
 * network, no Node APIs.
 *
 * Two different things are counted, never mixed:
 *   STATION  a physical USGS monitoring location (one site ID, one map point)
 *   SERIES   one selected measurement time series at a station ("medición":
 *            discharge, gage height, rain or reservoir elevation). One station
 *            can have several, e.g. discharge and gage height: 1 station, 2 series.
 *
 * And two different freshness ideas, never mixed:
 *   SOURCE  how old the saved snapshot is (CURRENT, AGING, STALE, UNAVAILABLE;
 *           see currentModel.ts)
 *   SERIES  how old one series' own latest observation is:
 *     CURRENT  observed recently
 *     AGING    a few hours old
 *     STALE    the series stopped reporting recently
 *     NO_DATA  USGS publishes no value for its latest time
 * Freshness is per series on purpose: a current measurement at a station must
 * not hide a stale or missing one at the same station. A series' state comes
 * from its own observation time, never from the time the snapshot was retrieved.
 */

import { WATER_MESSAGES } from "../../i18n/messages/water.ts";

export type SeriesState = "CURRENT" | "AGING" | "STALE" | "NO_DATA";
export type SeriesThresholds = { currentMinutes: number; staleMinutes: number };

export function seriesState(
  obs: { observedAt: string; value: number | null },
  now: Date,
  t: SeriesThresholds,
): SeriesState {
  if (obs.value === null) return "NO_DATA";
  const age = (now.getTime() - Date.parse(obs.observedAt)) / 60000;
  if (!Number.isFinite(age)) return "NO_DATA";
  if (age <= t.currentMinutes) return "CURRENT";
  if (age <= t.staleMinutes) return "AGING";
  return "STALE";
}

/** Reader-facing wording lives in src/i18n/messages/water.ts; these are the Spanish originals. */
const ES = WATER_MESSAGES.es;
export const SERIES_STATE_ES: Record<SeriesState, string> = ES.seriesState;

/** Units as USGS publishes them, with a reader-friendly name. No conversion. */
const UNIT_SYMBOL: Record<string, string> = { "ft^3/s": "ft³/s", ft: "ft", m: "m", in: "in" };
export const UNIT_ES: Record<string, { name: string; symbol: string }> = Object.fromEntries(
  Object.entries(UNIT_SYMBOL).map(([unit, symbol]) => [unit, { name: ES.units[unit]!, symbol }]),
);
export const unitSymbol = (unit: string) => UNIT_SYMBOL[unit] ?? unit;
export const unitName = (unit: string) => ES.units[unit] ?? unit;

/**
 * What each measure is called, faithful to the USGS parameter names. Gage
 * height is the water level read at the gage against the gage's own datum: it
 * is not the depth of the river and not a flood level.
 */
export const KIND_ES = ES.kinds;
export const DATUM_ES: Record<string, string> = ES.datums;

/** USGS data qualifiers, translated; an unknown code is shown as published. */
export const QUALIFIER_ES: Record<string, string> = ES.qualifiers;
export const qualifierEs = (q: string) => QUALIFIER_ES[q] ?? q;

export const APPROVAL_ES = ES.approval;
export const TREND_ES = ES.trend;

/**
 * Where a station is. A municipio from USGS site metadata says where the gage
 * stands, not what conditions are like across that municipio.
 */
export function stationPlace(municipioName: string | null): string {
  return municipioName ? ES.stationIn(municipioName) : ES.stationNoMunicipio;
}

/** "50.5 ft³/s". Zero stays "0.00"; no value is "sin dato", never 0. */
export function valueWithUnit(valueText: string | null, unit: string): string {
  return valueText === null ? ES.noValue : `${valueText} ${unitSymbol(unit)}`;
}
