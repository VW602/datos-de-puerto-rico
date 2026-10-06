/**
 * DATA UPDATE (needs network): downloads the official TIGER/Line 2024 county
 * file from www2.census.gov, records its checksum, and keeps the 78 Puerto
 * Rico municipios with their official coordinates and attributes, unchanged.
 *
 *   npm run data:geo:update
 *
 * The app build never runs this.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { featureCollectionJson, GEO_GENERATOR_VERSION, RAW_PROPERTIES, sha256, validateFeatures, type GeoManifest } from "./pipeline.ts";
import { readDbf, readShpPolygons, toPolygons, unzip } from "./shapefile.ts";
import { GEO_ATTRIBUTION, MANIFEST, PR, RAW_DIR, RAW_EXTRACT, TIGER } from "./source.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");

/**
 * Pure extraction: official ZIP bytes -> Puerto Rico extract text and its
 * metadata. No network; main() only adds the download and the file writes.
 */
export function extractPuertoRico(archive: Buffer) {
  const files = unzip(archive);

  const members: GeoManifest["source"]["members"] = {};
  for (const name of [...files.keys()].sort()) members[name] = { bytes: files.get(name)!.length, sha256: sha256(files.get(name)!) };

  const cpg = files.get(TIGER.members.cpg)?.toString("latin1").trim().toUpperCase();
  if (cpg !== "UTF-8") throw new Error(`Codificación del .dbf inesperada: ${cpg}`);
  const rows = readDbf(files.get(TIGER.members.dbf)!, "utf8");
  const shapes = readShpPolygons(files.get(TIGER.members.shp)!);
  if (rows.length !== shapes.length) throw new Error(".dbf y .shp no tienen el mismo número de registros");
  for (const field of RAW_PROPERTIES) if (!(field in rows[0])) throw new Error(`Falta el atributo ${field}`);

  const selected = rows
    .map((row, i) => ({ row, rings: shapes[i] }))
    .filter(({ row }) => row.__deleted !== "true" && row.STATEFP === PR.stateFips)
    .sort((a, b) => a.row.GEOID.localeCompare(b.row.GEOID));
  for (const { row } of selected) {
    if (row.GEOID !== `${row.STATEFP}${row.COUNTYFP}`) throw new Error(`GEOID inconsistente: ${row.GEOID}`);
    if (row.MTFCC !== "G4020" || row.LSAD !== "13") throw new Error(`${row.GEOID} no es un municipio (MTFCC ${row.MTFCC}, LSAD ${row.LSAD})`);
  }
  const features = selected.map(({ row, rings }) => {
    const polygons = toPolygons(rings);
    const properties = Object.fromEntries(RAW_PROPERTIES.map((field) => [field, row[field]]));
    return {
      type: "Feature",
      properties,
      geometry: polygons.length === 1 ? { type: "Polygon", coordinates: polygons[0] } : { type: "MultiPolygon", coordinates: polygons },
    };
  });
  validateFeatures(
    selected.map(({ row, rings }) => ({ id: row.GEOID, name: row.NAME, polygons: toPolygons(rings) })),
    "TIGER/Line Puerto Rico",
  );

  const extract = featureCollectionJson(
    {
      source: `${TIGER.title}: ${TIGER.url}`,
      note: "Extracto sin simplificar: los 78 registros con STATEFP=72, con sus coordenadas y atributos oficiales tal cual. Generado por scripts/geo/update.ts.",
    },
    features,
  );
  const vertices = selected.reduce((sum, { rings }) => sum + rings.reduce((s, r) => s + r.length, 0), 0);
  const crs = (files.get(TIGER.members.prj)?.toString("latin1") ?? "").trim();
  return { extract, members, features: features.length, vertices, crs };
}

async function main() {
  if (new URL(TIGER.url).host !== "www2.census.gov") throw new Error(`Host no permitido: ${TIGER.url}`);
  console.log(`Descargando ${TIGER.url} …`);
  const response = await fetch(TIGER.url, { headers: { "User-Agent": "puerto-rico-datos/0.1 (geometry pipeline)" } });
  if (!response.ok) throw new Error(`${TIGER.url} respondió ${response.status}`);
  const archive = Buffer.from(await response.arrayBuffer());
  const { extract, members, features, vertices, crs } = extractPuertoRico(archive);
  mkdirSync(join(ROOT, RAW_DIR), { recursive: true });
  writeFileSync(join(ROOT, RAW_EXTRACT), extract);

  const manifest: GeoManifest = {
    schema: 1,
    generator: "scripts/geo/update.ts",
    generatorVersion: GEO_GENERATOR_VERSION,
    retrievedAtNote: "retrievedAt es la fecha UTC en que se descargó el archivo oficial.",
    source: {
      agency: TIGER.agency,
      title: TIGER.title,
      vintage: TIGER.vintage,
      url: TIGER.url,
      techDocUrl: TIGER.techDocUrl,
      fileName: TIGER.fileName,
      retrievedAt: new Date().toISOString().slice(0, 10),
      bytes: archive.length,
      sha256: sha256(archive),
      lastModified: response.headers.get("last-modified"),
      etag: response.headers.get("etag"),
      members,
      coordinateReferenceSystem: crs,
      attribution: GEO_ATTRIBUTION,
    },
    extract: {
      path: RAW_EXTRACT,
      sha256: sha256(extract),
      features,
      vertices,
      stateFips: PR.stateFips,
      selection: "Registros del .dbf con STATEFP = 72 (verificados como MTFCC G4020, LSAD 13 «Municipio»), ordenados por GEOID.",
    },
  };
  writeFileSync(join(ROOT, MANIFEST), JSON.stringify(manifest, null, 2) + "\n");
  console.log(`Listo: ${features} municipios, ${vertices} vértices. Ahora: npm run data:geo:generate`);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
