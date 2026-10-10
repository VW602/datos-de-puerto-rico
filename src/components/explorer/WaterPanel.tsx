import { useEffect, useState } from "react";
import { prTime, ageWords } from "@/data/pr/currentModel";
import { SHAPES, project } from "@/data/pr/geo";
import {
  VIEW_ES,
  hourlyFor,
  loadWaterSeries,
  viewCounts,
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
  STATION_STATE_ES,
  TREND_ES,
  qualifierEs,
  stationPlace,
  unitName,
  unitSymbol,
  valueWithUnit,
  type StationState,
} from "@/data/pr/waterModel";

const VIEWS: WaterView[] = ["RIOS", "LLUVIA", "EMBALSES"];
const SHAPE_ES: Record<WaterView, string> = {
  RIOS: "círculo",
  LLUVIA: "rombo",
  EMBALSES: "cuadrado",
};
const REPORTING = (s: StationState) => s === "CURRENT" || s === "AGING";
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

/** Which measure stands for a station on the map of a view. */
function mapMeasure(row: StationRow): StationRow["measures"][number] {
  const order: Observation["kind"][] = [
    "DISCHARGE",
    "RESERVOIR_ELEVATION",
    "PRECIPITATION",
    "GAGE_HEIGHT",
  ];
  return [...row.measures].sort(
    (a, b) => order.indexOf(a.obs.kind) - order.indexOf(b.obs.kind),
  )[0]!;
}

