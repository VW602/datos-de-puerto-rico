import { useEffect, useState } from "react";
import { Disclosure } from "./now/Disclosure";
import { NowRow } from "./now/NowRow";
import { prTime, ageWords } from "@/data/pr/currentModel";
import { SHAPES, project } from "@/data/pr/geo";
import {
  VIEW_ES,
  hourlyFor,
  loadWaterSeries,
  seriesCountsByKind,
  stationMarkerState,
  viewSummary,
  viewRows,
  waterStatus,
  type HourlySeries,
  type Observation,
  type SeriesFile,
  type StationRow,
  type WaterSnapshot,
  type WaterView,
} from "@/data/pr/water";
import {
  APPROVAL_ES,
  DATUM_ES,
  KIND_ES,
  SERIES_STATE_ES,
  TREND_ES,
  qualifierEs,
  stationPlace,
  unitName,
  unitSymbol,
  valueWithUnit,
  type SeriesState,
} from "@/data/pr/waterModel";

const VIEWS: WaterView[] = ["RIOS", "LLUVIA", "EMBALSES"];
const SHAPE_ES: Record<WaterView, string> = {
  RIOS: "círculo",
  LLUVIA: "rombo",
  EMBALSES: "cuadrado",
};
const REPORTING = (s: SeriesState) => s === "CURRENT" || s === "AGING";
const EXCLUSION_ES: Record<string, string> = {
  INACTIVE: `series sin observaciones en los últimos 30 días (descontinuadas o fuera de servicio)`,
  ALTERNATE_DATUM_OR_UNIT:
    "copias de la misma elevación de embalse en otro datum o unidad (se muestra una)",
  AMBIGUOUS_DUPLICATE: "dos series activas del mismo parámetro en un sitio (no se elige una)",
  SITE_TYPE_OUT_OF_SCOPE: "sitios de otro tipo (manantial, desvío, costa)",
  NOT_USGS: "sitios de otra agencia",
  NO_METADATA: "series sin metadatos",
  NO_SITE_METADATA: "sitios sin metadatos",
  METADATA_MISMATCH: "series cuyo significado no es el esperado",
  INVALID_COORDINATES: "coordenadas inválidas",
  INVALID_VALUE: "valores no numéricos",
  FUTURE_OBSERVATION: "observaciones con hora futura",
};

function Marker({
  view,
  state,
  x,
  y,
}: {
  view: WaterView;
  state: SeriesState;
  x: number;
  y: number;
}) {
  const r = 10;
  const filled = REPORTING(state);
  const common = {
    fill: filled ? "var(--color-accent)" : "var(--color-surface)",
    stroke: filled ? "#fff" : "var(--color-fg)",
    strokeWidth: 3.5,
  };
  const shape =
    view === "RIOS" ? (
      <circle cx={x} cy={y} r={r} {...common} />
    ) : view === "LLUVIA" ? (
      <path
        d={`M${x} ${y - r * 1.25}L${x + r * 1.25} ${y}L${x} ${y + r * 1.25}L${x - r * 1.25} ${y}Z`}
        {...common}
      />
    ) : (
      <rect x={x - r} y={y - r} width={r * 2} height={r * 2} {...common} />
    );
  return (
    <>
      {shape}
      {state === "NO_DATA" && (
        <path
          d={`M${x - r * 0.7} ${y - r * 0.7}L${x + r * 0.7} ${y + r * 0.7}M${x + r * 0.7} ${y - r * 0.7}L${x - r * 0.7} ${y + r * 0.7}`}
          stroke="var(--color-fg)"
          strokeWidth={3}
        />
      )}
    </>
  );
}

function LegendGlyph({ view, state }: { view: WaterView; state: SeriesState }) {
  return (
    <svg viewBox="-20 -20 40 40" className="inline-block h-4 w-4 align-[-3px]" aria-hidden="true">
      <Marker view={view} state={state} x={0} y={0} />
    </svg>
  );
}

