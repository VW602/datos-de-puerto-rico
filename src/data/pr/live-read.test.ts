import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LIVE_KV } from "@/lib/live-kv";
import {
  fromCache,
  handleLive,
  readEarthquakes,
  readNws,
  readWater,
  type BuiltIn,
  type KvReader,
} from "@/server/liveRead";
import {
  LIVE_KEYS,
  LIVE_ROUTES,
  isNewer,
  isNwsSnapshot,
  isUsgsSnapshot,
  isWaterBundle,
  isWaterSeries,
  isWaterSnapshot,
} from "./liveData";
import { loadWater, loadWaterSeries } from "./water";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const json = (p: string) => JSON.parse(read(p));

const BUILT: BuiltIn = {
  nws: json("data/current/nws.json"),
  earthquakes: json("data/current/usgs-earthquakes.json"),
  water: {
    snapshot: json("data/current/usgs-water.json"),
    series: json("data/current/usgs-water-series.json"),
  },
};
const later = (iso: string | null, minutes = 30) =>
  new Date(Date.parse(iso!) + minutes * 60_000).toISOString();
const earlier = (iso: string | null) => new Date(Date.parse(iso!) - 86_400_000).toISOString();

/** A newer copy of each built-in value, as a later refresh would store it. */
const NEWER = {
  nws: { ...BUILT.nws, retrievedAt: later(BUILT.nws.retrievedAt) },
  earthquakes: { ...BUILT.earthquakes, retrievedAt: later(BUILT.earthquakes.retrievedAt) },
  water: {
    snapshot: { ...BUILT.water.snapshot, retrievedAt: later(BUILT.water.snapshot.retrievedAt) },
    series: { ...BUILT.water.series, retrievedAt: later(BUILT.water.snapshot.retrievedAt) },
  },
};

/** A KV stand-in with only get(), like the site's binding usage. */
function kvWith(values: Record<string, string>, fail = false): KvReader & { gets: string[] } {
  const gets: string[] = [];
  return {
    gets,
    async get(key) {
      gets.push(key);
      if (fail) throw new Error("KV unavailable (daily limit reached)");
      return key in values ? values[key]! : null;
    },
  };
}
const req = (path: string, method = "GET") =>
  new Request(`https://datos.tn242.com${path}`, { method });

describe("built-in snapshots pass the read checks", () => {
  it("NWS (including zero active alerts), earthquakes, water and its series", () => {
    expect(isNwsSnapshot(BUILT.nws)).toBe(true);
    expect(isNwsSnapshot({ ...BUILT.nws, data: { alerts: [] } })).toBe(true);
    expect(isUsgsSnapshot(BUILT.earthquakes)).toBe(true);
    expect(isWaterSnapshot(BUILT.water.snapshot)).toBe(true);
    expect(isWaterSeries(BUILT.water.series)).toBe(true);
    expect(isWaterBundle(BUILT.water)).toBe(true);
  });

  it("the series belongs to the snapshot it is stored with", () => {
    expect(BUILT.water.series.snapshotContentSha256).toBe(BUILT.water.snapshot.contentSha256);
    expect(
      isWaterBundle({
        ...BUILT.water,
        series: { ...BUILT.water.series, snapshotContentSha256: "0".repeat(64) },
      }),
    ).toBe(false);
    expect(
      isWaterBundle({
        ...BUILT.water,
        series: { ...BUILT.water.series, retrievedAt: earlier(BUILT.water.snapshot.retrievedAt) },
      }),
    ).toBe(false);
  });

  it("wrong schema, wrong source, missing time or hash are rejected", () => {
    expect(isNwsSnapshot({ ...BUILT.nws, schemaVersion: 99 })).toBe(false);
    expect(isNwsSnapshot(BUILT.earthquakes)).toBe(false);
    expect(isUsgsSnapshot(BUILT.nws)).toBe(false);
    expect(isNwsSnapshot({ ...BUILT.nws, retrievedAt: null })).toBe(false);
    expect(isNwsSnapshot({ ...BUILT.nws, contentSha256: "abc" })).toBe(false);
    expect(
      isNwsSnapshot({ ...BUILT.nws, freshness: { currentMinutes: 15, staleMinutes: 60 } }),
    ).toBe(false);
    expect(isWaterSnapshot({ ...BUILT.water.snapshot, schemaVersion: 1 })).toBe(false);
    // Same shape, another endpoint: not this source.
    const elsewhere = (s: { source: object }) => ({
      ...s,
      source: { ...s.source, endpoint: "https://example.org/feed" },
    });
    expect(isNwsSnapshot(elsewhere(BUILT.nws))).toBe(false);
    expect(isUsgsSnapshot(elsewhere(BUILT.earthquakes))).toBe(false);
    expect(isWaterSnapshot(elsewhere(BUILT.water.snapshot))).toBe(false);
  });
});

