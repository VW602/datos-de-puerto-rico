# Datos de Puerto Rico

Dirección pública prevista: <https://datos.tn242.com> (todavía no está publicado).

Un mapa de datos públicos de los 78 municipios de Puerto Rico. Cada cifra dice de
dónde sale, qué periodo cubre y qué le falta.

## Por qué lo hice

Cuando uno busca datos de Puerto Rico, casi siempre termina con diez pestañas
abiertas: un informe en PDF por aquí, una hoja de cálculo por allá, una tabla del
Censo que hay que descifrar. La información existe, pero está regada, y casi nunca
se puede poner un pueblo al lado de otro.

Lo hice para tener todo eso en un solo lugar, empezando por los municipios, sin
perder de vista de dónde sale cada número. Si una cifra no se puede rastrear hasta
su fuente oficial, no entra.

## Qué puedes explorar hoy

- **Un mapa de los 78 municipios.** Escoges una medida y cada pueblo se colorea
  según su cifra. Puedes acercarte, moverte y escoger un municipio en el mapa o en
  la lista.
- **33 medidas** en siete grupos:
  - **Gente:** población, mujeres, menores de 18, 65 años o más, edad mediana y
    discapacidad.
  - **Hogar:** ingreso del hogar y por persona, pobreza, renta, valor de la
    vivienda, viviendas vacías, hacinamiento, viviendas sin plomería completa,
    hogares sin carro, sin computadora o sin internet, y asistencia nutricional
    (PAN).
  - **Trabajo:** desempleo mensual (BLS), desempleo promedio de 5 años (Censo),
    escuela superior y bachillerato.
  - **Salud:** personas sin plan médico y muertes de tránsito.
  - **Recuperación y desastres:** Asistencia Pública de FEMA (obligado federal y
    proyectos), asistencia aprobada a hogares y mitigación, para todos los
    desastres o uno solo, con la lista de proyectos de cada desastre.
  - **Fondos federales:** obligaciones, desembolsos reportados y adjudicaciones
    federales del último año fiscal, solo lo que se puede atribuir al municipio.
  - **Toda la isla:** obesidad e inactividad física en adultos, que solo se publican
    para Puerto Rico completo.
- **Una ficha por municipio** con la cifra, su lugar entre los 78, el margen de
  error cuando el Censo lo publica, la pirámide de edad y las demás medidas del
  grupo. En desempleo mensual, además: el mes anterior, el mismo mes del año
  anterior, una línea de 24 meses y la fuerza laboral.
- **«¿De dónde sale este dato?»** en cada ficha: la agencia, el periodo, cómo se
  calcula, qué falta, cuándo se descargó la copia oficial, la cita y el enlace a la
  fuente original.

## Ahora en Puerto Rico

Al principio de la página: las alertas activas del NWS para Puerto Rico y los sismos
recientes de la región según el USGS, con la hora de la última copia y su
antigüedad. Si la copia está vieja o la fuente no respondió, lo dice en lugar de
decir que no pasa nada. Para actualizarla: `npm run data:live:update` (necesita red;
se puede correr de forma periódica sin cambios). No es un sistema de avisos.

**Agua ahora:** las mediciones más recientes de las estaciones del USGS (caudal y
altura del medidor en ríos y canales, lluvia, y elevación de embalses), cada una con
la hora en que se midió, si es provisional y si esa medición sigue al día (una
estación puede tener varias mediciones, y se cuentan aparte). Son
mediciones, no avisos de inundación ni de sequía, y no hay porcentaje de llenado de
embalses. Para actualizarlas: `npm run data:water:update`.

## Datos actuales

Las alertas, los sismos y el agua no se piden al abrir la página. Un programa de
actualización los pide a la fuente oficial, los revisa y guarda una **copia**
(`data/current/`) con la hora en que se obtuvo. El sitio muestra esa copia y dice
qué tan vieja es:

