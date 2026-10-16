import { X } from "lucide-react";
import { LAUS_LATEST, LAUS_LATEST_PRELIMINARY, comparisons, monthShort } from "@/data/pr/laus";
import { islandStat } from "@/data/pr/layers";
import { groupLabel, prMetricById, type PrMetric, type PrMetricId } from "@/data/pr/metrics";
import { missingCopy, missingReason } from "@/data/pr/missing";
import type { Municipio } from "@/data/pr/places";
import { deltaText, deltaWords, rankOf, shortPeriod } from "@/data/pr/present";
import { PUBLIC_GROUPS, isPublicMetric, publicMetricsInGroup } from "@/data/pr/public";
import type { Ranking } from "@/data/pr/ranking";
import { provenanceForMetric } from "@/data/pr/sources";
import { ALL, FEMA_METRIC_IDS, disasterLabel } from "@/data/pr/fema";
import { FUNDS_FY } from "@/data/pr/funds";
import { useLocale } from "@/i18n/context";
import type { Locale } from "@/i18n/locale";
import { EXPLORER_MESSAGES } from "@/i18n/messages/explorer";
import { FemaIsland, FemaMunicipio } from "./FemaDetail";
import { FundsIsland, FundsMunicipio } from "./FundsDetail";
import { LausTrend } from "./LausTrend";

/** Key profile shown under the main value, in this order (the active measure is skipped). */
const PROFILE: PrMetricId[] = ["population", "income", "medianage", "poverty", "traffic"];

const MONTHLY: PrMetricId = "unemploymentMonthly";
const FUNDS: PrMetricId[] = ["fedObligations", "fedOutlays", "fedAwards"];
const FEMA: PrMetricId[] = FEMA_METRIC_IDS;

function periodOf(id: PrMetricId, locale: Locale): string {
  const t = EXPLORER_MESSAGES[locale].summary;
  // Monthly data: the exact month, not the registry's range.
  if (id === MONTHLY)
    return `${monthShort(LAUS_LATEST, locale)}${LAUS_LATEST_PRELIMINARY ? t.preliminarySuffix : ""}`;
  // FEMA: the records of every disaster unless one is chosen (shown next to the filter).
  if (FEMA.includes(id)) return "OpenFEMA";
  // Federal funds: the exact federal fiscal year.
  if (FUNDS.includes(id)) return t.fiscalYear(FUNDS_FY);
  const period = provenanceForMetric(id, locale)?.period;
  return period ? shortPeriod(period) : "";
}

function ValueWithMoe({ place, id }: { place: Municipio; id: PrMetricId }) {
  const locale = useLocale();
  const metric = prMetricById(id, locale);
  const island = islandStat(id, locale);
  const value = island ? island.value : place.values[id];
  const moe = island ? null : (place.moe[id] ?? null);
  if (value == null)
    return (
      <span className="text-muted">{missingCopy(locale)[missingReason(id, place.id)].short}</span>
    );
  return (
    <>
      {metric.format(value)}
      {moe != null && (
        <span className="ml-1 text-[15px] font-normal text-muted">± {metric.format(moe)}</span>
      )}
    </>
  );
}

/** Puerto Rico's own published rate (series LAUST72…), next to the municipio median. */
function PuertoRicoRate() {
  const locale = useLocale();
  const value = comparisons(null, "rate")?.latest.value ?? null;
  if (value == null) return null;
  return (
    <p className="mt-1 text-base text-muted tabular">
      {EXPLORER_MESSAGES[locale].summary.prRate(
        `${value.toFixed(1)}%`,
        monthShort(LAUS_LATEST, locale),
        LAUS_LATEST_PRELIMINARY,
      )}
    </p>
  );
}

