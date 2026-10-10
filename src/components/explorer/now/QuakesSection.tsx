import { useState } from "react";
import {
  EVENT_TYPE_ES,
  quakeWindows,
  quakesStatus,
  summarize,
  type Earthquake,
  type UsgsSnapshot,
} from "@/data/pr/current";
import { prTime } from "@/data/pr/currentModel";
import { SHAPES, project } from "@/data/pr/geo";
import { Disclosure } from "./Disclosure";
import { NowRow } from "./NowRow";

const fmtMag = (e: Earthquake) => (e.mag === null ? "M sin dato" : `M ${e.mag.toFixed(1)}`);
const fmtDepth = (e: Earthquake) =>
  e.depthKm === null ? "sin dato" : `${e.depthKm.toFixed(1)} km`;

function QuakeMap({
  region,
  week,
  day,
}: {
  region: UsgsSnapshot["region"];
  week: Earthquake[];
  day: Earthquake[];
}) {
  const [x0, y0] = project(region.minLon, region.maxLat);
  const [x1, y1] = project(region.maxLon, region.minLat);
  const dayIds = new Set(day.map((e) => e.id));
  const radius = (e: Earthquake) => 10 + Math.max(0, e.mag ?? 0) * 12;
  return (
    <figure className="mt-3 max-w-[760px]">
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

/** One event per item: magnitude first, then time, place, depth and the USGS page. No sideways scrolling. */
function QuakeList({ events }: { events: Earthquake[] }) {
  return (
    <ol
      className="mt-2 border-t border-divider-2 text-[14px]"
      aria-label="Eventos, del más reciente al más antiguo"
    >
      {events.map((e) => (
        <li key={e.id} className="border-b border-divider-2 py-1.5">
          <span className="font-semibold tabular">{fmtMag(e)}</span>
          {e.magType && <span className="text-muted"> {e.magType}</span>}
          <span className="tabular"> · {prTime(e.time, true)}</span>
          {e.tsunami === 1 && <span className="text-[13px]"> · indicador tsunami USGS: 1</span>}
          <span className="block">
            <span lang="en">{e.place ?? "Sin lugar"}</span>
            {e.type && e.type !== "earthquake" && (
              <span className="text-muted"> ({EVENT_TYPE_ES[e.type] ?? e.type})</span>
            )}
            <span className="text-muted tabular"> · profundidad {fmtDepth(e)}</span>
            {e.url && (
              <>
                {" · "}
                <a
                  href={e.url}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`Detalles en USGS de ${fmtMag(e)}, ${prTime(e.time, true)}`}
                >
                  Detalles ↗
                </a>
              </>
            )}
          </span>
        </li>
      ))}
    </ol>
  );
}

export function QuakeDetails({ snapshot }: { snapshot: UsgsSnapshot }) {
  const { day, week } = quakeWindows(snapshot);
  const [range, setRange] = useState<"day" | "week">("day");
  const list = range === "day" ? day : week;
  const flagged = week.filter((e) => e.tsunami === 1);
  return (
    <div className="pb-1">
      {flagged.length > 0 && (
        <p className="mt-1 text-[14px]">
          El USGS marca {flagged.length === 1 ? "un evento" : `${flagged.length} eventos`} con su
          indicador de tsunami (1). Ese indicador solo dice que fue un sismo grande en el océano:{" "}
          <strong>no es un aviso de tsunami</strong>. Los avisos de tsunami los emite NOAA
          (tsunami.gov) y aparecerían entre las alertas oficiales.
        </p>
      )}
      <div role="group" aria-label="Periodo" className="mt-2 flex flex-wrap gap-1.5">
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
      <QuakeMap region={snapshot.region} week={week} day={day} />
      {list.length > 0 ? (
        <QuakeList events={list} />
      ) : (
        <p className="mt-2 text-[14px]">
          {range === "day"
            ? "No hay eventos en las últimas 24 horas de la copia."
            : "No hay eventos en los últimos 7 días de la copia."}
        </p>
      )}
    </div>
  );
}

/**
 * Level 2: what just happened. The 24-hour count, the strongest and the latest
 * are always visible; the map, the 24 h / 7 d control and the full list are
 * one click away.
 */
export function QuakesSection({ snapshot, now }: { snapshot: UsgsSnapshot; now: Date | null }) {
  const status = now ? quakesStatus(snapshot, now) : null;
  const { day, week } = quakeWindows(snapshot);
  const sum = summarize(day);
  const flagged = week.filter((e) => e.tsunami === 1).length;
  const at = snapshot.retrievedAt ? prTime(snapshot.retrievedAt, true) : null;
  return (
    <NowRow id="now-quakes" title="Sismos (USGS)">
      {status?.kind === "UNCONFIRMED" && (
        <p className="text-[15px] font-semibold text-error" role="status">
          No se pudo confirmar la actividad sísmica actual.
          {at ? ` Según la última copia del USGS (${at}):` : " No hay ninguna copia del USGS."}
        </p>
      )}
      {status === null && (
        <p className="text-[15px] text-muted">Comprobando la antigüedad de la última copia…</p>
      )}
      {status && at && (
        <p className="text-[15px]">
          {status.kind === "NONE"
            ? `El USGS no registra eventos en la región en las 24 horas hasta las ${at}.`
            : `${sum.count} ${sum.count === 1 ? "evento" : "eventos"} en las 24 horas hasta las ${at}.`}
          {sum.strongest && (
            <>
              {" "}
              Mayor: <span className="font-semibold">{fmtMag(sum.strongest)}</span>,{" "}
              <span lang="en">{sum.strongest.place ?? "sin lugar"}</span>.
            </>
          )}
          {sum.latest && sum.count > 1 && (
            <>
              {" "}
              Más reciente: {fmtMag(sum.latest)}, {prTime(sum.latest.time, true)}.
            </>
          )}
        </p>
      )}
      {flagged > 0 && (
        <p className="text-[14px]">
          {flagged === 1 ? "Un evento" : `${flagged} eventos`} con el indicador de tsunami del USGS:
          no es un aviso de tsunami (explicación en el detalle).
        </p>
      )}
      {snapshot.retrievedAt && (
        <Disclosure label={`Ver mapa y lista de sismos (7 días: ${week.length})`}>
          <QuakeDetails snapshot={snapshot} />
        </Disclosure>
      )}
    </NowRow>
  );
}
