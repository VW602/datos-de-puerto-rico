import {
  SEVERITY_ES,
  alertArea,
  alertsStatus,
  type Alert,
  type NwsSnapshot,
} from "@/data/pr/current";
import { prTime } from "@/data/pr/currentModel";
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
        <Disclosure label="Detalles del NWS" className="text-[14px]">
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
        </Disclosure>
      )}
    </li>
  );
}

function AlertList({ alerts }: { alerts: Alert[] }) {
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
        <Disclosure
          label={`Ver ${rest.length === 1 ? "la otra alerta" : `las otras ${rest.length} alertas`}`}
        >
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
  const status = now ? alertsStatus(snapshot, now) : null;
  const alerts = status?.alerts ?? [];
  const active = status?.kind === "ACTIVE";
  return (
    <NowRow id="now-alerts" title="Alertas del NWS" attention={active}>
      {status === null ? (
        <p className="text-[15px] text-muted">Comprobando la antigüedad de la última copia…</p>
      ) : status.kind === "UNCONFIRMED" ? (
        <>
          <p className="text-[15px] font-semibold text-error" role="status">
            No se pudo confirmar el estado actual de las alertas.
            {snapshot.retrievedAt
              ? ` La última copia del NWS es del ${prTime(snapshot.retrievedAt, true)}.`
              : " No hay ninguna copia del NWS."}
          </p>
          {alerts.length > 0 && (
            <Disclosure
              label={`Ver ${alerts.length === 1 ? "la alerta" : `las ${alerts.length} alertas`} que estaban en vigor a esa hora`}
            >
              <AlertList alerts={alerts} />
            </Disclosure>
          )}
        </>
      ) : status.kind === "NONE" ? (
        <p className="text-[15px]" role="status">
          No hay alertas activas del NWS para Puerto Rico en la última actualización (
          {prTime(snapshot.retrievedAt, true)}).
        </p>
      ) : (
        <>
          <p className="text-[15px] font-semibold" role="status">
            {alerts.length === 1 ? "1 alerta activa" : `${alerts.length} alertas activas`} del NWS
            para Puerto Rico (copia de las {prTime(snapshot.retrievedAt, true)}).
          </p>
          <AlertList alerts={alerts} />
        </>
      )}
    </NowRow>
  );
}
