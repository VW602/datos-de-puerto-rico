import { memo } from "react";
import type { PrMetric } from "@/data/pr/metrics";
import type { Municipio } from "@/data/pr/places";
import type { Ranking } from "@/data/pr/ranking";
import { normalize } from "@/data/scale";

const W = 760;
const X0 = 16;
const X1 = W - 16;

function Row({
  place,
  rank,
  metric,
  selected,
  onSelect,
}: {
  place: Municipio;
  rank: number;
  metric: PrMetric;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(place.id)}
        aria-current={selected ? "true" : undefined}
        className={`flex min-h-11 w-full items-center justify-between gap-3 text-left text-base tabular hover:bg-track ${
          selected ? "border-b-2 border-fg font-bold" : "border-b border-divider-2"
        }`}
      >
        <span className="min-w-0">
          <span className={`inline-block w-8 ${selected ? "" : "text-muted"}`}>{rank}</span>
          {place.name}
        </span>
        <span className="shrink-0">{metric.format(place.values[metric.id]!)}</span>
      </button>
    </li>
  );
}

/**
 * "Los 78, de mayor a menor": every value on one line (strip plot), the
 * median, the selected municipio ringed, and the five highest and lowest.
 * Descriptive order only; it never says which end is better.
 */
export const Ranking78 = memo(function Ranking78({
  metric,
  ranking,
  fills,
  selectedId,
  missingCount,
  onSelect,
}: {
  metric: PrMetric;
  ranking: Ranking;
  fills: Record<string, string>;
  selectedId: string | null;
  missingCount: number;
  onSelect: (id: string) => void;
}) {
  const { ranked, min, max, median } = ranking;
  const x = (value: number) => X0 + normalize(value, min, max, metric.scale) * (X1 - X0);
  const top = ranked.slice(0, 5);
  const bottom = ranked.slice(-5);
  const selectedIndex = selectedId ? ranked.findIndex((place) => place.id === selectedId) : -1;
  const selected = selectedIndex >= 0 ? ranked[selectedIndex] : null;
  const shownElsewhere =
    selectedIndex >= 0 && (selectedIndex < 5 || selectedIndex >= ranked.length - 5);

  return (
    <section aria-label="Los 78, de mayor a menor">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4">
        <h2 className="font-display text-[26px] font-medium md:text-3xl">
          Los 78, de mayor a menor
        </h2>
        <span className="text-sm text-muted">Ordenar no es calificar</span>
      </div>
      <svg
        viewBox={`0 0 ${W} 52`}
        className="mt-3 block h-auto w-full"
        role="img"
        aria-label={`Los ${ranked.length} valores de ${metric.label} en una línea. Mediana ${metric.format(median)}.${selected ? ` ${selected.name}, lugar ${selectedIndex + 1}.` : ""}`}
      >
        <line x1={X0} x2={X1} y1={26} y2={26} stroke="var(--color-divider)" strokeWidth={1.5} />
        <line
          x1={x(median)}
          x2={x(median)}
          y1={6}
          y2={46}
          stroke="var(--color-fg)"
          strokeDasharray="4 3"
          strokeWidth={1.2}
        />
        {ranked.map((place) => (
          <circle
            key={place.id}
            cx={x(place.values[metric.id]!)}
            cy={26}
            r={6}
            fill={fills[place.id]}
            stroke="var(--color-muted)"
            strokeWidth={0.7}
          />
        ))}
        {selected && (
          <>
            <circle
              cx={x(selected.values[metric.id]!)}
              cy={26}
              r={12}
              fill="none"
              stroke="#ffffff"
              strokeWidth={5}
            />
            <circle
              cx={x(selected.values[metric.id]!)}
              cy={26}
              r={12}
              fill="none"
              stroke="var(--color-fg)"
              strokeWidth={2.8}
            />
          </>
        )}
      </svg>
      {/* Labels are text, not SVG, so they stay readable when the strip shrinks on a phone. */}
      <div className="mt-1 flex items-start justify-between gap-3 text-[13px] text-muted tabular">
        <span>
          {ranked.length > 0 ? metric.format(ranked[ranked.length - 1].values[metric.id]!) : ""}
        </span>
        <span className="text-center">
          <span
            className="mr-1 inline-block w-4 border-t border-dashed border-fg align-middle"
            aria-hidden="true"
          />
          mediana {metric.format(median)}
          {selected && (
            <span className="ml-2 font-bold text-fg">
              <span aria-hidden="true">◯ </span>
              {selected.name} {metric.format(selected.values[metric.id]!)}
            </span>
          )}
        </span>
        <span>{ranked.length > 0 ? metric.format(ranked[0].values[metric.id]!) : ""}</span>
      </div>

      <div className="mt-4 grid gap-x-10 gap-y-4 md:grid-cols-2">
        <div>
          <p className="mb-1 text-xs font-bold tracking-[0.08em] text-muted uppercase">Más altos</p>
          <ol className="m-0 list-none p-0">
            {top.map((place, index) => (
              <Row
                key={place.id}
                place={place}
                rank={index + 1}
                metric={metric}
                selected={place.id === selectedId}
                onSelect={onSelect}
              />
            ))}
          </ol>
        </div>
        <div>
          <p className="mb-1 text-xs font-bold tracking-[0.08em] text-muted uppercase">Más bajos</p>
          <ol className="m-0 list-none p-0">
            {bottom.map((place, index) => (
              <Row
                key={place.id}
                place={place}
                rank={ranked.length - bottom.length + index + 1}
                metric={metric}
                selected={place.id === selectedId}
                onSelect={onSelect}
              />
            ))}
          </ol>
        </div>
      </div>
      {selected && !shownElsewhere && (
        <ol className="m-0 mt-3 list-none p-0">
          <Row
            place={selected}
            rank={selectedIndex + 1}
            metric={metric}
            selected
            onSelect={onSelect}
          />
        </ol>
      )}
      {missingCount > 0 && (
        <p className="mt-3 text-sm text-muted">
          {missingCount} sin dato publicado: no entran al orden.
        </p>
      )}
    </section>
  );
});