| Estado | Qué quiere decir |
| --- | --- |
| **Al día** (`CURRENT`) | La copia es reciente: alertas del NWS hasta 30 minutos; sismos del USGS hasta 30 minutos; agua hasta 60 minutos. |
| **Algo atrasado** (`AGING`) | Todavía sirve para hablar de «ahora», pero ya pasó un rato: alertas hasta 60 minutos; sismos y agua hasta 3 horas. |
| **Desactualizado** (`STALE`) | Demasiado vieja para hablar de «ahora». El sitio dice «No se pudo confirmar…» y muestra lo último guardado con su hora. |
| **Sin datos** (`UNAVAILABLE`) | No hay ninguna copia buena guardada. |

Si una actualización falla, **se conserva la última copia buena** y se anota el
intento fallido; nunca se reemplaza por una copia vacía ni se da por hecho que «no
pasa nada». Cada medición de agua tiene además su propia frescura, según la hora en
que la estación la midió.

## De dónde salen los datos

| Fuente | Qué aporta |
| --- | --- |
| Oficina del Censo de EE. UU., American Community Survey 2019–2023 y 2020–2024 (5 años) | Casi todas las medidas por municipio |
| Oficina del Censo de EE. UU., TIGER/Line® 2024 | Los límites de los municipios en el mapa |
| NHTSA, Fatality Analysis Reporting System (FARS) 2022–2023 | Muertes de tránsito |
| CDC, Behavioral Risk Factor Surveillance System (BRFSS) 2023 | Obesidad e inactividad física, toda la isla |
| Oficina de Estadísticas Laborales de EE. UU. (BLS), Local Area Unemployment Statistics (LAUS) | Desempleo mensual por municipio, fuerza laboral, personas empleadas y desempleadas |
| Agencia Federal para el Manejo de Emergencias (FEMA), OpenFEMA | Declaraciones de desastre, Asistencia Pública, asistencia a hogares y mitigación |
| Departamento del Tesoro de EE. UU., USAspending.gov | Obligaciones, desembolsos y adjudicaciones federales por lugar de ejecución |

El detalle de cada fuente está en [DATA_SOURCES.md](DATA_SOURCES.md), y sus
condiciones de uso, en [DATA_LICENSES.md](DATA_LICENSES.md).

### Cómo se trabaja con los datos

- **Sin dato no es cero.** Si la fuente no publicó una cifra para un municipio, ese
  pueblo queda sin color. Nunca se muestra un 0 en lugar de un dato que falta.
- **Ordenar no es calificar.** La lista va de mayor a menor, pero el sitio no dice
  qué pueblo está «mejor» o «peor».
- **Los estimados del Censo vienen de una encuesta** y tienen margen de error. El
  proyecto guarda el margen oficial junto a cada estimado y lo muestra en la ficha
  cuando el Censo lo publica para esa cifra.
- **Todo se puede reconstruir.** Los datos del Censo, los límites del mapa y el
  desempleo mensual salen de copias oficiales guardadas en el repositorio, con su
  SHA-256. Los scripts los
  vuelven a generar sin internet y siempre dan los mismos bytes.
- **La página no consulta ningún servicio** al abrirse. Todo sale de archivos del
  repositorio.

## Correrlo en tu computadora

Necesitas Node.js 22.12 o más nuevo.

```bash
npm ci
npm run dev
```

Abre <http://localhost:8080>.

| Comando | Qué hace |
| --- | --- |
| `npm run check` | Tipos, lint, datos, pruebas y compilación, en orden |
| `npm test` | Pruebas (Vitest) |
| `npm run build` | Compila el sitio y su servidor en `.output/`, sin descargar nada |
| `npm run data:check` | Comprueba que los datos generados salen de las copias oficiales guardadas |
| `npm run data:generate` | Vuelve a generar los datos del Censo, el mapa, el desempleo de BLS y el registro público, sin red |
| `npm run data:census:update` | Descarga de nuevo la copia oficial del Censo (necesita red) |
| `npm run data:geo:update` | Descarga de nuevo los límites TIGER/Line 2024 (necesita red) |
| `npm run data:live:update` | Pide las alertas activas del NWS y los sismos recientes del USGS (necesita red; si una fuente falla, conserva la última copia buena) |
| `npm run data:water:update` | Pide las mediciones de agua de las estaciones del USGS en Puerto Rico (necesita red; si falla, conserva la última copia buena) |
| `npm run data:fema:update` | Pide de nuevo los datos de recuperación a la API OpenFEMA (necesita red; se puede reanudar) |
| `npm run data:usaspending:update` | Pide de nuevo los fondos federales a la API oficial de USAspending (necesita red; se puede reanudar) |
| `npm run data:bls:update` | Pide de nuevo el desempleo mensual a la API oficial de BLS (necesita red) |

