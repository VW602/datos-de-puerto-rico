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
| NWS (NOAA) | Alertas activas para Puerto Rico | La última actualización (el sitio dice la hora y la antigüedad) | Municipio por código SAME; si no, zona del NWS | Sí |
| USGS | Sismos en la región de Puerto Rico | Últimos 7 días hasta la última actualización | Puntos (no municipios) | Sí |
| FEMA, OpenFEMA | Declaraciones, Asistencia Pública, asistencia a hogares, mitigación | Todos los desastres con registros para Puerto Rico | Municipio, con estados geográficos | 78/78 |
| Tesoro, USAspending | Obligaciones, desembolsos y adjudicaciones federales | Año fiscal federal 2026 (y 4 anteriores) | Municipio, con cuatro estados geográficos | 78/78 |

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

### USAspending: fondos federales

- **Qué es:** el dinero federal que USAspending registra en Puerto Rico en un año
  fiscal federal (1 de octubre a 30 de septiembre): obligaciones, desembolsos
  reportados y número de adjudicaciones. Hoy: AF 2026, con AF 2022–2026 para
  comparar. Datos de USAspending al 7 de octubre de 2026; copia obtenida el 7 de octubre de 2026.
- **Quién lo publica:** el Departamento del Tesoro de EE. UU. (Bureau of the
  Fiscal Service), en [USAspending.gov](https://www.usaspending.gov/), con datos que
  reportan las agencias (contratos en FPDS, asistencia en FABS, cuentas en File C).
- **Cómo lo usamos:** solo la [API oficial](https://api.usaspending.gov/docs/endpoints),
  nunca el sitio web. Unos 450 pedidos, uno a la vez y con pausas; cada respuesta
  se guarda tal cual en `data/raw/usaspending/` con su SHA-256, el pedido exacto y
  la hora. La huella del plan de pedidos queda en el manifiesto.
- **Qué se suma, a qué nivel, en qué periodo y con qué campo:**
  - *Obligaciones:* `federal_action_obligation` de cada transacción de una
    adjudicación primaria con fecha de acción dentro del año fiscal, por lugar
    principal de ejecución. Nivel: transacción. Puede haber negativos
    (desobligaciones); se conservan.
  - *Desembolsos:* `total_outlays`, los pagos acumulados que las agencias reportan
    para cada adjudicación con actividad en el año. Nivel: adjudicación. Cubren
    toda la vida de la adjudicación, así que **nunca se suman ni se restan** con
    las obligaciones de transacción. Se comparan con la obligación total de esas
    mismas adjudicaciones. Reportados hasta el 31 de agosto de 2026.
  - *Adjudicaciones:* número de adjudicaciones primarias con actividad en el año.
- **Obligado no es gastado.** Obligado: el gobierno federal se comprometió a pagar.
  Desembolsado: la agencia reporta que pagó. Ninguno de los dos dice que quien lo
  recibe lo gastó. USAspending no publica «asignado» ni «gastado» por municipio, y
  el sitio no los calcula.
- **Lugar, no sede.** Se usa el lugar principal de ejecución, nunca la dirección de
  quien recibe el dinero. Cada dólar queda en uno de cuatro estados:

  | Estado | Qué entra | ¿En el mapa? |
  | --- | --- | --- |
  | Atribuible a un municipio | Contratos con municipio (FPDS: donde se hace el trabajo) y asistencia a personas con municipio (tipo de negocio P de FABS) | Sí |
  | Registrado en un municipio, sin certeza | Otra asistencia con municipio: la reporta quien la recibe y puede ser una oficina que sirve a toda la isla | No |
  | Todo Puerto Rico | Asistencia para Puerto Rico sin municipio (en FABS, el formato de lugar para Puerto Rico sin condado es «State-wide») | No |
  | Sin municipio registrado | Contratos en Puerto Rico sin municipio | No |

  Los cuatro suman el total de Puerto Rico de cada año (probado, con tolerancia de
  un centavo más medio centavo por monto sumado). Nada se reasigna por
  concentración ni por sede: lo incierto se queda incierto.
- **San Juan.** USAspending registra en San Juan $13.45 mil millones en el AF 2026, pero solo
  $1.81 mil millones es atribuible al municipio. El resto incluye programas que se
  administran para toda la isla desde oficinas en San Juan (por ejemplo Medicare,
  Título I y la Asistencia Pública de FEMA). El sitio muestra las dos cifras por
  separado y pinta solo la atribuible.
- **Sin doble conteo.** El generador comprueba que cada desglose suma su parte: los
  tipos de adjudicación suman el total de Puerto Rico y el de cada municipio; los
  programas suman la asistencia; las agencias suman los contratos; los municipios
  más la fila sin municipio suman Puerto Rico a nivel de adjudicación. Una página
  o un municipio repetido hace fallar la generación.
- **Sin dato:** si USAspending no registra nada para un municipio, queda vacío con
  su razón. Un desembolso no reportado queda vacío, no $0. Un $0 solo aparece
  cuando la fuente suma $0.
- **Montos con signo.** Una obligación del año puede ser negativa: hubo más
  desobligaciones y ajustes que obligaciones nuevas. El sitio la muestra con su
  signo (−$1.2 millones), nunca como $0 ni como el valor positivo más bajo. En el
  mapa, los positivos usan la escala Arena → Añil; $0 tiene su trama de puntos; un
  neto negativo, su trama de líneas horizontales; y lo que falta, el rayado de
  «sin dato». En «Los 78, de mayor a menor», el $0 y los negativos quedan al
  final, en su propia zona. Ninguna de esas tramas quiere decir «mejor» o «peor».
  Los desembolsos también pueden traer ajustes negativos y se tratan igual.
- **CDBG-DR.** Las subvenciones CDBG-DR y CDBG-MIT de HUD a Puerto Rico muestran la
  diferencia: B-18-DP-72-0002: obligado $8.29 mil millones, desembolsado $644.3 millones, B-18-DP-72-0001: obligado $8.22 mil millones, desembolsado $4.10 mil millones, B-18-DE-72-0001: obligado $1.93 mil millones, desembolsado $171.3 millones.
- **Recipientes:** el proyecto no guarda nombres, direcciones ni identificadores de
  quien recibe el dinero (ver la limitación de Dun & Bradstreet en DATA_LICENSES.md).
- **No hay cifra por persona.** Son dólares nominales. Dividir entre población
  requiere escoger una fuente y un periodo de población, y eso no se ha hecho.
- **Limitaciones:** el año fiscal recién cerrado puede seguir subiendo semanas
  después (las agencias reportan con atraso; Defensa, 90 días). La asistencia
  incierta incluye dinero que sí es local (por ejemplo, subvenciones a un
  municipio): el sitio prefiere no asignarla a asignarla mal. Los contratos usan el lugar que
  FPDS registra como donde se hace el trabajo; si un contrato reporta una oficina,
  el sitio no lo puede detectar.

### FEMA: recuperación y desastres (OpenFEMA)

- **Qué es:** lo que FEMA publica en OpenFEMA sobre los desastres de Puerto Rico,
  separado por programa: declaraciones, Asistencia Pública (proyectos), asistencia
  a hogares del programa de Individuos y Hogares (IHP) y Asistencia para la
  Mitigación de Riesgos (HMA). El sitio permite ver todos los desastres juntos o
  uno solo. La lista de desastres sale de la fuente, no está fija en el código.
- **Quién lo publica:** la Agencia Federal para el Manejo de Emergencias (FEMA), en
  [OpenFEMA](https://www.fema.gov/about/openfema/data-sets).
- **Versiones fijadas:** DisasterDeclarationsSummaries v2 (FEMA lo actualizó el 8 de octubre de 2026); PublicAssistanceFundedProjectsDetails v2 (FEMA lo actualizó el 6 de octubre de 2026); HazardMitigationAssistanceProjects v4 (FEMA lo actualizó el 31 de agosto de 2026); HousingAssistanceOwners v2 (FEMA lo actualizó el 7 de octubre de 2026); HousingAssistanceRenters v2 (FEMA lo actualizó el 7 de octubre de 2026). Copia obtenida el 8 de octubre de 2026.
- **Cómo lo usamos:** solo la API OpenFEMA, nunca páginas web. Cada dataset se pide
  completo para Puerto Rico, en páginas de 10,000 con orden estable, y se comprueba
  que los registros recibidos sean exactamente los que OpenFEMA dice que hay. Las
  respuestas exactas de la API se quedan solo en la copia local (`.cache/fema/raw`,
  fuera del repositorio). El repositorio guarda un **extracto público**
  (`data/source/fema/`): los mismos registros y valores, pero solo con los campos de
  una lista permitida (`scripts/fema/extract.ts`). No es la respuesta original; el
  manifiesto guarda el SHA-256 de la respuesta original junto al del extracto.
- **Qué quiere decir cada monto (nunca son lo mismo):**
  - *Costo estimado del proyecto* (`projectAmount`, Asistencia Pública): costo total
    estimado, sin costos administrativos. No es lo obligado.
  - *Obligado federal* (`federalShareObligated`): la parte federal que FEMA obligó
    para el proyecto aprobado. Es la cifra del mapa.
  - *Total obligado* (`totalObligated`): la parte federal más los costos
    administrativos del recipiente y del subrecipiente.
  - *Monto aprobado bajo IHP* (`totalApprovedIhpAmount`): lo que FEMA aprobó bajo
    IHP, dueños más inquilinos. No es lo pagado. Los *solicitantes aprobados* son
    `approvedForFemaAssistance`; los *registros válidos* (`validRegistrations`) son
    registros aceptados, no aprobados.
  - *Mitigación* (`federalShareObligated` de HMA): parte federal obligada, sin costos
    administrativos.
  - OpenFEMA no publica lo **gastado** en estos datasets, y el sitio nunca dice
    «gastado».
- **Lugar.** Se usa el municipio que FEMA indica, por nombre y código a la vez:

  | Estado | Qué entra | ¿En el mapa? |
  | --- | --- | --- |
  | En un municipio | Mitigación: municipio principal del proyecto. Hogares: municipio de los registros. Nombre y código coinciden | Sí |
  | Solicitante ubicado en un municipio | Asistencia Pública: FEMA registra el municipio de quien solicita, no necesariamente el de la obra | Sí, como «por municipio del solicitante» |
  | Varios municipios, sin certeza | Un proyecto de mitigación con varios municipios, o nombre y código que no coinciden | No |
  | Todo Puerto Rico | FEMA dice «Statewide» (o «PUERTO RICO» / «ISLANDWIDE» en los municipios de un proyecto de mitigación) | No |
  | Sin municipio | FEMA no indica municipio | No |

  Los estados suman el total de Puerto Rico de cada medida y cada desastre (probado).
  Una medida nunca mezcla «en un municipio» con «solicitante ubicado en» (probado).
- **«Statewide» con el código de San Juan.** En Asistencia Pública, la mayoría de
  los proyectos «Statewide» traen el código de condado 127, que es San Juan. El sitio
  usa el nombre: esos proyectos son de todo Puerto Rico y nunca se le asignan a San
  Juan ni se reparten entre municipios. De $39.04 mil millones obligados en todos los
  desastres, $30.39 mil millones son «Statewide» y $8.65 mil millones están en un municipio.
- **Asistencia Pública: el municipio es el del solicitante.** En este dataset, el
  campo `county` es la ubicación de quien solicita, no necesariamente el lugar de la
  obra. Por eso el sitio nunca lo llama «dinero del municipio» ni «proyectos en» el
  municipio: dice «de solicitantes ubicados en». Decisión de mapa: se mantiene el
  mapa de Asistencia Pública, con el nombre «por municipio del solicitante», porque
  dice exactamente lo que la fuente sostiene (a quién se le obligó, según dónde está)
  y quitarlo escondería el dato; la ficha y la tabla repiten la aclaración. El sitio
  no deduce nada de direcciones: no usa el dataset de solicitantes, que las trae.
- **Estado de los proyectos.** El dataset PublicAssistanceProjectsStatus aparece en
  el catálogo de OpenFEMA, pero su API y sus archivos respondían «404» al construir
  este pipeline. Por eso el sitio no publica un estado de proyecto propio: muestra el
  paso del proceso (`projectProcessStep`) tal como lo escribe FEMA, en inglés.
- **Desastres raros.** Algunos registros de hogares de Puerto Rico están bajo
  desastres declarados para otro estado (4337, 1561): se muestran con su número y sin
  título. Los proyectos de mitigación de programas que no dependen de un desastre
  (PDM, FMA) van aparte, aunque su sistema les ponga un número (9008, 9082).
- **Sin dato:** un monto que FEMA deja vacío no suma y queda contado; nunca se
  vuelve $0. Los ajustes negativos se conservan con su signo.
- **Privacidad:** de hogares solo se usan las filas que FEMA ya publica agregadas, y
  se piden **sin ciudad ni código postal**. El sitio solo muestra totales por
  municipio y desastre. No se usan datos por propiedad ni por hogar, ni nombres.
  Los títulos libres de los proyectos de Asistencia Pública (`applicationTitle`)
  no se publican, porque a veces nombran familias junto a un camino o kilómetro; la
  tabla muestra la categoría de daño de FEMA.
- **FEMA no se suma con USAspending.** Son dos publicaciones oficiales que pueden
  contar el mismo dinero. Las subvenciones CDBG-DR son de HUD, no de FEMA, y se
  quedan en «Fondos federales».
- **Limitaciones:** el municipio de Asistencia Pública es el del solicitante según
  FEMA, no necesariamente el sitio exacto de la obra; el sitio lo dice así. Que un municipio esté en una
  declaración no quiere decir que cada residente recibió ayuda.

### Ahora en Puerto Rico: alertas del NWS y sismos del USGS

- **Qué es:** una franja al principio de la página con las alertas activas del
  Servicio Nacional de Meteorología (NWS) para Puerto Rico y los sismos recientes
  de la región según el USGS. No es un sistema de avisos: para avisos oficiales a
  tiempo, NOAA Weather Radio, weather.gov y las autoridades locales.
- **No dice «en vivo».** El sitio muestra la última copia guardada por
  `npm run data:live:update`, con su hora en hora de Puerto Rico (AST, UTC−4, sin
  horario de verano) y su antigüedad. La página nunca llama al NWS ni al USGS, y
  compilar el sitio no pide datos.
- **Frescura, por fuente:** NWS al día hasta 15 minutos, algo atrasado hasta 60,
  desactualizado después (emite avisos de corta duración en cualquier momento).
  USGS al día hasta 30 minutos, algo atrasado hasta 3 horas, desactualizado después
  (su feed cambia cada minuto, pero la Red Sísmica de Puerto Rico localiza y revisa
  con demora). Sin ninguna copia buena: «sin datos».
- **Ninguno ≠ falla ≠ copia vieja.** «No hay alertas activas del NWS» o «el USGS no
  registra eventos» solo se dice con una copia al día o algo atrasada. Si la copia
  está desactualizada o la fuente no respondió, el sitio dice «No se pudo confirmar
  el estado actual» y muestra lo último guardado con su hora. Si una actualización
  falla, la última copia buena se conserva y se anota el intento fallido.
- **Alertas del NWS:** `https://api.weather.gov/alerts/active?area=PR`. Se guardan
  los campos oficiales y un extracto corto (600 caracteres de descripción, 400 de
  instrucciones), marcado como extracto, con el enlace a la alerta completa. La
  severidad usa los términos del NWS (Extreme, Severe, Moderate, Minor, Unknown) con
  su traducción; el sitio no inventa un puntaje de peligro ni ordena municipios por
  riesgo. Una alerta se asocia a un municipio **solo** por sus códigos SAME oficiales
  (072 + FIPS del municipio); 072000 es todo Puerto Rico; las zonas marinas y otras
  sin código de municipio quedan como «zona del NWS». Nunca se deduce de la prosa.
- **Sismos del USGS:** el feed oficial de 7 días con todas las magnitudes
  (`all_week.geojson`, que el USGS pide usar a las aplicaciones automáticas),
  filtrado a la región **17°N–20°N, 69°W–63.5°W**: la Fosa de Puerto Rico al norte,
  el canal de Mona al oeste, el paso de Anegada al este y el Caribe al sur. **Sin
  umbral de magnitud.** Las ventanas de 24 horas y 7 días se miden desde la hora de
  la copia. Los sismos son puntos (latitud, longitud, profundidad) en un mapa propio;
  no se convierten en valores de municipio. Un dato vacío (por ejemplo, la magnitud)
  queda vacío, nunca 0.
- **Bandera tsunami del USGS:** el USGS la pone en 1 para sismos grandes en el océano;
  según el USGS, no indica que haya habido ni que vaya a haber un tsunami. El sitio la
  muestra como bandera, nunca como aviso. Los avisos de tsunami los emite NOAA y
  aparecerían entre las alertas oficiales.
- **Copias:** las respuestas exactas se quedan en `.cache/live/raw` (fuera del
  repositorio). El repositorio guarda `data/current/nws.json` y
  `data/current/usgs-earthquakes.json`: solo campos permitidos, con el SHA-256 de la
  respuesta original, la hora de obtención, la hora de la fuente y el último intento.

---

## Cómo se añade una fuente nueva

Ver [CONTRIBUTING.md](CONTRIBUTING.md#datos). Toda fuente nueva necesita enlace
oficial, agencia, periodo, nivel geográfico, términos de uso escritos y la
transformación. «Lo encontré en internet» no es una fuente.
