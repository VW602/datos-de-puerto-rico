import type { ScaleKind } from "@/data/scale";
import { FUNDS_FY } from "./funds";
import { money } from "./money";
import { LAUS_LATEST, LAUS_LATEST_LABEL, LAUS_LATEST_PRELIMINARY, monthShort } from "./laus";

export type PrMetricId =
  | "population"
  | "income"
  | "percapita"
  | "women"
  | "under18"
  | "over65"
  | "plumbing"
  | "traffic"
  | "poverty"
  | "uninsured"
  | "unemploymentMonthly"
  | "unemployment"
  | "highschool"
  | "bachelors"
  | "nointernet"
  | "disability"
  | "rent"
  | "homevalue"
  | "obesity"
  | "medianage"
  | "snap"
  | "vacant"
  | "novehicle"
  | "nocomputer"
  | "crowding"
  | "inactivity"
  | "fedObligations"
  | "fedOutlays"
  | "fedAwards"
  | "femaPaObligated"
  | "femaPaProjects"
  | "femaIhpApproved"
  | "femaHmaObligated";

export type PrMetric = {
  id: PrMetricId;
  label: string;
  hint: string;
  source: string;
  scale: ScaleKind;
  format: (value: number) => string;
  formatTick: (value: number) => string;
  versus: (value: number, median: number) => string;
  /** Zero and negative values are their own map classes, not the bottom of the ramp. */
  signed?: boolean;
};

