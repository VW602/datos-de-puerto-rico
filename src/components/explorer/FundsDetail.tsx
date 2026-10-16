import {
  FUNDS_CDBG,
  FUNDS_FY,
  FUNDS_ISLAND,
  FUNDS_SOURCE,
  GEO_STATE_ORDER,
  agencyName,
  dayLabel,
  fundsFor,
  geoStateCopy,
  programName,
} from "@/data/pr/funds";
import { useLocale } from "@/i18n/context";
import { integer, money as formatMoney } from "@/i18n/format";
import { FUNDS_MESSAGES } from "@/i18n/messages/funds";

/** Formatting and wording for the reader's language. */
function useFunds() {
  const locale = useLocale();
  return {
    locale,
    t: FUNDS_MESSAGES[locale],
    money: (value: number) => formatMoney(value, locale),
    count: (value: number) => integer(value, locale),
    geo: geoStateCopy(locale),
  };
}

const share = (part: number, whole: number) =>
  whole > 0 ? `${((part / whole) * 100).toFixed(1)}%` : "—";

/** The sentence every federal-money view carries. */
export function ObligatedNote() {
  return <p className="mt-2 text-[13px] text-muted">{useFunds().t.obligatedNote}</p>;
}

function Ranked({
  title,
  rows,
  name,
}: {
  title: string;
  rows: [string, number][];
  name: (code: string) => string;
}) {
  const { t, money } = useFunds();
  if (rows.length === 0) return null;
  return (
    <div className="mt-3">
      <h4 className="text-[13px] font-semibold">{title}</h4>
      <ol className="mt-1">
        {rows.map(([code, amount]) => (
          <li
            key={code}
            className="flex flex-wrap items-baseline justify-between gap-x-3 border-b border-divider-2 py-1.5 text-[14px]"
          >
            <span className="min-w-0">
              {name(code)} <span className="text-[12px] text-muted tabular">{code}</span>
            </span>
            <span className="ml-auto text-right font-semibold tabular">
              {money(amount)}
              {amount < 0 && (
                <span className="block text-[12px] font-normal text-muted">
                  {t.netDeobligation}
                </span>
              )}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * Federal money for one municipio, keeping what USAspending records there
 * apart from what can be attributed to the municipio. Secondary to the map.
 */
export function FundsMunicipio({ id }: { id: string }) {
  const { t, money, count, geo } = useFunds();
  const f = fundsFor(id);
  if (!f) return null;
  const outlays = f.award.attributableOutlays;
  return (
    <section aria-label={t.municipioLabel(f.name)} className="mt-5">
      <h3 className="text-xs font-bold tracking-[0.08em] text-muted uppercase">
        {t.municipioHeading(f.name, FUNDS_FY)}
      </h3>
      <dl className="mt-1 border-t border-divider-2 text-[15px]">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 border-b border-divider-2 py-2.5">
          <dt>
            {t.recorded(f.name)}
            <span className="block text-[13px] text-muted">{t.recordedNote(f.name)}</span>
          </dt>
          <dd className="ml-auto text-right font-semibold tabular">
            {f.recorded == null ? t.noRecords : money(f.recorded)}
          </dd>
        </div>
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 border-b border-divider-2 py-2.5">
          <dt>
            <strong>{t.attributable}</strong>
            {t.attributableRest}
            <span className="block text-[13px] text-muted">
              {t.attributableNote(money(f.contracts), money(f.individuals))}
            </span>
          </dt>
          <dd className="ml-auto text-right font-semibold tabular">
            {f.attributable == null ? t.noRecords : money(f.attributable)}
          </dd>
        </div>
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 border-b border-divider-2 py-2.5">
          <dt>
            {geo.MUNICIPIO_UNCERTAIN.label}
            <span className="block text-[13px] text-muted">{geo.MUNICIPIO_UNCERTAIN.detail}</span>
          </dt>
          <dd className="ml-auto text-right font-semibold tabular">{money(f.uncertain)}</dd>
        </div>
      </dl>

      <h4 className="mt-4 text-[13px] font-semibold">{t.obligatedAndDisbursed}</h4>
      <p className="text-[13px] text-muted">{t.awardsNote(f.name, FUNDS_FY)}</p>
      <dl className="mt-1 grid grid-cols-1 border-y border-divider-2 @[18rem]:grid-cols-2">
        <div className="py-2.5 pr-2">
          <dt className="text-[13px] text-muted">{t.obligated}</dt>
          <dd className="text-lg font-semibold tabular">
            {f.award.attributableObligations == null ? "—" : money(f.award.attributableObligations)}
          </dd>
        </div>
        <div className="border-divider-2 py-2.5 @[18rem]:border-l @[18rem]:pl-2.5">
          <dt className="text-[13px] text-muted">{t.disbursedCumulative}</dt>
          <dd className="text-lg font-semibold tabular">
            {outlays == null ? t.noOutlays : money(outlays)}
          </dd>
        </div>
      </dl>
      <ObligatedNote />
      <p className="mt-1 text-[13px] text-muted tabular">
        {t.awardsCount(count(f.awards.attributable), count(f.awards.recorded), f.name)}
      </p>

      <Ranked title={t.contractsByAgency} rows={f.contractAgencies} name={agencyName} />
      <Ranked title={t.individualsByProgram} rows={f.individualPrograms} name={programName} />
      <Ranked title={t.uncertainByProgram} rows={f.uncertainPrograms} name={programName} />
      <p className="mt-2 text-[13px] text-muted">
        {t.statewideApart(money(FUNDS_ISLAND.states.PUERTO_RICO_STATEWIDE))}
      </p>
    </section>
  );
}

/** Puerto Rico's total in its four geographic states, and the CDBG-DR examples. */
export function FundsIsland() {
  const { t, money, locale, geo } = useFunds();
  const { total, states } = FUNDS_ISLAND;
  const cdbg = FUNDS_CDBG.filter((c) => c.obligated >= 1e9);
  return (
    <section aria-label={t.islandLabel} className="mt-5">
      <h3 className="text-xs font-bold tracking-[0.08em] text-muted uppercase">
        {t.islandHeading(FUNDS_FY, money(total))}
      </h3>
      <dl className="mt-1 border-t border-divider-2 text-[15px]">
        {GEO_STATE_ORDER.map((state) => (
          <div
            key={state}
            className="flex flex-wrap items-baseline justify-between gap-x-3 border-b border-divider-2 py-2.5"
          >
            <dt>
              {geo[state].label}
              <span className="block text-[13px] text-muted">{geo[state].detail}</span>
            </dt>
            <dd className="ml-auto text-right font-semibold tabular">
              {money(states[state])}
              <span className="block text-[12px] font-normal text-muted">
                {share(states[state], total)}
              </span>
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-[13px] text-muted">{t.partsNote}</p>

      {cdbg.length > 0 && (
        <>
          <h4 className="mt-4 text-[13px] font-semibold">{t.cdbgHeading}</h4>
          <table className="mt-1 w-full text-[14px]">
            <thead>
              {/* Headers and award IDs may break when text is very large; amounts break only at spaces. */}
              <tr className="border-b border-divider-2 text-left text-[12px] text-muted [overflow-wrap:anywhere]">
                <th className="py-1 font-normal">{t.award}</th>
                <th className="py-1 text-right font-normal">{t.obligated}</th>
                <th className="py-1 text-right font-normal">{t.disbursed}</th>
              </tr>
            </thead>
            <tbody>
              {cdbg.map((c) => (
                <tr key={c.awardId} className="border-b border-divider-2">
                  <td className="py-1.5 tabular [overflow-wrap:anywhere]">{c.awardId}</td>
                  <td className="py-1.5 text-right tabular">{money(c.obligated)}</td>
                  <td className="py-1.5 text-right tabular">
                    {c.outlays == null ? t.notReported : money(c.outlays)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1 text-[13px] text-muted">
            {t.outlaysThrough(dayLabel(FUNDS_SOURCE.outlaysReportedThrough.periodEnd, locale))}
          </p>
        </>
      )}
      <ObligatedNote />
    </section>
  );
}
