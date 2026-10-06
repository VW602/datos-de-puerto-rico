import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Compass, Minus, Plus, RotateCcw, X } from "lucide-react";
import { municipios, type Municipio } from "@/data/pr/places";
import { metricGrain, metricGroup, prMetricById, type MetricGroup, type PrMetricId } from "@/data/pr/metrics";
import { DEFAULT_METRIC_ID, isPublicMetric, PUBLIC_GROUPS, publicMetricsInGroup, toPublicPlaces } from "@/data/pr/public";
import { applyLayers, ISLAND_STATS, islandStat, type IslandMetricId } from "@/data/pr/layers";
import { RAMP_GRADIENT, valueAt } from "@/data/scale";
import { MISSING_COPY, missingReason } from "@/data/pr/missing";
import { rankByMetric } from "@/data/pr/ranking";
import { provenanceForMetric, publicSourceById, publicSourceForMetric } from "@/data/pr/sources";
import { cn } from "@/lib/cn";
import { IslandMap, type IslandMapHandle } from "./IslandMap";

const people = new Intl.NumberFormat("en-US");

/** "3 oct 2026" from an ISO date, without depending on the viewer's time zone. */
function shortDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  const months = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  return `${day} ${months[month - 1]} ${year}`;
}

const censusRetrievedAt = publicSourceForMetric("poverty")?.retrievedAt ?? null;
/** TIGER/Line asks for this notice on the first page of any site that repackages its boundaries. */
const MAP_ATTRIBUTION = publicSourceById("geometria-municipios")?.attribution ?? null;
const CENSUS_NOTE = censusRetrievedAt
  ? `Censo: copia oficial descargada el ${shortDate(censusRetrievedAt)}`
  : "Censo: copia oficial guardada";

