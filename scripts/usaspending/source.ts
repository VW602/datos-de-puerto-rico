/**
 * USAspending (U.S. Department of the Treasury, Bureau of the Fiscal Service):
 * what the federal-funds pipeline asks for, and the exact meaning of each
 * figure. Shared by update (network) and generate (offline).
 *
 * Money states. USAspending reports, for prime awards:
 *   - obligations: the government's legal commitment to pay. At transaction
 *     level, `federal_action_obligation` of each action (can be negative: a
 *     deobligation). Summed by action date, they are "obligations in a period".
 *   - outlays: payments reported by agencies (File C), cumulative per award,
 *     only where an agency reported them. Not "spent" by the recipient.
 * Nothing here is "allocated", "awarded" as a budget, "committed" or "spent".
 */

export const USA_GENERATOR_VERSION = 1;
/** Bump when the request plan changes shape; part of the plan fingerprint. */
export const PLAN_VERSION = 3;

export const RAW_DIR = "data/raw/usaspending";
/** Per-request cache for resumable downloads. Git-ignored; never published. */
export const STAGING_DIR = ".cache/usaspending";
export const MANIFEST = `${RAW_DIR}/manifest.json`;
export const OUTPUT = "data/generated/usaspending-pr.json";

export const API = "https://api.usaspending.gov/api/v2/";
export const SITE = "https://www.usaspending.gov/";
export const TERMS = {
  /** Licensing and citation section of the About page. */
  about: "https://www.usaspending.gov/about",
  /** Limitation on Permissible Use of Dun & Bradstreet, Inc. Data. */
  dnb: "https://www.usaspending.gov/db_info",
  apiDocs: "https://api.usaspending.gov/docs/endpoints",
  dataDictionary: "https://www.usaspending.gov/data-dictionary",
} as const;

/** Federal fiscal years kept: the latest complete one and the four before it. */
export const HISTORY_YEARS = 5;
export const CATEGORY_PAGE_SIZE = 100;

/** A federal fiscal year runs from 1 October of the year before to 30 September. */
export function fiscalYearBounds(fy: number): { start: string; end: string } {
  if (!Number.isInteger(fy) || fy < 2008) throw new Error(`Año fiscal inválido: ${fy}`);
  return { start: `${fy - 1}-10-01`, end: `${fy}-09-30` };
}

/** The latest federal fiscal year that has ended on `date` (YYYY-MM-DD). */
export function latestCompleteFiscalYear(date: string): number {
  const [year, month] = date.split("-").map(Number);
  return month >= 10 ? year : year - 1;
}

/**
 * Award type groups as USAspending defines them (usaspending-api,
 * awards/v2/lookups/lookups.py). They do not overlap. The F001–F010 codes are
 * the newer assistance types; leaving them out loses money (tested).
 */
export const AWARD_GROUPS = {
  contracts: ["A", "B", "C", "D"],
  idvs: ["IDV_A", "IDV_B", "IDV_B_A", "IDV_B_B", "IDV_B_C", "IDV_C", "IDV_D", "IDV_E"],
  grants: ["02", "03", "04", "05", "F001", "F002"],
  direct_payments: ["06", "10", "F006", "F007"],
  loans: ["07", "08", "F003", "F004"],
  other: ["09", "11", "-1", "F005", "F008", "F009", "F010"],
} as const;
export type AwardGroup = keyof typeof AWARD_GROUPS;
export const AWARD_GROUP_KEYS = Object.keys(AWARD_GROUPS) as AwardGroup[];

/** Contracts and contract vehicles (FPDS). Everything else is financial assistance (FABS). */
export const PROCUREMENT_CODES = [...AWARD_GROUPS.contracts, ...AWARD_GROUPS.idvs];
export const ASSISTANCE_CODES = [
  ...AWARD_GROUPS.grants,
  ...AWARD_GROUPS.direct_payments,
  ...AWARD_GROUPS.loans,
  ...AWARD_GROUPS.other,
];

/**
 * USAspending recipient category for individual persons: FABS business type
 * "P" (Individual) or legacy "21" (usaspending-api,
 * broker/helpers/get_business_categories.py). Benefits paid to people, such
 * as Social Security, are reported where the people are.
 */
export const INDIVIDUALS = "individuals";

/**
 * Geographic states of a dollar recorded for Puerto Rico, from documented
 * fields only (no money is moved because of where else a program appears):
 *
 *   MUNICIPIO_ATTRIBUTABLE  contracts with a municipio place of performance
 *                           (FPDS: where the work is performed), and financial
 *                           assistance to individuals with a municipio
 *   MUNICIPIO_UNCERTAIN     other financial assistance with a municipio: the
 *                           grantee reports it, and it can be an office that
 *                           serves the whole island (e.g. Title I in San Juan)
 *   PUERTO_RICO_STATEWIDE   financial assistance for Puerto Rico with no
 *                           municipio: the FABS place-of-performance format for
 *                           Puerto Rico without a county is "State-wide"
 *   NO_MUNICIPIO_GEOGRAPHY  contracts for Puerto Rico with no municipio
 *
 * The four add up to the Puerto Rico total (tested).
 */
export const GEO_STATES = [
  "MUNICIPIO_ATTRIBUTABLE",
  "MUNICIPIO_UNCERTAIN",
  "PUERTO_RICO_STATEWIDE",
  "NO_MUNICIPIO_GEOGRAPHY",
] as const;
export type GeoState = (typeof GEO_STATES)[number];

/**
 * Puerto Rico's CDBG-DR and CDBG-MIT grants (HUD, Assistance Listing 14.228):
 * the semantic test case where obligations and outlays differ by billions.
 */
export const CDBG_DR_PROGRAMS = ["14.228"];
export const CDBG_DR_SINCE = "2017-10-01";

export const PR_LOCATION = { country: "USA", state: "PR" } as const;
export const EXPECTED_MUNICIPIOS = 78;

export const USA_ATTRIBUTION =
  "Fuente: USAspending.gov, U.S. Department of the Treasury, Bureau of the Fiscal Service, https://www.usaspending.gov.";
