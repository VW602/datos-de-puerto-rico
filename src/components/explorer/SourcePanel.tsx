import type { ReactNode } from "react";
import { LAUS_LATEST, LAUS_SOURCE, isPreliminary, lausBlock, monthLabel } from "@/data/pr/laus";
import { ALL, FEMA_SOURCE, disasterLabel, femaDisaster, dayLabel as femaDay } from "@/data/pr/fema";
import { FUNDS_SOURCE, dayLabel, fundsFyLabel } from "@/data/pr/funds";
import type { PrMetric } from "@/data/pr/metrics";
import type { Municipio } from "@/data/pr/places";
import { agencyDisplay, shortPeriod } from "@/data/pr/present";
import { publicSourceForMetric } from "@/data/pr/sources";
import { useLocale } from "@/i18n/context";
import type { Locale } from "@/i18n/locale";
import { FEMA_MESSAGES } from "@/i18n/messages/fema";
import { FUNDS_MESSAGES } from "@/i18n/messages/funds";
import { SOURCE_MESSAGES } from "@/i18n/messages/sources";

/** "¿De dónde sale este dato?": a readable explanation first, then the structured record. */
/** BLS LAUS rows: the exact month and status, the series behind the value, and the BLS notice. */
function lausRows(place: Municipio | null, locale: Locale): [string, ReactNode][] {
  const t = SOURCE_MESSAGES[locale].laus;
  const series = lausBlock(place?.id ?? null)?.series.rate ?? null;
  const preliminary = isPreliminary(LAUS_LATEST);
  return [
    [
      t.month,
      <>
        {monthLabel(LAUS_LATEST, locale)} ·{" "}
        {preliminary ? <strong className="text-warning">{t.preliminary}</strong> : t.final}
        <span className="mt-0.5 block text-[13px] text-muted">
          {preliminary ? t.preliminaryNote : t.finalNote}
          {t.annualNote}
        </span>
      </>,
    ],
    [
      t.series,
      <>
        <code className="text-[14px] break-all">{series ?? "—"}</code>
        <span className="mt-0.5 block text-[13px] text-muted">
          {t.seriesNote(place ? place.name : t.wholePuertoRico)}
        </span>
      </>,
    ],
    [t.notice, <span lang="en">{LAUS_SOURCE.terms.disclaimer}</span>],
  ];
}

/** USAspending rows: field used, period, geography rule, dates and what each money word means. */
function fundsRows(metricId: string, locale: Locale): [string, ReactNode][] {
  const t = FUNDS_MESSAGES[locale];
  const day = (iso: string) => dayLabel(iso, locale);
  const sameDay =
    FUNDS_SOURCE.retrievedUntil.slice(0, 10) === FUNDS_SOURCE.retrievedAt.slice(0, 10);
  return [
    [t.rows.field, t.fieldUsed[metricId]],
    [t.rows.fiscalYear, fundsFyLabel(locale)],
    [t.rows.place, t.placeRule],
    [t.rows.obligated, t.obligatedRule],
    [t.rows.disbursed, t.disbursedRule(day(FUNDS_SOURCE.outlaysReportedThrough.periodEnd))],
    [
      t.rows.updated,
      t.updated(
        day(FUNDS_SOURCE.sourceLastUpdated),
        day(FUNDS_SOURCE.retrievedAt),
        sameDay ? null : day(FUNDS_SOURCE.retrievedUntil),
      ),
    ],
  ];
}

/** OpenFEMA dataset behind each FEMA measure (the field text is in the FEMA messages). */
const FEMA_DATASET: Record<string, keyof typeof FEMA_SOURCE.datasets | "housing"> = {
  femaPaObligated: "publicAssistance",
  femaPaProjects: "publicAssistance",
  femaIhpApproved: "housing",
  femaHmaObligated: "mitigation",
};

function femaRows(metricId: string, disaster: string, locale: Locale): [string, ReactNode][] {
  const t = FEMA_MESSAGES[locale];
  const dataset = FEMA_DATASET[metricId];
  const sets =
    dataset === "housing"
      ? [FEMA_SOURCE.datasets.housingOwners, FEMA_SOURCE.datasets.housingRenters]
      : [FEMA_SOURCE.datasets[dataset]];
  const d = disaster === ALL ? null : femaDisaster(disaster);
  return [
    [
      t.rows.dataset,
      <>
        {sets.map((set) => (
          <span key={set.name} className="block" lang="en">
            {set.name} v{set.version}
          </span>
        ))}
      </>,
    ],
    [t.rows.field, t.fields[metricId]],
    [
      t.rows.disaster,
      d
        ? `${disasterLabel(disaster, locale)}${d.number ? t.rows.disasterNumber(d.number) : ""}`
        : t.rows.allDisasters,
    ],
    [
      t.rows.place,
      dataset === "publicAssistance"
        ? t.places.publicAssistance
        : dataset === "housing"
          ? t.places.housing
          : t.places.mitigation,
    ],
    [
      t.rows.dataDate,
      sets
        .map((set) => t.rows.dataDateValue(set.name, femaDay(set.lastDataSetRefresh, locale)))
        .join(" · "),
    ],
    [t.rows.retrieved, t.rows.retrievedValue(femaDay(FEMA_SOURCE.retrievedAt, locale))],
    [t.rows.notice, <span lang="en">{FEMA_SOURCE.terms.disclaimer}</span>],
  ];
}

