/**
 * The exact list of USAspending API requests the project keeps. Shared by
 * update (which sends them) and generate (which checks every one came back).
 * Pure: no network.
 */

import { createHash } from "node:crypto";
import {
  ASSISTANCE_CODES,
  AWARD_GROUPS,
  AWARD_GROUP_KEYS,
  CATEGORY_PAGE_SIZE,
  CDBG_DR_PROGRAMS,
  CDBG_DR_SINCE,
  HISTORY_YEARS,
  INDIVIDUALS,
  PLAN_VERSION,
  PROCUREMENT_CODES,
  PR_LOCATION,
  fiscalYearBounds,
} from "./source.ts";

export type PlannedRequest = {
  /** Stable name; the saved file is `${key}.json` (paged requests add -pN). */
  key: string;
  method: "GET" | "POST";
  /** Path under the API root, e.g. "search/spending_by_geography/". */
  endpoint: string;
  body?: Record<string, unknown>;
  /** True when the endpoint pages its results (page_metadata.hasNext). */
  paged?: boolean;
};

export function countyCode(fips: string): string {
  if (!/^72\d{3}$/.test(fips)) throw new Error(`FIPS de municipio inválido: ${fips}`);
  return fips.slice(2);
}

/** The slices of money the plan asks for separately. */
const SLICES = {
  all: {},
  procurement: { award_type_codes: PROCUREMENT_CODES },
  individuals: { award_type_codes: ASSISTANCE_CODES, recipient_type_names: [INDIVIDUALS] },
} as const;
type Slice = keyof typeof SLICES;

const period = (fy: number) => [
  { start_date: fiscalYearBounds(fy).start, end_date: fiscalYearBounds(fy).end },
];
const where = (county?: string) => [county ? { ...PR_LOCATION, county } : PR_LOCATION];

function filters(fy: number, extra: Record<string, unknown>, county?: string) {
  return { time_period: period(fy), place_of_performance_locations: where(county), ...extra };
}

/** Canonical JSON: keys sorted at every level, so equal requests hash equally. */
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

/** Deterministic ID of one HTTP request (method, endpoint, body with page). */
export function requestId(
  method: string,
  endpoint: string,
  body: Record<string, unknown> | null,
): string {
  return createHash("sha256")
    .update(canonical({ method, endpoint, body }))
    .digest("hex")
    .slice(0, 24);
}

/** Fingerprint of a whole plan: any change to any request changes it. */
export function planFingerprint(plan: PlannedRequest[]): string {
  return createHash("sha256")
    .update(canonical({ version: PLAN_VERSION, plan }))
    .digest("hex");
}

/**
 * `fy` is the detailed fiscal year; history covers it and the years before.
 *
 * Every year: obligations (transaction level) for the island and each
 * municipio, in total, for contracts, and for assistance to individuals.
 * Detailed year: award type groups, award-level amounts and outlays,
 * breakdowns by agency and program, award counts, CDBG-DR awards.
 */
export function planRequests(municipioIds: string[], fy: number): PlannedRequest[] {
  const ids = [...municipioIds].sort();
  const geo = (
    key: string,
    year: number,
    layer: "county" | "state",
    level: "transactions" | "awards",
    extra: Record<string, unknown>,
  ): PlannedRequest => ({
    key,
    method: "POST",
    endpoint: "search/spending_by_geography/",
    body: {
      filters: filters(year, extra),
      scope: "place_of_performance",
      geo_layer: layer,
      spending_level: level,
    },
  });
  const cat = (
    key: string,
    name: "cfda" | "awarding_agency",
    slice: Slice,
    county?: string,
  ): PlannedRequest => ({
    key,
    method: "POST",
    endpoint: `search/spending_by_category/${name}/`,
    body: {
      filters: filters(fy, SLICES[slice], county),
      category: name,
      limit: CATEGORY_PAGE_SIZE,
      spending_level: "transactions",
    },
    paged: true,
  });
  // Award level, one municipio at a time. The island-wide county request for
  // all awards left Culebra out (its row exists when asked for alone), so each
  // municipio's award-level total comes from its own request.
  const awardsOne = (key: string, county: string): PlannedRequest => ({
    key,
    method: "POST",
    endpoint: "search/spending_by_geography/",
    body: {
      filters: filters(fy, SLICES.all, county),
      scope: "place_of_performance",
      geo_layer: "county",
      spending_level: "awards",
    },
  });
  const count = (key: string, slice: Slice, county?: string): PlannedRequest => ({
    key,
    method: "POST",
    endpoint: "search/spending_by_award_count/",
    body: { filters: filters(fy, SLICES[slice], county), spending_level: "awards" },
  });

  const out: PlannedRequest[] = [
    { key: "meta/last-updated", method: "GET", endpoint: "awards/last_updated/" },
    { key: "meta/submission-periods", method: "GET", endpoint: "references/submission_periods/" },
  ];
  for (let year = fy - HISTORY_YEARS + 1; year <= fy; year += 1) {
    for (const slice of Object.keys(SLICES) as Slice[]) {
      for (const layer of ["county", "state"] as const) {
        out.push(
          geo(
            `fy${year}/geo-${layer}-transactions-${slice}`,
            year,
            layer,
            "transactions",
            SLICES[slice],
          ),
        );
      }
    }
  }
  for (const layer of ["county", "state"] as const) {
    for (const group of AWARD_GROUP_KEYS) {
      out.push(
        geo(`fy${fy}/geo-${layer}-transactions-type-${group}`, fy, layer, "transactions", {
          award_type_codes: AWARD_GROUPS[group],
        }),
      );
    }
    for (const slice of Object.keys(SLICES) as Slice[]) {
      out.push(geo(`fy${fy}/geo-${layer}-awards-${slice}`, fy, layer, "awards", SLICES[slice]));
    }
  }
  out.push(cat(`fy${fy}/island/agency-all`, "awarding_agency", "all"));
  out.push(cat(`fy${fy}/island/program-all`, "cfda", "all"));
  out.push(count(`fy${fy}/island/count-all`, "all"));
  out.push(count(`fy${fy}/island/count-individuals`, "individuals"));
  for (const id of ids) {
    const county = countyCode(id);
    out.push(
      cat(`fy${fy}/municipio/${id}/agency-procurement`, "awarding_agency", "procurement", county),
    );
    out.push(cat(`fy${fy}/municipio/${id}/program-all`, "cfda", "all", county));
    out.push(cat(`fy${fy}/municipio/${id}/program-individuals`, "cfda", "individuals", county));
    out.push(count(`fy${fy}/municipio/${id}/count-all`, "all", county));
    out.push(count(`fy${fy}/municipio/${id}/count-individuals`, "individuals", county));
    out.push(awardsOne(`fy${fy}/municipio/${id}/awards-all`, county));
  }
  out.push({
    key: "cdbg-dr/awards",
    method: "POST",
    endpoint: "search/spending_by_award/",
    paged: true,
    body: {
      filters: {
        award_type_codes: AWARD_GROUPS.grants,
        program_numbers: CDBG_DR_PROGRAMS,
        time_period: [{ start_date: CDBG_DR_SINCE, end_date: fiscalYearBounds(fy).end }],
        place_of_performance_locations: [PR_LOCATION],
      },
      // No recipient fields: the project keeps no recipient names or addresses.
      fields: [
        "Award ID",
        "Award Amount",
        "Total Outlays",
        "Awarding Agency",
        "Start Date",
        "End Date",
        "CFDA Number",
      ],
      limit: 100,
      sort: "Award Amount",
      order: "desc",
      spending_level: "awards",
    },
  });
  return out;
}
