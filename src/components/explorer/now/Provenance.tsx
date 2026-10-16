import type { NwsSnapshot, UsgsSnapshot } from "@/data/pr/current";
import { prTime } from "@/data/pr/currentModel";
import type { WaterSnapshot } from "@/data/pr/water";
import { useLocale } from "@/i18n/context";
import { NOW_MESSAGES } from "@/i18n/messages/now";
import { snapshotAttribution } from "@/i18n/messages/snapshots";
import { WaterProvenance } from "../WaterPanel";
import { Disclosure } from "./Disclosure";

function Copy({ at, attempt }: { at: string | null; attempt: { at: string; ok: boolean } }) {
  const locale = useLocale();
  const t = NOW_MESSAGES[locale].provenance;
  return (
    <>
      {t.lastCopy}
      {at ? prTime(at, false, locale) : t.neverRetrieved}.
      {!attempt.ok && t.lastAttemptFailed(prTime(attempt.at, false, locale))}
    </>
  );
}

/** A snapshot's stored attribution, in the reader's language when a reviewed translation exists. */
export function Attribution({ text }: { text: string }) {
  const shown = snapshotAttribution(text, useLocale());
  return <span lang={shown.lang === "es" ? "es-PR" : "en"}>{shown.text}</span>;
}

/**
 * Level 3 of disclosure: exact times of every copy, attributions, rules and
 * links, in one place instead of repeated under each summary.
 */
export function Provenance({
  nws,
  usgs,
  water,
}: {
  nws: NwsSnapshot;
  usgs: UsgsSnapshot;
  water: WaterSnapshot | null;
}) {
  const t = NOW_MESSAGES[useLocale()].provenance;
  return (
    <Disclosure label={t.open} className="mt-1 text-[13px]">
      <div className="max-w-[72ch] pb-2">
        <p>{t.intro}</p>
        <h4 className="mt-2 font-semibold">{t.alertsHeading}</h4>
        <p>
          <Copy at={nws.retrievedAt} attempt={nws.lastAttempt} />{" "}
          <Attribution text={nws.source.attribution} />{" "}
          <a href={nws.source.docs} target="_blank" rel="noreferrer">
            {t.nwsApi}
          </a>
        </p>
        <h4 className="mt-2 font-semibold">{t.quakesHeading}</h4>
        <p>
          <Copy at={usgs.retrievedAt} attempt={usgs.lastAttempt} />{" "}
          <Attribution text={usgs.source.attribution} />{" "}
          <a href={usgs.source.docs} target="_blank" rel="noreferrer">
            {t.usgsFeed}
          </a>
        </p>
        <h4 className="mt-2 font-semibold">{t.waterHeading}</h4>
        {water ? <WaterProvenance water={water} /> : <p>{t.loading}</p>}
      </div>
    </Disclosure>
  );
}