const people = new Intl.NumberFormat("en-US");
const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function compact(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(2)} mill.`;
  if (abs >= 10_000) return `${Math.round(value / 1000)}k`;
  return people.format(Math.round(value));
}

function points(value: number, median: number, unit: string): string {
  const delta = value - median;
  const abs = Math.abs(delta).toFixed(1);
  if (Math.abs(delta) < 0.05) return "En la mediana";
  return delta > 0 ? `${abs} ${unit} sobre la mediana` : `${abs} ${unit} bajo la mediana`;
}

function ratio(value: number, median: number): string {
  if (median <= 0) return "—";
  const times = value / median;
  return `${times.toFixed(times >= 10 ? 0 : 1)}× la mediana`;
}

const percent = (value: number) => `${value.toFixed(1)}%`;
const percentTick = (value: number) => `${Math.round(value)}%`;
const percentVersus = (value: number, median: number) => points(value, median, "puntos");


function percentMetric(id: PrMetricId, label: string, hint: string, source: string): PrMetric {
  return {
    id,
    label,
    hint,
    source,
    scale: "linear",
    format: percent,
    formatTick: percentTick,
    versus: percentVersus,
  };
}



export const PR_METRICS: PrMetric[] = [
  {
    id: "population",
    label: "Población",
    hint: "Personas que viven en el municipio",
    source: "Censo, ACS 2019–2023",
    scale: "log",
    format: (value) => people.format(Math.round(value)),
    formatTick: compact,
    versus: ratio,
  },
  {
    id: "income",
    label: "Ingreso mediano del hogar",
    hint: "La mitad de los hogares recibe más que esto y la otra mitad, menos",
    source: "Censo, ACS 2019–2023",
    scale: "log",
    format: (value) => usd.format(value),
    formatTick: (value) => compact(value).replace(/^(\d)/, "$$$1"),
    versus: ratio,
  },
  {
    id: "percapita",
    label: "Ingreso por persona",
    hint: "Todo el ingreso del municipio dividido entre todos sus residentes, incluidos los niños",
    source: "Censo, ACS 2019–2023",
    scale: "log",
    format: (value) => usd.format(value),
    formatTick: (value) => `$${compact(value)}`,
    versus: ratio,
  },
  {
    id: "women",
    label: "Mujeres",
    hint: "Porcentaje de la población",
    source: "Censo, ACS 2019–2023",
    scale: "linear",
    format: percent,
    formatTick: percentTick,
    versus: percentVersus,
  },
  {
    id: "under18",
    label: "Menores de 18",
    hint: "Porcentaje de la población",
    source: "Censo, ACS 2019–2023",
    scale: "linear",
    format: percent,
    formatTick: percentTick,
    versus: percentVersus,
  },
  {
    id: "over65",
    label: "65 años o más",
    hint: "Porcentaje de la población",
    source: "Censo, ACS 2019–2023",
    scale: "linear",
    format: percent,
    formatTick: percentTick,
    versus: percentVersus,
  },
  {
    id: "plumbing",
    label: "Sin plomería completa",
    hint: "Viviendas, ocupadas o vacías, a las que les falta al menos una de las instalaciones que el Censo cuenta como plomería completa",
    source: "Censo, ACS 2019–2023",
    scale: "linear",
    format: percent,
    formatTick: percentTick,
    versus: percentVersus,
  },
  {
    id: "traffic",
    label: "Muertes de tránsito",
    hint: "Muertes en choques por cada 100,000 habitantes, promedio de un año",
    source: "NHTSA FARS, 2022–2023",
    scale: "linear",
    format: (value) => `${value.toFixed(1)} por 100,000`,
    formatTick: (value) => value.toFixed(0),
    versus: (value, median) => points(value, median, "por 100,000"),
  },
  percentMetric("poverty", "Pobreza", "Por ciento de personas con ingreso bajo el nivel de pobreza federal", "Censo, ACS 2020–2024"),
  percentMetric("uninsured", "Sin plan médico", "Por ciento de la población civil sin plan médico de ningún tipo", "Censo, ACS 2020–2024"),
  // BLS LAUS: the most recent monthly figure. The month comes from the generated data, never typed in.
  percentMetric(
    "unemploymentMonthly",
    "Desempleo mensual",
    `Tasa de desempleo de ${LAUS_LATEST_LABEL}${LAUS_LATEST_PRELIMINARY ? " (preliminar)" : ""}: por ciento de la fuerza laboral que no tiene empleo y lo está buscando`,
    `BLS, LAUS, ${monthShort(LAUS_LATEST)}${LAUS_LATEST_PRELIMINARY ? " (preliminar)" : ""}`,
  ),
  percentMetric("unemployment", "Desempleo (5 años)", "Por ciento de la fuerza laboral civil que no tiene empleo y lo está buscando. Promedio de la encuesta de 5 años del Censo", "Censo, ACS 2020–2024"),
  percentMetric("highschool", "Escuela superior", "Adultos de 25 años o más con cuarto año (o equivalente) o más", "Censo, ACS 2020–2024"),
  percentMetric("bachelors", "Bachillerato", "Adultos de 25 años o más con bachillerato o un grado más alto", "Censo, ACS 2020–2024"),
  percentMetric("nointernet", "Sin internet", "Hogares sin acceso a internet", "Censo, ACS 2020–2024"),
  percentMetric("disability", "Discapacidad", "Población civil con una discapacidad", "Censo, ACS 2020–2024"),
  {
    id: "rent",
    label: "Renta mediana",
    hint: "Alquiler mensual, más luz y agua si las paga el inquilino. La mitad paga más y la otra mitad, menos",
    source: "Censo, ACS 2020–2024",
    scale: "log",
    format: (value) => usd.format(value),
    formatTick: (value) => `$${compact(value)}`,
    versus: ratio,
  },
  {
    id: "homevalue",
    label: "Valor de la vivienda",
    hint: "Valor mediano que los dueños le dan a su casa",
    source: "Censo, ACS 2020–2024",
    scale: "log",
    format: (value) => usd.format(value),
    formatTick: (value) => `$${compact(value)}`,
    versus: ratio,
  },
  {
    id: "obesity",
    label: "Obesidad",
    hint: "Adultos de toda la isla. No varía por pueblo.",
    source: "CDC, BRFSS 2023",
    scale: "linear",
    format: percent,
    formatTick: percentTick,
    versus: () => "Cifra única de Puerto Rico",
  },
  {
    id: "medianage",
    label: "Edad mediana",
    hint: "Edad que parte la población en dos",
    source: "Censo, ACS 2020–2024",
    scale: "linear",
    format: (value) => `${value.toFixed(1)} años`,
    formatTick: (value) => value.toFixed(0),
    versus: (value, median) => points(value, median, "años"),
  },
  percentMetric(
    "snap",
    "Cupones (PAN)",
    "Hogares que recibieron asistencia nutricional en los últimos 12 meses. El Censo la llama SNAP; en Puerto Rico es el PAN", "Censo, ACS 2020–2024"),
  percentMetric("vacant", "Viviendas vacías", "Por ciento de las viviendas que están desocupadas", "Censo, ACS 2020–2024"),
  percentMetric("novehicle", "Sin carro", "Hogares sin vehículo", "Censo, ACS 2020–2024"),
  percentMetric("nocomputer", "Sin computadora", "Hogares sin computadora ni teléfono inteligente", "Censo, ACS 2020–2024"),
  percentMetric("crowding", "Hacinamiento", "Hogares con más de una persona por cuarto", "Censo, ACS 2020–2024"),
  {
    id: "inactivity",
    label: "Sin actividad",
    hint: "Adultos de toda la isla que no hacen actividad física en su tiempo libre.",
    source: "CDC, BRFSS 2023",
    scale: "linear",
    format: percent,
    formatTick: percentTick,
    versus: () => "Cifra única de Puerto Rico",
  },
];

// USAspending. Only money attributable to a municipio (contracts performed
// there, assistance to people who live there) is on the map; the rest stays in
// its own geographic state and is shown apart (see funds.ts).
const moneyTick = (value: number) => money(value).replace(" mil millones", " mil mill.").replace(" millones", " mill.");
/** A net negative amount or $0 is described as such, never as a ratio of the median. */
const signedVersus = (value: number, median: number) =>
  value < 0 ? "Obligación neta negativa (desobligaciones)" : value === 0 ? "$0" : ratio(value, median);
PR_METRICS.push(
  {
    id: "fedObligations",
    label: "Obligaciones federales",
    hint: `Dinero que el gobierno federal se comprometió a pagar en el año fiscal ${FUNDS_FY}, atribuible al municipio: contratos que se ejecutan allí y asistencia a personas que viven allí. Obligado no quiere decir pagado ni gastado`,
    source: `USAspending, AF ${FUNDS_FY}`,
    scale: "log",
    format: money,
    formatTick: moneyTick,
    versus: signedVersus,
    signed: true,
  },
  {
    id: "fedOutlays",
    label: "Desembolsos acumulados reportados",
    hint: `Pagos que las agencias federales reportan desde el inicio de cada adjudicación atribuible al municipio con actividad en el año fiscal ${FUNDS_FY}. Son acumulados: no son solo los pagos de ese año. Si una adjudicación no tiene pagos reportados, no suma: no quiere decir $0`,
    source: `USAspending, adjudicaciones activas en AF ${FUNDS_FY}`,
    scale: "log",
    format: money,
    formatTick: moneyTick,
    versus: (value, median) => (value < 0 ? "Desembolsos netos negativos (ajustes)" : value === 0 ? "$0" : ratio(value, median)),
    signed: true,
  },
  {
    id: "fedAwards",
    label: "Adjudicaciones federales",
    hint: `Contratos y asistencias a personas con actividad en el año fiscal ${FUNDS_FY} y lugar de ejecución en el municipio`,
    source: `USAspending, AF ${FUNDS_FY}`,
    scale: "log",
    format: (value) => people.format(Math.round(value)),
    formatTick: compact,
    versus: (value, median) => (value === 0 ? "Ninguna" : ratio(value, median)),
    signed: true,
  },
);

// OpenFEMA. Each measure is one FEMA field for one program; none is added to
// another, nor to USAspending. Only what FEMA places in one municipio is on
// the map; "Statewide" stays apart (see fema.ts).
PR_METRICS.push(
  {
    id: "femaPaObligated",
    label: "Asistencia Pública por municipio del solicitante",
    hint: "Parte federal obligada (federalShareObligated) de los proyectos de Asistencia Pública de FEMA cuyos solicitantes FEMA ubica en el municipio. Es el lugar de quien solicita, no necesariamente el de la obra. Obligado no quiere decir gastado. Lo que FEMA registra para todo Puerto Rico no se le asigna a ningún municipio",
    source: "FEMA, OpenFEMA",
    scale: "log",
    format: money,
    formatTick: (value) => money(value).replace(" mil millones", " mil mill.").replace(" millones", " mill."),
    versus: (value, median) => (value < 0 ? "Obligación neta negativa (ajustes)" : value === 0 ? "$0" : ratio(value, median)),
    signed: true,
  },
  {
    id: "femaPaProjects",
    label: "Proyectos de Asistencia Pública por municipio del solicitante",
    hint: "Número de proyectos de Asistencia Pública de FEMA (hojas de trabajo de proyecto) cuyos solicitantes FEMA ubica en el municipio. No es necesariamente el lugar de la obra",
    source: "FEMA, OpenFEMA",
    scale: "log",
    format: (value) => people.format(Math.round(value)),
    formatTick: compact,
    versus: (value, median) => (value === 0 ? "Ninguno" : ratio(value, median)),
    signed: true,
  },
  {
    id: "femaIhpApproved",
    label: "Asistencia aprobada a hogares (IHP)",
    hint: "Monto que FEMA aprobó a hogares (dueños e inquilinos) bajo su programa de Individuos y Hogares (IHP), en el municipio de los hogares registrados, sumando los totales que FEMA publica por zona. Aprobado no quiere decir pagado",
    source: "FEMA, OpenFEMA",
    scale: "log",
    format: money,
    formatTick: (value) => money(value).replace(" mil millones", " mil mill.").replace(" millones", " mill."),
    versus: (value, median) => (value === 0 ? "$0" : ratio(value, median)),
    signed: true,
  },
  {
    id: "femaHmaObligated",
    label: "Mitigación: obligado federal",
    hint: "Parte federal obligada (federalShareObligated) de los proyectos de Asistencia para la Mitigación de Riesgos (HMA) de FEMA en el municipio. Si FEMA no reporta el monto de un proyecto, no suma: no quiere decir $0",
    source: "FEMA, OpenFEMA",
    scale: "log",
    format: money,
    formatTick: (value) => money(value).replace(" mil millones", " mil mill.").replace(" millones", " mill."),
    versus: (value, median) => (value < 0 ? "Obligación neta negativa (ajustes)" : value === 0 ? "$0" : ratio(value, median)),
    signed: true,
  },
);

export function prMetricById(id: PrMetricId): PrMetric {
  const metric = PR_METRICS.find((item) => item.id === id);
  if (!metric) throw new Error(`Unknown metric: ${id}`);
  return metric;
}

export type MetricGroup = "Gente" | "Hogar" | "Trabajo" | "Salud" | "Fondos federales" | "Recuperación y desastres" | "Isla";

export const METRIC_GROUPS: MetricGroup[] = [
  "Gente",
  "Hogar",
  "Trabajo",
  "Salud",
  "Fondos federales",
  "Recuperación y desastres",
  "Isla",
];

const GROUP: Record<PrMetricId, MetricGroup> = {
  population: "Gente",
  women: "Gente",
  under18: "Gente",
  over65: "Gente",
  disability: "Gente",
  income: "Hogar",
  percapita: "Hogar",
  poverty: "Hogar",
  rent: "Hogar",
  homevalue: "Hogar",
  plumbing: "Hogar",
  nointernet: "Hogar",
  unemploymentMonthly: "Trabajo",
  unemployment: "Trabajo",
  highschool: "Trabajo",
  bachelors: "Trabajo",
  uninsured: "Salud",
  traffic: "Salud",
  obesity: "Isla",
  inactivity: "Isla",
  medianage: "Gente",
  snap: "Hogar",
  vacant: "Hogar",
  novehicle: "Hogar",
  nocomputer: "Hogar",
  crowding: "Hogar",
  fedObligations: "Fondos federales",
  fedOutlays: "Fondos federales",
  fedAwards: "Fondos federales",
  femaPaObligated: "Recuperación y desastres",
  femaPaProjects: "Recuperación y desastres",
  femaIhpApproved: "Recuperación y desastres",
  femaHmaObligated: "Recuperación y desastres",
};

export function metricGroup(id: PrMetricId): MetricGroup {
  return GROUP[id];
}

export function metricGrain(id: PrMetricId): "municipio" | "isla" {
  if (id === "obesity" || id === "inactivity") return "isla";
  return "municipio";
}
