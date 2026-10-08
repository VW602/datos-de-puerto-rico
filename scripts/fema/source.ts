/**
 * OpenFEMA (Federal Emergency Management Agency): which datasets the recovery
 * pipeline asks for, at which pinned version, and what each field means.
 * Shared by update (network) and generate (offline).
 *
 * Money words, never interchangeable:
 *   projectAmount          estimated total cost of a Public Assistance project (no admin costs)
 *   federalShareObligated  federal share obligated for the approved project
 *   totalObligated         federal share plus recipient/subrecipient admin costs, obligated
 *   totalApprovedIhpAmount household assistance FEMA approved under IHP
 * OpenFEMA publishes no "spent" or "paid" amount in these datasets.
 */

export const FEMA_GENERATOR_VERSION = 1;
/** Bump when the request plan changes shape; part of the plan fingerprint. */
export const PLAN_VERSION = 1;

/**
 * Committed: the PUBLIC-SAFE EXTRACT of each OpenFEMA response (allowlisted
 * fields only; see extract.ts), with a manifest that records the SHA-256 of
 * the original bytes. Not committed: the original bytes, in RAW_CACHE_DIR.
 */
export const SOURCE_DIR = "data/source/fema";
export const MANIFEST = `${SOURCE_DIR}/manifest.json`;
/** Exact OpenFEMA responses, kept locally only (git-ignored). */
export const RAW_CACHE_DIR = ".cache/fema/raw";
/** Per-request cache for resumable downloads. Git-ignored; never published. */
export const STAGING_DIR = ".cache/fema";
export const OUTPUT = "data/generated/fema-pr.json";
/** One file per disaster with its Public Assistance projects, loaded only when asked for. */
export const PROJECTS_DIR = "data/generated/fema-projects";

export const API = "https://www.fema.gov/api/open/";
export const TERMS = {
  terms: "https://www.fema.gov/about/openfema/terms-conditions",
  dataSets: "https://www.fema.gov/about/openfema/data-sets",
  apiDocs: "https://www.fema.gov/about/openfema/api",
  /** Required wording, from the OpenFEMA Terms and Conditions (Citing Data). */
  disclaimer:
    "This product uses the Federal Emergency Management Agency’s OpenFEMA API, but is not endorsed by FEMA. The Federal Government or FEMA cannot vouch for the data or analyses derived from these data after the data have been retrieved from the Agency's website(s).",
} as const;

/** Page size; OpenFEMA v2+ accepts up to 10,000 records per request. */
export const PAGE_SIZE = 10000;

/**
 * Datasets, pinned. A different version in the catalog does not change what
 * is asked for: the plan names the version in the endpoint.
 * `select` keeps only the fields the site needs; household datasets never
 * ask for city or ZIP code.
 */
export const DATASETS = {
  declarations: {
    name: "DisasterDeclarationsSummaries",
    version: 2,
    filter: "state eq 'PR'",
    orderby: "id",
    select: null,
    page: "https://www.fema.gov/openfema-data-page/disaster-declarations-summaries-v2",
  },
  publicAssistance: {
    name: "PublicAssistanceFundedProjectsDetails",
    version: 2,
    filter: "stateAbbreviation eq 'PR'",
    // No `id` in this dataset; FEMA's per-record hash is unique (checked) and gives a stable order.
    orderby: "hash",
    select: null,
    page: "https://www.fema.gov/openfema-data-page/public-assistance-funded-projects-details-v2",
  },
  mitigation: {
    name: "HazardMitigationAssistanceProjects",
    version: 4,
    filter: "state eq 'Puerto Rico'",
    orderby: "id",
    select: null,
    page: "https://www.fema.gov/openfema-data-page/hazard-mitigation-assistance-projects-v4",
  },
  housingOwners: {
    name: "HousingAssistanceOwners",
    version: 2,
    filter: "state eq 'PR'",
    orderby: "id",
    select: [
      "id",
      "disasterNumber",
      "state",
      "county",
      "validRegistrations",
      "totalInspected",
      "approvedForFemaAssistance",
      "totalApprovedIhpAmount",
      "repairReplaceAmount",
      "rentalAmount",
      "otherNeedsAmount",
    ],
    page: "https://www.fema.gov/openfema-data-page/housing-assistance-program-data-owners-v2",
  },
  housingRenters: {
    name: "HousingAssistanceRenters",
    version: 2,
    filter: "state eq 'PR'",
    orderby: "id",
    select: [
      "id",
      "disasterNumber",
      "state",
      "county",
      "validRegistrations",
      "totalInspected",
      "approvedForFemaAssistance",
      "totalApprovedIhpAmount",
      "repairReplaceAmount",
      "rentalAmount",
      "otherNeedsAmount",
    ],
    page: "https://www.fema.gov/openfema-data-page/housing-assistance-program-data-renters-v2",
  },
} as const;
export type DatasetKey = keyof typeof DATASETS;
export const DATASET_KEYS = Object.keys(DATASETS) as DatasetKey[];

/**
 * Not used: PublicAssistanceProjectsStatus v1 is listed in the OpenFEMA
 * catalog, but its API endpoint and files answered HTTP 404 when this
 * pipeline was built, so project status comes only from the
 * `projectProcessStep` field of the funded-projects dataset, verbatim.
 * PublicAssistanceApplicants is not used: it holds applicant street
 * addresses, and municipio is never inferred from an address.
 */

/**
 * Geographic states (same names as the USAspending pipeline, plus one):
 *   MUNICIPIO_ATTRIBUTABLE  FEMA names one municipio as the place of the
 *                           project (HMA primary county) or of the households
 *                           (IHP registrations), and its code agrees
 *   APPLICANT_MUNICIPIO     Public Assistance only: FEMA's `county` is the
 *                           applicant's location, not necessarily the work site.
 *                           The money is "of applicants located in" the municipio.
 *   PUERTO_RICO_STATEWIDE   FEMA says "Statewide" (whatever county code it carries:
 *                           Public Assistance codes many Statewide projects 127, San Juan)
 *   MUNICIPIO_UNCERTAIN     FEMA names several municipios, or a name and code that disagree
 *   NO_MUNICIPIO_GEOGRAPHY  no county at all
 * The states add up to the Puerto Rico total of every measure (tested).
 */
export const GEO_STATES = [
  "MUNICIPIO_ATTRIBUTABLE",
  "APPLICANT_MUNICIPIO",
  "MUNICIPIO_UNCERTAIN",
  "PUERTO_RICO_STATEWIDE",
  "NO_MUNICIPIO_GEOGRAPHY",
] as const;
export type GeoState = (typeof GEO_STATES)[number];

export const EXPECTED_MUNICIPIOS = 78;

export const FEMA_ATTRIBUTION =
  "Fuente: Federal Emergency Management Agency (FEMA), OpenFEMA. Este producto usa la API OpenFEMA de FEMA, pero FEMA no lo respalda.";
