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
| `generated/` | `npm run data:generate` | Lo que lee el sitio: `census-municipios.json` (medidas del Censo con su margen de error), `municipios.geometry.json` (límites del mapa) y `sources.public.json` (la parte pública del registro). **Generado: no editar a mano.** |

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

## Lo demás

Dos fuentes pequeñas se guardan a mano en `src/data/pr/`, verificadas contra su
publicación oficial:

- `municipios.json`: las muertes de tránsito de FARS (NHTSA) 2022–2023 por
  municipio y la tasa por cada 100,000 habitantes.
- `layers.ts`: los por cientos de obesidad e inactividad física del BRFSS 2023 de
  los CDC, que solo existen para toda la isla.

Ver [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md#hacia-dónde-crecer-datos).
