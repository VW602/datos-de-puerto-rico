/**
 * "Ahora en Puerto Rico" / "Puerto Rico right now": freshness labels, NWS
 * alerts, USGS earthquakes and where the saved copies come from. Official
 * NWS and USGS text (event names, alert descriptions, place descriptions) is
 * shown as published, in English, in both languages.
 */
import { defineMessages } from "../define.ts";

export const NOW_MESSAGES = defineMessages({
  es: {
    title: "Ahora en Puerto Rico",
    disclaimer: "Copias guardadas de fuentes oficiales; no es un sistema de avisos.",
    checking: "Comprobando la antigüedad de la última copia…",
    status: {
      listLabel: "Estado de las copias de cada fuente",
      nws: "NWS alertas",
      quakes: "USGS sismos",
      water: "USGS agua",
      loading: "cargando…",
      loadFailed: "no se pudo cargar",
      checking: "comprobando…",
      lastAttemptFailed: " · último intento falló",
      freshness: {
        CURRENT: "Al día",
        AGING: "Algo atrasado",
        STALE: "Desactualizado",
        UNAVAILABLE: "Sin datos",
      },
    },
    alerts: {
      title: "Alertas del NWS",
      severity: {
        Extreme: "Extrema",
        Severe: "Severa",
        Moderate: "Moderada",
        Minor: "Menor",
        Unknown: "Desconocida",
      },
      severityLabel: "Severidad:",
      where: "Dónde: ",
      from: "Desde: ",
      until: " · Hasta: ",
      manyMunicipios: (n: number) => `${n} municipios (lista en los detalles)`,
      allPuertoRico: "Todo Puerto Rico",
      nwsZone: (zone: string) => `Zona del NWS: ${zone}`,
      details: "Detalles del NWS",
      municipiosSame: (list: string) => `Municipios (códigos SAME del NWS): ${list}.`,
      excerpt: "Extracto del texto oficial. ",
      officialText: "Texto oficial del NWS. ",
      fullAlert: "Alerta completa en el NWS ↗",
      seeOthers: (n: number) => `Ver ${n === 1 ? "la otra alerta" : `las otras ${n} alertas`}`,
      unconfirmed: "No se pudo confirmar el estado actual de las alertas.",
      lastCopy: (at: string) => ` La última copia del NWS es del ${at}.`,
      noCopy: " No hay ninguna copia del NWS.",
      seeThen: (n: number) =>
        `Ver ${n === 1 ? "la alerta" : `las ${n} alertas`} que estaban en vigor a esa hora`,
      none: (at: string) =>
        `No hay alertas activas del NWS para Puerto Rico en la última actualización (${at}).`,
      active: (n: number, at: string) =>
        `${n === 1 ? "1 alerta activa" : `${n} alertas activas`} del NWS para Puerto Rico (copia de las ${at}).`,
    },
    quakes: {
      title: "Sismos (USGS)",
      noMagnitude: "M sin dato",
      noDepth: "sin dato",
      noPlace: "Sin lugar",
      noPlaceLower: "sin lugar",
      depth: "profundidad",
      eventTypes: {
        earthquake: "sismo",
        "quarry blast": "voladura de cantera",
        explosion: "explosión",
      } as Record<string, string>,
      mapLabel: (week: number, day: number) =>
        `Mapa de la región de Puerto Rico con ${week} eventos de los últimos 7 días; ${day} en las últimas 24 horas. La lista debajo tiene todos los datos.`,
      mapCaption:
        "Círculo relleno: últimas 24 horas. Círculo vacío: 2 a 7 días. Más grande = mayor magnitud. Región: 17°–20° N, 69°–63.5° O.",
      listLabel: "Eventos, del más reciente al más antiguo",
      tsunamiFlag: " · indicador tsunami USGS: 1",
      details: "Detalles ↗",
      detailsLabel: (mag: string, time: string) => `Detalles en USGS de ${mag}, ${time}`,
      flaggedLong: (n: number) =>
        `El USGS marca ${n === 1 ? "un evento" : `${n} eventos`} con su indicador de tsunami (1). Ese indicador solo dice que fue un sismo grande en el océano: `,
      notAWarning: "no es un aviso de tsunami",
      warningsFrom:
        ". Los avisos de tsunami los emite NOAA (tsunami.gov) y aparecerían entre las alertas oficiales.",
      period: "Periodo",
      last24: (n: number) => `Últimas 24 horas (${n})`,
      last7: (n: number) => `7 días (${n})`,
      noneDay: "No hay eventos en las últimas 24 horas de la copia.",
      noneWeek: "No hay eventos en los últimos 7 días de la copia.",
      unconfirmed: "No se pudo confirmar la actividad sísmica actual.",
      perLastCopy: (at: string) => ` Según la última copia del USGS (${at}):`,
      noCopy: " No hay ninguna copia del USGS.",
      noneInWindow: (at: string) =>
        `El USGS no registra eventos en la región en las 24 horas hasta las ${at}.`,
      count: (n: number, at: string) =>
        `${n} ${n === 1 ? "evento" : "eventos"} en las 24 horas hasta las ${at}.`,
      strongest: "Mayor:",
      latest: "Más reciente:",
      flaggedShort: (n: number) =>
        `${n === 1 ? "Un evento" : `${n} eventos`} con el indicador de tsunami del USGS: no es un aviso de tsunami (explicación en el detalle).`,
      open: (n: number) => `Ver mapa y lista de sismos (7 días: ${n})`,
    },
    provenance: {
      open: "¿De dónde salen estos datos?",
      intro:
        "Horas en hora de Puerto Rico (AST, UTC−4; sin horario de verano). El sitio muestra copias guardadas; nunca llama a las fuentes desde tu navegador.",
      alertsHeading: "Alertas: Servicio Nacional de Meteorología (NWS)",
      quakesHeading: "Sismos: Servicio Geológico de EE. UU. (USGS)",
      waterHeading: "Agua: estaciones del USGS",
      lastCopy: "Última copia: ",
      neverRetrieved: "nunca obtenida",
      lastAttemptFailed: (at: string) => ` Último intento fallido: ${at}.`,
      nwsApi: "API del NWS ↗",
      usgsFeed: "Feed del USGS ↗",
      loading: "Cargando…",
    },
  },
  en: {
    title: "Puerto Rico right now",
    disclaimer: "Saved copies of official sources. This is not a warning system.",
    checking: "Checking how old the latest copy is…",
    status: {
      listLabel: "How current each source's copy is",
      nws: "NWS alerts",
      quakes: "USGS earthquakes",
      water: "USGS water",
      loading: "loading…",
      loadFailed: "could not load",
      checking: "checking…",
      lastAttemptFailed: " · last attempt failed",
      freshness: {
        CURRENT: "Up to date",
        AGING: "A bit behind",
        STALE: "Out of date",
        UNAVAILABLE: "No data",
      },
    },
    alerts: {
      title: "NWS alerts",
      severity: {
        Extreme: "Extreme",
        Severe: "Severe",
        Moderate: "Moderate",
        Minor: "Minor",
        Unknown: "Unknown",
      },
      severityLabel: "Severity:",
      where: "Where: ",
      from: "From: ",
      until: " · Until: ",
      manyMunicipios: (n: number) => `${n} municipios (listed in the details)`,
      allPuertoRico: "All of Puerto Rico",
      nwsZone: (zone: string) => `NWS zone: ${zone}`,
      details: "NWS details",
      municipiosSame: (list: string) => `Municipios (NWS SAME codes): ${list}.`,
      excerpt: "Excerpt of the official text. ",
      officialText: "Official NWS text. ",
      fullAlert: "Full alert from the NWS ↗",
      seeOthers: (n: number) => `See ${n === 1 ? "the other alert" : `the other ${n} alerts`}`,
      unconfirmed: "Could not confirm the current alert status.",
      lastCopy: (at: string) => ` The latest NWS copy is from ${at}.`,
      noCopy: " There is no NWS copy at all.",
      seeThen: (n: number) =>
        `See ${n === 1 ? "the alert" : `the ${n} alerts`} that were in effect at that time`,
      none: (at: string) => `No active NWS alerts for Puerto Rico as of the latest update (${at}).`,
      active: (n: number, at: string) =>
        `${n === 1 ? "1 active NWS alert" : `${n} active NWS alerts`} for Puerto Rico (copy from ${at}).`,
    },
    quakes: {
      title: "Earthquakes (USGS)",
      noMagnitude: "M not reported",
      noDepth: "not reported",
      noPlace: "No location",
      noPlaceLower: "no location",
      depth: "depth",
      eventTypes: {
        earthquake: "earthquake",
        "quarry blast": "quarry blast",
        explosion: "explosion",
      } as Record<string, string>,
      mapLabel: (week: number, day: number) =>
        `Map of the Puerto Rico region with ${week} events in the last 7 days; ${day} in the last 24 hours. The list below has all the details.`,
      mapCaption:
        "Filled circle: last 24 hours. Open circle: 2 to 7 days ago. Bigger = higher magnitude. Region: 17°–20° N, 69°–63.5° W.",
      listLabel: "Events, newest first",
      tsunamiFlag: " · USGS tsunami flag: 1",
      details: "Details ↗",
      detailsLabel: (mag: string, time: string) => `USGS details for ${mag}, ${time}`,
      flaggedLong: (n: number) =>
        `USGS marks ${n === 1 ? "one event" : `${n} events`} with its tsunami flag (1). That flag only means it was a large earthquake at sea: `,
      notAWarning: "it is not a tsunami warning",
      warningsFrom:
        ". Tsunami warnings come from NOAA (tsunami.gov) and would appear among the official alerts.",
      period: "Period",
      last24: (n: number) => `Last 24 hours (${n})`,
      last7: (n: number) => `7 days (${n})`,
      noneDay: "No events in the last 24 hours of the copy.",
      noneWeek: "No events in the last 7 days of the copy.",
      unconfirmed: "Could not confirm current earthquake activity.",
      perLastCopy: (at: string) => ` According to the latest USGS copy (${at}):`,
      noCopy: " There is no USGS copy at all.",
      noneInWindow: (at: string) =>
        `USGS recorded no events in the region in the 24 hours up to ${at}.`,
      count: (n: number, at: string) =>
        `${n} ${n === 1 ? "event" : "events"} in the 24 hours up to ${at}.`,
      strongest: "Strongest:",
      latest: "Most recent:",
      flaggedShort: (n: number) =>
        `${n === 1 ? "One event" : `${n} events`} with the USGS tsunami flag: not a tsunami warning (explained in the details).`,
      open: (n: number) => `See the earthquake map and list (7 days: ${n})`,
    },
    provenance: {
      open: "Where do these data come from?",
      intro:
        "Times are Puerto Rico time (AST, UTC−4; no daylight saving time). The site shows saved copies and never calls the sources from your browser.",
      alertsHeading: "Alerts: National Weather Service (NWS)",
      quakesHeading: "Earthquakes: U.S. Geological Survey (USGS)",
      waterHeading: "Water: USGS stations",
      lastCopy: "Latest copy: ",
      neverRetrieved: "never retrieved",
      lastAttemptFailed: (at: string) => ` Last failed attempt: ${at}.`,
      nwsApi: "NWS API ↗",
      usgsFeed: "USGS feed ↗",
      loading: "Loading…",
    },
  },
});