export function SourcePanel({
  metric,
  place = null,
  disaster = ALL,
  headingLevel = 2,
}: {
  metric: PrMetric;
  place?: Municipio | null;
  disaster?: string;
  headingLevel?: 2 | 3;
}) {
  const locale = useLocale();
  const t = SOURCE_MESSAGES[locale];
  const source = publicSourceForMetric(metric.id, locale);
  if (!source) return null;
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const survey = source.marginOfErrorAvailable;
  const agency = agencyDisplay(source.sourceAgency, locale);
  const monthly = metric.id === "unemploymentMonthly";
  const federal =
    metric.id === "fedObligations" || metric.id === "fedOutlays" || metric.id === "fedAwards";
  const recovery = metric.id in FEMA_DATASET;
  const day = (iso: string) => dayLabel(iso, locale);
  const rows: [string, ReactNode][] = [
    [
      t.rows.source,
      agency.es ? (
        <>
          {agency.es}
          <span className="mt-0.5 block text-[13px] text-muted" lang="en">
            {agency.official}
          </span>
        </>
      ) : (
        <span lang="en">{agency.official}</span>
      ),
    ],
    [t.rows.dataset, <span lang="en">{source.sourceTitle}</span>],
    ...(monthly
      ? lausRows(place, locale)
      : federal
        ? fundsRows(metric.id, locale)
        : recovery
          ? femaRows(metric.id, disaster, locale)
          : [[t.rows.period, source.reportingPeriod] as [string, ReactNode]]),
    [t.rows.method, source.methodology ?? t.rows.methodFallback],
    [
      t.rows.moe,
      survey
        ? t.moe.survey
        : federal || recovery
          ? t.moe.reported
          : monthly
            ? t.moe.monthly
            : t.moe.none,
    ],
    [
      t.rows.copy,
      source.retrievedAt
        ? t.copy.on(
            monthly
              ? t.copy.bls
              : federal
                ? t.copy.usaspending
                : recovery
                  ? t.copy.openfema
                  : t.copy.downloaded,
            day(source.retrievedAt),
          )
        : t.copy.perPublication(shortPeriod(source.reportingPeriod)),
    ],
  ];
  return (
    // Long machine identifiers (datasets, fields, series IDs) stay complete and
    // selectable; they may break across lines instead of widening the page.
    <section
      aria-label={t.heading}
      className="grid gap-x-14 gap-y-6 [overflow-wrap:anywhere] md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"
    >
      <div className="min-w-0">
        <Heading className="font-display text-[26px] leading-tight font-medium md:text-3xl">
          {t.heading}
        </Heading>
        <p className="mt-3 text-[17px] leading-relaxed">
          <strong>{metric.label}:</strong> {metric.hint.replace(/\.?$/, ".")}
          {t.comesFrom(agency.from)}
        </p>
        {survey && (
          <p className="mt-2 text-[17px] leading-relaxed">
            {t.survey(shortPeriod(source.reportingPeriod))}
          </p>
        )}
        {monthly && <p className="mt-2 text-[17px] leading-relaxed">{t.monthly}</p>}
        {federal && <p className="mt-2 text-[17px] leading-relaxed">{t.federal}</p>}
        {recovery && <p className="mt-2 text-[17px] leading-relaxed">{t.recovery}</p>}
        {source.sourceURL && (
          <a
            href={source.sourceURL}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex min-h-12 items-center rounded-[3px] border border-fg px-4 text-base font-semibold text-fg no-underline hover:bg-track"
          >
            {t.officialLink}
          </a>
        )}
      </div>
      <div className="min-w-0">
        <dl className="grid grid-cols-[minmax(0,9.5rem)_minmax(0,1fr)] border-t-2 border-fg text-[15px] leading-snug">
          {rows.map(([term, value]) => (
            <div key={term} className="contents">
              <dt className="border-b border-divider-2 py-2.5 pr-3 text-muted">{term}</dt>
              <dd className="border-b border-divider-2 py-2.5">{value}</dd>
            </div>
          ))}
        </dl>
        <details className="mt-3 text-sm text-muted">
          <summary className="flex min-h-11 cursor-pointer items-center font-semibold text-fg">
            {t.technical.open}
          </summary>
          <dl className="mt-1 flex flex-col gap-2 pb-2">
            <div>
              <dt className="font-semibold text-fg">{t.technical.citation}</dt>
              <dd>{source.attribution}</dd>
            </div>
            <div>
              <dt className="font-semibold text-fg">{t.technical.missing}</dt>
              <dd>{source.missingValuePolicy}</dd>
            </div>
            {source.retrievedAt && (
              <div>
                <dt className="font-semibold text-fg">{t.technical.saved}</dt>
                <dd>{t.technical.savedText(day(source.retrievedAt))}</dd>
              </div>
            )}
          </dl>
        </details>
      </div>
    </section>
  );
}
