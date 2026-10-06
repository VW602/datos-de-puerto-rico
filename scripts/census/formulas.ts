/**
 * The product's Census metrics, written as formulas over official Summary File
 * variables. These reproduce the formulas verified against the Summary File exactly
 * (see fieldMap in data/registry/sources.json). Do not change a formula here
 * without changing its documented meaning.
 */

import type { CensusRelease } from "./releases.ts";

/** Values of one municipio, keyed like "B17001_E002" / "B17001_M002"; null = missing. */
export type VariableValues = Record<string, number | null>;

export type MetricFormula = {
  id: string;
  snapshotId: CensusRelease["snapshotId"];
  unit: "personas" | "dólares" | "por ciento" | "años";
  rounding: string;
  /** Estimate variables the formula reads. */
  inputs: string[];
  /** Official MOE variable when the metric is a single published estimate; null when derived. */
  moe: string | null;
  compute: (v: VariableValues) => number | null;
};

const pad = (n: number) => String(n).padStart(3, "0");
const e = (table: string, n: number) => `${table}_E${pad(n)}`;
const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

function get(v: VariableValues, key: string): number | null {
  const value = v[key];
  return typeof value === "number" ? value : null;
}

function total(v: VariableValues, table: string, codes: number[]): number | null {
  let sum = 0;
  for (const code of codes) {
    const value = get(v, e(table, code));
    if (value == null) return null;
    sum += value;
  }
  return sum;
}

/** Same rule as the verified server code: one decimal, null when a part is missing or the total is 0. */
function rate(part: number | null, whole: number | null): number | null {
  if (part == null || whole == null || whole === 0) return null;
  return Math.round((part / whole) * 1000) / 10;
}

function rate2(part: number | null, whole: number | null): number | null {
  if (part == null || whole == null || whole === 0) return null;
  return Math.round((part / whole) * 10000) / 100;
}

function percentOf(table: string, parts: number[], whole: number, round = rate): Omit<MetricFormula, "id" | "snapshotId" | "moe"> {
  return {
    unit: "por ciento",
    rounding: round === rate ? "1 decimal" : "2 decimales",
    inputs: [...parts.map((n) => e(table, n)), e(table, whole)],
    compute: (v) => round(total(v, table, parts), get(v, e(table, whole))),
  };
}

function direct(table: string, unit: MetricFormula["unit"], rounding: "entero" | "1 decimal" | "tal cual") {
  const key = e(table, 1);
  return {
    unit,
    rounding,
    inputs: [key],
    moe: key.replace("_E", "_M"),
    compute: (v: VariableValues) => {
      const value = get(v, key);
      if (value == null) return null;
      if (rounding === "entero") return Math.round(value);
      if (rounding === "1 decimal") return Math.round(value * 10) / 10;
      return value;
    },
  };
}

const AGE_MALE = { under18: range(3, 6), over65: range(20, 25) };
const AGE_FEMALE = { under18: range(27, 30), over65: range(44, 49) };

export const METRIC_FORMULAS: MetricFormula[] = [
  // ACS 2019–2023
  { id: "population", snapshotId: "acs-2019-2023", ...direct("B01003", "personas", "tal cual") },
  { id: "income", snapshotId: "acs-2019-2023", ...direct("B19013", "dólares", "tal cual") },
  { id: "percapita", snapshotId: "acs-2019-2023", ...direct("B19301", "dólares", "tal cual") },
  { id: "women", snapshotId: "acs-2019-2023", moe: null, ...percentOf("B01001", [26], 1) },
  {
    id: "under18",
    snapshotId: "acs-2019-2023",
    moe: null,
    ...percentOf("B01001", [...AGE_MALE.under18, ...AGE_FEMALE.under18], 1),
  },
  {
    id: "over65",
    snapshotId: "acs-2019-2023",
    moe: null,
    ...percentOf("B01001", [...AGE_MALE.over65, ...AGE_FEMALE.over65], 1),
  },
  { id: "plumbing", snapshotId: "acs-2019-2023", moe: null, ...percentOf("B25047", [3], 1, rate2) },

  // ACS 2020–2024
  { id: "poverty", snapshotId: "acs-2020-2024", moe: null, ...percentOf("B17001", [2], 1) },
  { id: "unemployment", snapshotId: "acs-2020-2024", moe: null, ...percentOf("B23025", [5], 3) },
  { id: "highschool", snapshotId: "acs-2020-2024", moe: null, ...percentOf("B15003", range(17, 25), 1) },
  { id: "bachelors", snapshotId: "acs-2020-2024", moe: null, ...percentOf("B15003", range(22, 25), 1) },
  { id: "nointernet", snapshotId: "acs-2020-2024", moe: null, ...percentOf("B28002", [13], 1) },
  {
    id: "disability",
    snapshotId: "acs-2020-2024",
    moe: null,
    ...percentOf("B18101", [4, 7, 10, 13, 16, 19, 23, 26, 29, 32, 35, 38], 1),
  },
  { id: "rent", snapshotId: "acs-2020-2024", ...direct("B25064", "dólares", "entero") },
  { id: "homevalue", snapshotId: "acs-2020-2024", ...direct("B25077", "dólares", "entero") },
  {
    id: "uninsured",
    snapshotId: "acs-2020-2024",
    moe: null,
    ...percentOf("B27001", [5, 8, 11, 14, 17, 20, 23, 26, 29, 33, 36, 39, 42, 45, 48, 51, 54, 57], 1),
  },
  { id: "medianage", snapshotId: "acs-2020-2024", ...direct("B01002", "años", "1 decimal") },
  { id: "snap", snapshotId: "acs-2020-2024", moe: null, ...percentOf("B22003", [2], 1) },
  { id: "vacant", snapshotId: "acs-2020-2024", moe: null, ...percentOf("B25002", [3], 1) },
  { id: "novehicle", snapshotId: "acs-2020-2024", moe: null, ...percentOf("B08201", [2], 1) },
  {
    id: "nocomputer",
    snapshotId: "acs-2020-2024",
    unit: "por ciento",
    rounding: "1 decimal",
    moe: null,
    inputs: [e("B28001", 1), e("B28001", 2)],
    compute: (v) => {
      const households = get(v, e("B28001", 1));
      const withComputer = get(v, e("B28001", 2));
      return households != null && withComputer != null ? rate(households - withComputer, households) : null;
    },
  },
  { id: "crowding", snapshotId: "acs-2020-2024", moe: null, ...percentOf("B25014", [5, 6, 7, 11, 12, 13], 1) },
];

/** Population structure from B01001 (ACS 2019–2023), shown in the municipio detail. */
export const AGE_BANDS: { label: string; male: number[]; female: number[] }[] = [
  { label: "0–17", male: range(3, 6), female: range(27, 30) },
  { label: "18–34", male: range(7, 12), female: range(31, 36) },
  { label: "35–64", male: range(13, 19), female: range(37, 43) },
  { label: "65+", male: range(20, 25), female: range(44, 49) },
];

export function sexAndAge(v: VariableValues) {
  const sum = (codes: number[]) => total(v, "B01001", codes);
  return {
    male: { estimate: get(v, "B01001_E002"), moe: get(v, "B01001_M002") },
    female: { estimate: get(v, "B01001_E026"), moe: get(v, "B01001_M026") },
    ages: AGE_BANDS.map((band) => ({ label: band.label, male: sum(band.male), female: sum(band.female) })),
  };
}
