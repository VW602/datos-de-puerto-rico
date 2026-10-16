/** BLS LAUS monthly unemployment detail: latest month, comparisons, labor force and the 24-month line. */
import { defineMessages } from "../define.ts";

export const LAUS_MESSAGES = defineMessages({
  es: {
    preliminary: "Preliminar",
    same: "igual",
    points: "pts",
    label: (name: string) => `Desempleo mensual de ${name}`,
    heading: (name: string) => `Mes a mes · ${name}`,
    notPublished: "Dato no publicado",
    versus: (month: string) => `Frente a ${month}`,
    chartLabel: (name: string, months: number) =>
      `Tasa de desempleo de ${name}, últimos ${months} meses. Línea discontinua: Puerto Rico.`,
    dashed: " · discontinua: Puerto Rico",
    laborForce: "Fuerza laboral",
    employed: "Personas empleadas",
    unemployed: "Personas desempleadas",
    preliminaryNote: ", preliminar: BLS lo revisará el mes próximo",
    note: ". Sin ajuste estacional. Las diferencias las calcula este sitio restando las tasas publicadas.",
  },
  en: {
    preliminary: "Preliminary",
    same: "no change",
    points: "pts",
    label: (name: string) => `Monthly unemployment in ${name}`,
    heading: (name: string) => `Month by month · ${name}`,
    notPublished: "Not published",
    versus: (month: string) => `Vs. ${month}`,
    chartLabel: (name: string, months: number) =>
      `Unemployment rate in ${name}, last ${months} months. Dashed line: Puerto Rico.`,
    dashed: " · dashed: Puerto Rico",
    laborForce: "Labor force",
    employed: "Employed",
    unemployed: "Unemployed",
    preliminaryNote: ", preliminary: BLS will revise it next month",
    note: ". Not seasonally adjusted. Changes are calculated by this site by subtracting the published rates.",
  },
});