export function PuertoRicoApp() {
  const mapRef = useRef<IslandMapHandle>(null);
  const [metricId, setMetricId] = useState<PrMetricId>(DEFAULT_METRIC_ID);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const metric = prMetricById(metricId);
  const places = useMemo(() => toPublicPlaces(applyLayers(municipios)), []);

  const bundle = useMemo(() => rankByMetric(places, metric.id, metric.scale), [metric, places]);

  const selected = selectedId ? (places.find((place) => place.id === selectedId) ?? null) : null;
  const visible = bundle.ranked.filter((place) =>
    place.name.toLowerCase().includes(query.trim().toLowerCase()),
  );

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        mapRef.current?.zoomBy(1.35);
      } else if (event.key === "-" || event.key === "_") {
        event.preventDefault();
        mapRef.current?.zoomBy(1 / 1.35);
      } else if (event.key === "0") mapRef.current?.reset();
      else if (event.key === "Escape") setSelectedId(null);
      else if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
        if ((event.target as HTMLElement | null)?.getAttribute("role") === "radio") return;
        const pool = publicMetricsInGroup(metricGroup(metricId));
        const index = pool.findIndex((item) => item.id === metricId);
        const delta = event.key === "ArrowRight" ? 1 : -1;
        setMetricId(pool[(index + delta + pool.length) % pool.length].id);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [metricId]);

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-bg text-fg">
      <header className="flex shrink-0 flex-col gap-3 border-b border-border px-4 py-3 lg:flex-row lg:items-center lg:justify-between lg:px-6">
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-full border border-border text-accent">
            <Compass className="size-4" aria-hidden="true" strokeWidth={1.75} />
          </span>
          <div>
            <h1 className="font-display text-2xl leading-none">Puerto Rico</h1>
            <p className="mt-1 text-xs text-muted">Escoge un municipio y conoce sus datos.</p>
            <p className="text-xs text-muted">{CENSUS_NOTE}</p>
          </div>
        </div>
        <MetricSwitcher metricId={metricId} onChange={setMetricId} />
      </header>

      <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1.15fr)_minmax(0,0.95fr)] lg:grid-cols-[minmax(0,1fr)_24rem] lg:grid-rows-1">
        <div className="relative min-h-0">
          <IslandMap
            ref={mapRef}
            metric={metric}
            min={bundle.min}
            max={bundle.max}
            selectedId={selectedId}
            places={places}
            flat={metricGrain(metric.id) === "isla"}
            flatValue={islandStat(metric.id)?.value ?? null}
            onSelect={setSelectedId}
          />
          <div className="pointer-events-none absolute inset-0">
            <div className="pointer-events-auto absolute top-3 right-3 flex flex-col gap-1.5">
              <MapButton label="Acercar" onClick={() => mapRef.current?.zoomBy(1.35)}>
                <Plus className="size-4" aria-hidden="true" />
              </MapButton>
              <MapButton label="Alejar" onClick={() => mapRef.current?.zoomBy(1 / 1.35)}>
                <Minus className="size-4" aria-hidden="true" />
              </MapButton>
              <MapButton label="Ver la isla" onClick={() => mapRef.current?.reset()}>
                <RotateCcw className="size-4" aria-hidden="true" />
              </MapButton>
            </div>
            <div className="pointer-events-none absolute bottom-3 left-3 right-3 max-w-xs sm:right-auto">
              <div className="rounded-lg border border-border bg-surface px-3 py-2.5">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-sm">{metric.label}</p>
                  <p className="text-xs text-muted">{metric.scale === "log" ? "Escala logarítmica" : "Escala lineal"}</p>
                </div>
                <p className="text-xs text-muted">{metric.hint}</p>
                {islandStat(metric.id) ? (
                  <p className="mt-2 font-display text-2xl leading-none">
                    {metric.format(islandStat(metric.id)!.value)}
                  </p>
                ) : (
                  <>
                    <div className="mt-2 h-2 rounded-full" style={{ background: RAMP_GRADIENT }} />
                    <div className="mt-1 flex justify-between gap-2 text-xs text-muted tabular-nums">
                      <span>{metric.formatTick(valueAt(0, bundle.min, bundle.max, metric.scale))}</span>
                      <span>{metric.formatTick(valueAt(0.5, bundle.min, bundle.max, metric.scale))}</span>
                      <span>{metric.formatTick(valueAt(1, bundle.min, bundle.max, metric.scale))}</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        <aside className="flex min-h-0 flex-col border-t border-border bg-surface lg:border-t-0 lg:border-l">
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            {selected ? (
              <Detail
                place={selected}
                metricId={metricId}
                ranked={bundle.ranked}
                median={bundle.median}
                onClear={() => setSelectedId(null)}
                onMetric={setMetricId}
                onFocus={() => mapRef.current?.focus(selected.id)}
              />
            ) : (
              <>
                {metric.id !== "poverty" && isPublicMetric("poverty") && (
                  <PoorestTowns
                    places={places}
                    onSelect={(id) => {
                      setMetricId("poverty");
                      setSelectedId(id);
                      mapRef.current?.focus(id);
                    }}
                  />
                )}
                {islandStat(metric.id) ? (
                  <IslandFact metricId={metric.id as IslandMetricId} />
                ) : (
                  <List
                    places={visible}
                    query={query}
                    metric={metric}
                    onQuery={setQuery}
                    onSelect={(id) => {
                      setSelectedId(id);
                      mapRef.current?.focus(id);
                    }}
                  />
                )}
              </>
            )}
          </div>
          <p className="max-h-20 shrink-0 overflow-y-auto border-t border-border px-4 py-2.5 text-xs leading-relaxed text-muted lg:max-h-none">
            Fuentes: Oficina del Censo de EE. UU. (ACS y TIGER/Line), NHTSA (FARS) y CDC (BRFSS). Cada
            medida dice su fuente y su periodo. Las cifras del Censo salen de una copia oficial guardada; los
            estimados del Censo tienen margen de error.
            {MAP_ATTRIBUTION && <span className="mt-1 block">{MAP_ATTRIBUTION}</span>}
          </p>
        </aside>
      </div>
    </div>
  );
}

