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

export const SERIES_STATE_ES: Record<SeriesState, string> = {
  CURRENT: "Dato reciente",
  AGING: "Dato de hace unas horas",
  STALE: "Sin dato reciente",
  NO_DATA: "Sin dato",
};

/** Units as USGS publishes them, with a reader-friendly Spanish name. No conversion. */
export const UNIT_ES: Record<string, { name: string; symbol: string }> = {
  "ft^3/s": { name: "pies cúbicos por segundo", symbol: "ft³/s" },
  ft: { name: "pies", symbol: "ft" },
  m: { name: "metros", symbol: "m" },
  in: { name: "pulgadas", symbol: "in" },
};
export const unitSymbol = (unit: string) => UNIT_ES[unit]?.symbol ?? unit;
export const unitName = (unit: string) => UNIT_ES[unit]?.name ?? unit;

/**
 * What each measure is called, faithful to the USGS parameter names. Gage
 * height is the water level read at the gage against the gage's own datum: it
 * is not the depth of the river and not a flood level.
 */
export const KIND_ES = {
  DISCHARGE: "Caudal",
  GAGE_HEIGHT: "Altura del medidor",
  PRECIPITATION: "Lluvia",
  RESERVOIR_ELEVATION: "Elevación del agua",
} as const;

export const DATUM_ES: Record<string, string> = {
  PRVD02: "sobre el Datum Vertical de Puerto Rico de 2002 (PRVD02)",
  LMSL: "sobre el nivel medio local del mar (LMSL)",
  NGVD29: "sobre el Datum Vertical Geodésico Nacional de 1929 (NGVD 29)",
};

/** USGS data qualifiers, translated; an unknown code is shown as published. */
export const QUALIFIER_ES: Record<string, string> = {
  DRY: "seco (USGS)",
  ESTIMATED: "estimado",
  RATINGDEV: "curva de caudal en desarrollo (USGS no publica caudal)",
  UNAVAIL: "no disponible",
  DISCONTINUED: "estación descontinuada",
  ICE: "hielo",
  EQUIP: "falla de equipo",
  FLOOD: "dañado por crecida",
  MAINT: "en mantenimiento",
  BKW: "efecto de remanso",
  ZFL: "flujo cero",
};
export const qualifierEs = (q: string) => QUALIFIER_ES[q] ?? q;

export const APPROVAL_ES = {
  Provisional: "Provisional",
  Approved: "Aprobado",
} as const;

export const TREND_ES = { UP: "subiendo", DOWN: "bajando", SAME: "sin cambio" } as const;

/**
 * Where a station is. A municipio from USGS site metadata says where the gage
 * stands, not what conditions are like across that municipio.
 */
export function stationPlace(municipioName: string | null): string {
  return municipioName
    ? `Estación ubicada en ${municipioName}`
    : "Estación sin municipio en los datos del USGS";
}

/** "50.5 ft³/s". Zero stays "0.00"; no value is "sin dato", never 0. */
export function valueWithUnit(valueText: string | null, unit: string): string {
  return valueText === null ? "sin dato" : `${valueText} ${unitSymbol(unit)}`;
}
