# Licencias de los datos

**El software y los datos tienen licencias distintas.**

- El **código** de este repositorio (scripts, componentes, pruebas, configuración)
  está bajo la licencia MIT. Ver [LICENSE](LICENSE).
- Los **datos** son de las agencias que los publican. La licencia MIT **no** los
  cubre. Cada fuente mantiene sus propios términos, que se resumen abajo con el
  enlace a la evidencia oficial.

Esta versión solo incluye fuentes del gobierno federal de EE. UU. cuyos términos
están escritos y permiten redistribuir los datos. Ningún conjunto de datos del
gobierno de Puerto Rico está incluido, porque sus derechos de redistribución todavía
no están confirmados por escrito.

Esto no es asesoría legal. Si vas a reusar los datos, lee los términos de cada
fuente.

## Resumen

| Fuente | Qué hay en el repositorio | Términos | Qué pide |
| --- | --- | --- | --- |
| Censo, ACS 2019–2023 y 2020–2024 | Copia de las filas de Puerto Rico del Summary File (`data/raw/census`), estimados normalizados y medidas generadas | Obra del gobierno federal, sin derechos de autor en EE. UU. (17 U.S.C. §105) | Citar al Censo como fuente; no sugerir que el Censo respalda el proyecto |
| Censo, TIGER/Line® 2024 | Los 78 municipios del archivo nacional de condados (`data/raw/geo`) y su versión simplificada | Obra del gobierno federal, sin derechos de autor en EE. UU. (17 U.S.C. §105) | Citar al Censo; mostrar en un lugar visible el aviso de marca registrada de TIGER/Line®; aclarar que los límites son para fines estadísticos |
| NHTSA, FARS 2022–2023 | Muertes por municipio y la tasa calculada (`src/data/pr/municipios.json`) | Etiqueta de dominio público de EE. UU. en data.gov | Citar a NHTSA (buena práctica) |
| CDC, BRFSS 2023 | Tres por cientos para toda la isla (`src/data/pr/layers.ts`) | Licencia «Public Domain» en data.cdc.gov | Citar a los CDC |
| NWS (NOAA) | Alertas activas normalizadas, con extractos cortos (`data/current/nws.json`) | Dominio público (aviso legal del NWS) | No reclamarla como propia; no sugerir respaldo del NWS/NOAA; no modificarla y presentarla como oficial (los extractos se marcan como extractos) |
| USGS | Sismos de la región, normalizados (`data/current/usgs-earthquakes.json`) | Dominio público de EE. UU. | Dar crédito al U.S. Geological Survey; no usar su identificador |
| USGS (Water Data for the Nation) | Mediciones de agua de estaciones, normalizadas (`data/current/usgs-water.json`, `usgs-water-series.json`) | Dominio público de EE. UU. | Dar crédito al U.S. Geological Survey; advertir que los datos provisionales pueden revisarse; no usar su identificador |
| FEMA, OpenFEMA | Un extracto público de las respuestas de la API, solo con los campos que usa el sitio (`data/source/fema`; no es la respuesta original), y los totales y proyectos generados (`data/generated/fema-pr.json`, `data/generated/fema-projects/`) | Términos y condiciones de OpenFEMA | Citar el dataset con su versión y la fecha de obtención; incluir el aviso textual de FEMA; no usar logos de FEMA ni DHS; no reidentificar personas |
| Tesoro, USAspending | Las respuestas de la API tal cual (`data/raw/usaspending`) y los totales generados (`data/generated/usaspending-pr.json`) | Datos abiertos según la página About de USAspending, sujetos a la limitación de Dun & Bradstreet | Citar USAspending.gov con la fecha de acceso; no diseminar en bloque nombres ni direcciones de entidades (el proyecto no los guarda) |
| BLS, LAUS | Las respuestas de la API tal cual (`data/raw/bls/laus`) y las series mensuales generadas (`data/generated/bls-laus.json`) | Dominio público, según la página de derechos de autor de BLS; términos de servicio de la API | Citar a BLS; decir la fecha en que se obtuvieron los datos; incluir el aviso textual de BLS; no usar el emblema ni el logo de BLS |

## Censo: American Community Survey

