/**
 * Pure: an exact NWS or USGS response → the normalized, allowlisted records
 * the site publishes, and the snapshot around them. Throws instead of
 * guessing. No network.
 */

import { createHash } from "node:crypto";
import {
  LIVE_SCHEMA_VERSION,
  NWS,
  NWS_DESCRIPTION_MAX,
  NWS_FIELDS,
  NWS_INSTRUCTION_MAX,
  NWS_SEVERITIES,
  REGION,
  USGS,
  USGS_FIELDS,
  FRESHNESS,
} from "./source.ts";

export const sha256 = (data: string | Buffer) => createHash("sha256").update(data).digest("hex");
const fail = (message: string): never => {
  throw new Error(message);
};

/** UTC ISO string, or null when the source gives none. Never invented. */
export function isoUtc(value: unknown, where: string): string | null {
  if (value === null || value === undefined || value === "") return null;
  const d =
    typeof value === "number"
      ? new Date(value)
      : typeof value === "string"
        ? new Date(value)
        : null;
  if (!d || Number.isNaN(d.getTime())) fail(`${where}: fecha inválida (${String(value)})`);
  return d!.toISOString();
}
const num = (value: unknown, where: string): number | null => {
  if (value === null || value === undefined) return null;
  if (typeof value !== "number" || !Number.isFinite(value))
    fail(`${where}: número inválido (${String(value)})`);
  return value as number;
};
const int = (value: unknown, where: string): number | null => {
  const n = num(value, where);
  if (n !== null && !Number.isInteger(n)) fail(`${where}: entero inválido (${n})`);
  return n;
};
const str = (value: unknown): string | null =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : null;

/** A short excerpt of official prose, cut at a word boundary, and whether it was cut. */
export function excerpt(text: unknown, max: number): { text: string | null; truncated: boolean } {
  const s = str(text);
  if (!s) return { text: null, truncated: false };
  const flat = s.replace(/\s+/g, " ");
  if (flat.length <= max) return { text: flat, truncated: false };
  const cut = flat.slice(0, max);
  return {
    text: `${cut.slice(0, Math.max(cut.lastIndexOf(" "), max - 40)).trimEnd()}…`,
    truncated: true,
  };
}

// ---------------------------------------------------------------------------
// NWS

export type NwsGeography = "MUNICIPIOS" | "PUERTO_RICO" | "NWS_ZONE";
export type NwsAlert = {
  id: string;
  event: string;
  headline: string | null;
  severity: (typeof NWS_SEVERITIES)[number];
  certainty: string | null;
  urgency: string | null;
  status: string;
  messageType: string;
  effective: string | null;
  onset: string | null;
  expires: string | null;
  ends: string | null;
  senderName: string | null;
  areaDesc: string | null;
  ugc: string[];
  same: string[];
  affectedZones: string[];
  /** Municipios named by the alert's official SAME geocodes (072 + county FIPS). Never from prose. */
  municipios: string[];
  geography: NwsGeography;
  description: string | null;
  descriptionTruncated: boolean;
  instruction: string | null;
  instructionTruncated: boolean;
  url: string | null;
};

