import {
  FUNDS_CDBG,
  FUNDS_FY,
  FUNDS_ISLAND,
  FUNDS_SOURCE,
  GEO_STATE_COPY,
  GEO_STATE_ORDER,
  agencyName,
  dayLabel,
  fundsFor,
  money,
  programName,
} from "@/data/pr/funds";

const count = new Intl.NumberFormat("en-US");
const share = (part: number, whole: number) =>
  whole > 0 ? `${((part / whole) * 100).toFixed(1)}%` : "—";

/** The sentence every federal-money view carries. */
export function ObligatedNote() {
  return (
    <p className="mt-2 text-[13px] text-muted">
      Obligado quiere decir que el gobierno federal se comprometió a pagar. No quiere decir que ya
      lo desembolsó, ni que quien lo recibe lo gastó.
    </p>
  );
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
                <span className="block text-[12px] font-normal text-muted">desobligación neta</span>
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
  const f = fundsFor(id);
  if (!f) return null;
  const outlays = f.award.attributableOutlays;
  return (
    <section aria-label={`Fondos federales de ${f.name}`} className="mt-5">
      <h3 className="text-xs font-bold tracking-[0.08em] text-muted uppercase">
        Dinero federal · {f.name} · AF {FUNDS_FY}
      </h3>
      <dl className="mt-1 border-t border-divider-2 text-[15px]">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 border-b border-divider-2 py-2.5">
          <dt>
            Registrado por USAspending en {f.name}
            <span className="block text-[13px] text-muted">
              Todo lo que tiene a {f.name} como lugar de ejecución.
            </span>
          </dt>
          <dd className="ml-auto text-right font-semibold tabular">
            {f.recorded == null ? "Sin registros" : money(f.recorded)}
          </dd>
        </div>
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 border-b border-divider-2 py-2.5">
          <dt>
            <strong>Atribuible al municipio</strong> con la información disponible
            <span className="block text-[13px] text-muted">
              Contratos {money(f.contracts)} · asistencia a personas {money(f.individuals)}. Es lo
              que pinta el mapa.
            </span>
          </dt>
          <dd className="ml-auto text-right font-semibold tabular">
            {f.attributable == null ? "Sin registros" : money(f.attributable)}
          </dd>
        </div>
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 border-b border-divider-2 py-2.5">
          <dt>
            {GEO_STATE_COPY.MUNICIPIO_UNCERTAIN.label}
            <span className="block text-[13px] text-muted">
              {GEO_STATE_COPY.MUNICIPIO_UNCERTAIN.detail}
            </span>
          </dt>
          <dd className="ml-auto text-right font-semibold tabular">{money(f.uncertain)}</dd>
        </div>
      </dl>

      <h4 className="mt-4 text-[13px] font-semibold">Obligado y desembolsado</h4>
      <p className="text-[13px] text-muted">
        Adjudicaciones atribuibles a {f.name} con actividad en el AF {FUNDS_FY}, desde su inicio.
      </p>
      <dl className="mt-1 grid grid-cols-1 border-y border-divider-2 @[18rem]:grid-cols-2">
        <div className="py-2.5 pr-2">
          <dt className="text-[13px] text-muted">Obligado</dt>
          <dd className="text-lg font-semibold tabular">
            {f.award.attributableObligations == null ? "—" : money(f.award.attributableObligations)}
          </dd>
        </div>
        <div className="border-divider-2 py-2.5 @[18rem]:border-l @[18rem]:pl-2.5">
          <dt className="text-[13px] text-muted">Desembolsado acumulado (reportado)</dt>
          <dd className="text-lg font-semibold tabular">
            {outlays == null ? "Sin desembolsos reportados" : money(outlays)}
          </dd>
        </div>
      </dl>
      <ObligatedNote />
      <p className="mt-1 text-[13px] text-muted tabular">
        {count.format(f.awards.attributable)} adjudicaciones atribuibles de{" "}
        {count.format(f.awards.recorded)} registradas en {f.name}.
      </p>

      <Ranked title="Contratos, por agencia" rows={f.contractAgencies} name={agencyName} />
      <Ranked
        title="Asistencia a personas, por programa"
        rows={f.individualPrograms}
        name={programName}
      />
      <Ranked
        title="Registrado aquí sin certeza, por programa"
        rows={f.uncertainPrograms}
        name={programName}
      />
      <p className="mt-2 text-[13px] text-muted">
        Aparte, {money(FUNDS_ISLAND.states.PUERTO_RICO_STATEWIDE)} son para todo Puerto Rico sin
        municipio. Ese dinero no se le asigna a ningún municipio.
      </p>
    </section>
  );
}

/** Puerto Rico's total in its four geographic states, and the CDBG-DR examples. */
export function FundsIsland() {
  const { total, states } = FUNDS_ISLAND;
  const cdbg = FUNDS_CDBG.filter((c) => c.obligated >= 1e9);
  return (
    <section aria-label="Fondos federales en Puerto Rico" className="mt-5">
      <h3 className="text-xs font-bold tracking-[0.08em] text-muted uppercase">
        Puerto Rico · obligaciones AF {FUNDS_FY}: {money(total)}
      </h3>
      <dl className="mt-1 border-t border-divider-2 text-[15px]">
        {GEO_STATE_ORDER.map((state) => (
          <div
            key={state}
            className="flex flex-wrap items-baseline justify-between gap-x-3 border-b border-divider-2 py-2.5"
          >
            <dt>
              {GEO_STATE_COPY[state].label}
              <span className="block text-[13px] text-muted">{GEO_STATE_COPY[state].detail}</span>
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
      <p className="mt-2 text-[13px] text-muted">
        Las cuatro partes suman el total de Puerto Rico. El mapa solo pinta la primera.
      </p>

      {cdbg.length > 0 && (
        <>
          <h4 className="mt-4 text-[13px] font-semibold">
            Ejemplo: subvenciones CDBG-DR y CDBG-MIT de HUD
          </h4>
          <table className="mt-1 w-full text-[14px]">
            <thead>
              {/* Headers and award IDs may break when text is very large; amounts break only at spaces. */}
              <tr className="border-b border-divider-2 text-left text-[12px] text-muted [overflow-wrap:anywhere]">
                <th className="py-1 font-normal">Adjudicación</th>
                <th className="py-1 text-right font-normal">Obligado</th>
                <th className="py-1 text-right font-normal">Desembolsado</th>
              </tr>
            </thead>
            <tbody>
              {cdbg.map((c) => (
                <tr key={c.awardId} className="border-b border-divider-2">
                  <td className="py-1.5 tabular [overflow-wrap:anywhere]">{c.awardId}</td>
                  <td className="py-1.5 text-right tabular">{money(c.obligated)}</td>
                  <td className="py-1.5 text-right tabular">
                    {c.outlays == null ? "Sin reportar" : money(c.outlays)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1 text-[13px] text-muted">
            Desembolsos reportados hasta el{" "}
            {dayLabel(FUNDS_SOURCE.outlaysReportedThrough.periodEnd)}.
          </p>
        </>
      )}
      <ObligatedNote />
    </section>
  );
}