- **Evidencia:** la documentación técnica de TIGER/Line 2024 (cap. 1) dice que las
  obras del gobierno federal no tienen derechos de autor y pide citar al Censo. El
  proyecto no usa la API del Censo; si se usara, sus
  [términos](https://www.census.gov/data/developers/about/terms-of-service.html)
  piden decir que el producto usa la API pero no está respaldado ni certificado por
  el Censo.
- **Cita que usa el sitio:** «Fuente: U.S. Census Bureau, American Community Survey
  (Puerto Rico Community Survey), estimados de 5 años. Este proyecto usa datos del
  Censo, pero el Censo no lo respalda ni lo certifica.»

## Censo: TIGER/Line® 2024

- **Evidencia:** [documentación técnica TIGER/Line 2024](https://www2.census.gov/geo/pdfs/maps-data/data/tiger/tgrshp2024/TGRSHP2024_TechDoc.pdf),
  cap. 1.
- **Aviso:** TIGER/Line® es una marca registrada de la Oficina del Censo de EE. UU.
  El aviso aparece al pie de la página principal del sitio.
- Los límites son para fines estadísticos. No son descripciones legales de
  terrenos.

## NHTSA: FARS

- **Evidencia:** la [ficha de FARS en data.gov](https://catalog.data.gov/dataset/fatality-analysis-reporting-system-fars)
  publica el conjunto con la etiqueta de dominio público de EE. UU.
- **Cita que usa el sitio:** «Fuente: NHTSA, Fatality Analysis Reporting System
  (FARS), archivos de Puerto Rico 2022 y 2023.»

## CDC: BRFSS

- **Evidencia:** los metadatos del [conjunto en data.cdc.gov](https://data.cdc.gov/Behavioral-Risk-Factors/Behavioral-Risk-Factor-Surveillance-System-BRFSS-P/dttw-5yxu)
  indican licencia «Public Domain».
- **Cita que usa el sitio:** «Fuente: CDC, Behavioral Risk Factor Surveillance
  System 2023.»

## BLS: LAUS

- **Evidencia:** la [página de derechos de autor de BLS](https://www.bls.gov/opub/copyright-information.htm)
  dice que lo que BLS publica es de dominio público y se puede usar sin permiso,
  citando a BLS como fuente; el emblema de BLS es marca registrada. Los
  [términos de servicio de la API](https://www.bls.gov/developers/termsOfService.htm)
  (modificados el 30 de agosto de 2023) piden citar la fecha en que se obtuvieron
  los datos, incluir el aviso de abajo, no modificar ni falsear el contenido
  atribuyéndolo a BLS, y no usar el logo. Leídos el 6 de octubre de 2026 (hora local).
- **Aviso (textual, en inglés):** «BLS.gov cannot vouch for the data or analyses
  derived from these data after the data have been retrieved from BLS.gov.» Está en
  la cita, en «¿De dónde sale este dato?» y en `data/generated/bls-laus.json`.
- **Fecha de obtención:** 7 de octubre de 2026 (UTC), en
  `data/raw/bls/laus/manifest.json` y en el sitio.
- **Cita que usa el sitio:** «Fuente: U.S. Bureau of Labor Statistics, Local Area
  Unemployment Statistics (LAUS), datos mensuales sin ajuste estacional.»

## USAspending (Departamento del Tesoro)

- **Evidencia:** la página [About de USAspending.gov](https://www.usaspending.gov/about),
  sección *Licensing*, leída el 6 de octubre de 2026: los datos del sitio se pueden
  copiar, adaptar, redistribuir o usar con o sin fines comerciales, sujeto a la
  [limitación de uso de datos de Dun & Bradstreet](https://www.usaspending.gov/db_info).
- **La limitación de D&B** cubre el nombre, la dirección, la ciudad, el estado, el
  país, el condado y el ZIP de las entidades: pide atribución a D&B y prohíbe
  diseminarlos en bloque. También prohíbe extraer contenido del sitio web con
  robots. Este proyecto usa la API oficial, y **no guarda ni publica nombres,
  direcciones ni identificadores de recipientes**: solo montos agregados por
  municipio, agencia y programa, y números de adjudicación de CDBG.
- **Cita que usa el sitio:** «Fuente: USAspending.gov, U.S. Department of the
  Treasury, Bureau of the Fiscal Service, https://www.usaspending.gov.», con la
  fecha de obtención.
- **Sin afiliación:** el Tesoro no respalda este proyecto.

## FEMA: OpenFEMA

- **Evidencia:** los [términos y condiciones de OpenFEMA](https://www.fema.gov/about/openfema/terms-conditions)
  (actualizados el 22 de enero de 2025; leídos el 7 de octubre de 2026). Los datos
  de la API no tienen controles sobre su uso. Piden:
  - citar el endpoint con su versión, y la fecha y hora en que se obtuvieron;
  - decir textualmente: «This product uses the Federal Emergency Management
    Agency’s OpenFEMA API, but is not endorsed by FEMA. The Federal Government or
    FEMA cannot vouch for the data or analyses derived from these data after the
    data have been retrieved from the Agency's website(s).»;
  - no usar logos ni sellos de FEMA o DHS sin permiso escrito;
  - no modificar ni falsear el contenido y seguir diciendo que es de FEMA;
  - no reidentificar ni intentar reidentificar a personas, ni publicar datos que
    puedan identificarlas.
- **Riesgo anotado:** FEMA puede pedir que se deje de usar los datos y se destruyan
  las copias. En un repositorio público eso no se puede deshacer del todo; si FEMA lo
  pidiera, el proyecto quitaría los datos. Por eso la copia guardada es solo de
  Puerto Rico y, para hogares, sin ciudad ni código postal.
- **Cita que usa el sitio:** «Fuente: Federal Emergency Management Agency (FEMA),
  OpenFEMA», con el dataset, la versión, la fecha de obtención y el aviso de arriba.

## NWS y USGS (Ahora en Puerto Rico)

- **NWS:** el [aviso legal](https://www.weather.gov/disclaimer) dice que la
  información es de dominio público y se puede usar para cualquier fin lícito, sin
  reclamarla como propia, sin sugerir respaldo del NWS/NOAA y sin modificarla y
  presentarla como material oficial. La [documentación de la API](https://www.weather.gov/documentation/services-web-api)
  pide un User-Agent que identifique la aplicación y no reintentar más de una vez por
  minuto. Leídos el 7 de octubre de 2026.
- **USGS:** la [página de derechos y crédito](https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits)
  dice que los datos del USGS son de dominio público y pide dar crédito al U.S.
  Geological Survey; su identificador es marca registrada. Leída el 7 de octubre de
  2026.
- **USGS, agua:** la misma página (leída el 10 de octubre de 2026) cubre los datos de
  agua. La [declaración sobre datos provisionales](https://waterdata.usgs.gov/provisional-data-statement/)
  dice que los datos provisionales pueden revisarse y no tienen la aprobación final
  del USGS; el sitio lo advierte junto a las mediciones. Todas las series publicadas
  son de la agencia USGS. La [página de claves](https://api.waterdata.usgs.gov/docs/ogcapi/keys/)
  explica que una clave da límites más altos; el proyecto no la necesita.

## Si propones una fuente nueva

Una fuente entra solo cuando sus términos permiten, por escrito, mostrar y
redistribuir los datos. Que algo sea del gobierno no basta. Ver
[CONTRIBUTING.md](CONTRIBUTING.md#datos).

---

**English:** The MIT license covers the code only. The data stays under its
publishers' terms: U.S. Census Bureau ACS and TIGER/Line® (federal works, no U.S.
copyright; cite the Census Bureau and show the TIGER/Line® trademark notice), NHTSA
FARS (U.S. Public Domain label on data.gov), CDC BRFSS (Public Domain on
data.cdc.gov) and BLS LAUS (public domain per the BLS copyright page; the BLS API
terms require citing the retrieval date and the notice "BLS.gov cannot vouch for
the data or analyses derived from these data after the data have been retrieved
from BLS.gov."; no BLS logo or emblem) and USAspending.gov (U.S. Department of the
Treasury: copy, adapt and redistribute, subject to the Dun & Bradstreet limitation;
this project stores no recipient names, addresses or identifiers) and OpenFEMA
(FEMA terms: cite dataset, version and retrieval date; include FEMA's notice that
it does not endorse the product; no FEMA or DHS logos; no re-identification). No Puerto Rico government datasets are included in this version.
This is not legal advice.