Cómo se actualizan los datos actuales y se despliega la vista previa (GitHub Actions y
Cloudflare): [docs/OPERATIONS.md](docs/OPERATIONS.md).

### Actualizar los datos del Censo o del mapa

1. Cambia la edición en `scripts/census/releases.ts` o en `scripts/geo/source.ts`.
2. Corre `npm run data:census:update` o `npm run data:geo:update`. Solo se conecta
   a `www2.census.gov`.
3. Corre `npm run data:census:generate -- --allow-changes` o
   `npm run data:geo:generate -- --allow-changes` y revisa el cambio.
4. Corre `npm run data:registry:generate` y `npm run check`.

No hace falta clave de la API del Censo. Los detalles están en
[data/README.md](data/README.md).

### Actualizar el desempleo mensual (BLS)

1. Corre `npm run data:bls:update`. Solo se conecta a `api.bls.gov` y hace 13
   pedidos; sin clave, la API de BLS permite pocos pedidos al día. Con una clave
   gratuita en la variable `BLS_API_KEY` usa la versión 2 (la clave no se guarda).
2. Corre `npm run data:bls:generate -- --allow-changes` y revisa el cambio. El mes
   nuevo sale solo: es el último que BLS publica para todas las series.
3. Corre `npm run data:registry:generate` y `npm run check`.

### Actualizar los datos de recuperación (FEMA)

1. Corre `npm run data:fema:update`. Solo se conecta a `www.fema.gov/api/open`, un
   pedido a la vez. Si OpenFEMA actualizó un dataset desde la última copia temporal,
   la descarta y vuelve a pedir. `data/source/fema/` (extracto público; las respuestas exactas se quedan en `.cache/`) solo se reemplaza cuando la copia
   completa pasa todas las comprobaciones.
2. Corre `npm run data:fema:generate -- --allow-changes` y revisa el cambio.
3. Corre `npm run data:registry:generate` y `npm run check`.

