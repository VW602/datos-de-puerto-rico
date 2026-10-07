import type { ReactNode } from "react";
import { LAUS_LATEST, LAUS_SOURCE, isPreliminary, lausBlock, monthLabel } from "@/data/pr/laus";
import { FUNDS_FY_LABEL, FUNDS_SOURCE, dayLabel } from "@/data/pr/funds";
import type { PrMetric } from "@/data/pr/metrics";
import type { Municipio } from "@/data/pr/places";
import { agencyDisplay, shortPeriod } from "@/data/pr/present";
import { publicSourceForMetric } from "@/data/pr/sources";

function shortDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  const months = [
    "ene",
    "feb",
    "mar",
    "abr",
    "may",
    "jun",
    "jul",
    "ago",
    "sep",
    "oct",
    "nov",
    "dic",
  ];
  return `${day} ${months[month - 1]} ${year}`;
}

/** "¿De dónde sale este dato?": a readable explanation first, then the structured record. */
/** BLS LAUS rows: the exact month and status, the series behind the value, and the BLS notice. */
function lausRows(place: Municipio | null): [string, ReactNode][] {
  const series = lausBlock(place?.id ?? null)?.series.rate ?? null;
  const preliminary = isPreliminary(LAUS_LATEST);
  return [
    [
      "Mes",
      <>
        {monthLabel(LAUS_LATEST)} ·{" "}
        {preliminary ? <strong className="text-warning">Preliminar</strong> : "Final"}
        <span className="mt-0.5 block text-[13px] text-muted">
          {preliminary
            ? "BLS revisa la cifra preliminar al publicar el mes siguiente."
            : "Cifra revisada por BLS."}{" "}
          Cada año, a principios de año, BLS revisa además los meses de años recientes.
        </span>
      </>,
    ],
    [
      "Serie",
      <>
        <code className="text-[14px] break-all">{series ?? "—"}</code>
        <span className="mt-0.5 block text-[13px] text-muted">
          {place ? place.name : "Puerto Rico completo"}: tasa de desempleo, sin ajuste estacional.
        </span>
      </>,
    ],
    ["Aviso de BLS", <span lang="en">{LAUS_SOURCE.terms.disclaimer}</span>],
  ];
}

const FIELD_USED: Record<string, string> = {
  fedObligations:
    "Suma de federal_action_obligation de las transacciones con fecha de acción en el año fiscal (contratos y asistencia a personas con el municipio como lugar de ejecución). Puede incluir montos negativos: desobligaciones.",
  fedOutlays:
    "total_outlays: pagos acumulados que las agencias reportan para cada adjudicación atribuible con actividad en el año fiscal. No se suma con las obligaciones de transacción.",
  fedAwards:
    "Número de adjudicaciones primarias (contratos y asistencia a personas) con actividad en el año fiscal y el municipio como lugar de ejecución.",
};

/** USAspending rows: field used, period, geography rule, dates and what each money word means. */
function fundsRows(metricId: string): [string, ReactNode][] {
  return [
    ["Campo", FIELD_USED[metricId]],
    ["Año fiscal federal", FUNDS_FY_LABEL],
    [
      "Lugar",
      "Lugar principal de ejecución, no la sede de quien recibe el dinero. El mapa solo pinta lo atribuible a un municipio: contratos que se ejecutan allí y asistencia a personas que viven allí. La asistencia a organizaciones y gobiernos que nombra un municipio puede ser una oficina que sirve a toda la isla: se muestra aparte, sin certeza. Lo que es para todo Puerto Rico o no dice municipio no se le asigna a ninguno.",
    ],
    [
      "Obligado",
      "El gobierno federal se comprometió legalmente a pagar. Obligado no quiere decir desembolsado ni gastado.",
    ],
    [
      "Desembolsado",
      `Pagos que la agencia federal reporta, hasta el ${dayLabel(FUNDS_SOURCE.outlaysReportedThrough.periodEnd)}. Un desembolso no reportado queda vacío: no quiere decir $0. Desembolsado tampoco quiere decir gastado por quien lo recibe.`,
    ],
    [
      "Actualizado",
      `USAspending: ${dayLabel(FUNDS_SOURCE.sourceLastUpdated)}. Copia obtenida de la API el ${dayLabel(FUNDS_SOURCE.retrievedAt)}${FUNDS_SOURCE.retrievedUntil.slice(0, 10) !== FUNDS_SOURCE.retrievedAt.slice(0, 10) ? ` al ${dayLabel(FUNDS_SOURCE.retrievedUntil)}` : ""}.`,
    ],
  ];
}