function Detail({
  place,
  metricId,
  ranked,
  median,
  onClear,
  onMetric,
  onFocus,
}: {
  place: Municipio;
  metricId: PrMetricId;
  ranked: Municipio[];
  median: number;
  onClear: () => void;
  onMetric: (id: PrMetricId) => void;
  onFocus: () => void;
}) {
  const metric = prMetricById(metricId);
  const raw = place.values[metric.id];
  const island = islandStat(metric.id);
  const value = island ? island.value : raw;
  const rank = ranked.findIndex((item) => item.id === place.id) + 1;
  const missing = MISSING_COPY[missingReason(metric.id, place.id)];
  const moe = island ? null : (place.moe[metric.id] ?? null);
  const peak = Math.max(...place.ages.flatMap((band) => [band.male, band.female]), 1);

  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div>
          <button type="button" onClick={onFocus} className="text-left">
            <h2 className="font-display text-3xl leading-none">{place.name}</h2>
          </button>
          <p className="mt-1 text-xs text-muted">
            {rank > 0 ? `${rank} de ${ranked.length}` : missing.short} · {metric.source}
          </p>
        </div>
        <button
          type="button"
          onClick={onClear}
          aria-label="Cerrar"
          className="flex size-11 items-center justify-center rounded-md border border-border hover:bg-surface-2"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>

      <p className="mt-4 font-display text-4xl leading-none tabular-nums">
        {value == null ? missing.short : metric.format(value)}
      </p>
      <p className="mt-2 text-sm text-muted">
        {island ? island.note : value == null ? missing.long : metric.versus(value, median)}
      </p>
      {value != null && moe != null && (
        <p className="mt-1 text-xs text-muted tabular-nums">
          Margen de error (90%): ±{metric.format(moe)}
        </p>
      )}
      {value != null && !island && <p className="mt-1 text-xs text-muted">{metric.hint}</p>}
      {metric.id === "traffic" && (
        <p className="mt-1 text-xs text-muted">{people.format(place.trafficDeaths)} muertes en dos años</p>
      )}
      <SourceDetails metricId={metric.id} />

      <h3 className="mt-5 text-xs tracking-wide text-muted uppercase">Edad y sexo de la población</h3>
      <p className="mt-1 text-xs text-muted">
        {people.format(place.female)} mujeres · {people.format(place.male)} hombres
      </p>
      <div className="mt-2 space-y-2">
        {place.ages.map((band) => (
          <div key={band.label}>
            <p className="text-xs text-muted">{band.label}</p>
            <Bar label="Mujeres" value={band.female} peak={peak} tone="accent" />
            <Bar label="Hombres" value={band.male} peak={peak} tone="deep" />
          </div>
        ))}
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-2">
        {publicMetricsInGroup(metricGroup(metric.id)).map((item) => {
          const itemValue = islandStat(item.id)?.value ?? place.values[item.id];
          const active = item.id === metric.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onMetric(item.id)}
              aria-pressed={active}
              className={cn(
                "min-h-11 rounded-md border px-2.5 py-1.5 text-left",
                active ? "border-accent bg-surface-2" : "border-border hover:bg-surface-2",
              )}
            >
              <span className="block text-xs text-muted">{item.label}</span>
              <span className="mt-0.5 block text-sm tabular-nums">
                {itemValue == null ? MISSING_COPY[missingReason(item.id, place.id)].short : item.format(itemValue)}
              </span>
            </button>
          );
        })}
      </dl>
    </div>
  );
}

function Bar({
  label,
  value,
  peak,
  tone,
}: {
  label: string;
  value: number;
  peak: number;
  tone: "accent" | "deep";
}) {
  return (
    <div className="mt-0.5 grid grid-cols-[4.5rem_1fr_auto] items-center gap-2">
      <span className="text-xs text-muted">{label}</span>
      <span className="h-1.5 overflow-hidden rounded-full bg-surface-2">
        <span
          className={cn("block h-full", tone === "accent" ? "bg-accent" : "bg-fg/70")}
          style={{ width: `${(value / peak) * 100}%` }}
        />
      </span>
      <span className="text-xs tabular-nums text-muted">{people.format(value)}</span>
    </div>
  );
}

