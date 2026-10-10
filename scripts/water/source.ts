/**
 * Current water conditions: USGS Water Data for the Nation, through the
 * modernized Water Data OGC APIs (api.waterdata.usgs.gov/ogcapi/v1). Shared
 * by update (network) and check (offline).
 *
 * Why this API: USGS says the modernized Water Data APIs supersede the legacy
 * WaterServices (waterservices.usgs.gov, including the old instantaneous
 * values service), which USGS is degrading from November 16, 2026 and
 * decommissioning on February 22, 2027. V1 of the OGC APIs was announced on
 * September 4, 2026; V0 requests will be redirected to V1 in mid-2027.
 *
 * Architecture, as for alerts and earthquakes: source → updater → validated
 * snapshot (data/current/usgs-water*.json) → website. The browser never calls
 * USGS and the build never fetches. Exact responses stay in the git-ignored
 * cache (.cache/live/raw).
 */

/** 2: the per-series freshness block is named `seriesFreshness` (it was `stationFreshness`). */
export const WATER_SCHEMA_VERSION = 2;
export const WATER_OUTPUT = "data/current/usgs-water.json";
/** 24-hour hourly series, loaded by the page only when the reader opens the water view. */
export const WATER_SERIES_OUTPUT = "data/current/usgs-water-series.json";
export const WATER_RAW_PREFIX = "usgs-water";

export const API_BASE = "https://api.waterdata.usgs.gov/ogcapi/v1/collections";

export const WATER = {
  agency: "U.S. Geological Survey (USGS), Water Data for the Nation",
  service:
    "USGS Water Data OGC APIs, V1 (latest-continuous, continuous, time-series-metadata, monitoring-locations)",
  endpoint: API_BASE,
  docs: "https://api.waterdata.usgs.gov/docs/ogcapi/",
  terms: "https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits",
  provisional: "https://waterdata.usgs.gov/provisional-data-statement/",
  web: "https://waterdata.usgs.gov/state/Puerto%20Rico/",
  attribution:
    "Fuente: U.S. Geological Survey (USGS), Water Data for the Nation, Water Data OGC APIs (V1). Datos de dominio público; USGS no respalda este sitio. Datos provisionales sujetos a revisión por el USGS.",
} as const;

/** Official site page for a monitoring location. */
export const siteUrl = (id: string) => `https://waterdata.usgs.gov/monitoring-location/${id}/`;

/** Which reader-facing view a series belongs to. */
export type WaterView = "RIOS" | "LLUVIA" | "EMBALSES";

/**
 * Parameters in scope, with the exact official meaning (USGS parameter-codes
 * collection) and the statistic and computation each published series must
 * carry (time-series-metadata). A series whose metadata says anything else is
 * excluded, never reinterpreted.
 *
 * Out of scope on purpose: groundwater levels (72019, 72232), stream water
 * surface elevation (72365, a different quantity from gage height), gate
 * openings (45592), water quality (00010, 00095, 00300, 00400, 63680).
 */
export type ParameterSpec = {
  code: string;
  name: string;
  description: string;
  unit: string;
  statisticId: string | null;
  computation: "Instantaneous" | "Decumulated";
  kind: "DISCHARGE" | "GAGE_HEIGHT" | "PRECIPITATION" | "RESERVOIR_ELEVATION";
  datum: string | null;
};
export const PARAMETERS: ParameterSpec[] = [
  {
    code: "00060",
    name: "Discharge",
    description: "Discharge, cubic feet per second",
    unit: "ft^3/s",
    statisticId: "00011",
    computation: "Instantaneous",
    kind: "DISCHARGE",
    datum: null,
  },
  {
    code: "00065",
    name: "Gage height",
    description: "Gage height, feet",
    unit: "ft",
    statisticId: "00011",
    computation: "Instantaneous",
    kind: "GAGE_HEIGHT",
    datum: null,
  },
  {
    code: "00045",
    name: "Precipitation",
    description: "Precipitation, total, inches",
    unit: "in",
    statisticId: null,
    computation: "Decumulated",
    kind: "PRECIPITATION",
    datum: null,
  },
  {
    code: "72379",
    name: "Elevation, lake/res, PRVD02",
    description: "Lake or reservoir elevation, above Puerto Rico Datum of 2002, feet",
    unit: "ft",
    statisticId: "00011",
    computation: "Instantaneous",
    kind: "RESERVOIR_ELEVATION",
    datum: "PRVD02",
  },
  {
    code: "72380",
    name: "Elevation, lake/res, PRVD02",
    description: "Lake or reservoir elevation, above Puerto Rico Datum of 2002, meters",
    unit: "m",
    statisticId: "00011",
    computation: "Instantaneous",
    kind: "RESERVOIR_ELEVATION",
    datum: "PRVD02",
  },
  {
    code: "72375",
    name: "Elevation, lake/res, LMSL",
    description: "Lake or reservoir elevation above local mean sea level (LMSL), feet",
    unit: "ft",
    statisticId: "00011",
    computation: "Instantaneous",
    kind: "RESERVOIR_ELEVATION",
    datum: "LMSL",
  },
  {
    code: "72376",
    name: "Elevation, lake/res, LMSL",
    description: "Lake or reservoir elevation above local mean sea level (LMSL), meters",
    unit: "m",
    statisticId: "00011",
    computation: "Instantaneous",
    kind: "RESERVOIR_ELEVATION",
    datum: "LMSL",
  },
  {
    code: "62614",
    name: "Elevation, lake/res, NGVD29",
    description: "Lake or reservoir water surface elevation above NGVD 1929, feet",
    unit: "ft",
    statisticId: "00011",
    computation: "Instantaneous",
    kind: "RESERVOIR_ELEVATION",
    datum: "NGVD29",
  },
  {
    code: "62616",
    name: "Elevation, lake/res, NGVD29",
    description: "Lake or reservoir water surface elevation above NGVD 1929, meters",
    unit: "m",
    statisticId: "00011",
    computation: "Instantaneous",
    kind: "RESERVOIR_ELEVATION",
    datum: "NGVD29",
  },
];
export const PARAMETER_BY_CODE = new Map(PARAMETERS.map((p) => [p.code, p]));
export const PARAMETER_CODES = PARAMETERS.map((p) => p.code);

