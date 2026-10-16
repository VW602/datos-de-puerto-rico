import { useState } from "react";
import {
  quakeWindows,
  quakesStatus,
  summarize,
  type Earthquake,
  type UsgsSnapshot,
} from "@/data/pr/current";
import { prTime } from "@/data/pr/currentModel";
import { SHAPES, project } from "@/data/pr/geo";
import { useLocale } from "@/i18n/context";
import type { Locale } from "@/i18n/locale";
import { NOW_MESSAGES } from "@/i18n/messages/now";
import { Disclosure } from "./Disclosure";
import { NowRow } from "./NowRow";

const fmtMag = (e: Earthquake, locale: Locale) =>
  e.mag === null ? NOW_MESSAGES[locale].quakes.noMagnitude : `M ${e.mag.toFixed(1)}`;
const fmtDepth = (e: Earthquake, locale: Locale) =>
  e.depthKm === null ? NOW_MESSAGES[locale].quakes.noDepth : `${e.depthKm.toFixed(1)} km`;

function QuakeMap({
  region,
  week,
  day,
}: {
  region: UsgsSnapshot["region"];
  week: Earthquake[];
  day: Earthquake[];
}) {
  const locale = useLocale();
  const t = NOW_MESSAGES[locale].quakes;
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
        aria-label={t.mapLabel(week.length, day.length)}
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
              <title>{`${fmtMag(e, locale)} · ${e.place ?? ""} · ${prTime(e.time, true, locale)} · ${t.depth} ${fmtDepth(e, locale)}`}</title>
            </circle>
          );
        })}
      </svg>
      <figcaption className="mt-1 text-[12px] text-muted">{t.mapCaption}</figcaption>
    </figure>
  );
}

/** One event per item: magnitude first, then time, place, depth and the USGS page. No sideways scrolling. */
function QuakeList({ events }: { events: Earthquake[] }) {
  const locale = useLocale();
  const t = NOW_MESSAGES[locale].quakes;
  return (
    <ol className="mt-2 border-t border-divider-2 text-[14px]" aria-label={t.listLabel}>
      {events.map((e) => (
        <li key={e.id} className="border-b border-divider-2 py-1.5">
          <span className="font-semibold tabular">{fmtMag(e, locale)}</span>
          {e.magType && <span className="text-muted"> {e.magType}</span>}
          <span className="tabular"> · {prTime(e.time, true, locale)}</span>
          {e.tsunami === 1 && <span className="text-[13px]">{t.tsunamiFlag}</span>}
          <span className="block">
            {e.place ? <span lang="en">{e.place}</span> : t.noPlace}
            {e.type && e.type !== "earthquake" && (
              <span className="text-muted"> ({t.eventTypes[e.type] ?? e.type})</span>
            )}
            <span className="text-muted tabular">
              {" "}
              · {t.depth} {fmtDepth(e, locale)}
            </span>
            {e.url && (
              <>
                {" · "}
                <a
                  href={e.url}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={t.detailsLabel(fmtMag(e, locale), prTime(e.time, true, locale))}
                >
                  {t.details}
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
  const t = NOW_MESSAGES[useLocale()].quakes;
  return (
    <div className="pb-1">
      {flagged.length > 0 && (
        <p className="mt-1 text-[14px]">
          {t.flaggedLong(flagged.length)}
          <strong>{t.notAWarning}</strong>
          {t.warningsFrom}
        </p>
      )}
      <div role="group" aria-label={t.period} className="mt-2 flex flex-wrap gap-1.5">
        {(["day", "week"] as const).map((key) => (
          <button
            key={key}
            type="button"
            aria-pressed={range === key}
            onClick={() => setRange(key)}
            className={`min-h-11 rounded-full border px-4 text-[14px] ${range === key ? "border-fg bg-fg font-semibold text-surface" : "border-divider bg-surface"}`}
          >
            {key === "day" ? t.last24(day.length) : t.last7(week.length)}
          </button>
        ))}
      </div>
      <QuakeMap region={snapshot.region} week={week} day={day} />
      {list.length > 0 ? (
        <QuakeList events={list} />
      ) : (
        <p className="mt-2 text-[14px]">{range === "day" ? t.noneDay : t.noneWeek}</p>
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
  const locale = useLocale();
  const all = NOW_MESSAGES[locale];
  const t = all.quakes;
  const status = now ? quakesStatus(snapshot, now) : null;
  const { day, week } = quakeWindows(snapshot);
  const sum = summarize(day);
  const flagged = week.filter((e) => e.tsunami === 1).length;
  const at = snapshot.retrievedAt ? prTime(snapshot.retrievedAt, true, locale) : null;
  return (
    <NowRow id="now-quakes" title={t.title}>
      {status?.kind === "UNCONFIRMED" && (
        <p className="text-[15px] font-semibold text-error" role="status">
          {t.unconfirmed}
          {at ? t.perLastCopy(at) : t.noCopy}
        </p>
      )}
      {status === null && <p className="text-[15px] text-muted">{all.checking}</p>}
      {status && at && (
        <p className="text-[15px]">
          {status.kind === "NONE" ? t.noneInWindow(at) : t.count(sum.count, at)}
          {sum.strongest && (
            <>
              {" "}
              {t.strongest} <span className="font-semibold">{fmtMag(sum.strongest, locale)}</span>,{" "}
              {sum.strongest.place ? <span lang="en">{sum.strongest.place}</span> : t.noPlaceLower}.
            </>
          )}
          {sum.latest && sum.count > 1 && (
            <>
              {" "}
              {t.latest} {fmtMag(sum.latest, locale)}, {prTime(sum.latest.time, true, locale)}.
            </>
          )}
        </p>
      )}
      {flagged > 0 && <p className="text-[14px]">{t.flaggedShort(flagged)}</p>}
      {snapshot.retrievedAt && (
        <Disclosure label={t.open(week.length)}>
          <QuakeDetails snapshot={snapshot} />
        </Disclosure>
      )}
    </NowRow>
  );
}
