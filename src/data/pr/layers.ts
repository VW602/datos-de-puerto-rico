import { femaPlaceValues } from "./fema";
import { fundsValues } from "./funds";
import { latestRates } from "./laus";
import type { Municipio } from "./places";

const LAUS_RATES = latestRates();
const FUNDS = fundsValues();

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
      // BLS LAUS, latest month: copied as published; a missing value stays null.
      unemploymentMonthly: LAUS_RATES[place.id] ?? null,
      // USAspending, money attributable to the municipio only; null stays null.
      fedObligations: FUNDS[place.id]?.obligations ?? null,
      fedOutlays: FUNDS[place.id]?.outlays ?? null,
      fedAwards: FUNDS[place.id]?.awards ?? null,
      // OpenFEMA, all disasters together; the disaster filter recomputes these.
      ...femaPlaceValues(place.id),
      // Island-wide only: no municipio has its own figure.
      obesity: null,
      inactivity: null,
    },
  }));
}
