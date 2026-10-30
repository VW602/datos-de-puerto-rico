/**
 * LIVE DATA → KV (needs network and a KV token): publishes the snapshots the
 * updaters just wrote in data/current/ to Cloudflare Workers KV, where the
 * site's /live/* routes read them. No build and no deploy: the Worker stays
 * the same version.
 *
 *   node scripts/live/publish.ts --target=preview|production --sources=nws,earthquakes[,water]
 *
 *   env CLOUDFLARE_KV_API_TOKEN  token with Workers KV Storage: Edit (never printed)
 *       CLOUDFLARE_ACCOUNT_ID
 *       RUN_STARTED_AT          ISO time this run started; older snapshots are not published
 *
 * For each source, in order, and only if every step passes:
 *   1. the snapshot comes from a successful retrieval in this run;
 *   2. it passes the existing validators (scripts/live/check.ts,
 *      scripts/water/check.ts) and the site's read checks;
 *   3. it is newer than what KV holds;
 *   4. it is written whole: one value per source, water snapshot and series
 *      together.
 * Otherwise nothing is written for that source; good data in KV stays, and
 * the run exits 1 on any failure.
 *
 * A small status:<source> value records the source's state, not every
 * attempt (Workers KV writes are limited): it is written on every failure,
 * on every change of state (failure → success, written ↔ not-newer) and when
 * the stored record is missing or of the older shape, but not again while the
 * same success repeats. A successful copy is always in live:<source>, whose
 * retrievedAt the site uses for freshness; the GitHub run log keeps every attempt.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  LIVE_KEYS,
  isNewer,
  isNwsSnapshot,
  isUsgsSnapshot,
  isWaterBundle,
} from "../../src/data/pr/liveData.ts";
import { LIVE_KV } from "../../src/lib/live-kv.ts";
import { validateWater } from "../water/check.ts";
import { WATER_OUTPUT, WATER_SERIES_OUTPUT } from "../water/source.ts";
import { validateNws, validateUsgs } from "./check.ts";
import { kvGet, kvPut, type Fetch, type KvConfig } from "./kv.ts";
import { NWS_OUTPUT, USGS_OUTPUT } from "./source.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");

export type LiveSource = "nws" | "earthquakes" | "water";
export const LIVE_SOURCES: LiveSource[] = ["nws", "earthquakes", "water"];
export const statusKey = (source: LiveSource) => `status:${source}`;

export type Outcome = "written" | "not-newer" | "failed";
export type Result = {
  source: LiveSource;
  outcome: Outcome;
  retrievedAt: string | null;
  reason: string | null;
};

/**
 * Small, public-safe operational record: no visitor data, no stack traces.
 * It describes the current state and holds no timestamp that would go stale
 * while that state repeats without being rewritten.
 */
export type Status = {
  source: LiveSource;
  ok: boolean;
  outcome: Outcome;
  /** First attempt with this outcome. Not rewritten while the outcome repeats. */
  since: string;
  /** Failures only: the latest failed attempt (every failure is written). Null while ok. */
  lastAttemptAt: string | null;
  reason: string | null;
  /**
   * Failures only: the copy still served from live:<source> (the last success),
   * read from KV when the failure is recorded. Null while ok: then live:<source>
   * itself is the current success.
   */
  lastSuccess: { retrievedAt: string } | null;
};

/**
 * Whether this outcome needs a new status record: always for a failure, and for
 * a success only when the stored record is missing, of the older shape, or says
 * something else (a failure, or the other success outcome).
 */
export function statusChanged(previous: string | null, outcome: Outcome): boolean {
  if (outcome === "failed" || previous === null) return true;
  try {
    const p = JSON.parse(previous) as Partial<Status>;
    return typeof p.since !== "string" || p.ok !== true || p.outcome !== outcome;
  } catch {
    return true;
  }
}

type Prepared = { key: string; value: string; retrievedAt: string };
type Snap = {
  retrievedAt: string | null;
  lastAttempt?: { at: string; ok: boolean; error: string | null };
};

/** First line only, short: never a stack trace. */
const reasonOf = (error: unknown) =>
  (error instanceof Error ? error.message : String(error)).split("\n")[0]!.slice(0, 200);

const readJson = <T>(root: string, path: string): T =>
  JSON.parse(readFileSync(join(root, path), "utf8")) as T;

/** The snapshot must be a successful retrieval made during this run. */
function assertFresh(s: Snap, runStartedAt: string): string {
  const at = s.retrievedAt;
  if (!s.lastAttempt?.ok || !at || s.lastAttempt.at !== at)
    throw new Error(`la actualización falló: ${s.lastAttempt?.error ?? "sin copia nueva"}`);
  if (Date.parse(at) < Date.parse(runStartedAt))
    throw new Error(`la copia es anterior a esta corrida (${at})`);
  return at;
}

/** Reads, checks and serializes one source's value for KV. Throws if anything is off. */
export function prepare(
  source: LiveSource,
  root: string,
  municipioIds: Set<string>,
  runStartedAt: string,
): Prepared {
  if (source === "nws") {
    const s = readJson<Snap>(root, NWS_OUTPUT);
    const retrievedAt = assertFresh(s, runStartedAt);
    validateNws(s as never, municipioIds);
    if (!isNwsSnapshot(s)) throw new Error("no pasa las comprobaciones de lectura del sitio");
    return { key: LIVE_KEYS.nws, value: JSON.stringify(s), retrievedAt };
  }
  if (source === "earthquakes") {
    const s = readJson<Snap>(root, USGS_OUTPUT);
    const retrievedAt = assertFresh(s, runStartedAt);
    validateUsgs(s as never);
    if (!isUsgsSnapshot(s)) throw new Error("no pasa las comprobaciones de lectura del sitio");
    return { key: LIVE_KEYS.earthquakes, value: JSON.stringify(s), retrievedAt };
  }
  const snapshot = readJson<Snap>(root, WATER_OUTPUT);
  const series = readJson<unknown>(root, WATER_SERIES_OUTPUT);
  const retrievedAt = assertFresh(snapshot, runStartedAt);
  validateWater(snapshot as never, series as never, municipioIds);
  const bundle = { snapshot, series };
  if (!isWaterBundle(bundle)) throw new Error("agua: la serie no corresponde a la copia");
  return { key: LIVE_KEYS.water, value: JSON.stringify(bundle), retrievedAt };
}

