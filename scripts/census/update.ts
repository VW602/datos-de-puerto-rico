/**
 * DATA UPDATE (needs network): downloads the official Census Table-Based
 * Summary File tables listed in ./releases.ts, keeps the header plus the 78
 * Puerto Rico municipio rows unchanged, and records checksums in
 * data/raw/census/manifest.json. Only www2.census.gov is contacted.
 *
 *   npm run data:census:update
 *
 * The app build never runs this.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { assertMunicipioRows, GENERATOR_VERSION, sha256, stableJson, type CensusManifest, type ManifestFile } from "./pipeline.ts";
import {
  CENSUS_ATTRIBUTION,
  EXPECTED_MUNICIPIOS,
  PR_COUNTY_GEO_PREFIX,
  RELEASES,
  geosUrl,
  releaseDirectoryUrl,
  tableUrl,
} from "./releases.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const ALLOWED_HOST = "www2.census.gov";

/** Streams the whole official file, hashes every byte, and keeps the header plus PR municipio lines verbatim. */
async function extract(url: string, geoColumn: (header: string[]) => number) {
  if (new URL(url).host !== ALLOWED_HOST) throw new Error(`Host no permitido: ${url}`);
  const response = await fetch(url, { headers: { "User-Agent": "puerto-rico-datos/0.1 (https://datos.tn242.com/; census pipeline)" } });
  if (!response.ok || !response.body) throw new Error(`${url} respondió ${response.status}`);
  const hash = (await import("node:crypto")).createHash("sha256");
  let bytes = 0;
  let pending = "";
  let header: string[] | null = null;
  let col = -1;
  const kept: string[] = [];
  const take = (line: string) => {
    if (!header) {
      header = line.split("|");
      col = geoColumn(header);
      if (col < 0) throw new Error(`${url}: no tiene columna GEO_ID`);
      kept.push(line);
      return;
    }
    if (line.split("|", col + 1)[col]?.startsWith(PR_COUNTY_GEO_PREFIX)) kept.push(line);
  };
  for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
    const buffer = Buffer.from(chunk);
    hash.update(buffer);
    bytes += buffer.length;
    pending += buffer.toString("latin1");
    const lines = pending.split("\n");
    pending = lines.pop() ?? "";
    for (const line of lines) take(line.replace(/\r$/, ""));
  }
  if (pending) take(pending.replace(/\r$/, ""));
  const text = kept.join("\n") + "\n";
  const geoIds = kept.slice(1).map((line) => line.split("|")[col]);
  assertMunicipioRows(geoIds, url);
  return {
    content: Buffer.from(text, "latin1"),
    upstream: {
      bytes,
      sha256: hash.digest("hex"),
      lastModified: response.headers.get("last-modified"),
      etag: response.headers.get("etag"),
    },
    rows: geoIds.length,
  };
}

async function main() {
  const retrievedAt = new Date().toISOString().slice(0, 10);
  const manifest: CensusManifest = {
    schema: 1,
    generator: "scripts/census/update.ts",
    generatorVersion: GENERATOR_VERSION,
    attribution: CENSUS_ATTRIBUTION,
    retrievedAtNote: "retrievedAt es la fecha UTC en que se descargaron los archivos oficiales.",
    snapshots: [],
  };
  for (const release of RELEASES) {
    const dir = `data/raw/census/${release.snapshotId}`;
    mkdirSync(join(ROOT, dir), { recursive: true });
    const files: ManifestFile[] = [];
    const sources = [
      { kind: "geos" as const, table: null, url: geosUrl(release), file: `Geos${release.vintage}5YR.pr-municipios.txt`, column: (h: string[]) => h.indexOf("GEO_ID") },
      ...release.tables.map((table) => ({
        kind: "table" as const,
        table,
        url: tableUrl(release, table),
        file: `acsdt5y${release.vintage}-${table.toLowerCase()}.pr-municipios.dat`,
        column: (h: string[]) => (h[0] === "GEO_ID" ? 0 : -1),
      })),
    ];
    for (const source of sources) {
      process.stdout.write(`${release.snapshotId}: ${source.url} … `);
      const result = await extract(source.url, source.column);
      const path = `${dir}/${source.file}`;
      writeFileSync(join(ROOT, path), result.content);
      files.push({
        kind: source.kind,
        table: source.table,
        sourceURL: source.url,
        upstream: result.upstream,
        path,
        sha256: sha256(result.content),
        rows: result.rows,
      });
      console.log(`${result.rows} filas, ${result.upstream.bytes} bytes`);
    }
    manifest.snapshots.push({
      snapshotId: release.snapshotId,
      datasetId: release.datasetId,
      dataset: "American Community Survey 5-Year Estimates, Table-Based Summary File",
      release: release.period,
      vintage: release.vintage,
      sourceURL: releaseDirectoryUrl(release),
      retrievedAt,
      geography: "Municipios de Puerto Rico (nivel 050, estado 72; equivalentes de condado)",
      recordCount: EXPECTED_MUNICIPIOS,
      extractionMethod:
        "Se descarga completo el archivo nacional oficial y se calcula el SHA-256 de todos sus bytes (upstream.sha256). " +
        "Se guardan sin modificar la línea de encabezado y las líneas cuyo GEO_ID empieza con 0500000US72. " +
        "sha256 es el del extracto guardado.",
      files,
    });
  }
  writeFileSync(join(ROOT, "data/raw/census/manifest.json"), stableJson(manifest));
  console.log("Listo. Ahora: npm run data:census:generate");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
