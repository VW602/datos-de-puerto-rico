import { ageWords, freshness, type Freshness, type Thresholds } from "@/data/pr/currentModel";

const FRESH_ES: Record<Freshness, string> = {
  CURRENT: "Al día",
  AGING: "Algo atrasado",
  STALE: "Desactualizado",
  UNAVAILABLE: "Sin datos",
};
/** A shape next to the word, so the state never depends on color. */
const FRESH_MARK: Record<Freshness, string> = {
  CURRENT: "●",
  AGING: "◐",
  STALE: "○",
  UNAVAILABLE: "×",
};

export type SourceItem = {
  label: string;
  retrievedAt: string | null;
  lastAttempt: { at: string; ok: boolean };
  thresholds: Thresholds;
};

/**
 * One compact line per source: how fresh the saved copy is, in words and age.
 * Exact times live in each section and in "¿De dónde salen estos datos?".
 */
export function SourceStatus({
  items,
  now,
}: {
  items: (SourceItem | { label: string; pending: string })[];
  now: Date | null;
}) {
  return (
    <ul
      aria-label="Estado de las copias de cada fuente"
      className="mt-1 flex flex-wrap gap-x-5 gap-y-0.5 text-[13px]"
    >
      {items.map((item) => {
        if ("pending" in item)
          return (
            <li key={item.label} className="text-muted">
              {item.label} · {item.pending}
            </li>
          );
        const state = now ? freshness(item.retrievedAt, now, item.thresholds) : null;
        const bad = state === "STALE" || state === "UNAVAILABLE";
        return (
          <li key={item.label} className={bad ? "font-semibold text-error" : "text-muted"}>
            {state && <span aria-hidden="true">{FRESH_MARK[state]} </span>}
            {item.label} · {state ? FRESH_ES[state] : "comprobando…"}
            {state && item.retrievedAt && ` (${ageWords(item.retrievedAt, now!)})`}
            {!item.lastAttempt.ok && " · último intento falló"}
          </li>
        );
      })}
    </ul>
  );
}
