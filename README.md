# Datos de Puerto Rico · 78 municipios

_Nombre provisional._

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
- **25 medidas** en cinco grupos:
  - **Gente:** población, mujeres, menores de 18, 65 años o más, edad mediana y
    discapacidad.
  - **Hogar:** ingreso del hogar y por persona, pobreza, renta, valor de la
    vivienda, viviendas vacías, hacinamiento, viviendas sin plomería completa,
    hogares sin carro, sin computadora o sin internet, y asistencia nutricional
    (PAN).
  - **Trabajo:** desempleo, escuela superior y bachillerato.
  - **Salud:** personas sin plan médico y muertes de tránsito.
  - **Toda la isla:** obesidad e inactividad física en adultos, que solo se publican
    para Puerto Rico completo.
- **Una ficha por municipio** con la cifra, su lugar entre los 78, el margen de
  error cuando el Censo lo publica, la pirámide de edad y las demás medidas del
  grupo.
- **«¿De dónde sale este dato?»** en cada ficha: la agencia, el periodo, cómo se
  calcula, qué falta, cuándo se descargó la copia oficial, la cita y el enlace a la
  fuente original.

## De dónde salen los datos

| Fuente | Qué aporta |
| --- | --- |
| Oficina del Censo de EE. UU., American Community Survey 2019–2023 y 2020–2024 (5 años) | Casi todas las medidas por municipio |
| Oficina del Censo de EE. UU., TIGER/Line® 2024 | Los límites de los municipios en el mapa |
| NHTSA, Fatality Analysis Reporting System (FARS) 2022–2023 | Muertes de tránsito |
| CDC, Behavioral Risk Factor Surveillance System (BRFSS) 2023 | Obesidad e inactividad física, toda la isla |

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
- **Todo se puede reconstruir.** Los datos del Censo y los límites del mapa salen de
  copias oficiales guardadas en el repositorio, con su SHA-256. Los scripts los
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
| `npm run data:generate` | Vuelve a generar los datos del Censo, el mapa y el registro público, sin red |
| `npm run data:census:update` | Descarga de nuevo la copia oficial del Censo (necesita red) |
| `npm run data:geo:update` | Descarga de nuevo los límites TIGER/Line 2024 (necesita red) |

### Actualizar los datos del Censo o del mapa

1. Cambia la edición en `scripts/census/releases.ts` o en `scripts/geo/source.ts`.
2. Corre `npm run data:census:update` o `npm run data:geo:update`. Solo se conecta
   a `www2.census.gov`.
3. Corre `npm run data:census:generate -- --allow-changes` o
   `npm run data:geo:generate -- --allow-changes` y revisa el cambio.
4. Corre `npm run data:registry:generate` y `npm run check`.

No hace falta clave de la API del Censo. Los detalles están en
[data/README.md](data/README.md).

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
Oficina del Censo, a NHTSA, a los CDC ni a ninguna otra agencia, y ninguna de ellas
lo respalda ni lo certifica.

---

**English:** An independent, Spanish-first, open-source map of public data for
Puerto Rico's 78 municipalities, built from U.S. Census Bureau (ACS, TIGER/Line),
NHTSA (FARS) and CDC (BRFSS) data. Every number links back to its official source.
Code is MIT-licensed; the data keeps its publishers' terms (see DATA_LICENSES.md).
Not affiliated with or endorsed by any government agency.
