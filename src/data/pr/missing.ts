import { metricGrain, type PrMetricId } from "./metrics";
import { valueExclusion } from "./public";
import type { Locale } from "@/i18n/locale";
import { EXPLORER_MESSAGES } from "@/i18n/messages/explorer";

/**
 * Why a value is missing. A missing value is never shown as 0, and these
 * reasons are never collapsed into a generic "N/A" when the reason is known.
 */
export type MissingReason =
  /** The official source did not publish this figure for this place. */
  | "not_published"
  /** The measure does not apply to this place. */
  | "not_applicable"
  /** The source only publishes it for the whole island. */
  | "geography_unavailable"
  /** A live source did not answer; nothing saved to fall back on. */
  | "source_unavailable"
  /** The source has announced or is due for an update not yet loaded. */
  | "pending_update"
  /** The source gives two different values; held back until confirmed. */
  | "source_conflict";

/** What each reason says, short (in place of the value) and long (explained). */
export function missingCopy(
  locale: Locale = "es",
): Record<MissingReason, { short: string; long: string }> {
  return EXPLORER_MESSAGES[locale].missing;
}

/** The Spanish copy (the original wording). */
export const MISSING_COPY = missingCopy("es");

/** Best-known reason a metric has no value for a municipio. */
export function missingReason(id: PrMetricId, municipioId?: string): MissingReason {
  if (municipioId && valueExclusion(id, municipioId)) return "source_conflict";
  if (metricGrain(id) === "isla") return "geography_unavailable";
  return "not_published";
}
