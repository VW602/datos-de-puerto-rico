import { useEffect, useState } from "react";
import {
  ALL,
  FEMA_DAMAGE_CATEGORIES,
  FEMA_FILTER,
  FEMA_GEO_COPY,
  FEMA_GEO_ORDER,
  dayLabel,
  designationsFor,
  disasterLabel,
  femaDisaster,
  femaIsland,
  femaValue,
  hmaStatus,
  loadProjects,
  type FemaMeasure,
  type FemaProject,
} from "@/data/pr/fema";
import { money } from "@/data/pr/money";

const count = new Intl.NumberFormat("en-US");
const share = (part: number | null, whole: number | null) =>
  part == null || whole == null || whole === 0 ? "" : `${((part / whole) * 100).toFixed(1)}%`;
const show = (value: number | null, kind: "money" | "count") =>
  value == null ? "Sin registro" : kind === "money" ? money(value) : count.format(value);

/** Obligated is not spent: the sentence every FEMA view carries. */
export function FemaObligatedNote() {
  return (
    <p className="mt-2 text-[13px] text-muted">
      Obligado quiere decir que FEMA aprobó y comprometió el dinero federal para el proyecto. No
      quiere decir que ya se pagó ni que se gastó. OpenFEMA no publica lo gastado.
    </p>
  );
}

export function DisasterFilter({
  value,
  onChange,
}: {
  value: string;
  onChange: (key: string) => void;
}) {
  const d = value === ALL ? null : femaDisaster(value);
  return (
    <div className="mt-3">
      <label className="block text-[13px] font-semibold" htmlFor="fema-disaster">
        Desastre
      </label>
      <select
        id="fema-disaster"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 min-h-11 w-full max-w-xl rounded-[3px] border border-divider bg-surface px-3 text-[15px]"
      >
        {FEMA_FILTER.map((key) => (
          <option key={key} value={key}>
            {disasterLabel(key)}
          </option>
        ))}
      </select>
      {d && d.declaredInPuertoRico && (
        <p className="mt-1 text-[13px] text-muted">
          Declarado el {dayLabel(d.declarationDate)} · incidente del {dayLabel(d.incidentBegin)} al{" "}
          {dayLabel(d.incidentEnd)} · {d.incidentType ?? "—"}
        </p>
      )}
    </div>
  );
}

