import { alertArea, alertsStatus, type Alert, type NwsSnapshot } from "@/data/pr/current";
import { prTime } from "@/data/pr/currentModel";
import { useLocale } from "@/i18n/context";
import { NOW_MESSAGES } from "@/i18n/messages/now";
import { Disclosure } from "./Disclosure";
import { NowRow } from "./NowRow";

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
/** Shown at once; the rest are one click away. */
const FIRST_ALERTS = 3;

function AlertCard({ alert }: { alert: Alert }) {
  const locale = useLocale();
  const t = NOW_MESSAGES[locale].alerts;
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
          {t.severityLabel} {t.severity[alert.severity]}
          {locale === "es" && <span lang="en"> ({alert.severity})</span>}
        </span>
      </p>
      <p className="mt-0.5 text-[14px]">
        <span className="text-muted">{t.where}</span>
        {alert.geography === "MUNICIPIOS" && alert.municipios.length > 12
          ? t.manyMunicipios(alert.municipios.length)
          : alertArea(alert, locale)}
      </p>
      <p className="text-[14px] tabular">
        <span className="text-muted">{t.from}</span>
        {prTime(alert.onset ?? alert.effective, true, locale)}
        <span className="text-muted">{t.until}</span>
        {prTime(alert.ends ?? alert.expires, true, locale)}
        {alert.messageType !== "Alert" && (
          <span className="text-muted" lang="en">
            {" "}
            · {alert.messageType}
          </span>
        )}
      </p>
      {(alert.description || alert.instruction || alert.municipios.length > 12) && (
        <Disclosure label={t.details} className="text-[14px]">
          {alert.geography === "MUNICIPIOS" && alert.municipios.length > 12 && (
            <p className="mt-1">{t.municipiosSame(alertArea(alert, locale))}</p>
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
            {alert.descriptionTruncated || alert.instructionTruncated ? t.excerpt : t.officialText}
            {alert.url && (
              <a href={alert.url} target="_blank" rel="noreferrer">
                {t.fullAlert}
              </a>
            )}
          </p>
        </Disclosure>
      )}
    </li>
  );
}

function AlertList({ alerts }: { alerts: Alert[] }) {
  const t = NOW_MESSAGES[useLocale()].alerts;
  const first = alerts.slice(0, FIRST_ALERTS);
  const rest = alerts.slice(FIRST_ALERTS);
  return (
    <>
      <ul className="mt-2 flex flex-col gap-2">
        {first.map((a) => (
          <AlertCard key={a.id} alert={a} />
        ))}
      </ul>
      {rest.length > 0 && (
        <Disclosure label={t.seeOthers(rest.length)}>
          <ul className="flex flex-col gap-2">
            {rest.map((a) => (
              <AlertCard key={a.id} alert={a} />
            ))}
          </ul>
        </Disclosure>
      )}
    </>
  );
}

/**
 * Level 1, first in the panel. Active alerts are shown as cards right away;
 * none is one calm line; a stale or missing copy says it cannot confirm.
 */
export function AlertsSection({ snapshot, now }: { snapshot: NwsSnapshot; now: Date | null }) {
  const locale = useLocale();
  const all = NOW_MESSAGES[locale];
  const t = all.alerts;
  const status = now ? alertsStatus(snapshot, now) : null;
  const alerts = status?.alerts ?? [];
  const active = status?.kind === "ACTIVE";
  return (
    <NowRow id="now-alerts" title={t.title} attention={active}>
      {status === null ? (
        <p className="text-[15px] text-muted">{all.checking}</p>
      ) : status.kind === "UNCONFIRMED" ? (
        <>
          <p className="text-[15px] font-semibold text-error" role="status">
            {t.unconfirmed}
            {snapshot.retrievedAt
              ? t.lastCopy(prTime(snapshot.retrievedAt, true, locale))
              : t.noCopy}
          </p>
          {alerts.length > 0 && (
            <Disclosure label={t.seeThen(alerts.length)}>
              <AlertList alerts={alerts} />
            </Disclosure>
          )}
        </>
      ) : status.kind === "NONE" ? (
        <p className="text-[15px]" role="status">
          {t.none(prTime(snapshot.retrievedAt, true, locale))}
        </p>
      ) : (
        <>
          <p className="text-[15px] font-semibold" role="status">
            {t.active(alerts.length, prTime(snapshot.retrievedAt, true, locale))}
          </p>
          <AlertList alerts={alerts} />
        </>
      )}
    </NowRow>
  );
}
