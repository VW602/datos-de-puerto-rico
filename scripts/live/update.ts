/**
 * CURRENT DATA UPDATE (needs network): NWS active alerts and USGS earthquakes
 * for Puerto Rico → validated snapshots in data/current/.
 *
 *   npm run data:live:update        both sources
 *   npm run data:nws:update         NWS only
 *   npm run data:usgs:update        USGS only
 *
 * Built to run later on a schedule without changes: one request per source,
 * an honest User-Agent, conditional requests (ETag), a timeout, and at most
 * one retry a minute later (NWS asks clients not to retry faster than once a
 * minute). The exact response is kept only in .cache/live/raw (git-ignored).
 *
 * Last known good: if a source fails, its snapshot keeps the previous data
 * and retrieval time, and only records the failed attempt. A failure never
 * becomes "no alerts" or "no earthquakes". Exit code 1 when any source failed.
 * The site build never runs this.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateNws, validateUsgs } from "./check.ts";
import {
  normalizeNws,
  normalizeUsgs,
  nwsSnapshot,
  recordFailure,
  sha256,
  stableJson,
  usgsSnapshot,
  type Attempt,
  type NwsData,
  type Snapshot,
  type UsgsData,
} from "./normalize.ts";
import { NWS, NWS_OUTPUT, RAW_CACHE_DIR, USER_AGENT, USGS, USGS_OUTPUT } from "./source.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const TIMEOUT_MS = 30_000;
const RETRY_WAIT_MS = Number(process.env.LIVE_RETRY_WAIT_MS ?? 60_000);
const RETRYABLE = new Set([408, 429, 500, 502, 503, 504]);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Writes a file so readers see the old version or the new one, never half of one. */
export function atomicWrite(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp-${process.pid}`;
  writeFileSync(tmp, content);
  renameSync(tmp, path);
}

type Fetched = { text: string; status: number; etag: string | null; notModified: boolean };

async function fetchOnce(
  url: string,
  accept: string,
  cache: { etag: string | null; text: string | null },
): Promise<Fetched> {
  for (let attempt = 1; ; attempt += 1) {
    let problem: string;
    try {
      const headers: Record<string, string> = { "User-Agent": USER_AGENT, Accept: accept };
      if (cache.etag && cache.text) headers["If-None-Match"] = cache.etag;
      const response = await fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (response.status === 304 && cache.text)
        return { text: cache.text, status: 304, etag: cache.etag, notModified: true };
      const text = await response.text();
      if (response.ok)
        return {
          text,
          status: response.status,
          etag: response.headers.get("etag"),
          notModified: false,
        };
      if (!RETRYABLE.has(response.status)) throw new Error(`HTTP ${response.status}`);
      problem = `HTTP ${response.status}`;
    } catch (error) {
      problem = error instanceof Error ? error.message : String(error);
      if (/^HTTP \d+$/.test(problem) && !RETRYABLE.has(Number(problem.slice(5)))) throw error;
    }
    if (attempt >= 2) throw new Error(`${problem} (2 intentos)`);
    console.log(`  ${url}: ${problem}; nuevo intento en ${Math.round(RETRY_WAIT_MS / 1000)} s`);
    await sleep(RETRY_WAIT_MS);
  }
}

function readJson<T>(path: string): T | null {
  return existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as T) : null;
}

function rawCache(name: string): {
  etag: string | null;
  text: string | null;
  path: string;
  meta: string;
} {
  const path = join(ROOT, RAW_CACHE_DIR, `${name}.json`);
  const meta = join(ROOT, RAW_CACHE_DIR, `${name}.meta.json`);
  const m = readJson<{ etag: string | null; sha256: string }>(meta);
  const text = existsSync(path) ? readFileSync(path, "utf8") : null;
  // A cached body is reused only if it is the exact bytes recorded.
  const ok = m && text !== null && sha256(text) === m.sha256;
  return { etag: ok ? m!.etag : null, text: ok ? text : null, path, meta };
}

async function updateSource<T>(opts: {
  name: string;
  url: string;
  accept: string;
  output: string;
  normalize: (raw: string) => { sourceUpdatedAt: string | null; data: T };
  build: (args: {
    retrievedAt: string | null;
    sourceUpdatedAt: string | null;
    raw: Snapshot<T>["raw"];
    lastAttempt: Attempt;
    data: T;
  }) => Snapshot<T>;
  validate: (s: Snapshot<T>) => void;
  empty: T;
  listKey: "alerts" | "events";
}): Promise<boolean> {
  const outPath = join(ROOT, opts.output);
  const previous = readJson<Snapshot<T>>(outPath);
  const started = new Date().toISOString();
  const cache = rawCache(opts.name);
  try {
    const fetched = await fetchOnce(opts.url, opts.accept, cache);
    const retrievedAt = new Date().toISOString();
    const normalized = opts.normalize(fetched.text);
    const snapshot = opts.build({
      retrievedAt,
      sourceUpdatedAt: normalized.sourceUpdatedAt,
      raw: {
        sha256: sha256(fetched.text),
        bytes: Buffer.byteLength(fetched.text),
        note: `Respuesta exacta de ${opts.url}; solo en la copia local (${RAW_CACHE_DIR}).${fetched.notModified ? " La fuente respondió 304 (sin cambios): se reusó la copia local verificada." : ""}`,
      },
      lastAttempt: { at: retrievedAt, ok: true, error: null },
      data: normalized.data,
    });
    opts.validate(snapshot);
    if (!fetched.notModified) {
      atomicWrite(cache.path, fetched.text);
      atomicWrite(
        cache.meta,
        JSON.stringify(
          {
            url: opts.url,
            retrievedAt,
            etag: fetched.etag,
            sha256: sha256(fetched.text),
            bytes: Buffer.byteLength(fetched.text),
          },
          null,
          2,
        ) + "\n",
      );
    }
    atomicWrite(outPath, stableJson(snapshot as Snapshot<unknown>, opts.listKey));
    console.log(
      `${opts.name}: ${(snapshot.data as Record<string, unknown[]>)[opts.listKey].length} registros${fetched.notModified ? " (sin cambios)" : ""}, ${retrievedAt}`,
    );
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const failed = recordFailure(
      previous,
      { at: started, ok: false, error: message.slice(0, 200) },
      opts.empty,
      opts.build,
    );
    atomicWrite(outPath, stableJson(failed as Snapshot<unknown>, opts.listKey));
    console.error(
      `${opts.name}: falló (${message}). Se conserva la última copia buena${previous?.retrievedAt ? ` del ${previous.retrievedAt}` : " (no hay ninguna)"}.`,
    );
    return false;
  }
}

async function main() {
  const census = JSON.parse(
    readFileSync(join(ROOT, "data/generated/census-municipios.json"), "utf8"),
  ) as { municipios: Record<string, unknown> };
  const municipioIds = new Set(Object.keys(census.municipios));
  const only = process.argv.find((a) => a.startsWith("--only="))?.slice(7);
  const results: boolean[] = [];
  if (!only || only === "nws") {
    results.push(
      await updateSource<NwsData>({
        name: "nws-alerts-pr",
        url: NWS.endpoint,
        accept: "application/geo+json",
        output: NWS_OUTPUT,
        normalize: (raw) => {
          const n = normalizeNws(raw, municipioIds);
          return { sourceUpdatedAt: n.sourceUpdatedAt, data: { alerts: n.alerts } };
        },
        build: nwsSnapshot,
        validate: (s) => validateNws(s, municipioIds),
        empty: { alerts: [] },
        listKey: "alerts",
      }),
    );
  }
  if (!only || only === "usgs") {
    results.push(
      await updateSource<UsgsData>({
        name: "usgs-all-week",
        url: USGS.endpoint,
        accept: "application/geo+json",
        output: USGS_OUTPUT,
        normalize: (raw) => {
          const n = normalizeUsgs(raw);
          return {
            sourceUpdatedAt: n.sourceUpdatedAt,
            data: { windowHours: 168, worldCount: n.worldCount, events: n.events },
          };
        },
        build: usgsSnapshot,
        validate: validateUsgs,
        empty: { windowHours: 168, worldCount: null, events: [] },
        listKey: "events",
      }),
    );
  }
  if (results.some((ok) => !ok)) process.exit(1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
