# Arquitectura

Cómo está hecho el sitio, cómo se despliega y hacia dónde puede crecer sin
reescribirlo.

## Hoy

```
Navegador ──► TanStack Start (React, SSR)
               │
               ├─ src/data/pr/municipios.json     muertes de tránsito (FARS)
               ├─ src/data/pr/layers.ts           cifras de toda la isla (BRFSS)
               └─ data/generated/*.json           medidas del Censo, límites del mapa,
                                                  desempleo mensual de BLS y registro
                                                  público (generados)

Antes de publicar, fuera del sitio:
   www2.census.gov ─► scripts/census ─► data/raw/census → data/normalized → data/generated
   www2.census.gov ─► scripts/geo    ─► data/raw/geo → data/generated/municipios.geometry.json
   api.bls.gov     ─► scripts/bls    ─► data/raw/bls/laus → data/generated/bls-laus.json
   api.usaspending.gov ─► scripts/usaspending ─► .cache (reanudable) → data/raw/usaspending
                                              → data/generated/usaspending-pr.json
   data/registry   ─► scripts/registry ─► data/generated/sources.public.json
```

- **Una sola ruta** (`/`). El componente principal es
  `src/components/explorer/PuertoRicoApp.tsx`.
- **Reglas de datos** en `src/data/pr/`, separadas de los componentes y con pruebas:
  - `ranking.ts`: ordena de mayor a menor y deja fuera lo que falta.
  - `missing.ts`: por qué falta un dato y cómo decirlo, nunca como 0.
  - `sources.ts`: une cada medida con su entrada del registro **público**
    (`data/generated/sources.public.json`). El registro completo
    (`sources.internal.ts`) es solo para pruebas y herramientas.
  - `laus.ts`: lee `data/generated/bls-laus.json` (desempleo mensual de BLS): el
    último mes, el anterior, el mismo mes del año anterior y la línea de 24 meses.
    El sitio nunca llama a la API de BLS; una prueba lo comprueba.
  - `funds.ts`: lee `data/generated/usaspending-pr.json` (fondos federales). El mapa
    solo usa lo atribuible a un municipio; lo incierto, lo de todo Puerto Rico y lo
    que no tiene municipio se muestran aparte y suman el total.
  - `places.ts`: arma cada municipio con las medidas del Censo generadas (con su
    margen de error) y los datos de FARS.
  - `public.ts`: la frontera de publicación. Las medidas, los grupos, la medida
    inicial y los datos que ve la gente salen de aquí, según el registro. Una medida
    sin fuente publicable en el registro queda fuera.
- **El mapa:**
  - `src/data/pr/geo.ts` proyecta una sola vez la geometría TIGER/Line a un
    espacio fijo. Acercar y mover solo cambian el `viewBox`; ninguna coordenada
    cambia. También resuelve los toques: si un toque cae cerca de varios
    municipios, devuelve los candidatos en orden fijo para que la persona escoja.
  - `src/components/explorer/AtlasMap.tsx` dibuja el mapa en tres usos: la
    franja de escritorio, la vista de toda la isla y el mapa ampliado del
    teléfono (enlazados por el recuadro de la vista).
  - Colores y letras: los tokens están en `src/styles.css`; la escala Arena →
    Añil y la trama de «sin dato» están en `src/data/scale.ts`. Una prueba
    impide que «sin dato» se vuelva un gris plano.
- **El registro público falla cerrado.** `scripts/registry/public.ts` se niega a
  generar el registro si alguna fuente no está lista: procedencia verificada,
  `publicStatus` `PUBLIC_READY` y derechos de redistribución escritos.
- **Sin base de datos, sin cuentas, sin cookies propias.**

## Despliegue

El sitio no consulta ningún servicio al abrir la página: todo sale de archivos del
repositorio. No tiene funciones de servidor propias. Nitro compila el servidor que
genera las páginas (SSR) para la plataforma que se escoja con `NITRO_PRESET`.

