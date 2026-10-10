import { useEffect, useState } from "react";
import {
  EVENT_TYPE_ES,
  NWS_SNAPSHOT,
  SEVERITY_ES,
  USGS_SNAPSHOT,
  alertArea,
  alertsInForce,
  alertsStatus,
  quakeWindows,
  quakesStatus,
  summarize,
  type Alert,
  type Earthquake,
  type NwsSnapshot,
  type UsgsSnapshot,
} from "@/data/pr/current";
import {
  ageWords,
  canSpeakForNow,
  freshness,
  prTime,
  type Freshness,
} from "@/data/pr/currentModel";
import { SHAPES, project } from "@/data/pr/geo";
import { seriesCountsByKind, waterFreshness } from "@/data/pr/water";
import { WaterBlock } from "./WaterPanel";
import { useWaterSnapshot } from "./useWaterSnapshot";

const FRESH_ES: Record<Freshness, string> = {
  CURRENT: "Al día",
  AGING: "Algo atrasado",
  STALE: "Desactualizado",
  UNAVAILABLE: "Sin datos",
};

/** The viewer's clock, read only in the browser (server and first render agree on null). */
function useNow(): Date | null {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

function FreshBadge({
  label,
  snapshot,
  now,
}: {
  label: string;
  snapshot: Pick<NwsSnapshot | UsgsSnapshot, "retrievedAt" | "lastAttempt" | "freshness">;
  now: Date | null;
}) {
  const state = now ? freshness(snapshot.retrievedAt, now, snapshot.freshness) : null;
  const bad = state === "STALE" || state === "UNAVAILABLE";
  return (
    <p className={`text-[13px] ${bad ? "font-semibold text-error" : "text-muted"}`}>
      {label}: {snapshot.retrievedAt ? prTime(snapshot.retrievedAt, true) : "nunca obtenido"}
      {state &&
        snapshot.retrievedAt &&
        ` · ${FRESH_ES[state]} (${ageWords(snapshot.retrievedAt, now!)})`}
      {state === "UNAVAILABLE" && " · Sin datos"}
      {!snapshot.lastAttempt.ok &&
        ` · último intento falló ${prTime(snapshot.lastAttempt.at, true)}`}
    </p>
  );
}

const SEVERITY_MARK: Record<Alert["severity"], string> = {
  Extreme: "▲▲▲",
  Severe: "▲▲",
  Moderate: "▲",
  Minor: "△",
  Unknown: "?",
};
const SEVERITY_CLASS: Record<Alert["severity"], string> = {
  Extreme: "border-error text-error",
  Severe: "border-error text-error",
  Moderate: "border-warning text-warning",
  Minor: "border-divider text-fg",
  Unknown: "border-divider text-muted",
};

function AlertCard({ alert }: { alert: Alert }) {
  return (
    <li
      className={`border-l-4 bg-surface px-3 py-2.5 ${SEVERITY_CLASS[alert.severity].split(" ")[0]}`}
    >
      <p className="font-semibold">
        <span lang="en">{alert.event}</span>
        <span
          className={`ml-2 inline-block rounded-[2px] border px-1 text-[12px] ${SEVERITY_CLASS[alert.severity]}`}
        >
          <span aria-hidden="true">{SEVERITY_MARK[alert.severity]} </span>
          Severidad: {SEVERITY_ES[alert.severity]} <span lang="en">({alert.severity})</span>
        </span>
      </p>
      <p className="mt-0.5 text-[14px]">
        <span className="text-muted">Dónde: </span>
        {alert.geography === "MUNICIPIOS" && alert.municipios.length > 12
          ? `${alert.municipios.length} municipios (lista en los detalles)`
          : alertArea(alert)}
      </p>
      <p className="text-[14px] tabular">
        <span className="text-muted">Desde: </span>
        {prTime(alert.onset ?? alert.effective, true)} <span className="text-muted">· Hasta: </span>
        {prTime(alert.ends ?? alert.expires, true)}
        {alert.messageType !== "Alert" && (
          <span className="text-muted" lang="en">
            {" "}
            · {alert.messageType}
          </span>
        )}
      </p>
      {(alert.description || alert.instruction || alert.municipios.length > 12) && (
        <details className="mt-1 text-[14px]">
          <summary className="cursor-pointer font-semibold text-accent">Detalles del NWS</summary>
          {alert.geography === "MUNICIPIOS" && alert.municipios.length > 12 && (
            <p className="mt-1">Municipios (códigos SAME del NWS): {alertArea(alert)}.</p>
          )}
          {alert.headline && (
            <p className="mt-1" lang="en">
              {alert.headline}
            </p>
          )}
          {alert.description && (
            <p className="mt-1" lang="en">
              {alert.description}
            </p>
          )}
          {alert.instruction && (
            <p className="mt-1" lang="en">
              {alert.instruction}
            </p>
          )}
          <p className="mt-1 text-[13px] text-muted">
            {alert.descriptionTruncated || alert.instructionTruncated
              ? "Extracto del texto oficial. "
              : "Texto oficial del NWS. "}
            {alert.url && (
              <a href={alert.url} target="_blank" rel="noreferrer">
                Alerta completa en el NWS ↗
              </a>
            )}
          </p>
        </details>
      )}
    </li>
  );
}

function AlertsBlock({ now }: { now: Date | null }) {
  const s = NWS_SNAPSHOT;
  const status = now ? alertsStatus(s, now) : null;
  const alerts = status?.alerts ?? [];
  return (
    <section aria-labelledby="now-alerts">
      <h3 id="now-alerts" className="text-xs font-bold tracking-[0.08em] text-muted uppercase">
        Alertas del Servicio Nacional de Meteorología (NWS)
      </h3>
      {status === null ? (
        <p className="mt-1 text-[15px] text-muted">Comprobando la antigüedad de la última copia…</p>
      ) : status.kind === "UNCONFIRMED" ? (
        <p className="mt-1 text-[15px] font-semibold text-error" role="status">
          No se pudo confirmar el estado actual de las alertas.
          {s.retrievedAt
            ? ` La última información del NWS es del ${prTime(s.retrievedAt, true)}.`
            : " No hay ninguna copia del NWS."}
        </p>
      ) : status.kind === "NONE" ? (
        <p className="mt-1 text-[15px]" role="status">
          No hay alertas activas del NWS para Puerto Rico en la última actualización (
          {prTime(s.retrievedAt, true)}).
        </p>
      ) : null}
      {status !== null && alerts.length > 0 && (
        <>
          {status.kind === "UNCONFIRMED" && (
            <p className="mt-1 text-[13px] text-muted">Alertas que estaban en vigor a esa hora:</p>
          )}
          <ul className="mt-2 flex flex-col gap-2">
            {alerts.map((a) => (
              <AlertCard key={a.id} alert={a} />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

const fmtMag = (e: Earthquake) => (e.mag === null ? "M sin dato" : `M ${e.mag.toFixed(1)}`);
const fmtDepth = (e: Earthquake) =>
  e.depthKm === null ? "sin dato" : `${e.depthKm.toFixed(1)} km`;

function QuakeMap({ week, day }: { week: Earthquake[]; day: Earthquake[] }) {
  const r = USGS_SNAPSHOT.region;
  const [x0, y0] = project(r.minLon, r.maxLat);
  const [x1, y1] = project(r.maxLon, r.minLat);
  const dayIds = new Set(day.map((e) => e.id));
  const radius = (e: Earthquake) => 10 + Math.max(0, e.mag ?? 0) * 12;
  return (
    <figure className="mt-3">
      <svg
        viewBox={`${x0} ${y0} ${x1 - x0} ${y1 - y0}`}
        className="block h-auto w-full rounded-[3px] bg-water"
        role="img"
        aria-label={`Mapa de la región de Puerto Rico con ${week.length} eventos de los últimos 7 días; ${day.length} en las últimas 24 horas. La lista debajo tiene todos los datos.`}
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
        {[...week].reverse().map((e) => {
          const [x, y] = project(e.longitude, e.latitude);
          const recent = dayIds.has(e.id);
          return (
            <circle
              key={e.id}
              cx={x}
              cy={y}
              r={radius(e)}
              fill={recent ? "var(--color-accent)" : "none"}
              fillOpacity={recent ? 0.75 : 0}
              stroke={recent ? "#fff" : "var(--color-fg)"}
              strokeWidth={recent ? 4 : 3}
            >
              <title>{`${fmtMag(e)} · ${e.place ?? ""} · ${prTime(e.time, true)} · profundidad ${fmtDepth(e)}`}</title>
            </circle>
          );
        })}
      </svg>
      <figcaption className="mt-1 text-[12px] text-muted">
        Círculo relleno: últimas 24 horas. Círculo vacío: 2 a 7 días. Más grande = mayor magnitud.
        Región: 17°–20° N, 69°–63.5° O.
      </figcaption>
    </figure>
  );
}

function QuakesBlock({ now }: { now: Date | null }) {
  const s = USGS_SNAPSHOT;
  const status = now ? quakesStatus(s, now) : null;
  const { day, week } = quakeWindows(s);
  const [range, setRange] = useState<"day" | "week">("day");
  const list = range === "day" ? day : week;
  const sum = summarize(day);
  const flagged = week.filter((e) => e.tsunami === 1);
  return (
    <section aria-labelledby="now-quakes">
      <h3 id="now-quakes" className="text-xs font-bold tracking-[0.08em] text-muted uppercase">
        Sismos en la región de Puerto Rico (USGS)
      </h3>
      {status?.kind === "UNCONFIRMED" && (
        <p className="mt-1 text-[15px] font-semibold text-error" role="status">
          No se pudo confirmar la actividad sísmica actual.
          {s.retrievedAt
            ? ` Lo que sigue es lo que el USGS publicaba el ${prTime(s.retrievedAt, true)}.`
            : " No hay ninguna copia del USGS."}
        </p>
      )}
      {s.retrievedAt && (
        <p className="mt-1 text-[15px]">
          {status?.kind === "NONE"
            ? `El USGS no registra eventos en la región en las 24 horas hasta las ${prTime(s.retrievedAt, true)}.`
            : `24 horas hasta las ${prTime(s.retrievedAt, true)}: ${sum.count} ${sum.count === 1 ? "evento" : "eventos"}.`}
          {sum.strongest &&
            ` El de mayor magnitud: ${fmtMag(sum.strongest)}, ${sum.strongest.place ?? "sin lugar"}.`}
          {sum.latest &&
            ` El más reciente: ${fmtMag(sum.latest)}, ${prTime(sum.latest.time, true)}.`}
        </p>
      )}
      {flagged.length > 0 && (
        <p className="mt-1 text-[14px]">
          El USGS marca {flagged.length === 1 ? "un evento" : `${flagged.length} eventos`} con su
          indicador de tsunami (1). Ese indicador solo dice que fue un sismo grande en el océano:{" "}
          <strong>no es un aviso de tsunami</strong>. Los avisos de tsunami los emite NOAA
          (tsunami.gov) y aparecerían entre las alertas oficiales.
        </p>
      )}
      <QuakeMap week={week} day={day} />
      <div role="group" aria-label="Periodo" className="mt-3 flex gap-1.5">
        {(["day", "week"] as const).map((key) => (
          <button
            key={key}
            type="button"
            aria-pressed={range === key}
            onClick={() => setRange(key)}
            className={`min-h-11 rounded-full border px-4 text-[14px] ${range === key ? "border-fg bg-fg font-semibold text-surface" : "border-divider bg-surface"}`}
          >
            {key === "day" ? `Últimas 24 horas (${day.length})` : `7 días (${week.length})`}
          </button>
        ))}
      </div>
      {list.length > 0 && (
        <div
          className="mt-2 overflow-x-auto focus-visible:outline-2 focus-visible:outline-accent"
          role="region"
          aria-label="Lista de sismos (se desplaza a los lados)"
          tabIndex={0}
        >
          <table className="w-full min-w-[480px] text-[14px]">
            <caption className="sr-only">Eventos, del más reciente al más antiguo</caption>
            <thead>
              <tr className="border-b border-divider-2 text-left text-[12px] text-muted">
                <th className="py-1 pr-2 font-normal">Magnitud</th>
                <th className="py-1 pr-2 font-normal">Lugar (USGS)</th>
                <th className="py-1 pr-2 font-normal">Hora de Puerto Rico</th>
                <th className="py-1 pr-2 text-right font-normal">Profundidad</th>
                <th className="py-1 font-normal">USGS</th>
              </tr>
            </thead>
            <tbody>
              {list.map((e) => (
                <tr key={e.id} className="border-b border-divider-2 align-top">
                  <td className="py-1.5 pr-2 font-semibold tabular">
                    {fmtMag(e)}
                    {e.magType && <span className="font-normal text-muted"> {e.magType}</span>}
                    {e.tsunami === 1 && (
                      <span className="block text-[12px] font-normal">
                        indicador tsunami USGS: 1
                      </span>
                    )}
                  </td>
                  <td className="py-1.5 pr-2">
                    <span lang="en">{e.place ?? "Sin lugar"}</span>
                    {e.type && e.type !== "earthquake" && (
                      <span className="block text-[12px] text-muted">
                        {EVENT_TYPE_ES[e.type] ?? e.type}
                      </span>
                    )}
                  </td>
                  <td className="py-1.5 pr-2 tabular">{prTime(e.time, true)}</td>
                  <td className="py-1.5 pr-2 text-right tabular">{fmtDepth(e)}</td>
                  <td className="py-1.5">
                    {e.url ? (
                      <a
                        href={e.url}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`Detalles en USGS de ${fmtMag(e)}, ${prTime(e.time, true)}`}
                      >
                        Detalles ↗
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/** "Ahora en Puerto Rico": NWS alerts and USGS earthquakes from the last saved snapshot, with how old it is. */
export function NowPanel() {
  const now = useNow();
  const nwsState = now ? freshness(NWS_SNAPSHOT.retrievedAt, now, NWS_SNAPSHOT.freshness) : null;
  const usgsState = now ? freshness(USGS_SNAPSHOT.retrievedAt, now, USGS_SNAPSHOT.freshness) : null;
  const water = useWaterSnapshot();
  const w = water && water !== "error" ? water : null;
  const waterState = now && w ? waterFreshness(w, now) : null;
  const stale = [nwsState, usgsState, waterState].some((s) => s === "STALE" || s === "UNAVAILABLE");
  const flow = now && w ? seriesCountsByKind(w, "RIOS", now).DISCHARGE : undefined;
  const inForce = nwsState && canSpeakForNow(nwsState) ? alertsInForce(NWS_SNAPSHOT, now!) : [];
  const day = quakeWindows(USGS_SNAPSHOT).day;
  return (
    <section
      aria-labelledby="ahora"
      className="border-b border-divider bg-track/60 px-4 py-3 md:px-14"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h2 id="ahora" className="font-display text-[22px] font-medium md:text-2xl">
          Ahora en Puerto Rico
        </h2>
        <p className="text-[13px] text-muted">
          Copias guardadas de fuentes oficiales; no es un sistema de avisos.
        </p>
      </div>
      {stale && (
        <p
          className="mt-1 rounded-[3px] border border-error px-2 py-1 text-[14px] font-semibold text-error"
          role="status"
        >
          Datos desactualizados: no se puede confirmar qué está pasando ahora. Abajo está la última
          información guardada, con su hora.
        </p>
      )}
      <div className="mt-1 grid grid-cols-1 gap-x-8 md:grid-cols-2 xl:grid-cols-3">
        <FreshBadge label="Alertas NWS, actualizado" snapshot={NWS_SNAPSHOT} now={now} />
        <FreshBadge label="Sismos USGS, actualizado" snapshot={USGS_SNAPSHOT} now={now} />
        {w ? (
          <FreshBadge
            label="Agua USGS, actualizado"
            snapshot={{ ...w, freshness: w.sourceFreshness }}
            now={now}
          />
        ) : (
          <p className="text-[13px] text-muted">
            Agua USGS: {water === "error" ? "no se pudo cargar" : "cargando…"}
          </p>
        )}
      </div>
      <p className="mt-1 text-[15px]">
        {nwsState === null
          ? "Comprobando…"
          : !canSpeakForNow(nwsState)
            ? "Alertas: no se pudo confirmar el estado actual."
            : inForce.length === 0
              ? "Alertas: ninguna activa del NWS para Puerto Rico."
              : `Alertas: ${inForce.length} ${inForce.length === 1 ? "activa" : "activas"} del NWS (${inForce.map((a) => a.event).join(", ")}).`}{" "}
        · Sismos, 24 horas: {USGS_SNAPSHOT.retrievedAt ? day.length : "sin datos"}
        {usgsState !== null && !canSpeakForNow(usgsState) ? " (sin confirmar)" : ""}
        {w && waterState && (
          <>
            {" "}
            · Agua:{" "}
            {!canSpeakForNow(waterState)
              ? "no se pudieron confirmar las condiciones actuales"
              : flow
                ? `${flow.reporting} de ${flow.seriesCount} mediciones de caudal con dato reciente`
                : "sin mediciones de caudal"}
          </>
        )}
        .
      </p>
      <details className="mt-1">
        <summary className="flex min-h-11 cursor-pointer items-center font-semibold text-accent">
          Ver alertas, sismos, agua y mapas
        </summary>
        <div className="grid grid-cols-1 gap-x-10 gap-y-5 pb-2 md:grid-cols-2">
          <AlertsBlock now={now} />
          <QuakesBlock now={now} />
        </div>
        <WaterBlock now={now} water={water} />
        <p className="mt-2 text-[12px] text-muted">
          Horas en hora de Puerto Rico (AST, UTC−4; sin horario de verano).{" "}
          {NWS_SNAPSHOT.source.attribution}{" "}
          <a href={NWS_SNAPSHOT.source.docs} target="_blank" rel="noreferrer">
            API del NWS ↗
          </a>{" "}
          {USGS_SNAPSHOT.source.attribution}{" "}
          <a href={USGS_SNAPSHOT.source.docs} target="_blank" rel="noreferrer">
            Feed del USGS ↗
          </a>
        </p>
      </details>
    </section>
  );
}
