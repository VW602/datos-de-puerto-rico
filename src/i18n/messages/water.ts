/**
 * "Agua (USGS)" / "Water (USGS)". Measures keep the USGS parameter meaning:
 * gage height is the water level read at the gage, not river depth and not a
 * flood stage; reservoir elevation is not a percent full. Station names are
 * USGS's own and are shown as published in both languages.
 */
import { defineMessages } from "../define.ts";

export const WATER_MESSAGES = defineMessages({
  es: {
    title: "Agua (USGS)",
    views: { RIOS: "Ríos y canales", LLUVIA: "Lluvia", EMBALSES: "Embalses y lagos" },
    viewsLower: { RIOS: "ríos y canales", LLUVIA: "lluvia", EMBALSES: "embalses y lagos" },
    shapes: { RIOS: "círculo", LLUVIA: "rombo", EMBALSES: "cuadrado" },
    seriesState: {
      CURRENT: "Dato reciente",
      AGING: "Dato de hace unas horas",
      STALE: "Sin dato reciente",
      NO_DATA: "Sin dato",
    },
    seriesStateLower: {
      CURRENT: "dato reciente",
      AGING: "dato de hace unas horas",
      STALE: "sin dato reciente",
      NO_DATA: "sin dato",
    },
    units: {
      "ft^3/s": "pies cúbicos por segundo",
      ft: "pies",
      m: "metros",
      in: "pulgadas",
    } as Record<string, string>,
    kinds: {
      DISCHARGE: "Caudal",
      GAGE_HEIGHT: "Altura del medidor",
      PRECIPITATION: "Lluvia",
      RESERVOIR_ELEVATION: "Elevación del agua",
    },
    datums: {
      PRVD02: "sobre el Datum Vertical de Puerto Rico de 2002 (PRVD02)",
      LMSL: "sobre el nivel medio local del mar (LMSL)",
      NGVD29: "sobre el Datum Vertical Geodésico Nacional de 1929 (NGVD 29)",
    } as Record<string, string>,
    qualifiers: {
      DRY: "seco (USGS)",
      ESTIMATED: "estimado",
      RATINGDEV: "curva de caudal en desarrollo (USGS no publica caudal)",
      UNAVAIL: "no disponible",
      DISCONTINUED: "estación descontinuada",
      ICE: "hielo",
      EQUIP: "falla de equipo",
      FLOOD: "dañado por crecida",
      MAINT: "en mantenimiento",
      BKW: "efecto de remanso",
      ZFL: "flujo cero",
    } as Record<string, string>,
    approval: { Provisional: "Provisional", Approved: "Aprobado" },
    trend: { UP: "subiendo", DOWN: "bajando", SAME: "sin cambio" },
    exclusions: {
      INACTIVE:
        "series sin observaciones en los últimos 30 días (descontinuadas o fuera de servicio)",
      ALTERNATE_DATUM_OR_UNIT:
        "copias de la misma elevación de embalse en otro datum o unidad (se muestra una)",
      AMBIGUOUS_DUPLICATE: "dos series activas del mismo parámetro en un sitio (no se elige una)",
      SITE_TYPE_OUT_OF_SCOPE: "sitios de otro tipo (manantial, desvío, costa)",
      NOT_USGS: "sitios de otra agencia",
      NO_METADATA: "series sin metadatos",
      NO_SITE_METADATA: "sitios sin metadatos",
      METADATA_MISMATCH: "series cuyo significado no es el esperado",
      INVALID_COORDINATES: "coordenadas inválidas",
      INVALID_VALUE: "valores no numéricos",
      FUTURE_OBSERVATION: "observaciones con hora futura",
    } as Record<string, string>,
    notes: {
      RIOS: "El caudal es el volumen de agua que pasa por el medidor, en pies cúbicos por segundo (ft³/s). La altura del medidor es el nivel del agua leído en el medidor, sobre su propio punto de referencia: no es la profundidad del río ni un nivel de inundación. Un valor alto no es, por sí solo, un aviso.",
      LLUVIA:
        "El USGS publica la lluvia en incrementos de 15 minutos (pulgadas). El total de 24 horas se da solo cuando esos registros cubren todo el periodo, hasta la última observación de cada estación. Cada estación se muestra por separado: no se suman ni se ordenan estaciones entre sí.",
      EMBALSES:
        "Elevación de la superficie del agua sobre el datum indicado (o la altura del medidor). No es un porcentaje de llenado: el USGS no publica aquí la capacidad del embalse, y este sitio no la calcula.",
    },
    station: { one: "estación", many: "estaciones" },
    measurement: { one: "medición", many: "mediciones" },
    stationIn: (municipio: string) => `Estación ubicada en ${municipio}`,
    stationNoMunicipio: "Estación sin municipio en los datos del USGS",
    noValue: "sin dato",
    noValueTitle: "Sin dato",
    parameter: "parámetro",
    negativeFlag: "Valor negativo publicado por el USGS: se marca para revisión, no se corrige.",
    lastRecord: "último registro: ",
    rainIn24: (to: string) => `en 24 h hasta ${to}`,
    rainUnavailable: "Total de 24 h no disponible (registros incompletos)",
    trendSince: (from: string, unit: string) => `en 3 h, desde ${from} ${unit}`,
    usgsPage: "Ficha del USGS ↗",
    usgsPageLabel: (name: string) => `Página del USGS de ${name}`,
    measurementsOf: (name: string) => `Mediciones de ${name}`,
    mapLabel: (stations: number, view: string, allCurrent: number) =>
      `Mapa de puntos: ${stations} ${stations === 1 ? "estación" : "estaciones"} de ${view} del USGS, un punto por estación; ${allCurrent} con todas sus mediciones al día. Cada punto es una estación, no un municipio. La lista debajo tiene cada medición.`,
    caption: {
      each: (shape: string) =>
        `Cada ${shape} es una estación (un punto), no un municipio; donde no hay estación no hay medición, no un cero. `,
      filled: " relleno: todas sus mediciones con dato reciente. ",
      open: " vacío: alguna medición sin dato reciente o sin dato. ",
      cross: " con equis: ninguna medición con dato. ",
      size: "El tamaño no indica el valor; los puntos cercanos pueden encimarse, y la lista tiene cada estación.",
    },
    table: {
      caption: (view: string) =>
        `Mediciones de ${view} del USGS. Cada fila es una medición; las de una misma estación van juntas bajo su nombre. Por municipio. Cada medición tiene su hora y su estado.`,
      station: "Estación",
      measure: "Medición",
      value: "Valor",
      time: "Hora de la medición (PR)",
      rain24: "Lluvia 24 h",
      change: "Cambio",
      spark: "24 h",
      sparkHidden: "(gráfica, escala propia)",
    },
    details: {
      notWarnings: "Estas son mediciones de estaciones del USGS; no son avisos de inundación.",
      notDrought:
        "Tampoco dicen si hay sequía ni cuánta agua hay para tomar. Datos provisionales sujetos a revisión por el USGS.",
      provisionalLink: "Qué significa «provisional» ↗",
      stationType: "Tipo de estación",
      noStations: (view: string) =>
        `Ninguna estación de ${view} con medición publicada en esta copia del USGS.`,
      monitored: "monitoreadas",
      with: "con",
      tally: (reporting: number, stale: number, noData: number) =>
        `${reporting} con dato reciente · ${stale} sin dato reciente · ${noData} sin dato.`,
      kindTally: (reporting: number, of: string, stale: number, noData: number) =>
        `${reporting} de ${of} con dato reciente · sin dato reciente: ${stale} · sin dato: ${noData}`,
      perSeries:
        "Una estación puede tener más de una medición (por ejemplo, caudal y altura del medidor); el estado se da por medición, para que una al día no esconda otra sin dato en la misma estación.",
      seriesUnavailable:
        "Las series de 24 horas no estuvieron disponibles en esta actualización; se muestran solo los valores más recientes.",
      byStation: (view: string) => `Mediciones por estación (${view}, por municipio)`,
      showLess: "Mostrar menos",
      showAll: (n: number, first: number) => `Mostrar las ${n} estaciones (${first} a la vista)`,
      changeNote:
        "Cambio: diferencia entre el valor más reciente y el de 3 horas antes en la misma serie, con la precisión publicada. Gráfica de 24 h: valores a cada hora en punto (lluvia: suma de cada hora), con la escala propia de cada estación.",
    },
    section: {
      loading: "Cargando datos de agua…",
      loadFailed: "No se pudieron cargar los datos de agua guardados.",
      unconfirmed: "No se pudieron confirmar las condiciones actuales del agua.",
      perLastCopy: (at: string) =>
        ` Según la última copia del USGS (${at}), con la hora de cada medición:`,
      noCopy: " No hay ninguna copia del USGS.",
      listLabel: "Estaciones y mediciones de agua",
      noStation: "ninguna estación con medición publicada",
      summary: (stations: string, reporting: number, of: string) =>
        `${stations} · ${reporting} de ${of} con dato reciente`,
      open: "Ver estaciones de agua: mapa y mediciones",
    },
    provenance: {
      intro:
        "Cada medición dice su estación (ID del USGS), el código de parámetro, la unidad, la hora de la medición y si el dato es provisional o aprobado.",
      retrieved: "Obtenido: ",
      never: "nunca",
      lastAttemptFailed: (at: string) => ` Último intento fallido: ${at}.`,
      notObservationTime: " La hora de obtención no es la hora de las mediciones.",
      rules:
        "Reglas: una serie por sitio y parámetro; las series sin datos en 30 días no se publican; en embalses se muestra una elevación (PRVD02 en pies primero). Excluidas: ",
      listed: (station: string, parameter: string, detail: string) =>
        `${station}, parámetro ${parameter}: ${detail}.`,
      apiDocs: "Documentación de la API ↗",
      prWater: "Datos de agua del USGS para Puerto Rico ↗",
      provisional: "Datos provisionales ↗",
      credits: "Créditos y derechos ↗",
    },
  },
  en: {
    title: "Water (USGS)",
    views: { RIOS: "Rivers and canals", LLUVIA: "Rain", EMBALSES: "Reservoirs and lakes" },
    viewsLower: { RIOS: "rivers and canals", LLUVIA: "rain", EMBALSES: "reservoirs and lakes" },
    shapes: { RIOS: "circle", LLUVIA: "diamond", EMBALSES: "square" },
    seriesState: {
      CURRENT: "Recent reading",
      AGING: "Reading from a few hours ago",
      STALE: "No recent reading",
      NO_DATA: "No reading",
    },
    seriesStateLower: {
      CURRENT: "recent reading",
      AGING: "reading from a few hours ago",
      STALE: "no recent reading",
      NO_DATA: "no reading",
    },
    units: {
      "ft^3/s": "cubic feet per second",
      ft: "feet",
      m: "meters",
      in: "inches",
    } as Record<string, string>,
    kinds: {
      DISCHARGE: "Discharge",
      GAGE_HEIGHT: "Gage height",
      PRECIPITATION: "Rain",
      RESERVOIR_ELEVATION: "Water surface elevation",
    },
    datums: {
      PRVD02: "above the Puerto Rico Vertical Datum of 2002 (PRVD02)",
      LMSL: "above local mean sea level (LMSL)",
      NGVD29: "above the National Geodetic Vertical Datum of 1929 (NGVD 29)",
    } as Record<string, string>,
    qualifiers: {
      DRY: "dry (USGS)",
      ESTIMATED: "estimated",
      RATINGDEV: "rating being developed (USGS publishes no discharge)",
      UNAVAIL: "unavailable",
      DISCONTINUED: "discontinued station",
      ICE: "ice",
      EQUIP: "equipment malfunction",
      FLOOD: "flood damage",
      MAINT: "under maintenance",
      BKW: "backwater",
      ZFL: "zero flow",
    } as Record<string, string>,
    approval: { Provisional: "Provisional", Approved: "Approved" },
    trend: { UP: "rising", DOWN: "falling", SAME: "no change" },
    exclusions: {
      INACTIVE: "series with no observations in the last 30 days (discontinued or out of service)",
      ALTERNATE_DATUM_OR_UNIT:
        "copies of the same reservoir elevation in another datum or unit (one is shown)",
      AMBIGUOUS_DUPLICATE:
        "two active series of the same parameter at one site (neither is chosen)",
      SITE_TYPE_OUT_OF_SCOPE: "other kinds of sites (spring, diversion, coast)",
      NOT_USGS: "sites run by another agency",
      NO_METADATA: "series without metadata",
      NO_SITE_METADATA: "sites without metadata",
      METADATA_MISMATCH: "series that do not mean what was expected",
      INVALID_COORDINATES: "invalid coordinates",
      INVALID_VALUE: "non-numeric values",
      FUTURE_OBSERVATION: "observations timed in the future",
    } as Record<string, string>,
    notes: {
      RIOS: "Discharge is the volume of water passing the gage, in cubic feet per second (ft³/s). Gage height is the water level read at the gage against the gage's own reference point: it is not the depth of the river and not a flood stage. A high value is not a warning by itself.",
      LLUVIA:
        "USGS publishes rain in 15-minute increments (inches). A 24-hour total is given only when those records cover the whole period, up to each station's latest observation. Each station is shown on its own: stations are not added up or ranked against each other.",
      EMBALSES:
        "Elevation of the water surface above the stated datum (or the gage height). It is not a percent full: USGS does not publish reservoir capacity here, and this site does not calculate it.",
    },
    station: { one: "station", many: "stations" },
    measurement: { one: "measurement", many: "measurements" },
    stationIn: (municipio: string) => `Station located in ${municipio}`,
    stationNoMunicipio: "Station with no municipio in the USGS data",
    noValue: "no reading",
    noValueTitle: "No reading",
    parameter: "parameter",
    negativeFlag: "Negative value published by USGS: flagged for review, not corrected.",
    lastRecord: "latest record: ",
    rainIn24: (to: string) => `in 24 h up to ${to}`,
    rainUnavailable: "24-hour total not available (incomplete records)",
    trendSince: (from: string, unit: string) => `over 3 h, from ${from} ${unit}`,
    usgsPage: "USGS station page ↗",
    usgsPageLabel: (name: string) => `USGS page for ${name}`,
    measurementsOf: (name: string) => `Measurements at ${name}`,
    mapLabel: (stations: number, view: string, allCurrent: number) =>
      `Dot map: ${stations} USGS ${view} ${stations === 1 ? "station" : "stations"}, one dot per station; ${allCurrent} with every measurement up to date. Each dot is a station, not a municipio. The list below has every measurement.`,
    caption: {
      each: (shape: string) =>
        `Each ${shape} is one station (one dot), not a municipio; where there is no station there is no measurement, not a zero. `,
      filled: " filled: every measurement has a recent reading. ",
      open: " open: some measurement has no recent reading or no reading. ",
      cross: " with an X: no measurement has a reading. ",
      size: "Size does not show the value; nearby dots can overlap, and the list has every station.",
    },
    table: {
      caption: (view: string) =>
        `USGS ${view} measurements. Each row is one measurement; those from the same station are grouped under its name, by municipio. Each measurement has its own time and status.`,
      station: "Station",
      measure: "Measurement",
      value: "Value",
      time: "Time of measurement (PR)",
      rain24: "24-h rain",
      change: "Change",
      spark: "24 h",
      sparkHidden: "(chart, own scale)",
    },
    details: {
      notWarnings: "These are measurements from USGS stations, not flood warnings.",
      notDrought:
        "They also do not say whether there is a drought or how much drinking water there is. Provisional data subject to revision by USGS.",
      provisionalLink: "What “provisional” means ↗",
      stationType: "Station type",
      noStations: (view: string) =>
        `No ${view} station has a published measurement in this USGS copy.`,
      monitored: "monitored",
      with: "with",
      tally: (reporting: number, stale: number, noData: number) =>
        `${reporting} with a recent reading · ${stale} without a recent reading · ${noData} with no reading.`,
      kindTally: (reporting: number, of: string, stale: number, noData: number) =>
        `${reporting} of ${of} with a recent reading · no recent reading: ${stale} · no reading: ${noData}`,
      perSeries:
        "A station can have more than one measurement (discharge and gage height, for example). Status is given per measurement, so one that is up to date does not hide another with no reading at the same station.",
      seriesUnavailable:
        "The 24-hour series were not available in this update; only the latest values are shown.",
      byStation: (view: string) => `Measurements by station (${view}, by municipio)`,
      showLess: "Show fewer",
      showAll: (n: number, first: number) => `Show all ${n} stations (${first} shown)`,
      changeNote:
        "Change: the difference between the latest value and the one 3 hours earlier in the same series, at the published precision. 24-h chart: values on each hour (rain: each hour's total), on each station's own scale.",
    },
    section: {
      loading: "Loading water data…",
      loadFailed: "Could not load the saved water data.",
      unconfirmed: "Could not confirm current water conditions.",
      perLastCopy: (at: string) =>
        ` According to the latest USGS copy (${at}), with the time of each measurement:`,
      noCopy: " There is no USGS copy at all.",
      listLabel: "Water stations and measurements",
      noStation: "no station with a published measurement",
      summary: (stations: string, reporting: number, of: string) =>
        `${stations} · ${reporting} of ${of} with a recent reading`,
      open: "See water stations: map and measurements",
    },
    provenance: {
      intro:
        "Each measurement gives its station (USGS ID), parameter code, unit, time of measurement, and whether the data are provisional or approved.",
      retrieved: "Retrieved: ",
      never: "never",
      lastAttemptFailed: (at: string) => ` Last failed attempt: ${at}.`,
      notObservationTime: " The retrieval time is not the time of the measurements.",
      rules:
        "Rules: one series per site and parameter; series with no data in 30 days are not published; for reservoirs one elevation is shown (PRVD02 in feet first). Excluded: ",
      listed: (station: string, parameter: string, detail: string) =>
        `${station}, parameter ${parameter}: ${detail}.`,
      apiDocs: "API documentation ↗",
      prWater: "USGS water data for Puerto Rico ↗",
      provisional: "Provisional data ↗",
      credits: "Credits and rights ↗",
    },
  },
});