export function normalizeNws(
  rawText: string,
  municipioIds: Set<string>,
): { sourceUpdatedAt: string | null; alerts: NwsAlert[] } {
  const json = JSON.parse(rawText) as { type?: string; updated?: string; features?: unknown };
  if (json.type !== "FeatureCollection" || !Array.isArray(json.features))
    fail("NWS: la respuesta no es una colección de alertas");
  const seen = new Set<string>();
  const alerts = (json.features as { properties?: Record<string, unknown> }[]).map((feature, i) => {
    const p = feature.properties ?? fail(`NWS #${i}: sin propiedades`);
    const where = `NWS ${String(p.id ?? `#${i}`)}`;
    const id = str(p.id) ?? fail(`${where}: sin ID`);
    if (seen.has(id)) fail(`${where}: alerta repetida`);
    seen.add(id);
    const severity = String(p.severity ?? "Unknown");
    if (!(NWS_SEVERITIES as readonly string[]).includes(severity))
      fail(`${where}: severidad fuera de la lista de NWS (${severity})`);
    const geocode = (p.geocode ?? {}) as { SAME?: unknown; UGC?: unknown };
    const same = Array.isArray(geocode.SAME) ? (geocode.SAME as unknown[]).map(String) : [];
    const ugc = Array.isArray(geocode.UGC) ? (geocode.UGC as unknown[]).map(String) : [];
    const municipios = [
      ...new Set(
        same
          .map((code) => /^072(\d{3})$/.exec(code))
          .filter((m): m is RegExpExecArray => m !== null && m[1] !== "000")
          .map((m) => `72${m[1]}`)
          .filter((fips) => municipioIds.has(fips)),
      ),
    ].sort();
    const geography: NwsGeography =
      municipios.length > 0 ? "MUNICIPIOS" : same.includes("072000") ? "PUERTO_RICO" : "NWS_ZONE";
    const effective = isoUtc(p.effective, `${where} effective`);
    const onset = isoUtc(p.onset, `${where} onset`);
    const expires = isoUtc(p.expires, `${where} expires`);
    const ends = isoUtc(p.ends, `${where} ends`);
    if (effective && expires && expires < effective)
      fail(`${where}: expira antes de entrar en vigor`);
    if (onset && ends && ends < onset) fail(`${where}: termina antes de empezar`);
    const description = excerpt(p.description, NWS_DESCRIPTION_MAX);
    const instruction = excerpt(p.instruction, NWS_INSTRUCTION_MAX);
    const alert: NwsAlert = {
      id,
      event: str(p.event) ?? fail(`${where}: sin evento`),
      headline: str(p.headline),
      severity: severity as NwsAlert["severity"],
      certainty: str(p.certainty),
      urgency: str(p.urgency),
      status: str(p.status) ?? fail(`${where}: sin estado`),
      messageType: str(p.messageType) ?? fail(`${where}: sin tipo de mensaje`),
      effective,
      onset,
      expires,
      ends,
      senderName: str(p.senderName),
      areaDesc: str(p.areaDesc),
      ugc,
      same,
      affectedZones: Array.isArray(p.affectedZones)
        ? (p.affectedZones as unknown[]).map(String)
        : [],
      municipios,
      geography,
      description: description.text,
      descriptionTruncated: description.truncated,
      instruction: instruction.text,
      instructionTruncated: instruction.truncated,
      url: str(p["@id"]),
    };
    return alert;
  });
  const rank = (s: string) => NWS_SEVERITIES.indexOf(s as (typeof NWS_SEVERITIES)[number]);
  alerts.sort(
    (a, b) =>
      rank(a.severity) - rank(b.severity) ||
      (b.effective ?? "").localeCompare(a.effective ?? "") ||
      a.id.localeCompare(b.id),
  );
  return { sourceUpdatedAt: isoUtc(json.updated, "NWS updated"), alerts };
}

// ---------------------------------------------------------------------------
// USGS

export type Earthquake = {
  id: string;
  mag: number | null;
  magType: string | null;
  place: string | null;
  time: string;
  updated: string | null;
  latitude: number;
  longitude: number;
  depthKm: number | null;
  /** USGS flag: 1 for large events in oceanic regions. NOT a tsunami warning. */
  tsunami: number | null;
  felt: number | null;
  sig: number | null;
  status: string | null;
  type: string | null;
  url: string | null;
};

export function inRegion(lat: number, lon: number): boolean {
  return (
    lat >= REGION.minLat && lat <= REGION.maxLat && lon >= REGION.minLon && lon <= REGION.maxLon
  );
}