function IslandFact({ metricId }: { metricId: IslandMetricId }) {
  const metric = prMetricById(metricId);
  const stat = ISLAND_STATS[metricId];
  return (
    <section>
      <p className="text-xs tracking-wide text-muted uppercase">Toda la isla</p>
      <h2 className="mt-1 font-display text-4xl leading-none">{metric.format(stat.value)}</h2>
      <p className="mt-2 text-sm text-muted">{stat.note}</p>
      <p className="mt-4 text-xs leading-relaxed text-muted">
        La encuesta BRFSS de los CDC solo publica esta cifra para todo Puerto Rico, así que el mapa pinta
        la isla entera de un color.
      </p>
    </section>
  );
}

function PoorestTowns({
  places,
  onSelect,
}: {
  places: Municipio[];
  onSelect: (id: string) => void;
}) {
  const { ranked } = rankByMetric(places, "poverty", "linear");
  return (
    <details open className="mb-4 rounded-md border border-border px-3 py-2">
      <summary className="min-h-11 cursor-pointer py-1 text-sm">
        Municipios con más pobreza
        <span className="mt-0.5 block text-xs text-muted">
          {ranked[0]?.name} {ranked[0]?.values.poverty?.toFixed(1)}% · Censo, ACS 2020–2024
        </span>
      </summary>
      <ol className="mt-2">
        {ranked.map((place, index) => (
          <li key={place.id}>
            <button
              type="button"
              onClick={() => onSelect(place.id)}
              className="flex min-h-11 w-full items-baseline justify-between gap-3 border-b border-border py-2 text-left hover:bg-surface-2"
            >
              <span>
                <span className="mr-2 text-xs text-muted tabular-nums">{index + 1}</span>
                {place.name}
              </span>
              <span className="shrink-0 text-sm tabular-nums">{place.values.poverty!.toFixed(1)}%</span>
            </button>
          </li>
        ))}
      </ol>
    </details>
  );
}

