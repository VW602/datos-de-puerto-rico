/**
 * WATER UPDATE (needs network): current USGS water observations for Puerto
 * Rico → validated snapshots in data/current/usgs-water.json (+ the 24-hour
 * series file, loaded by the page only on demand).
 *
 *   npm run data:water:update
 *
 * Requests (USGS Water Data OGC APIs, V1), with an honest User-Agent, a
 * timeout, at most one retry a minute later, and pagination by the API's own
 * "next" links:
 *   REQUIRED latest-continuous   latest value of every Puerto Rico series
 *   REQUIRED monitoring-locations site name, type and municipio (by site ID)
 *   REQUIRED time-series-metadata what each series is (statistic, computation)
 *   OPTIONAL continuous          the last 24 hours, for series and trends
 * A REQUIRED failure keeps the last known good snapshot and records the
 * attempt (exit 1); it never becomes zero stations, zero rain or zero flow.
 * An OPTIONAL failure publishes the current values without series. One
 * station's bad record excludes that station's series, with a reason; it
 * never sinks the update. The site build never runs this.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { atomicWrite, fetchOnce } from "../live/update.ts";
import { RAW_CACHE_DIR } from "../live/source.ts";
import { validateWater } from "./check.ts";
import {
  buildData,
  normalizeWater,
  recordWaterFailure,
  seriesFile,
  sha256,
  stableSeriesJson,
  stableWaterJson,
  waterSnapshot,
  type RequestRecord,
  type WaterRaw,
  type WaterSnapshot,
} from "./normalize.ts";
import {
  API_BASE,
  PARAMETER_CODES,
  PR_BOX,
  WATER_OUTPUT,
  WATER_RAW_PREFIX,
  WATER_SERIES_OUTPUT,
} from "./source.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const MAX_PAGES = 20;
const SITE_CHUNK = 100;
const TIMEOUT_MS = 90_000;

type Feature = WaterRaw["latest"][number];
const codes = PARAMETER_CODES.join(",");

/** Fetches every page of one OGC API query; keeps each exact page in the local cache. */
async function fetchAll(
  name: RequestRecord["name"],
  firstUrl: string,
  required: boolean,
  records: RequestRecord[],
  pageOffset = 0,
): Promise<Feature[]> {
  const features: Feature[] = [];
  let url: string | null = firstUrl;
  for (let page = pageOffset; url; page += 1) {
    if (page - pageOffset >= MAX_PAGES) throw new Error(`${name}: más de ${MAX_PAGES} páginas`);
    const fetched = await fetchOnce(
      url,
      "application/geo+json, application/json",
      { etag: null, text: null },
      TIMEOUT_MS,
    );
    const json = JSON.parse(fetched.text) as {
      type?: string;
      features?: Feature[];
      links?: { rel?: string; href?: string }[];
      code?: string;
      description?: string;
    };
    if (json.type !== "FeatureCollection" || !Array.isArray(json.features))
      throw new Error(
        `${name}: respuesta sin colección (${json.code ?? ""} ${json.description ?? ""})`,
      );
    const cachePath = join(ROOT, RAW_CACHE_DIR, `${WATER_RAW_PREFIX}-${name}-${page}.json`);
    atomicWrite(cachePath, fetched.text);
    records.push({
      name,
      page,
      url,
      sha256: sha256(fetched.text),
      bytes: Buffer.byteLength(fetched.text),
      required,
    });
    features.push(...json.features);
    url = json.links?.find((l) => l.rel === "next")?.href ?? null;
  }
  return features;
}

function readSnapshot(): WaterSnapshot | null {
  const path = join(ROOT, WATER_OUTPUT);
  return existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as WaterSnapshot) : null;
}

