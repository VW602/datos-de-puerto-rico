/**
 * BLS Local Area Unemployment Statistics (LAUS) for Puerto Rico: what the
 * pipeline asks for and where it comes from. Shared by update (network) and
 * generate (offline).
 */

export const BLS_GENERATOR_VERSION = 1;

export const RAW_DIR = "data/raw/bls/laus";
export const MANIFEST = `${RAW_DIR}/manifest.json`;
export const OUTPUT = "data/generated/bls-laus.json";

/** Official public API, version 1: no registration key. 25 series per request. */
export const API_V1 = "https://api.bls.gov/publicAPI/v1/timeseries/data/";
/** Version 2 is used only when BLS_API_KEY is set in the environment (the key is never stored). */
export const API_V2 = "https://api.bls.gov/publicAPI/v2/timeseries/data/";
export const SERIES_PER_REQUEST = 25;
/** Years requested: the current year and the two before it (enough for a 12-month change and a trend). */
export const YEARS_BACK = 2;

export const TERMS = {
  copyright: "https://www.bls.gov/opub/copyright-information.htm",
  api: "https://www.bls.gov/developers/termsOfService.htm",
  /** Required by the API terms, word for word. */
  disclaimer:
    "BLS.gov cannot vouch for the data or analyses derived from these data after the data have been retrieved from BLS.gov.",
} as const;

export const SOURCE_PAGE = "https://www.bls.gov/lau/";

/** LAUS measure codes (last two digits of the series ID). */
export const MEASURES = {
  rate: "03",
  unemployment: "04",
  employment: "05",
  laborForce: "06",
} as const;
export type Measure = keyof typeof MEASURES;
export const MEASURE_KEYS = Object.keys(MEASURES) as Measure[];

/** Every LAUS series ID is exactly 20 characters. */
function checked(id: string): string {
  if (id.length !== 20)
    throw new Error(`ID de serie LAUS inválido (${id.length} caracteres): ${id}`);
  return id;
}

/**
 * Not seasonally adjusted series, the only kind BLS publishes for municipios.
 * Municipio: LAU + CN + 5-digit county FIPS + 8 zeros + measure.
 * Puerto Rico (comparison): LAU + ST + 72 + 11 zeros + measure (e.g. LAUST720000000000003).
 */
export function municipioSeries(fips: string, measure: Measure): string {
  if (!/^72\d{3}$/.test(fips)) throw new Error(`FIPS de municipio inválido: ${fips}`);
  return checked(`LAUCN${fips}00000000${MEASURES[measure]}`);
}

export function puertoRicoSeries(measure: Measure): string {
  return checked(`LAUST72${"0".repeat(11)}${MEASURES[measure]}`);
}

export const EXPECTED_MUNICIPIOS = 78;

export const BLS_ATTRIBUTION =
  "Fuente: U.S. Bureau of Labor Statistics, Local Area Unemployment Statistics (LAUS), datos mensuales sin ajuste estacional. BLS.gov cannot vouch for the data or analyses derived from these data after the data have been retrieved from BLS.gov.";
