import { useEffect, useState } from "react";
import {
  ALL,
  FEMA_DAMAGE_CATEGORIES,
  FEMA_FILTER,
  FEMA_GEO_ORDER,
  dayLabel,
  designationsFor,
  disasterLabel,
  femaDisaster,
  femaGeoCopy,
  femaIsland,
  femaValue,
  hmaStatus,
  loadProjects,
  type FemaMeasure,
  type FemaProject,
} from "@/data/pr/fema";
import { useLocale } from "@/i18n/context";
import { integer, money as formatMoney } from "@/i18n/format";
import { FEMA_MESSAGES } from "@/i18n/messages/fema";

const share = (part: number | null, whole: number | null) =>
  part == null || whole == null || whole === 0 ? "" : `${((part / whole) * 100).toFixed(1)}%`;

/** Wording and formatting for the reader's language. */
function useFema() {
  const locale = useLocale();
  const t = FEMA_MESSAGES[locale];
  const money = (value: number) => formatMoney(value, locale);
  const count = (value: number) => integer(value, locale);
  return {
    locale,
    t,
    money,
    count,
    geo: femaGeoCopy(locale),
    show: (value: number | null, kind: "money" | "count") =>
      value == null ? t.noRecord : kind === "money" ? money(value) : count(value),
    day: (iso: string | null) => dayLabel(iso, locale),
    disaster: (key: string) => disasterLabel(key, locale),
  };
}

/** Obligated is not spent: the sentence every FEMA view carries. */
export function FemaObligatedNote() {
  return <p className="mt-2 text-[13px] text-muted">{useFema().t.obligatedNote}</p>;
}

export function DisasterFilter({
  value,
  onChange,
}: {
  value: string;
  onChange: (key: string) => void;
}) {
  const f = useFema();
  const d = value === ALL ? null : femaDisaster(value);
  return (
    <div className="mt-3">
      <label className="block text-[13px] font-semibold" htmlFor="fema-disaster">
        {f.t.disaster.filter}
      </label>
      <select
        id="fema-disaster"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 min-h-11 w-full max-w-xl rounded-[3px] border border-divider bg-surface px-3 text-[15px]"
      >
        {FEMA_FILTER.map((key) => (
          <option key={key} value={key}>
            {f.disaster(key)}
          </option>
        ))}
      </select>
      {d && d.declaredInPuertoRico && (
        <p className="mt-1 text-[13px] text-muted">
          {f.t.disaster.declared(
            f.day(d.declarationDate),
            f.day(d.incidentBegin),
            f.day(d.incidentEnd),
            d.incidentType ?? "—",
          )}
        </p>
      )}
    </div>
  );
}

function Row({ label, note, value }: { label: string; note?: string; value: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 border-b border-divider-2 py-2">
      <dt className="min-w-0">
        {label}
        {note && <span className="block text-[12px] text-muted">{note}</span>}
      </dt>
      <dd className="ml-auto text-right font-semibold tabular">{value}</dd>
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-4">
      <h4 className="text-[13px] font-semibold">{title}</h4>
      <dl className="mt-1 border-t border-divider-2 text-[15px]">{children}</dl>
    </div>
  );
}

/**
 * Recovery for one municipio, by program. Each block is one FEMA program and
 * its own fields; nothing is added across blocks.
 */
