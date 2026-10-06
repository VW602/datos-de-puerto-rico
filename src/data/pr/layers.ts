import type { Municipio } from "./places";

/**
 * Island-wide figures from the CDC BRFSS 2023 (data.cdc.gov, public domain).
 * The survey does not publish them by municipio, so no municipio gets its own
 * value: the map paints the whole island with the one published figure.
 */
export const ISLAND_STATS = {
  obesity: {
    value: 36,
    note: "36.0% de los adultos. El sobrepeso, medido aparte, es 35.1%. El BRFSS no lo publica por municipio.",
  },
  inactivity: {
    value: 52.1,
    note: "52.1% de los adultos no hace actividad física en su tiempo libre. No baja a municipio.",
  },
} as const;

export type IslandMetricId = keyof typeof ISLAND_STATS;

export function islandStat(id: string): { value: number; note: string } | null {
  if (id in ISLAND_STATS) return ISLAND_STATS[id as IslandMetricId];
  return null;
}

export function applyLayers(places: Municipio[]): Municipio[] {
  return places.map((place) => ({
    ...place,
    values: {
      ...place.values,
      // Island-wide only: no municipio has its own figure.
      obesity: null,
      inactivity: null,
    },
  }));
}