async function main() {
  const census = JSON.parse(
    readFileSync(join(ROOT, "data/generated/census-municipios.json"), "utf8"),
  ) as { municipios: Record<string, unknown> };
  const municipioIds = new Set(Object.keys(census.municipios));
  const previous = readSnapshot();
  const started = new Date().toISOString();
  const records: RequestRecord[] = [];
  try {
    const latest = await fetchAll(
      "latest",
      `${API_BASE}/latest-continuous/items?f=json&state_code=72&parameter_code=${codes}&limit=10000`,
      true,
      records,
    );
    const retrievedAt = new Date().toISOString();
    const siteIds = [
      ...new Set(latest.map((f) => String(f.properties?.monitoring_location_id ?? ""))),
    ]
      .filter(Boolean)
      .sort();
    const locations: Feature[] = [];
    for (let i = 0; i < siteIds.length; i += SITE_CHUNK) {
      const ids = siteIds.slice(i, i + SITE_CHUNK).join(",");
      locations.push(
        ...(await fetchAll(
          "locations",
          `${API_BASE}/monitoring-locations/items?f=json&id=${ids}&properties=monitoring_location_name,site_type_code,site_type,state_code,county_code,county_name&limit=1000`,
          true,
          records,
          records.filter((r) => r.name === "locations").length,
        )),
      );
    }
    const meta = await fetchAll(
      "meta",
      `${API_BASE}/time-series-metadata/items?f=json&bbox=${PR_BOX.minLon},${PR_BOX.minLat},${PR_BOX.maxLon},${PR_BOX.maxLat}&parameter_code=${codes}&properties=unit_of_measure,parameter_code,statistic_id,computation_period_identifier,computation_identifier,primary,monitoring_location_id,sublocation_identifier,web_description,begin,end&skipGeometry=true&limit=10000`,
      true,
      records,
    );
    let continuous: Feature[] | null = null;
    const hour = 3600_000;
    const start = new Date(
      Math.floor(Date.parse(retrievedAt) / hour) * hour - 26 * hour,
    ).toISOString();
    try {
      continuous = await fetchAll(
        "continuous",
        `${API_BASE}/continuous/items?f=json&state_code=72&parameter_code=${codes}&time=${start.replace(".000Z", "Z")}/..&properties=time_series_id,time,value&skipGeometry=true&limit=50000`,
        false,
        records,
      );
    } catch (error) {
      console.error(
        `continuous (opcional) falló: ${error instanceof Error ? error.message : error}. Se publican los valores actuales sin series.`,
      );
    }
    const n = normalizeWater({ latest, meta, locations, continuous }, retrievedAt, municipioIds);
    const snapshot = waterSnapshot({
      retrievedAt,
      lastAttempt: { at: retrievedAt, ok: true, error: null },
      requests: records,
      seriesOk: continuous !== null,
      data: buildData(n),
    });
    const series = seriesFile(snapshot, n.series ?? {});
    validateWater(snapshot, series, municipioIds);
    atomicWrite(join(ROOT, WATER_SERIES_OUTPUT), stableSeriesJson(series));
    atomicWrite(join(ROOT, WATER_OUTPUT), stableWaterJson(snapshot));
    const c = snapshot.data.exclusions.counts;
    console.log(
      `agua: ${snapshot.data.siteInventory.stations.length} estaciones, ${snapshot.data.observations.length} series (mediciones); estaciones por vista: ríos ${snapshot.data.siteInventory.byView.RIOS}, lluvia ${snapshot.data.siteInventory.byView.LLUVIA}, embalses ${snapshot.data.siteInventory.byView.EMBALSES}; excluidas: ${Object.entries(
        c,
      )
        .filter(([, v]) => v)
        .map(([k, v]) => `${k} ${v}`)
        .join(", ")}; series 24 h: ${continuous ? "sí" : "no"}; ${retrievedAt}`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const failed = recordWaterFailure(previous, {
      at: started,
      ok: false,
      error: message.slice(0, 200),
    });
    atomicWrite(join(ROOT, WATER_OUTPUT), stableWaterJson(failed));
    console.error(
      `agua: falló (${message}). Se conserva la última copia buena${previous?.retrievedAt ? ` del ${previous.retrievedAt}` : " (no hay ninguna)"}.`,
    );
    process.exit(1);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
