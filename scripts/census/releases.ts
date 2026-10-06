/**
 * Official Census releases the product uses, and the Summary File tables each
 * one needs. The tables come from the field map in data/registry/sources.json
 * (verified against the Summary File); the formulas live in ./formulas.ts.
 */

export const PR_STATE_FIPS = "72";
export const PR_COUNTY_GEO_PREFIX = "0500000US72";
export const EXPECTED_MUNICIPIOS = 78;

export type CensusRelease = {
  /** Folder under data/raw/census and key in generated files. */
  snapshotId: "acs-2019-2023" | "acs-2020-2024";
  /** Registry datasetId this release feeds. */
  datasetId: "acs-2019-2023-base" | "acs-2020-2024-layers";
  vintage: 2023 | 2024;
  period: string;
  label: string;
  tables: string[];
};

export const RELEASES: CensusRelease[] = [
  {
    snapshotId: "acs-2019-2023",
    datasetId: "acs-2019-2023-base",
    vintage: 2023,
    period: "2019–2023",
    label: "American Community Survey 2019–2023, estimados de 5 años",
    tables: ["B01001", "B01003", "B19013", "B19301", "B25047"],
  },
  {
    snapshotId: "acs-2020-2024",
    datasetId: "acs-2020-2024-layers",
    vintage: 2024,
    period: "2020–2024",
    label: "American Community Survey 2020–2024, estimados de 5 años",
    tables: [
      "B01002",
      "B08201",
      "B15003",
      "B17001",
      "B18101",
      "B22003",
      "B23025",
      "B25002",
      "B25014",
      "B25064",
      "B25077",
      "B27001",
      "B28001",
      "B28002",
    ],
  },
];

const SUMMARY_FILE_ROOT = "https://www2.census.gov/programs-surveys/acs/summary_file";

export function tableUrl(release: CensusRelease, table: string): string {
  return `${SUMMARY_FILE_ROOT}/${release.vintage}/table-based-SF/data/5YRData/acsdt5y${release.vintage}-${table.toLowerCase()}.dat`;
}

export function geosUrl(release: CensusRelease): string {
  return `${SUMMARY_FILE_ROOT}/${release.vintage}/table-based-SF/documentation/Geos${release.vintage}5YR.txt`;
}

export function releaseDirectoryUrl(release: CensusRelease): string {
  return `${SUMMARY_FILE_ROOT}/${release.vintage}/table-based-SF/data/5YRData/`;
}

export const CENSUS_ATTRIBUTION =
  "Fuente: U.S. Census Bureau, American Community Survey (Puerto Rico Community Survey), Table-Based Summary File. " +
  "Este proyecto usa datos del Censo, pero el Censo no lo respalda ni lo certifica.";