/**
 * The snapshot's per-site exclusion notes are written in Spanish by
 * scripts/water/normalize.ts from a fixed set of templates. English reads
 * them back from those templates; a note that matches none stays as written
 * (marked as Spanish) rather than being guessed at.
 */
const DETAIL_EN: [RegExp, (...m: string[]) => string][] = [
  [/^sin observaciones en (\d+) días$/, (d) => `no observations in ${d} days`],
  [
    /^misma superficie publicada en otro datum o unidad; se usa (\S+)$/,
    (code) => `same surface published in another datum or unit; ${code} is used`,
  ],
  [
    /^(\d+) series activas del parámetro (\S+) con valores (.+); no se elige una$/,
    (n, code, values) =>
      `${n} active series of parameter ${code} with values ${values.split(" y ").join(" and ")}; neither is chosen`,
  ],
  [
    /^(\d+) series activas del parámetro (\S+) en el mismo sitio; no se elige una$/,
    (n, code) => `${n} active series of parameter ${code} at the same site; none is chosen`,
  ],
  [/^el sitio no es de la agencia USGS$/, () => "the site is not a USGS site"],
  [
    /^la serie no aparece en time-series-metadata$/,
    () => "the series is not in time-series-metadata",
  ],
  [
    /^la serie no tiene el significado esperado: (.+)$/,
    (what) => `the series does not mean what was expected: ${what}`,
  ],
  [
    /^el sitio no aparece en monitoring-locations$/,
    () => "the site is not in monitoring-locations",
  ],
  [
    /^tipo de sitio (\S*) \((.*)\) fuera de esta vista$/,
    (code, type) => `site type ${code} (${type}) is outside this view`,
  ],
  [
    /^coordenadas fuera de Puerto Rico o ausentes$/,
    () => "coordinates outside Puerto Rico or missing",
  ],
  [/^valor no numérico \((.*)\)$/, (v) => `non-numeric value (${v})`],
  [/^observación con hora posterior a la obtención$/, () => "observation timed after retrieval"],
  [/^estado de aprobación desconocido \((.*)\)$/, (v) => `unknown approval status (${v})`],
];

/** English for one exclusion note, or null when the note matches no known template. */
export function exclusionDetailEn(detail: string): string | null {
  for (const [pattern, english] of DETAIL_EN) {
    const match = detail.match(pattern);
    if (match) return english(...match.slice(1));
  }
  return null;
}
