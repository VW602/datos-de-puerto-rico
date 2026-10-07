import { comparisons, lausBlock, monthShort, trend, type Comparison } from "@/data/pr/laus";

const people = new Intl.NumberFormat("en-US");
const pct = (value: number) => `${value.toFixed(1)}%`;

function Preliminar() {
  return (
    <span className="ml-1.5 inline-block rounded-[2px] border border-warning px-1 align-middle text-[11px] font-bold tracking-[0.06em] text-warning uppercase">
      Preliminar
    </span>
  );
}

function Delta({ from, to }: { from: Comparison | null; to: Comparison }) {
  if (!from || from.value == null || to.value == null) return <span className="text-muted">—</span>;
  const d = Math.round((to.value - from.value) * 10) / 10;
  const text = d === 0 ? "igual" : `${d > 0 ? "+" : "−"}${Math.abs(d).toFixed(1)} pts`;
  return <span className="tabular">{text}</span>;
}

/**
 * Monthly context for BLS LAUS: the latest month, the month before, the same
 * month a year earlier, the labor-force counts, and a small 24-month line.
 * Secondary to the map and the main value. Differences are this project's
 * subtraction of the published rates.
 */
export function LausTrend({ id, name }: { id: string | null; name: string }) {
  const cmp = comparisons(id, "rate");
  const block = lausBlock(id);
  if (!cmp || !block) return null;
  const { latest, previous, yearAgo } = cmp;
  const points = trend(id, "rate", 24);
  const pr = trend(null, "rate", 24);
  const values = [...points, ...pr].map((p) => p.value).filter((v): v is number => v != null);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const W = 320;
  const H = 72;
  const x = (i: number) => 4 + (i / Math.max(1, points.length - 1)) * (W - 8);
  const y = (v: number) => H - 6 - ((v - lo) / Math.max(0.1, hi - lo)) * (H - 14);
  const line = (list: { value: number | null }[]) =>
    list
      .map((p, i) =>
        p.value == null
          ? ""
          : `${i === 0 || list[i - 1].value == null ? "M" : "L"}${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`,
      )
      .join(" ");
  const counts = comparisons(id, "laborForce")!.latest;
  const employed = comparisons(id, "employment")!.latest;
  const unemployed = comparisons(id, "unemployment")!.latest;

  return (
    <section aria-label={`Desempleo mensual de ${name}`} className="mt-5">
      <h3 className="text-xs font-bold tracking-[0.08em] text-muted uppercase">
        Mes a mes · {name}
      </h3>
      <dl className="mt-1 grid grid-cols-3 border-y border-divider-2 text-center">
        <div className="py-2.5">
          <dt className="text-[13px] text-muted">
            {monthShort(latest.key)}
            {latest.preliminary && <Preliminar />}
          </dt>
          <dd className="mt-0.5 text-xl font-semibold tabular">
            {latest.value == null ? "Dato no publicado" : pct(latest.value)}
          </dd>
        </div>
        <div className="border-l border-divider-2 py-2.5">
          <dt className="text-[13px] text-muted">
            Frente a {previous ? monthShort(previous.key) : "—"}
          </dt>
          <dd className="mt-0.5 text-xl font-semibold">
            <Delta from={previous} to={latest} />
          </dd>
        </div>
        <div className="border-l border-divider-2 py-2.5">
          <dt className="text-[13px] text-muted">
            Frente a {yearAgo ? monthShort(yearAgo.key) : "—"}
          </dt>
          <dd className="mt-0.5 text-xl font-semibold">
            <Delta from={yearAgo} to={latest} />
          </dd>
        </div>
      </dl>

      <figure className="mt-3">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="block h-auto w-full"
          role="img"
          aria-label={`Tasa de desempleo de ${name}, últimos ${points.length} meses. Línea discontinua: Puerto Rico.`}
        >
          {id && (
            <path
              d={line(pr)}
              fill="none"
              stroke="var(--color-muted)"
              strokeWidth={1.2}
              strokeDasharray="3 3"
            />
          )}
          <path
            d={line(points)}
            fill="none"
            stroke="var(--color-fg)"
            strokeWidth={2}
            strokeLinejoin="round"
          />
          {points.length > 0 && points[points.length - 1].value != null && (
            <circle
              cx={x(points.length - 1)}
              cy={y(points[points.length - 1].value!)}
              r={3.5}
              fill="var(--color-fg)"
            />
          )}
        </svg>
        <figcaption className="mt-1 flex justify-between text-[12px] text-muted tabular">
          <span>{points.length ? monthShort(points[0].key) : ""}</span>
          <span>
            {pct(lo)}–{pct(hi)}
            {id ? " · discontinua: Puerto Rico" : ""}
          </span>
          <span>{points.length ? monthShort(points[points.length - 1].key) : ""}</span>
        </figcaption>
      </figure>

      <dl className="mt-3 grid grid-cols-3 border-t border-divider-2 text-[15px]">
        <div className="py-2.5 pr-2">
          <dt className="text-[13px] text-muted">Fuerza laboral</dt>
          <dd className="font-semibold tabular">
            {counts.value == null ? "—" : people.format(counts.value)}
          </dd>
        </div>
        <div className="border-l border-divider-2 py-2.5 pl-2.5">
          <dt className="text-[13px] text-muted">Personas empleadas</dt>
          <dd className="font-semibold tabular">
            {employed.value == null ? "—" : people.format(employed.value)}
          </dd>
        </div>
        <div className="border-l border-divider-2 py-2.5 pl-2.5">
          <dt className="text-[13px] text-muted">Personas desempleadas</dt>
          <dd className="font-semibold tabular">
            {unemployed.value == null ? "—" : people.format(unemployed.value)}
          </dd>
        </div>
      </dl>
      <p className="mt-2 text-[13px] text-muted">
        {monthShort(latest.key)}
        {latest.preliminary ? ", preliminar: BLS lo revisará el mes próximo" : ""}. Sin ajuste
        estacional. Las diferencias las calcula este sitio restando las tasas publicadas.
      </p>
    </section>
  );
}
