/**
 * The one official boundary source the map uses, and the fixed parameters
 * that turn it into the map file. Changing any value here changes the output
 * and must be reviewed (npm run data:geo:generate -- --allow-changes).
 */

export const TIGER = {
  vintage: 2024,
  title: "TIGER/Line Shapefiles 2024: Counties (and equivalent)",
  agency: "U.S. Census Bureau, Geography Division",
  fileName: "tl_2024_us_county.zip",
  url: "https://www2.census.gov/geo/tiger/TIGER2024/COUNTY/tl_2024_us_county.zip",
  techDocUrl: "https://www2.census.gov/geo/pdfs/maps-data/data/tiger/tgrshp2024/TGRSHP2024_TechDoc.pdf",
  members: { shp: "tl_2024_us_county.shp", dbf: "tl_2024_us_county.dbf", cpg: "tl_2024_us_county.cpg", prj: "tl_2024_us_county.prj" },
} as const;

export const PR = {
  stateFips: "72",
  /** Generous box around Puerto Rico and its islands, including TIGER's coastal water areas. */
  bbox: { minLon: -68.1, minLat: 17.6, maxLon: -65.0, maxLat: 18.8 },
  expectedFeatures: 78,
};

export const SIMPLIFY = {
  algorithm: "Douglas–Peucker por arco compartido (topología conservada)",
  /** Planar tolerance in degrees (~11 m north–south, ~10.5 m east–west at 18°N). */
  toleranceDegrees: 0.0001,
  /** Decimal places kept in the output (~1.1 m). */
  precision: 5,
};

export const GEO_ATTRIBUTION =
  "Límites de los municipios: U.S. Census Bureau, TIGER/Line® Shapefiles 2024 (condados y equivalentes), " +
  "simplificados por este proyecto. TIGER/Line® es una marca registrada de la Oficina del Censo de EE. UU.; " +
  "el Censo no respalda ni certifica este proyecto. Los límites son para fines estadísticos y no son descripciones legales de terrenos.";

export const RAW_DIR = `data/raw/geo/tiger-${TIGER.vintage}`;
export const RAW_EXTRACT = `${RAW_DIR}/tl_${TIGER.vintage}_72_county.geojson`;
export const MANIFEST = `${RAW_DIR}/manifest.json`;
export const OUTPUT = "data/generated/municipios.geometry.json";
