# data/

El camino de cada dato desde su fuente oficial hasta el sitio, y el registro de
dónde sale cada cosa.

| Carpeta | Quién la escribe | Qué va |
| --- | --- | --- |
| `registry/` | A mano | `sources.json`: una entrada por fuente, con la evidencia completa (términos de uso, notas). El sitio solo carga la parte pública (`generated/sources.public.json`). |
| `schemas/` | A mano | Esquema JSON de una entrada del registro. |
| `raw/census/` | `npm run data:census:update` | Copia oficial del Censo: encabezado y las 78 filas de Puerto Rico de cada tabla, sin cambiar un byte, más `manifest.json` con enlaces, fecha de descarga (UTC) y SHA-256. |
| `normalized/census/` | `npm run data:census:generate` | Cada estimado y margen de error de la copia, por municipio. Los códigos especiales del Censo quedan como `null` con su razón. **Generado: no editar a mano.** |
| `raw/geo/` | `npm run data:geo:update` | Copia oficial de los límites: los 78 municipios de TIGER/Line 2024, con coordenadas y atributos tal cual, más `manifest.json` (enlace, tamaño y SHA-256 del ZIP nacional y de cada archivo dentro, fecha de descarga UTC, sistema de coordenadas). |
| `raw/bls/laus/` | `npm run data:bls:update` | Respuestas de la API oficial de BLS (LAUS), byte por byte: 13 lotes de 25 series o menos, más `manifest.json` con los pedidos, la fecha de obtención (UTC), los términos y el SHA-256 de cada lote. |
| `raw/usaspending/` | `npm run data:usaspending:update` | Respuestas de la API oficial de USAspending, byte por byte, más `manifest.json` con cada pedido exacto, la hora, el SHA-256, la huella del plan y la fecha de actualización de USAspending. |
| `source/fema/` | `npm run data:fema:update` | **Extracto público** de las respuestas de la API OpenFEMA (versiones fijadas): los mismos registros y valores, solo con los campos de la lista permitida (`scripts/fema/extract.ts`), sin títulos libres, nombres, direcciones ni datos de contacto. No es la respuesta original. `manifest.json` guarda cada pedido exacto, la hora, el total de OpenFEMA, el SHA-256 de la respuesta original (que solo se guarda en `.cache/fema/raw`, fuera del repositorio) y el del extracto. |
| `generated/` | `npm run data:generate` | Lo que lee el sitio: `census-municipios.json` (medidas del Censo con su margen de error), `municipios.geometry.json` (límites del mapa), `bls-laus.json` (desempleo mensual de BLS), `usaspending-pr.json` (fondos federales), `fema-pr.json` y `fema-projects/` (recuperación; los proyectos se cargan por desastre, solo cuando se piden) y `sources.public.json` (la parte pública del registro). **Generado: no editar a mano.** |

## Datos del Censo

```
www2.census.gov (Table-Based Summary File)
   ↓  npm run data:census:update      descarga, SHA-256 del archivo completo, guarda solo Puerto Rico
data/raw/census/                      + manifest.json
   ↓  npm run data:census:generate    verifica SHA-256, 78 municipios, códigos especiales → null
data/normalized/census/               estimados y márgenes de error
   ↓                                  fórmulas de scripts/census/formulas.ts
data/generated/census-municipios.json
   ↓
sitio (src/data/pr/places.ts)
```

- `npm run build` **no** descarga nada. Usa lo que está en el repositorio.
- `generate` no usa la red. Si la copia guardada no cambió, produce los mismos
  bytes; si los valores fueran a cambiar, se niega a sobrescribir sin
  `--allow-changes`.
- `npm run data:check` falla si algún archivo generado no coincide con lo que
  sale de la copia guardada.

### Actualizar a una edición nueva del Censo

1. Cambiar la edición en `scripts/census/releases.ts` (y las etiquetas de las
   medidas y el registro).
2. `npm run data:census:update` (necesita red; solo contacta `www2.census.gov`).
3. `npm run data:census:generate -- --allow-changes` y revisar el diff.
4. `npm run data:registry:generate` y `npm run check`.

No hace falta clave de la API del Censo.

## Límites del mapa

```
www2.census.gov/geo/tiger/TIGER2024/COUNTY/tl_2024_us_county.zip  (edición fija)
   ↓  npm run data:geo:update     SHA-256 del ZIP, lee .dbf y .shp, guarda solo STATEFP = 72
data/raw/geo/tiger-2024/          78 municipios sin simplificar + manifest.json
   ↓  npm run data:geo:generate   sin red; verifica SHA-256, 78 municipios y nombres del Censo
data/generated/municipios.geometry.json
   ↓
sitio (src/data/pr/geo.ts → src/components/explorer/AtlasMap.tsx)
```

- **Simplificación:** Douglas–Peucker aplicado una sola vez a cada borde entre dos
  municipios (cortando en los puntos donde se juntan tres o más), así los vecinos
  comparten la misma línea. Tolerancia fija de 0.0001 grados (unos 11 m),
  coordenadas a 5 decimales (unos 1.1 m). Las islas que no tocan a nadie (Mona y
  Desecheo) se simplifican como anillos cerrados; nunca se borran.
