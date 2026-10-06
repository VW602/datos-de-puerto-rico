/**
 * Offline half of the geometry pipeline: official Puerto Rico extract ->
 * validation -> topology-preserving simplification -> rounding -> validation
 * -> data/generated/municipios.geometry.json. Pure; no network.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { signedArea2, type Ring } from "./shapefile.ts";
import { GEO_ATTRIBUTION, MANIFEST, OUTPUT, PR, SIMPLIFY, TIGER } from "./source.ts";
import { findCrossings, roundRing, simplifyTopology } from "./topology.ts";

export const GEO_GENERATOR_VERSION = 1;

/** Attributes copied from the TIGER/Line .dbf, in this order. */
export const RAW_PROPERTIES = ["GEOID", "NAME", "NAMELSAD", "STATEFP", "COUNTYFP", "ALAND", "AWATER", "INTPTLAT", "INTPTLON"] as const;

export type RawFeature = {
  type: "Feature";
  properties: Record<(typeof RAW_PROPERTIES)[number], string>;
  geometry: { type: "Polygon"; coordinates: Ring[] } | { type: "MultiPolygon"; coordinates: Ring[][] };
};

export type GeoManifest = {
  schema: 1;
  generator: string;
  generatorVersion: number;
  retrievedAtNote: string;
  source: {
    agency: string;
    title: string;
    vintage: number;
    url: string;
    techDocUrl: string;
    fileName: string;
    retrievedAt: string;
    bytes: number;
    sha256: string;
    lastModified: string | null;
    etag: string | null;
    members: Record<string, { bytes: number; sha256: string }>;
    coordinateReferenceSystem: string;
    attribution: string;
  };
  extract: {
    path: string;
    sha256: string;
    features: number;
    vertices: number;
    stateFips: string;
    selection: string;
  };
};

export const sha256 = (data: Buffer | string) => createHash("sha256").update(data).digest("hex");

export function polygonsOf(feature: RawFeature): Ring[][] {
  return feature.geometry.type === "Polygon" ? [feature.geometry.coordinates] : feature.geometry.coordinates;
}

