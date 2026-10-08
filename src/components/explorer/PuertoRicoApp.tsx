import { useCallback, useMemo, useState, type ReactNode } from "react";
import {
  fitView,
  focusView,
  mainIslandView,
  viewBox,
  zoomView,
  type Candidate,
  type View,
} from "@/data/pr/geo";
import { ALL, femaPlaceValues } from "@/data/pr/fema";
import { applyLayers, islandStat } from "@/data/pr/layers";
import { metricGroup, prMetricById, type MetricGroup, type PrMetricId } from "@/data/pr/metrics";
import { MISSING_COPY, missingReason } from "@/data/pr/missing";
import { municipios } from "@/data/pr/places";
import { deltaWords, describePlace, rankOf } from "@/data/pr/present";
import {
  DEFAULT_METRIC_ID,
  PUBLIC_GROUPS,
  PUBLIC_METRICS,
  publicMetricsInGroup,
  toPublicPlaces,
} from "@/data/pr/public";
import { rankByMetric } from "@/data/pr/ranking";
import { publicSourceById } from "@/data/pr/sources";
import { ISLAND_ONLY_FILL, colorForValue } from "@/data/scale";
import { AtlasMap } from "./AtlasMap";
import { DataTable } from "./DataTable";
import { DisasterFilter } from "./FemaDetail";
import { Legend, MunicipioSearch, TapChooser, ZoomControls } from "./MapBits";
import { Ranking78 } from "./Ranking78";
import { SourcePanel } from "./SourcePanel";
import { FullProfile, Summary } from "./Summary";

/** TIGER/Line asks for this notice on the first page of any site that repackages its boundaries. */
const MAP_ATTRIBUTION = publicSourceById("geometria-municipios")?.attribution ?? null;

const groupLabel = (group: MetricGroup) => (group === "Isla" ? "Toda la isla" : group);

type Size = { width: number; height: number };
type MobileTab = "perfil" | "los78" | "fuente";

