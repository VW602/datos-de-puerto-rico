# Fuentes de datos

De dónde sale cada cifra del sitio, qué periodo cubre y qué le falta. La versión
para programas está en [`data/registry/sources.json`](data/registry/sources.json).
Los términos de uso de cada fuente están en [DATA_LICENSES.md](DATA_LICENSES.md).

## Resumen

| Fuente | Qué cubre | Periodo | Nivel | Verificado |
| --- | --- | --- | --- | --- |
| Censo, ACS 5 años | Población, edad, ingreso, plomería | 2019–2023 | Municipio | 78/78 |
| Censo, ACS 5 años | Pobreza, plan médico, empleo, escuela, vivienda, hogares | 2020–2024 | Municipio | 78/78 |
| Censo, TIGER/Line® | Límites de los 78 municipios | Edición 2024 | Municipio | 78/78 |
| NHTSA, FARS | Muertes de tránsito | 2022–2023 | Municipio | 78/78 |
| CDC, BRFSS | Obesidad e inactividad física | 2023 | Toda la isla | Sí |
| BLS, LAUS | Desempleo mensual, fuerza laboral, empleo | Mensual (ene 2024 – ago 2026) | Municipio | 78/78 |

**Verificado** quiere decir que se tomó la publicación oficial y se reprodujeron las
cifras del sitio, municipio por municipio. La verificación se hizo el 1 de octubre
de 2026.

## Reglas

- **Sin dato no es cero.** Si una fuente no publica una cifra para un municipio, el
  sitio la deja vacía. Un cero solo aparece cuando la fuente publica un cero.
- **Una fuente entra solo con términos escritos** que permitan mostrar y
  redistribuir sus datos. Que algo sea del gobierno no basta.
- **El sitio no consulta ningún servicio al abrirse.** Todo sale de archivos del
  repositorio.

## Cómo llegan los datos del Censo al sitio

1. `npm run data:census:update` descarga los archivos oficiales del Censo
   (Table-Based Summary File) y guarda, sin tocarlas, las 78 filas de Puerto Rico de
   cada tabla, con un SHA-256 que permite comprobar que no cambiaron.
2. `npm run data:census:generate`, sin internet, revisa esos códigos, comprueba que
   estén los 78 municipios y ninguno más, convierte los códigos especiales del Censo
   en datos vacíos (nunca en 0), guarda cada margen de error y calcula las medidas.
3. `npm run data:check` falla si lo que el sitio usa no coincide con lo que sale de
   la copia guardada.

Los detalles técnicos están en [data/README.md](data/README.md).

---

### Censo: población, edad, ingreso y plomería (ACS 2019–2023)

- **Qué es:** cuánta gente vive en cada municipio, cuántas son mujeres, menores de
  18 o de 65 años o más, el ingreso mediano del hogar, el ingreso por persona, las
  viviendas sin plomería completa y la pirámide de edad.
- **Quién lo publica:** la Oficina del Censo de EE. UU., con la American Community
  Survey (en Puerto Rico, Puerto Rico Community Survey).
- **Periodo:** estimado de 5 años, 2019–2023. Los dólares están ajustados a 2023.
- **Cómo lo usamos:** copiamos los valores de las tablas oficiales y calculamos
  algunos por cientos. Cada medida dice de qué variable sale (por ejemplo, ingreso
  mediano = `B19013_001E`); la lista completa está en el `fieldMap` del registro.
- **Sin plomería completa:** sale de la tabla B25047. Es el por ciento de **todas**
  las viviendas, incluidas las vacías, que el Censo cuenta como «sin instalaciones de
  plomería completas»: les falta al menos una de esas instalaciones, no
  necesariamente todas.
- **Margen de error:** se guarda junto a cada estimado. La ficha lo muestra cuando el
  Censo lo publica para esa cifra (por ejemplo, el ingreso mediano). Los por cientos
  que el proyecto calcula no traen margen propio.