/** One feature per line: readable diffs, identical bytes every run. */
export function featureCollectionJson(header: Record<string, unknown>, features: unknown[]): string {
  const head = Object.entries(header).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},`);
  return ["{", ...head, '  "type": "FeatureCollection",', '  "features": [', features.map((f) => `    ${JSON.stringify(f)}`).join(",\n"), "  ]", "}", ""].join("\n");
}

/** Checks an official or generated municipio feature list. Throws with the first problem found. */
export function validateFeatures(features: { id: string; name: string; polygons: Ring[][] }[], label: string): void {
  if (features.length !== PR.expectedFeatures) throw new Error(`${label}: ${features.length} municipios (se esperan ${PR.expectedFeatures})`);
  if (new Set(features.map((f) => f.id)).size !== features.length) throw new Error(`${label}: GEOID repetido`);
  if (new Set(features.map((f) => f.name)).size !== features.length) throw new Error(`${label}: nombre repetido`);
  const { minLon, minLat, maxLon, maxLat } = PR.bbox;
  for (const f of features) {
    if (!new RegExp(`^${PR.stateFips}\\d{3}$`).test(f.id)) throw new Error(`${label}: ${f.id} no es un municipio de Puerto Rico`);
    if (!f.name) throw new Error(`${label}: ${f.id} sin nombre`);
    if (f.polygons.length === 0) throw new Error(`${label}: ${f.name} sin geometría`);
    for (const polygon of f.polygons) {
      if (polygon.length === 0) throw new Error(`${label}: ${f.name} con polígono vacío`);
      polygon.forEach((ring, r) => {
        if (ring.length < 4) throw new Error(`${label}: ${f.name} con anillo de ${ring.length} puntos`);
        const [x0, y0] = ring[0];
        const [xn, yn] = ring[ring.length - 1];
        if (x0 !== xn || y0 !== yn) throw new Error(`${label}: ${f.name} con anillo sin cerrar`);
        for (const [x, y] of ring) {
          if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error(`${label}: ${f.name} con coordenada no finita`);
          if (x < minLon || x > maxLon || y < minLat || y > maxLat) throw new Error(`${label}: ${f.name} fuera de Puerto Rico (${x}, ${y})`);
        }
        const area = signedArea2(ring);
        if (area === 0) throw new Error(`${label}: ${f.name} con anillo de área 0`);
        if (r === 0 && area > 0) throw new Error(`${label}: ${f.name} con anillo exterior en sentido contrario`);
        if (r > 0 && area < 0) throw new Error(`${label}: ${f.name} con hueco en sentido contrario`);
      });
    }
  }
}

export function readRaw(root: string): { manifest: GeoManifest; features: RawFeature[] } {
  const manifest = JSON.parse(readFileSync(join(root, MANIFEST), "utf8")) as GeoManifest;
  const bytes = readFileSync(join(root, manifest.extract.path));
  const actual = sha256(bytes);
  if (actual !== manifest.extract.sha256) throw new Error(`Checksum no coincide para ${manifest.extract.path}: manifiesto ${manifest.extract.sha256}, archivo ${actual}`);
  const collection = JSON.parse(bytes.toString("utf8")) as { features: RawFeature[] };
  for (const f of collection.features) {
    if (f.properties.STATEFP !== PR.stateFips) throw new Error(`Extracto con STATEFP ${f.properties.STATEFP}`);
    if (f.properties.GEOID !== `${f.properties.STATEFP}${f.properties.COUNTYFP}`) throw new Error(`GEOID inconsistente: ${f.properties.GEOID}`);
  }
  validateFeatures(
    collection.features.map((f) => ({ id: f.properties.GEOID, name: f.properties.NAME, polygons: polygonsOf(f) })),
    manifest.extract.path,
  );
  return { manifest, features: collection.features };
}

/** Exact GEOID and name match with the official Census municipio list. */
export function identityMismatches(root: string, features: RawFeature[]): string[] {
  const census = JSON.parse(readFileSync(join(root, "data/generated/census-municipios.json"), "utf8")) as {
    municipios: Record<string, { name: string }>;
  };
  const out: string[] = [];
  const tiger = new Map(features.map((f) => [f.properties.GEOID, f.properties.NAME]));
  for (const [id, { name }] of Object.entries(census.municipios)) {
    if (!tiger.has(id)) out.push(`${id} ${name}: sin geometría`);
    else if (tiger.get(id) !== name) out.push(`${id}: Censo «${name}» / TIGER «${tiger.get(id)}»`);
  }
  for (const id of tiger.keys()) if (!census.municipios[id]) out.push(`${id}: geometría sin municipio del Censo`);
  return out;
}

function area(polygons: Ring[][]): number {
  return polygons.reduce((sum, polygon) => sum + polygon.reduce((s, ring, i) => s + (i === 0 ? -1 : 1) * signedArea2(ring), 0), 0) / 2;
}

export type GeometryReport = {
  rawVertices: number;
  outputVertices: number;
  arcs: number;
  sharedArcs: number;
  closedRings: number;
  crossings: number;
  maxAreaChange: number;
  totalAreaChange: number;
};

export function buildGeometry(root: string): { content: string; report: GeometryReport } {
  const { manifest, features } = readRaw(root);
  const mismatches = identityMismatches(root, features);
  if (mismatches.length) throw new Error(`La geometría no coincide con los municipios del Censo:\n${mismatches.join("\n")}`);

  const sorted = [...features].sort((a, b) => a.properties.GEOID.localeCompare(b.properties.GEOID));
  const input = sorted.map(polygonsOf);
  const { features: simplified, stats } = simplifyTopology(input, SIMPLIFY.toleranceDegrees);
  const rounded = simplified.map((polygons) => polygons.map((polygon) => polygon.map((ring) => roundRing(ring, SIMPLIFY.precision))));

  const out = sorted.map((f, i) => ({ id: f.properties.GEOID, name: f.properties.NAME, polygons: rounded[i] }));
  validateFeatures(out, OUTPUT);
  const crossings = findCrossings(rounded.flat(2));
  if (crossings > 0) throw new Error(`La simplificación creó ${crossings} cruces de bordes; no se publica`);

  let maxAreaChange = 0;
  let before = 0;
  let after = 0;
  input.forEach((polygons, i) => {
    const a = area(polygons);
    const b = area(rounded[i]);
    before += a;
    after += b;
    maxAreaChange = Math.max(maxAreaChange, Math.abs(b - a) / a);
  });
  if (maxAreaChange > 0.01) throw new Error(`Un municipio cambió ${(maxAreaChange * 100).toFixed(2)}% de área al simplificar`);

  const content = featureCollectionJson(
    {
      generated: "GENERADO por scripts/geo/generate.ts desde data/raw/geo. NO EDITAR A MANO.",
      source: `${TIGER.title} (${manifest.source.url}, SHA-256 ${manifest.source.sha256})`,
      attribution: GEO_ATTRIBUTION,
      transform: {
        algorithm: SIMPLIFY.algorithm,
        toleranceDegrees: SIMPLIFY.toleranceDegrees,
        precision: SIMPLIFY.precision,
        generatorVersion: GEO_GENERATOR_VERSION,
      },
    },
    out.map((f) => ({
      type: "Feature",
      properties: { id: f.id, name: f.name },
      geometry: f.polygons.length === 1 ? { type: "Polygon", coordinates: f.polygons[0] } : { type: "MultiPolygon", coordinates: f.polygons },
    })),
  );
  const count = (list: Ring[][][]) => list.reduce((s, p) => s + p.reduce((t, poly) => t + poly.reduce((u, r) => u + r.length, 0), 0), 0);
  return {
    content,
    report: {
      rawVertices: count(input),
      outputVertices: count(rounded),
      ...stats,
      crossings,
      maxAreaChange,
      totalAreaChange: Math.abs(after - before) / before,
    },
  };
}
