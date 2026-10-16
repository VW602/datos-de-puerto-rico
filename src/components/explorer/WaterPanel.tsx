import { useEffect, useState } from "react";
import { Disclosure } from "./now/Disclosure";
import { NowRow } from "./now/NowRow";
import { prTime, ageWords } from "@/data/pr/currentModel";
import { SHAPES, project } from "@/data/pr/geo";
import {
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
import { unitSymbol, type SeriesState } from "@/data/pr/waterModel";
import { useLocale } from "@/i18n/context";
import { plural } from "@/i18n/format";
import type { Locale } from "@/i18n/locale";
import { NOW_MESSAGES } from "@/i18n/messages/now";
import { WATER_MESSAGES, exclusionDetailEn } from "@/i18n/messages/water";
import { Attribution } from "./now/Provenance";

const VIEWS: WaterView[] = ["RIOS", "LLUVIA", "EMBALSES"];
const REPORTING = (s: SeriesState) => s === "CURRENT" || s === "AGING";

/** Water wording for the reader's language, with the small lookups the panel needs. */
function useWater() {
  const locale = useLocale();
  const t = WATER_MESSAGES[locale];
  return {
    locale,
    t,
    unitName: (unit: string) => t.units[unit] ?? unit,
    qualifier: (q: string) => t.qualifiers[q] ?? q,
    valueWithUnit: (valueText: string | null, unit: string) =>
      valueText === null ? t.noValue : `${valueText} ${unitSymbol(unit)}`,
    stations: (n: number) => plural(n, t.station.one, t.station.many),
    measurements: (n: number) => plural(n, t.measurement.one, t.measurement.many),
    time: (iso: string | null, short = false) => prTime(iso, short, locale),
    age: (iso: string, now: Date) => ageWords(iso, now, locale as Locale),
  };
}

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
  const w = useWater();
  const t = w.t;
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
        aria-label={t.mapLabel(rows.length, t.viewsLower[view], allCurrent)}
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
                    `${t.kinds[m.obs.kind]}: ${w.valueWithUnit(m.obs.valueText, m.obs.unit)}, ${w.time(m.obs.observedAt, true)}, ${t.seriesStateLower[m.state]}`,
                )
                .join(" · ")}`}</title>
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-1 text-[12px] text-muted">
        {t.caption.each(t.shapes[view])}
        <LegendGlyph view={view} state="CURRENT" />
        {t.caption.filled}
        <LegendGlyph view={view} state="STALE" />
        {t.caption.open}
        <LegendGlyph view={view} state="NO_DATA" />
        {t.caption.cross}
        {t.caption.size}
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
function measureParts({ obs, state, now, series }: MeasureProps, w: ReturnType<typeof useWater>) {
  const t = w.t;
  const unit = unitSymbol(obs.unit);
  return {
    label: (
      <>
        <span className="font-semibold">{t.kinds[obs.kind]}</span>
        {obs.datum && <span className="block text-[12px] text-muted">{t.datums[obs.datum]}</span>}
        <span className="block text-[12px] text-muted">
          {t.parameter} {obs.parameterCode}
        </span>
      </>
    ),
    value: (
      <>
        <ValueMain obs={obs} />
        <span className="block text-[12px]">
          {t.approval[obs.approval]}
          {obs.qualifiers.length > 0 && ` · ${obs.qualifiers.map(w.qualifier).join(", ")}`}
        </span>
        {obs.flags.length > 0 && (
          <span className="block text-[12px] font-semibold text-error">{t.negativeFlag}</span>
        )}
      </>
    ),
    time: (
      <>
        {w.time(obs.observedAt, true)}
        <span
          className={`block text-[12px] ${REPORTING(state) ? "text-muted" : "font-semibold text-error"}`}
        >
          {t.seriesState[state]} ({w.age(obs.observedAt, now)})
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
                <abbr title={w.unitName(obs.unit)}>{unit}</abbr>
                <span className="block text-[12px] text-muted">
                  {t.rainIn24(w.time(obs.rain24h.to, true))}
                </span>
              </>
            ) : (
              <span className="text-muted">{t.rainUnavailable}</span>
            )
          ) : (
            <span className="text-muted">—</span>
          )
        ) : obs.trend ? (
          <>
            {t.trend[obs.trend.direction]}
            {obs.trend.direction !== "SAME" && (
              <span className="tabular">
                {" "}
                ({obs.trend.deltaText.startsWith("-") ? "−" : "+"}
                {obs.trend.deltaText.replace("-", "")} {unit})
              </span>
            )}
            <span className="block text-[12px] text-muted">
              {t.trendSince(obs.trend.fromValueText, unit)}
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
  const p = measureParts(props, useWater());
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
  const w = useWater();
  return obs.valueText === null ? (
    <span className="font-semibold">{w.t.noValueTitle}</span>
  ) : (
    <>
      {obs.kind === "PRECIPITATION" && <span className="text-muted">{w.t.lastRecord}</span>}
      <span className="font-semibold">{obs.valueText}</span>{" "}
      <abbr title={w.unitName(obs.unit)}>{unitSymbol(obs.unit)}</abbr>
    </>
  );
}

/**
 * Card layout, three short lines: the measure and its value; its state,
 * time and status; then the change (or 24-hour rain) and the 24-hour line.
 */
function MeasureStack(props: MeasureProps) {
  const { obs, state, now } = props;
  const w = useWater();
  const t = w.t;
  const p = measureParts(props, w);
  return (
    <div className="text-[14px]">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span>
          <span className="font-semibold">{t.kinds[obs.kind]}</span>
          {obs.datum && <span className="text-[12px] text-muted"> {t.datums[obs.datum]}</span>}
        </span>
        <span className="tabular">
          <ValueMain obs={obs} />
        </span>
      </div>
      <p className="text-[12px] text-muted">
        <span className={REPORTING(state) ? "" : "font-semibold text-error"}>
          {t.seriesState[state]}
        </span>{" "}
        · {w.time(obs.observedAt, true)} ({w.age(obs.observedAt, now)}) · {t.approval[obs.approval]}
        {obs.qualifiers.length > 0 && ` · ${obs.qualifiers.map(w.qualifier).join(", ")}`} ·{" "}
        {t.parameter} {obs.parameterCode}
      </p>
      {obs.flags.length > 0 && (
        <p className="text-[12px] font-semibold text-error">{t.negativeFlag}</p>
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
  const t = useWater().t;
  const body = (
    <>
      <span className="font-semibold break-words" lang="en">
        {row.station.name}
      </span>
      <span className="block text-[12px] text-muted">
        {row.municipio ? t.stationIn(row.municipio) : t.stationNoMunicipio} · {row.station.id} ·{" "}
        <a
          href={row.station.url}
          target="_blank"
          rel="noreferrer"
          aria-label={t.usgsPageLabel(row.station.name)}
        >
          {t.usgsPage}
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
  const t = useWater().t;
  return (
    <ul className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2 xl:hidden" data-layout="cards">
      {rows.map((row) => (
        <li
          key={row.station.id}
          className="rounded-[3px] border border-divider bg-surface px-3 py-2"
        >
          <StationHeader row={row} />
          <ul className="mt-1" aria-label={t.measurementsOf(row.station.name)}>
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
  const t = useWater().t;
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
        <caption className="sr-only">{t.table.caption(t.viewsLower[view])}</caption>
        <thead>
          <tr className="border-b border-divider-2 text-left text-[12px] text-muted">
            <th scope="col" className="py-1 pr-2 font-normal">
              {t.table.station}
            </th>
            <th scope="col" className="py-1 pr-2 font-normal">
              {t.table.measure}
            </th>
            <th scope="col" className="py-1 pr-2 font-normal">
              {t.table.value}
            </th>
            <th scope="col" className="py-1 pr-2 font-normal">
              {t.table.time}
            </th>
            <th scope="col" className="py-1 pr-2 font-normal">
              {view === "LLUVIA" ? t.table.rain24 : t.table.change}
            </th>
            <th scope="col" className="py-1 pr-2 font-normal">
              {t.table.spark} <span className="sr-only">{t.table.sparkHidden}</span>
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
  const w = useWater();
  const t = w.t;
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
        <strong>{t.details.notWarnings}</strong> {t.details.notDrought}{" "}
        <a href={s.source.provisional} target="_blank" rel="noreferrer">
          {t.details.provisionalLink}
        </a>
      </p>
      <div role="group" aria-label={t.details.stationType} className="mt-2 flex flex-wrap gap-1.5">
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
            {t.views[key]} · {w.stations(s.data.siteInventory.byView[key])}
          </button>
        ))}
      </div>
      {summary.stationCount === 0 ? (
        <p className="mt-2 text-[15px]">{t.details.noStations(t.viewsLower[view])}</p>
      ) : (
        <>
          <p className="mt-2 max-w-[72ch] text-[15px]">
            <strong>
              {w.stations(summary.stationCount)} {t.details.monitored}
            </strong>{" "}
            {t.details.with} <strong>{w.measurements(summary.series.seriesCount)}</strong>:{" "}
            {t.details.tally(summary.series.reporting, summary.series.stale, summary.series.noData)}
          </p>
          <ul className="max-w-[72ch] text-[15px]">
            {(
              Object.entries(counts) as [
                Observation["kind"],
                NonNullable<(typeof counts)[Observation["kind"]]>,
              ][]
            ).map(([kind, c]) => (
              <li key={kind}>
                <span className="font-semibold">{t.kinds[kind]}:</span>{" "}
                {t.details.kindTally(c.reporting, w.measurements(c.seriesCount), c.stale, c.noData)}
              </li>
            ))}
          </ul>
          <p className="mt-1 max-w-[72ch] text-[13px] text-muted">
            {t.notes[view]} {t.details.perSeries}
          </p>
          <WaterMap view={view} rows={rows} />
          {s.provenance.series === "UNAVAILABLE" && (
            <p className="mt-2 text-[13px] text-muted">{t.details.seriesUnavailable}</p>
          )}
          <h4 className="mt-3 text-[14px] font-semibold">
            {t.details.byStation(t.viewsLower[view])}
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
              {showAll ? t.details.showLess : t.details.showAll(rows.length, FIRST_STATIONS)}
            </button>
          )}
          <p className="mt-1 max-w-[72ch] text-[12px] text-muted">{t.details.changeNote}</p>
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
  const w = useWater();
  const t = w.t;
  return (
    <NowRow id="now-water" title={t.title}>
      {water === null && <p className="text-[15px] text-muted">{t.section.loading}</p>}
      {water === "error" && (
        <p className="text-[15px] font-semibold text-error" role="status">
          {t.section.loadFailed}
        </p>
      )}
      {s && !now && <p className="text-[15px] text-muted">{NOW_MESSAGES[w.locale].checking}</p>}
      {s && status?.kind === "UNCONFIRMED" && (
        <p className="text-[15px] font-semibold text-error" role="status">
          {t.section.unconfirmed}
          {s.retrievedAt ? t.section.perLastCopy(w.time(s.retrievedAt, true)) : t.section.noCopy}
        </p>
      )}
      {s && s.retrievedAt && now && (
        <>
          <ul className="text-[15px]" aria-label={t.section.listLabel}>
            {VIEWS.map((v) => {
              const sum = viewSummary(s, v, now);
              return (
                <li key={v}>
                  <span className="font-semibold">{t.views[v]}:</span>{" "}
                  {sum.stationCount === 0
                    ? t.section.noStation
                    : t.section.summary(
                        w.stations(sum.stationCount),
                        sum.series.reporting,
                        w.measurements(sum.series.seriesCount),
                      )}
                </li>
              );
            })}
          </ul>
          <Disclosure label={t.section.open}>
            <WaterDetails water={s} now={now} />
          </Disclosure>
        </>
      )}
    </NowRow>
  );
}

/** Water part of "¿De dónde salen estos datos?". */
export function WaterProvenance({ water: s }: { water: WaterSnapshot }) {
  const w = useWater();
  const t = w.t.provenance;
  return (
    <div>
      <p>
        <span lang="en">U.S. Geological Survey</span> (USGS),{" "}
        <span lang="en">Water Data for the Nation</span>: {s.source.service}. {t.intro}
      </p>
      <p className="mt-1">
        {t.retrieved}
        {s.retrievedAt ? w.time(s.retrievedAt) : t.never}.
        {!s.lastAttempt.ok && t.lastAttemptFailed(w.time(s.lastAttempt.at))}
        {t.notObservationTime}
      </p>
      <p className="mt-1">
        {t.rules}
        {Object.entries(s.data.exclusions.counts)
          .filter(([, n]) => n > 0)
          .map(([reason, n]) => `${n} ${w.t.exclusions[reason] ?? reason}`)
          .join("; ")}
        .
      </p>
      {s.data.exclusions.listed.length > 0 && (
        <ul className="mt-1 list-disc pl-5">
          {s.data.exclusions.listed.map((e) => {
            // English reads the note back from its template; an unknown note stays as written.
            const english = w.locale === "en" ? exclusionDetailEn(e.detail) : null;
            return (
              <li key={`${e.stationId}-${e.parameterCode}-${e.reason}`}>
                {english ? (
                  t.listed(e.stationId, e.parameterCode, english)
                ) : (
                  <>
                    {e.stationId}, {w.t.parameter} {e.parameterCode}:{" "}
                    <span lang="es-PR">{e.detail}</span>.
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-1">
        <Attribution text={s.source.attribution} />{" "}
        <a href={s.source.docs} target="_blank" rel="noreferrer">
          {t.apiDocs}
        </a>{" "}
        <a href={s.source.web} target="_blank" rel="noreferrer">
          {t.prWater}
        </a>{" "}
        <a href={s.source.provisional} target="_blank" rel="noreferrer">
          {t.provisional}
        </a>{" "}
        <a href={s.source.terms} target="_blank" rel="noreferrer">
          {t.credits}
        </a>
      </p>
    </div>
  );
}
