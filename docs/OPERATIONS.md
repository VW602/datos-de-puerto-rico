# Operación

Cómo se mantiene el sitio al día y cómo se despliega. Nada de esto publica el
sitio en `datos.tn242.com`: hoy solo existe una vista previa privada (pre-lanzamiento)
en `workers.dev`.

## Flujos de GitHub Actions

| Flujo | Cuándo | Qué hace | Despliega |
| --- | --- | --- | --- |
| `CI` (`ci.yml`) | Cada pull request y cada push a `main` | `npm ci`, `npm run check`, `npm run build:cloudflare` y la revisión de la salida de Cloudflare | No |
| `Live data (preview)` (`live.yml`) | Cada 15 minutos y a mano | Alertas del NWS y sismos del USGS en cada corrida; agua del USGS solo cuando la última copia buena tiene 55 minutos o más (más o menos cada hora). Luego `data:check`, pruebas, compilación de Cloudflare y despliegue | Sí, a la vista previa |
| `Slow data (review branch)` (`slow.yml`) | Solo a mano | BLS, FEMA y/o USAspending; regenera, comprueba y sube una rama `data/slow-<corrida>` para revisar | No |

**Datos actuales sin commits.** El flujo `live` no hace commits. Las últimas copias
buenas (`data/current/`) pasan de una corrida a otra en la caché de Actions, que solo
se guarda después de un despliegue exitoso. Si cambia el código que escribe o lee
esas copias, la caché empieza de nuevo desde las copias del repositorio.

**Falla cerrado.** Si una actualización, una comprobación, una prueba o la
compilación fallan, no se despliega nada, la caché no cambia y sigue en línea el
despliegue anterior; el sitio dice qué tan vieja es cada copia y, pasado el límite,
«No se pudo confirmar…». GitHub avisa por correo cuando falla un flujo programado.

**Datos lentos con revisión.** El flujo `slow` nunca toca `main` ni despliega. Para
publicar: abrir un pull request desde la rama `data/slow-<corrida>`, revisar el
cambio y unirlo.

## Censo y TIGER/Line (a mano, una vez al año)

No se automatizan. El Censo publica el ACS de 5 años cada diciembre; TIGER/Line, una
edición al año.

1. En una rama nueva, cambiar la edición en `scripts/census/releases.ts` o en
   `scripts/geo/source.ts`.
2. `npm run data:census:update` o `npm run data:geo:update` (solo
   `www2.census.gov`).
3. `npm run data:census:generate -- --allow-changes` o
   `npm run data:geo:generate -- --allow-changes`, y revisar el cambio.
4. `npm run data:registry:generate` y `npm run check`.
5. Pull request; `CI` tiene que pasar.

## Cloudflare

- Worker `datos-de-puerto-rico`, desplegado con `wrangler deploy` (versión fija en
  `live.yml`) desde la salida de `npm run build:cloudflare`.
- Fecha de compatibilidad fija: `2026-10-08` (en `vite.config.ts`); la revisa
  `npm run check:cloudflare`.
- Vista previa: `https://datos-de-puerto-rico.<subdominio>.workers.dev` (variable
  `PREVIEW_URL`). El dominio `datos.tn242.com` **no** apunta todavía al Worker.
- Sin analíticas ni scripts de terceros. Sin HSTS hasta tener HTTPS en el dominio
  final.

## Secretos y variables

Solo nombres; los valores nunca van al repositorio.

| Nombre | Tipo | Dónde | Para qué |
| --- | --- | --- | --- |
| `CLOUDFLARE_API_TOKEN` | Secreto | Entorno `preview` | Desplegar el Worker. Token de API de Cloudflare limitado a la cuenta, con solo el permiso *Workers Scripts: Edit* |
| `CLOUDFLARE_ACCOUNT_ID` | Secreto | Entorno `preview` | Cuenta de Cloudflare del despliegue |
| `PREVIEW_URL` | Variable | Entorno `preview` | Dirección de la vista previa, para comprobarla después de desplegar |
| `BLS_API_KEY` | Secreto (opcional) | Repositorio | Clave gratuita de BLS para la API v2 |

El entorno `preview` solo acepta despliegues desde `main`.
