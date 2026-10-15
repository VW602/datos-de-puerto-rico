# Operación

Cómo se mantienen al día los datos actuales y cómo se despliega el sitio
(`https://datos.tn242.com/`). Costo mensual requerido: $0 (planes gratuitos de
Cloudflare y GitHub).

## Datos actuales: el reloj, el trabajo y el almacén

```
Cloudflare Cron (Worker datos-scheduler)
  → GitHub workflow_dispatch de «Live data → KV»
  → actualizar, normalizar y validar con los scripts del repositorio
  → Workers KV (datos-live)
  → rutas /live/*.json del sitio
```

- **El reloj** es el Worker `datos-scheduler` (`infra/datos-scheduler/`). Solo pide a
  GitHub que corra «Live data → KV»: cada 15 minutos (alertas del NWS y sismos del
  USGS) y en el minuto 7 de cada hora (lo mismo más el agua del USGS). No tiene rutas,
  `workers.dev` está apagado y no lee ni escribe datos. El cron de GitHub no se usa:
  en una prueba de unas 45 horas, un cron de cada hora corrió solo 7 veces.
- **El trabajo** es el flujo «Live data → KV» (`live-kv.yml`). Sin `npm ci`, sin
  compilar y sin desplegar. Publica una fuente solo si la copia se obtuvo en esa
  corrida, pasa los validadores de siempre y las comprobaciones de lectura del sitio,
  y es más nueva que la que guarda KV. El agua (copia y series) va en un solo valor.
- **El almacén** es Workers KV (`live:nws`, `live:earthquakes`, `live:water`, y
  `status:<fuente>` con el último intento). El sitio sirve el valor de KV si es
  válido y más nuevo que la copia incluida en el sitio; si no, la copia incluida.

**Falla cerrado.** Si una fuente no se actualiza o no valida, o KV falla, no se
escribe nada para esa fuente: el dato bueno sigue en KV y el sitio dice qué tan viejo
es. GitHub avisa por correo cuando el flujo falla. Además, un vigilante diario
(`watchdog.yml`) lee `/live/status.json` y falla si alguna fuente pasa su límite de
«desactualizado».

Para refrescar a mano: Actions → «Live data → KV» → Run workflow (`target`:
`production`).

## Flujos de GitHub Actions

| Flujo | Cuándo | Qué hace | Aprobación |
| --- | --- | --- | --- |
| `CI` (`ci.yml`) | Cada pull request y push a `main` | `npm run check`, compilación de Cloudflare y su revisión | No |
| `Live data → KV` (`live-kv.yml`) | Por `datos-scheduler` y a mano | Datos actuales → KV, sin desplegar | No |
| `Deploy application` (`deploy.yml`) | A mano | Compila y despliega el Worker del sitio | Sí (entorno `preview`) |
| `Slow data (review branch)` (`slow.yml`) | A mano | BLS, FEMA y/o USAspending → rama `data/slow-<corrida>` para revisar | Sí (entorno `slow-data`) |
| `Watchdog` (`watchdog.yml`) | Una vez al día (13:17 UTC) y a mano | Lee `/live/status.json`; falla si hay datos desactualizados | No |

Lo que despliega o sube ramas necesita aprobación, así que el token del reloj (que
puede disparar flujos) no puede desplegar por su cuenta.

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

- Worker `datos-de-puerto-rico` en `datos.tn242.com`, desplegado por «Deploy
  application» desde la salida de `npm run build:cloudflare`. Fecha de
  compatibilidad fija `2026-10-08`; la revisa `npm run check:cloudflare`, que también
  exige el KV `LIVE_DATA` y ningún Cron Trigger en este Worker.
- Worker `datos-scheduler`: dos Cron Triggers, sin rutas ni `workers.dev`.
- Sin analíticas: una regla de configuración de la zona apaga RUM para
  `datos.tn242.com`.

## Secretos (solo nombres)

| Nombre | Dónde | Para qué |
| --- | --- | --- |
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | Entorno `preview` | Desplegar el Worker del sitio (*Workers Scripts: Edit*) |
| `CLOUDFLARE_KV_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | Entorno `live-data` | Escribir en KV (*Workers KV Storage: Edit*) |
| `GITHUB_DISPATCH_TOKEN` | Secreto del Worker `datos-scheduler` | Disparar «Live data → KV» (token de GitHub de grano fino, solo este repositorio, *Actions: Read and write*) |
| `BLS_API_KEY` (opcional) | Repositorio | Clave gratuita de BLS para la API v2 |

Los entornos solo aceptan corridas desde `main`. Rotación del token del reloj: crear
uno nuevo, en `infra/datos-scheduler/` correr
`npx wrangler secret put GITHUB_DISPATCH_TOKEN --config ./wrangler.jsonc`, confirmar la
siguiente corrida y revocar el anterior. El `--config` es necesario: sin él, Wrangler
encuentra la configuración generada del sitio en `.wrangler/` de la raíz.
