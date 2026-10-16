/**
 * "¿De dónde sale este dato?" / "Where does this figure come from?": the
 * plain explanation and the structured record under it. Official agency and
 * dataset names stay as each source publishes them; Spanish adds a Spanish
 * description next to the official name, English needs none.
 */
import { defineMessages } from "../define.ts";

/**
 * Spanish description of each official agency, shown next to the official
 * name; the article makes "Sale de la…" read naturally. English uses the
 * official name itself.
 */
export const AGENCY_ES: [RegExp, string, string][] = [
  [/^U\.S\. Census Bureau/, "Oficina del Censo de EE. UU.", "la"],
  [
    /^National Highway Traffic Safety Administration/,
    "Administración Nacional de Seguridad del Tráfico en las Carreteras (NHTSA)",
    "la",
  ],
  [
    /^Centers for Disease Control and Prevention/,
    "Centros para el Control y la Prevención de Enfermedades (CDC)",
    "los",
  ],
  [
    /^U\.S\. Bureau of Labor Statistics/,
    "Oficina de Estadísticas Laborales de EE. UU. (BLS)",
    "la",
  ],
  [/^U\.S\. Department of the Treasury/, "Departamento del Tesoro de EE. UU. (USAspending)", "el"],
  [
    /^Federal Emergency Management Agency/,
    "Agencia Federal para el Manejo de Emergencias (FEMA)",
    "la",
  ],
  [/^National Weather Service/, "Servicio Nacional de Meteorología (NWS)", "el"],
  [/^U\.S\. Geological Survey/, "Servicio Geológico de EE. UU. (USGS)", "el"],
];

