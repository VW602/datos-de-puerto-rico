/**
 * DATA UPDATE (needs network): asks the official USAspending API for Puerto
 * Rico's federal obligations, outlays and award counts by place of
 * performance. Only api.usaspending.gov is contacted.
 *
 *   npm run data:usaspending:update
 *
 * Resumable. Each successful response is kept in .cache/usaspending/
 * (git-ignored) with its request, SHA-256 and time. If the run stops, running
 * it again only asks for what is missing. A cached response is reused only
 * when its request is byte-for-byte the planned one, under the same plan
 * fingerprint and the same USAspending "last updated" date; otherwise the
 * cache is discarded (and the log says so).
 *
 * All or nothing: data/raw/usaspending/ is replaced only after every planned
 * response is present and the whole snapshot passes the offline generator's
 * checks. About 450 requests, one at a time, with pauses: plan on 15–30
 * minutes. No key is needed. The app build never runs this.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildFunds, sha256, assertMunicipios, type UsaManifest } from "./pipeline.ts";
import { planFingerprint, planRequests, requestId, type PlannedRequest } from "./plan.ts";
import { cacheMatches, responseProblem, type Expected, type StagedMeta } from "./staging.ts";
import {
  API,
  MANIFEST,
  RAW_DIR,
  STAGING_DIR,
  TERMS,
  USA_GENERATOR_VERSION,
  latestCompleteFiscalYear,
} from "./source.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const USER_AGENT =
  "puerto-rico-datos/0.1 (open-source civic data project; USAspending pipeline; one request at a time)";

const PAUSE_MS = 1200;
const PAUSE_JITTER_MS = 400;
const TIMEOUT_MS = 90_000;
const MAX_ATTEMPTS = 7;
const BACKOFF_BASE_MS = 5000;
const BACKOFF_MAX_MS = 120_000;
/** Documented transient HTTP statuses; anything else fails at once. */
const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);

const STAGE = join(ROOT, STAGING_DIR);
const RESPONSES = join(STAGE, "responses");
const RUN = join(STAGE, "run.json");

type Run = {
  planFingerprint: string;
  fiscalYear: number;
  sourceLastUpdated: string;
  startedAt: string;
};
type Meta = StagedMeta;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const jitter = (max: number) => Math.floor(Math.random() * max);
const seconds = (ms: number) => `${Math.round(ms / 1000)} s`;

class FetchFailed extends Error {}

