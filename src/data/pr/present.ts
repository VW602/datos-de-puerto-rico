/**
 * Small, pure presentation helpers shared by the map, the summary, the
 * ranking and the table. Kept out of components so their wording is tested.
 */
import type { PrMetric } from "./metrics";
import { MISSING_COPY, missingReason } from "./missing";
import type { Municipio } from "./places";
import type { Ranking } from "./ranking";

/** "2020–2024 (estimado de 5 años…)" → "2020–2024"; "Años calendario 2022 y 2023" → "2022–2023". */
export function shortPeriod(period: string): string {
  const range = period.match(/(\d{4})\s*[–-]\s*(\d{4})/);
  if (range) return `${range[1]}–${range[2]}`;
  const years = [...period.matchAll(/\b(19|20)\d{2}\b/g)].map((m) => m[0]);
  if (years.length >= 2) return `${years[0]}–${years[years.length - 1]}`;
  return years[0] ?? period;
}

const isPercent = (metric: PrMetric) => metric.format(1).endsWith("%");

/** Signed difference from the median, always with the number. Percent measures use percentage points. */
export function deltaText(metric: PrMetric, delta: number): string {
  const rounded = Math.round(delta * 10) / 10;
  if (Math.abs(rounded) < 0.05 && isPercent(metric)) return "0.0 pts";
  const sign = delta > 0 ? "+" : delta < 0 ? "−" : "";
  const abs = Math.abs(delta);
  return isPercent(metric) ? `${sign}${abs.toFixed(1)} pts` : `${sign}${metric.format(abs)}`;
}

/** Plain-language reading of the median comparison. Descriptive, never "better/worse". */
export function deltaWords(metric: PrMetric, delta: number): string {
  if (Math.abs(delta) < 1e-9) return "igual a la mediana";
  return `${deltaText(metric, delta)} frente a la mediana`;
}

export type RankInfo = { rank: number; of: number } | null;

export function rankOf(ranking: Ranking, id: string): RankInfo {
  const index = ranking.ranked.findIndex((place) => place.id === id);
  return index < 0 ? null : { rank: index + 1, of: ranking.ranked.length };
}

/** What a screen reader hears for one municipio under the current measure. */
export function describePlace(
  metric: PrMetric,
  place: Municipio | undefined,
  ranking: Ranking,
): string {
  if (!place) return "";
  const value = place.values[metric.id];
  if (value == null)
    return `${place.name}, ${metric.label}: ${MISSING_COPY[missingReason(metric.id, place.id)].short}`;
  const rank = rankOf(ranking, place.id);
  return `${place.name}, ${metric.label}: ${metric.format(value)}${rank ? `, lugar ${rank.rank} de ${rank.of}` : ""}`;
}

/** Accent-insensitive search key: "Cataño" and "catano" match. */
export function searchKey(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
}

export function searchPlaces<T extends { name: string }>(
  places: T[],
  query: string,
  limit = 8,
): T[] {
  const key = searchKey(query);
  if (!key) return [];
  const starts = places.filter((place) => searchKey(place.name).startsWith(key));
  const contains = places.filter(
    (place) => !searchKey(place.name).startsWith(key) && searchKey(place.name).includes(key),
  );
  const byName = (a: T, b: T) => a.name.localeCompare(b.name, "es");
  return [...starts.sort(byName), ...contains.sort(byName)].slice(0, limit);
}
