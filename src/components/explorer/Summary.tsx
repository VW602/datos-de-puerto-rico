import { X } from "lucide-react";
import { LAUS_LATEST, LAUS_LATEST_PRELIMINARY, comparisons, monthShort } from "@/data/pr/laus";
import { islandStat } from "@/data/pr/layers";
import { prMetricById, type PrMetric, type PrMetricId } from "@/data/pr/metrics";
import { MISSING_COPY, missingReason } from "@/data/pr/missing";
import type { Municipio } from "@/data/pr/places";
import { deltaWords, rankOf, shortPeriod } from "@/data/pr/present";
import { PUBLIC_GROUPS, isPublicMetric, publicMetricsInGroup } from "@/data/pr/public";
import type { Ranking } from "@/data/pr/ranking";
import { provenanceForMetric } from "@/data/pr/sources";
import { ALL, FEMA_METRIC_IDS, disasterLabel } from "@/data/pr/fema";
import { FUNDS_FY } from "@/data/pr/funds";
import { FemaIsland, FemaMunicipio } from "./FemaDetail";
import { FundsIsland, FundsMunicipio } from "./FundsDetail";
import { LausTrend } from "./LausTrend";

/** Key profile shown under the main value, in this order (the active measure is skipped). */
const PROFILE: PrMetricId[] = ["population", "income", "medianage", "poverty", "traffic"];

const MONTHLY: PrMetricId = "unemploymentMonthly";
const FUNDS: PrMetricId[] = ["fedObligations", "fedOutlays", "fedAwards"];
const FEMA: PrMetricId[] = FEMA_METRIC_IDS;

function periodOf(id: PrMetricId): string {
  // Monthly data: the exact month, not the registry's range.
  if (id === MONTHLY)
    return `${monthShort(LAUS_LATEST)}${LAUS_LATEST_PRELIMINARY ? " (preliminar)" : ""}`;
  // FEMA: the records of every disaster unless one is chosen (shown next to the filter).
  if (FEMA.includes(id)) return "OpenFEMA";
  // Federal funds: the exact federal fiscal year.
  if (FUNDS.includes(id)) return `AF ${FUNDS_FY}`;
  const period = provenanceForMetric(id)?.period;
  return period ? shortPeriod(period) : "";
}