describe("newer wins; KV never makes data go backwards", () => {
  const cases: [string, Record<string, string>, boolean, string, string][] = [
    ["KV empty", {}, false, "built-in", "empty"],
    [
      "KV malformed",
      { [LIVE_KEYS.nws]: "{not json", [LIVE_KEYS.earthquakes]: "{", [LIVE_KEYS.water]: "null" },
      false,
      "built-in",
      "invalid",
    ],
    [
      "KV wrong schema",
      {
        [LIVE_KEYS.nws]: JSON.stringify({ ...NEWER.nws, schemaVersion: 2 }),
        [LIVE_KEYS.earthquakes]: JSON.stringify({ ...NEWER.earthquakes, schemaVersion: 2 }),
        [LIVE_KEYS.water]: JSON.stringify({
          ...NEWER.water,
          snapshot: { ...NEWER.water.snapshot, schemaVersion: 1 },
        }),
      },
      false,
      "built-in",
      "invalid",
    ],
    [
      "KV wrong source",
      {
        [LIVE_KEYS.nws]: JSON.stringify(NEWER.earthquakes),
        [LIVE_KEYS.earthquakes]: JSON.stringify(NEWER.nws),
        [LIVE_KEYS.water]: JSON.stringify(NEWER.nws),
      },
      false,
      "built-in",
      "invalid",
    ],
    [
      "KV older",
      {
        [LIVE_KEYS.nws]: JSON.stringify({
          ...BUILT.nws,
          retrievedAt: earlier(BUILT.nws.retrievedAt),
        }),
        [LIVE_KEYS.earthquakes]: JSON.stringify({
          ...BUILT.earthquakes,
          retrievedAt: earlier(BUILT.earthquakes.retrievedAt),
        }),
        [LIVE_KEYS.water]: JSON.stringify({
          snapshot: {
            ...BUILT.water.snapshot,
            retrievedAt: earlier(BUILT.water.snapshot.retrievedAt),
          },
          series: { ...BUILT.water.series, retrievedAt: earlier(BUILT.water.snapshot.retrievedAt) },
        }),
      },
      false,
      "built-in",
      "not-newer",
    ],
    [
      "KV same retrieval",
      {
        [LIVE_KEYS.nws]: JSON.stringify(BUILT.nws),
        [LIVE_KEYS.earthquakes]: JSON.stringify(BUILT.earthquakes),
        [LIVE_KEYS.water]: JSON.stringify(BUILT.water),
      },
      false,
      "built-in",
      "not-newer",
    ],
    ["KV read failure", {}, true, "built-in", "error"],
    [
      "KV newer",
      {
        [LIVE_KEYS.nws]: JSON.stringify(NEWER.nws),
        [LIVE_KEYS.earthquakes]: JSON.stringify(NEWER.earthquakes),
        [LIVE_KEYS.water]: JSON.stringify(NEWER.water),
      },
      false,
      "kv",
      "newer",
    ],
  ];
  for (const [name, values, fail, servedFrom, state] of cases) {
    it(`${name} → ${servedFrom}`, async () => {
      const kv = kvWith(values, fail);
      for (const choice of [
        await readNws(kv, BUILT),
        await readEarthquakes(kv, BUILT),
        await readWater(kv, BUILT),
      ]) {
        expect(choice.servedFrom).toBe(servedFrom);
        expect(choice.kv).toBe(state);
      }
    });
  }

  it("no KV binding (Node build) → built-in", async () => {
    expect(await readNws(undefined, BUILT)).toMatchObject({
      servedFrom: "built-in",
      kv: "no-binding",
    });
  });

  it("isNewer: strictly later only; a missing time is never newer", () => {
    expect(isNewer("2026-10-14T01:00:00Z", "2026-10-14T00:59:59Z")).toBe(true);
    expect(isNewer("2026-10-14T01:00:00Z", "2026-10-14T01:00:00Z")).toBe(false);
    expect(isNewer(null, "2026-10-14T01:00:00Z")).toBe(false);
    expect(isNewer("2026-10-14T01:00:00Z", null)).toBe(true);
  });
});

