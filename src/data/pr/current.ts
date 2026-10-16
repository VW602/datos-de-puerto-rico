/**
 * Current data for "Ahora en Puerto Rico": the validated snapshots in
 * data/current/, written by scripts/live/update.ts. The site never calls NWS
 * or USGS; how current a snapshot is depends on when it was last updated,
 * and the page says so.
 */
import nws from "../../../data/current/nws.json";
import usgs from "../../../data/current/usgs-earthquakes.json";
import type { Locale } from "../../i18n/locale.ts";
import { NOW_MESSAGES } from "../../i18n/messages/now.ts";
import { municipios } from "./places";
import {
  alertInForce,
  canSpeakForNow,
  freshness,
  withinHours,
  type Thresholds,
} from "./currentModel";

type Source = {
  agency: string;
  endpoint: string;
  docs: string;
  terms: string;
  web: string;
  attribution: string;
};
type Attempt = { at: string; ok: boolean; error: string | null };
type Base = {
  source: Source;
  retrievedAt: string | null;
  sourceUpdatedAt: string | null;
  lastAttempt: Attempt;
  freshness: Thresholds;
};

export type Severity = "Extreme" | "Severe" | "Moderate" | "Minor" | "Unknown";
export type Alert = {
  id: string;
  event: string;
  headline: string | null;
  severity: Severity;
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
  municipios: string[];
  geography: "MUNICIPIOS" | "PUERTO_RICO" | "NWS_ZONE";
  description: string | null;
  descriptionTruncated: boolean;
  instruction: string | null;
  instructionTruncated: boolean;
  url: string | null;
};
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
  tsunami: number | null;
  felt: number | null;
  sig: number | null;
  status: string | null;
  type: string | null;
  url: string | null;
};

export type NwsSnapshot = Base & { data: { alerts: Alert[] } };
export type UsgsSnapshot = Base & {
  region: { minLat: number; maxLat: number; minLon: number; maxLon: number; note: string };
  data: { windowHours: number; events: Earthquake[] };
};

export const NWS_SNAPSHOT = nws as unknown as NwsSnapshot;
export const USGS_SNAPSHOT = usgs as unknown as UsgsSnapshot;

const NAMES = new Map(municipios.map((m) => [m.id, m.name]));
export const municipioName = (id: string) => NAMES.get(id) ?? id;

/** Alerts still in force at a given time (by NWS's own `expires`); cancellations are not alerts in force. */
export function alertsInForce(snapshot: NwsSnapshot, at: Date): Alert[] {
  return snapshot.data.alerts.filter((a) => alertInForce(a, at));
}

/** NWS severity, translated, with the NWS term kept next to it. Text, never color alone. */
export const SEVERITY_ES: Record<Severity, string> = NOW_MESSAGES.es.alerts.severity;

/** Where an alert applies, from official NWS geography only. */
export function alertArea(alert: Alert, locale: Locale = "es"): string {
  const words = NOW_MESSAGES[locale].alerts;
  if (alert.geography === "MUNICIPIOS") return alert.municipios.map(municipioName).join(", ");
  if (alert.geography === "PUERTO_RICO") return words.allPuertoRico;
  return words.nwsZone(alert.areaDesc ?? alert.ugc.join(", "));
}

export type QuakeSummary = {
  count: number;
  strongest: Earthquake | null;
  latest: Earthquake | null;
};
export function summarize(events: Earthquake[]): QuakeSummary {
  const withMag = events.filter((e) => e.mag !== null);
  const strongest = withMag.length ? withMag.reduce((a, b) => (b.mag! > a.mag! ? b : a)) : null;
  return { count: events.length, strongest, latest: events[0] ?? null };
}

/** Events in the last 24 hours and 7 days, measured back from the snapshot's retrieval time. */
export function quakeWindows(snapshot: UsgsSnapshot): { day: Earthquake[]; week: Earthquake[] } {
  if (!snapshot.retrievedAt) return { day: [], week: [] };
  return {
    day: withinHours(snapshot.data.events, snapshot.retrievedAt, 24),
    week: withinHours(snapshot.data.events, snapshot.retrievedAt, 168),
  };
}

/** USGS place text for an event type that is not an earthquake (e.g. "quarry blast"). */
export const EVENT_TYPE_ES: Record<string, string> = NOW_MESSAGES.es.quakes.eventTypes;

/**
 * What the alerts block may say. "NONE" (no active alerts) only from a
 * CURRENT or AGING snapshot; a stale snapshot or a source that never answered
 * is "UNCONFIRMED", never "NONE".
 */
export type AlertsStatus = { kind: "UNCONFIRMED" | "NONE" | "ACTIVE"; alerts: Alert[] };
export function alertsStatus(snapshot: NwsSnapshot, now: Date): AlertsStatus {
  const state = freshness(snapshot.retrievedAt, now, snapshot.freshness);
  if (!canSpeakForNow(state)) {
    const at = snapshot.retrievedAt ? new Date(snapshot.retrievedAt) : new Date(0);
    return { kind: "UNCONFIRMED", alerts: snapshot.retrievedAt ? alertsInForce(snapshot, at) : [] };
  }
  const alerts = alertsInForce(snapshot, now);
  return { kind: alerts.length ? "ACTIVE" : "NONE", alerts };
}

/** Same rule for earthquakes: "no events" only from a CURRENT or AGING snapshot. */
export type QuakesStatus = {
  kind: "UNCONFIRMED" | "NONE" | "EVENTS";
  day: Earthquake[];
  week: Earthquake[];
};
export function quakesStatus(snapshot: UsgsSnapshot, now: Date): QuakesStatus {
  const { day, week } = quakeWindows(snapshot);
  const state = freshness(snapshot.retrievedAt, now, snapshot.freshness);
  if (!canSpeakForNow(state)) return { kind: "UNCONFIRMED", day, week };
  return { kind: day.length ? "EVENTS" : "NONE", day, week };
}