function ValueWithMoe({ place, id }: { place: Municipio; id: PrMetricId }) {
  const metric = prMetricById(id);
  const island = islandStat(id);
  const value = island ? island.value : place.values[id];
  const moe = island ? null : (place.moe[id] ?? null);
  if (value == null)
    return <span className="text-muted">{MISSING_COPY[missingReason(id, place.id)].short}</span>;
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
  const value = comparisons(null, "rate")?.latest.value ?? null;
  if (value == null) return null;
  return (
    <p className="mt-1 text-base text-muted tabular">
      Puerto Rico completo: {value.toFixed(1)}% ({monthShort(LAUS_LATEST)}
      {LAUS_LATEST_PRELIMINARY ? ", preliminar" : ""}).
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
  const island = islandStat(metric.id);
  const period = periodOf(metric.id);
  const big = size === "desktop" ? "text-[72px] md:text-[96px]" : "text-[72px]";

  if (!place) {
    return (
      <section aria-label="Resumen" className="border-t-2 border-fg pt-4">
        <p className="text-xs font-bold tracking-[0.09em] text-accent uppercase">
          Puerto Rico · {metric.label}
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
            <p className="mt-2 text-base text-muted">
              Mediana de los {ranking.ranked.length} municipios con dato · {period}
            </p>
            {ranking.ranked.length > 1 && (
              <p className="mt-1 text-base text-muted tabular">
                De {metric.format(ranking.ranked[ranking.ranked.length - 1].values[metric.id]!)} en{" "}
                {ranking.ranked[ranking.ranked.length - 1].name} a{" "}
                {metric.format(ranking.ranked[0].values[metric.id]!)} en {ranking.ranked[0].name}.
              </p>
            )}
            {metric.id === MONTHLY && <PuertoRicoRate />}
            <p className="mt-4 text-base">
              Escoge un municipio en el mapa, en la lista o con el buscador.
            </p>
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
      aria-label={`Municipio seleccionado: ${place.name}`}
      className="border-t-2 border-fg pt-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold tracking-[0.09em] text-accent uppercase">
            Municipio seleccionado
          </p>
          <h2 className="mt-1 font-display text-[38px] leading-none font-medium md:text-5xl">
            {place.name}
          </h2>
        </div>
        <button
          type="button"
          aria-label={`Quitar la selección de ${place.name}`}
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
          ? MISSING_COPY[missingReason(metric.id, place.id)].short
          : metric.format(value)}
      </p>
      <p className="mt-2 text-[15px] text-muted">
        {metric.label} · {metric.source}
        {FEMA.includes(metric.id) ? ` · ${disasterLabel(disaster)}` : ""}
        {island ? " · cifra de toda la isla, no del municipio" : ""}
      </p>
      {metric.id === MONTHLY && LAUS_LATEST_PRELIMINARY && value != null && (
        <p className="mt-1 text-[15px] text-warning">
          Preliminar: BLS revisa cada mes la cifra del mes anterior.
        </p>
      )}
      {metric.signed && value != null && value < 0 && (
        <p className="mt-1 text-[15px] text-muted">
          Neto negativo: en este año pesaron más las desobligaciones y ajustes que las obligaciones
          nuevas. No es un dato que falta ni $0.
        </p>
      )}
      {value == null && !island && (
        <p className="mt-1 text-[15px] text-muted">
          {MISSING_COPY[missingReason(metric.id, place.id)].long}
        </p>
      )}

      {!island && value != null && (
        <dl className="mt-4 grid grid-cols-2 border-t border-divider">
          <div className="border-b border-divider-2 py-3 pr-3">
            <dt className="text-[13px] text-muted">Lugar entre los 78</dt>
            <dd className="mt-0.5 text-[22px] font-semibold tabular md:text-[26px]">
              {rank ? `${rank.rank} de ${rank.of}` : "—"}
            </dd>
          </div>
          <div className="border-b border-l border-divider-2 py-3 pl-3.5">
            <dt className="text-[13px] text-muted">
              Frente a la mediana ({metric.format(ranking.median)})
            </dt>
            <dd className="mt-0.5 text-[22px] font-semibold tabular md:text-[26px]">
              {deltaWords(metric, value - ranking.median).replace(" frente a la mediana", "")}
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
        className={`grid grid-cols-2 border-t border-divider ${metric.id === MONTHLY || FUNDS.includes(metric.id) || FEMA.includes(metric.id) ? "mt-5" : ""}`}
      >
        {others.map((id, index) => {
          const other = prMetricById(id);
          return (
            <div
              key={id}
              className={`border-b border-divider-2 py-3 ${index % 2 ? "border-l pl-3.5" : "pr-3"}`}
            >
              <dt className="text-[13px] text-muted">
                {other.label} · {periodOf(id)}
              </dt>
              <dd className="mt-0.5 text-xl font-semibold tabular">
                <ValueWithMoe place={place} id={id} />
              </dd>
            </div>
          );
        })}
      </dl>
      <p className="mt-2.5 text-[13px] text-muted">
        ± es el margen de error del Censo (90%): el valor real probablemente está dentro de ese
        rango. Solo aparece cuando el Censo lo publica para esa cifra.
      </p>
    </section>
  );
}

/** All public measures for one municipio, by group. */
export function FullProfile({ place }: { place: Municipio }) {
  return (
    <div className="flex flex-col gap-5">
      {PUBLIC_GROUPS.map((group) => (
        <section key={group} aria-label={group}>
          <h3 className="text-xs font-bold tracking-[0.08em] text-muted uppercase">
            {group === "Isla" ? "Toda la isla" : group}
          </h3>
          <dl className="mt-1">
            {publicMetricsInGroup(group).map((metric) => (
              <div
                key={metric.id}
                className="flex items-baseline justify-between gap-3 border-b border-divider-2 py-2.5"
              >
                <dt className="text-[15px]">
                  {metric.label}{" "}
                  <span className="text-[13px] text-muted">· {periodOf(metric.id)}</span>
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
