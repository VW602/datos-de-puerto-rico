/**
 * Current-data rules shared by the site and the update scripts. Pure: no
 * network, no Node APIs.
 *
 * A source's state is about the snapshot, not about the world:
 *   CURRENT      retrieved recently enough to stand for "now"
 *   AGING        still usable, but say how old it is
 *   STALE        too old to say what is happening now
 *   UNAVAILABLE  there has never been a successful retrieval
 * "No active alerts" or "no earthquakes" can only be said of a CURRENT or
 * AGING snapshot. A failed request never becomes an empty current state.
 */

export type Freshness = "CURRENT" | "AGING" | "STALE" | "UNAVAILABLE";
export type Thresholds = { currentMinutes: number; staleMinutes: number };

export function freshness(retrievedAt: string | null, now: Date, t: Thresholds): Freshness {
  if (!retrievedAt) return "UNAVAILABLE";
  const age = (now.getTime() - Date.parse(retrievedAt)) / 60000;
  if (!Number.isFinite(age)) return "UNAVAILABLE";
  if (age <= t.currentMinutes) return "CURRENT";
  if (age <= t.staleMinutes) return "AGING";
  return "STALE";
}

/** Whether a snapshot can be read as "now": only CURRENT or AGING. */
export const canSpeakForNow = (f: Freshness) => f === "CURRENT" || f === "AGING";

// Times and ages in words live with the rest of the locale-aware formatting.
export { PR_TIME_ZONE, ageWords, prTime } from "../../i18n/format.ts";

/** Events within `hours` before the snapshot's own retrieval time (not the viewer's clock). */
export function withinHours<T extends { time: string }>(
  events: T[],
  until: string,
  hours: number,
): T[] {
  const end = Date.parse(until);
  const start = end - hours * 3600_000;
  return events.filter((e) => {
    const t = Date.parse(e.time);
    return t > start && t <= end;
  });
}

/**
 * Whether an alert message is still in force at `at`: NWS's `expires` is when
 * the message stops being valid (`ends` is when the hazard itself is expected
 * to end, shown separately). A "Cancel" message is not an alert in force.
 */
export function alertInForce(
  alert: { expires: string | null; messageType: string },
  at: Date,
): boolean {
  if (alert.messageType === "Cancel") return false;
  return alert.expires === null || Date.parse(alert.expires) > at.getTime();
}