describe("/live/* routes", () => {
  const routes = [
    LIVE_ROUTES.nws,
    LIVE_ROUTES.earthquakes,
    LIVE_ROUTES.water,
    LIVE_ROUTES.waterSeries,
    LIVE_ROUTES.status,
  ];

  it("GET serves JSON with a 60-second cache and says where the data came from", async () => {
    for (const path of routes) {
      const res = await handleLive(req(path), undefined, BUILT);
      expect(res.status, path).toBe(200);
      expect(res.headers.get("content-type")).toMatch(/^application\/json/);
      expect(res.headers.get("cache-control")).toBe("public, max-age=60");
      const body = await res.json();
      expect(body, path).toBeTruthy();
      if (path !== LIVE_ROUTES.status) expect(res.headers.get("x-live-source")).toBe("built-in");
    }
    const water = await (await handleLive(req(LIVE_ROUTES.water), undefined, BUILT)).json();
    expect(water.contentSha256).toBe(BUILT.water.snapshot.contentSha256);
  });

  it("a response read back from the edge cache keeps the 60-second browser policy", async () => {
    // What the Cache API hands back on Cloudflare: the zone's 4-hour Browser Cache TTL
    // in place of the Worker's own header, plus Age and Last-Modified.
    const stored = await handleLive(req(LIVE_ROUTES.nws), undefined, BUILT);
    const body = await stored.clone().text();
    const headers = new Headers(stored.headers);
    headers.set("cache-control", "public, max-age=14400");
    headers.set("age", "53");
    headers.set("cf-cache-status", "HIT");
    const served = fromCache(new Response(body, { status: 200, headers }));
    expect(served.status).toBe(200);
    expect(served.headers.get("cache-control")).toBe("public, max-age=60");
    expect(served.headers.get("age")).toBe("53");
    expect(served.headers.get("x-live-source")).toBe("built-in");
    expect(served.headers.get("content-type")).toMatch(/^application\/json/);
    expect(await served.text()).toBe(body);
    // And the route really uses it for every cache hit.
    const route = read("src/server/live-route.ts");
    expect(route).toMatch(/if \(hit\) return fromCache\(hit\);/);
    expect(route).not.toMatch(/return hit;/);
  });

  it("HEAD answers with headers and no body", async () => {
    for (const path of routes) {
      const res = await handleLive(req(path, "HEAD"), undefined, BUILT);
      expect(res.status).toBe(200);
      expect(await res.text()).toBe("");
    }
  });

  it("POST, PUT, PATCH and DELETE are refused with 405 and never touch KV", async () => {
    const kv = kvWith({});
    for (const method of ["POST", "PUT", "PATCH", "DELETE"])
      for (const path of routes) {
        const res = await handleLive(req(path, method), kv, BUILT);
        expect(res.status).toBe(405);
        expect(res.headers.get("allow")).toBe("GET, HEAD");
      }
    expect(kv.gets).toEqual([]);
  });

  it("unknown /live/ paths are 404", async () => {
    expect((await handleLive(req("/live/refresh"), undefined, BUILT)).status).toBe(404);
    expect((await handleLive(req("/live/nws"), undefined, BUILT)).status).toBe(404);
  });

  it("with newer KV, water snapshot and series come from the same stored value", async () => {
    const kv = kvWith({ [LIVE_KEYS.water]: JSON.stringify(NEWER.water) });
    const snap = await (await handleLive(req(LIVE_ROUTES.water), kv, BUILT)).json();
    const series = await (await handleLive(req(LIVE_ROUTES.waterSeries), kv, BUILT)).json();
    expect(snap.retrievedAt).toBe(NEWER.water.snapshot.retrievedAt);
    expect(series.snapshotContentSha256).toBe(snap.contentSha256);
  });

  it("status reports where each snapshot came from, with no visitor data and no invented refreshes", async () => {
    const body = await (await handleLive(req(LIVE_ROUTES.status), kvWith({}), BUILT)).json();
    expect(body.kvBinding).toBe(true);
    expect(Object.keys(body.sources)).toEqual(["nws", "earthquakes", "water"]);
    expect(body.sources.nws).toMatchObject({
      servedFrom: "built-in",
      kv: "empty",
      retrievedAt: BUILT.nws.retrievedAt,
      lastAttempt: BUILT.nws.lastAttempt,
    });
    expect(body.sources.water.lastAttempt).toEqual(BUILT.water.snapshot.lastAttempt);
    expect(JSON.stringify(body)).not.toMatch(/"ip"|user-?agent|cookie|cf-connecting/i);
  });
});

