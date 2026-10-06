import { useEffect, useId, useRef, useState } from "react";
import { Maximize2, Minus, Plus, Search } from "lucide-react";
import type { PrMetric } from "@/data/pr/metrics";
import type { Candidate } from "@/data/pr/geo";
import { searchPlaces } from "@/data/pr/present";
import { ISLAND_ONLY_FILL, NO_DATA_HATCH, RAMP_GRADIENT } from "@/data/scale";

/** Inline hatch swatch, same pattern as the map's "sin dato". */
function NoDataSwatch() {
  const id = useId().replace(/:/g, "");
  const { base, stripe } = NO_DATA_HATCH;
  return (
    <svg width="22" height="14" aria-hidden="true" className="shrink-0">
      <defs>
        <pattern
          id={id}
          width="4"
          height="4"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <rect width="4" height="4" fill={base} />
          <line x1="0" y1="0" x2="0" y2="4" stroke={stripe} strokeWidth="1.4" />
        </pattern>
      </defs>
      <rect x="0.5" y="0.5" width="21" height="13" fill={`url(#${id})`} stroke={stripe} />
    </svg>
  );
}

export function Legend({
  metric,
  min,
  max,
  islandOnly,
  missingCount,
  compact = false,
}: {
  metric: PrMetric;
  min: number;
  max: number;
  islandOnly: boolean;
  missingCount: number;
  compact?: boolean;
}) {
  if (islandOnly) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted">
        <span
          className="block h-3.5 w-6 shrink-0 border border-divider"
          style={{ background: ISLAND_ONLY_FILL }}
        />
        <span>No hay cifra por municipio: el mapa pinta toda la isla igual.</span>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-muted">
      <div className={`flex min-w-0 items-center gap-2 tabular ${compact ? "w-full" : "flex-1"}`}>
        <span className="shrink-0">{metric.formatTick(min)}</span>
        <span
          className="block h-3 min-w-24 flex-1 rounded-[2px] md:max-w-64"
          style={{ background: RAMP_GRADIENT }}
          aria-hidden="true"
        />
        <span className="shrink-0">{metric.formatTick(max)}</span>
      </div>
      <span className="flex items-center gap-1.5">
        <NoDataSwatch />
        Sin dato publicado{missingCount > 0 ? ` (${missingCount})` : ""}
      </span>
      {!compact && (
        <span className="flex items-center gap-1.5">
          <svg width="22" height="14" aria-hidden="true" className="shrink-0">
            <rect
              x="1.5"
              y="1.5"
              width="19"
              height="11"
              fill="#ffffff"
              stroke="var(--color-fg)"
              strokeWidth="2.6"
            />
          </svg>
          Seleccionado
        </span>
      )}
      <span>Más oscuro = más alto{metric.scale === "log" ? " · escala logarítmica" : ""}</span>
    </div>
  );
}

export function ZoomControls({
  onZoomIn,
  onZoomOut,
  onReset,
  className = "",
}: {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
  className?: string;
}) {
  const button =
    "flex size-11 items-center justify-center rounded-[3px] border border-fg bg-surface text-fg hover:bg-track";
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <button type="button" aria-label="Acercar el mapa" className={button} onClick={onZoomIn}>
        <Plus className="size-4" aria-hidden="true" />
      </button>
      <button type="button" aria-label="Alejar el mapa" className={button} onClick={onZoomOut}>
        <Minus className="size-4" aria-hidden="true" />
      </button>
      <button type="button" aria-label="Ver toda la isla" className={button} onClick={onReset}>
        <Maximize2 className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}

/** Direct access to all 78 municipios by name, accent-insensitive. */
export function MunicipioSearch({
  places,
  onPick,
}: {
  places: { id: string; name: string }[];
  onPick: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const listId = useId();
  const results = searchPlaces(places, query);
  const pick = (id: string) => {
    onPick(id);
    setQuery("");
  };
  return (
    <div className="relative">
      <label className="flex min-h-12 items-center gap-2.5 rounded-[3px] border border-divider bg-surface px-3 focus-within:border-fg">
        <Search className="size-4 shrink-0 text-muted" aria-hidden="true" />
        <span className="sr-only">Buscar municipio</span>
        <input
          type="search"
          value={query}
          placeholder="Buscar municipio"
          aria-controls={listId}
          aria-expanded={results.length > 0}
          autoComplete="off"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && results[0]) {
              event.preventDefault();
              pick(results[0].id);
            } else if (event.key === "Escape") setQuery("");
          }}
          className="min-w-0 flex-1 bg-transparent text-base text-fg outline-none placeholder:text-muted"
        />
      </label>
      <p className="sr-only" aria-live="polite">
        {query ? `${results.length} ${results.length === 1 ? "municipio" : "municipios"}` : ""}
      </p>
      {results.length > 0 && (
        <ul
          id={listId}
          className="absolute top-full right-0 left-0 z-30 mt-1 border border-fg bg-surface shadow-float"
        >
          {results.map((place) => (
            <li key={place.id}>
              <button
                type="button"
                onClick={() => pick(place.id)}
                className="flex min-h-11 w-full items-center px-3 text-left text-base hover:bg-track"
              >
                {place.name}
              </button>
            </li>
          ))}
        </ul>
      )}
      {query && results.length === 0 && (
        <p className="absolute top-full right-0 left-0 z-30 mt-1 border border-divider bg-surface px-3 py-2 text-sm text-muted">
          Ningún municipio con ese nombre.
        </p>
      )}
    </div>
  );
}

/**
 * Shown when a touch lands near several municipios. Explicit 44 px buttons,
 * in the deterministic order from candidatesAt; nothing is selected silently.
 */
export function TapChooser({
  candidates,
  onChoose,
  onCancel,
}: {
  candidates: Candidate[];
  onChoose: (id: string) => void;
  onCancel: () => void;
}) {
  const headingRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, [candidates]);
  return (
    <div
      role="group"
      aria-labelledby="tap-chooser-title"
      className="border-t border-divider bg-surface px-3 pt-2.5 pb-3"
    >
      <p
        id="tap-chooser-title"
        ref={headingRef}
        tabIndex={-1}
        className="mb-2 text-sm text-muted outline-none"
      >
        Tocaste cerca de {candidates.length} municipios. ¿Cuál quieres ver?
      </p>
      <div className="flex flex-wrap gap-1.5">
        {candidates.map((candidate) => (
          <button
            key={candidate.id}
            type="button"
            onClick={() => onChoose(candidate.id)}
            className="min-h-11 rounded-full border border-fg bg-surface px-4 text-[15px] hover:bg-track"
          >
            {candidate.name}
          </button>
        ))}
        <button
          type="button"
          onClick={onCancel}
          className="min-h-11 rounded-full px-4 text-[15px] text-muted underline"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