/** retrievedAt of the value KV holds, or null if it holds nothing usable by the site. */
export function storedRetrievedAt(source: LiveSource, text: string | null): string | null {
  if (text === null) return null;
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    return null;
  }
  if (source === "nws") return isNwsSnapshot(v) ? v.retrievedAt : null;
  if (source === "earthquakes") return isUsgsSnapshot(v) ? v.retrievedAt : null;
  return isWaterBundle(v) ? v.snapshot.retrievedAt : null;
}

export async function publishSource(opts: {
  source: LiveSource;
  kv: KvConfig;
  root?: string;
  municipioIds: Set<string>;
  runStartedAt: string;
  fetchImpl?: Fetch;
  now?: () => Date;
}): Promise<Result> {
  const { source, kv, municipioIds, runStartedAt, fetchImpl = fetch } = opts;
  const root = opts.root ?? ROOT;
  const now = opts.now ?? (() => new Date());
  let result: Result;
  try {
    const prepared = prepare(source, root, municipioIds, runStartedAt);
    const stored = storedRetrievedAt(source, await kvGet(kv, prepared.key, fetchImpl));
    if (stored && !isNewer(prepared.retrievedAt, stored)) {
      result = {
        source,
        outcome: "not-newer",
        retrievedAt: stored,
        reason: `KV ya tiene ${stored}`,
      };
    } else {
      await kvPut(kv, prepared.key, prepared.value, fetchImpl);
      result = { source, outcome: "written", retrievedAt: prepared.retrievedAt, reason: null };
    }
  } catch (error) {
    result = { source, outcome: "failed", retrievedAt: null, reason: reasonOf(error) };
  }
  // Status: written only when the state needs recording (see statusChanged).
  // A status problem fails the run but never touches data.
  try {
    let previous: string | null = null;
    try {
      previous = await kvGet(kv, statusKey(source), fetchImpl);
    } catch {
      previous = null; // unknown: record the state again
    }
    if (statusChanged(previous, result.outcome)) {
      const attemptAt = now().toISOString();
      const failing = result.outcome === "failed";
      let prior: Partial<Status> | null = null;
      try {
        prior = previous ? (JSON.parse(previous) as Partial<Status>) : null;
      } catch {
        prior = null;
      }
      const sameOutcome =
        typeof prior?.since === "string" &&
        prior.outcome === result.outcome &&
        prior.ok === !failing;
      let lastSuccess: Status["lastSuccess"] = null;
      if (failing) {
        // The last success is the copy KV still serves for this source.
        try {
          const at = storedRetrievedAt(source, await kvGet(kv, LIVE_KEYS[source], fetchImpl));
          lastSuccess = at ? { retrievedAt: at } : null;
        } catch {
          lastSuccess = null;
        }
      }
      const status: Status = {
        source,
        ok: !failing,
        outcome: result.outcome,
        since: sameOutcome ? prior!.since! : attemptAt,
        lastAttemptAt: failing ? attemptAt : null,
        reason: result.reason,
        lastSuccess,
      };
      await kvPut(kv, statusKey(source), JSON.stringify(status), fetchImpl);
    }
  } catch (error) {
    if (result.outcome !== "failed")
      result = { ...result, outcome: "failed", reason: `estado: ${reasonOf(error)}` };
  }
  return result;
}

function arg(name: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
}

async function main() {
  const target = arg("target");
  if (target !== "preview" && target !== "production")
    throw new Error("--target=preview|production");
  const sources = (arg("sources") ?? "nws,earthquakes").split(",").filter(Boolean) as LiveSource[];
  if (!sources.length || sources.some((s) => !LIVE_SOURCES.includes(s)))
    throw new Error("--sources=nws,earthquakes,water");
  const token = process.env.CLOUDFLARE_KV_API_TOKEN?.trim();
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const runStartedAt = process.env.RUN_STARTED_AT?.trim();
  if (!token || !accountId)
    throw new Error("faltan CLOUDFLARE_KV_API_TOKEN o CLOUDFLARE_ACCOUNT_ID");
  if (!runStartedAt || !Number.isFinite(Date.parse(runStartedAt)))
    throw new Error("falta RUN_STARTED_AT");
  const kv: KvConfig = {
    accountId,
    token,
    namespaceId: target === "production" ? LIVE_KV.id : LIVE_KV.previewId,
  };
  const census = readJson<{ municipios: Record<string, unknown> }>(
    ROOT,
    "data/generated/census-municipios.json",
  );
  const municipioIds = new Set(Object.keys(census.municipios));
  let failed = false;
  for (const source of sources) {
    const r = await publishSource({ source, kv, municipioIds, runStartedAt });
    console.log(
      `${target} ${source}: ${r.outcome}${r.retrievedAt ? ` (${r.retrievedAt})` : ""}${r.reason ? ` — ${r.reason}` : ""}`,
    );
    if (r.outcome === "failed") failed = true;
  }
  if (failed) process.exit(1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(reasonOf(error));
    process.exit(1);
  });
}
