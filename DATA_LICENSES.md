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

## Si propones una fuente nueva

Una fuente entra solo cuando sus términos permiten, por escrito, mostrar y
redistribuir los datos. Que algo sea del gobierno no basta. Ver
[CONTRIBUTING.md](CONTRIBUTING.md#datos).

---

**English:** The MIT license covers the code only. The data stays under its
publishers' terms: U.S. Census Bureau ACS and TIGER/Line® (federal works, no U.S.
copyright; cite the Census Bureau and show the TIGER/Line® trademark notice), NHTSA
FARS (U.S. Public Domain label on data.gov) and CDC BRFSS (Public Domain on
data.cdc.gov). No Puerto Rico government datasets are included in this version.
This is not legal advice.
