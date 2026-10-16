import type { ScaleKind } from "@/data/scale";
import { dollars, integer, money, moneyTick } from "@/i18n/format";
import type { Locale } from "@/i18n/locale";
import { METRIC_MESSAGES } from "@/i18n/messages/metrics";

export type PrMetricId =
  | "population"
  | "income"
  | "percapita"
  | "women"
  | "under18"
  | "over65"
  | "plumbing"
  | "traffic"
  | "poverty"
  | "uninsured"
  | "unemploymentMonthly"
  | "unemployment"
  | "highschool"
  | "bachelors"
  | "nointernet"
  | "disability"
  | "rent"
  | "homevalue"
  | "obesity"
  | "medianage"
  | "snap"
  | "vacant"
  | "novehicle"
  | "nocomputer"
  | "crowding"
  | "inactivity"
  | "fedObligations"
  | "fedOutlays"
  | "fedAwards"
  | "femaPaObligated"
  | "femaPaProjects"
  | "femaIhpApproved"
  | "femaHmaObligated";

export type PrMetric = {
  id: PrMetricId;
  label: string;
  hint: string;
  source: string;
  scale: ScaleKind;
  format: (value: number) => string;
  formatTick: (value: number) => string;
  versus: (value: number, median: number) => string;
  /** Zero and negative values are their own map classes, not the bottom of the ramp. */
  signed?: boolean;
};

type Words = (typeof METRIC_MESSAGES)["es"]["words"];
type MetricSpec = {
  id: PrMetricId;
  scale: ScaleKind;
  format: (value: number, locale: Locale, w: Words) => string;
  formatTick: (value: number, locale: Locale, w: Words) => string;
  versus: (value: number, median: number, w: Words) => string;
  signed?: boolean;
};

function compact(value: number, locale: Locale, w: Words): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000)
    return `${(value / 1_000_000).toFixed(2)}${locale === "en" ? "" : " "}${w.millionsShort}`;
  if (abs >= 10_000) return `${Math.round(value / 1000)}k`;
  return integer(Math.round(value), locale);
}

function points(value: number, median: number, unit: string, w: Words): string {
  const delta = value - median;
  const abs = Math.abs(delta).toFixed(1);
  if (Math.abs(delta) < 0.05) return w.atMedian;
  return delta > 0 ? w.above(abs, unit) : w.below(abs, unit);
}

function ratio(value: number, median: number, w: Words): string {
  if (median <= 0) return "—";
  const times = value / median;
  return w.times(times.toFixed(times >= 10 ? 0 : 1));
}

const percent = (value: number) => `${value.toFixed(1)}%`;
const percentTick = (value: number) => `${Math.round(value)}%`;

const PERCENT = {
  scale: "linear",
  format: percent,
  formatTick: percentTick,
  versus: (value, median, w) => points(value, median, w.points, w),
} satisfies Omit<MetricSpec, "id">;
const COUNT = {
  scale: "log",
  format: (value, locale) => integer(Math.round(value), locale),
  formatTick: compact,
  versus: (value, median, w) => ratio(value, median, w),
} satisfies Omit<MetricSpec, "id">;
const DOLLARS = {
  scale: "log",
  format: (value, locale) => dollars(value, locale),
  formatTick: (value, locale, w) => `$${compact(value, locale, w)}`,
  versus: (value, median, w) => ratio(value, median, w),
} satisfies Omit<MetricSpec, "id">;
const ISLAND = {
  ...PERCENT,
  versus: (_value, _median, w) => w.islandFigure,
} satisfies Omit<MetricSpec, "id">;
// USAspending and OpenFEMA amounts: $0 and net negative values are named, never a ratio of the median.
const MONEY = {
  scale: "log",
  format: (value, locale) => money(value, locale),
  formatTick: (value, locale) => moneyTick(value, locale),
  signed: true,
} satisfies Omit<MetricSpec, "id" | "versus">;
const zeroOrRatio = (zero: string) => (value: number, median: number, w: Words) =>
  value === 0 ? zero : ratio(value, median, w);

/**
 * How each measure is drawn and formatted. Wording lives in
 * src/i18n/messages/metrics.ts; values and scales are the same in every language.
 */
