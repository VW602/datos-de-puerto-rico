import census from "../../../data/generated/census-municipios.json";
import type { PrMetricId } from "./metrics";
import raw from "./municipios.json";

export type AgeBand = { label: string; male: number; female: number };

export type Municipio = {
  id: string;
  name: string;
  values: Record<PrMetricId, number | null>;
  /** Official margin of error (90%) for metrics that are a single Census estimate; null when derived or not published. */
  moe: Partial<Record<PrMetricId, number | null>>;
  male: number;
  female: number;
  ages: AgeBand[];
  /** NHTSA FARS deaths in 2022 and 2023 combined. */
  trafficDeaths: number;
};

type CensusValue = { estimate: number | null; moe: number | null };
type GeneratedCensus = {
  municipios: Record<
    string,
    {
      name: string;
      metrics: Record<string, CensusValue>;
      male: CensusValue;
      female: CensusValue;
      ages: { label: string; male: number | null; female: number | null }[];
    }
  >;
};

/** Hand-maintained, non-Census data: ids, names and FARS traffic deaths. */
type HandMaintained = Omit<Municipio, "values" | "moe" | "male" | "female" | "ages"> & {
  values: Partial<Record<PrMetricId, number | null>>;
};

const generated = (census as unknown as GeneratedCensus).municipios;

/**
 * Census values come from data/generated/census-municipios.json, which
 * scripts/census builds from the official Summary File snapshot. Everything
 * else comes from municipios.json. A municipio missing from either side is an
 * error, not a silent gap.
 */
export const municipios: Municipio[] = (raw as HandMaintained[]).map((place) => {
  const official = generated[place.id];
  if (!official || official.name !== place.name) {
    throw new Error(`Datos del Censo no coinciden para ${place.id} ${place.name}`);
  }
  const values = { ...place.values } as Record<PrMetricId, number | null>;
  const moe: Municipio["moe"] = {};
  for (const [id, metric] of Object.entries(official.metrics)) {
    values[id as PrMetricId] = metric.estimate;
    moe[id as PrMetricId] = metric.moe;
  }
  return {
    ...place,
    values,
    moe,
    male: official.male.estimate as number,
    female: official.female.estimate as number,
    ages: official.ages as AgeBand[],
  };
});

export const municipioById = new Map(municipios.map((place) => [place.id, place]));