/**
 * One reservoir water surface is often published several times: the same
 * elevation above two datums (PRVD02 and LMSL), each in feet and in meters.
 * These are the same measurement, so one is shown, chosen by this order:
 * Puerto Rico Vertical Datum of 2002 first (the current official vertical
 * datum for Puerto Rico), feet before meters (the unit of the other USGS
 * Puerto Rico water levels), then LMSL, then the older NGVD 1929.
 */
export const ELEVATION_PREFERENCE = ["72379", "72380", "72375", "72376", "62614", "62616"];

/**
 * USGS site types (site_type_code) per view. Precipitation is kept at any
 * site type (rain gages sit at stream gages, reservoirs and wells). Discharge
 * and gage height are kept at streams, canals and ditches; at reservoirs only
 * gage height and elevation. Other types (springs, diversions, coastal) are
 * excluded with that reason.
 */
export const RIVER_SITE_TYPES = ["ST", "ST-CA", "ST-DCH"];
export const RESERVOIR_SITE_TYPES = ["LK"];

/** A series with no observation in this many days is inactive (discontinued or offline), not "current". */
export const ACTIVE_DAYS = 30;

/** Snapshot freshness (minutes since the last successful retrieval). USGS relays most Puerto Rico gages hourly. */
export const WATER_FRESHNESS = { currentMinutes: 60, staleMinutes: 180 } as const;

/**
 * Series freshness, per measurement series, not per station (minutes since
 * that series' own latest observation, not the retrieval): Puerto Rico gages record every 15 minutes and transmit
 * about hourly; at retrieval on 2026-10-10 nearly all reporting series were
 * under 1 hour old and a few under 3. CURRENT ≤ 2 h, AGING ≤ 6 h, STALE beyond.
 */
export const SERIES_FRESHNESS = { currentMinutes: 120, staleMinutes: 360 } as const;

/** Hours of hourly series kept for context; trend interval in hours. */
export const SERIES_HOURS = 24;
export const TREND_HOURS = 3;

/**
 * A 24-hour rain total is given only when the 15-minute increments cover the
 * whole window: first point within this many minutes of the window start,
 * no gap between points longer than this, no missing values.
 */
export const RAIN_MAX_GAP_MINUTES = 30;

/** Puerto Rico and its islands (Mona, Desecheo, Vieques, Culebra), for coordinate checks. */
export const PR_BOX = { minLat: 17.8, maxLat: 18.6, minLon: -68.0, maxLon: -65.1 } as const;

/** Fields kept per station and per observation (allowlists). */
export const STATION_FIELDS = [
  "id",
  "name",
  "siteTypeCode",
  "siteType",
  "latitude",
  "longitude",
  "municipio",
  "countyName",
  "url",
] as const;
export const OBSERVATION_FIELDS = [
  "stationId",
  "timeSeriesId",
  "view",
  "parameterCode",
  "kind",
  "datum",
  "unit",
  "statisticId",
  "computation",
  "observedAt",
  "value",
  "valueText",
  "approval",
  "qualifiers",
  "flags",
  "trend",
  "rain24h",
] as const;