async function send(
  request: PlannedRequest,
  body: Record<string, unknown> | null,
  label: string,
): Promise<{ text: string; status: number }> {
  for (let attempt = 1; ; attempt += 1) {
    let status = 0;
    let problem: string;
    let wait = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** (attempt - 1)) + jitter(1000);
    try {
      const response = await fetch(API + request.endpoint, {
        method: request.method,
        headers: { "Content-Type": "application/json", "User-Agent": USER_AGENT },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      status = response.status;
      const text = await response.text();
      if (response.ok) {
        const invalid = responseProblem(text, request);
        if (!invalid) return { text, status };
        // An empty or cut-off 200 is a transport problem; an API error message is not.
        if (invalid.startsWith("error de la API")) throw new FetchFailed(`${label}: ${invalid}`);
        problem = `HTTP 200 inválido (${invalid})`;
      } else if (RETRYABLE_STATUS.has(status)) {
        problem = `HTTP ${status}`;
        const after = Number(response.headers.get("retry-after"));
        if (Number.isFinite(after) && after > 0) wait = Math.min(300_000, after * 1000);
      } else {
        throw new FetchFailed(`${label}: HTTP ${status} ${text.slice(0, 200)}`);
      }
    } catch (error) {
      if (error instanceof FetchFailed) throw error;
      problem = `red: ${error instanceof Error ? (error.cause instanceof Error ? error.cause.message : error.message) : String(error)}`;
    }
    if (attempt >= MAX_ATTEMPTS)
      throw new FetchFailed(
        `${label}: ${problem} (intento ${attempt}/${MAX_ATTEMPTS}, se detiene)`,
      );
    console.log(
      `  ${label}: ${problem}; intento ${attempt + 1}/${MAX_ATTEMPTS} en ${seconds(wait)}`,
    );
    await sleep(wait);
  }
}

function readCached(
  id: string,
  expected: Expected,
  request: PlannedRequest,
): { meta: Meta; text: string } | null {
  const metaPath = join(RESPONSES, `${id}.meta.json`);
  const bodyPath = join(RESPONSES, `${id}.json`);
  if (!existsSync(metaPath) || !existsSync(bodyPath)) return null;
  const meta = JSON.parse(readFileSync(metaPath, "utf8")) as Meta;
  const bytes = readFileSync(bodyPath);
  return cacheMatches(meta, expected, bytes, request)
    ? { meta, text: bytes.toString("utf8") }
    : null;
}

function stage(meta: Meta, text: string): void {
  // Body first, then meta: a response without its meta file is never reused.
  writeFileSync(join(RESPONSES, `${meta.id}.json`), text);
  writeFileSync(join(RESPONSES, `${meta.id}.meta.json`), JSON.stringify(meta, null, 2) + "\n");
}

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

  const fiscalYear = latestCompleteFiscalYear(new Date().toISOString().slice(0, 10));
  const plan = planRequests(
    municipios.map((m) => m.id),
    fiscalYear,
  );
  const fingerprint = planFingerprint(plan);

  // USAspending's own "last updated" date, always asked fresh: a cache from
  // before a USAspending refresh is not mixed with data from after it.
  const lastUpdatedRequest = plan.find((p) => p.key === "meta/last-updated")!;
  const fresh = await send(lastUpdatedRequest, null, "meta/last-updated");
  const sourceLastUpdated = (JSON.parse(fresh.text) as { last_updated: string }).last_updated;

  mkdirSync(RESPONSES, { recursive: true });
  const previous = existsSync(RUN) ? (JSON.parse(readFileSync(RUN, "utf8")) as Run) : null;
  if (previous && previous.sourceLastUpdated !== sourceLastUpdated) {
    const n = readdirSync(RESPONSES).filter((f) => f.endsWith(".meta.json")).length;
    console.log(
      `Copia temporal descartada (${n} respuestas): USAspending se actualizó (${previous.sourceLastUpdated} → ${sourceLastUpdated}).`,
    );
    rmSync(RESPONSES, { recursive: true, force: true });
    mkdirSync(RESPONSES, { recursive: true });
  } else if (previous && previous.planFingerprint !== fingerprint) {
    console.log(
      `El plan de pedidos cambió (${previous.planFingerprint.slice(0, 12)} → ${fingerprint.slice(0, 12)}): solo se reusan las respuestas cuyo pedido es idéntico en el plan nuevo.`,
    );
  }
  const run: Run =
    previous && previous.sourceLastUpdated === sourceLastUpdated
      ? { ...previous, planFingerprint: fingerprint, fiscalYear }
      : {
          planFingerprint: fingerprint,
          fiscalYear,
          sourceLastUpdated,
          startedAt: new Date().toISOString(),
        };
  writeFileSync(RUN, JSON.stringify(run, null, 2) + "\n");
  console.log(
    `AF ${fiscalYear} · plan ${fingerprint.slice(0, 12)} · ${plan.length} pedidos (más páginas) · USAspending actualizado ${sourceLastUpdated}`,
  );

  const collected: { meta: Meta; text: string }[] = [];
  let cached = 0;
  let requested = 0;
  const progress = (done: number) =>
    `en caché ${cached} · pedidos ahora ${requested} · faltan ${plan.length - done} de ${plan.length}`;

  for (const [index, request] of plan.entries()) {
    for (let page = 1; ; page += 1) {
      const body = request.body ? (request.paged ? { ...request.body, page } : request.body) : null;
      const id = requestId(request.method, request.endpoint, body);
      const expected = {
        id,
        key: request.key,
        page: request.paged ? page : null,
        method: request.method,
        endpoint: request.endpoint,
        body,
        planFingerprint: fingerprint,
      };
      let entry = request.key === "meta/last-updated" ? null : readCached(id, expected, request);
      if (entry) {
        cached += 1;
      } else {
        const label = `[${index + 1}/${plan.length}] ${request.key}${request.paged ? ` p${page}` : ""}`;
        let result: { text: string; status: number };
        if (request.key === "meta/last-updated") {
          result = fresh;
        } else {
          try {
            result = await send(request, body, label);
          } catch (error) {
            console.error(error instanceof Error ? error.message : error);
            console.error(
              `Detenido sin perder nada: ${progress(index)} · fallidos 1. Vuelve a correr el mismo comando para seguir.`,
            );
            process.exit(1);
          }
          await sleep(PAUSE_MS + jitter(PAUSE_JITTER_MS));
        }
        requested += 1;
        const meta: Meta = {
          ...expected,
          retrievedAt: new Date().toISOString(),
          status: result.status,
          bytes: Buffer.byteLength(result.text),
          sha256: sha256(result.text),
        };
        stage(meta, result.text);
        entry = { meta, text: result.text };
      }
      collected.push(entry);
      const hasNext =
        request.paged &&
        (JSON.parse(entry.text) as { page_metadata?: { hasNext?: boolean } }).page_metadata
          ?.hasNext;
      if (!hasNext) break;
    }
    if ((index + 1) % 25 === 0 || index + 1 === plan.length)
      console.log(`${progress(index + 1)} · fallidos 0`);
  }

  // Every response is here. Build the snapshot apart, check it whole, then swap it in.
  const promote = join(STAGE, "promote");
  rmSync(promote, { recursive: true, force: true });
  const files = collected.map(({ meta, text }) => {
    const path = `${RAW_DIR}/${meta.key}${meta.page === null ? "" : `-p${meta.page}`}.json`;
    mkdirSync(dirname(join(promote, path)), { recursive: true });
    writeFileSync(join(promote, path), text);
    return {
      path,
      key: meta.key,
      page: meta.page,
      method: meta.method,
      endpoint: meta.endpoint,
      body: meta.body,
      retrievedAt: meta.retrievedAt,
      bytes: meta.bytes,
      sha256: meta.sha256,
    };
  });
  const times = files.map((f) => f.retrievedAt).sort();
  const manifest: UsaManifest = {
    schema: 1,
    generator: "scripts/usaspending/update.ts",
    generatorVersion: USA_GENERATOR_VERSION,
    publisher: "U.S. Department of the Treasury, Bureau of the Fiscal Service",
    dataset:
      "USAspending.gov, prime awards: obligaciones, desembolsos y número de adjudicaciones en Puerto Rico por lugar de ejecución",
    api: API,
    retrievedAt: times[0],
    retrievedUntil: times[times.length - 1],
    retrievedAtNote:
      "retrievedAt y retrievedUntil son la primera y la última respuesta (UTC) de la API oficial de USAspending en esta copia.",
    sourceLastUpdated,
    sourceLastUpdatedNote: "Valor de awards/last_updated de la API (MM/DD/YYYY), tal cual.",
    fiscalYear,
    planFingerprint: fingerprint,
    terms: TERMS,
    municipios,
    files,
  };
  writeFileSync(join(promote, MANIFEST), JSON.stringify(manifest, null, 2) + "\n");
  try {
    buildFunds(promote);
  } catch (error) {
    console.error(
      `La copia completa no pasa las comprobaciones; no se instala: ${error instanceof Error ? error.message : error}`,
    );
    process.exit(1);
  }
  const target = join(ROOT, RAW_DIR);
  const old = join(STAGE, "previous");
  rmSync(old, { recursive: true, force: true });
  if (existsSync(target)) renameSync(target, old);
  renameSync(join(promote, RAW_DIR), target);
  rmSync(old, { recursive: true, force: true });
  rmSync(promote, { recursive: true, force: true });
  console.log(
    `Instalado ${RAW_DIR}: ${files.length} archivos, AF ${fiscalYear}, USAspending actualizado ${sourceLastUpdated}.`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
