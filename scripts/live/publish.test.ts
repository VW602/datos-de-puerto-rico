import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LIVE_KEYS } from "../../src/data/pr/liveData.ts";
import { LIVE_KV } from "../../src/lib/live-kv.ts";
import type { Fetch, KvConfig } from "./kv.ts";
import { SCHEDULES } from "../../infra/datos-scheduler/index.ts";
import { handleLive, type BuiltIn, type KvReader } from "../../src/server/liveRead.ts";
import { freshness } from "../../src/data/pr/currentModel.ts";
import { publishSource, statusChanged, statusKey, type Status } from "./publish.ts";
import { SOURCE_CHOICES, chooseSources } from "./sources.ts";

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
function fakeKv(opts: { failGet?: number; failPut?: number; failGetKey?: string } = {}) {
  const store = new Map<string, string>();
  const calls: { method: string; key: string; auth: string | null }[] = [];
  const impl: Fetch = async (url, init) => {
    const key = decodeURIComponent(url.split("/values/")[1]!);
    const method = init.method ?? "GET";
    calls.push({ method, key, auth: new Headers(init.headers).get("authorization") });
    if (method === "GET") {
      if (opts.failGet || opts.failGetKey === key)
        return new Response(
          JSON.stringify({
            success: false,
            errors: [{ code: 10000, message: "Authentication error" }],
          }),
          { status: opts.failGet ?? 500 },
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
    // A success records its state; live:nws itself is the current success.
    expect(status).toEqual({
      source: "nws",
      ok: true,
      outcome: "written",
      since: "2026-10-14T12:00:00.000Z",
      lastAttemptAt: null,
      reason: null,
      lastSuccess: null,
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
      since: "2026-10-14T12:00:00.000Z",
      lastAttemptAt: "2026-10-14T12:00:00.000Z",
      lastSuccess: { retrievedAt: nws.retrievedAt },
    });
    expect(status.reason).not.toMatch(/\n|at .*\.ts:\d+/);
    expect(Object.keys(status).sort()).toEqual([
      "lastAttemptAt",
      "lastSuccess",
      "ok",
      "outcome",
      "reason",
      "since",
      "source",
    ]);
  });
});

