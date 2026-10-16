import { useEffect, useState } from "react";
import {
  NWS_SNAPSHOT,
  USGS_SNAPSHOT,
  type NwsSnapshot,
  type UsgsSnapshot,
} from "@/data/pr/current";
import {
  LIVE_ROUTES,
  readLiveRoute,
  isNewer,
  isNwsSnapshot,
  isUsgsSnapshot,
} from "@/data/pr/liveData";
import type { WaterSnapshot } from "@/data/pr/water";
import { useLocale } from "@/i18n/context";
import { NOW_MESSAGES } from "@/i18n/messages/now";
import { AlertsSection } from "./now/AlertsSection";
import { Provenance } from "./now/Provenance";
import { QuakesSection } from "./now/QuakesSection";
import { SourceStatus } from "./now/SourceStatus";
import { useWaterSnapshot } from "./useWaterSnapshot";
import { WaterSection } from "./WaterPanel";

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

/**
 * A live snapshot: the copy built into the site first (no blank state, same
 * server and first render), then the same-origin /live/ route if it returns a
 * valid snapshot retrieved later. Never goes back to older data.
 */
function useLiveSnapshot<T extends { retrievedAt: string | null }>(
  builtIn: T,
  path: (typeof LIVE_ROUTES)[keyof typeof LIVE_ROUTES],
  check: (v: unknown) => v is T,
): T {
  const [snapshot, setSnapshot] = useState(builtIn);
  useEffect(() => {
    let live = true;
    readLiveRoute(path, check).then((fresh) => {
      if (live && fresh && isNewer(fresh.retrievedAt, builtIn.retrievedAt)) setSnapshot(fresh);
    });
    return () => {
      live = false;
    };
  }, [builtIn, path, check]);
  return snapshot;
}

/**
 * "Ahora en Puerto Rico", in order of what to know first:
 *   1. needs attention: official NWS alerts, and any source whose copy is old
 *   2. what just happened: earthquakes in the last 24 hours
 *   3. current observations: water stations
 * Each shows a short summary; maps, lists and provenance open on request.
 * This is an order of reading, not a score.
 */
export function NowView({
  now,
  nws,
  usgs,
  water,
}: {
  now: Date | null;
  nws: NwsSnapshot;
  usgs: UsgsSnapshot;
  water: WaterSnapshot | null | "error";
}) {
  const w = water && water !== "error" ? water : null;
  const t = NOW_MESSAGES[useLocale()];
  return (
    <section
      aria-labelledby="ahora"
      className="border-b border-divider bg-track/60 px-4 py-3 md:px-14"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h2 id="ahora" className="font-display text-[22px] font-medium md:text-2xl">
          {t.title}
        </h2>
        <p className="text-[13px] text-muted">{t.disclaimer}</p>
      </div>
      <SourceStatus
        now={now}
        items={[
          {
            label: t.status.nws,
            retrievedAt: nws.retrievedAt,
            lastAttempt: nws.lastAttempt,
            thresholds: nws.freshness,
          },
          {
            label: t.status.quakes,
            retrievedAt: usgs.retrievedAt,
            lastAttempt: usgs.lastAttempt,
            thresholds: usgs.freshness,
          },
          w
            ? {
                label: t.status.water,
                retrievedAt: w.retrievedAt,
                lastAttempt: w.lastAttempt,
                thresholds: w.sourceFreshness,
              }
            : {
                label: t.status.water,
                pending: water === "error" ? t.status.loadFailed : t.status.loading,
              },
        ]}
      />
      <div className="mt-2">
        <AlertsSection snapshot={nws} now={now} />
        <QuakesSection snapshot={usgs} now={now} />
        <WaterSection water={water} now={now} />
      </div>
      <Provenance nws={nws} usgs={usgs} water={w} />
    </section>
  );
}

/** "Ahora en Puerto Rico" with the newest valid snapshots and the viewer's clock. */
export function NowPanel() {
  const now = useNow();
  const nws = useLiveSnapshot(NWS_SNAPSHOT, LIVE_ROUTES.nws, isNwsSnapshot);
  const usgs = useLiveSnapshot(USGS_SNAPSHOT, LIVE_ROUTES.earthquakes, isUsgsSnapshot);
  const water = useWaterSnapshot();
  return <NowView now={now} nws={nws} usgs={usgs} water={water} />;
}
