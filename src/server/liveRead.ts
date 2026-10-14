/**
 * The /live/* routes: serve each live snapshot from the LIVE_DATA KV
 * namespace when it holds a valid value newer than the copy built into the
 * site, and the built-in copy otherwise (KV missing, empty, unreadable,
 * malformed, of another source or schema, or not newer). Data never goes
 * backwards, and a KV problem never becomes an error page.
 *
 * Read-only by design: the KV interface below has only get(). Nothing here
 * can write, refresh or call a data source.
 */
import type { NwsSnapshot, UsgsSnapshot } from "../data/pr/current";
import {
  LIVE_KEYS,
  LIVE_ROUTES,
  isNewer,
  isNwsSnapshot,
  isUsgsSnapshot,
  isWaterBundle,
  type WaterBundle,
} from "../data/pr/liveData";

/** The only KV operation the site uses. */
export type KvReader = {
  get(key: string, options: { type: "text"; cacheTtl?: number }): Promise<string | null>;
};

export type BuiltIn = { nws: NwsSnapshot; earthquakes: UsgsSnapshot; water: WaterBundle };

/** Why the served value came from where it did. */
export type KvState = "no-binding" | "empty" | "error" | "invalid" | "not-newer" | "newer";
export type Choice<T> = { value: T; servedFrom: "kv" | "built-in"; kv: KvState };

/** Seconds a response (and a KV read) may be reused at the edge and in the browser. */
export const LIVE_MAX_AGE = 60;

async function choose<T>(
  kv: KvReader | undefined,
  key: string,
  check: (v: unknown) => v is T,
  builtIn: T,
  retrievedAt: (v: T) => string | null,
): Promise<Choice<T>> {
  const fallback = (state: KvState): Choice<T> => ({
    value: builtIn,
    servedFrom: "built-in",
    kv: state,
  });
  if (!kv) return fallback("no-binding");
  let text: string | null;
  try {
    text = await kv.get(key, { type: "text", cacheTtl: LIVE_MAX_AGE });
  } catch {
    return fallback("error");
  }
  if (text === null) return fallback("empty");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return fallback("invalid");
  }
  if (!check(parsed)) return fallback("invalid");
  if (!isNewer(retrievedAt(parsed), retrievedAt(builtIn))) return fallback("not-newer");
  return { value: parsed, servedFrom: "kv", kv: "newer" };
}

export const readNws = (kv: KvReader | undefined, b: BuiltIn) =>
  choose(kv, LIVE_KEYS.nws, isNwsSnapshot, b.nws, (v) => v.retrievedAt);
export const readEarthquakes = (kv: KvReader | undefined, b: BuiltIn) =>
  choose(kv, LIVE_KEYS.earthquakes, isUsgsSnapshot, b.earthquakes, (v) => v.retrievedAt);
export const readWater = (kv: KvReader | undefined, b: BuiltIn) =>
  choose(kv, LIVE_KEYS.water, isWaterBundle, b.water, (v) => v.snapshot.retrievedAt);

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };

function json(body: unknown, method: string, servedFrom?: string): Response {
  const headers: Record<string, string> = {
    ...JSON_HEADERS,
    "cache-control": `public, max-age=${LIVE_MAX_AGE}`,
  };
  if (servedFrom) headers["x-live-source"] = servedFrom;
  return new Response(method === "HEAD" ? null : JSON.stringify(body), { status: 200, headers });
}

/** Operational state only: where each snapshot came from and how old it is. No visitor data. */
async function status(kv: KvReader | undefined, b: BuiltIn) {
  const [nws, earthquakes, water] = await Promise.all([
    readNws(kv, b),
    readEarthquakes(kv, b),
    readWater(kv, b),
  ]);
  const describe = (
    c: Choice<unknown>,
    s: { retrievedAt: string | null; lastAttempt: unknown },
    freshness: unknown,
  ) => ({
    servedFrom: c.servedFrom,
    kv: c.kv,
    retrievedAt: s.retrievedAt,
    lastAttempt: s.lastAttempt,
    freshness,
  });
  return {
    kvBinding: Boolean(kv),
    sources: {
      nws: describe(nws, nws.value, nws.value.freshness),
      earthquakes: describe(earthquakes, earthquakes.value, earthquakes.value.freshness),
      water: describe(water, water.value.snapshot, water.value.snapshot.sourceFreshness),
    },
  };
}

/** Handles one request under /live/. GET and HEAD only; nothing here changes any state. */
export async function handleLive(
  request: Request,
  kv: KvReader | undefined,
  builtIn: BuiltIn,
): Promise<Response> {
  const method = request.method.toUpperCase();
  if (method !== "GET" && method !== "HEAD") {
    return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
      status: 405,
      headers: { ...JSON_HEADERS, allow: "GET, HEAD", "cache-control": "no-store" },
    });
  }
  switch (new URL(request.url).pathname) {
    case LIVE_ROUTES.nws: {
      const c = await readNws(kv, builtIn);
      return json(c.value, method, c.servedFrom);
    }
    case LIVE_ROUTES.earthquakes: {
      const c = await readEarthquakes(kv, builtIn);
      return json(c.value, method, c.servedFrom);
    }
    case LIVE_ROUTES.water: {
      const c = await readWater(kv, builtIn);
      return json(c.value.snapshot, method, c.servedFrom);
    }
    case LIVE_ROUTES.waterSeries: {
      const c = await readWater(kv, builtIn);
      return json(c.value.series, method, c.servedFrom);
    }
    case LIVE_ROUTES.status:
      return json(await status(kv, builtIn), method);
    default:
      return new Response(JSON.stringify({ error: "Not Found" }), {
        status: 404,
        headers: { ...JSON_HEADERS, "cache-control": "no-store" },
      });
  }
}