function Row({ label, note, value }: { label: string; note?: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-divider-2 py-2">
      <dt className="min-w-0">
        {label}
        {note && <span className="block text-[12px] text-muted">{note}</span>}
      </dt>
      <dd className="shrink-0 text-right font-semibold tabular">{value}</dd>
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
  const v = (m: FemaMeasure) => femaValue(id, m, disaster);
  const designations = designationsFor(id);
  const shown =
    disaster === ALL ? designations : designations.filter((x) => x.disaster.key === disaster);
  return (
    <section aria-label={`Recuperación en ${name}`} className="mt-5">
      <h3 className="text-xs font-bold tracking-[0.08em] text-muted uppercase">
        Recuperación · {name} · {disaster === ALL ? "todos los desastres" : disasterLabel(disaster)}
      </h3>

      <Block title="Declaraciones">
        <Row
          label="Declaraciones que incluyen el municipio"
          note="Que un municipio esté en una declaración no quiere decir que cada residente recibió ayuda."
          value={count.format(shown.length)}
        />
        {shown.slice(0, 4).map(({ disaster: d, ih, pa, hm }) => (
          <Row
            key={d.key}
            label={`${d.declaration} · ${d.title ?? ""}`}
            note={
              [ih && "Individuos y Hogares", pa && "Asistencia Pública", hm && "Mitigación"]
                .filter(Boolean)
                .join(" · ") || "Sin programas marcados para el municipio"
            }
            value={d.declarationDate?.slice(0, 4) ?? "—"}
          />
        ))}
      </Block>

      <Block title={`Asistencia Pública de solicitantes ubicados en ${name}`}>
        <p className="py-1.5 text-[12px] text-muted">
          FEMA registra el municipio de quien solicita (por ejemplo, el gobierno municipal o una
          entidad local), no necesariamente el lugar de la obra.
        </p>
        <Row
          label="Obligado federal"
          note="federalShareObligated"
          value={show(v("paObligated"), "money")}
        />
        <Row
          label="Total obligado"
          note="totalObligated: parte federal más costos administrativos"
          value={show(v("paTotalObligated"), "money")}
        />
        <Row
          label="Costo estimado de los proyectos"
          note="projectAmount: costo total estimado, sin costos administrativos; no es lo obligado"
          value={show(v("paProjectAmount"), "money")}
        />
        <Row label="Proyectos" value={show(v("paProjects"), "count")} />
      </Block>

      <Block title="Asistencia a hogares (IHP)">
        <Row
          label="Monto aprobado bajo IHP"
          note="totalApprovedIhpAmount, dueños e inquilinos; aprobado no quiere decir pagado"
          value={show(v("ihpApproved"), "money")}
        />
        <Row
          label="Solicitantes aprobados para IHP"
          note="approvedForFemaAssistance"
          value={show(v("ihpApprovedCount"), "count")}
        />
        <Row
          label="Registros válidos"
          note="validRegistrations: registros que FEMA acepta como válidos; no quiere decir aprobados"
          value={show(v("ihpValidRegistrations"), "count")}
        />
      </Block>

      <Block title="Mitigación (HMA)">
        <Row
          label="Obligado federal"
          note="federalShareObligated; los proyectos sin monto reportado no suman"
          value={show(v("hmaFederalObligated"), "money")}
        />
        <Row
          label="Costo de los proyectos"
          note="projectAmount, según la solicitud"
          value={show(v("hmaProjectAmount"), "money")}
        />
        <Row label="Proyectos" note="De cualquier estado" value={show(v("hmaProjects"), "count")} />
      </Block>

      <FemaObligatedNote />
      <p className="mt-1 text-[13px] text-muted">
        Aparte, FEMA registra{" "}
        {show(femaIsland("paObligated", disaster).PUERTO_RICO_STATEWIDE, "money")} de Asistencia
        Pública para todo Puerto Rico («Statewide»). Ese dinero no se le asigna a {name} ni a ningún
        otro municipio.
      </p>
      <FemaProjects disaster={disaster} municipio={id} name={name} />
    </section>
  );
}

const MEASURE_ROWS: { measure: FemaMeasure; label: string; kind: "money" | "count" }[] = [
  { measure: "paObligated", label: "Asistencia Pública: obligado federal", kind: "money" },
  { measure: "paProjects", label: "Asistencia Pública: proyectos", kind: "count" },
  { measure: "ihpApproved", label: "Hogares: monto aprobado bajo IHP", kind: "money" },
  { measure: "hmaFederalObligated", label: "Mitigación: obligado federal", kind: "money" },
];

/** Puerto Rico: each measure with its four geographic states, plus mitigation statuses. */
export function FemaIsland({ disaster }: { disaster: string }) {
  const statuses = Object.entries(hmaStatus(disaster)).sort((a, b) => b[1] - a[1]);
  return (
    <section aria-label="Recuperación en Puerto Rico" className="mt-5">
      <h3 className="text-xs font-bold tracking-[0.08em] text-muted uppercase">
        Puerto Rico · {disaster === ALL ? "todos los desastres" : disasterLabel(disaster)}
      </h3>
      {MEASURE_ROWS.map(({ measure, label, kind }) => {
        const cell = femaIsland(measure, disaster);
        return (
          <div key={measure} className="mt-3">
            <h4 className="flex justify-between text-[13px] font-semibold">
              <span>{label}</span>
              <span className="tabular">{show(cell.total, kind)}</span>
            </h4>
            <dl className="mt-1 border-t border-divider-2 text-[14px]">
              {FEMA_GEO_ORDER.map((s) => (
                <div
                  key={s}
                  className="flex items-baseline justify-between gap-3 border-b border-divider-2 py-1.5"
                >
                  <dt className="min-w-0">
                    {FEMA_GEO_COPY[s].label}
                    <span className="block text-[12px] text-muted">{FEMA_GEO_COPY[s].detail}</span>
                  </dt>
                  <dd className="shrink-0 text-right tabular">
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
      <p className="mt-2 text-[13px] text-muted">
        Las partes suman el total de Puerto Rico de cada medida. El mapa solo pinta lo que está en
        un municipio; en Asistencia Pública, ese municipio es el del solicitante.
      </p>
      {statuses.length > 0 && (
        <p className="mt-2 text-[13px] text-muted">
          Proyectos de mitigación por estado (términos de FEMA):{" "}
          {statuses.map(([s, n]) => `${s} ${count.format(n)}`).join(" · ")}.
        </p>
      )}
      <FemaObligatedNote />
      <p className="mt-1 text-[13px] text-muted">
        FEMA y USAspending (en «Fondos federales») son dos publicaciones oficiales distintas que
        pueden describir el mismo dinero. El sitio no las suma.
      </p>
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

  if (disaster === ALL)
    return (
      <p className="mt-3 text-[13px] text-muted">
        Escoge un desastre para ver sus proyectos de Asistencia Pública.
      </p>
    );
  if (!file)
    return (
      <p className="mt-3 text-[13px] text-muted">
        Este desastre no tiene proyectos de Asistencia Pública en OpenFEMA.
      </p>
    );
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
          Ver proyectos de Asistencia Pública{" "}
          {municipio ? `de solicitantes ubicados en ${name}` : "para todo Puerto Rico"}
        </button>
      ) : rows === null ? (
        <p className="text-[13px] text-muted">Cargando proyectos…</p>
      ) : (
        <div>
          <p className="text-[13px] text-muted tabular">
            {count.format(list.length)} proyectos{" "}
            {municipio ? `de solicitantes ubicados en ${name}` : "«Statewide»"} · paso del proceso
            en los términos de FEMA
          </p>
          <div className="mt-1 overflow-x-auto">
            <table className="w-full min-w-[560px] text-[13px]">
              <thead>
                <tr className="border-b border-divider-2 text-left text-muted">
                  <th className="py-1 pr-2 font-normal">Proyecto</th>
                  <th className="py-1 pr-2 font-normal">Categoría</th>
                  <th className="py-1 pr-2 text-right font-normal">Costo estimado</th>
                  <th className="py-1 pr-2 text-right font-normal">Obligado federal</th>
                  <th className="py-1 font-normal">Paso (FEMA)</th>
                </tr>
              </thead>
              <tbody>
                {list.slice(0, limit).map((p) => (
                  <tr key={p.pwNumber} className="border-b border-divider-2 align-top">
                    <td className="py-1.5 pr-2">
                      <span className="tabular">PW {p.pwNumber}</span>
                      <span className="block text-muted">
                        {FEMA_DAMAGE_CATEGORIES[p.damageCategory] ?? ""}
                      </span>
                    </td>
                    <td className="py-1.5 pr-2" title={FEMA_DAMAGE_CATEGORIES[p.damageCategory]}>
                      {p.damageCategory}
                    </td>
                    <td className="py-1.5 pr-2 text-right tabular">
                      {p.projectAmount == null ? "—" : money(p.projectAmount)}
                    </td>
                    <td className="py-1.5 pr-2 text-right tabular">
                      {p.federalShareObligated == null ? "—" : money(p.federalShareObligated)}
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
              Mostrar más ({count.format(list.length - limit)} quedan)
            </button>
          )}
        </div>
      )}
    </div>
  );
}
