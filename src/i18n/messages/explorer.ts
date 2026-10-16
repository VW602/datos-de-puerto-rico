/**
 * The explorer: header, map, legend, search, the selected municipio, the
 * ranking of the 78, the table, the phone tabs and the footer. Ordering is
 * descriptive in both languages ("highest to lowest"), never a score.
 * Municipio names are proper names and never translated; English says
 * "municipio", the Census Bureau's own term for Puerto Rico's 78.
 */
import { defineMessages } from "../define.ts";

export const EXPLORER_MESSAGES = defineMessages({
  es: {
    header: {
      tagline: "78 municipios, con su fuente",
      topics: "Temas",
      sources: "Fuentes y método",
    },
    language: {
      nav: "Idioma",
    },
    measure: {
      label: "Medida",
      radios: (group: string) => `Medidas de ${group}`,
      islandOnly: "Una sola cifra para toda la isla",
      withData: (n: number) => `${n} de 78 municipios con dato`,
    },
    map: {
      label: (metric: string, selected: string | null) =>
        `Mapa de Puerto Rico: ${metric}. ${selected ? `Seleccionado: ${selected}.` : "Ningún municipio seleccionado."}`,
      overview: (rect: boolean) =>
        `Vista de toda la isla, de Mona a Culebra. ${rect ? "El recuadro marca la parte que muestra el mapa grande." : ""}`,
      roleDescription: "mapa",
      wholeIsland: "Toda la isla",
      tapHint: "Toca un municipio o acércate",
      dragHint: "Arrastra el mapa para moverte",
      zoomIn: "Acercar el mapa",
      zoomOut: "Alejar el mapa",
      reset: "Ver toda la isla",
      islandNote: (value: string) => `Solo para toda la isla · ${value}`,
      tooltipIslandOnly: "Solo hay cifra para toda la isla",
      zeroPublished: "0 · cero publicado",
      rankOf: (rank: number, of: number) => `${rank} de ${of} · `,
      keyboard: ". Enter para seleccionar; flechas para moverte.",
      atlantic: "OCÉANO ATLÁNTICO",
      caribbean: "MAR CARIBE",
    },
    legend: {
      islandOnly: "No hay cifra por municipio: el mapa pinta toda la isla igual.",
      lowest: "Valor más bajo: ",
      highest: "Valor más alto: ",
      netNegative: "Neto negativo",
      noData: "Sin dato publicado",
      selected: "Seleccionado",
      darker: "Más oscuro = más alto",
      log: " · escala logarítmica",
    },
    search: {
      label: "Buscar municipio",
      count: (n: number) => `${n} ${n === 1 ? "municipio" : "municipios"}`,
      none: "Ningún municipio con ese nombre.",
    },
    chooser: {
      prompt: (n: number) => `Tocaste cerca de ${n} municipios. ¿Cuál quieres ver?`,
      cancel: "Cancelar",
    },
    missing: {
      not_published: {
        short: "Sin dato publicado",
        long: "La fuente oficial no publicó este dato para este municipio.",
      },
      not_applicable: {
        short: "No aplica",
        long: "Esta medida no aplica a este municipio.",
      },
      geography_unavailable: {
        short: "Solo para toda la isla",
        long: "La fuente solo publica este dato para un área más grande, no por municipio.",
      },
      source_unavailable: {
        short: "Fuente sin responder",
        long: "La fuente no respondió y no hay una copia guardada. Vuelve a intentar más tarde.",
      },
      pending_update: {
        short: "Pendiente",
        long: "Este dato espera la próxima publicación de la fuente.",
      },
      source_conflict: {
        short: "Dato sin confirmar",
        long: "La fuente oficial da dos versiones distintas de este dato. No se muestra hasta confirmarlo.",
      },
    },
    delta: {
      equal: "igual a la mediana",
      versus: (delta: string) => `${delta} frente a la mediana`,
      points: "pts",
      place: (name: string, metric: string, value: string, rank: string) =>
        `${name}, ${metric}: ${value}${rank}`,
      rank: (rank: number, of: number) => `, lugar ${rank} de ${of}`,
    },
    island: {
      obesity:
        "36.0% de los adultos. El sobrepeso, medido aparte, es 35.1%. El BRFSS no lo publica por municipio.",
      inactivity:
        "52.1% de los adultos no hace actividad física en su tiempo libre. No baja a municipio.",
      noteHeading: "Los 78, de mayor a menor",
      noteLabel: "Sin orden por municipio",
      note: "Esta cifra solo existe para toda la isla. La encuesta BRFSS de los CDC no la publica por municipio, así que no hay orden ni tabla.",
    },
    summary: {
      label: "Resumen",
      puertoRico: "Puerto Rico",
      median: (n: number, period: string) => `Mediana de los ${n} municipios con dato · ${period}`,
      range: (low: string, lowName: string, high: string, highName: string) =>
        `De ${low} en ${lowName} a ${high} en ${highName}.`,
      choose: "Escoge un municipio en el mapa, en la lista o con el buscador.",
      selected: "Municipio seleccionado",
      selectedLabel: (name: string) => `Municipio seleccionado: ${name}`,
      clear: (name: string) => `Quitar la selección de ${name}`,
      islandFigure: " · cifra de toda la isla, no del municipio",
      preliminary: "Preliminar: BLS revisa cada mes la cifra del mes anterior.",
      netNegative:
        "Neto negativo: en este año pesaron más las desobligaciones y ajustes que las obligaciones nuevas. No es un dato que falta ni $0.",
      rank: "Lugar entre los 78",
      rankOf: (rank: number, of: number) => `${rank} de ${of}`,
      vsMedian: (median: string) => `Frente a la mediana (${median})`,
      moe: "± es el margen de error del Censo (90%): el valor real probablemente está dentro de ese rango. Solo aparece cuando el Censo lo publica para esa cifra.",
      prRate: (rate: string, month: string, preliminary: boolean) =>
        `Puerto Rico completo: ${rate} (${month}${preliminary ? ", preliminar" : ""}).`,
      preliminarySuffix: " (preliminar)",
      fiscalYear: (fy: number) => `AF ${fy}`,
      allMeasures: (n: number, name: string) => `Ver las ${n} medidas de ${name}`,
    },
    ranking: {
      heading: "Los 78, de mayor a menor",
      notAScore: "Ordenar no es calificar",
      stripLabel: (n: number, metric: string, median: string, selected: string) =>
        `Los ${n} valores de ${metric} en una línea. Mediana ${median}.${selected}`,
      stripSelected: (name: string, rank: number) => ` ${name}, lugar ${rank}.`,
      median: "mediana",
      highest: "Más altos",
      lowest: "Más bajos",
      missing: (n: number) => `${n} sin dato publicado: no entran al orden.`,
    },
    table: {
      caption: (metric: string, median: string) =>
        `${metric} por municipio. Encabezados con botón para ordenar. Mediana ${median}.`,
      rank: "Lugar",
      municipio: "Municipio",
      vsMedian: "Frente a la mediana",
      income: "Ingreso mediano",
      selected: " (seleccionado)",
      notPublished: "Dato no publicado",
      heading: "Tabla de los 78",
      sortHint: "Usa los encabezados para ordenar",
    },
    tabs: {
      label: "Más información",
      perfil: "Perfil",
      los78: "Los 78",
      fuente: "Fuente",
      profileEmpty: "Escoge un municipio para ver todas sus medidas.",
      showTable: "Ver la tabla completa",
      hideTable: "Ocultar la tabla",
    },
    footer: {
      sources:
        "Fuentes: Oficina del Censo de EE. UU. (ACS y TIGER/Line), NHTSA (FARS), CDC (BRFSS), BLS (LAUS), USAspending.gov (Departamento del Tesoro), OpenFEMA, el Servicio Nacional de Meteorología (NWS) y el Servicio Geológico de EE. UU. (USGS). Cada medida dice su fuente y su periodo.",
      independent: "Proyecto independiente, sin afiliación con ninguna agencia de gobierno.",
    },
  },
  en: {
    header: {
      tagline: "78 municipios, each with its source",
      topics: "Topics",
      sources: "Sources and method",
    },
    language: {
      nav: "Language",
    },
    measure: {
      label: "Measure",
      radios: (group: string) => `${group} measures`,
      islandOnly: "One figure for the whole island",
      withData: (n: number) => `${n} of 78 municipios with data`,
    },
    map: {
      label: (metric: string, selected: string | null) =>
        `Map of Puerto Rico: ${metric}. ${selected ? `Selected: ${selected}.` : "No municipio selected."}`,
      overview: (rect: boolean) =>
        `The whole island, from Mona to Culebra. ${rect ? "The box marks the part the large map shows." : ""}`,
      roleDescription: "map",
      wholeIsland: "Whole island",
      tapHint: "Tap a municipio or zoom in",
      dragHint: "Drag the map to move around",
      zoomIn: "Zoom in on the map",
      zoomOut: "Zoom out of the map",
      reset: "Show the whole island",
      islandNote: (value: string) => `Island-wide only · ${value}`,
      tooltipIslandOnly: "Only an island-wide figure exists",
      zeroPublished: "0 · published zero",
      rankOf: (rank: number, of: number) => `${rank} of ${of} · `,
      keyboard: ". Press Enter to select; use the arrow keys to move.",
      atlantic: "ATLANTIC OCEAN",
      caribbean: "CARIBBEAN SEA",
    },
    legend: {
      islandOnly: "There is no figure by municipio: the map paints the whole island the same.",
      lowest: "Lowest value: ",
      highest: "Highest value: ",
      netNegative: "Net negative",
      noData: "No published data",
      selected: "Selected",
      darker: "Darker = higher",
      log: " · logarithmic scale",
    },
    search: {
      label: "Find a municipio",
      count: (n: number) => `${n} ${n === 1 ? "municipio" : "municipios"}`,
      none: "No municipio by that name.",
    },
    chooser: {
      prompt: (n: number) => `You tapped near ${n} municipios. Which one do you want?`,
      cancel: "Cancel",
    },
    missing: {
      not_published: {
        short: "No published data",
        long: "The official source did not publish this figure for this municipio.",
      },
      not_applicable: {
        short: "Does not apply",
        long: "This measure does not apply to this municipio.",
      },
      geography_unavailable: {
        short: "Island-wide only",
        long: "The source publishes this figure only for a larger area, not by municipio.",
      },
      source_unavailable: {
        short: "Source not responding",
        long: "The source did not respond and there is no saved copy. Try again later.",
      },
      pending_update: {
        short: "Pending",
        long: "This figure is waiting on the source's next release.",
      },
      source_conflict: {
        short: "Unconfirmed figure",
        long: "The official source gives two different versions of this figure. It is not shown until it is confirmed.",
      },
    },
    delta: {
      equal: "equal to the median",
      versus: (delta: string) => `${delta} vs. the median`,
      points: "pts",
      place: (name: string, metric: string, value: string, rank: string) =>
        `${name}, ${metric}: ${value}${rank}`,
      rank: (rank: number, of: number) => `, ranked ${rank} of ${of}`,
    },
    island: {
      obesity:
        "36.0% of adults. Overweight, measured separately, is 35.1%. BRFSS does not publish it by municipio.",
      inactivity:
        "52.1% of adults get no physical activity in their free time. It is not broken down by municipio.",
      noteHeading: "The 78, highest to lowest",
      noteLabel: "No order by municipio",
      note: "This figure exists only for the whole island. The CDC's BRFSS survey does not publish it by municipio, so there is no ranking and no table.",
    },
    summary: {
      label: "Summary",
      puertoRico: "Puerto Rico",
      median: (n: number, period: string) => `Median of the ${n} municipios with data · ${period}`,
      range: (low: string, lowName: string, high: string, highName: string) =>
        `From ${low} in ${lowName} to ${high} in ${highName}.`,
      choose: "Pick a municipio on the map, in the list or with the search box.",
      selected: "Selected municipio",
      selectedLabel: (name: string) => `Selected municipio: ${name}`,
      clear: (name: string) => `Clear the selection of ${name}`,
      islandFigure: " · island-wide figure, not the municipio's",
      preliminary: "Preliminary: each month BLS revises the previous month's figure.",
      netNegative:
        "Net negative: this year, deobligations and adjustments outweighed new obligations. It is not missing data and not $0.",
      rank: "Rank among the 78",
      rankOf: (rank: number, of: number) => `${rank} of ${of}`,
      vsMedian: (median: string) => `Vs. the median (${median})`,
      moe: "± is the Census margin of error (90%): the true value is probably within that range. It appears only when the Census publishes one for that figure.",
      prRate: (rate: string, month: string, preliminary: boolean) =>
        `All of Puerto Rico: ${rate} (${month}${preliminary ? ", preliminary" : ""}).`,
      preliminarySuffix: " (preliminary)",
      fiscalYear: (fy: number) => `FY ${fy}`,
      allMeasures: (n: number, name: string) => `See all ${n} measures for ${name}`,
    },
    ranking: {
      heading: "The 78, highest to lowest",
      notAScore: "An order, not a score",
      stripLabel: (n: number, metric: string, median: string, selected: string) =>
        `All ${n} values of ${metric} on one line. Median ${median}.${selected}`,
      stripSelected: (name: string, rank: number) => ` ${name}, ranked ${rank}.`,
      median: "median",
      highest: "Highest",
      lowest: "Lowest",
      missing: (n: number) => `${n} with no published data are left out of the order.`,
    },
    table: {
      caption: (metric: string, median: string) =>
        `${metric} by municipio. Column headers are buttons that sort. Median ${median}.`,
      rank: "Rank",
      municipio: "Municipio",
      vsMedian: "Vs. the median",
      income: "Median income",
      selected: " (selected)",
      notPublished: "Not published",
      heading: "Table of the 78",
      sortHint: "Use the column headers to sort",
    },
    tabs: {
      label: "More information",
      perfil: "Profile",
      los78: "The 78",
      fuente: "Source",
      profileEmpty: "Pick a municipio to see all of its measures.",
      showTable: "See the full table",
      hideTable: "Hide the table",
    },
    footer: {
      sources:
        "Sources: U.S. Census Bureau (ACS and TIGER/Line), NHTSA (FARS), CDC (BRFSS), BLS (LAUS), USAspending.gov (U.S. Department of the Treasury), OpenFEMA, the National Weather Service (NWS) and the U.S. Geological Survey (USGS). Every measure names its source and period.",
      independent: "An independent project, not affiliated with any government agency.",
    },
  },
});