- **Fuente:** [Summary File del ACS 2019–2023](https://www2.census.gov/programs-surveys/acs/summary_file/2023/table-based-SF/data/5YRData/).

### Censo: pobreza, empleo, educación, vivienda y hogares (ACS 2020–2024)

- **Qué es:** pobreza, sin plan médico, desempleo, escuela superior, bachillerato,
  sin internet, discapacidad, renta mediana, valor de la vivienda, edad mediana,
  asistencia nutricional (PAN), viviendas vacías, hogares sin carro, sin computadora
  y con hacinamiento.
- **Quién lo publica:** la Oficina del Censo de EE. UU.
- **Periodo:** estimado de 5 años, 2020–2024. Los dólares están ajustados a 2024.
- **Cómo lo usamos:** calculamos un por ciento con el universo de cada tabla. Por
  ejemplo, la pobreza se mide sobre las personas a quienes se les determina el
  estado de pobreza, y el plan médico y la discapacidad sobre la población civil no
  institucionalizada.
- **Ojo:** en Maricao y Culebra el desempleo es 0. Es el estimado publicado (0, con
  un margen de ±15 personas), no un dato que falte. En Puerto Rico, la pregunta de
  SNAP del ACS recoge el PAN.
- **Fuente:** [Summary File del ACS 2020–2024](https://www2.census.gov/programs-surveys/acs/summary_file/2024/table-based-SF/data/5YRData/).

### Censo: límites de los 78 municipios (TIGER/Line® 2024)

- **Qué es:** el contorno de cada municipio que se dibuja en el mapa.
- **Quién lo publica:** la Oficina del Censo de EE. UU., en los archivos TIGER/Line®
  2024 de condados y equivalentes (`tl_2024_us_county.zip`).
- **Cómo lo usamos:** del archivo nacional se guardan, sin tocarlos, los 78
  municipios de Puerto Rico, con un SHA-256. Luego se simplifican para que el mapa
  cargue rápido: cada borde entre dos municipios se simplifica una sola vez, así los
  vecinos comparten exactamente la misma línea, sin huecos ni encimas. La tolerancia
  es de unos 11 metros y las coordenadas se guardan con unos 1.1 metros de
  precisión. Ningún municipio cambia más de 0.06% de su área.
- **Islas:** se conservan todas. Según TIGER/Line, Mona y Desecheo son parte de
  Mayagüez, y así aparecen. Culebra y Vieques se dibujan con sus aguas costeras.
- **Limitaciones:** los límites son para fines estadísticos y no son descripciones
  legales de terrenos. Incluyen las aguas costeras, por eso la costa del mapa no
  sigue exactamente la orilla.
- **Fuente:** [TIGER/Line 2024, condados](https://www2.census.gov/geo/tiger/TIGER2024/COUNTY/tl_2024_us_county.zip).

### NHTSA: muertes de tránsito (FARS 2022–2023)

- **Qué es:** muertes en choques por cada 100,000 habitantes, promedio de 2022 y
  2023, y el total de muertes de los dos años.
- **Quién lo publica:** la Administración Nacional de Seguridad del Tráfico en las
  Carreteras (NHTSA), en su sistema FARS. Puerto Rico se publica en archivos aparte
  de los nacionales.
- **Cómo lo usamos:** sumamos las muertes de 2022 (271 en toda la isla) y 2023
  (307), y las dividimos entre 2 y entre la población del ACS 2019–2023.
- **Ceros:** Maricao, Sabana Grande, Guayanilla, Culebra y Las Marías tienen 0. FARS
  registra todos los choques fatales, así que son ceros reales.
- **Limitaciones:** la población (2019–2023) no es del mismo periodo que las muertes
  (2022–2023).
- **Fuente:** [FARS 2023, Puerto Rico](https://static.nhtsa.gov/nhtsa/downloads/FARS/2023/Puerto%20Rico/FARS2023PuertoRicoCSV.zip)
  y [2022](https://static.nhtsa.gov/nhtsa/downloads/FARS/2022/Puerto%20Rico/FARS2022PuertoRicoCSV.zip).

### CDC: obesidad e inactividad física (BRFSS 2023)

- **Qué es:** un solo por ciento de adultos para toda la isla. Obesidad 36.0%,
  inactividad física en el tiempo libre 52.1%.
- **Quién lo publica:** los CDC, en el
  [conjunto de datos BRFSS](https://data.cdc.gov/Behavioral-Risk-Factors/Behavioral-Risk-Factor-Surveillance-System-BRFSS-P/dttw-5yxu).
- **Limitaciones:** no hay cifra por municipio. El mapa pinta toda la isla de un
  color y lo dice.

### BLS: desempleo mensual (LAUS)

- **Qué es:** la tasa de desempleo de cada municipio, mes a mes: el por ciento de
  la fuerza laboral que no tiene empleo y lo está buscando. Además, la fuerza
  laboral, las personas empleadas y las desempleadas. También la serie de Puerto
  Rico completo, para comparar.
- **Quién lo publica:** la Oficina de Estadísticas Laborales de EE. UU. (U.S.
  Bureau of Labor Statistics, BLS), en su programa
  [Local Area Unemployment Statistics](https://www.bls.gov/lau/) (LAUS).
- **Cómo lo usamos:** se pide a la
  [API pública oficial](https://api.bls.gov/publicAPI/v1/timeseries/data/) cada
  serie LAUS sin ajuste estacional: `LAUCN` + código FIPS del municipio + ocho ceros
  + la medida (03 tasa, 04 desempleados, 05 empleados, 06 fuerza laboral). Puerto
  Rico completo es `LAUST720000000000003`. Las respuestas se guardan tal cual en
  `data/raw/bls/laus/` con su SHA-256. El sitio muestra los valores como BLS los
  publica; las diferencias con el mes anterior y con el mismo mes del año anterior
  son una resta que hace el proyecto.
- **Qué mes se ve:** el último que BLS publica para las 316 series (4 medidas ×
  Puerto Rico y 78 municipios). No está fijo en el código: si una serie trae un mes
  que las demás no tienen, la generación falla. Hoy: agosto de 2026.
- **Preliminar:** BLS marca el mes más reciente como preliminar (nota «P») y lo
  revisa al mes siguiente. El sitio dice «Preliminar» junto a la cifra.
- **Revisiones:** cada año, a principios de año, BLS revisa los meses de los años
  recientes. Al actualizar, el proyecto reemplaza la copia completa.
- **Historia guardada:** desde enero del año antepasado (hoy, enero de 2024): lo
  justo para el mes anterior, el cambio de 12 meses y una línea de 24 meses.
- **Sin dato:** si BLS no publica un valor, o lo publica como texto, queda vacío
  con su razón. Nunca se vuelve 0. En la copia actual no falta ninguno.
- **Limitaciones:** son estimados de un modelo, no un conteo, y BLS no publica
  margen de error por municipio. Sin ajuste estacional: para ver la tendencia
  conviene comparar con el mismo mes del año anterior. La tasa del Censo (ACS, 5
  años) mide otra cosa en otro periodo y no tiene por qué coincidir.
- **Aviso que piden los términos de la API:** «BLS.gov cannot vouch for the data or
  analyses derived from these data after the data have been retrieved from
  BLS.gov.»

---

## Cómo se añade una fuente nueva

Ver [CONTRIBUTING.md](CONTRIBUTING.md#datos). Toda fuente nueva necesita enlace
oficial, agencia, periodo, nivel geográfico, términos de uso escritos y la
transformación. «Lo encontré en internet» no es una fuente.
