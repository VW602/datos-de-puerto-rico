import { defineHandler } from "nitro/h3";
import nws from "../../data/current/nws.json";
import earthquakes from "../../data/current/usgs-earthquakes.json";
import waterSeries from "../../data/current/usgs-water-series.json";
import water from "../../data/current/usgs-water.json";
import { fromCache, handleLive, type BuiltIn, type KvReader } from "./liveRead";

/** The copies built into the site: the last known good data, used whenever KV is not newer. */
const BUILT_IN = {
  nws,
  earthquakes,
  water: { snapshot: water, series: waterSeries },
} as unknown as BuiltIn;

type CloudflareRequest = Request & {
  runtime?: {
    cloudflare?: {
      env?: { LIVE_DATA?: KvReader };
      context?: { waitUntil(promise: Promise<unknown>): void };
    };
  };
};

/**
 * /live/*: read-only live data. On Cloudflare the KV binding is LIVE_DATA; on
 * the Node build there is none and every route serves the built-in copy.
 * Successful GET responses are kept in the edge cache (Cache API) for
 * LIVE_MAX_AGE seconds, so most requests never read KV.
 */
export default defineHandler(async (event) => {
  const request = event.req as CloudflareRequest;
  const cloudflare = request.runtime?.cloudflare;
  const cache = (globalThis as { caches?: { default?: Cache } }).caches?.default;
  const cacheable = cache && request.method === "GET";
  if (cacheable) {
    const hit = await cache.match(request);
    if (hit) return fromCache(hit);
  }
  const response = await handleLive(request, cloudflare?.env?.LIVE_DATA, BUILT_IN);
  if (cacheable && response.status === 200) {
    const stored = cache.put(request, response.clone()).catch(() => undefined);
    if (cloudflare?.context) cloudflare.context.waitUntil(stored);
    else await stored;
  }
  return response;
});