function List({
  places,
  query,
  metric,
  onQuery,
  onSelect,
}: {
  places: Municipio[];
  query: string;
  metric: ReturnType<typeof prMetricById>;
  onQuery: (value: string) => void;
  onSelect: (id: string) => void;
}) {
  return (
    <div>
      {metric.id === "poverty" && (
        <header className="mb-3">
          <h2 className="font-display text-2xl leading-none">Municipios con más pobreza</h2>
          <p className="mt-1 text-xs text-muted">
            De mayor a menor porcentaje de personas bajo pobreza. Censo, ACS 2020–2024.
          </p>
        </header>
      )}
      <label className="block">
        <span className="sr-only">Buscar municipio</span>
        <input
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          placeholder="Buscar municipio"
          aria-label="Buscar municipio"
          className="min-h-11 w-full rounded-md border border-border bg-bg px-3 text-sm outline-none focus:border-accent"
        />
      </label>
      <p className="mt-3 text-xs text-muted">
        {metric.id === "poverty" ? `${places.length} municipios` : `${metric.label} · ${places.length} con dato publicado`}
      </p>
      <ol className="mt-2">
        {places.map((place, index) => {
          const value = place.values[metric.id];
          return (
            <li key={place.id}>
              <button
                type="button"
                onClick={() => onSelect(place.id)}
                className="flex min-h-11 w-full items-baseline justify-between gap-3 border-b border-border py-2 text-left hover:bg-surface-2"
              >
                <span>
                  <span className="mr-2 text-xs text-muted tabular-nums">{index + 1}</span>
                  {place.name}
                </span>
                <span className="shrink-0 text-sm tabular-nums">
                  {value == null ? "—" : metric.format(value)}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      {places.length === 0 && <p className="mt-4 text-sm text-muted">Ningún municipio con ese nombre.</p>}
    </div>
  );
}

function MetricSwitcher({
  metricId,
  onChange,
}: {
  metricId: PrMetricId;
  onChange: (id: PrMetricId) => void;
}) {
  const group = metricGroup(metricId);
  const pool = publicMetricsInGroup(group);
  function move(delta: number) {
    const index = pool.findIndex((item) => item.id === metricId);
    const next = pool[(index + delta + pool.length) % pool.length];
    onChange(next.id);
    requestAnimationFrame(() => document.getElementById(`pr-metric-${next.id}`)?.focus());
  }
  function pickGroup(nextGroup: MetricGroup) {
    const first = publicMetricsInGroup(nextGroup)[0];
    if (first) onChange(first.id);
  }

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="chip-scroll flex gap-1.5 overflow-x-auto" role="group" aria-label="Tema">
        {PUBLIC_GROUPS.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => pickGroup(item)}
            aria-pressed={item === group}
            className={cn(
              "min-h-11 shrink-0 rounded-full px-3 text-sm",
              item === group ? "bg-fg text-bg" : "text-muted hover:bg-surface-2",
            )}
          >
            {item === "Isla" ? "Toda la isla" : item}
          </button>
        ))}
      </div>
      <div
        className="chip-scroll min-w-0 overflow-x-auto"
        role="radiogroup"
        aria-label="Medida"
        onKeyDown={(event) => {
          if (event.key === "ArrowRight" || event.key === "ArrowDown") {
            event.preventDefault();
            move(1);
          } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
            event.preventDefault();
            move(-1);
          }
        }}
      >
        <div className="flex w-max gap-2 pb-1">
          {pool.map((item) => {
            const active = item.id === metricId;
            return (
              <button
                key={item.id}
                id={`pr-metric-${item.id}`}
                type="button"
                role="radio"
                aria-checked={active}
                tabIndex={active ? 0 : -1}
                onClick={() => onChange(item.id)}
                className={cn(
                  "min-h-11 shrink-0 rounded-full border px-3.5 text-sm",
                  active
                    ? "border-accent bg-accent font-medium text-accent-fg"
                    : "border-border bg-surface text-fg hover:bg-surface-2",
                )}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function MapButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex size-11 items-center justify-center rounded-md border border-border bg-surface text-fg hover:bg-surface-2"
    >
      {children}
    </button>
  );
}

function SourceDetails({ metricId }: { metricId: PrMetricId }) {
  const source = provenanceForMetric(metricId);
  if (!source) return null;
  return (
    <details className="mt-3 rounded-md border border-border px-3 py-2 text-xs text-muted">
      <summary className="min-h-11 cursor-pointer py-2.5 text-sm text-fg">¿De dónde sale este dato?</summary>
      <dl className="mt-1 space-y-1.5 pb-1">
        <div>
          <dt className="inline text-fg">Fuente: </dt>
          <dd className="inline">{source.agency}</dd>
        </div>
        <div>
          <dt className="inline text-fg">Periodo: </dt>
          <dd className="inline">{source.period}</dd>
        </div>
        {source.methodology && (
          <div>
            <dt className="inline text-fg">Cómo se calcula: </dt>
            <dd className="inline">{source.methodology}</dd>
          </div>
        )}
        <div>
          <dt className="inline text-fg">Datos que faltan: </dt>
          <dd className="inline">{source.missingValues}</dd>
        </div>
        {source.retrievedAt && (
          <div>
            <dt className="inline text-fg">Copia oficial descargada: </dt>
            <dd className="inline">{shortDate(source.retrievedAt)} (UTC)</dd>
          </div>
        )}
        {source.marginOfErrorAvailable && (
          <div>
            <dt className="inline text-fg">Margen de error: </dt>
            <dd className="inline">
              Es un estimado de encuesta. El Censo publica un margen de error para cada estimado y el proyecto lo
              guarda junto a la cifra.
            </dd>
          </div>
        )}
        <div>
          <dt className="inline text-fg">Cita: </dt>
          <dd className="inline">{source.attribution}</dd>
        </div>
      </dl>
      {source.url && (
        <a href={source.url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-accent underline">
          Ver fuente original
        </a>
      )}
    </details>
  );
}