export function PuertoRicoApp() {
  const [metricId, setMetricId] = useState<PrMetricId>(DEFAULT_METRIC_ID);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  // Desktop band and mobile detail map keep their own views; the overview mirrors the detail map.
  const [bandView, setBandView] = useState<View | null>(null);
  const [bandSize, setBandSize] = useState<Size>({ width: 0, height: 0 });
  const [detailView, setDetailView] = useState<View | null>(null);
  const [detailSize, setDetailSize] = useState<Size>({ width: 0, height: 0 });
  const [tab, setTab] = useState<MobileTab>("los78");
  const [showTable, setShowTable] = useState(false);
  // FEMA recovery measures can be read for one disaster or all of them.
  const [disaster, setDisaster] = useState<string>(ALL);

  const metric = prMetricById(metricId);
  const group = metricGroup(metricId);
  const island = islandStat(metricId);
  const basePlaces = useMemo(() => toPublicPlaces(applyLayers(municipios)), []);
  const places = useMemo(
    () =>
      disaster === ALL
        ? basePlaces
        : basePlaces.map((place) => ({
            ...place,
            values: { ...place.values, ...femaPlaceValues(place.id, disaster) },
          })),
    [basePlaces, disaster],
  );
  const recovery = group === "Recuperación y desastres";
  const placeById = useMemo(() => new Map(places.map((place) => [place.id, place])), [places]);
  const ranking = useMemo(() => rankByMetric(places, metric.id, metric.scale), [places, metric]);
  const missingCount = island ? 0 : places.length - ranking.ranked.length;
  const signedCounts = useMemo(() => {
    const values = ranking.ranked.map((place) => place.values[metric.id]!);
    return {
      zero: values.filter((v) => v === 0).length,
      negative: values.filter((v) => v < 0).length,
    };
  }, [ranking, metric]);

  const fills = useMemo(() => {
    const out: Record<string, string> = {};
    for (const place of places) {
      out[place.id] = island
        ? ISLAND_ONLY_FILL
        : colorForValue(
            place.values[metric.id],
            ranking.min,
            ranking.max,
            metric.scale,
            metric.signed,
          );
    }
    return out;
  }, [places, metric, ranking, island]);

  const selected = selectedId ? (placeById.get(selectedId) ?? null) : null;

  const select = useCallback(
    (id: string) => {
      setSelectedId(id);
      setCandidates(null);
      if (detailSize.width > 0) setDetailView(focusView(id, detailSize.width, detailSize.height));
    },
    [detailSize.height, detailSize.width],
  );

  const describe = useCallback(
    (id: string) => describePlace(metric, placeById.get(id), ranking),
    [metric, placeById, ranking],
  );

  const tooltip = useCallback(
    (id: string): ReactNode => {
      const place = placeById.get(id);
      if (!place) return null;
      const value = island ? null : place.values[metric.id];
      const rank = rankOf(ranking, id);
      return (
        <>
          <p className="font-display text-lg leading-tight font-semibold">{place.name}</p>
          {island ? (
            <p className="text-sm text-muted">Solo hay cifra para toda la isla</p>
          ) : value == null ? (
            <p className="text-base font-semibold text-muted">
              {MISSING_COPY[missingReason(metric.id, id)].short}
            </p>
          ) : (
            <>
              <p className="text-[22px] leading-tight font-bold tabular">
                {value === 0 ? "0 · cero publicado" : metric.format(value)}
              </p>
              <p className="text-[13px] text-muted tabular">
                {rank ? `${rank.rank} de ${rank.of} · ` : ""}
                {deltaWords(metric, value - ranking.median)}
              </p>
            </>
          )}
        </>
      );
    },
    [placeById, island, metric, ranking],
  );

  const islandNote = island ? `Solo para toda la isla · ${metric.format(island.value)}` : null;
  const mapLabel = `Mapa de Puerto Rico: ${metric.label}. ${selected ? `Seleccionado: ${describe(selected.id)}.` : "Ningún municipio seleccionado."}`;

  // The phone's detail map starts on the main island (closer than the overview strip);
  // "Toda la isla" switches it to the whole archipelago.
  const detailNow =
    detailSize.width > 0
      ? (detailView ?? mainIslandView(detailSize.width, detailSize.height))
      : null;
  const detailShowsAll =
    !detailNow || detailNow.k <= fitView(detailSize.width, detailSize.height).k * 1.05;
  const overviewRect =
    detailNow && !detailShowsAll ? viewBox(detailNow, detailSize.width, detailSize.height) : null;

  const zoomDetail = (factor: number) => {
    if (!detailSize.width) return;
    setDetailView(
      zoomView(
        detailNow ?? fitView(detailSize.width, detailSize.height),
        factor,
        detailSize.width,
        detailSize.height,
      ),
    );
  };
  const zoomBand = (factor: number) => {
    if (!bandSize.width) return;
    setBandView(
      zoomView(
        bandView ?? fitView(bandSize.width, bandSize.height),
        factor,
        bandSize.width,
        bandSize.height,
      ),
    );
  };

  const chooser = candidates && (
    <TapChooser candidates={candidates} onChoose={select} onCancel={() => setCandidates(null)} />
  );

  return (
    <div className="min-h-dvh bg-bg text-fg">
      <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 border-b border-fg px-4 py-1.5 md:px-14 md:py-3">
        <div className="flex items-baseline gap-3">
          <span className="font-display text-[21px] font-semibold md:text-[26px]">
            Datos de Puerto Rico
          </span>
          <span className="hidden text-sm text-muted lg:inline">78 municipios, con su fuente</span>
        </div>
        <nav aria-label="Temas" className="hidden flex-wrap gap-0.5 md:flex">
          {PUBLIC_GROUPS.map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={item === group}
              onClick={() => setMetricId(publicMetricsInGroup(item)[0].id)}
              className={`min-h-11 px-3.5 text-base ${item === group ? "font-semibold text-fg shadow-[inset_0_-3px_0_var(--color-accent)]" : "text-muted hover:text-fg"}`}
            >
              {groupLabel(item)}
            </button>
          ))}
        </nav>
        <a
          href="#fuente"
          className="flex min-h-11 items-center text-[15px] font-semibold text-accent"
        >
          Fuentes y método
        </a>
      </header>

      <main>
        {/* Measure and period */}
        <div className="flex flex-col gap-3 px-4 pt-4 pb-3 md:flex-row md:items-end md:justify-between md:gap-8 md:px-14 md:pt-7 md:pb-5">
          <div className="min-w-0">
            <p className="text-xs font-bold tracking-[0.09em] text-accent uppercase md:text-[13px]">
              {groupLabel(group)} · {metric.source}
            </p>
            <h1 className="mt-1.5 hidden font-display text-[54px] leading-none font-medium md:block">
              {metric.label}
            </h1>
            <label className="mt-1.5 block md:hidden">
              <span className="sr-only">Medida</span>
              <select
                value={metricId}
                onChange={(event) => setMetricId(event.target.value as PrMetricId)}
                className="min-h-[52px] w-full appearance-none rounded-[3px] border border-fg bg-surface bg-[length:14px] bg-[right_14px_center] bg-no-repeat px-3.5 font-display text-[26px] font-medium text-fg"
                style={{
                  backgroundImage:
                    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 14 14'%3E%3Cpath d='M2 5l5 5 5-5' fill='none' stroke='%231a1916' stroke-width='1.8'/%3E%3C/svg%3E\")",
                }}
              >
                {PUBLIC_GROUPS.map((item) => (
                  <optgroup key={item} label={groupLabel(item)}>
                    {publicMetricsInGroup(item).map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
            <p className="mt-2 text-[15px] text-muted md:text-lg">{metric.hint}</p>
            {recovery && <DisasterFilter value={disaster} onChange={setDisaster} />}
          </div>
          <div className="hidden flex-col items-end gap-2.5 md:flex">
            <div
              role="radiogroup"
              aria-label={`Medidas de ${groupLabel(group)}`}
              className="flex max-w-[640px] flex-wrap justify-end gap-1.5"
            >
              {publicMetricsInGroup(group).map((item) => {
                const active = item.id === metricId;
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setMetricId(item.id)}
                    className={`min-h-11 rounded-full border px-4 text-[15px] ${active ? "border-fg bg-fg font-semibold text-surface" : "border-divider bg-surface text-fg hover:bg-track"}`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
            <p className="text-sm text-muted tabular">
              {island
                ? "Una sola cifra para toda la isla"
                : `${ranking.ranked.length} de 78 municipios con dato`}
            </p>
          </div>
        </div>

        {/* Desktop: full-width atlas band */}
        <div className="relative hidden border-y border-divider md:block">
          <div className="aspect-[1048/372] max-h-[78vh] w-full">
            <AtlasMap
              variant="band"
              label={mapLabel}
              fills={fills}
              selectedId={selectedId}
              view={bandView}
              onViewChange={(view) => setBandView(view)}
              onResize={setBandSize}
              onSelect={select}
              onChoose={setCandidates}
              describe={describe}
              tooltip={tooltip}
              placeLabels
              islandNote={islandNote}
            />
          </div>
          <ZoomControls
            className="absolute top-4 left-5"
            onZoomIn={() => zoomBand(1.5)}
            onZoomOut={() => zoomBand(1 / 1.5)}
            onReset={() => setBandView(null)}
          />
          {candidates && (
            <div className="absolute right-5 bottom-5 max-w-md shadow-float">{chooser}</div>
          )}
          {/* The legend sits below the map, so it never covers land at any zoom. */}
          <div className="flex items-center gap-4 border-t border-divider bg-surface px-14 py-3">
            <p className="shrink-0 text-[13px] font-bold">{metric.label}</p>
            <div className="min-w-0 flex-1">
              <Legend
                metric={metric}
                min={ranking.min}
                max={ranking.max}
                islandOnly={Boolean(island)}
                missingCount={missingCount}
                zeroCount={signedCounts.zero}
                negativeCount={signedCounts.negative}
              />
            </div>
          </div>
        </div>

        {/* Mobile: whole-island overview linked to a zoomable detail map */}
        <div className="md:hidden">
          <div className="px-4 pb-3">
            <MunicipioSearch places={places} onPick={select} />
          </div>
          <div className="border-y border-divider bg-water">
            <div className="relative border-b border-[#c9d6d9]">
              <p
                className="absolute top-1.5 left-2.5 z-10 text-[11px] font-bold tracking-[0.08em] text-sea uppercase"
                aria-hidden="true"
              >
                Toda la isla
              </p>
              <div className="aspect-[1048/330] w-full">
                <AtlasMap
                  variant="overview"
                  label={`Vista de toda la isla, de Mona a Culebra. ${overviewRect ? "El recuadro marca la parte que muestra el mapa grande." : ""}`}
                  fills={fills}
                  selectedId={selectedId}
                  viewport={overviewRect}
                  onPick={([x, y]) => {
                    if (!detailSize.width) return;
                    const base = detailNow ?? fitView(detailSize.width, detailSize.height);
                    const k = Math.max(
                      base.k,
                      fitView(detailSize.width, detailSize.height).k * 2.8,
                    );
                    setDetailView(
                      zoomView({ cx: x, cy: y, k }, 1, detailSize.width, detailSize.height),
                    );
                  }}
                />
              </div>
            </div>
            <div className="relative h-[clamp(220px,64vw,280px)]">
              <AtlasMap
                variant="detail"
                label={mapLabel}
                fills={fills}
                selectedId={selectedId}
                view={detailView}
                initialView={mainIslandView}
                onViewChange={(view) => setDetailView(view)}
                onResize={setDetailSize}
                onSelect={select}
                onChoose={setCandidates}
                describe={describe}
                placeLabels
                islandNote={islandNote}
              />
            </div>
            {/* Controls sit under the map, never on top of the land. */}
            <div className="flex items-center gap-2 border-t border-[#c9d6d9] bg-surface px-3 py-2">
              <button
                type="button"
                onClick={() =>
                  detailSize.width && setDetailView(fitView(detailSize.width, detailSize.height))
                }
                className="flex min-h-11 items-center rounded-[3px] border border-fg bg-surface px-3.5 text-[15px] font-semibold hover:bg-track"
              >
                Toda la isla
              </button>
              <span className="flex-1 text-xs text-muted">
                {detailShowsAll ? "Toca un municipio o acércate" : "Arrastra el mapa para moverte"}
              </span>
              <button
                type="button"
                aria-label="Alejar el mapa"
                onClick={() => zoomDetail(1 / 1.6)}
                className="flex size-11 items-center justify-center rounded-[3px] border border-fg bg-surface text-xl hover:bg-track"
              >
                −
              </button>
              <button
                type="button"
                aria-label="Acercar el mapa"
                onClick={() => zoomDetail(1.6)}
                className="flex size-11 items-center justify-center rounded-[3px] border border-fg bg-surface text-xl hover:bg-track"
              >
                +
              </button>
            </div>
            {chooser}
          </div>
          <div className="border-b border-divider px-4 py-3">
            <Legend
              metric={metric}
              min={ranking.min}
              max={ranking.max}
              islandOnly={Boolean(island)}
              missingCount={missingCount}
              zeroCount={signedCounts.zero}
              negativeCount={signedCounts.negative}
              compact
            />
          </div>
        </div>

        {/* Summary and ranking */}
        <div className="grid gap-10 px-4 pt-5 pb-8 md:grid-cols-[minmax(0,500px)_minmax(0,1fr)] md:gap-14 md:px-14 md:pt-9">
          <div>
            <div className="mb-5 hidden md:block">
              <MunicipioSearch places={places} onPick={select} />
            </div>
            <Summary
              metric={metric}
              place={selected}
              ranking={ranking}
              onClear={() => setSelectedId(null)}
              disaster={disaster}
              size="desktop"
            />
            {selected && (
              <details className="mt-4 hidden md:block">
                <summary className="flex min-h-11 cursor-pointer items-center text-[15px] font-semibold">
                  Ver las {PUBLIC_METRICS.length} medidas de {selected.name}
                </summary>
                <div className="mt-2">
                  <FullProfile place={selected} />
                </div>
              </details>
            )}
          </div>
          <div className="hidden md:block">
            {island ? (
              <IslandOnlyNote />
            ) : (
              <Ranking78
                metric={metric}
                ranking={ranking}
                fills={fills}
                selectedId={selectedId}
                missingCount={missingCount}
                onSelect={select}
              />
            )}
          </div>
        </div>

        {/* Mobile tabs */}
        <div className="px-4 pb-8 md:hidden">
          <div
            role="tablist"
            aria-label="Más información"
            className="grid grid-cols-3 border-b border-divider"
          >
            {(
              [
                ["perfil", "Perfil"],
                ["los78", "Los 78"],
                ["fuente", "Fuente"],
              ] as [MobileTab, string][]
            ).map(([id, text]) => (
              <button
                key={id}
                type="button"
                role="tab"
                id={`tab-${id}`}
                aria-selected={tab === id}
                aria-controls={`panel-${id}`}
                onClick={() => setTab(id)}
                className={`min-h-12 text-base ${tab === id ? "font-bold text-fg shadow-[inset_0_-3px_0_var(--color-accent)]" : "text-muted"}`}
              >
                {text}
              </button>
            ))}
          </div>
          <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="pt-4">
            {tab === "perfil" &&
              (selected ? (
                <FullProfile place={selected} />
              ) : (
                <p className="text-base text-muted">
                  Escoge un municipio para ver todas sus medidas.
                </p>
              ))}
            {tab === "los78" &&
              (island ? (
                <IslandOnlyNote />
              ) : (
                <>
                  <Ranking78
                    metric={metric}
                    ranking={ranking}
                    fills={fills}
                    selectedId={selectedId}
                    missingCount={missingCount}
                    onSelect={select}
                  />
                  <button
                    type="button"
                    aria-expanded={showTable}
                    onClick={() => setShowTable((value) => !value)}
                    className="mt-4 flex min-h-12 w-full items-center justify-center rounded-[3px] border border-fg text-base font-semibold"
                  >
                    {showTable ? "Ocultar la tabla" : "Ver la tabla completa"}
                  </button>
                  {showTable && (
                    <div className="mt-3">
                      <DataTable
                        metric={metric}
                        places={places}
                        ranking={ranking}
                        selectedId={selectedId}
                        onSelect={select}
                      />
                    </div>
                  )}
                </>
              ))}
            {tab === "fuente" && (
              <SourcePanel metric={metric} place={selected} disaster={disaster} headingLevel={3} />
            )}
          </div>
        </div>

        {/* Desktop: secondary table, then the source */}
        {!island && (
          <section
            aria-label="Tabla de los 78"
            className="hidden border-t border-divider px-14 py-8 md:block"
          >
            <div className="flex items-baseline justify-between">
              <h2 className="font-display text-[28px] font-medium">Tabla de los 78</h2>
              <span className="text-sm text-muted">Usa los encabezados para ordenar</span>
            </div>
            <div className="mt-3.5">
              <DataTable
                metric={metric}
                places={places}
                ranking={ranking}
                selectedId={selectedId}
                onSelect={select}
              />
            </div>
          </section>
        )}
        <div id="fuente" className="hidden border-t border-divider px-14 py-8 md:block">
          <SourcePanel metric={metric} place={selected} disaster={disaster} />
        </div>
      </main>

      <footer className="border-t border-fg px-4 pt-4 pb-6 text-[13px] leading-normal text-muted md:px-14">
        <p>
          Fuentes: Oficina del Censo de EE. UU. (ACS y TIGER/Line), NHTSA (FARS), CDC (BRFSS), BLS
          (LAUS) y USAspending.gov (Departamento del Tesoro). Cada medida dice su fuente y su
          periodo.
        </p>
        {MAP_ATTRIBUTION && <p className="mt-1">{MAP_ATTRIBUTION}</p>}
        <p className="mt-1">
          Proyecto independiente, sin afiliación con ninguna agencia de gobierno.
        </p>
      </footer>
    </div>
  );
}

function IslandOnlyNote() {
  return (
    <section aria-label="Sin orden por municipio">
      <h2 className="font-display text-[26px] font-medium md:text-3xl">Los 78, de mayor a menor</h2>
      <p className="mt-3 text-base text-muted">
        Esta cifra solo existe para toda la isla. La encuesta BRFSS de los CDC no la publica por
        municipio, así que no hay orden ni tabla.
      </p>
    </section>
  );
}
