/**
 * WATER CHECK (offline): validates data/current/usgs-water.json and its
 * 24-hour series file. Part of `npm run data:check`.
 *
 *   npm run data:water:check
 *
 * Fails on a broken snapshot: schema, hashes, timestamps, site IDs,
 * coordinates, parameter codes, units, statistics, duplicate series, future
 * observations, values that do not match their published text, trends and
 * rain totals that do not follow from the series. An OLD snapshot is not
 * broken: it is reported with its freshness, and the site shows it as old.
 * If the exact responses are still in the local cache, normalizing them
 * again must give the same data.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { freshness } from "../../src/data/pr/currentModel.ts";
import { RAW_CACHE_DIR } from "../live/source.ts";
import {
  buildData,
  contentHash,
  countStates,
  normalizeWater,
  sha256,
  type SeriesFile,
  type WaterRaw,
  type WaterSnapshot,
} from "./normalize.ts";
import {
  ACTIVE_DAYS,
  ELEVATION_PREFERENCE,
  OBSERVATION_FIELDS,
  PARAMETER_BY_CODE,
  PR_BOX,
  RAIN_MAX_GAP_MINUTES,
  RESERVOIR_SITE_TYPES,
  RIVER_SITE_TYPES,
  SERIES_HOURS,
  STATION_FIELDS,
  STATION_FRESHNESS,
  TREND_HOURS,
  WATER,
  WATER_FRESHNESS,
  WATER_OUTPUT,
  WATER_RAW_PREFIX,
  WATER_SCHEMA_VERSION,
  WATER_SERIES_OUTPUT,
  siteUrl,
} from "./source.ts";

const SKEW_MS = 5 * 60_000;
const fail = (message: string): never => {
  throw new Error(message);
};
const t = (iso: string | null, where: string) => {
  if (iso === null) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(iso) || Number.isNaN(Date.parse(iso)))
    fail(`${where}: fecha no es UTC ISO (${iso})`);
  return Date.parse(iso);
};
const NUMBER = /^-?\d+(\.\d+)?$/;

export function validateWater(
  s: WaterSnapshot,
  series: SeriesFile | null,
  municipioIds: Set<string>,
): void {
  if (s.schemaVersion !== WATER_SCHEMA_VERSION) fail(`agua: versión de esquema ${s.schemaVersion}`);
  if (JSON.stringify(s.source) !== JSON.stringify(WATER))
    fail("agua: fuente distinta de la declarada");
  if (JSON.stringify(s.sourceFreshness) !== JSON.stringify(WATER_FRESHNESS))
    fail("agua: umbrales de frescura de la fuente distintos de los documentados");
  if (
    s.stationFreshness.currentMinutes !== STATION_FRESHNESS.currentMinutes ||
    s.stationFreshness.staleMinutes !== STATION_FRESHNESS.staleMinutes
  )
    fail("agua: umbrales de frescura de estación distintos de los documentados");
  if (
    s.rules.activeDays !== ACTIVE_DAYS ||
    s.rules.trendHours !== TREND_HOURS ||
    s.rules.seriesHours !== SERIES_HOURS ||
    s.rules.rainMaxGapMinutes !== RAIN_MAX_GAP_MINUTES ||
    s.rules.elevationPreference.join() !== ELEVATION_PREFERENCE.join() ||
    s.rules.riverSiteTypes.join() !== RIVER_SITE_TYPES.join() ||
    s.rules.reservoirSiteTypes.join() !== RESERVOIR_SITE_TYPES.join()
  )
    fail("agua: reglas distintas de las documentadas");
  if (s.contentSha256 !== contentHash(s.data)) fail("agua: el SHA-256 del contenido no coincide");
  const retrieved = t(s.retrievedAt, "agua retrievedAt");
  const attempted = t(s.lastAttempt.at, "agua lastAttempt")!;
  const { stations } = s.data.siteInventory;
  const obs = s.data.observations;
  if (retrieved === null) {
    if (stations.length || obs.length || s.lastAttempt.ok || s.provenance.requests.length)
      fail("agua: sin copia buena pero con datos");
    if (series && Object.keys(series.series).length) fail("agua: series sin copia buena");
    return;
  }
  if (attempted < retrieved) fail("agua: el último intento es anterior a la última copia buena");
  if (s.lastAttempt.ok && attempted !== retrieved) fail("agua: intento exitoso con hora distinta");
  if (!s.lastAttempt.ok && !s.lastAttempt.error) fail("agua: intento fallido sin razón");
  for (const name of ["latest", "locations", "meta"])
    if (!s.provenance.requests.some((r) => r.name === name && r.required))
      fail(`agua: falta la solicitud requerida ${name}`);
  for (const r of s.provenance.requests)
    if (!/^[0-9a-f]{64}$/.test(r.sha256) || r.bytes <= 0 || !r.url.startsWith(WATER.endpoint))
      fail(`agua: solicitud ${r.name} sin huella válida`);
  if ((s.provenance.series === "OK") !== s.provenance.requests.some((r) => r.name === "continuous"))
    fail("agua: estado de las series inconsistente");

  // Stations.
  const stationIds = new Set<string>();
  for (const st of stations) {
    const where = `agua ${st.id}`;
    if (Object.keys(st).join() !== STATION_FIELDS.join())
      fail(`${where}: campos fuera de la lista`);
    if (!/^USGS-\d{8,15}$/.test(st.id)) fail(`${where}: ID de sitio inválido`);
    if (stationIds.has(st.id)) fail(`${where}: estación repetida`);
    stationIds.add(st.id);
    if (
      !(st.latitude >= PR_BOX.minLat && st.latitude <= PR_BOX.maxLat) ||
      !(st.longitude >= PR_BOX.minLon && st.longitude <= PR_BOX.maxLon)
    )
      fail(`${where}: coordenadas fuera de Puerto Rico`);
    if (st.municipio !== null && !municipioIds.has(st.municipio))
      fail(`${where}: municipio inválido`);
    if (st.url !== siteUrl(st.id)) fail(`${where}: enlace distinto del oficial`);
  }

  // Observations.
  const tsids = new Set<string>();
  const pairs = new Set<string>();
  const used = new Set<string>();
  for (const o of obs) {
    const where = `agua ${o.stationId} ${o.parameterCode}`;
    if (Object.keys(o).join() !== OBSERVATION_FIELDS.join())
      fail(`${where}: campos fuera de la lista`);
    const spec =
      PARAMETER_BY_CODE.get(o.parameterCode) ?? fail(`${where}: parámetro fuera de la lista`);
    if (!stationIds.has(o.stationId)) fail(`${where}: estación desconocida`);
    used.add(o.stationId);
    if (tsids.has(o.timeSeriesId)) fail(`${where}: serie repetida`);
    tsids.add(o.timeSeriesId);
    const pair = `${o.stationId}|${spec.kind === "RESERVOIR_ELEVATION" ? "ELEV" : o.parameterCode}`;
    if (pairs.has(pair)) fail(`${where}: dos series del mismo parámetro en la estación`);
    pairs.add(pair);
    if (
      o.kind !== spec.kind ||
      o.unit !== spec.unit ||
      o.statisticId !== spec.statisticId ||
      o.computation !== spec.computation ||
      o.datum !== spec.datum
    )
      fail(`${where}: unidad, estadístico o cómputo distinto del oficial`);
    const st = stations.find((x) => x.id === o.stationId)!;
    const expectedView =
      spec.kind === "PRECIPITATION"
        ? "LLUVIA"
        : RESERVOIR_SITE_TYPES.includes(st.siteTypeCode) && spec.kind !== "DISCHARGE"
          ? "EMBALSES"
          : RIVER_SITE_TYPES.includes(st.siteTypeCode) && spec.kind !== "RESERVOIR_ELEVATION"
            ? "RIOS"
            : null;
    if (o.view !== expectedView) fail(`${where}: vista inconsistente con el tipo de sitio`);
    const observed = t(o.observedAt, `${where} observedAt`)!;
    if (observed > retrieved + SKEW_MS) fail(`${where}: observación en el futuro`);
    if (observed < retrieved - ACTIVE_DAYS * 86400_000) fail(`${where}: serie inactiva publicada`);
    if ((o.value === null) !== (o.valueText === null)) fail(`${where}: valor y texto no coinciden`);
    if (o.valueText !== null && (!NUMBER.test(o.valueText) || Number(o.valueText) !== o.value))
      fail(`${where}: el valor no es el publicado`);
    if (o.approval !== "Provisional" && o.approval !== "Approved")
      fail(`${where}: aprobación inválida`);
    const negative = o.value !== null && o.value < 0;
    if (spec.kind === "PRECIPITATION" && negative !== o.flags.includes("NEGATIVE_PRECIPITATION"))
      fail(`${where}: lluvia negativa sin marcar para revisión`);
    if (spec.kind === "DISCHARGE" && negative !== o.flags.includes("NEGATIVE_DISCHARGE"))
      fail(`${where}: caudal negativo sin marcar para revisión`);
    if (o.trend) {
      if (spec.kind === "PRECIPITATION") fail(`${where}: tendencia en lluvia`);
      if (o.trend.hours !== TREND_HOURS) fail(`${where}: intervalo de tendencia distinto`);
      if (t(o.trend.fromAt, `${where} trend`)! !== observed - TREND_HOURS * 3600_000)
        fail(`${where}: tendencia con hora de inicio inválida`);
      const delta = Number(o.trend.deltaText);
      const direction = delta > 0 ? "UP" : delta < 0 ? "DOWN" : "SAME";
      if (direction !== o.trend.direction)
        fail(`${where}: dirección de la tendencia inconsistente`);
      const d = Math.max(
        ...[o.valueText ?? "", o.trend.fromValueText].map((x) => (x.split(".")[1] ?? "").length),
      );
      if (Math.abs(Number(o.valueText) - Number(o.trend.fromValueText) - delta) > 10 ** -d / 2)
        fail(`${where}: cambio no coincide con los valores`);
    }
    if (o.rain24h) {
      if (spec.kind !== "PRECIPITATION") fail(`${where}: lluvia 24 h en otro parámetro`);
      if (o.rain24h.to !== o.observedAt)
        fail(`${where}: ventana de lluvia no termina en la observación`);
      if (t(o.rain24h.from, `${where} rain`)! !== observed - 86400_000)
        fail(`${where}: ventana de lluvia no es de 24 h`);
      if (o.rain24h.complete !== (o.rain24h.totalText !== null))
        fail(`${where}: total sin cobertura completa`);
    }
    if (s.provenance.series === "UNAVAILABLE" && (o.trend || o.rain24h))
      fail(`${where}: tendencia sin series`);
  }
  for (const id of stationIds) if (!used.has(id)) fail(`agua ${id}: estación sin observaciones`);
  const byView = { RIOS: 0, LLUVIA: 0, EMBALSES: 0 };
  for (const v of Object.keys(byView) as (keyof typeof byView)[])
    byView[v] = new Set(obs.filter((o) => o.view === v).map((o) => o.stationId)).size;
  if (JSON.stringify(byView) !== JSON.stringify(s.data.siteInventory.byView))
    fail("agua: el inventario por vista no coincide");
  if (
    JSON.stringify(countStates(obs, new Date(s.retrievedAt!))) !==
    JSON.stringify(s.stationFreshness.atRetrieval)
  )
    fail("agua: conteos de frescura por estación no coinciden");
  for (const e of s.data.exclusions.listed)
    if (obs.some((o) => e.timeSeriesIds.includes(o.timeSeriesId)))
      fail(`agua ${e.stationId}: serie excluida pero publicada`);

  // Series file.
  if (!series) fail("agua: falta el archivo de series");
  if (series!.schemaVersion !== WATER_SCHEMA_VERSION || series!.hours !== SERIES_HOURS)
    fail("agua: archivo de series con esquema distinto");
  if (series!.retrievedAt !== s.retrievedAt || series!.snapshotContentSha256 !== s.contentSha256)
    fail("agua: el archivo de series no corresponde a esta copia");
  if (series!.contentSha256 !== contentHash(series!.series))
    fail("agua: SHA-256 de series no coincide");
  const lastHour = Math.floor(retrieved / 3600_000) * 3600_000;
  for (const [tsid, sr] of Object.entries(series!.series)) {
    const o =
      obs.find((x) => x.timeSeriesId === tsid) ?? fail(`agua: serie ${tsid} sin observación`);
    if (sr.kind !== (o.kind === "PRECIPITATION" ? "SUM" : "SAMPLE"))
      fail(`agua ${tsid}: tipo de serie`);
    if (sr.values.length !== SERIES_HOURS) fail(`agua ${tsid}: serie de largo distinto`);
    if (t(sr.start, `agua ${tsid} start`)! !== lastHour - (SERIES_HOURS - 1) * 3600_000)
      fail(`agua ${tsid}: serie con inicio inválido`);
    if (sr.values.some((v) => v !== null && !Number.isFinite(v)))
      fail(`agua ${tsid}: valor inválido`);
  }
}

function readRawPages(s: WaterSnapshot, root: string): WaterRaw | null {
  const out: WaterRaw = { latest: [], meta: [], locations: [], continuous: null };
  for (const r of s.provenance.requests) {
    const path = join(root, RAW_CACHE_DIR, `${WATER_RAW_PREFIX}-${r.name}-${r.page}.json`);
    if (!existsSync(path)) return null;
    const text = readFileSync(path, "utf8");
    if (sha256(text) !== r.sha256) return null; // a newer local response; not this snapshot's
    const features = (JSON.parse(text) as { features: WaterRaw["latest"] }).features;
    if (r.name === "continuous") out.continuous = [...(out.continuous ?? []), ...features];
    else out[r.name].push(...features);
  }
  return out;
}

function main() {
  const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
  const census = JSON.parse(
    readFileSync(join(root, "data/generated/census-municipios.json"), "utf8"),
  ) as { municipios: Record<string, unknown> };
  const municipioIds = new Set(Object.keys(census.municipios));
  const s = JSON.parse(readFileSync(join(root, WATER_OUTPUT), "utf8")) as WaterSnapshot;
  const seriesPath = join(root, WATER_SERIES_OUTPUT);
  const series = existsSync(seriesPath)
    ? (JSON.parse(readFileSync(seriesPath, "utf8")) as SeriesFile)
    : null;
  try {
    validateWater(s, series, municipioIds);
    const raw = s.retrievedAt ? readRawPages(s, root) : null;
    if (raw) {
      const again = normalizeWater(raw, s.retrievedAt!, municipioIds);
      if (JSON.stringify(buildData(again)) !== JSON.stringify(s.data))
        throw new Error("agua: normalizar otra vez las respuestas originales no da lo mismo");
      if (series && contentHash(again.series ?? {}) !== series.contentSha256)
        throw new Error("agua: las series no se reproducen desde las respuestas originales");
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
  const f = freshness(s.retrievedAt, new Date(), s.sourceFreshness);
  const c = s.stationFreshness.atRetrieval;
  const fmt = (v: keyof typeof c) =>
    `${v} ${c[v].CURRENT + c[v].AGING}/${c[v].CURRENT + c[v].AGING + c[v].STALE + c[v].NO_DATA}`;
  console.log(
    `Agua válida. Fuente: ${f} (obtenido ${s.retrievedAt ?? "nunca"}). Series con dato reciente al obtener: ${fmt("RIOS")}, ${fmt("LLUVIA")}, ${fmt("EMBALSES")}. Series 24 h: ${s.provenance.series}.`,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