Usar la API es aceptar los [términos de OpenFEMA](https://www.fema.gov/about/openfema/terms-conditions).

### Actualizar los fondos federales (USAspending)

1. Corre `npm run data:usaspending:update`. Solo se conecta a `api.usaspending.gov`,
   un pedido a la vez con pausas (unos 450 pedidos, 15–30 minutos). Si se corta,
   vuelve a correrlo: sigue donde iba, con las respuestas guardadas en `.cache/`.
   `data/raw/usaspending/` solo se reemplaza cuando la copia completa pasa todas las
   comprobaciones.
2. Corre `npm run data:usaspending:generate -- --allow-changes` y revisa el cambio.
3. Corre `npm run data:registry:generate` y `npm run check`.

Usar la API de BLS es aceptar sus
[términos de servicio](https://www.bls.gov/developers/termsOfService.htm).

## Cómo está hecho

- **TanStack Start** (React 19 y Vite) con **Tailwind CSS**.
- El mapa se dibuja con **d3-geo** sobre SVG. El acercamiento y el desplazamiento
  solo cambian la vista; las coordenadas de los límites nunca cambian. En el
  teléfono hay una vista de toda la isla enlazada a un mapa ampliado, con
  buscador, botones de acercar y alejar, y «Toda la isla».
- No hay base de datos, cuentas ni cookies propias.

```
src/components/explorer/   mapa y ficha del municipio
src/data/pr/               medidas, reglas de datos y pruebas
scripts/census/            proceso del Censo (descarga, generación, verificación)
scripts/geo/               límites del mapa desde TIGER/Line 2024
scripts/registry/          genera la parte pública del registro de fuentes
data/raw/                  copias oficiales guardadas + manifest.json (SHA-256)
data/normalized/           estimados y márgenes de error (generado)
data/generated/            lo que lee el sitio (generado)
data/registry/             una entrada por fuente, con su evidencia
```

Más en [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Limitaciones

- Los estimados del ACS cubren cinco años y tienen margen de error. En pueblos
  pequeños ese margen puede ser grande.
- Los por cientos que el proyecto calcula sumando varias filas del Censo no traen un
  margen de error propio; la ficha solo muestra el margen cuando el Censo lo publica
  para esa cifra.
- Las muertes de tránsito usan la población de 2019–2023 para muertes de 2022 y
  2023.
- Obesidad e inactividad física solo existen para toda la isla.
- Los límites del mapa son para fines estadísticos y no son descripciones legales de
  terrenos. Incluyen aguas costeras.

## Cómo ayudar

Lee [CONTRIBUTING.md](CONTRIBUTING.md). Sirve mucho:

- corregir una cifra que no cuadra con su fuente oficial;
- encontrar fuentes oficiales con términos de uso claros;
- mejorar la accesibilidad, el texto o el mapa.

**¿Ves un dato malo?** Abre un issue con el municipio, la cifra que ves, la cifra de
la fuente oficial y el enlace a esa fuente. Sin fuente no se cambia un número.

## Neutralidad

El sitio muestra datos; no hace campaña. No califica municipios, gobiernos ni
personas, y no saca conclusiones por quien lo usa. Si algo suena a opinión, es un
error y se puede reportar.

## Privacidad

- No hay cuentas ni formularios.
- No hay analíticas ni rastreadores, y no se usan cookies de rastreo.
- El sitio no recoge ni envía datos de quien lo usa. La página no llama a ningún
  servicio externo: todo sale de archivos del sitio.
- Hoy el sitio no guarda nada en tu navegador: ni cookies ni `localStorage`. Si
  algún día guarda algo, será solo el estado de la pantalla (por ejemplo, la medida
  escogida), en `localStorage`, y se quedará en tu dispositivo.

## Seguridad

Para reportar un problema de seguridad, sigue [SECURITY.md](SECURITY.md). No lo
reportes en un issue público.

## Licencia

El **código** está bajo la licencia MIT ([LICENSE](LICENSE)).

Las **tipografías** Newsreader y Source Sans 3 están bajo la SIL Open Font
License 1.1. El sitio las sirve él mismo (paquetes `@fontsource`), sin pedir nada a
Google Fonts.

Los **datos** no son míos. Son de las agencias que los publican y siguen sus
propios términos, que están en [DATA_LICENSES.md](DATA_LICENSES.md). La licencia MIT
no cubre los datos. Si los reusas, cita la fuente original.

## Sin afiliación

Este es un proyecto independiente. No está afiliado al gobierno de Puerto Rico, a la
Oficina del Censo, a NHTSA, a los CDC, a BLS, al Departamento del Tesoro, a FEMA, al NWS, al USGS ni a ninguna otra agencia, y ninguna de ellas
lo respalda ni lo certifica.

---

**English:** An independent, Spanish-first, open-source map of public data for
Puerto Rico's 78 municipalities, built from U.S. Census Bureau (ACS, TIGER/Line),
NHTSA (FARS), CDC (BRFSS), Bureau of Labor Statistics (LAUS), USAspending.gov (U.S. Treasury) and OpenFEMA data. This product uses the Federal Emergency Management Agency’s OpenFEMA API, but is not endorsed by FEMA. Every number links back to its official source.
Code is MIT-licensed; the data keeps its publishers' terms (see DATA_LICENSES.md).
Not affiliated with or endorsed by any government agency.
