import { metricGrain, type PrMetricId } from "./metrics";
import { valueExclusion } from "./public";

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

export const MISSING_COPY: Record<MissingReason, { short: string; long: string }> = {
  not_published: {
    short: "Sin dato publicado",
    long: "La fuente oficial no publicó este dato para este municipio.",
  },
  not_applicable: {
    short: "No aplica",
    long: "Esta medida no aplica a este municipio.",
  },
  geography_unavailable: {
    short: "Solo para toda la isla",
    long: "La fuente solo publica este dato para un área más grande, no por municipio.",
  },
  source_unavailable: {
    short: "Fuente sin responder",
    long: "La fuente no respondió y no hay una copia guardada. Vuelve a intentar más tarde.",
  },
  pending_update: {
    short: "Pendiente",
    long: "Este dato espera la próxima publicación de la fuente.",
  },
  source_conflict: {
    short: "Dato sin confirmar",
    long: "La fuente oficial da dos versiones distintas de este dato. No se muestra hasta confirmarlo.",
  },
};

/** Best-known reason a metric has no value for a municipio. */
export function missingReason(id: PrMetricId, municipioId?: string): MissingReason {
  if (municipioId && valueExclusion(id, municipioId)) return "source_conflict";
  if (metricGrain(id) === "isla") return "geography_unavailable";
  return "not_published";
}
