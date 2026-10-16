/**
 * Federal money from USAspending. Obligated (committed to pay), outlays /
 * disbursed (paid, as agencies report it) and awards (counts) are different
 * things in both languages; none of them means "spent by the recipient".
 * Agency and program names are USAspending's own and stay as published.
 */
import { defineMessages } from "../define.ts";

export const FUNDS_MESSAGES = defineMessages({
  es: {
    geo: {
      MUNICIPIO_ATTRIBUTABLE: {
        label: "Atribuible a un municipio",
        detail: "Contratos que se ejecutan en el municipio y asistencia a personas que viven allí.",
      },
      MUNICIPIO_UNCERTAIN: {
        label: "Registrado en un municipio, sin certeza",
        detail:
          "Asistencia a organizaciones y gobiernos con un municipio como lugar de ejecución. Puede ser una oficina que sirve a toda la isla.",
      },
      PUERTO_RICO_STATEWIDE: {
        label: "Todo Puerto Rico",
        detail: "Asistencia registrada para Puerto Rico completo, sin municipio.",
      },
      NO_MUNICIPIO_GEOGRAPHY: {
        label: "Sin municipio registrado",
        detail: "Contratos en Puerto Rico que no indican municipio.",
      },
    },
    fiscalYear: (fy: number) => `AF ${fy}`,
    fiscalYearRange: (fy: number, start: string, end: string) => `AF ${fy} (${start} – ${end})`,
    obligatedNote:
      "Obligado quiere decir que el gobierno federal se comprometió a pagar. No quiere decir que ya lo desembolsó, ni que quien lo recibe lo gastó.",
    netDeobligation: "desobligación neta",
    municipioLabel: (name: string) => `Fondos federales de ${name}`,
    municipioHeading: (name: string, fy: number) => `Dinero federal · ${name} · AF ${fy}`,
    recorded: (name: string) => `Registrado por USAspending en ${name}`,
    recordedNote: (name: string) => `Todo lo que tiene a ${name} como lugar de ejecución.`,
    noRecords: "Sin registros",
    attributable: "Atribuible al municipio",
    attributableRest: " con la información disponible",
    attributableNote: (contracts: string, individuals: string) =>
      `Contratos ${contracts} · asistencia a personas ${individuals}. Es lo que pinta el mapa.`,
    obligatedAndDisbursed: "Obligado y desembolsado",
    awardsNote: (name: string, fy: number) =>
      `Adjudicaciones atribuibles a ${name} con actividad en el AF ${fy}, desde su inicio.`,
    obligated: "Obligado",
    disbursedCumulative: "Desembolsado acumulado (reportado)",
    noOutlays: "Sin desembolsos reportados",
    awardsCount: (attributable: string, recorded: string, name: string) =>
      `${attributable} adjudicaciones atribuibles de ${recorded} registradas en ${name}.`,
    contractsByAgency: "Contratos, por agencia",
    individualsByProgram: "Asistencia a personas, por programa",
    uncertainByProgram: "Registrado aquí sin certeza, por programa",
    statewideApart: (amount: string) =>
      `Aparte, ${amount} son para todo Puerto Rico sin municipio. Ese dinero no se le asigna a ningún municipio.`,
    islandLabel: "Fondos federales en Puerto Rico",
    islandHeading: (fy: number, total: string) => `Puerto Rico · obligaciones AF ${fy}: ${total}`,
    partsNote: "Las cuatro partes suman el total de Puerto Rico. El mapa solo pinta la primera.",
    cdbgHeading: "Ejemplo: subvenciones CDBG-DR y CDBG-MIT de HUD",
    award: "Adjudicación",
    disbursed: "Desembolsado",
    notReported: "Sin reportar",
    outlaysThrough: (day: string) => `Desembolsos reportados hasta el ${day}.`,
    rows: {
      field: "Campo",
      fiscalYear: "Año fiscal federal",
      place: "Lugar",
      obligated: "Obligado",
      disbursed: "Desembolsado",
      updated: "Actualizado",
    },
    fieldUsed: {
      fedObligations:
        "Suma de federal_action_obligation de las transacciones con fecha de acción en el año fiscal (contratos y asistencia a personas con el municipio como lugar de ejecución). Puede incluir montos negativos: desobligaciones.",
      fedOutlays:
        "total_outlays: pagos acumulados que las agencias reportan para cada adjudicación atribuible con actividad en el año fiscal. No se suma con las obligaciones de transacción.",
      fedAwards:
        "Número de adjudicaciones primarias (contratos y asistencia a personas) con actividad en el año fiscal y el municipio como lugar de ejecución.",
    } as Record<string, string>,
    placeRule:
      "Lugar principal de ejecución, no la sede de quien recibe el dinero. El mapa solo pinta lo atribuible a un municipio: contratos que se ejecutan allí y asistencia a personas que viven allí. La asistencia a organizaciones y gobiernos que nombra un municipio puede ser una oficina que sirve a toda la isla: se muestra aparte, sin certeza. Lo que es para todo Puerto Rico o no dice municipio no se le asigna a ninguno.",
    obligatedRule:
      "El gobierno federal se comprometió legalmente a pagar. Obligado no quiere decir desembolsado ni gastado.",
    disbursedRule: (day: string) =>
      `Pagos que la agencia federal reporta, hasta el ${day}. Un desembolso no reportado queda vacío: no quiere decir $0. Desembolsado tampoco quiere decir gastado por quien lo recibe.`,
    updated: (source: string, from: string, to: string | null) =>
      `USAspending: ${source}. Copia obtenida de la API el ${from}${to ? ` al ${to}` : ""}.`,
  },
  en: {
    geo: {
      MUNICIPIO_ATTRIBUTABLE: {
        label: "Attributable to a municipio",
        detail: "Contracts performed in the municipio and assistance to people who live there.",
      },
      MUNICIPIO_UNCERTAIN: {
        label: "Recorded in a municipio, not certain",
        detail:
          "Assistance to organizations and governments with a municipio as the place of performance. It may be an office that serves the whole island.",
      },
      PUERTO_RICO_STATEWIDE: {
        label: "All of Puerto Rico",
        detail: "Assistance recorded for Puerto Rico as a whole, with no municipio.",
      },
      NO_MUNICIPIO_GEOGRAPHY: {
        label: "No municipio recorded",
        detail: "Contracts in Puerto Rico that do not name a municipio.",
      },
    },
    fiscalYear: (fy: number) => `FY ${fy}`,
    fiscalYearRange: (fy: number, start: string, end: string) => `FY ${fy} (${start} – ${end})`,
    obligatedNote:
      "Obligated means the federal government committed to pay. It does not mean the money has been disbursed, or that the recipient has spent it.",
    netDeobligation: "net deobligation",
    municipioLabel: (name: string) => `Federal funds for ${name}`,
    municipioHeading: (name: string, fy: number) => `Federal money · ${name} · FY ${fy}`,
    recorded: (name: string) => `Recorded by USAspending in ${name}`,
    recordedNote: (name: string) => `Everything with ${name} as the place of performance.`,
    noRecords: "No records",
    attributable: "Attributable to the municipio",
    attributableRest: " with the information available",
    attributableNote: (contracts: string, individuals: string) =>
      `Contracts ${contracts} · assistance to individuals ${individuals}. This is what the map paints.`,
    obligatedAndDisbursed: "Obligated and disbursed",
    awardsNote: (name: string, fy: number) =>
      `Awards attributable to ${name} with activity in FY ${fy}, since they began.`,
    obligated: "Obligated",
    disbursedCumulative: "Cumulative disbursed (reported)",
    noOutlays: "No outlays reported",
    awardsCount: (attributable: string, recorded: string, name: string) =>
      `${attributable} attributable awards out of ${recorded} recorded in ${name}.`,
    contractsByAgency: "Contracts, by agency",
    individualsByProgram: "Assistance to individuals, by program",
    uncertainByProgram: "Recorded here without certainty, by program",
    statewideApart: (amount: string) =>
      `Separately, ${amount} is for all of Puerto Rico with no municipio. That money is not assigned to any municipio.`,
    islandLabel: "Federal funds in Puerto Rico",
    islandHeading: (fy: number, total: string) => `Puerto Rico · FY ${fy} obligations: ${total}`,
    partsNote: "The four parts add up to the Puerto Rico total. The map paints only the first.",
    cdbgHeading: "Example: HUD CDBG-DR and CDBG-MIT grants",
    award: "Award",
    disbursed: "Disbursed",
    notReported: "Not reported",
    outlaysThrough: (day: string) => `Outlays reported through ${day}.`,
    rows: {
      field: "Field",
      fiscalYear: "Federal fiscal year",
      place: "Place",
      obligated: "Obligated",
      disbursed: "Disbursed",
      updated: "Updated",
    },
    fieldUsed: {
      fedObligations:
        "Sum of federal_action_obligation on transactions with an action date in the fiscal year (contracts and assistance to individuals with the municipio as the place of performance). It can include negative amounts: deobligations.",
      fedOutlays:
        "total_outlays: cumulative payments agencies report for each attributable award with activity in the fiscal year. Not added to transaction obligations.",
      fedAwards:
        "Number of prime awards (contracts and assistance to individuals) with activity in the fiscal year and the municipio as the place of performance.",
    } as Record<string, string>,
    placeRule:
      "Primary place of performance, not where the recipient is headquartered. The map paints only what can be attributed to a municipio: contracts performed there and assistance to people who live there. Assistance to organizations and governments that names a municipio may be an office that serves the whole island, so it is shown separately, without certainty. Money for all of Puerto Rico, or with no municipio, is not assigned to any.",
    obligatedRule:
      "The federal government made a legal commitment to pay. Obligated does not mean disbursed or spent.",
    disbursedRule: (day: string) =>
      `Payments the federal agency reports, through ${day}. An unreported outlay is left empty; that does not mean $0. Disbursed does not mean spent by the recipient either.`,
    updated: (source: string, from: string, to: string | null) =>
      `USAspending: ${source}. Copy retrieved from the API on ${from}${to ? ` to ${to}` : ""}.`,
  },
});