const SPECS: MetricSpec[] = [
  { id: "population", ...COUNT },
  {
    id: "income",
    ...DOLLARS,
    // "$45k", "$1.05 mill." (the dollar sign goes before the first digit).
    formatTick: (value, locale, w) => compact(value, locale, w).replace(/^(\d)/, "$$$1"),
  },
  { id: "percapita", ...DOLLARS },
  { id: "women", ...PERCENT },
  { id: "under18", ...PERCENT },
  { id: "over65", ...PERCENT },
  { id: "plumbing", ...PERCENT },
  {
    id: "traffic",
    scale: "linear",
    format: (value, _locale, w) => `${value.toFixed(1)} ${w.per100k}`,
    formatTick: (value) => value.toFixed(0),
    versus: (value, median, w) => points(value, median, w.per100k, w),
  },
  { id: "poverty", ...PERCENT },
  { id: "uninsured", ...PERCENT },
  // BLS LAUS: the most recent monthly figure. The month comes from the generated data, never typed in.
  { id: "unemploymentMonthly", ...PERCENT },
  { id: "unemployment", ...PERCENT },
  { id: "highschool", ...PERCENT },
  { id: "bachelors", ...PERCENT },
  { id: "nointernet", ...PERCENT },
  { id: "disability", ...PERCENT },
  { id: "rent", ...DOLLARS },
  { id: "homevalue", ...DOLLARS },
  { id: "obesity", ...ISLAND },
  {
    id: "medianage",
    scale: "linear",
    format: (value, _locale, w) => `${value.toFixed(1)} ${w.years}`,
    formatTick: (value) => value.toFixed(0),
    versus: (value, median, w) => points(value, median, w.years, w),
  },
  { id: "snap", ...PERCENT },
  { id: "vacant", ...PERCENT },
  { id: "novehicle", ...PERCENT },
  { id: "nocomputer", ...PERCENT },
  { id: "crowding", ...PERCENT },
  { id: "inactivity", ...ISLAND },
  // USAspending. Only money attributable to a municipio (contracts performed
  // there, assistance to people who live there) is on the map; the rest stays in
  // its own geographic state and is shown apart (see funds.ts).
  {
    id: "fedObligations",
    ...MONEY,
    versus: (value, median, w) =>
      value < 0 ? w.netNegativeDeobligations : value === 0 ? "$0" : ratio(value, median, w),
  },
  {
    id: "fedOutlays",
    ...MONEY,
    versus: (value, median, w) =>
      value < 0 ? w.netNegativeOutlays : value === 0 ? "$0" : ratio(value, median, w),
  },
  {
    id: "fedAwards",
    ...COUNT,
    versus: (value, median, w) => zeroOrRatio(w.noneFeminine)(value, median, w),
    signed: true,
  },
  // OpenFEMA. Each measure is one FEMA field for one program; none is added to
  // another, nor to USAspending. Only what FEMA places in one municipio is on
  // the map; "Statewide" stays apart (see fema.ts).
  {
    id: "femaPaObligated",
    ...MONEY,
    versus: (value, median, w) =>
      value < 0 ? w.netNegativeAdjustments : value === 0 ? "$0" : ratio(value, median, w),
  },
  {
    id: "femaPaProjects",
    ...COUNT,
    versus: (value, median, w) => zeroOrRatio(w.noneMasculine)(value, median, w),
    signed: true,
  },
  {
    id: "femaIhpApproved",
    ...MONEY,
    versus: (value, median, w) => zeroOrRatio("$0")(value, median, w),
  },
  {
    id: "femaHmaObligated",
    ...MONEY,
    versus: (value, median, w) =>
      value < 0 ? w.netNegativeAdjustments : value === 0 ? "$0" : ratio(value, median, w),
  },
];

function buildMetrics(locale: Locale): PrMetric[] {
  const { words, metrics } = METRIC_MESSAGES[locale];
  return SPECS.map((spec) => ({
    id: spec.id,
    ...metrics[spec.id],
    scale: spec.scale,
    format: (value: number) => spec.format(value, locale, words),
    formatTick: (value: number) => spec.formatTick(value, locale, words),
    versus: (value: number, median: number) => spec.versus(value, median, words),
    ...(spec.signed ? { signed: true } : {}),
  }));
}

/** Every measure, worded for each interface language. Same ids, values and scales. */
export const METRICS_BY_LOCALE: Record<Locale, PrMetric[]> = {
  es: buildMetrics("es"),
  en: buildMetrics("en"),
};

/** The Spanish list (the original). */
export const PR_METRICS: PrMetric[] = METRICS_BY_LOCALE.es;

export function prMetricById(id: PrMetricId, locale: Locale = "es"): PrMetric {
  const metric = METRICS_BY_LOCALE[locale].find((item) => item.id === id);
  if (!metric) throw new Error(`Unknown metric: ${id}`);
  return metric;
}

export type MetricGroup =
  | "Gente"
  | "Hogar"
  | "Trabajo"
  | "Salud"
  | "Fondos federales"
  | "Recuperación y desastres"
  | "Isla";

export const METRIC_GROUPS: MetricGroup[] = [
  "Gente",
  "Hogar",
  "Trabajo",
  "Salud",
  "Fondos federales",
  "Recuperación y desastres",
  "Isla",
];

const GROUP: Record<PrMetricId, MetricGroup> = {
  population: "Gente",
  women: "Gente",
  under18: "Gente",
  over65: "Gente",
  disability: "Gente",
  income: "Hogar",
  percapita: "Hogar",
  poverty: "Hogar",
  rent: "Hogar",
  homevalue: "Hogar",
  plumbing: "Hogar",
  nointernet: "Hogar",
  unemploymentMonthly: "Trabajo",
  unemployment: "Trabajo",
  highschool: "Trabajo",
  bachelors: "Trabajo",
  uninsured: "Salud",
  traffic: "Salud",
  obesity: "Isla",
  inactivity: "Isla",
  medianage: "Gente",
  snap: "Hogar",
  vacant: "Hogar",
  novehicle: "Hogar",
  nocomputer: "Hogar",
  crowding: "Hogar",
  fedObligations: "Fondos federales",
  fedOutlays: "Fondos federales",
  fedAwards: "Fondos federales",
  femaPaObligated: "Recuperación y desastres",
  femaPaProjects: "Recuperación y desastres",
  femaIhpApproved: "Recuperación y desastres",
  femaHmaObligated: "Recuperación y desastres",
};

/** A group's name for people, in the interface language. */
export function groupLabel(group: MetricGroup, locale: Locale = "es"): string {
  return METRIC_MESSAGES[locale].groups[group];
}

export function metricGroup(id: PrMetricId): MetricGroup {
  return GROUP[id];
}

export function metricGrain(id: PrMetricId): "municipio" | "isla" {
  if (id === "obesity" || id === "inactivity") return "isla";
  return "municipio";
}