function Marker({
  view,
  state,
  x,
  y,
}: {
  view: WaterView;
  state: StationState;
  x: number;
  y: number;
}) {
  const r = 13;
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

function LegendGlyph({ view, state }: { view: WaterView; state: StationState }) {
  return (
    <svg viewBox="-20 -20 40 40" className="inline-block h-4 w-4 align-[-3px]" aria-hidden="true">
      <Marker view={view} state={state} x={0} y={0} />
    </svg>
  );
}

function WaterMap({ view, rows }: { view: WaterView; rows: StationRow[] }) {
  const [x0, y0] = project(-67.98, 18.56);
  const [x1, y1] = project(-65.18, 17.84);
  const states = rows.map((row) => mapMeasure(row).state);
  const reporting = states.filter(REPORTING).length;
  return (
    <figure className="mt-3">
      <svg
        viewBox={`${x0} ${y0} ${x1 - x0} ${y1 - y0}`}
        className="block h-auto w-full rounded-[3px] bg-water"
        role="img"
        aria-label={`Mapa de puntos: ${rows.length} estaciones de ${VIEW_ES[view].toLowerCase()} del USGS; ${reporting} con dato reciente. Cada punto es una estación, no un municipio. La tabla debajo tiene todos los datos.`}
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
          const m = mapMeasure(row);
          const [x, y] = project(row.station.longitude, row.station.latitude);
          return (
            <g key={row.station.id}>
              <Marker view={view} state={m.state} x={x} y={y} />
              <title>{`${row.station.name} · ${row.measures
                .map((x) => `${KIND_ES[x.obs.kind]}: ${valueWithUnit(x.obs.valueText, x.obs.unit)}`)
                .join(
                  " · ",
                )} · ${prTime(m.obs.observedAt, true)} · ${STATION_STATE_ES[m.state]}`}</title>
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-1 text-[12px] text-muted">
        Cada {SHAPE_ES[view]} es una estación (un punto), no un municipio; donde no hay estación no
        hay medición, no un cero. <LegendGlyph view={view} state="CURRENT" /> relleno: dato
        reciente. <LegendGlyph view={view} state="STALE" /> vacío: sin dato reciente.{" "}
        <LegendGlyph view={view} state="NO_DATA" /> con equis: sin dato. El tamaño no indica el
        valor.
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

function MeasureCells({
  obs,
  state,
  now,
  series,
}: {
  obs: Observation;
  state: StationState;
  now: Date;
  series: SeriesFile | null;
}) {
  const unit = unitSymbol(obs.unit);
  return (
    <>
      <td className="py-1.5 pr-2 align-top">
        <span className="font-semibold">{KIND_ES[obs.kind]}</span>
        {obs.datum && <span className="block text-[12px] text-muted">{DATUM_ES[obs.datum]}</span>}
        <span className="block text-[12px] text-muted">parámetro {obs.parameterCode}</span>
      </td>
      <td className="py-1.5 pr-2 align-top tabular">
        {obs.valueText === null ? (
          <span className="font-semibold">Sin dato</span>
        ) : (
          <>
            {obs.kind === "PRECIPITATION" && <span className="text-muted">último registro: </span>}
            <span className="font-semibold">{obs.valueText}</span>{" "}
            <abbr title={unitName(obs.unit)}>{unit}</abbr>
          </>
        )}
        <span className="block text-[12px]">
          {APPROVAL_ES[obs.approval]}
          {obs.qualifiers.length > 0 && ` · ${obs.qualifiers.map(qualifierEs).join(", ")}`}
        </span>
        {obs.flags.length > 0 && (
          <span className="block text-[12px] font-semibold text-error">
            Valor negativo publicado por el USGS: se marca para revisión, no se corrige.
          </span>
        )}
      </td>
      <td className="py-1.5 pr-2 align-top tabular">
        {prTime(obs.observedAt, true)}
        <span
          className={`block text-[12px] ${REPORTING(state) ? "text-muted" : "font-semibold text-error"}`}
        >
          {STATION_STATE_ES[state]} ({ageWords(obs.observedAt, now)})
        </span>
      </td>
      <td className="py-1.5 pr-2 align-top text-[14px]">
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
      </td>
      <td className="py-1.5 pr-2 align-top">
        <Sparkline series={hourlyFor(series, obs.timeSeriesId)} />
      </td>
    </>
  );
}

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
    <div
      className="mt-2 max-h-[34rem] overflow-auto focus-visible:outline-2 focus-visible:outline-accent"
      role="region"
      aria-label={`Tabla de estaciones de ${VIEW_ES[view].toLowerCase()} (se desplaza)`}
      tabIndex={0}
    >
      <table className="w-full min-w-[760px] text-[14px]">
        <caption className="sr-only">
          Estaciones de {VIEW_ES[view].toLowerCase()} del USGS, por municipio. Cada medición tiene
          su hora y su estado.
        </caption>
        <thead className="sticky top-0 bg-track">
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
                {i === 0 && (
                  <th
                    scope="row"
                    rowSpan={row.measures.length}
                    className="py-1.5 pr-2 text-left align-top font-normal"
                  >
                    <span className="font-semibold">{row.station.name}</span>
                    <span className="block text-[12px] text-muted">
                      {stationPlace(row.municipio)} · {row.station.id}
                    </span>
                    <a
                      href={row.station.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[12px]"
                      aria-label={`Página del USGS de ${row.station.name}`}
                    >
                      Ficha del USGS ↗
                    </a>
                  </th>
                )}
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

/** "Agua ahora": USGS station measurements, from the last saved snapshot. */
export function WaterBlock({
  now,
  water,
  initialView = "RIOS",
}: {
  now: Date | null;
  water: WaterSnapshot | null | "error";
  initialView?: WaterView;
}) {
  const [view, setView] = useState<WaterView>(initialView);
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
  const s = water && water !== "error" ? water : null;
  const status = s && now ? waterStatus(s, now) : null;
  const rows = s && now ? viewRows(s, view, now) : [];
  const counts = s && now ? viewCounts(s, view, now) : {};
  const usableSeries =
    series && s && series.snapshotContentSha256 === s.contentSha256 ? series : null;
  return (
    <section aria-labelledby="now-water" className="mt-5">
      <h3 id="now-water" className="text-xs font-bold tracking-[0.08em] text-muted uppercase">
        Agua ahora: estaciones del USGS
      </h3>
      <p className="mt-1 text-[14px]">
        <strong>Estas son mediciones de estaciones del USGS; no son avisos de inundación.</strong>{" "}
        Tampoco dicen si hay sequía ni cuánta agua hay para tomar. Los avisos oficiales son las
        alertas del NWS de arriba.
      </p>
      <p className="mt-1 text-[14px]">
        Datos provisionales sujetos a revisión por el USGS: pueden cambiar después de que el USGS
        los revise.{" "}
        <a
          href={s?.source.provisional ?? "https://waterdata.usgs.gov/provisional-data-statement/"}
          target="_blank"
          rel="noreferrer"
        >
          Declaración del USGS sobre datos provisionales ↗
        </a>
      </p>
      {water === null && <p className="mt-2 text-[15px]">Cargando datos de agua…</p>}
      {water === "error" && (
        <p className="mt-2 text-[15px] font-semibold text-error" role="status">
          No se pudieron cargar los datos de agua guardados.
        </p>
      )}
      {s && status?.kind === "UNCONFIRMED" && (
        <p className="mt-2 text-[15px] font-semibold text-error" role="status">
          No se pudieron confirmar las condiciones actuales del agua.
          {s.retrievedAt
            ? ` Lo que sigue es lo último que el USGS publicaba el ${prTime(s.retrievedAt, true)}, con la hora de cada medición.`
            : " No hay ninguna copia del USGS."}
        </p>
      )}
      {s && s.retrievedAt && now && (
        <>
          <div role="group" aria-label="Tipo de estación" className="mt-3 flex flex-wrap gap-1.5">
            {VIEWS.map((key) => (
              <button
                key={key}
                type="button"
                aria-pressed={view === key}
                onClick={() => setView(key)}
                className={`min-h-11 rounded-full border px-4 text-[14px] ${view === key ? "border-fg bg-fg font-semibold text-surface" : "border-divider bg-surface"}`}
              >
                {VIEW_ES[key]} ({s.data.siteInventory.byView[key]})
              </button>
            ))}
          </div>
          <ul className="mt-2 text-[15px]">
            {(
              Object.entries(counts) as [
                Observation["kind"],
                NonNullable<(typeof counts)[Observation["kind"]]>,
              ][]
            ).map(([kind, c]) => (
              <li key={kind}>
                <span className="font-semibold">{KIND_ES[kind]}:</span> {c.reporting} de {c.total}{" "}
                {c.total === 1 ? "estación" : "estaciones"} con dato reciente · sin dato reciente:{" "}
                {c.stale} · sin dato: {c.noData}
              </li>
            ))}
          </ul>
          <p className="mt-1 text-[13px] text-muted">{NOTE[view]}</p>
          <WaterMap view={view} rows={rows} />
          {s.provenance.series === "UNAVAILABLE" && (
            <p className="mt-2 text-[13px] text-muted">
              Las series de 24 horas no estuvieron disponibles en esta actualización; se muestran
              solo los valores más recientes.
            </p>
          )}
          <StationTable view={view} rows={rows} now={now} series={usableSeries} />
          <p className="mt-1 text-[12px] text-muted">
            Cambio: diferencia entre el valor más reciente y el de 3 horas antes en la misma serie,
            con la precisión publicada. Gráfica de 24 h: valores a cada hora en punto (lluvia: suma
            de cada hora), con la escala propia de cada estación.
          </p>
        </>
      )}
      {s && (
        <details className="mt-2 text-[13px]">
          <summary className="flex min-h-11 cursor-pointer items-center font-semibold text-accent">
            ¿De dónde sale este dato?
          </summary>
          <div className="pb-2">
            <p>
              <span lang="en">U.S. Geological Survey</span> (USGS),{" "}
              <span lang="en">Water Data for the Nation</span>: {s.source.service}. Cada fila dice
              el sitio (ID del USGS), el código de parámetro, la unidad, la hora de la medición y si
              el dato es provisional o aprobado.
            </p>
            <p className="mt-1">
              Obtenido: {s.retrievedAt ? prTime(s.retrievedAt) : "nunca"}.
              {!s.lastAttempt.ok && ` Último intento fallido: ${prTime(s.lastAttempt.at)}.`} La hora
              de obtención no es la hora de las mediciones.
            </p>
            <p className="mt-1">
              Reglas: una serie por sitio y parámetro; las series sin datos en 30 días no se
              publican; en embalses se muestra una elevación (PRVD02 en pies primero). Excluidas:{" "}
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
              <a href={s.source.terms} target="_blank" rel="noreferrer">
                Créditos y derechos ↗
              </a>
            </p>
          </div>
        </details>
      )}
    </section>
  );
}