export function FemaMunicipio({
  id,
  name,
  disaster,
}: {
  id: string;
  name: string;
  disaster: string;
}) {
  const f = useFema();
  const t = f.t.municipio;
  const show = f.show;
  const v = (m: FemaMeasure) => femaValue(id, m, disaster);
  const designations = designationsFor(id);
  const shown =
    disaster === ALL ? designations : designations.filter((x) => x.disaster.key === disaster);
  return (
    <section aria-label={t.label(name)} className="mt-5">
      <h3 className="text-xs font-bold tracking-[0.08em] text-muted uppercase">
        {t.heading(name, disaster === ALL ? f.t.disaster.allLower : f.disaster(disaster))}
      </h3>

      <Block title={t.declarations}>
        <Row
          label={t.declarationsIncluding}
          note={t.declarationsNote}
          value={f.count(shown.length)}
        />
        {shown.slice(0, 4).map(({ disaster: d, ih, pa, hm }) => (
          <Row
            key={d.key}
            label={`${d.declaration} · ${d.title ?? ""}`}
            note={
              [ih && t.programs.ih, pa && t.programs.pa, hm && t.programs.hm]
                .filter(Boolean)
                .join(" · ") || t.programs.none
            }
            value={d.declarationDate?.slice(0, 4) ?? "—"}
          />
        ))}
      </Block>

      <Block title={t.paHeading(name)}>
        <p className="py-1.5 text-[12px] text-muted">{t.paNote}</p>
        <Row
          label={t.federalObligated}
          note="federalShareObligated"
          value={show(v("paObligated"), "money")}
        />
        <Row
          label={t.totalObligated}
          note={t.totalObligatedNote}
          value={show(v("paTotalObligated"), "money")}
        />
        <Row
          label={t.projectCost}
          note={t.projectCostNote}
          value={show(v("paProjectAmount"), "money")}
        />
        <Row label={t.projects} value={show(v("paProjects"), "count")} />
      </Block>

      <Block title={t.ihpHeading}>
        <Row
          label={t.ihpApproved}
          note={t.ihpApprovedNote}
          value={show(v("ihpApproved"), "money")}
        />
        <Row
          label={t.ihpApplicants}
          note="approvedForFemaAssistance"
          value={show(v("ihpApprovedCount"), "count")}
        />
        <Row
          label={t.ihpValid}
          note={t.ihpValidNote}
          value={show(v("ihpValidRegistrations"), "count")}
        />
      </Block>

      <Block title={t.hmaHeading}>
        <Row
          label={t.federalObligated}
          note={t.hmaObligatedNote}
          value={show(v("hmaFederalObligated"), "money")}
        />
        <Row label={t.hmaCost} note={t.hmaCostNote} value={show(v("hmaProjectAmount"), "money")} />
        <Row label={t.projects} note={t.anyStatus} value={show(v("hmaProjects"), "count")} />
      </Block>

      <FemaObligatedNote />
      <p className="mt-1 text-[13px] text-muted">
        {t.statewideApart(
          show(femaIsland("paObligated", disaster).PUERTO_RICO_STATEWIDE, "money"),
          name,
        )}
      </p>
      <FemaProjects disaster={disaster} municipio={id} name={name} />
    </section>
  );
}

const MEASURE_ROWS: {
  measure: "paObligated" | "paProjects" | "ihpApproved" | "hmaFederalObligated";
  kind: "money" | "count";
}[] = [
  { measure: "paObligated", kind: "money" },
  { measure: "paProjects", kind: "count" },
  { measure: "ihpApproved", kind: "money" },
  { measure: "hmaFederalObligated", kind: "money" },
];

