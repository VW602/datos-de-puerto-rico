import { domain, medianOf, type ScaleKind } from "@/data/scale";
import type { PrMetricId } from "./metrics";
import type { Municipio } from "./places";

export type Ranking = {
  /** Only municipios with a value, highest first. Missing values are left out, never ranked as 0. */
  ranked: Municipio[];
  min: number;
  max: number;
  /** Median of the published values only. */
  median: number;
};

/**
 * Orders municipios by one metric. This is a descriptive sort ("de mayor a
 * menor"), not a score: it does not say which end is better.
 */
export function rankByMetric(places: Municipio[], id: PrMetricId, scale: ScaleKind): Ranking {
  const ranked = places
    .filter((place) => place.values[id] != null)
    .sort(
      (a, b) =>
        (b.values[id] as number) - (a.values[id] as number) || a.name.localeCompare(b.name, "es"),
    );
  const values = ranked.map((place) => place.values[id] as number);
  const { min, max } = domain(values, scale);
  return { ranked, min, max, median: medianOf(values) };
}
