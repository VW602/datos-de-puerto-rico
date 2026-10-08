/**
 * Current data: National Weather Service active alerts and USGS earthquakes
 * for Puerto Rico. Shared by update (network) and check (offline).
 *
 * Architecture: source → updater → validated snapshot (data/current/*.json)
 * → website. The browser never calls NWS or USGS; the build never fetches.
 * Exact responses stay in the git-ignored local cache (.cache/live/raw); the
 * committed snapshots carry only allowlisted, normalized fields.
 */

export const LIVE_SCHEMA_VERSION = 1;
export const CURRENT_DIR = "data/current";
export const NWS_OUTPUT = `${CURRENT_DIR}/nws.json`;
export const USGS_OUTPUT = `${CURRENT_DIR}/usgs-earthquakes.json`;
export const RAW_CACHE_DIR = ".cache/live/raw";

/** NWS asks for a User-Agent that identifies the application, ideally with contact information. */
export const USER_AGENT =
  "(puerto-rico-datos, open-source civic data project, https://github.com/VW602)";

export const NWS = {
  agency: "National Weather Service (NWS), NOAA",
  endpoint: "https://api.weather.gov/alerts/active?area=PR",
  docs: "https://www.weather.gov/documentation/services-web-api",
  terms: "https://www.weather.gov/disclaimer",
  web: "https://www.weather.gov/sju/",
  attribution:
    "Fuente: National Weather Service (NWS), NOAA, api.weather.gov. Información de dominio público; NWS no respalda este sitio. Para avisos oficiales a tiempo, use NOAA Weather Radio, weather.gov y las autoridades locales.",
} as const;

export const USGS = {
  agency: "U.S. Geological Survey (USGS), Earthquake Hazards Program",
  /** USGS asks automated applications to use the real-time GeoJSON feeds. All magnitudes, past 7 days, updated every minute. */
  endpoint: "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_week.geojson",
  docs: "https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php",
  terms: "https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits",
  web: "https://earthquake.usgs.gov/earthquakes/map/",
  attribution:
    "Fuente: U.S. Geological Survey (USGS), Earthquake Hazards Program, feed GeoJSON en tiempo real. Datos de dominio público; USGS no respalda este sitio. Los datos recientes pueden revisarse.",
} as const;

/**
 * Puerto Rico earthquake region, explicit: 17°N–20°N, 69°W–63.5°W.
 * North to 20°N takes in the Puerto Rico Trench; south to 17°N, the Muertos
 * Trough and the Caribbean south of the island; west to 69°W, the Mona
 * Passage and the east of Hispaniola; east to 63.5°W, the Anegada Passage and
 * the Virgin Islands. These are the offshore zones where earthquakes felt in
 * Puerto Rico occur. Events in the box are kept whatever their magnitude.
 */
export const REGION = { minLat: 17.0, maxLat: 20.0, minLon: -69.0, maxLon: -63.5 } as const;

/**
 * Freshness, per source, in minutes since the last successful retrieval.
 * NWS issues short-fused warnings at any time (its API caches 5 seconds),
 * so a snapshot older than 15 minutes is aging and older than 60 minutes
 * cannot stand for "now". USGS updates its feed every minute, but Puerto
 * Rico events are located and reviewed by the Puerto Rico Seismic Network
 * with some delay, so 30 minutes is current and more than 3 hours is stale.
 */
export const FRESHNESS = {
  nws: { currentMinutes: 15, staleMinutes: 60 },
  usgs: { currentMinutes: 30, staleMinutes: 180 },
} as const;

/** Committed excerpt length of NWS prose; the full official text stays at NWS. */
export const NWS_DESCRIPTION_MAX = 600;
export const NWS_INSTRUCTION_MAX = 400;

/** NWS severity terms, verbatim (CAP). */
export const NWS_SEVERITIES = ["Extreme", "Severe", "Moderate", "Minor", "Unknown"] as const;

/** Fields kept per alert and per earthquake (allowlists). */
export const NWS_FIELDS = [
  "id",
  "event",
  "headline",
  "severity",
  "certainty",
  "urgency",
  "status",
  "messageType",
  "effective",
  "onset",
  "expires",
  "ends",
  "senderName",
  "areaDesc",
  "ugc",
  "same",
  "affectedZones",
  "municipios",
  "geography",
  "description",
  "descriptionTruncated",
  "instruction",
  "instructionTruncated",
  "url",
] as const;
export const USGS_FIELDS = [
  "id",
  "mag",
  "magType",
  "place",
  "time",
  "updated",
  "latitude",
  "longitude",
  "depthKm",
  "tsunami",
  "felt",
  "sig",
  "status",
  "type",
  "url",
] as const;
