/**
 * Page-level text: titles and descriptions for search and sharing, the 404
 * page and the error page. The product name, Datos de Puerto Rico, is not
 * translated.
 */
import { defineMessages } from "../define.ts";

export const SITE_MESSAGES = defineMessages({
  es: {
    title: "Datos de Puerto Rico",
    description:
      "Los 78 municipios de Puerto Rico en cifras públicas oficiales: Censo, empleo, fondos federales y FEMA, más alertas, sismos y agua del NWS y el USGS. Cada dato dice de dónde sale.",
    shareImageAlt:
      "Mapa de los 78 municipios de Puerto Rico bajo el nombre Datos de Puerto Rico, sin cifras.",
    notFound: {
      eyebrow: "Error 404",
      title: "Página no encontrada",
      text: "Esta dirección no existe en el sitio. Los datos de los 78 municipios están en la página principal.",
      home: "Volver al inicio",
    },
    error: {
      title: "Algo salió mal",
      text: "No se pudo mostrar esta página. Vuelve a cargarla; si el problema sigue, inténtalo más tarde.",
      reload: "Volver a cargar",
      home: "Ir al inicio",
    },
  },
  en: {
    title: "Datos de Puerto Rico (English)",
    description:
      "Puerto Rico's 78 municipios in official public figures: Census, jobs, federal funds and FEMA, plus NWS alerts and USGS earthquake and water data. Every figure says where it comes from.",
    shareImageAlt:
      "Map of Puerto Rico's 78 municipios under the name Datos de Puerto Rico, with no figures.",
    notFound: {
      eyebrow: "Error 404",
      title: "Page not found",
      text: "This address does not exist on the site. Data for all 78 municipios is on the home page.",
      home: "Back to the home page",
    },
    error: {
      title: "Something went wrong",
      text: "This page could not be shown. Reload it; if the problem continues, try again later.",
      reload: "Reload",
      home: "Go to the home page",
    },
  },
});