function WaterMap({ view, rows }: { view: WaterView; rows: StationRow[] }) {
  const [x0, y0] = project(-67.98, 18.56);
  const [x1, y1] = project(-65.18, 17.84);
  // One marker per unique station (site ID), whatever its number of series.
  const states = rows.map(stationMarkerState);
  const allCurrent = states.filter(REPORTING).length;
  return (
    <figure className="mt-3 max-w-[760px]">
      <svg
        viewBox={`${x0} ${y0} ${x1 - x0} ${y1 - y0}`}
        className="block h-auto w-full rounded-[3px] bg-water"
        role="img"
        aria-label={`Mapa de puntos: ${rows.length} ${rows.length === 1 ? "estación" : "estaciones"} de ${VIEW_ES[view].toLowerCase()} del USGS, un punto por estación; ${allCurrent} con todas sus mediciones al día. Cada punto es una estación, no un municipio. La lista debajo tiene cada medición.`}
      >
        {SHAPES.map((shape) => (
          <path
            key={shape.id}
            d={shape.d}
            fill="var(--color-island)"
            stroke="var(--color-coast)"
            strokeWidth={1.5}
          />
        ))}
        {rows.map((row) => {
          const [x, y] = project(row.station.longitude, row.station.latitude);
          return (
            <g key={row.station.id} data-station={row.station.id}>
              <Marker view={view} state={stationMarkerState(row)} x={x} y={y} />
              <title>{`${row.station.name} · ${row.measures
                .map(
                  (m) =>
                    `${KIND_ES[m.obs.kind]}: ${valueWithUnit(m.obs.valueText, m.obs.unit)}, ${prTime(m.obs.observedAt, true)}, ${SERIES_STATE_ES[m.state].toLowerCase()}`,
                )
                .join(" · ")}`}</title>
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-1 text-[12px] text-muted">
        Cada {SHAPE_ES[view]} es una estación (un punto), no un municipio; donde no hay estación no
        hay medición, no un cero. <LegendGlyph view={view} state="CURRENT" /> relleno: todas sus
        mediciones con dato reciente. <LegendGlyph view={view} state="STALE" /> vacío: alguna
        medición sin dato reciente o sin dato. <LegendGlyph view={view} state="NO_DATA" /> con
        equis: ninguna medición con dato. El tamaño no indica el valor; los puntos cercanos pueden
        encimarse, y la lista tiene cada estación.
      </figcaption>
    </figure>
  );
}

/** A 24-hour sparkline on the series' own scale (never shared across stations or measures). */
function Sparkline({ series }: { series: HourlySeries | null }) {
  if (!series) return <span className="text-muted">—</span>;
  const vals = series.values;
  const nums = vals.filter((v): v is number => v !== null);
  if (nums.length < 2) return <span className="text-muted">—</span>;
  const w = 96;
  const h = 24;
  const step = w / (vals.length - 1);
  if (series.kind === "SUM") {
    const max = Math.max(...nums, 0.01);
    return (
      <svg viewBox={`0 0 ${w} ${h}`} className="h-6 w-24" aria-hidden="true">
        <line x1={0} x2={w} y1={h - 0.5} y2={h - 0.5} stroke="var(--color-divider)" />
        {vals.map((v, i) =>
          v === null ? null : (
            <rect
              key={i}
              x={i * (w / vals.length)}
              y={h - (v / max) * (h - 1)}
              width={w / vals.length - 1}
              height={(v / max) * (h - 1)}
              fill="var(--color-fg)"
            />
          ),
        )}
      </svg>
    );
  }
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const span = max - min || 1;
  const segments: string[] = [];
  let current = "";
  vals.forEach((v, i) => {
    if (v === null) {
      if (current) segments.push(current);
      current = "";
      return;
    }
    const y = max === min ? h / 2 : h - 2 - ((v - min) / span) * (h - 4);
    current += `${current ? "L" : "M"}${(i * step).toFixed(1)} ${y.toFixed(1)}`;
  });
  if (current) segments.push(current);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-6 w-24" aria-hidden="true">
      {segments.map((d, i) => (
        <path key={i} d={d} fill="none" stroke="var(--color-fg)" strokeWidth={1.5} />
      ))}
    </svg>
  );
}

type MeasureProps = {
  obs: Observation;
  state: SeriesState;
  now: Date;
  series: SeriesFile | null;
};

/** The five pieces of one measurement, laid out as table cells or stacked in a card. */
function measureParts({ obs, state, now, series }: MeasureProps) {
  const unit = unitSymbol(obs.unit);
  return {
    label: (
      <>
        <span className="font-semibold">{KIND_ES[obs.kind]}</span>
        {obs.datum && <span className="block text-[12px] text-muted">{DATUM_ES[obs.datum]}</span>}
        <span className="block text-[12px] text-muted">parámetro {obs.parameterCode}</span>
      </>
    ),
    value: (
      <>
        <ValueMain obs={obs} />
        <span className="block text-[12px]">
          {APPROVAL_ES[obs.approval]}
          {obs.qualifiers.length > 0 && ` · ${obs.qualifiers.map(qualifierEs).join(", ")}`}
        </span>
        {obs.flags.length > 0 && (
          <span className="block text-[12px] font-semibold text-error">
            Valor negativo publicado por el USGS: se marca para revisión, no se corrige.
          </span>
        )}
      </>
    ),
    time: (
      <>
        {prTime(obs.observedAt, true)}
        <span
          className={`block text-[12px] ${REPORTING(state) ? "text-muted" : "font-semibold text-error"}`}
        >
          {SERIES_STATE_ES[state]} ({ageWords(obs.observedAt, now)})
        </span>
      </>
    ),
    change: (
      <>
        {obs.kind === "PRECIPITATION" ? (
          obs.rain24h ? (
            obs.rain24h.totalText !== null ? (
              <>
                <span className="font-semibold tabular">{obs.rain24h.totalText}</span>{" "}
                <abbr title={unitName(obs.unit)}>{unit}</abbr>
                <span className="block text-[12px] text-muted">
                  en 24 h hasta {prTime(obs.rain24h.to, true)}
                </span>
              </>
            ) : (
              <span className="text-muted">
                Total de 24 h no disponible (registros incompletos)
              </span>
            )
          ) : (
            <span className="text-muted">—</span>
          )
        ) : obs.trend ? (
          <>
            {TREND_ES[obs.trend.direction]}
            {obs.trend.direction !== "SAME" && (
              <span className="tabular">
                {" "}
                ({obs.trend.deltaText.startsWith("-") ? "−" : "+"}
                {obs.trend.deltaText.replace("-", "")} {unit})
              </span>
            )}
            <span className="block text-[12px] text-muted">
              en 3 h, desde {obs.trend.fromValueText} {unit}
            </span>
          </>
        ) : (
          <span className="text-muted">—</span>
        )}
      </>
    ),
    spark: (
      <>
        <Sparkline series={hourlyFor(series, obs.timeSeriesId)} />
      </>
    ),
  };
}

const CELL = "py-1.5 pr-2 align-top";
function MeasureCells(props: MeasureProps) {
  const p = measureParts(props);
  return (
    <>
      <td className={CELL}>{p.label}</td>
      <td className={`${CELL} tabular`}>{p.value}</td>
      <td className={`${CELL} tabular`}>{p.time}</td>
      <td className={`${CELL} text-[14px]`}>{p.change}</td>
      <td className={CELL}>{p.spark}</td>
    </>
  );
}

/** The value as published, with its unit; no value is "Sin dato", never 0. */
function ValueMain({ obs }: { obs: Observation }) {
  return obs.valueText === null ? (
    <span className="font-semibold">Sin dato</span>
  ) : (
    <>
      {obs.kind === "PRECIPITATION" && <span className="text-muted">último registro: </span>}
      <span className="font-semibold">{obs.valueText}</span>{" "}
      <abbr title={unitName(obs.unit)}>{unitSymbol(obs.unit)}</abbr>
    </>
  );
}

/**
 * Card layout, three short lines: the measure and its value; its state,
 * time and status; then the change (or 24-hour rain) and the 24-hour line.
 */
function MeasureStack(props: MeasureProps) {
  const { obs, state, now } = props;
  const p = measureParts(props);
  return (
    <div className="text-[14px]">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span>
          <span className="font-semibold">{KIND_ES[obs.kind]}</span>
          {obs.datum && <span className="text-[12px] text-muted"> {DATUM_ES[obs.datum]}</span>}
        </span>
        <span className="tabular">
          <ValueMain obs={obs} />
        </span>
      </div>
      <p className="text-[12px] text-muted">
        <span className={REPORTING(state) ? "" : "font-semibold text-error"}>
          {SERIES_STATE_ES[state]}
        </span>{" "}
        · {prTime(obs.observedAt, true)} ({ageWords(obs.observedAt, now)}) ·{" "}
        {APPROVAL_ES[obs.approval]}
        {obs.qualifiers.length > 0 && ` · ${obs.qualifiers.map(qualifierEs).join(", ")}`} ·
        parámetro {obs.parameterCode}
      </p>
      {obs.flags.length > 0 && (
        <p className="text-[12px] font-semibold text-error">
          Valor negativo publicado por el USGS: se marca para revisión, no se corrige.
        </p>
      )}
      {(obs.trend || obs.rain24h || hourlyFor(props.series, obs.timeSeriesId)) && (
        <div className="mt-0.5 flex items-end justify-between gap-3">
          <div className="min-w-0">{p.change}</div>
          <div className="shrink-0">{p.spark}</div>
        </div>
      )}
    </div>
  );
}

/** Stations shown at first; the rest are one click away. */
const FIRST_STATIONS = 8;

function StationHeader({ row, as: Tag = "p" }: { row: StationRow; as?: "p" | "th" }) {
  const body = (
    <>
      <span className="font-semibold break-words" lang="en">
        {row.station.name}
      </span>
      <span className="block text-[12px] text-muted">
        {stationPlace(row.municipio)} · {row.station.id} ·{" "}
        <a
          href={row.station.url}
          target="_blank"
          rel="noreferrer"
          aria-label={`Página del USGS de ${row.station.name}`}
        >
          Ficha del USGS ↗
        </a>
      </span>
    </>
  );
  return Tag === "th" ? (
    <th
      scope="row"
      rowSpan={row.measures.length}
      className="py-1.5 pr-2 text-left align-top font-normal"
    >
      {body}
    </th>
  ) : (
    <p>{body}</p>
  );
}

/**
 * Phones, tablets and narrow desktops: one card per station, its measurements
 * stacked inside. Nothing scrolls sideways.
 */
function StationCards({
  rows,
  now,
  series,
}: {
  rows: StationRow[];
  now: Date;
  series: SeriesFile | null;
}) {
  return (
    <ul className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2 xl:hidden" data-layout="cards">
      {rows.map((row) => (
        <li
          key={row.station.id}
          className="rounded-[3px] border border-divider bg-surface px-3 py-2"
        >
          <StationHeader row={row} />
          <ul className="mt-1" aria-label={`Mediciones de ${row.station.name}`}>
            {row.measures.map((m) => (
              <li key={m.obs.timeSeriesId} className="border-t border-divider-2 py-1.5">
                <MeasureStack obs={m.obs} state={m.state} now={now} series={series} />
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}

/** Wide screens: one table, one row per measurement, grouped under its station. */
function StationTable({
  view,
  rows,
  now,
  series,
}: {
  view: WaterView;
  rows: StationRow[];
  now: Date;
  series: SeriesFile | null;
}) {
  return (
    <div className="mt-2 hidden xl:block" data-layout="table">
      <table className="w-full table-fixed text-[14px]">
        <colgroup>
          <col className="w-[28%]" />
          <col className="w-[17%]" />
          <col className="w-[17%]" />
          <col className="w-[15%]" />
          <col className="w-[13%]" />
          <col className="w-[10%]" />
        </colgroup>
        <caption className="sr-only">
          Mediciones de {VIEW_ES[view].toLowerCase()} del USGS. Cada fila es una medición; las de
          una misma estación van juntas bajo su nombre. Por municipio. Cada medición tiene su hora y
          su estado.
        </caption>
        <thead>
          <tr className="border-b border-divider-2 text-left text-[12px] text-muted">
            <th scope="col" className="py-1 pr-2 font-normal">
              Estación
            </th>
            <th scope="col" className="py-1 pr-2 font-normal">
              Medición
            </th>
            <th scope="col" className="py-1 pr-2 font-normal">
              Valor
            </th>
            <th scope="col" className="py-1 pr-2 font-normal">
              Hora de la medición (PR)
            </th>
            <th scope="col" className="py-1 pr-2 font-normal">
              {view === "LLUVIA" ? "Lluvia 24 h" : "Cambio"}
            </th>
            <th scope="col" className="py-1 pr-2 font-normal">
              24 h <span className="sr-only">(gráfica, escala propia)</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) =>
            row.measures.map((m, i) => (
              <tr key={m.obs.timeSeriesId} className={i === 0 ? "border-t border-divider" : ""}>
                {i === 0 && <StationHeader row={row} as="th" />}
                <MeasureCells obs={m.obs} state={m.state} now={now} series={series} />
              </tr>
            )),
          )}
        </tbody>
      </table>
    </div>
  );
}

const NOTE: Record<WaterView, string> = {
  RIOS: "El caudal es el volumen de agua que pasa por el medidor, en pies cúbicos por segundo (ft³/s). La altura del medidor es el nivel del agua leído en el medidor, sobre su propio punto de referencia: no es la profundidad del río ni un nivel de inundación. Un valor alto no es, por sí solo, un aviso.",
  LLUVIA:
    "El USGS publica la lluvia en incrementos de 15 minutos (pulgadas). El total de 24 horas se da solo cuando esos registros cubren todo el periodo, hasta la última observación de cada estación. Cada estación se muestra por separado: no se suman ni se ordenan estaciones entre sí.",
  EMBALSES:
    "Elevación de la superficie del agua sobre el datum indicado (o la altura del medidor). No es un porcentaje de llenado: el USGS no publica aquí la capacidad del embalse, y este sitio no la calcula.",
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * The water detail: modes, map and every measurement. Mounted only when the
 * reader opens it, so the 24-hour series file is fetched only then.
 */
export function WaterDetails({
  water: s,
  now,
  initialView = "RIOS",
  initialShowAll = false,
}: {
  water: WaterSnapshot;
  now: Date;
  initialView?: WaterView;
  initialShowAll?: boolean;
}) {
  const [view, setView] = useState<WaterView>(initialView);
  const [showAll, setShowAll] = useState(initialShowAll);
  const [series, setSeries] = useState<SeriesFile | null>(null);
  useEffect(() => {
    let live = true;
    loadWaterSeries()
      .then((f) => live && setSeries(f))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  const rows = viewRows(s, view, now);
  const summary = viewSummary(s, view, now);
  const counts = seriesCountsByKind(s, view, now);
  const shown = showAll ? rows : rows.slice(0, FIRST_STATIONS);
  const usableSeries = series && series.snapshotContentSha256 === s.contentSha256 ? series : null;
  return (
    <div className="pb-1">
      <p className="text-[14px]">
        <strong>Estas son mediciones de estaciones del USGS; no son avisos de inundación.</strong>{" "}
        Tampoco dicen si hay sequía ni cuánta agua hay para tomar. Datos provisionales sujetos a
        revisión por el USGS.{" "}
        <a href={s.source.provisional} target="_blank" rel="noreferrer">
          Qué significa «provisional» ↗
        </a>
      </p>
      <div role="group" aria-label="Tipo de estación" className="mt-2 flex flex-wrap gap-1.5">
        {VIEWS.map((key) => (
          <button
            key={key}
            type="button"
            aria-pressed={view === key}
            onClick={() => {
              setView(key);
              setShowAll(false);
            }}
            className={`min-h-11 rounded-full border px-4 text-[14px] ${view === key ? "border-fg bg-fg font-semibold text-surface" : "border-divider bg-surface"}`}
          >
            {VIEW_ES[key]} · {plural(s.data.siteInventory.byView[key], "estación", "estaciones")}
          </button>
        ))}
      </div>
      {summary.stationCount === 0 ? (
        <p className="mt-2 text-[15px]">
          Ninguna estación de {VIEW_ES[view].toLowerCase()} con medición publicada en esta copia del
          USGS.
        </p>
      ) : (
        <>
          <p className="mt-2 max-w-[72ch] text-[15px]">
            <strong>{plural(summary.stationCount, "estación", "estaciones")} monitoreadas</strong>{" "}
            con <strong>{plural(summary.series.seriesCount, "medición", "mediciones")}</strong>:{" "}
            {summary.series.reporting} con dato reciente · {summary.series.stale} sin dato reciente
            · {summary.series.noData} sin dato.
          </p>
          <ul className="max-w-[72ch] text-[15px]">
            {(
              Object.entries(counts) as [
                Observation["kind"],
                NonNullable<(typeof counts)[Observation["kind"]]>,
              ][]
            ).map(([kind, c]) => (
              <li key={kind}>
                <span className="font-semibold">{KIND_ES[kind]}:</span> {c.reporting} de{" "}
                {plural(c.seriesCount, "medición", "mediciones")} con dato reciente · sin dato
                reciente: {c.stale} · sin dato: {c.noData}
              </li>
            ))}
          </ul>
          <p className="mt-1 max-w-[72ch] text-[13px] text-muted">
            {NOTE[view]} Una estación puede tener más de una medición (por ejemplo, caudal y altura
            del medidor); el estado se da por medición, para que una al día no esconda otra sin dato
            en la misma estación.
          </p>
          <WaterMap view={view} rows={rows} />
          {s.provenance.series === "UNAVAILABLE" && (
            <p className="mt-2 text-[13px] text-muted">
              Las series de 24 horas no estuvieron disponibles en esta actualización; se muestran
              solo los valores más recientes.
            </p>
          )}
          <h4 className="mt-3 text-[14px] font-semibold">
            Mediciones por estación ({VIEW_ES[view].toLowerCase()}, por municipio)
          </h4>
          <StationCards rows={shown} now={now} series={usableSeries} />
          <StationTable view={view} rows={shown} now={now} series={usableSeries} />
          {rows.length > FIRST_STATIONS && (
            <button
              type="button"
              aria-expanded={showAll}
              onClick={() => setShowAll((x) => !x)}
              className="mt-2 flex min-h-11 items-center font-semibold text-accent"
            >
              {showAll
                ? "Mostrar menos"
                : `Mostrar las ${rows.length} estaciones (${FIRST_STATIONS} a la vista)`}
            </button>
          )}
          <p className="mt-1 max-w-[72ch] text-[12px] text-muted">
            Cambio: diferencia entre el valor más reciente y el de 3 horas antes en la misma serie,
            con la precisión publicada. Gráfica de 24 h: valores a cada hora en punto (lluvia: suma
            de cada hora), con la escala propia de cada estación.
          </p>
        </>
      )}
    </div>
  );
}

/**
 * Level 3: current observations. Visible: how many stations and measurements
 * each kind has and how many report now. Map and measurements: one click away.
 */
export function WaterSection({
  water,
  now,
}: {
  water: WaterSnapshot | null | "error";
  now: Date | null;
}) {
  const s = water && water !== "error" ? water : null;
  const status = s && now ? waterStatus(s, now) : null;
  return (
    <NowRow id="now-water" title="Agua (USGS)">
      {water === null && <p className="text-[15px] text-muted">Cargando datos de agua…</p>}
      {water === "error" && (
        <p className="text-[15px] font-semibold text-error" role="status">
          No se pudieron cargar los datos de agua guardados.
        </p>
      )}
      {s && !now && (
        <p className="text-[15px] text-muted">Comprobando la antigüedad de la última copia…</p>
      )}
      {s && status?.kind === "UNCONFIRMED" && (
        <p className="text-[15px] font-semibold text-error" role="status">
          No se pudieron confirmar las condiciones actuales del agua.
          {s.retrievedAt
            ? ` Según la última copia del USGS (${prTime(s.retrievedAt, true)}), con la hora de cada medición:`
            : " No hay ninguna copia del USGS."}
        </p>
      )}
      {s && s.retrievedAt && now && (
        <>
          <ul className="text-[15px]" aria-label="Estaciones y mediciones de agua">
            {VIEWS.map((v) => {
              const sum = viewSummary(s, v, now);
              return (
                <li key={v}>
                  <span className="font-semibold">{VIEW_ES[v]}:</span>{" "}
                  {sum.stationCount === 0
                    ? "ninguna estación con medición publicada"
                    : `${plural(sum.stationCount, "estación", "estaciones")} · ${sum.series.reporting} de ${plural(sum.series.seriesCount, "medición", "mediciones")} con dato reciente`}
                </li>
              );
            })}
          </ul>
          <Disclosure label="Ver estaciones de agua: mapa y mediciones">
            <WaterDetails water={s} now={now} />
          </Disclosure>
        </>
      )}
    </NowRow>
  );
}

/** Water part of "¿De dónde salen estos datos?". */
export function WaterProvenance({ water: s }: { water: WaterSnapshot }) {
  return (
    <div>
      <p>
        <span lang="en">U.S. Geological Survey</span> (USGS),{" "}
        <span lang="en">Water Data for the Nation</span>: {s.source.service}. Cada medición dice su
        estación (ID del USGS), el código de parámetro, la unidad, la hora de la medición y si el
        dato es provisional o aprobado.
      </p>
      <p className="mt-1">
        Obtenido: {s.retrievedAt ? prTime(s.retrievedAt) : "nunca"}.
        {!s.lastAttempt.ok && ` Último intento fallido: ${prTime(s.lastAttempt.at)}.`} La hora de
        obtención no es la hora de las mediciones.
      </p>
      <p className="mt-1">
        Reglas: una serie por sitio y parámetro; las series sin datos en 30 días no se publican; en
        embalses se muestra una elevación (PRVD02 en pies primero). Excluidas:{" "}
        {Object.entries(s.data.exclusions.counts)
          .filter(([, n]) => n > 0)
          .map(([reason, n]) => `${n} ${EXCLUSION_ES[reason] ?? reason}`)
          .join("; ")}
        .
      </p>
      {s.data.exclusions.listed.length > 0 && (
        <ul className="mt-1 list-disc pl-5">
          {s.data.exclusions.listed.map((e) => (
            <li key={`${e.stationId}-${e.parameterCode}-${e.reason}`}>
              {e.stationId}, parámetro {e.parameterCode}: {e.detail}.
            </li>
          ))}
        </ul>
      )}
      <p className="mt-1">
        {s.source.attribution}{" "}
        <a href={s.source.docs} target="_blank" rel="noreferrer">
          Documentación de la API ↗
        </a>{" "}
        <a href={s.source.web} target="_blank" rel="noreferrer">
          Datos de agua del USGS para Puerto Rico ↗
        </a>{" "}
        <a href={s.source.provisional} target="_blank" rel="noreferrer">
          Datos provisionales ↗
        </a>{" "}
        <a href={s.source.terms} target="_blank" rel="noreferrer">
          Créditos y derechos ↗
        </a>
      </p>
    </div>
  );
}
