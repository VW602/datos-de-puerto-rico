/**
 * DATA UPDATE (needs network): asks the official OpenFEMA API for Puerto
 * Rico's disaster declarations, Public Assistance funded projects, Hazard
 * Mitigation Assistance projects and aggregated household assistance, at
 * pinned dataset versions. Only www.fema.gov/api/open is contacted.
 *
 *   npm run data:fema:update
 *
 * Resumable, like data:usaspending:update. Each successful response is kept
 * in .cache/fema/ (git-ignored) with its request, SHA-256 and time; a rerun
 * asks only for what is missing. The OpenFEMA catalog entry of every dataset
 * is asked fresh each run: if any dataset was refreshed since the cached
 * responses, the cache is discarded (and the log says so).
 *
 * All or nothing: data/source/fema/ is replaced only after every planned
 * response is present, each paged dataset is complete (records = the count
 * OpenFEMA reports), and the whole snapshot passes the offline generator.
 * The repository keeps a PUBLIC-SAFE EXTRACT of each response (allowlisted
 * fields, see extract.ts), never the original bytes; those stay in
 * .cache/fema/raw (git-ignored), and the manifest records their SHA-256. Using the API means accepting the OpenFEMA
 * Terms and Conditions (TERMS.terms). The app build never runs this.
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
import { extractResponse } from "./extract.ts";
import { assertMunicipios, buildFema, sha256, type FemaManifest } from "./pipeline.ts";
import {
  canonical,
  planFingerprint,
  planRequests,
  queryString,
  requestId,
  type PlannedRequest,
} from "./plan.ts";
import {
  API,
  DATASETS,
  FEMA_GENERATOR_VERSION,
  MANIFEST,
  PAGE_SIZE,
  RAW_CACHE_DIR,
  SOURCE_DIR,
  STAGING_DIR,
  TERMS,
} from "./source.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const USER_AGENT =
  "puerto-rico-datos/0.1 (open-source civic data project; https://datos.tn242.com/; OpenFEMA pipeline; one request at a time)";

const PAUSE_MS = 1500;
const PAUSE_JITTER_MS = 500;
const TIMEOUT_MS = 180_000;
const MAX_ATTEMPTS = 7;
const BACKOFF_BASE_MS = 5000;
const BACKOFF_MAX_MS = 120_000;
const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);

const STAGE = join(ROOT, STAGING_DIR);
const RESPONSES = join(STAGE, "responses");
const RUN = join(STAGE, "run.json");

type Meta = {
  id: string;
  key: string;
  page: number | null;
  endpoint: string;
  params: Record<string, string>;
  planFingerprint: string;
  retrievedAt: string;
  status: number;
  bytes: number;
  sha256: string;
};
type Run = { planFingerprint: string; catalogStamp: string; startedAt: string };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const jitter = (max: number) => Math.floor(Math.random() * max);
class FetchFailed extends Error {}

/** A usable answer: a JSON object with OpenFEMA metadata and the expected record array. Null when fine. */
export function responseProblem(text: string, request: PlannedRequest): string | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return "la respuesta no es JSON";
  }
  if (!data || typeof data !== "object" || Array.isArray(data))
    return "la respuesta no es un objeto";
  const object = data as Record<string, unknown>;
  if (object.error) return `error de la API: ${JSON.stringify(object.error).slice(0, 160)}`;
  const entity = request.dataset ? DATASETS[request.dataset].name : "DataSets";
  if (!Array.isArray(object[entity])) return `falta «${entity}»`;
  if (
    request.paged &&
    typeof (object.metadata as { count?: unknown } | undefined)?.count !== "number"
  )
    return "falta metadata.count";
  return null;
}

