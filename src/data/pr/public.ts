import { METRIC_GROUPS, PR_METRICS, metricGroup, type MetricGroup, type PrMetric, type PrMetricId } from "./metrics";
import type { Municipio } from "./places";
import { PUBLIC_SOURCES, publicSourceForMetric, type PublicStatus, type ValueExclusion } from "./sources";

/**
 * The one boundary between the data catalog and the product. Everything the
 * user can see — metric picker, groups, rankings, map, detail panel, keyboard
 * cycling — comes from here, and only the source registry decides what
 * passes. The website reads the public projection
 * (data/generated/sources.public.json), where excluded sources are absent.
 */

/** A metric with no public registry entry fails closed: it is not public. */
export function publicStatusForMetric(id: PrMetricId): PublicStatus {
  return publicSourceForMetric(id)?.publicStatus ?? "PUBLIC_EXCLUDED";
}

export function isPublicMetric(id: PrMetricId): boolean {
  return publicStatusForMetric(id) !== "PUBLIC_EXCLUDED";
}

export const PUBLIC_METRICS: PrMetric[] = PR_METRICS.filter((metric) => isPublicMetric(metric.id));

/** Groups that have at least one public metric, in their usual order. */
export const PUBLIC_GROUPS: MetricGroup[] = METRIC_GROUPS.filter((group) =>
  PUBLIC_METRICS.some((metric) => metricGroup(metric.id) === group),
);

export function publicMetricsInGroup(group: MetricGroup): PrMetric[] {
  return PUBLIC_METRICS.filter((metric) => metricGroup(metric.id) === group);
}

/** Metric shown on first load. Falls back to the first public metric. */
export const DEFAULT_METRIC_ID: PrMetricId = isPublicMetric("poverty") ? "poverty" : PUBLIC_METRICS[0].id;

const EXCLUDED_VALUES: ValueExclusion[] = PUBLIC_SOURCES.flatMap((record) => record.valueExclusions);

/** Why a single stored value is held back, or null if it can be shown. */
export function valueExclusion(id: PrMetricId, municipioId: string): ValueExclusion | null {
  return EXCLUDED_VALUES.find((item) => item.metric === id && item.municipioId === municipioId) ?? null;
}

/**
 * Applies the boundary to municipio data: values of excluded metrics and
 * individually excluded values become null (missing), never 0. Runs after
 * every other layer, so live data cannot bring them back.
 */
export function toPublicPlaces(places: Municipio[]): Municipio[] {
  const hidden = PR_METRICS.filter((metric) => !isPublicMetric(metric.id)).map((metric) => metric.id);
  return places.map((place) => {
    const values = { ...place.values };
    for (const id of hidden) values[id] = null;
    for (const item of EXCLUDED_VALUES) {
      if (item.municipioId === place.id) values[item.metric as PrMetricId] = null;
    }
    return { ...place, values };
  });
}
