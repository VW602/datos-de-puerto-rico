/**
 * CURRENT DATA CHECK (offline): validates data/current/*.json. Part of
 * `npm run data:check`.
 *
 *   npm run data:live:check
 *
 * Fails on a broken snapshot (schema, hashes, timestamps, duplicate IDs,
 * ranges, coordinates, alert lifecycle, freshness metadata). An OLD snapshot
 * is not broken: it is reported with its freshness state, and the site shows
 * it as stale. If the exact response is still in the local cache, it also
 * checks that normalizing it again gives the same data.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { freshness } from "../../src/data/pr/currentModel.ts";
import {
  contentHash,
  inRegion,
  normalizeNws,
  normalizeUsgs,
  sha256,
  type NwsData,
  type Snapshot,
  type UsgsData,
} from "./normalize.ts";
import {
  FRESHNESS,
  LIVE_SCHEMA_VERSION,
  NWS,
  NWS_DESCRIPTION_MAX,
  NWS_FIELDS,
  NWS_INSTRUCTION_MAX,
  NWS_OUTPUT,
  NWS_SEVERITIES,
  RAW_CACHE_DIR,
  REGION,
  USGS,
  USGS_FIELDS,
  USGS_OUTPUT,
} from "./source.ts";

/** Clock skew allowed between a source's timestamps and our retrieval time. */
const SKEW_MS = 5 * 60_000;
const fail = (message: string): never => {
  throw new Error(message);
};
const t = (iso: string | null, where: string) => {
  if (iso === null) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(iso) || Number.isNaN(Date.parse(iso)))
    fail(`${where}: fecha no es UTC ISO (${iso})`);
  return Date.parse(iso);
};

function validateCommon<T>(
  s: Snapshot<T>,
  source: typeof NWS | typeof USGS,
  fresh: { currentMinutes: number; staleMinutes: number },
  list: unknown[],
  name: string,
): number | null {
  if (s.schemaVersion !== LIVE_SCHEMA_VERSION)
    fail(`${name}: versión de esquema ${s.schemaVersion}`);
  if (JSON.stringify(s.source) !== JSON.stringify(source))
    fail(`${name}: fuente distinta de la declarada`);
  if (JSON.stringify(s.freshness) !== JSON.stringify(fresh))
    fail(`${name}: umbrales de frescura distintos de los documentados`);
  if (s.contentSha256 !== contentHash(s.data))
    fail(`${name}: el SHA-256 del contenido no coincide`);
  const retrieved = t(s.retrievedAt, `${name} retrievedAt`);
  const attempted = t(s.lastAttempt.at, `${name} lastAttempt`);
  if (retrieved === null) {
    // Never retrieved: nothing may pose as data.
    if (list.length !== 0 || s.raw !== null || s.lastAttempt.ok)
      fail(`${name}: sin copia buena pero con datos`);
    return null;
  }
  if (!s.raw || !/^[0-9a-f]{64}$/.test(s.raw.sha256) || s.raw.bytes <= 0)
    fail(`${name}: falta el SHA-256 de la respuesta original`);
  if (attempted! < retrieved)
    fail(`${name}: el último intento es anterior a la última copia buena`);
  if (s.lastAttempt.ok && attempted !== retrieved)
    fail(`${name}: intento exitoso con hora distinta a la copia`);
  if (!s.lastAttempt.ok && !s.lastAttempt.error) fail(`${name}: intento fallido sin razón`);
  const updated = t(s.sourceUpdatedAt, `${name} sourceUpdatedAt`);
  if (updated !== null && updated > retrieved + SKEW_MS)
    fail(`${name}: la fuente dice actualizarse en el futuro`);
  return retrieved;
}

export function validateNws(s: Snapshot<NwsData>, municipioIds: Set<string>): void {
  const retrieved = validateCommon(s, NWS, FRESHNESS.nws, s.data.alerts, "NWS");
  const ids = new Set<string>();
  for (const a of s.data.alerts) {
    const where = `NWS ${a.id}`;
    if (Object.keys(a).join() !== NWS_FIELDS.join())
      fail(`${where}: campos fuera de la lista permitida`);
    if (ids.has(a.id)) fail(`${where}: alerta repetida`);
    ids.add(a.id);
    if (!(NWS_SEVERITIES as readonly string[]).includes(a.severity))
      fail(`${where}: severidad ${a.severity}`);
    const effective = t(a.effective, `${where} effective`);
    const expires = t(a.expires, `${where} expires`);
    const onset = t(a.onset, `${where} onset`);
    const ends = t(a.ends, `${where} ends`);
    if (effective !== null && expires !== null && expires < effective)
      fail(`${where}: expira antes de entrar en vigor`);
    if (onset !== null && ends !== null && ends < onset) fail(`${where}: termina antes de empezar`);
    if (retrieved !== null && effective !== null && effective > retrieved + SKEW_MS)
      fail(`${where}: entra en vigor después de obtenida`);
    // Municipios only from official SAME geocodes.
    const fromSame = [
      ...new Set(
        a.same
          .map((c) => /^072(\d{3})$/.exec(c))
          .filter((m) => m && m[1] !== "000")
          .map((m) => `72${m![1]}`)
          .filter((f) => municipioIds.has(f)),
      ),
    ].sort();
    if (JSON.stringify(fromSame) !== JSON.stringify(a.municipios))
      fail(`${where}: municipios que no salen de los códigos SAME`);
    const geo = a.municipios.length
      ? "MUNICIPIOS"
      : a.same.includes("072000")
        ? "PUERTO_RICO"
        : "NWS_ZONE";
    if (a.geography !== geo) fail(`${where}: geografía inconsistente`);
    if (a.description && a.description.length > NWS_DESCRIPTION_MAX + 1)
      fail(`${where}: descripción más larga que el extracto permitido`);
    if (a.instruction && a.instruction.length > NWS_INSTRUCTION_MAX + 1)
      fail(`${where}: instrucción más larga que el extracto permitido`);
  }
}

