/**
 * Measure names, the one-line explanation under each, the short source line,
 * and the words the measure formatters use. Spanish is the original wording;
 * English keeps the same meaning, especially for money: obligated, outlays,
 * approved and awarded are different things and stay different.
 */
import { FUNDS_FY } from "../../data/pr/funds.ts";
import { LAUS_LATEST, LAUS_LATEST_PRELIMINARY } from "../../data/pr/laus.ts";
import { defineMessages } from "../define.ts";
import { monthLabel, monthShort } from "../format.ts";

const prelim = LAUS_LATEST_PRELIMINARY;
const ACS_2023 = "2019–2023";
const ACS_2024 = "2020–2024";

export const METRIC_MESSAGES = defineMessages({
  es: {
    groups: {
      Gente: "Gente",
      Hogar: "Hogar",
      Trabajo: "Trabajo",
      Salud: "Salud",
      "Fondos federales": "Fondos federales",
      "Recuperación y desastres": "Recuperación y desastres",
      Isla: "Toda la isla",
    },
    words: {
      atMedian: "En la mediana",
      above: (abs: string, unit: string) => `${abs} ${unit} sobre la mediana`,
      below: (abs: string, unit: string) => `${abs} ${unit} bajo la mediana`,
      times: (times: string) => `${times}× la mediana`,
      points: "puntos",
      per100k: "por 100,000",
      years: "años",
      islandFigure: "Cifra única de Puerto Rico",
      netNegativeDeobligations: "Obligación neta negativa (desobligaciones)",
      netNegativeOutlays: "Desembolsos netos negativos (ajustes)",
      netNegativeAdjustments: "Obligación neta negativa (ajustes)",
      noneFeminine: "Ninguna",
      noneMasculine: "Ninguno",
      millionsShort: "mill.",
    },
    metrics: {
      population: {
        label: "Población",
        hint: "Personas que viven en el municipio",
        source: `Censo, ACS ${ACS_2023}`,
      },
      income: {
        label: "Ingreso mediano del hogar",
        hint: "La mitad de los hogares recibe más que esto y la otra mitad, menos",
        source: `Censo, ACS ${ACS_2023}`,
      },
      percapita: {
        label: "Ingreso por persona",
        hint: "Todo el ingreso del municipio dividido entre todos sus residentes, incluidos los niños",
        source: `Censo, ACS ${ACS_2023}`,
      },
      women: {
        label: "Mujeres",
        hint: "Porcentaje de la población",
        source: `Censo, ACS ${ACS_2023}`,
      },
      under18: {
        label: "Menores de 18",
        hint: "Porcentaje de la población",
        source: `Censo, ACS ${ACS_2023}`,
      },
      over65: {
        label: "65 años o más",
        hint: "Porcentaje de la población",
        source: `Censo, ACS ${ACS_2023}`,
      },
      plumbing: {
        label: "Sin plomería completa",
        hint: "Viviendas, ocupadas o vacías, a las que les falta al menos una de las instalaciones que el Censo cuenta como plomería completa",
        source: `Censo, ACS ${ACS_2023}`,
      },
      traffic: {
        label: "Muertes de tránsito",
        hint: "Muertes en choques por cada 100,000 habitantes, promedio de un año",
        source: "NHTSA FARS, 2022–2023",
      },
      poverty: {
        label: "Pobreza",
        hint: "Por ciento de personas con ingreso bajo el nivel de pobreza federal",
        source: `Censo, ACS ${ACS_2024}`,
      },
      uninsured: {
        label: "Sin plan médico",
        hint: "Por ciento de la población civil sin plan médico de ningún tipo",
        source: `Censo, ACS ${ACS_2024}`,
      },
      unemploymentMonthly: {
        label: "Desempleo mensual",
        hint: `Tasa de desempleo de ${monthLabel(LAUS_LATEST)}${prelim ? " (preliminar)" : ""}: por ciento de la fuerza laboral que no tiene empleo y lo está buscando`,
        source: `BLS, LAUS, ${monthShort(LAUS_LATEST)}${prelim ? " (preliminar)" : ""}`,
      },
      unemployment: {
        label: "Desempleo (5 años)",
        hint: "Por ciento de la fuerza laboral civil que no tiene empleo y lo está buscando. Promedio de la encuesta de 5 años del Censo",
        source: `Censo, ACS ${ACS_2024}`,
      },
      highschool: {
        label: "Escuela superior",
        hint: "Adultos de 25 años o más con cuarto año (o equivalente) o más",
        source: `Censo, ACS ${ACS_2024}`,
      },
      bachelors: {
        label: "Bachillerato",
        hint: "Adultos de 25 años o más con bachillerato o un grado más alto",
        source: `Censo, ACS ${ACS_2024}`,
      },
      nointernet: {
        label: "Sin internet",
        hint: "Hogares sin acceso a internet",
        source: `Censo, ACS ${ACS_2024}`,
      },
      disability: {
        label: "Discapacidad",
        hint: "Población civil con una discapacidad",
        source: `Censo, ACS ${ACS_2024}`,
      },
      rent: {
        label: "Renta mediana",
        hint: "Alquiler mensual, más luz y agua si las paga el inquilino. La mitad paga más y la otra mitad, menos",
        source: `Censo, ACS ${ACS_2024}`,
      },
      homevalue: {
        label: "Valor de la vivienda",
        hint: "Valor mediano que los dueños le dan a su casa",
        source: `Censo, ACS ${ACS_2024}`,
      },
      obesity: {
        label: "Obesidad",
        hint: "Adultos de toda la isla. No varía por pueblo.",
        source: "CDC, BRFSS 2023",
      },
      medianage: {
        label: "Edad mediana",
        hint: "Edad que parte la población en dos",
        source: `Censo, ACS ${ACS_2024}`,
      },
      snap: {
        label: "Cupones (PAN)",
        hint: "Hogares que recibieron asistencia nutricional en los últimos 12 meses. El Censo la llama SNAP; en Puerto Rico es el PAN",
        source: `Censo, ACS ${ACS_2024}`,
      },
      vacant: {
        label: "Viviendas vacías",
        hint: "Por ciento de las viviendas que están desocupadas",
        source: `Censo, ACS ${ACS_2024}`,
      },
      novehicle: {
        label: "Sin carro",
        hint: "Hogares sin vehículo",
        source: `Censo, ACS ${ACS_2024}`,
      },
      nocomputer: {
        label: "Sin computadora",
        hint: "Hogares sin computadora ni teléfono inteligente",
        source: `Censo, ACS ${ACS_2024}`,
      },
      crowding: {
        label: "Hacinamiento",
        hint: "Hogares con más de una persona por cuarto",
        source: `Censo, ACS ${ACS_2024}`,
      },
      inactivity: {
        label: "Sin actividad",
        hint: "Adultos de toda la isla que no hacen actividad física en su tiempo libre.",
        source: "CDC, BRFSS 2023",
      },
      fedObligations: {
        label: "Obligaciones federales",
        hint: `Dinero que el gobierno federal se comprometió a pagar en el año fiscal ${FUNDS_FY}, atribuible al municipio: contratos que se ejecutan allí y asistencia a personas que viven allí. Obligado no quiere decir pagado ni gastado`,
        source: `USAspending, AF ${FUNDS_FY}`,
      },
      fedOutlays: {
        label: "Desembolsos acumulados reportados",
        hint: `Pagos que las agencias federales reportan desde el inicio de cada adjudicación atribuible al municipio con actividad en el año fiscal ${FUNDS_FY}. Son acumulados: no son solo los pagos de ese año. Si una adjudicación no tiene pagos reportados, no suma: no quiere decir $0`,
        source: `USAspending, adjudicaciones activas en AF ${FUNDS_FY}`,
      },
      fedAwards: {
        label: "Adjudicaciones federales",
        hint: `Contratos y asistencias a personas con actividad en el año fiscal ${FUNDS_FY} y lugar de ejecución en el municipio`,
        source: `USAspending, AF ${FUNDS_FY}`,
      },
      femaPaObligated: {
        label: "Asistencia Pública por municipio del solicitante",
        hint: "Parte federal obligada (federalShareObligated) de los proyectos de Asistencia Pública de FEMA cuyos solicitantes FEMA ubica en el municipio. Es el lugar de quien solicita, no necesariamente el de la obra. Obligado no quiere decir gastado. Lo que FEMA registra para todo Puerto Rico no se le asigna a ningún municipio",
        source: "FEMA, OpenFEMA",
      },
      femaPaProjects: {
        label: "Proyectos de Asistencia Pública por municipio del solicitante",
        hint: "Número de proyectos de Asistencia Pública de FEMA (hojas de trabajo de proyecto) cuyos solicitantes FEMA ubica en el municipio. No es necesariamente el lugar de la obra",
        source: "FEMA, OpenFEMA",
      },
      femaIhpApproved: {
        label: "Asistencia aprobada a hogares (IHP)",
        hint: "Monto que FEMA aprobó a hogares (dueños e inquilinos) bajo su programa de Individuos y Hogares (IHP), en el municipio de los hogares registrados, sumando los totales que FEMA publica por zona. Aprobado no quiere decir pagado",
        source: "FEMA, OpenFEMA",
      },
      femaHmaObligated: {
        label: "Mitigación: obligado federal",
        hint: "Parte federal obligada (federalShareObligated) de los proyectos de Asistencia para la Mitigación de Riesgos (HMA) de FEMA en el municipio. Si FEMA no reporta el monto de un proyecto, no suma: no quiere decir $0",
        source: "FEMA, OpenFEMA",
      },
    },
  },
  en: {
    groups: {
      Gente: "People",
      Hogar: "Households",
      Trabajo: "Work",
      Salud: "Health",
      "Fondos federales": "Federal funds",
      "Recuperación y desastres": "Disaster recovery",
      Isla: "Island-wide",
    },
    words: {
      atMedian: "At the median",
      above: (abs: string, unit: string) => `${abs} ${unit} above the median`,
      below: (abs: string, unit: string) => `${abs} ${unit} below the median`,
      times: (times: string) => `${times}× the median`,
      points: "points",
      per100k: "per 100,000",
      years: "years",
      islandFigure: "One figure for all of Puerto Rico",
      netNegativeDeobligations: "Net negative obligation (deobligations)",
      netNegativeOutlays: "Net negative outlays (adjustments)",
      netNegativeAdjustments: "Net negative obligation (adjustments)",
      noneFeminine: "None",
      noneMasculine: "None",
      millionsShort: "M",
    },
    metrics: {
      population: {
        label: "Population",
        hint: "People who live in the municipio",
        source: `Census, ACS ${ACS_2023}`,
      },
      income: {
        label: "Median household income",
        hint: "Half of households take in more than this, and half take in less",
        source: `Census, ACS ${ACS_2023}`,
      },
      percapita: {
        label: "Income per person",
        hint: "All income in the municipio divided by everyone who lives there, children included",
        source: `Census, ACS ${ACS_2023}`,
      },
      women: {
        label: "Women",
        hint: "Share of the population",
        source: `Census, ACS ${ACS_2023}`,
      },
      under18: {
        label: "Under 18",
        hint: "Share of the population",
        source: `Census, ACS ${ACS_2023}`,
      },
      over65: {
        label: "65 and older",
        hint: "Share of the population",
        source: `Census, ACS ${ACS_2023}`,
      },
      plumbing: {
        label: "Without complete plumbing",
        hint: "Housing units, occupied or vacant, missing at least one of the facilities the Census counts as complete plumbing",
        source: `Census, ACS ${ACS_2023}`,
      },
      traffic: {
        label: "Traffic deaths",
        hint: "Crash deaths per 100,000 residents, one-year average",
        source: "NHTSA FARS, 2022–2023",
      },
      poverty: {
        label: "Poverty",
        hint: "Percent of people with income below the federal poverty level",
        source: `Census, ACS ${ACS_2024}`,
      },
      uninsured: {
        label: "No health insurance",
        hint: "Percent of the civilian population with no health insurance of any kind",
        source: `Census, ACS ${ACS_2024}`,
      },
      unemploymentMonthly: {
        label: "Monthly unemployment",
        hint: `Unemployment rate for ${monthLabel(LAUS_LATEST, "en")}${prelim ? " (preliminary)" : ""}: percent of the labor force without a job and looking for one`,
        source: `BLS, LAUS, ${monthShort(LAUS_LATEST, "en")}${prelim ? " (preliminary)" : ""}`,
      },
      unemployment: {
        label: "Unemployment (5-year)",
        hint: "Percent of the civilian labor force without a job and looking for one. Average from the Census 5-year survey",
        source: `Census, ACS ${ACS_2024}`,
      },
      highschool: {
        label: "High school",
        hint: "Adults 25 and older with a high school diploma (or equivalent) or more",
        source: `Census, ACS ${ACS_2024}`,
      },
      bachelors: {
        label: "Bachelor's degree",
        hint: "Adults 25 and older with a bachelor's degree or higher",
        source: `Census, ACS ${ACS_2024}`,
      },
      nointernet: {
        label: "No internet",
        hint: "Households without internet access",
        source: `Census, ACS ${ACS_2024}`,
      },
      disability: {
        label: "Disability",
        hint: "Civilian population with a disability",
        source: `Census, ACS ${ACS_2024}`,
      },
      rent: {
        label: "Median rent",
        hint: "Monthly rent, plus electricity and water if the renter pays them. Half pay more and half pay less",
        source: `Census, ACS ${ACS_2024}`,
      },
      homevalue: {
        label: "Home value",
        hint: "Median value owners put on their home",
        source: `Census, ACS ${ACS_2024}`,
      },
      obesity: {
        label: "Obesity",
        hint: "Adults across the island. It does not vary by municipio.",
        source: "CDC, BRFSS 2023",
      },
      medianage: {
        label: "Median age",
        hint: "The age that splits the population in half",
        source: `Census, ACS ${ACS_2024}`,
      },
      snap: {
        label: "Nutrition assistance (PAN)",
        hint: "Households that received nutrition assistance in the last 12 months. The Census calls it SNAP; in Puerto Rico it is PAN, the Nutrition Assistance Program",
        source: `Census, ACS ${ACS_2024}`,
      },
      vacant: {
        label: "Vacant housing",
        hint: "Percent of housing units that are unoccupied",
        source: `Census, ACS ${ACS_2024}`,
      },
      novehicle: {
        label: "No vehicle",
        hint: "Households without a vehicle",
        source: `Census, ACS ${ACS_2024}`,
      },
      nocomputer: {
        label: "No computer",
        hint: "Households with neither a computer nor a smartphone",
        source: `Census, ACS ${ACS_2024}`,
      },
      crowding: {
        label: "Crowding",
        hint: "Households with more than one person per room",
        source: `Census, ACS ${ACS_2024}`,
      },
      inactivity: {
        label: "Physical inactivity",
        hint: "Adults across the island who get no physical activity in their free time.",
        source: "CDC, BRFSS 2023",
      },
      fedObligations: {
        label: "Federal obligations",
        hint: `Money the federal government committed to pay in fiscal year ${FUNDS_FY} that can be attributed to the municipio: contracts performed there and assistance to people who live there. Obligated does not mean paid or spent`,
        source: `USAspending, FY ${FUNDS_FY}`,
      },
      fedOutlays: {
        label: "Reported cumulative outlays",
        hint: `Payments federal agencies report since the start of each award attributable to the municipio that had activity in fiscal year ${FUNDS_FY}. These are cumulative, not just that year's payments. An award with no reported payments adds nothing; that does not mean $0`,
        source: `USAspending, awards active in FY ${FUNDS_FY}`,
      },
      fedAwards: {
        label: "Federal awards",
        hint: `Contracts and assistance to individuals with activity in fiscal year ${FUNDS_FY} and a place of performance in the municipio`,
        source: `USAspending, FY ${FUNDS_FY}`,
      },
      femaPaObligated: {
        label: "Public Assistance by applicant's municipio",
        hint: "Obligated federal share (federalShareObligated) of FEMA Public Assistance projects whose applicants FEMA places in the municipio. That is where the applicant is, not necessarily where the work is. Obligated does not mean spent. What FEMA records for Puerto Rico as a whole is not assigned to any municipio",
        source: "FEMA, OpenFEMA",
      },
      femaPaProjects: {
        label: "Public Assistance projects by applicant's municipio",
        hint: "Number of FEMA Public Assistance projects (project worksheets) whose applicants FEMA places in the municipio. Not necessarily where the work is",
        source: "FEMA, OpenFEMA",
      },
      femaIhpApproved: {
        label: "Assistance approved for households (IHP)",
        hint: "Amount FEMA approved for households (owners and renters) under its Individuals and Households Program (IHP), in the municipio of the registered households, adding up the totals FEMA publishes by area. Approved does not mean paid",
        source: "FEMA, OpenFEMA",
      },
      femaHmaObligated: {
        label: "Mitigation: federal share obligated",
        hint: "Obligated federal share (federalShareObligated) of FEMA Hazard Mitigation Assistance (HMA) projects in the municipio. If FEMA reports no amount for a project, it adds nothing; that does not mean $0",
        source: "FEMA, OpenFEMA",
      },
    },
  },
});