export const SOURCE_MESSAGES = defineMessages({
  es: {
    heading: "¿De dónde sale este dato?",
    unknown: "Por confirmar ",
    comesFrom: (from: string) =>
      ` Sale ${from.startsWith("el ") ? `del ${from.slice(3)}` : `de ${from}`}${from.endsWith(".") ? "" : "."}`,
    survey: (period: string) =>
      `Es un estimado de encuesta que combina cinco años (${period}). Por eso cada cifra trae un margen de error.`,
    monthly:
      "BLS publica estas cifras cada mes con unas semanas de atraso. El mes más reciente es preliminar y cambia al mes siguiente. No llevan ajuste estacional: para ver la tendencia, compara con el mismo mes del año anterior.",
    federal:
      "USAspending es la publicación oficial del Departamento del Tesoro sobre adjudicaciones federales. Obligado no significa necesariamente desembolsado ni gastado. El lugar es donde se registra que se hace el trabajo, y a veces es la oficina central: por eso el sitio separa lo atribuible a un municipio de lo que no lo es con certeza.",
    recovery:
      "Sale de OpenFEMA, los datos abiertos de FEMA. Obligado no significa necesariamente gastado: OpenFEMA no publica lo gastado. Lo aprobado a hogares tampoco es lo pagado. FEMA y USAspending son publicaciones distintas que pueden contar el mismo dinero; el sitio no las suma.",
    officialLink: "Ver la fuente oficial ↗",
    rows: {
      source: "Fuente",
      dataset: "Dataset",
      period: "Periodo",
      method: "Variable / cálculo",
      methodFallback: "Según la publicación oficial.",
      moe: "Margen de error",
      copy: "Copia oficial",
    },
    moe: {
      survey:
        "Sí. El Censo publica un margen de error (90%) para cada estimado; el sitio lo muestra cuando existe para esa cifra.",
      reported: "No aplica: son montos reportados, no estimados de encuesta.",
      monthly:
        "BLS no publica margen de error para las cifras de municipio. Son estimados de un modelo, no un conteo.",
      none: "La fuente no publica margen de error para esta cifra.",
    },
    copy: {
      bls: "Obtenida de la API de BLS",
      usaspending: "Obtenida de la API de USAspending",
      openfema: "Obtenida de la API OpenFEMA",
      downloaded: "Descargada",
      on: (how: string, day: string) => `${how} el ${day}`,
      perPublication: (period: string) => `Según la publicación de ${period}`,
    },
    technical: {
      open: "Detalles técnicos",
      citation: "Cita",
      missing: "Datos que faltan",
      saved: "Copia guardada",
      savedText: (day: string) =>
        `Descargada el ${day} (UTC). El proyecto la guarda y vuelve a generar las cifras sin internet.`,
    },
    laus: {
      month: "Mes",
      preliminary: "Preliminar",
      final: "Final",
      preliminaryNote: "BLS revisa la cifra preliminar al publicar el mes siguiente.",
      finalNote: "Cifra revisada por BLS.",
      annualNote: " Cada año, a principios de año, BLS revisa además los meses de años recientes.",
      series: "Serie",
      wholePuertoRico: "Puerto Rico completo",
      seriesNote: (place: string) => `${place}: tasa de desempleo, sin ajuste estacional.`,
      notice: "Aviso de BLS",
    },
  },
  en: {
    heading: "Where does this figure come from?",
    unknown: "To be confirmed ",
    comesFrom: (from: string) => ` It comes from ${from}${from.endsWith(".") ? "" : "."}`,
    survey: (period: string) =>
      `It is a survey estimate that pools five years (${period}), which is why every figure comes with a margin of error.`,
    monthly:
      "BLS publishes these figures every month, a few weeks behind. The latest month is preliminary and changes the following month. They are not seasonally adjusted: to see the trend, compare with the same month a year earlier.",
    federal:
      "USAspending is the Treasury Department's official publication on federal awards. Obligated does not necessarily mean disbursed or spent. The place is where the work is recorded as being done, and sometimes that is a central office, which is why the site keeps what can be attributed to a municipio apart from what cannot be with certainty.",
    recovery:
      "It comes from OpenFEMA, FEMA's open data. Obligated does not necessarily mean spent: OpenFEMA does not publish what was spent. What was approved for households is not what was paid, either. FEMA and USAspending are separate publications that can count the same money; the site does not add them together.",
    officialLink: "See the official source ↗",
    rows: {
      source: "Source",
      dataset: "Dataset",
      period: "Period",
      method: "Variable / calculation",
      methodFallback: "As in the official publication.",
      moe: "Margin of error",
      copy: "Official copy",
    },
    moe: {
      survey:
        "Yes. The Census publishes a margin of error (90%) for each estimate; the site shows it when one exists for that figure.",
      reported: "Does not apply: these are reported amounts, not survey estimates.",
      monthly:
        "BLS publishes no margin of error for municipio figures. They are model estimates, not a count.",
      none: "The source publishes no margin of error for this figure.",
    },
    copy: {
      bls: "Retrieved from the BLS API",
      usaspending: "Retrieved from the USAspending API",
      openfema: "Retrieved from the OpenFEMA API",
      downloaded: "Downloaded",
      on: (how: string, day: string) => `${how} on ${day}`,
      perPublication: (period: string) => `As published for ${period}`,
    },
    technical: {
      open: "Technical details",
      citation: "Citation",
      missing: "Missing data",
      saved: "Saved copy",
      savedText: (day: string) =>
        `Downloaded on ${day} (UTC). The project keeps it and can regenerate the figures without internet access.`,
    },
    laus: {
      month: "Month",
      preliminary: "Preliminary",
      final: "Final",
      preliminaryNote: "BLS revises the preliminary figure when it publishes the next month.",
      finalNote: "Figure revised by BLS.",
      annualNote: " Early each year, BLS also revises the months of recent years.",
      series: "Series",
      wholePuertoRico: "All of Puerto Rico",
      seriesNote: (place: string) => `${place}: unemployment rate, not seasonally adjusted.`,
      notice: "BLS notice",
    },
  },
});
