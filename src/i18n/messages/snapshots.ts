/**
 * Attribution lines stored inside the live snapshots (NWS, USGS earthquakes,
 * USGS water). The scripts write them in Spanish (scripts/live/source.ts,
 * scripts/water/source.ts); English shows the translation paired with that
 * exact Spanish text. A test keeps the pairs in step with the scripts, and a
 * line with no pair is shown as written, marked as Spanish, never guessed.
 */
import type { Locale } from "../locale.ts";

export const SNAPSHOT_ATTRIBUTIONS: { es: string; en: string }[] = [
  {
    es: "Fuente: National Weather Service (NWS), NOAA, api.weather.gov. Información de dominio público; NWS no respalda este sitio. Para avisos oficiales a tiempo, use NOAA Weather Radio, weather.gov y las autoridades locales.",
    en: "Source: National Weather Service (NWS), NOAA, api.weather.gov. Public domain information; NWS does not endorse this site. For timely official warnings, use NOAA Weather Radio, weather.gov and local authorities.",
  },
  {
    es: "Fuente: U.S. Geological Survey (USGS), Earthquake Hazards Program, feed GeoJSON en tiempo real. Datos de dominio público; USGS no respalda este sitio. Los datos recientes pueden revisarse.",
    en: "Source: U.S. Geological Survey (USGS), Earthquake Hazards Program, real-time GeoJSON feed. Public domain data; USGS does not endorse this site. Recent data may be revised.",
  },
  {
    es: "Fuente: U.S. Geological Survey (USGS), Water Data for the Nation, Water Data OGC APIs (V1). Datos de dominio público; USGS no respalda este sitio. Datos provisionales sujetos a revisión por el USGS.",
    en: "Source: U.S. Geological Survey (USGS), Water Data for the Nation, Water Data OGC APIs (V1). Public domain data; USGS does not endorse this site. Provisional data subject to revision by USGS.",
  },
];

/** The attribution in the reader's language, with the language it is actually in. */
export function snapshotAttribution(
  stored: string,
  locale: Locale,
): { text: string; lang: "es" | "en" } {
  if (locale === "es") return { text: stored, lang: "es" };
  const pair = SNAPSHOT_ATTRIBUTIONS.find((item) => item.es === stored);
  return pair ? { text: pair.en, lang: "en" } : { text: stored, lang: "es" };
}