/** Puerto Rico: each measure with its four geographic states, plus mitigation statuses. */
export function FemaIsland({ disaster }: { disaster: string }) {
  const f = useFema();
  const t = f.t.island;
  const show = f.show;
  const statuses = Object.entries(hmaStatus(disaster)).sort((a, b) => b[1] - a[1]);
  return (
    <section aria-label={t.label} className="mt-5">
      <h3 className="text-xs font-bold tracking-[0.08em] text-muted uppercase">
        {t.heading(disaster === ALL ? f.t.disaster.allLower : f.disaster(disaster))}
      </h3>
      {MEASURE_ROWS.map(({ measure, kind }) => {
        const cell = femaIsland(measure, disaster);
        return (
          <div key={measure} className="mt-3">
            <h4 className="flex flex-wrap justify-between gap-x-3 text-[13px] font-semibold">
              <span>{t.measures[measure]}</span>
              <span className="tabular">{show(cell.total, kind)}</span>
            </h4>
            <dl className="mt-1 border-t border-divider-2 text-[14px]">
              {FEMA_GEO_ORDER.map((s) => (
                <div
                  key={s}
                  className="flex flex-wrap items-baseline justify-between gap-x-3 border-b border-divider-2 py-1.5"
                >
                  <dt className="min-w-0">
                    {f.geo[s].label}
                    <span className="block text-[12px] text-muted">{f.geo[s].detail}</span>
                  </dt>
                  <dd className="ml-auto text-right tabular">
                    {show(cell[s], kind)}
                    <span className="block text-[12px] text-muted">
                      {share(cell[s], cell.total)}
                    </span>
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        );
      })}
      <p className="mt-2 text-[13px] text-muted">{t.partsNote}</p>
      {statuses.length > 0 && (
        <p className="mt-2 text-[13px] text-muted">
          {t.hmaStatuses(statuses.map(([s, n]) => `${s} ${f.count(n)}`).join(" · "))}
        </p>
      )}
      <FemaObligatedNote />
      <p className="mt-1 text-[13px] text-muted">{t.notAdded}</p>
      <FemaProjects disaster={disaster} municipio={null} name="Puerto Rico" />
    </section>
  );
}

const PAGE = 25;

/** Public Assistance projects of one disaster, loaded only when asked for. */
export function FemaProjects({
  disaster,
  municipio,
  name,
}: {
  disaster: string;
  municipio: string | null;
  name: string;
}) {
  const f = useFema();
  const t = f.t.projects;
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<FemaProject[] | null>(null);
  const [limit, setLimit] = useState(PAGE);
  const file = disaster === ALL ? null : femaDisaster(disaster)?.paProjectsFile;
  useEffect(() => {
    setRows(null);
    setLimit(PAGE);
    if (!open || !file) return;
    let live = true;
    loadProjects(disaster).then((list) => {
      if (live) setRows(list);
    });
    return () => {
      live = false;
    };
  }, [open, disaster, file]);

  if (disaster === ALL) return <p className="mt-3 text-[13px] text-muted">{t.pickDisaster}</p>;
  if (!file) return <p className="mt-3 text-[13px] text-muted">{t.noProjects}</p>;
  // A municipio sees its own projects; Puerto Rico sees the Statewide ones.
  const list =
    rows?.filter((p) => (municipio ? p.geo === "P" && p.municipio === municipio : p.geo === "S")) ??
    [];
  return (
    <div className="mt-4">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="min-h-11 rounded-[3px] border border-fg px-4 text-[15px] font-semibold hover:bg-track"
        >
          {t.open(municipio ? name : null)}
        </button>
      ) : rows === null ? (
        <p className="text-[13px] text-muted">{t.loading}</p>
      ) : (
        <div>
          <p className="text-[13px] text-muted tabular">
            {t.count(f.count(list.length), municipio ? name : null)}
          </p>
          <div className="mt-1 overflow-x-auto">
            <table className="w-full min-w-[560px] text-[13px]">
              <thead>
                <tr className="border-b border-divider-2 text-left text-muted">
                  <th className="py-1 pr-2 font-normal">{t.project}</th>
                  <th className="py-1 pr-2 font-normal">{t.category}</th>
                  <th className="py-1 pr-2 text-right font-normal">{t.estimatedCost}</th>
                  <th className="py-1 pr-2 text-right font-normal">{t.federalObligated}</th>
                  <th className="py-1 font-normal">{t.step}</th>
                </tr>
              </thead>
              <tbody>
                {list.slice(0, limit).map((p) => (
                  <tr key={p.pwNumber} className="border-b border-divider-2 align-top">
                    <td className="py-1.5 pr-2">
                      <span className="tabular">PW {p.pwNumber}</span>
                      <span className="block text-muted" lang="en">
                        {FEMA_DAMAGE_CATEGORIES[p.damageCategory] ?? ""}
                      </span>
                    </td>
                    <td className="py-1.5 pr-2" title={FEMA_DAMAGE_CATEGORIES[p.damageCategory]}>
                      {p.damageCategory}
                    </td>
                    <td className="py-1.5 pr-2 text-right tabular">
                      {p.projectAmount == null ? "—" : f.money(p.projectAmount)}
                    </td>
                    <td className="py-1.5 pr-2 text-right tabular">
                      {p.federalShareObligated == null ? "—" : f.money(p.federalShareObligated)}
                    </td>
                    <td className="py-1.5" lang="en">
                      {p.projectProcessStep ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {list.length > limit && (
            <button
              type="button"
              onClick={() => setLimit(limit + PAGE * 4)}
              className="mt-2 min-h-11 text-[15px] font-semibold text-accent"
            >
              {t.more(f.count(list.length - limit))}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
