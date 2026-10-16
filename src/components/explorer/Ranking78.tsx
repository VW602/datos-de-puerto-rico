import { memo } from "react";
import type { PrMetric } from "@/data/pr/metrics";
import type { Municipio } from "@/data/pr/places";
import type { Ranking } from "@/data/pr/ranking";
import { SIGNED_PATTERNS, normalize, valueClass } from "@/data/scale";
import { useLocale } from "@/i18n/context";
import { EXPLORER_MESSAGES } from "@/i18n/messages/explorer";

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
        className={`flex min-h-11 w-full flex-wrap items-center justify-between gap-x-3 text-left text-base tabular hover:bg-track ${
          selected ? "border-b-2 border-fg font-bold" : "border-b border-divider-2"
        }`}
      >
        <span className="min-w-0">
          <span className={`inline-block w-8 ${selected ? "" : "text-muted"}`}>{rank}</span>
          {place.name}
        </span>
        {/* With large text the value moves under the name (right-aligned) instead of overlapping it. */}
        <span className="ml-auto min-w-0 text-right">
          {metric.format(place.values[metric.id]!)}
        </span>
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
  const all = EXPLORER_MESSAGES[useLocale()];
  const t = all.ranking;
  const legend = all.legend;
  const { ranked, min, max, median } = ranking;
  // Signed metrics: $0 and net negative values sit in their own zone at the
  // left, apart from the positive axis, never squeezed onto its lowest point.
  const values = ranked.map((place) => place.values[metric.id]!);
  const zone = metric.signed && values.some((v) => v <= 0) ? 56 : 0;
  const x = (value: number) => {
    if (zone && value < 0) return X0;
    if (zone && value === 0) return X0 + zone / 2;
    return X0 + zone + normalize(value, min, max, metric.scale) * (X1 - X0 - zone);
  };
  const dot = (place: Municipio) => {
    const value = place.values[metric.id]!;
    const cls = metric.signed ? valueClass(value) : "POSITIVE";
    const cx = x(value);
    if (cls === "NEGATIVE")
      return (
        <g key={place.id}>
          <circle
            cx={cx}
            cy={26}
            r={6}
            fill={SIGNED_PATTERNS.negative.base}
            stroke="var(--color-muted)"
            strokeWidth={0.7}
          />
          <line
            x1={cx - 3.5}
            x2={cx + 3.5}
            y1={26}
            y2={26}
            stroke={SIGNED_PATTERNS.negative.stripe}
            strokeWidth={1.6}
          />
        </g>
      );
    if (cls === "ZERO")
      return (
        <g key={place.id}>
          <circle
            cx={cx}
            cy={26}
            r={6}
            fill={SIGNED_PATTERNS.zero.base}
            stroke="var(--color-muted)"
            strokeWidth={0.7}
          />
          <circle cx={cx} cy={26} r={1.4} fill={SIGNED_PATTERNS.zero.dot} />
        </g>
      );
    return (
      <circle
        key={place.id}
        cx={cx}
        cy={26}
        r={6}
        fill={fills[place.id]}
        stroke="var(--color-muted)"
        strokeWidth={0.7}
      />
    );
  };
  const top = ranked.slice(0, 5);
  const bottom = ranked.slice(-5);
  const selectedIndex = selectedId ? ranked.findIndex((place) => place.id === selectedId) : -1;
  const selected = selectedIndex >= 0 ? ranked[selectedIndex] : null;
  const shownElsewhere =
    selectedIndex >= 0 && (selectedIndex < 5 || selectedIndex >= ranked.length - 5);

  return (
    <section aria-label={t.heading} className="@container/ranking">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4">
        <h2 className="font-display text-[26px] font-medium md:text-3xl">{t.heading}</h2>
        <span className="text-sm text-muted">{t.notAScore}</span>
      </div>
      <svg
        viewBox={`0 0 ${W} 52`}
        className="mt-3 block h-auto w-full"
        role="img"
        aria-label={t.stripLabel(
          ranked.length,
          metric.label,
          metric.format(median),
          selected ? t.stripSelected(selected.name, selectedIndex + 1) : "",
        )}
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
        {zone > 0 && (
          <line
            x1={X0 + zone - 6}
            x2={X0 + zone - 6}
            y1={12}
            y2={40}
            stroke="var(--color-divider)"
            strokeWidth={1}
          />
        )}
        {ranked.map(dot)}
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
      {/*
        Labels are text, not SVG, so they stay readable when the strip shrinks on a phone.
        They follow the ranking's own width (container query), not the screen's: on one
        line when there is room; otherwise the lowest and highest values stay at the
        left and right ends and the median moves to its own centered line. Nothing is
        clipped and nothing pushes the page sideways (large zoom, long values, a
        selected municipio).
      */}
      <div className="@container mt-1">
        <div
          className="flex flex-wrap items-start gap-x-3 gap-y-0.5 text-[13px] text-muted tabular @md:flex-nowrap @md:justify-between"
          data-scale-labels
        >
          <span className="min-w-0">
            <span className="sr-only">{legend.lowest}</span>
            {ranked.length > 0 ? metric.format(ranked[ranked.length - 1].values[metric.id]!) : ""}
          </span>
          <span className="order-last min-w-0 basis-full text-center [overflow-wrap:anywhere] @md:order-none @md:basis-auto">
            <span
              className="mr-1 inline-block w-4 border-t border-dashed border-fg align-middle"
              aria-hidden="true"
            />
            {t.median} {metric.format(median)}
            {selected && (
              <span className="ml-2 font-bold text-fg">
                <span aria-hidden="true">◯ </span>
                {selected.name} {metric.format(selected.values[metric.id]!)}
              </span>
            )}
          </span>
          <span className="ml-auto min-w-0 text-right">
            <span className="sr-only">{legend.highest}</span>
            {ranked.length > 0 ? metric.format(ranked[0].values[metric.id]!) : ""}
          </span>
        </div>
      </div>

      <div className="mt-4 grid gap-x-10 gap-y-4 @md/ranking:grid-cols-2">
        <div>
          <p className="mb-1 text-xs font-bold tracking-[0.08em] text-muted uppercase">
            {t.highest}
          </p>
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
          <p className="mb-1 text-xs font-bold tracking-[0.08em] text-muted uppercase">
            {t.lowest}
          </p>
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
      {missingCount > 0 && <p className="mt-3 text-sm text-muted">{t.missing(missingCount)}</p>}
    </section>
  );
});