export function normalizeUsgs(rawText: string): {
  sourceUpdatedAt: string | null;
  worldCount: number;
  events: Earthquake[];
} {
  const json = JSON.parse(rawText) as {
    type?: string;
    metadata?: { generated?: number; count?: number; status?: number };
    features?: unknown;
  };
  if (json.type !== "FeatureCollection" || !Array.isArray(json.features))
    fail("USGS: la respuesta no es una colección de sismos");
  if (json.metadata?.status !== undefined && json.metadata.status !== 200)
    fail(`USGS: estado ${json.metadata.status}`);
  const features = json.features as {
    id?: unknown;
    properties?: Record<string, unknown>;
    geometry?: { coordinates?: unknown };
  }[];
  if (typeof json.metadata?.count === "number" && json.metadata.count !== features.length)
    fail("USGS: metadata.count no coincide con los eventos");
  const seen = new Set<string>();
  const events: Earthquake[] = [];
  for (const [i, f] of features.entries()) {
    const id = str(f.id) ?? fail(`USGS #${i}: sin ID`);
    const where = `USGS ${id}`;
    if (seen.has(id)) fail(`${where}: evento repetido`);
    seen.add(id);
    const c = f.geometry?.coordinates;
    if (!Array.isArray(c) || c.length < 2) fail(`${where}: sin coordenadas`);
    const lon = num((c as unknown[])[0], `${where} longitud`);
    const lat = num((c as unknown[])[1], `${where} latitud`);
    if (lon === null || lat === null || lat < -90 || lat > 90 || lon < -180 || lon > 180)
      fail(`${where}: coordenadas inválidas`);
    if (!inRegion(lat!, lon!)) continue;
    const p = f.properties ?? fail(`${where}: sin propiedades`);
    const mag = num(p.mag, `${where} magnitud`);
    if (mag !== null && (mag < -2 || mag > 10)) fail(`${where}: magnitud fuera de rango (${mag})`);
    const depth = num((c as unknown[])[2] ?? null, `${where} profundidad`);
    if (depth !== null && (depth < -10 || depth > 800))
      fail(`${where}: profundidad fuera de rango (${depth})`);
    const tsunami = int(p.tsunami, `${where} tsunami`);
    if (tsunami !== null && tsunami !== 0 && tsunami !== 1)
      fail(`${where}: bandera tsunami inválida (${tsunami})`);
    events.push({
      id,
      mag,
      magType: str(p.magType),
      place: str(p.place),
      time: isoUtc(p.time, `${where} time`) ?? fail(`${where}: sin hora`),
      updated: isoUtc(p.updated, `${where} updated`),
      latitude: lat!,
      longitude: lon!,
      depthKm: depth,
      tsunami,
      felt: int(p.felt, `${where} felt`),
      sig: int(p.sig, `${where} sig`),
      status: str(p.status),
      type: str(p.type),
      url: str(p.url),
    });
  }
  events.sort((a, b) => b.time.localeCompare(a.time) || a.id.localeCompare(b.id));
  return {
    sourceUpdatedAt: isoUtc(json.metadata?.generated, "USGS generated"),
    worldCount: features.length,
    events,
  };
}

// ---------------------------------------------------------------------------
// Snapshots

export type Attempt = { at: string; ok: boolean; error: string | null };
export type Snapshot<T> = {
  schemaVersion: number;
  source: {
    agency: string;
    endpoint: string;
    docs: string;
    terms: string;
    web: string;
    attribution: string;
  };
  generated: string;
  /** Last successful retrieval (UTC). Null only if there has never been one. */
  retrievedAt: string | null;
  sourceUpdatedAt: string | null;
  raw: { sha256: string; bytes: number; note: string } | null;
  lastAttempt: Attempt;
  freshness: { currentMinutes: number; staleMinutes: number };
  region?: typeof REGION & { note: string };
  data: T;
  contentSha256: string;
};

export type NwsData = { alerts: NwsAlert[] };
export type UsgsData = { windowHours: 168; worldCount: number | null; events: Earthquake[] };