export function Summary({
  metric,
  place,
  ranking,
  onClear,
  size = "desktop",
  disaster = ALL,
}: {
  metric: PrMetric;
  place: Municipio | null;
  ranking: Ranking;
  onClear: () => void;
  size?: "desktop" | "mobile";
  disaster?: string;
}) {
  const locale = useLocale();
  const t = EXPLORER_MESSAGES[locale].summary;
  const island = islandStat(metric.id, locale);
  const period = periodOf(metric.id, locale);
  // The headline value follows the summary's own width (container query units),
  // between a large floor (2.25rem, which grows with the reader's text size) and
  // the original 72 / 96 px. The section uses break-words: a word that still does
  // not fit breaks instead of widening the page, and the full value is always shown.
  const big =
    size === "desktop"
      ? "text-[clamp(2.25rem,20cqi,4.5rem)] md:text-[clamp(2.25rem,20cqi,6rem)]"
      : "text-[clamp(2.25rem,20cqi,4.5rem)]";

  if (!place) {
    return (
      <section aria-label={t.label} className="@container border-t-2 border-fg pt-4 break-words">
        <p className="text-xs font-bold tracking-[0.09em] text-accent uppercase">
          {t.puertoRico} · {metric.label}
        </p>
        {island ? (
          <>
            <p
              className={`mt-3 font-display ${big} leading-[0.9] font-medium tracking-tight tabular`}
            >
              {metric.format(island.value)}
            </p>
            <p className="mt-3 text-base text-muted">{island.note}</p>
          </>
        ) : (
          <>
            <p className="mt-3 font-display text-[44px] leading-none font-medium tabular">
              {metric.format(ranking.median)}
            </p>
            <p className="mt-2 text-base text-muted">{t.median(ranking.ranked.length, period)}</p>
            {ranking.ranked.length > 1 && (
              <p className="mt-1 text-base text-muted tabular">
                {t.range(
                  metric.format(ranking.ranked[ranking.ranked.length - 1].values[metric.id]!),
                  ranking.ranked[ranking.ranked.length - 1].name,
                  metric.format(ranking.ranked[0].values[metric.id]!),
                  ranking.ranked[0].name,
                )}
              </p>
            )}
            {metric.id === MONTHLY && <PuertoRicoRate />}
            <p className="mt-4 text-base">{t.choose}</p>
            {metric.id === MONTHLY && <LausTrend id={null} name="Puerto Rico" />}
            {FUNDS.includes(metric.id) && <FundsIsland />}
            {FEMA.includes(metric.id) && <FemaIsland disaster={disaster} />}
          </>
        )}
      </section>
    );
  }

  const value = island ? island.value : place.values[metric.id];
  const rank = rankOf(ranking, place.id);
  const others = PROFILE.filter((id) => id !== metric.id && isPublicMetric(id)).slice(0, 4);

  return (
    <section
      aria-label={t.selectedLabel(place.name)}
      className="@container border-t-2 border-fg pt-4 break-words"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold tracking-[0.09em] text-accent uppercase">{t.selected}</p>
          <h2 className="mt-1 font-display text-[38px] leading-none font-medium md:text-5xl">
            {place.name}
          </h2>
        </div>
        <button
          type="button"
          aria-label={t.clear(place.name)}
          onClick={onClear}
          className="flex size-11 shrink-0 items-center justify-center rounded-[3px] border border-divider bg-surface hover:bg-track"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>

      <p
        className={`mt-4 font-display ${big} leading-[0.9] font-medium tracking-tight tabular`}
        aria-live="polite"
      >
        {value == null
          ? missingCopy(locale)[missingReason(metric.id, place.id)].short
          : metric.format(value)}
      </p>
      <p className="mt-2 text-[15px] text-muted">
        {metric.label} · {metric.source}
        {FEMA.includes(metric.id) ? ` · ${disasterLabel(disaster, locale)}` : ""}
        {island ? t.islandFigure : ""}
      </p>
      {metric.id === MONTHLY && LAUS_LATEST_PRELIMINARY && value != null && (
        <p className="mt-1 text-[15px] text-warning">{t.preliminary}</p>
      )}
      {metric.signed && value != null && value < 0 && (
        <p className="mt-1 text-[15px] text-muted">{t.netNegative}</p>
      )}
      {value == null && !island && (
        <p className="mt-1 text-[15px] text-muted">
          {missingCopy(locale)[missingReason(metric.id, place.id)].long}
        </p>
      )}

      {!island && value != null && (
        <dl className="mt-4 grid grid-cols-1 border-t border-divider @[18rem]:grid-cols-2">
          <div className="border-b border-divider-2 py-3 pr-3">
            <dt className="text-[13px] text-muted">{t.rank}</dt>
            <dd className="mt-0.5 text-[22px] font-semibold tabular md:text-[26px]">
              {rank ? t.rankOf(rank.rank, rank.of) : "—"}
            </dd>
          </div>
          <div className="border-b border-divider-2 py-3 @[18rem]:border-l @[18rem]:pl-3.5">
            <dt className="text-[13px] text-muted">{t.vsMedian(metric.format(ranking.median))}</dt>
            <dd className="mt-0.5 text-[22px] font-semibold tabular md:text-[26px]">
              {Math.abs(value - ranking.median) < 1e-9
                ? deltaWords(metric, 0, locale)
                : deltaText(metric, value - ranking.median, locale)}
            </dd>
          </div>
        </dl>
      )}

      {metric.id === MONTHLY && <LausTrend id={place.id} name={place.name} />}
      {FUNDS.includes(metric.id) && <FundsMunicipio id={place.id} />}
      {FEMA.includes(metric.id) && (
        <FemaMunicipio id={place.id} name={place.name} disaster={disaster} />
      )}

      <dl
        className={`grid grid-cols-1 border-t border-divider @[18rem]:grid-cols-2 ${metric.id === MONTHLY || FUNDS.includes(metric.id) || FEMA.includes(metric.id) ? "mt-5" : ""}`}
      >
        {others.map((id, index) => {
          const other = prMetricById(id, locale);
          return (
            <div
              key={id}
              className={`border-b border-divider-2 py-3 ${index % 2 ? "@[18rem]:border-l @[18rem]:pl-3.5" : "pr-3"}`}
            >
              <dt className="text-[13px] text-muted">
                {other.label} · {periodOf(id, locale)}
              </dt>
              <dd className="mt-0.5 text-xl font-semibold tabular">
                <ValueWithMoe place={place} id={id} />
              </dd>
            </div>
          );
        })}
      </dl>
      <p className="mt-2.5 text-[13px] text-muted">{t.moe}</p>
    </section>
  );
}

/** All public measures for one municipio, by group. */
export function FullProfile({ place }: { place: Municipio }) {
  const locale = useLocale();
  return (
    <div className="flex flex-col gap-5">
      {PUBLIC_GROUPS.map((group) => (
        <section key={group} aria-label={groupLabel(group, locale)}>
          <h3 className="text-xs font-bold tracking-[0.08em] text-muted uppercase">
            {groupLabel(group, locale)}
          </h3>
          <dl className="mt-1">
            {publicMetricsInGroup(group, locale).map((metric) => (
              <div
                key={metric.id}
                className="flex items-baseline justify-between gap-3 border-b border-divider-2 py-2.5"
              >
                <dt className="text-[15px]">
                  {metric.label}{" "}
                  <span className="text-[13px] text-muted">· {periodOf(metric.id, locale)}</span>
                </dt>
                <dd className="text-right text-[15px] font-semibold tabular">
                  <ValueWithMoe place={place} id={metric.id} />
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}