describe("page loaders read only same-origin /live/ routes, with the built-in fallback", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("water: a valid /live/ snapshot is used; a failure falls back to the built-in copy", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      calls.push(url);
      return new Response(JSON.stringify(NEWER.water.snapshot), { status: 200 });
    });
    expect((await loadWater()).retrievedAt).toBe(NEWER.water.snapshot.retrievedAt);
    vi.stubGlobal("fetch", async (url: string) => {
      calls.push(url);
      throw new Error("offline");
    });
    expect((await loadWater()).contentSha256).toBe(BUILT.water.snapshot.contentSha256);
    // A response that is not a water snapshot is never used.
    vi.stubGlobal("fetch", async (url: string) => {
      calls.push(url);
      return new Response(JSON.stringify({ ...NEWER.water.snapshot, schemaVersion: 1 }), {
        status: 200,
      });
    });
    expect((await loadWater()).retrievedAt).toBe(BUILT.water.snapshot.retrievedAt);
    vi.stubGlobal("fetch", async (url: string) => {
      calls.push(url);
      return new Response("{}", { status: 200 });
    });
    expect((await loadWaterSeries()).contentSha256).toBe(BUILT.water.series.contentSha256);
    expect(calls).toEqual([
      LIVE_ROUTES.water,
      LIVE_ROUTES.water,
      LIVE_ROUTES.water,
      LIVE_ROUTES.waterSeries,
    ]);
  });

  it("every route is same-origin; no source or GitHub URL is fetched by page code", () => {
    for (const path of Object.values(LIVE_ROUTES)) expect(path).toMatch(/^\/live\/[a-z-]+\.json$/);
    const files = (dir: string): string[] =>
      readdirSync(join(ROOT, dir)).flatMap((n) => {
        const p = `${dir}/${n}`;
        return statSync(join(ROOT, p)).isDirectory()
          ? files(p)
          : /\.tsx?$/.test(n) && !/\.test\./.test(n)
            ? [p]
            : [];
      });
    for (const f of [
      ...files("src/components"),
      ...files("src/data"),
      ...files("src/routes"),
      ...files("src/lib"),
    ]) {
      const s = read(f);
      expect(s, f).not.toMatch(/fetch\(\s*["'`]https?:/);
      expect(s, f).not.toMatch(/api\.weather\.gov|earthquake\.usgs\.gov\/fdsnws|api\.github\.com/);
    }
    const loaders = read("src/data/pr/water.ts") + read("src/components/explorer/NowPanel.tsx");
    expect(loaders).not.toMatch(/fetch\(/);
  });

  it("the water series is still requested only when the details open", () => {
    const panel = read("src/components/explorer/WaterPanel.tsx");
    const details = panel.slice(
      panel.indexOf("export function WaterDetails"),
      panel.indexOf("export function WaterSection"),
    );
    expect(panel.match(/loadWaterSeries\(\)/g)).toHaveLength(1);
    expect(details).toContain("loadWaterSeries()");
    expect(read("src/components/explorer/useWaterSnapshot.ts")).not.toMatch(
      /loadWaterSeries|waterSeries/,
    );
  });
});

describe("read-only: no write path, no scheduler", () => {
  const server = ["src/server/liveRead.ts", "src/server/live-route.ts", "src/data/pr/liveData.ts"]
    .map(read)
    .join("\n");

  it("no KV write, delete or list call exists; the only put() is the edge cache", () => {
    expect(server).not.toMatch(/\.(delete|list|getWithMetadata)\(/);
    const puts = server.match(/\b[\w.?]+\.put\(/g) ?? [];
    expect(puts).toEqual(["cache.put("]);
    expect(server).not.toMatch(/LIVE_DATA\??\.put|kv\??\.put/);
    expect(read("src/server/liveRead.ts")).toMatch(
      /get\(key: string, options: \{ type: "text"; cacheTtl\?: number \}\): Promise<string \| null>;\n\};/,
    );
  });

  it("no scheduled tasks, cron triggers or GitHub calls in the build config", () => {
    const config = read("vite.config.ts");
    expect(config).not.toMatch(/scheduledTasks|experimental\s*:|triggers\s*:|crons\s*:|tasks\s*:/);
    expect(config).toContain(
      'handlers: [{ route: "/live/**", handler: "./src/server/live-route.ts" }]',
    );
    expect(server).not.toMatch(/api\.github\.com|workflow_dispatch|dispatches|scheduled\s*\(/i);
  });

  it("the KV binding points at the datos-live namespaces", () => {
    expect(LIVE_KV).toEqual({
      binding: "LIVE_DATA",
      id: "ecce8f1170284a9590b279017b7cd31b",
      previewId: "f8607cea56fd438c887fbaee1c8077b5",
    });
    expect(read("vite.config.ts")).toMatch(
      /kv_namespaces: \[\s*\{ binding: LIVE_KV\.binding, id: LIVE_KV\.id, preview_id: LIVE_KV\.previewId \}/,
    );
  });
});