export function SourcePanel({
  metric,
  place = null,
  headingLevel = 2,
}: {
  metric: PrMetric;
  place?: Municipio | null;
  headingLevel?: 2 | 3;
}) {
  const source = publicSourceForMetric(metric.id);
  if (!source) return null;
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const survey = source.marginOfErrorAvailable;
  const agency = agencyDisplay(source.sourceAgency);
  const monthly = metric.id === "unemploymentMonthly";
  const federal =
    metric.id === "fedObligations" || metric.id === "fedOutlays" || metric.id === "fedAwards";
  const rows: [string, ReactNode][] = [
    [
      "Fuente",
      agency.es ? (
        <>
          {agency.es}
          <span className="mt-0.5 block text-[13px] text-muted" lang="en">
            {agency.official}
          </span>
        </>
      ) : (
        agency.official
      ),
    ],
    ["Dataset", <span lang="en">{source.sourceTitle}</span>],
    ...(monthly
      ? lausRows(place)
      : federal
        ? fundsRows(metric.id)
        : [["Periodo", source.reportingPeriod] as [string, ReactNode]]),
    ["Variable / cálculo", source.methodology ?? "Según la publicación oficial."],
    [
      "Margen de error",
      survey
        ? "Sí. El Censo publica un margen de error (90%) para cada estimado; el sitio lo muestra cuando existe para esa cifra."
        : federal
          ? "No aplica: son montos reportados, no estimados de encuesta."
          : monthly
            ? "BLS no publica margen de error para las cifras de municipio. Son estimados de un modelo, no un conteo."
            : "La fuente no publica margen de error para esta cifra.",
    ],
    [
      "Copia oficial",
      source.retrievedAt
        ? `${monthly ? "Obtenida de la API de BLS" : federal ? "Obtenida de la API de USAspending" : "Descargada"} el ${shortDate(source.retrievedAt)}`
        : `Según la publicación de ${shortPeriod(source.reportingPeriod)}`,
    ],
  ];
  return (
    <section
      aria-label="¿De dónde sale este dato?"
      className="grid gap-x-14 gap-y-6 md:grid-cols-2"
    >
      <div>
        <Heading className="font-display text-[26px] leading-tight font-medium md:text-3xl">
          ¿De dónde sale este dato?
        </Heading>
        <p className="mt-3 text-[17px] leading-relaxed">
          <strong>{metric.label}:</strong> {metric.hint.replace(/\.?$/, ".")} Sale{" "}
          {agency.from.startsWith("el ") ? `del ${agency.from.slice(3)}` : `de ${agency.from}`}
          {agency.from.endsWith(".") ? "" : "."}
        </p>
        {survey && (
          <p className="mt-2 text-[17px] leading-relaxed">
            Es un estimado de encuesta que combina cinco años ({shortPeriod(source.reportingPeriod)}
            ). Por eso cada cifra trae un margen de error.
          </p>
        )}
        {monthly && (
          <p className="mt-2 text-[17px] leading-relaxed">
            BLS publica estas cifras cada mes con unas semanas de atraso. El mes más reciente es
            preliminar y cambia al mes siguiente. No llevan ajuste estacional: para ver la
            tendencia, compara con el mismo mes del año anterior.
          </p>
        )}
        {federal && (
          <p className="mt-2 text-[17px] leading-relaxed">
            USAspending es la publicación oficial del Departamento del Tesoro sobre adjudicaciones
            federales. Obligado no significa necesariamente desembolsado ni gastado. El lugar es
            donde se registra que se hace el trabajo, y a veces es la oficina central: por eso el
            sitio separa lo atribuible a un municipio de lo que no lo es con certeza.
          </p>
        )}
        {source.sourceURL && (
          <a
            href={source.sourceURL}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex min-h-12 items-center rounded-[3px] border border-fg px-4 text-base font-semibold text-fg no-underline hover:bg-track"
          >
            Ver la fuente oficial ↗
          </a>
        )}
      </div>
      <div>
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
            Detalles técnicos
          </summary>
          <dl className="mt-1 flex flex-col gap-2 pb-2">
            <div>
              <dt className="font-semibold text-fg">Cita</dt>
              <dd>{source.attribution}</dd>
            </div>
            <div>
              <dt className="font-semibold text-fg">Datos que faltan</dt>
              <dd>{source.missingValuePolicy}</dd>
            </div>
            {source.retrievedAt && (
              <div>
                <dt className="font-semibold text-fg">Copia guardada</dt>
                <dd>
                  Descargada el {shortDate(source.retrievedAt)} (UTC). El proyecto la guarda y
                  vuelve a generar las cifras sin internet.
                </dd>
              </div>
            )}
          </dl>
        </details>
      </div>
    </section>
  );
}
