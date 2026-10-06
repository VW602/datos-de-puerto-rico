import { memo, useMemo, useState } from "react";
import { prMetricById, type PrMetric } from "@/data/pr/metrics";
import type { Municipio } from "@/data/pr/places";
import { deltaText } from "@/data/pr/present";
import type { Ranking } from "@/data/pr/ranking";
import { RAMP } from "@/data/scale";

type SortKey = "rank" | "name" | "population" | "income";
type Sort = { key: SortKey; dir: "asc" | "desc" };

const ABOVE = RAMP[5];
const income = prMetricById("income");
const population = prMetricById("population");

/**
 * The secondary, sortable table of the 78. Bars compare with the median and
 * always carry the signed number; color alone never carries meaning.
 */
export const DataTable = memo(function DataTable({
  metric,
  places,
  ranking,
  selectedId,
  onSelect,
}: {
  metric: PrMetric;
  places: Municipio[];
  ranking: Ranking;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [sort, setSort] = useState<Sort>({ key: "rank", dir: "asc" });
  const rankById = useMemo(
    () => new Map(ranking.ranked.map((place, index) => [place.id, index + 1])),
    [ranking],
  );
  const spread = useMemo(
    () =>
      Math.max(
        1e-9,
        ...ranking.ranked.map((place) => Math.abs(place.values[metric.id]! - ranking.median)),
      ),
    [ranking, metric.id],
  );

  const rows = useMemo(() => {
    const value = (place: Municipio): number => {
      if (sort.key === "rank") return rankById.get(place.id) ?? Infinity;
      if (sort.key === "population") return place.values.population ?? -Infinity;
      if (sort.key === "income") return place.values.income ?? -Infinity;
      return 0;
    };
    const sorted = [...places].sort((a, b) => {
      if (sort.key === "name") return a.name.localeCompare(b.name, "es");
      return value(a) - value(b) || a.name.localeCompare(b.name, "es");
    });
    // Missing values always go last, whatever the direction.
    const known = sorted.filter((place) => sort.key !== "rank" || rankById.has(place.id));
    const missing = sorted.filter((place) => sort.key === "rank" && !rankById.has(place.id));
    return [...(sort.dir === "asc" ? known : known.reverse()), ...missing];
  }, [places, sort, rankById]);

  function header(key: SortKey, label: string, className = "") {
    const active = sort.key === key;
    const next: Sort = active
      ? { key, dir: sort.dir === "asc" ? "desc" : "asc" }
      : { key, dir: key === "population" || key === "income" ? "desc" : "asc" };
    return (
      <th
        scope="col"
        aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
        className={`px-1.5 py-1 md:px-2.5 font-semibold ${className}`}
      >
        <button
          type="button"
          onClick={() => setSort(next)}
          className={`min-h-11 ${active ? "font-bold text-fg" : ""}`}
        >
          {label}
          <span aria-hidden="true">{active ? (sort.dir === "asc" ? " ↑" : " ↓") : ""}</span>
        </button>
      </th>
    );
  }

  return (
    <div className="max-h-[560px] overflow-auto border-y border-divider">
      <table className="w-full border-collapse text-[15px] tabular">
        <caption className="sr-only">
          {metric.label} por municipio. Encabezados con botón para ordenar. Mediana{" "}
          {metric.format(ranking.median)}.
        </caption>
        <thead className="sticky top-0 z-10 bg-bg text-left text-[13px] text-muted">
          <tr className="border-b-2 border-fg">
            {header("rank", "Lugar", "w-16")}
            {header("name", "Municipio")}
            <th scope="col" className="px-1.5 py-1 md:px-2.5 text-right font-semibold">
              {metric.label}
            </th>
            <th scope="col" className="px-1.5 py-1 md:px-2.5 font-semibold">
              Frente a la mediana
            </th>
            {header("population", population.label, "hidden text-right md:table-cell")}
            {header("income", "Ingreso mediano", "hidden text-right md:table-cell")}
          </tr>
        </thead>
        <tbody>
          {rows.map((place) => {
            const v = place.values[metric.id];
            const delta = v == null ? null : v - ranking.median;
            const selected = place.id === selectedId;
            const width = delta == null ? 0 : (Math.abs(delta) / spread) * 50;
            return (
              <tr
                key={place.id}
                className={
                  selected
                    ? "border-y-2 border-fg bg-surface font-bold"
                    : "border-b border-divider-2"
                }
              >
                <td className={`px-1.5 py-1.5 md:px-2.5 ${selected ? "" : "text-muted"}`}>
                  {rankById.get(place.id) ?? "—"}
                </td>
                <td className="px-1.5 py-1.5 md:px-2.5">
                  <button
                    type="button"
                    onClick={() => onSelect(place.id)}
                    className="min-h-9 text-left underline-offset-2 hover:underline"
                  >
                    {place.name}
                    {selected && <span className="sr-only"> (seleccionado)</span>}
                  </button>
                </td>
                <td className="px-1.5 py-1.5 md:px-2.5 text-right">
                  {v == null ? (
                    <span className="font-normal text-muted">Dato no publicado</span>
                  ) : (
                    metric.format(v)
                  )}
                </td>
                <td className="px-1.5 py-1.5 md:px-2.5">
                  {delta == null ? (
                    <span className="font-normal text-muted">—</span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <span
                        className="relative block h-2 w-16 shrink-0 bg-track md:w-28"
                        aria-hidden="true"
                      >
                        <span
                          className="absolute top-0 h-2"
                          style={
                            delta >= 0
                              ? { left: "50%", width: `${width}%`, background: ABOVE }
                              : {
                                  right: "50%",
                                  width: `${width}%`,
                                  background: "var(--color-below)",
                                }
                          }
                        />
                        <span className="absolute -top-0.5 left-1/2 block h-3 w-0.5 -translate-x-1/2 bg-fg" />
                      </span>
                      <span className="whitespace-nowrap">{deltaText(metric, delta)}</span>
                    </span>
                  )}
                </td>
                <td className="hidden px-1.5 py-1.5 md:px-2.5 text-right md:table-cell">
                  {place.values.population == null
                    ? "—"
                    : population.format(place.values.population)}
                </td>
                <td className="hidden px-1.5 py-1.5 md:px-2.5 text-right md:table-cell">
                  {place.values.income == null ? (
                    "—"
                  ) : (
                    <>
                      {income.format(place.values.income)}
                      {place.moe.income != null && (
                        <span className="ml-1 font-normal text-muted">
                          ± {income.format(place.moe.income)}
                        </span>
                      )}
                    </>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
});