describe("Live data → KV workflow", () => {
  const wf = read(".github/workflows/live-kv.yml");
  const code = read("scripts/live/publish.ts") + read("scripts/live/kv.ts");

  it("dispatched only (no GitHub schedule), data only: no install, build or deploy", () => {
    expect(wf).toMatch(/^on:\n {2}workflow_dispatch:/m);
    expect(wf).not.toMatch(/^\s*schedule:|cron:/m);
    const runs = wf.match(/^\s*run: .*$/gm) ?? [];
    expect(runs.length).toBe(5);
    for (const line of runs) expect(line).not.toMatch(/npm|npx|wrangler|build|deploy|vite/);
    expect(runs.filter((l) => /node scripts\//.test(l))).toHaveLength(4);
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

// ---------------------------------------------------------------------------
// KV-002: fewer KV writes, same freshness.

const eqBase = JSON.parse(read("data/current/usgs-earthquakes.json"));
const seriesBase = JSON.parse(read("data/current/usgs-water-series.json"));
const DAY = "2026-10-14T00:00:00.000Z";
const at = (minute: number) => shift(DAY, minute);

/** Local copies as if this run retrieved them `minutes` after the committed ones (same content). */
function retrieve(source: "nws" | "earthquakes" | "water", minutes: number) {
  if (source === "water") {
    const t = shift(water.retrievedAt, minutes);
    writeLocal("data/current/usgs-water.json", {
      ...water,
      retrievedAt: t,
      lastAttempt: { ...water.lastAttempt, at: t },
    });
    writeLocal("data/current/usgs-water-series.json", { ...seriesBase, retrievedAt: t });
    return t;
  }
  const base = source === "nws" ? nws : eqBase;
  const file = source === "nws" ? "data/current/nws.json" : "data/current/usgs-earthquakes.json";
  const t = shift(base.retrievedAt, minutes);
  writeLocal(file, { ...base, retrievedAt: t, lastAttempt: { ...base.lastAttempt, at: t } });
  return t;
}
const failNws = () =>
  writeLocal("data/current/nws.json", {
    ...nws,
    lastAttempt: { at: nws.retrievedAt, ok: false, error: "timeout" },
  });
const runAt = (
  source: "nws" | "earthquakes" | "water",
  kv: ReturnType<typeof fakeKv>,
  nowIso: string,
) =>
  publishSource({
    source,
    kv: KV,
    root: dir,
    municipioIds: ids,
    runStartedAt: RUN,
    fetchImpl: kv.impl,
    now: () => new Date(nowIso),
  });
const count = (kv: ReturnType<typeof fakeKv>, method: string, key?: string) =>
  kv.calls.filter((c) => c.method === method && (key === undefined || c.key === key)).length;
const statusOf = (kv: ReturnType<typeof fakeKv>, source: "nws" | "earthquakes" | "water") =>
  JSON.parse(kv.store.get(statusKey(source))!) as Status;

describe("status:<source> records changes of state, not every success", () => {
  it("repeated successes publish the data every time, the status only once", async () => {
    const kv = fakeKv();
    let last = "";
    for (let i = 1; i <= 4; i++) {
      last = retrieve("nws", i * 15);
      expect((await runAt("nws", kv, at(i * 15))).outcome).toBe("written");
    }
    expect(count(kv, "PUT", LIVE_KEYS.nws)).toBe(4);
    expect(count(kv, "PUT", statusKey("nws"))).toBe(1);
    expect(JSON.parse(kv.store.get(LIVE_KEYS.nws)!).retrievedAt).toBe(last);
    // The record says since when it has been fine; it carries no attempt time that could go stale.
    expect(statusOf(kv, "nws")).toMatchObject({
      ok: true,
      outcome: "written",
      since: at(15),
      lastAttemptAt: null,
      lastSuccess: null,
    });
  });

  it("unchanged source content is still published with its new retrieval time (freshness)", async () => {
    const kv = fakeKv();
    retrieve("nws", 15);
    await runAt("nws", kv, at(15));
    const first = JSON.parse(kv.store.get(LIVE_KEYS.nws)!);
    const t = retrieve("nws", 30);
    expect((await runAt("nws", kv, at(30))).outcome).toBe("written");
    const second = JSON.parse(kv.store.get(LIVE_KEYS.nws)!);
    expect(second.data).toEqual(first.data);
    expect(second.contentSha256).toBe(first.contentSha256);
    expect(second.retrievedAt).toBe(t);
    expect(count(kv, "PUT", statusKey("nws"))).toBe(1);
  });

  it("every failure is recorded: since stays at its start, lastAttemptAt moves, lastSuccess is the copy KV serves", async () => {
    const kv = fakeKv();
    const good = retrieve("nws", 15);
    await runAt("nws", kv, at(15));
    failNws();
    await runAt("nws", kv, at(30));
    await runAt("nws", kv, at(45));
    expect(count(kv, "PUT", statusKey("nws"))).toBe(3);
    expect(count(kv, "PUT", LIVE_KEYS.nws)).toBe(1);
    expect(statusOf(kv, "nws")).toMatchObject({
      ok: false,
      outcome: "failed",
      since: at(30),
      lastAttemptAt: at(45),
      lastSuccess: { retrievedAt: good },
    });
    expect(JSON.parse(kv.store.get(LIVE_KEYS.nws)!).retrievedAt).toBe(good);
  });

  it("a failure with nothing usable in KV says so (no invented last success)", async () => {
    const kv = fakeKv();
    failNws();
    await runAt("nws", kv, at(15));
    expect(statusOf(kv, "nws")).toMatchObject({ ok: false, lastSuccess: null });
  });

  it("recovery after a failure is recorded once, then quiet again", async () => {
    const kv = fakeKv();
    failNws();
    await runAt("nws", kv, at(15));
    retrieve("nws", 30);
    await runAt("nws", kv, at(30));
    expect(statusOf(kv, "nws")).toMatchObject({
      ok: true,
      outcome: "written",
      since: at(30),
      lastAttemptAt: null,
      lastSuccess: null,
      reason: null,
    });
    retrieve("nws", 45);
    await runAt("nws", kv, at(45));
    expect(count(kv, "PUT", statusKey("nws"))).toBe(2);
  });

  it("written ↔ not-newer: one record per change", async () => {
    const kv = fakeKv();
    retrieve("nws", 15);
    await runAt("nws", kv, at(15)); // written: record 1
    expect((await runAt("nws", kv, at(30))).outcome).toBe("not-newer"); // record 2
    await runAt("nws", kv, at(45)); // not-newer again: no record
    retrieve("nws", 60);
    await runAt("nws", kv, at(60)); // written: record 3
    expect(count(kv, "PUT", statusKey("nws"))).toBe(3);
    expect(statusOf(kv, "nws")).toMatchObject({ outcome: "written", since: at(60) });
  });

  it("a record of the older shape is replaced once", async () => {
    const kv = fakeKv();
    kv.store.set(
      statusKey("nws"),
      JSON.stringify({
        source: "nws",
        ok: true,
        outcome: "written",
        attemptAt: "2026-10-13T00:00:00.000Z",
        reason: null,
        lastSuccess: { retrievedAt: nws.retrievedAt, publishedAt: "2026-10-13T00:00:00.000Z" },
      }),
    );
    retrieve("nws", 15);
    await runAt("nws", kv, at(15));
    retrieve("nws", 30);
    await runAt("nws", kv, at(30));
    expect(count(kv, "PUT", statusKey("nws"))).toBe(1);
    expect(Object.keys(statusOf(kv, "nws"))).not.toContain("attemptAt");
  });

  it("when the stored record cannot be read, the state is written again (never skipped on doubt)", async () => {
    const kv = fakeKv({ failGetKey: statusKey("nws") });
    for (const m of [15, 30]) {
      retrieve("nws", m);
      expect((await runAt("nws", kv, at(m))).outcome).toBe("written");
    }
    expect(count(kv, "PUT", statusKey("nws"))).toBe(2);
  });

  it("statusChanged: failures always; successes only when the record is missing, old, unreadable or different", () => {
    const ok = (outcome: string) =>
      JSON.stringify({ ok: true, outcome, since: DAY, lastAttemptAt: null, lastSuccess: null });
    const failed = JSON.stringify({ ok: false, outcome: "failed", since: DAY });
    expect(statusChanged(ok("written"), "failed")).toBe(true);
    expect(statusChanged(failed, "failed")).toBe(true);
    expect(statusChanged(null, "written")).toBe(true);
    expect(statusChanged("{not json", "written")).toBe(true);
    expect(statusChanged(JSON.stringify({ ok: true, outcome: "written" }), "written")).toBe(true);
    expect(statusChanged(failed, "written")).toBe(true);
    expect(statusChanged(ok("not-newer"), "written")).toBe(true);
    expect(statusChanged(ok("written"), "not-newer")).toBe(true);
    expect(statusChanged(ok("written"), "written")).toBe(false);
    expect(statusChanged(ok("not-newer"), "not-newer")).toBe(false);
  });
});

describe("which sources a run refreshes", () => {
  it("the scheduler's two crons: alerts and earthquakes every 15 minutes, water alone at minute 7", () => {
    expect(chooseSources("auto", String(SCHEDULES["*/15 * * * *"]!.refresh_water))).toEqual([
      "nws",
      "earthquakes",
    ]);
    expect(chooseSources("auto", String(SCHEDULES["7 * * * *"]!.refresh_water))).toEqual(["water"]);
  });

  it("a manual run can refresh all three, or any one set; anything else fails closed", () => {
    expect(chooseSources("all", "false")).toEqual(["nws", "earthquakes", "water"]);
    expect(chooseSources("all", "true")).toEqual(["nws", "earthquakes", "water"]);
    expect(chooseSources("nws,earthquakes", "true")).toEqual(["nws", "earthquakes"]);
    expect(chooseSources("water", "false")).toEqual(["water"]);
    expect(chooseSources("auto", "false")).toEqual(["nws", "earthquakes"]);
    expect(() => chooseSources("everything", "false")).toThrow();
    expect(() => chooseSources("auto", "yes")).toThrow();
  });

  it("the workflow wires it: a sources input defaulting to auto, chosen before any refresh", () => {
    const wf = read(".github/workflows/live-kv.yml");
    expect(wf).toMatch(/sources:\n(?: {8}.*\n)*? {8}default: auto/);
    expect(wf).toContain(
      `options: [${SOURCE_CHOICES.map((c) => (c.includes(",") ? `"${c}"` : c)).join(", ")}]`,
    );
    const pick = wf.indexOf("id: pick");
    expect(pick).toBeGreaterThan(0);
    expect(pick).toBeLessThan(wf.indexOf("node scripts/live/update.ts"));
    expect(pick).toBeLessThan(wf.indexOf("node scripts/water/update.ts"));
    expect(wf).toMatch(
      /if: contains\(steps\.pick\.outputs\.sources, 'nws'\)\n\s+continue-on-error: true\n\s+run: node scripts\/live\/update\.ts/,
    );
    expect(wf).toMatch(
      /if: contains\(steps\.pick\.outputs\.sources, 'water'\)\n\s+continue-on-error: true\n\s+run: node scripts\/water\/update\.ts/,
    );
    expect(wf).toMatch(/SOURCES: \$\{\{ steps\.pick\.outputs\.sources \}\}/);
    // Inputs reach the script through env, never pasted into the command line.
    expect(wf).not.toMatch(/run: .*\$\{\{ inputs\./);
  });

  it("the scheduler sends no sources input, so its runs take the default (auto)", async () => {
    const { dispatchRequest } = await import("../../infra/datos-scheduler/index.ts");
    for (const cron of Object.keys(SCHEDULES)) {
      const body = JSON.parse(await dispatchRequest(cron, "t").text());
      expect(Object.keys(body.inputs).sort()).toEqual(["refresh_water", "target"]);
    }
  });
});

describe("a day of scheduled runs: KV operations and freshness", () => {
  it("about 216 writes a day (was 528), with alerts and earthquakes every 15 minutes and water hourly", async () => {
    const kv = fakeKv();
    const published: Record<string, number[]> = { nws: [], earthquakes: [], water: [] };
    for (let minute = 0; minute < 24 * 60; minute++) {
      const crons = Object.keys(SCHEDULES).filter((c) =>
        c === "*/15 * * * *" ? minute % 15 === 0 : minute % 60 === 7,
      );
      for (const cron of crons)
        for (const source of chooseSources("auto", String(SCHEDULES[cron]!.refresh_water))) {
          // Water's validator recomputes per-series freshness against retrievedAt, so its
          // copies move by seconds (still strictly newer), not by the run's hour.
          retrieve(source, source === "water" ? (published.water!.length + 1) / 60 : minute + 1);
          const r = await runAt(source, kv, at(minute));
          expect(r.outcome).toBe("written");
          published[source]!.push(minute);
        }
    }
    const dataPuts = Object.values(LIVE_KEYS).reduce((n, k) => n + count(kv, "PUT", k), 0);
    const statusPuts = (["nws", "earthquakes", "water"] as const).reduce(
      (n, s) => n + count(kv, "PUT", statusKey(s)),
      0,
    );
    expect(dataPuts).toBe(96 * 2 + 24);
    // One record per source when KV starts empty; none after that while all is well.
    expect(statusPuts).toBe(3);
    expect(count(kv, "GET")).toBe(2 * (96 * 2 + 24));
    // Freshness: every source published at its cadence, never more than its interval apart.
    const gaps = (m: number[]) => m.slice(1).map((v, i) => v - m[i]!);
    expect(published.nws).toHaveLength(96);
    expect(Math.max(...gaps(published.nws!))).toBe(15);
    expect(Math.max(...gaps(published.earthquakes!))).toBe(15);
    expect(published.water).toHaveLength(24);
    expect(Math.max(...gaps(published.water!))).toBe(60);
  }, 120_000);

  it("the site reads only live:<source>: its freshness does not depend on status:<source>", async () => {
    const kv = fakeKv();
    for (const s of ["nws", "earthquakes", "water"] as const) {
      retrieve(s, s === "water" ? 0.5 : 30);
      expect((await runAt(s, kv, at(30))).outcome).toBe("written");
    }
    for (const s of ["nws", "earthquakes", "water"] as const) kv.store.delete(statusKey(s));
    const reads: string[] = [];
    const reader: KvReader = {
      get: async (key) => {
        reads.push(key);
        return kv.store.get(key) ?? null;
      },
    };
    const builtIn = {
      nws,
      earthquakes: eqBase,
      water: { snapshot: water, series: seriesBase },
    } as unknown as BuiltIn;
    const res = await handleLive(new Request("https://x/live/status.json"), reader, builtIn);
    const status = (await res.json()) as {
      sources: Record<string, { kv: string; retrievedAt: string }>;
    };
    for (const s of ["nws", "earthquakes", "water"]) expect(status.sources[s]!.kv).toBe("newer");
    expect(reads.some((k) => k.startsWith("status:"))).toBe(false);
    // Published 30 minutes after the committed copy and judged one minute later: current.
    const published = status.sources.nws!.retrievedAt;
    expect(freshness(published, new Date(Date.parse(published) + 60_000), nws.freshness)).toBe(
      "CURRENT",
    );
  });
});