| Plataforma | Estado | Cómo |
| --- | --- | --- |
| Node propio (VPS, Docker, Render, Fly) | Predeterminado | `npm run build` y `node .output/server/index.mjs` |
| Vercel | Compila con `NITRO_PRESET=vercel`; sin probar | Función serverless + archivos estáticos |
| Netlify | Compila con `NITRO_PRESET=netlify`; sin probar | Netlify Functions |
| Cloudflare Workers | Compila con `NITRO_PRESET=cloudflare_module`; sin probar | Worker |
| GitHub Pages (solo estático) | Falta configurar | El sitio podría ser 100% estático con el prerender de TanStack Start |

### Dominio previsto: `datos.tn242.com` (no configurado)

Nada de esto está hecho. Cuando se decida la plataforma:

1. Escoger la plataforma y probar un despliegue de vista previa con su
   `NITRO_PRESET`.
2. En el proveedor de DNS del dominio, crear un registro `CNAME` para `datos` que
   apunte al destino que indique la plataforma.
3. Añadir `datos.tn242.com` como dominio propio en la plataforma y esperar el
   certificado HTTPS.
4. Comprobar que `og:image` y los enlaces del sitio funcionan con el dominio final.

## Hacia dónde crecer: datos

El Censo y los límites del mapa ya siguen esta ruta. Cada fuente nueva debería
pasar por la misma:

```
Fuente oficial
   ↓  conector          un script por fuente (descarga, sin transformar)
Copia cruda             data/raw/<fuente>/  + SHA-256 y fecha de descarga
   ↓  validación        esquema, rango, 78 municipios, null ≠ 0
   ↓  normalización     ids FIPS, nombres, unidades, periodo
Modelo canónico         data/normalized/<tema>/
   ↓  generación        lo que el sitio necesita
Artefacto público       data/generated/
   ↓
Sitio web
```

Principios:

- **Los conectores corren antes de publicar**, no cuando alguien abre la página.
- **La copia cruda se guarda** con su fecha y su SHA-256, si los términos de la
  fuente lo permiten, para poder demostrar de dónde salió cada número.
- **Una validación que falla no publica nada.**
- **El registro de fuentes manda.** Ningún dataset entra sin su entrada en
  `data/registry/sources.json` y sin términos de uso escritos.

### ¿Hace falta una base de datos?

| Escala | Lo que basta |
| --- | --- |
| Hoy: 78 municipios, 25 medidas | JSON en el repositorio |
| Decenas de temas, varios años por medida | JSON generado por tema y por municipio, cargado según la página |
| Datos muy detallados (cientos de MB) | SQLite o DuckDB **en el paso de generación**; el sitio sigue sirviendo archivos generados |
| Búsquedas libres que no se pueden pregenerar | Una base de datos administrada, solo entonces |

## Hacia dónde crecer: municipios y temas

El municipio debe ser la puerta de entrada, con direcciones como
`/municipios/ponce`. Para llegar ahí hace falta:

- un `slug` estable por municipio (`mayaguez`, `las-marias`), guardado, no
  calculado al vuelo;
- separar la ficha del municipio (hoy `Detail` dentro de `PuertoRicoApp.tsx`) en su
  propio componente;
- que cada tema aporte su propia sección a la ficha.

Regla: **no se añade navegación para un tema que no existe.** Nada de páginas
«Muy pronto». Un tema aparece cuando tiene datos verificados con términos claros.

## ¿De dónde sale este dato?

Cada medida apunta a una entrada del registro. La interfaz no lee el registro
directamente; usa `provenanceForMetric(id)` (`src/data/pr/sources.ts`), que devuelve
agencia, periodo, enlace original, fecha de descarga, metodología, datos que faltan,
cita y si hay margen de error.

## Neutralidad

- Ordenar de mayor a menor es descriptivo. El sitio no dice cuál extremo es mejor.
- Una prueba (`sources.test.ts`) revisa que ninguna medida use palabras que
  califiquen.
