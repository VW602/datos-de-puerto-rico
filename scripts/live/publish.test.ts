import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LIVE_KEYS } from "../../src/data/pr/liveData.ts";
import { LIVE_KV } from "../../src/lib/live-kv.ts";
import type { Fetch, KvConfig } from "./kv.ts";
import { publishSource, statusKey, type Status } from "./publish.ts";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const TOKEN = "test-token-never-printed-0123456789abcdef";
const KV: KvConfig = { accountId: "acct", namespaceId: LIVE_KV.previewId, token: TOKEN };
const ids = new Set(
  Object.keys(
    (
      JSON.parse(readFileSync(join(ROOT, "data/generated/census-municipios.json"), "utf8")) as {
        municipios: object;
      }
    ).municipios,
  ),
);
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const nws = JSON.parse(read("data/current/nws.json"));
const water = JSON.parse(read("data/current/usgs-water.json"));
const shift = (iso: string, minutes: number) =>
  new Date(Date.parse(iso) + minutes * 60_000).toISOString();
/** A run that started just before the committed snapshots were retrieved. */
const RUN = shift(
  [
    nws.retrievedAt,
    JSON.parse(read("data/current/usgs-earthquakes.json")).retrievedAt,
    water.retrievedAt,
  ].sort()[0],
  -1,
);

/** A stand-in for the Cloudflare KV REST API, recording every call. */
function fakeKv(opts: { failGet?: number; failPut?: number } = {}) {
  const store = new Map<string, string>();
  const calls: { method: string; key: string; auth: string | null }[] = [];
  const impl: Fetch = async (url, init) => {
    const key = decodeURIComponent(url.split("/values/")[1]!);
    const method = init.method ?? "GET";
    calls.push({ method, key, auth: new Headers(init.headers).get("authorization") });
    if (method === "GET") {
      if (opts.failGet)
        return new Response(
          JSON.stringify({
            success: false,
            errors: [{ code: 10000, message: "Authentication error" }],
          }),
          { status: opts.failGet },
        );
      return store.has(key)
        ? new Response(store.get(key)!, { status: 200 })
        : new Response(
            JSON.stringify({ success: false, errors: [{ code: 10009, message: "key not found" }] }),
            { status: 404 },
          );
    }
    if (opts.failPut)
      return new Response(
        JSON.stringify({
          success: false,
          errors: [{ code: 10000, message: "Authentication error" }],
        }),
        { status: opts.failPut },
      );
    store.set(key, String(init.body));
    return new Response(JSON.stringify({ success: true, errors: [] }), { status: 200 });
  };
  return { store, calls, impl };
}

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "live-kv-"));
  cpSync(join(ROOT, "data/current"), join(dir, "data/current"), { recursive: true });
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));
const run = (
  source: "nws" | "earthquakes" | "water",
  kv: ReturnType<typeof fakeKv>,
  runStartedAt = RUN,
) =>
  publishSource({
    source,
    kv: KV,
    root: dir,
    municipioIds: ids,
    runStartedAt,
    fetchImpl: kv.impl,
    now: () => new Date("2026-10-14T12:00:00Z"),
  });
const local = (p: string) => JSON.parse(readFileSync(join(dir, p), "utf8"));
const writeLocal = (p: string, v: unknown) => writeFileSync(join(dir, p), JSON.stringify(v));