- **Controles:** 78 municipios, GEOID y nombre igual al Censo, ningún cruce de
  bordes, ningún segmento compartido por más de dos municipios, ningún municipio
  con más de 1% de cambio de área. Si algo falla, no se escribe nada.
- **Mismos bytes siempre:** el orden es por GEOID y no hay fechas dentro del archivo
  generado. `npm run data:check` falla si el archivo no coincide con lo que sale de
  la copia guardada.
- **Atribución:** el Censo pide citarlo y mostrar en la primera página el aviso de
  marca registrada de TIGER/Line®; el aviso está al pie del sitio.
- **Cambiar de edición:** editar `scripts/geo/source.ts`, correr `data:geo:update` y
  `data:geo:generate -- --allow-changes`, y revisar el cambio.

## Desempleo mensual (BLS LAUS)

- **De dónde:** la API pública de BLS, versión 1, sin clave
  (`https://api.bls.gov/publicAPI/v1/timeseries/data/`). Con `BLS_API_KEY` usa la
  versión 2; la clave no se escribe en ningún archivo.
- **Qué se pide:** 316 series sin ajuste estacional (tasa, desempleados, empleados
  y fuerza laboral de Puerto Rico y de los 78 municipios), desde enero del año
  antepasado hasta el año en curso. Los municipios y sus códigos FIPS salen de
  `generated/census-municipios.json`.
- **`data:bls:update`** no guarda nada si falta una serie o si la API no responde
  `REQUEST_SUCCEEDED`. No hay otro proveedor de respaldo.
- **`data:bls:generate`** (sin red) comprueba el SHA-256 de cada lote, los 78
  municipios, que cada serie corresponda a su FIPS, los meses (M01–M12; M13 es el
  promedio anual y se omite), los rangos, que empleo + desempleo = fuerza laboral,
  y que todas las series terminen en el mismo mes. Si algo no cuadra, falla.
  Lo marcado «P» por BLS queda en `preliminary`. Un valor que falta queda `null`
  con su razón en `missing`.
- **`--check`** (parte de `npm run data:check`) falla si `bls-laus.json` no es
  exactamente lo que sale de la copia guardada.

## Fondos federales (USAspending)

- **De dónde:** la API oficial de USAspending (`https://api.usaspending.gov/api/v2/`),
  sin clave. Nunca el sitio web.
- **`data:usaspending:update`** (con red) se puede reanudar. Cada respuesta buena
  se guarda en `.cache/usaspending/` (ignorado por git) con su pedido canónico, su
  SHA-256 y la hora. Al volver a correr, reusa una respuesta solo si el pedido es
  idéntico, la huella del plan es la misma y USAspending no se ha actualizado desde
  entonces; si no, descarta la copia temporal y lo dice. Pausa de 1.2–1.6 s entre
  pedidos, tiempo límite de 90 s, hasta 7 intentos con espera exponencial (y
  `Retry-After`) solo para fallos de red, 408, 429 y 5xx. Si se rinde, se detiene
  sin perder lo guardado. Solo cuando están todas las respuestas, arma la copia
  aparte, la pasa por el generador completo y la instala de una vez.
- **`data:usaspending:generate`** (sin red) comprueba el SHA-256 de cada archivo,
  que estén todos los pedidos del plan (y la huella), que cada periodo sea un año
  fiscal completo, los 78 municipios por código y nombre, montos finitos, y que
  cada desglose sume su parte (ver DATA_SOURCES.md). Si algo no cuadra, falla.
- **`--check`** (parte de `npm run data:check`) falla si `usaspending-pr.json` no es
  exactamente lo que sale de la copia guardada.

## Recuperación y desastres (OpenFEMA)

- **`data:fema:update`** (con red) funciona como el de USAspending: copia temporal en
  `.cache/fema/`, reanudable, pausas, reintentos con espera exponencial y
  `Retry-After`, y todo o nada. Pide primero la entrada de catálogo de cada dataset;
  si alguno se actualizó desde la copia temporal, la descarta.
- **`data:fema:generate`** (sin red) comprueba el SHA-256, el plan, que cada dataset
  esté completo, los identificadores de desastre (DR/EM-número-PR), los 78
  municipios, los montos, las fechas, proyectos y registros únicos, que los hogares
  no traigan campos de ubicación fina, y que los cuatro estados geográficos sumen el
  total de cada medida y desastre.

## Lo demás

Dos fuentes pequeñas se guardan a mano en `src/data/pr/`, verificadas contra su
publicación oficial:

- `municipios.json`: las muertes de tránsito de FARS (NHTSA) 2022–2023 por
  municipio y la tasa por cada 100,000 habitantes.
- `layers.ts`: los por cientos de obesidad e inactividad física del BRFSS 2023 de
  los CDC, que solo existen para toda la isla.

Ver [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md#hacia-dónde-crecer-datos).