async function send(
  request: PlannedRequest,
  params: Record<string, string>,
  label: string,
): Promise<{ text: string; status: number }> {
  for (let attempt = 1; ; attempt += 1) {
    let status = 0;
    let problem: string;
    let wait = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** (attempt - 1)) + jitter(1000);
    try {
      const response = await fetch(`${API}${request.endpoint}?${queryString(params)}`, {
        headers: { Accept: "application/json", "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      status = response.status;
      const text = await response.text();
      if (response.ok) {
        const invalid = responseProblem(text, request);
        if (!invalid) return { text, status };
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
      `  ${label}: ${problem}; intento ${attempt + 1}/${MAX_ATTEMPTS} en ${Math.round(wait / 1000)} s`,
    );
    await sleep(wait);
  }
}

function readCached(
  id: string,
  expected: Omit<Meta, "retrievedAt" | "status" | "bytes" | "sha256" | "planFingerprint">,
  request: PlannedRequest,
): { meta: Meta; text: string } | null {
  const metaPath = join(RESPONSES, `${id}.meta.json`);
  const bodyPath = join(RESPONSES, `${id}.json`);
  if (!existsSync(metaPath) || !existsSync(bodyPath)) return null;
  const meta = JSON.parse(readFileSync(metaPath, "utf8")) as Meta;
  const bytes = readFileSync(bodyPath);
  const same =
    meta.id === id &&
    meta.key === expected.key &&
    meta.page === expected.page &&
    meta.endpoint === expected.endpoint &&
    canonical(meta.params) === canonical(expected.params) &&
    sha256(bytes) === meta.sha256 &&
    responseProblem(bytes.toString("utf8"), request) === null;
  return same ? { meta, text: bytes.toString("utf8") } : null;
}

async function main() {
  const census = JSON.parse(
    readFileSync(join(ROOT, "data/generated/census-municipios.json"), "utf8"),
  ) as { municipios: Record<string, { name: string }> };
  const municipios = Object.entries(census.municipios)
    .map(([id, { name }]) => ({ id, name }))
    .sort((a, b) => a.id.localeCompare(b.id));
  assertMunicipios(municipios);

  const plan = planRequests();
  const fingerprint = planFingerprint(plan);

  // Catalog entries, always fresh: they say when each dataset was last refreshed.
  const catalog = new Map<string, { text: string; status: number; retrievedAt: string }>();
  for (const request of plan.filter((p) => !p.paged)) {
    const result = await send(request, request.params, request.key);
    catalog.set(request.key, { ...result, retrievedAt: new Date().toISOString() });
    await sleep(PAUSE_MS + jitter(PAUSE_JITTER_MS));
  }
  const catalogStamp = [...catalog.entries()]
    .map(([key, { text }]) => {
      const entry = (
        JSON.parse(text) as { DataSets: { lastDataSetRefresh?: string; lastRefresh?: string }[] }
      ).DataSets[0];
      if (!entry) throw new Error(`${key}: el catálogo no tiene esa versión del dataset`);
      return `${key}=${entry.lastDataSetRefresh ?? entry.lastRefresh}`;
    })
    .join(";");

  mkdirSync(RESPONSES, { recursive: true });
  const previous = existsSync(RUN) ? (JSON.parse(readFileSync(RUN, "utf8")) as Run) : null;
  if (previous && previous.catalogStamp !== catalogStamp) {
    const n = readdirSync(RESPONSES).filter((f) => f.endsWith(".meta.json")).length;
    console.log(
      `Copia temporal descartada (${n} respuestas): OpenFEMA actualizó al menos un dataset.`,
    );
    rmSync(RESPONSES, { recursive: true, force: true });
    mkdirSync(RESPONSES, { recursive: true });
  } else if (previous && previous.planFingerprint !== fingerprint) {
    console.log(
      "El plan de pedidos cambió: solo se reusan las respuestas cuyo pedido es idéntico en el plan nuevo.",
    );
  }
  const run: Run =
    previous && previous.catalogStamp === catalogStamp
      ? { ...previous, planFingerprint: fingerprint }
      : { planFingerprint: fingerprint, catalogStamp, startedAt: new Date().toISOString() };
  writeFileSync(RUN, JSON.stringify(run, null, 2) + "\n");
  console.log(`Plan ${fingerprint.slice(0, 12)} · ${plan.length} pedidos (más páginas)`);

  const collected: { meta: Meta; text: string }[] = [];
  let cached = 0;
  let requested = 0;
  for (const [index, request] of plan.entries()) {
    for (let page = 1; ; page += 1) {
      const params = request.paged
        ? { ...request.params, $skip: String((page - 1) * PAGE_SIZE) }
        : request.params;
      const id = requestId(request.endpoint, params);
      const expected = {
        id,
        key: request.key,
        page: request.paged ? page : null,
        endpoint: request.endpoint,
        params,
      };
      const label = `[${index + 1}/${plan.length}] ${request.key}${request.paged ? ` p${page}` : ""}`;
      let entry: { meta: Meta; text: string } | null = null;
      if (!request.paged) {
        const fresh = catalog.get(request.key)!;
        entry = {
          meta: {
            ...expected,
            planFingerprint: fingerprint,
            retrievedAt: fresh.retrievedAt,
            status: fresh.status,
            bytes: Buffer.byteLength(fresh.text),
            sha256: sha256(fresh.text),
          },
          text: fresh.text,
        };
        requested += 1;
      } else {
        entry = readCached(id, expected, request);
        if (entry) cached += 1;
        else {
          let result: { text: string; status: number };
          try {
            result = await send(request, params, label);
          } catch (error) {
            console.error(error instanceof Error ? error.message : error);
            console.error(
              `Detenido sin perder nada: en caché ${cached} · pedidos ahora ${requested} · fallidos 1. Vuelve a correr el mismo comando para seguir.`,
            );
            process.exit(1);
          }
          requested += 1;
          const meta: Meta = {
            ...expected,
            planFingerprint: fingerprint,
            retrievedAt: new Date().toISOString(),
            status: result.status,
            bytes: Buffer.byteLength(result.text),
            sha256: sha256(result.text),
          };
          writeFileSync(join(RESPONSES, `${id}.json`), result.text);
          writeFileSync(join(RESPONSES, `${id}.meta.json`), JSON.stringify(meta, null, 2) + "\n");
          entry = { meta, text: result.text };
          await sleep(PAUSE_MS + jitter(PAUSE_JITTER_MS));
        }
      }
      collected.push(entry);
      if (!request.paged) break;
      const parsed = JSON.parse(entry.text) as { metadata: { count: number } } & Record<
        string,
        unknown[]
      >;
      const rows = (parsed[DATASETS[request.dataset!].name] as unknown[]).length;
      console.log(`${label}: ${rows} registros (de ${parsed.metadata.count})`);
      if (rows === 0 || page * PAGE_SIZE >= parsed.metadata.count) break;
    }
  }
  console.log(`en caché ${cached} · pedidos ahora ${requested} · fallidos 0`);

  installSnapshot(ROOT, collected, municipios, fingerprint);
}

export type RawResponse = {
  meta: {
    key: string;
    page: number | null;
    endpoint: string;
    params: Record<string, string>;
    retrievedAt: string;
    bytes: number;
    sha256: string;
  };
  text: string;
};

/**
 * Every response is here. Keep the exact bytes in the local raw cache
 * (git-ignored), build the PUBLIC-SAFE EXTRACT apart, check the whole
 * snapshot with the generator, then swap it in. All or nothing.
 */
export function installSnapshot(
  root: string,
  collected: RawResponse[],
  municipios: { id: string; name: string }[],
  fingerprint: string,
): void {
  const plan = planRequests();
  const rawDir = join(root, RAW_CACHE_DIR);
  rmSync(rawDir, { recursive: true, force: true });
  const stage = join(root, STAGING_DIR);
  const promote = join(stage, "promote");
  rmSync(promote, { recursive: true, force: true });
  const files = collected.map(({ meta, text }) => {
    if (sha256(text) !== meta.sha256 || Buffer.byteLength(text) !== meta.bytes)
      throw new Error(`${meta.key}: la respuesta original no coincide con su SHA-256`);
    const name = `${meta.key}${meta.page === null ? "" : `-p${meta.page}`}.json`;
    mkdirSync(dirname(join(rawDir, name)), { recursive: true });
    writeFileSync(join(rawDir, name), text);
    const request = plan.find((p) => p.key === meta.key)!;
    const extract = extractResponse(text, meta.key, request.dataset);
    const path = `${SOURCE_DIR}/${name}`;
    mkdirSync(dirname(join(promote, path)), { recursive: true });
    writeFileSync(join(promote, path), extract.text);
    return {
      path,
      key: meta.key,
      page: meta.page,
      endpoint: meta.endpoint,
      params: meta.params,
      retrievedAt: meta.retrievedAt,
      rawSha256: meta.sha256,
      rawBytes: meta.bytes,
      sourceCount: extract.sourceCount,
      records: extract.records,
      sha256: sha256(extract.text),
      bytes: Buffer.byteLength(extract.text),
    };
  });
  const times = files.map((f) => f.retrievedAt).sort();
  const manifest: FemaManifest = {
    schema: 1,
    generator: "scripts/fema/update.ts",
    generatorVersion: FEMA_GENERATOR_VERSION,
    publisher: "Federal Emergency Management Agency (FEMA), OpenFEMA",
    api: API,
    retrievedAt: times[0],
    retrievedUntil: times[times.length - 1],
    retrievedAtNote:
      "retrievedAt y retrievedUntil son la primera y la última respuesta (UTC) de la API OpenFEMA en esta copia. Cada archivo es un EXTRACTO PÚBLICO (solo campos permitidos, ver scripts/fema/extract.ts), no la respuesta original. rawSha256 y rawBytes son de los bytes exactos que respondió la API, que solo se guardan en la copia local (.cache/fema/raw); sha256 y bytes son del extracto.",
    planFingerprint: fingerprint,
    terms: TERMS,
    municipios,
    files,
  };
  writeFileSync(join(promote, MANIFEST), JSON.stringify(manifest, null, 2) + "\n");
  try {
    buildFema(promote);
  } catch (error) {
    throw new Error(
      `La copia completa no pasa las comprobaciones; no se instala: ${error instanceof Error ? error.message : error}`,
    );
  }
  const target = join(root, SOURCE_DIR);
  const old = join(stage, "previous");
  rmSync(old, { recursive: true, force: true });
  if (existsSync(target)) renameSync(target, old);
  mkdirSync(dirname(target), { recursive: true });
  renameSync(join(promote, SOURCE_DIR), target);
  rmSync(old, { recursive: true, force: true });
  rmSync(promote, { recursive: true, force: true });
  console.log(
    `Instalado ${SOURCE_DIR}: ${files.length} extractos. Respuestas originales en ${RAW_CACHE_DIR} (local).`,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