describe("publish to KV: validated, newer-wins, fail closed", () => {
  it("empty KV: the first validated value is written whole, with a success status", async () => {
    const kv = fakeKv();
    const r = await run("nws", kv);
    expect(r).toMatchObject({ outcome: "written", retrievedAt: nws.retrievedAt });
    expect(JSON.parse(kv.store.get(LIVE_KEYS.nws)!)).toEqual(nws);
    const status = JSON.parse(kv.store.get(statusKey("nws"))!) as Status;
    expect(status).toMatchObject({
      ok: true,
      outcome: "written",
      lastSuccess: { retrievedAt: nws.retrievedAt },
    });
  });

  it("newer value already in KV blocks the write; equal retrievedAt blocks it too", async () => {
    for (const minutes of [60, 0]) {
      const kv = fakeKv();
      const held = JSON.stringify({
        ...nws,
        retrievedAt: shift(nws.retrievedAt, minutes),
        lastAttempt: { ...nws.lastAttempt, at: shift(nws.retrievedAt, minutes) },
      });
      kv.store.set(LIVE_KEYS.nws, held);
      const r = await run("nws", kv);
      expect(r.outcome).toBe("not-newer");
      expect(kv.store.get(LIVE_KEYS.nws)).toBe(held);
      expect(kv.calls.filter((c) => c.method === "PUT").map((c) => c.key)).toEqual([
        statusKey("nws"),
      ]);
    }
  });

  it("an older value in KV is replaced; a value the site cannot use counts as empty", async () => {
    for (const held of [
      JSON.stringify({ ...nws, retrievedAt: shift(nws.retrievedAt, -60) }),
      "{not json",
    ]) {
      const kv = fakeKv();
      kv.store.set(LIVE_KEYS.nws, held);
      expect((await run("nws", kv)).outcome).toBe("written");
    }
  });

  it("an invalid payload never reaches KV (content hash, source, failed retrieval, not from this run)", async () => {
    const bad = [
      { ...nws, contentSha256: "0".repeat(64) },
      { ...nws, source: { ...nws.source, endpoint: "https://example.org/" } },
      { ...nws, lastAttempt: { at: nws.retrievedAt, ok: false, error: "HTTP 503" } },
    ];
    for (const v of bad) {
      writeLocal("data/current/nws.json", v);
      const kv = fakeKv();
      kv.store.set(LIVE_KEYS.nws, "GOOD");
      const r = await run("nws", kv);
      expect(r.outcome).toBe("failed");
      expect(kv.store.get(LIVE_KEYS.nws)).toBe("GOOD");
      expect(JSON.parse(kv.store.get(statusKey("nws"))!)).toMatchObject({
        ok: false,
        outcome: "failed",
      });
    }
    writeLocal("data/current/nws.json", nws);
    const kv = fakeKv();
    expect((await run("nws", kv, shift(nws.retrievedAt, 5))).outcome).toBe("failed");
    expect(kv.store.has(LIVE_KEYS.nws)).toBe(false);
  });

  it("KV read failure: no write; KV write failure: run fails; the token never appears in the reason", async () => {
    const readFail = fakeKv({ failGet: 500 });
    const r1 = await run("earthquakes", readFail);
    expect(r1.outcome).toBe("failed");
    expect(
      readFail.calls.filter((c) => c.method === "PUT" && c.key === LIVE_KEYS.earthquakes),
    ).toEqual([]);
    const writeFail = fakeKv({ failPut: 403 });
    const r2 = await run("earthquakes", writeFail);
    expect(r2.outcome).toBe("failed");
    expect(r2.reason).toMatch(/403/);
    for (const r of [r1, r2]) expect(JSON.stringify(r)).not.toContain(TOKEN);
    expect(writeFail.calls.every((c) => c.auth === `Bearer ${TOKEN}`)).toBe(true);
  });

  it("water: snapshot and series are one value; a mismatched series publishes nothing", async () => {
    const kv = fakeKv();
    expect((await run("water", kv)).outcome).toBe("written");
    const stored = JSON.parse(kv.store.get(LIVE_KEYS.water)!);
    expect(Object.keys(stored)).toEqual(["snapshot", "series"]);
    expect(stored.series.snapshotContentSha256).toBe(stored.snapshot.contentSha256);
    expect(kv.calls.filter((c) => c.method === "PUT").map((c) => c.key)).toEqual([
      LIVE_KEYS.water,
      statusKey("water"),
    ]);

    const series = local("data/current/usgs-water-series.json");
    writeLocal("data/current/usgs-water-series.json", {
      ...series,
      snapshotContentSha256: "0".repeat(64),
    });
    const kv2 = fakeKv();
    expect((await run("water", kv2)).outcome).toBe("failed");
    expect(kv2.store.has(LIVE_KEYS.water)).toBe(false);
  });

  it("water: the existing validator and the site's read checks each block a bad pair", async () => {
    // Hash that looks right but is not the data's: only the full validator recomputes it.
    const wrongHash = "a".repeat(64);
    writeLocal("data/current/usgs-water.json", { ...water, contentSha256: wrongHash });
    writeLocal("data/current/usgs-water-series.json", {
      ...local("data/current/usgs-water-series.json"),
      snapshotContentSha256: wrongHash,
    });
    const kv = fakeKv();
    expect((await run("water", kv)).outcome).toBe("failed");
    expect(kv.store.has(LIVE_KEYS.water)).toBe(false);
    // No series: the validator allows it, but the site needs snapshot and series stored together.
    writeLocal("data/current/usgs-water.json", water);
    writeLocal("data/current/usgs-water-series.json", null);
    const kv2 = fakeKv();
    expect((await run("water", kv2)).outcome).toBe("failed");
    expect(kv2.store.has(LIVE_KEYS.water)).toBe(false);
  });

  it("status keeps the last success across a later failure", async () => {
    const kv = fakeKv();
    await run("nws", kv);
    writeLocal("data/current/nws.json", {
      ...nws,
      lastAttempt: { at: nws.retrievedAt, ok: false, error: "timeout" },
    });
    await run("nws", kv);
    const status = JSON.parse(kv.store.get(statusKey("nws"))!) as Status;
    expect(status).toMatchObject({
      ok: false,
      outcome: "failed",
      lastSuccess: { retrievedAt: nws.retrievedAt },
    });
    expect(status.reason).not.toMatch(/\n|at .*\.ts:\d+/);
    expect(Object.keys(status).sort()).toEqual([
      "attemptAt",
      "lastSuccess",
      "ok",
      "outcome",
      "reason",
      "source",
    ]);
  });
});

describe("Live data → KV workflow", () => {
  const wf = read(".github/workflows/live-kv.yml");
  const code = read("scripts/live/publish.ts") + read("scripts/live/kv.ts");

  it("manual only, data only: no schedule, install, build or deploy", () => {
    expect(wf).toMatch(/^on:\n {2}workflow_dispatch:/m);
    expect(wf).not.toMatch(/^\s*schedule:|cron:/m);
    const runs = wf.match(/^\s*run: .*$/gm) ?? [];
    expect(runs.length).toBe(4);
    for (const line of runs) expect(line).not.toMatch(/npm|npx|wrangler|build|deploy|vite/);
    expect(runs.filter((l) => /node scripts\//.test(l))).toHaveLength(3);
    expect(wf).toMatch(/environment: live-data/);
    expect(wf).toMatch(/permissions:\n {2}contents: read/);
    expect(wf).toMatch(/persist-credentials: false/);
  });

  it("the token reaches only the publish step, through env, and is never echoed", () => {
    expect(wf.match(/secrets\.CLOUDFLARE_KV_API_TOKEN/g)).toHaveLength(1);
    expect(wf).not.toMatch(/echo .*(TOKEN|secrets\.)/);
    expect(code).not.toMatch(/console\.(log|error)\([^)]*(token|authorization|headers)/i);
  });
});