export function validateUsgs(s: Snapshot<UsgsData>): void {
  const retrieved = validateCommon(s, USGS, FRESHNESS.usgs, s.data.events, "USGS");
  if (
    !s.region ||
    s.region.minLat !== REGION.minLat ||
    s.region.maxLat !== REGION.maxLat ||
    s.region.minLon !== REGION.minLon ||
    s.region.maxLon !== REGION.maxLon
  )
    fail("USGS: región distinta de la documentada");
  if (s.data.windowHours !== 168) fail("USGS: ventana distinta de 7 días");
  const ids = new Set<string>();
  let previous = Infinity;
  for (const e of s.data.events) {
    const where = `USGS ${e.id}`;
    if (Object.keys(e).join() !== USGS_FIELDS.join())
      fail(`${where}: campos fuera de la lista permitida`);
    if (ids.has(e.id)) fail(`${where}: evento repetido`);
    ids.add(e.id);
    if (
      !Number.isFinite(e.latitude) ||
      !Number.isFinite(e.longitude) ||
      !inRegion(e.latitude, e.longitude)
    )
      fail(`${where}: fuera de la región`);
    if (e.mag !== null && (!Number.isFinite(e.mag) || e.mag < -2 || e.mag > 10))
      fail(`${where}: magnitud fuera de rango`);
    if (e.depthKm !== null && (e.depthKm < -10 || e.depthKm > 800))
      fail(`${where}: profundidad fuera de rango`);
    if (e.tsunami !== null && e.tsunami !== 0 && e.tsunami !== 1)
      fail(`${where}: bandera tsunami inválida`);
    const time = t(e.time, `${where} time`)!;
    const updated = t(e.updated, `${where} updated`);
    if (retrieved !== null && time > retrieved + SKEW_MS) fail(`${where}: sismo en el futuro`);
    if (retrieved !== null && time < retrieved - (168 + 24) * 3600_000)
      fail(`${where}: fuera de la ventana de 7 días`);
    if (updated !== null && updated < time) fail(`${where}: actualizado antes de ocurrir`);
    if (time > previous) fail(`${where}: la lista no va del más reciente al más antiguo`);
    previous = time;
  }
}

function main() {
  const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
  const census = JSON.parse(
    readFileSync(join(root, "data/generated/census-municipios.json"), "utf8"),
  ) as { municipios: Record<string, unknown> };
  const municipioIds = new Set(Object.keys(census.municipios));
  const now = new Date();
  const nws = JSON.parse(readFileSync(join(root, NWS_OUTPUT), "utf8")) as Snapshot<NwsData>;
  const usgs = JSON.parse(readFileSync(join(root, USGS_OUTPUT), "utf8")) as Snapshot<UsgsData>;
  try {
    validateNws(nws, municipioIds);
    validateUsgs(usgs);
    // When the exact responses are still in the local cache, normalizing them again must give the same data.
    for (const [name, snap, again] of [
      ["nws-alerts-pr", nws, (raw: string) => ({ alerts: normalizeNws(raw, municipioIds).alerts })],
      [
        "usgs-all-week",
        usgs,
        (raw: string) => {
          const n = normalizeUsgs(raw);
          return { windowHours: 168, worldCount: n.worldCount, events: n.events };
        },
      ],
    ] as const) {
      const path = join(root, RAW_CACHE_DIR, `${name}.json`);
      if (!existsSync(path) || !snap.raw) continue;
      const raw = readFileSync(path, "utf8");
      if (sha256(raw) !== snap.raw.sha256) continue; // a newer local response; not this snapshot's
      if (JSON.stringify(again(raw)) !== JSON.stringify(snap.data))
        throw new Error(`${name}: normalizar otra vez la respuesta original no da lo mismo`);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
  const fn = freshness(nws.retrievedAt, now, nws.freshness);
  const fu = freshness(usgs.retrievedAt, now, usgs.freshness);
  console.log(
    `Datos actuales válidos. NWS: ${fn} (${nws.data.alerts.length} alertas, obtenido ${nws.retrievedAt ?? "nunca"}). USGS: ${fu} (${usgs.data.events.length} sismos, obtenido ${usgs.retrievedAt ?? "nunca"}).`,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