/** Records one per line; identical inputs give identical bytes. */
export function stableJson(value: Snapshot<unknown>, listKey: "alerts" | "events"): string {
  const { data, ...rest } = value;
  const list = (data as Record<string, unknown[]>)[listKey];
  const otherData = Object.fromEntries(
    Object.entries(data as Record<string, unknown>).filter(([k]) => k !== listKey),
  );
  const head = JSON.stringify({ ...rest, data: { ...otherData, [listKey]: "@@LIST@@" } }, null, 1);
  const rows =
    list.length === 0 ? "[]" : `[\n${list.map((r) => "  " + JSON.stringify(r)).join(",\n")}\n ]`;
  return head.replace('"@@LIST@@"', rows) + "\n";
}

export const contentHash = (data: unknown) => sha256(JSON.stringify(data));

export function nwsSnapshot(args: {
  retrievedAt: string | null;
  sourceUpdatedAt: string | null;
  raw: Snapshot<NwsData>["raw"];
  lastAttempt: Attempt;
  data: NwsData;
}): Snapshot<NwsData> {
  for (const a of args.data.alerts)
    if (Object.keys(a).join() !== NWS_FIELDS.join())
      fail(`NWS ${a.id}: campos fuera de la lista permitida`);
  return {
    schemaVersion: LIVE_SCHEMA_VERSION,
    source: { ...NWS },
    generated: "GENERADO por scripts/live/update.ts. NO EDITAR A MANO.",
    retrievedAt: args.retrievedAt,
    sourceUpdatedAt: args.sourceUpdatedAt,
    raw: args.raw,
    lastAttempt: args.lastAttempt,
    freshness: { ...FRESHNESS.nws },
    data: args.data,
    contentSha256: contentHash(args.data),
  };
}

export function usgsSnapshot(args: {
  retrievedAt: string | null;
  sourceUpdatedAt: string | null;
  raw: Snapshot<UsgsData>["raw"];
  lastAttempt: Attempt;
  data: UsgsData;
}): Snapshot<UsgsData> {
  for (const e of args.data.events)
    if (Object.keys(e).join() !== USGS_FIELDS.join())
      fail(`USGS ${e.id}: campos fuera de la lista permitida`);
  return {
    schemaVersion: LIVE_SCHEMA_VERSION,
    source: { ...USGS },
    generated: "GENERADO por scripts/live/update.ts. NO EDITAR A MANO.",
    retrievedAt: args.retrievedAt,
    sourceUpdatedAt: args.sourceUpdatedAt,
    raw: args.raw,
    lastAttempt: args.lastAttempt,
    freshness: { ...FRESHNESS.usgs },
    region: {
      ...REGION,
      note: "17°N–20°N, 69°W–63.5°W: la Fosa de Puerto Rico al norte, el canal de Mona al oeste, el paso de Anegada al este y el mar Caribe al sur. Todos los eventos del feed de 7 días dentro de este recuadro, de cualquier magnitud.",
    },
    data: args.data,
    contentSha256: contentHash(args.data),
  };
}

/**
 * After a failed attempt, the last known good snapshot keeps its data and its
 * retrieval time; only the attempt is recorded. Never an empty "now".
 */
export function recordFailure<T>(
  previous: Snapshot<T> | null,
  attempt: Attempt,
  empty: T,
  build: (args: {
    retrievedAt: string | null;
    sourceUpdatedAt: string | null;
    raw: Snapshot<T>["raw"];
    lastAttempt: Attempt;
    data: T;
  }) => Snapshot<T>,
): Snapshot<T> {
  if (attempt.ok) fail("recordFailure: el intento no falló");
  if (previous)
    return build({
      retrievedAt: previous.retrievedAt,
      sourceUpdatedAt: previous.sourceUpdatedAt,
      raw: previous.raw,
      lastAttempt: attempt,
      data: previous.data,
    });
  return build({
    retrievedAt: null,
    sourceUpdatedAt: null,
    raw: null,
    lastAttempt: attempt,
    data: empty,
  });
}
