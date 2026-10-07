/**
 * DATA UPDATE (needs network): asks the official BLS public API for the four
 * LAUS measures of Puerto Rico and its 78 municipios, and saves each API
 * response byte for byte in data/raw/bls/laus/ with its SHA-256 in
 * manifest.json. Only api.bls.gov is contacted. Nothing is saved unless every
 * expected series came back.
 *
 *   npm run data:bls:update
 *
 * Without a key it uses API v1 (25 series per request, a small daily quota):
 * one run makes 13 requests. Set BLS_API_KEY in the environment to use v2;
 * the key is sent in the request and never written to disk.
 *
 * Using the API means accepting the BLS API terms of service (TERMS.api).
 * The app build never runs this.
 */

import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { assertMunicipios, expectedSeries, sha256, type BlsManifest } from "./pipeline.ts";
import {
  API_V1,
  API_V2,
  BLS_GENERATOR_VERSION,
  MANIFEST,
  RAW_DIR,
  SERIES_PER_REQUEST,
  TERMS,
  YEARS_BACK,
} from "./source.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const USER_AGENT = "puerto-rico-datos/0.1 (open-source civic data project; BLS LAUS pipeline)";

async function main() {
  const census = JSON.parse(
    readFileSync(join(ROOT, "data/generated/census-municipios.json"), "utf8"),
  ) as {
    municipios: Record<string, { name: string }>;
  };
  const municipios = Object.entries(census.municipios)
    .map(([id, { name }]) => ({ id, name }))
    .sort((a, b) => a.id.localeCompare(b.id));
  assertMunicipios(municipios);

  const key = process.env.BLS_API_KEY?.trim();
  const api = key ? API_V2 : API_V1;
  const endYear = new Date().getUTCFullYear();
  const startYear = endYear - YEARS_BACK;
  const series = expectedSeries(municipios);
  const batches: { seriesid: string[]; startyear: string; endyear: string }[] = [];
  for (let i = 0; i < series.length; i += SERIES_PER_REQUEST) {
    batches.push({
      seriesid: series.slice(i, i + SERIES_PER_REQUEST),
      startyear: String(startYear),
      endyear: String(endYear),
    });
  }

  const bodies: string[] = [];
  for (const [index, request] of batches.entries()) {
    const payload = key ? { ...request, registrationkey: key } : request;
    const response = await fetch(api, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": USER_AGENT },
      body: JSON.stringify(payload),
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`Lote ${index + 1}: la API respondió ${response.status}`);
    const parsed = JSON.parse(text) as {
      status: string;
      message?: string[];
      Results?: { series: { seriesID: string; data: unknown[] }[] };
    };
    if (parsed.status !== "REQUEST_SUCCEEDED")
      throw new Error(`Lote ${index + 1}: ${parsed.status} ${(parsed.message ?? []).join(" ")}`);
    const got = new Map((parsed.Results?.series ?? []).map((s) => [s.seriesID, s.data.length]));
    const absent = request.seriesid.filter((id) => !got.get(id));
    if (absent.length > 0) throw new Error(`Lote ${index + 1}: faltan series ${absent.join(", ")}`);
    bodies.push(text);
    console.log(`Lote ${index + 1}/${batches.length}: ${request.seriesid.length} series`);
  }

  // Everything arrived: replace the snapshot.
  rmSync(join(ROOT, RAW_DIR), { recursive: true, force: true });
  mkdirSync(join(ROOT, RAW_DIR), { recursive: true });
  const manifest: BlsManifest = {
    schema: 1,
    generator: "scripts/bls/update.ts",
    generatorVersion: BLS_GENERATOR_VERSION,
    agency: "U.S. Bureau of Labor Statistics",
    dataset:
      "Local Area Unemployment Statistics (LAUS), municipios y Puerto Rico, mensual, sin ajuste estacional",
    api: API_V1,
    apiVersion: key ? "v2" : "v1",
    retrievedAt: new Date().toISOString().slice(0, 10),
    retrievedAtNote:
      "retrievedAt es la fecha UTC en que se pidieron los datos a la API oficial de BLS.",
    startYear,
    endYear,
    terms: TERMS,
    municipios,
    batches: bodies.map((text, index) => {
      const path = `${RAW_DIR}/batch-${String(index + 1).padStart(2, "0")}.json`;
      writeFileSync(join(ROOT, path), text);
      return {
        path,
        request: batches[index],
        bytes: Buffer.byteLength(text),
        sha256: sha256(text),
      };
    }),
  };
  if (key) manifest.api = API_V2;
  writeFileSync(join(ROOT, MANIFEST), JSON.stringify(manifest, null, 2) + "\n");
  console.log(
    `Guardado: ${manifest.batches.length} lotes, ${series.length} series, ${startYear}–${endYear}.`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
