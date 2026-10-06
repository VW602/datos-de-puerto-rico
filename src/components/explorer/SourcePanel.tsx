import type { PrMetric } from "@/data/pr/metrics";
import { shortPeriod } from "@/data/pr/present";
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
export function SourcePanel({
  metric,
  headingLevel = 2,
}: {
  metric: PrMetric;
  headingLevel?: 2 | 3;
}) {
  const source = publicSourceForMetric(metric.id);
  if (!source) return null;
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const survey = source.marginOfErrorAvailable;
  const rows: [string, string][] = [
    ["Fuente", source.sourceAgency],
    ["Dataset", source.sourceTitle],
    ["Periodo", source.reportingPeriod],
    ["Variable / cálculo", source.methodology ?? "Según la publicación oficial."],
    [
      "Margen de error",
      survey
        ? "Sí. El Censo publica un margen de error (90%) para cada estimado; el sitio lo muestra cuando existe para esa cifra."
        : "La fuente no publica margen de error para esta cifra.",
    ],
    [
      "Copia oficial",
      source.retrievedAt
        ? `Descargada el ${shortDate(source.retrievedAt)}`
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
          <strong>{metric.label}:</strong> {metric.hint.replace(/\.?$/, ".")} Sale de{" "}
          {source.sourceAgency.split(",")[0]}.
        </p>
        {survey && (
          <p className="mt-2 text-[17px] leading-relaxed">
            Es un estimado de encuesta que combina cinco años ({shortPeriod(source.reportingPeriod)}
            ). Por eso cada cifra trae un margen de error.
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
