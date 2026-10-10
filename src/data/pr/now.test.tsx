import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NowView } from "@/components/explorer/NowPanel";
import { Disclosure } from "@/components/explorer/now/Disclosure";
import { QuakeDetails } from "@/components/explorer/now/QuakesSection";
import { WaterDetails, WaterSection } from "@/components/explorer/WaterPanel";
import {
  normalizeNws,
  normalizeUsgs,
  nwsSnapshot,
  recordFailure,
  sha256,
  usgsSnapshot,
} from "../../../scripts/live/normalize.ts";
import {
  buildData,
  normalizeWater,
  recordWaterFailure,
  waterSnapshot,
  type WaterRaw,
} from "../../../scripts/water/normalize.ts";
import { API_BASE } from "../../../scripts/water/source.ts";
import { alertsStatus, quakesStatus, type NwsSnapshot, type UsgsSnapshot } from "./current";
import type { WaterSnapshot } from "./water";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const IDS = new Set(
  Object.keys(
    (JSON.parse(read("data/generated/census-municipios.json")) as { municipios: object })
      .municipios,
  ),
);
const after = (iso: string, minutes: number) => new Date(Date.parse(iso) + minutes * 60000);

// NWS and USGS earthquake snapshots built from the PR-LIVE-001 fixtures.
const LIVE_AT = "2026-10-07T21:40:00.000Z";
function nws(name: string, retrievedAt = LIVE_AT): NwsSnapshot {
  const raw = read(`scripts/live/fixtures/${name}`);
  return nwsSnapshot({
    retrievedAt,
    sourceUpdatedAt: retrievedAt,
    raw: { sha256: sha256(raw), bytes: raw.length, note: "fixture" },
    lastAttempt: { at: retrievedAt, ok: true, error: null },
    data: { alerts: normalizeNws(raw, IDS).alerts },
  }) as unknown as NwsSnapshot;
}
const usgsRaw = read("scripts/live/fixtures/usgs-week.json");
const USGS_AT = new Date(
  (JSON.parse(usgsRaw) as { metadata: { generated: number } }).metadata.generated,
).toISOString();
function usgs(retrievedAt = USGS_AT): UsgsSnapshot {
  const n = normalizeUsgs(usgsRaw);
  return usgsSnapshot({
    retrievedAt,
    sourceUpdatedAt: USGS_AT,
    raw: { sha256: sha256(usgsRaw), bytes: usgsRaw.length, note: "fixture" },
    lastAttempt: { at: retrievedAt, ok: true, error: null },
    data: { windowHours: 168, worldCount: n.worldCount, events: n.events },
  }) as unknown as UsgsSnapshot;
}
// Water snapshot built from the PR-LIVE-002 fixtures.
const wfx = (name: string) =>
  JSON.parse(read(`scripts/water/fixtures/${name}.json`)) as {
    retrievedAt: string;
    features: WaterRaw["latest"];
  };
const WATER_AT = wfx("latest").retrievedAt;
const WATER = waterSnapshot({
  retrievedAt: WATER_AT,
  lastAttempt: { at: WATER_AT, ok: true, error: null },
  requests: (["latest", "locations", "meta", "continuous"] as const).map((name) => ({
    name,
    page: 0,
    url: `${API_BASE}/${name}`,
    sha256: "a".repeat(64),
    bytes: 1,
    required: name !== "continuous",
  })),
  seriesOk: true,
  data: buildData(
    normalizeWater(
      {
        latest: wfx("latest").features,
        meta: wfx("meta").features,
        locations: wfx("locations").features,
        continuous: wfx("continuous").features,
      },
      WATER_AT,
      IDS,
    ),
  ),
}) as unknown as WaterSnapshot;

const text = (html: string) =>
  html
    .replace(/<title>[\s\S]*?<\/title>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
const view = (props: {
  now: Date;
  nws?: NwsSnapshot;
  usgs?: UsgsSnapshot;
  water?: WaterSnapshot | null | "error";
}) =>
  renderToStaticMarkup(
    <NowView
      now={props.now}
      nws={props.nws ?? nws("nws-empty.json")}
      usgs={props.usgs ?? usgs()}
      water={props.water === undefined ? WATER : props.water}
    />,
  );
const sectionOf = (html: string, id: string) => {
  const start = html.indexOf(`aria-labelledby="${id}"`);
  return html.slice(start, html.indexOf("</section>", start));
};
// One "now" where every fixture copy is fresh enough to speak for "now".
const FRESH = after(LIVE_AT, 5);
// When four fixture alerts are still in force (they expire at 21:00 and 21:36 UTC).
const ACTIVE_AT = "2026-10-07T20:58:00.000Z";
const activeView = () =>
  view({ ...fresh(), now: after(ACTIVE_AT, 1), nws: nws("nws-alerts.json", ACTIVE_AT) });
const fresh = () => ({
  now: FRESH,
  usgs: usgs(LIVE_AT),
  water: WATER as WaterSnapshot,
});

describe("Ahora en Puerto Rico: order of reading", () => {
  it("active alerts come first, as cards, with a rule and a count in words", () => {
    const active = nws("nws-alerts.json", ACTIVE_AT);
    expect(alertsStatus(active, after(ACTIVE_AT, 1)).alerts).toHaveLength(4);
    const html = activeView();
    const order = ["now-alerts", "now-quakes", "now-water"].map((id) =>
      html.indexOf(`aria-labelledby="${id}"`),
    );
    expect(order).toEqual([...order].sort((a, b) => a - b));
    const alerts = sectionOf(html, "now-alerts");
    expect(alerts).toContain("border-l-accent");
    expect(text(alerts)).toMatch(/\d+ alertas activas del NWS para Puerto Rico/);
    expect(alerts.match(/<li class="border-l-4/g)!.length).toBeGreaterThanOrEqual(1);
    expect(alerts.match(/<li class="border-l-4/g)!.length).toBeLessThanOrEqual(3);
    // The rest of the alerts are one click away.
    expect(text(alerts)).toMatch(/Ver las otras \d+ alertas|Ver la otra alerta/);
  });

  it("no alerts is one calm line, much shorter than active alerts", () => {
    const none = sectionOf(view({ ...fresh(), nws: nws("nws-empty.json") }), "now-alerts");
    expect(text(none)).toMatch(
      /No hay alertas activas del NWS para Puerto Rico en la última actualización/,
    );
    expect(none).not.toContain("border-l-accent");
    expect(none).not.toMatch(/text-error/);
    const active = sectionOf(activeView(), "now-alerts");
    expect(none.length * 4).toBeLessThan(active.length);
  });

  it("an old copy is said where it matters, calmly, without a page-wide alarm", () => {
    const later = after(LIVE_AT, 30 * 60);
    const html = view({ now: later, nws: nws("nws-empty.json"), usgs: usgs(LIVE_AT) });
    const t = text(html);
    expect(t).toMatch(/NWS alertas · Desactualizado \(hace 30 h\)/);
    expect(t).toMatch(/USGS sismos · Desactualizado/);
    expect(t).toMatch(/No se pudo confirmar el estado actual de las alertas\./);
    expect(t).toMatch(/No se pudo confirmar la actividad sísmica actual\./);
    expect(t).not.toMatch(/No hay alertas activas/);
    expect(t).not.toMatch(/Datos desactualizados: no se puede confirmar qué está pasando ahora/);
    // The freshness state is a word and a shape, not only a color.
    expect(html).toMatch(/aria-hidden="true">○ <\/span>NWS alertas · Desactualizado/);
  });

  it("no events, an old copy and no copy at all read differently", () => {
    // No events: the newest fixture event is days before this copy.
    const quiet = usgs(after(USGS_AT, 3 * 24 * 60).toISOString());
    const quietNow = after(quiet.retrievedAt!, 5);
    expect(quakesStatus(quiet, quietNow).kind).toBe("NONE");
    const none = text(sectionOf(view({ now: quietNow, usgs: quiet }), "now-quakes"));
    expect(none).toMatch(/El USGS no registra eventos en la región en las 24 horas hasta las/);
    expect(none).not.toMatch(/No se pudo confirmar/);
    // Old copy.
    const stale = text(sectionOf(view({ now: after(USGS_AT, 600), usgs: usgs() }), "now-quakes"));
    expect(stale).toMatch(
      /No se pudo confirmar la actividad sísmica actual\. Según la última copia/,
    );
    // Never retrieved.
    const never = recordFailure(
      null,
      { at: USGS_AT, ok: false, error: "timeout" },
      { windowHours: 168, worldCount: null, events: [] },
      usgsSnapshot,
    ) as unknown as UsgsSnapshot;
    const neverHtml = view({ now: FRESH, usgs: never });
    const unavailable = text(sectionOf(neverHtml, "now-quakes"));
    expect(unavailable).toMatch(
      /No se pudo confirmar la actividad sísmica actual\. No hay ninguna copia del USGS\./,
    );
    expect(unavailable).not.toMatch(/no registra eventos/);
    expect(text(neverHtml)).toMatch(/× <\/span>|USGS sismos · Sin datos/);
    // Water: never retrieved is not "no stations".
    const dry = recordWaterFailure(null, { at: WATER_AT, ok: false, error: "HTTP 503" });
    const water = text(
      sectionOf(view({ ...fresh(), water: dry as unknown as WaterSnapshot }), "now-water"),
    );
    expect(water).toMatch(
      /No se pudieron confirmar las condiciones actuales del agua\. No hay ninguna copia del USGS\./,
    );
    expect(water).not.toMatch(/0 estaciones|ninguna estación/);
  });
});

describe("summaries first, details on request", () => {
  it("earthquakes: count, strongest and latest visible; map and list closed", () => {
    const html = view(fresh());
    const quakes = sectionOf(html, "now-quakes");
    expect(text(quakes)).toMatch(/\d+ eventos? en las 24 horas hasta las .* Mayor: M \d\.\d/);
    expect(quakes).toMatch(/<button type="button" aria-expanded="false" aria-controls="[^"]+"/);
    expect(text(quakes)).toMatch(/Ver mapa y lista de sismos \(7 días: \d+\)/);
    expect(quakes).not.toContain('role="img"');
    expect(quakes).not.toMatch(/Últimas 24 horas \(/);
  });

  it("earthquake details keep the 24 h / 7 d control, the map, USGS links and the tsunami semantics", () => {
    const html = renderToStaticMarkup(<QuakeDetails snapshot={usgs(LIVE_AT)} />);
    expect(html).toMatch(/aria-pressed="true"[^>]*>Últimas 24 horas \(\d+\)/);
    expect(html).toMatch(/7 días \(\d+\)/);
    expect(html).toContain('role="img"');
    expect(html).toContain("https://earthquake.usgs.gov/earthquakes/eventpage/");
    expect(text(html)).toMatch(/no es un aviso de tsunami/);
    // The list is a list, not a sideways-scrolling table.
    expect(html).toContain("<ol");
    expect(html).not.toMatch(/overflow-x-auto|min-w-\[/);
  });

  it("water: stations and measurements per kind visible; map and measurements closed", () => {
    const water = sectionOf(view(fresh()), "now-water");
    const t = text(water);
    expect(t).toMatch(/Ríos y canales: \d+ estaciones · \d+ de \d+ mediciones con dato reciente/);
    expect(t).toMatch(/Lluvia: \d+ estaciones · \d+ de \d+ mediciones con dato reciente/);
    expect(t).toMatch(/Embalses y lagos: \d+ estaciones/);
    expect(t).toMatch(/Ver estaciones de agua: mapa y mediciones/);
    expect(water).not.toMatch(/data-station|data-layout/);
  });

  it("an empty water category is calm, not an error", () => {
    const noRain: WaterSnapshot = {
      ...WATER,
      data: {
        ...WATER.data,
        observations: WATER.data.observations.filter((o) => o.view !== "LLUVIA"),
      },
    };
    const t = text(renderToStaticMarkup(<WaterSection water={noRain} now={after(WATER_AT, 5)} />));
    expect(t).toMatch(/Lluvia: ninguna estación con medición publicada/);
    const detail = text(
      renderToStaticMarkup(
        <WaterDetails water={noRain} now={after(WATER_AT, 5)} initialView="LLUVIA" />,
      ),
    );
    expect(detail).toMatch(
      /Ninguna estación de lluvia con medición publicada en esta copia del USGS\./,
    );
  });

  it("water detail: cards on narrow screens, a table on wide ones, 8 stations at first", () => {
    const html = renderToStaticMarkup(<WaterDetails water={WATER} now={after(WATER_AT, 5)} />);
    const cards = html.slice(
      html.indexOf('data-layout="cards"'),
      html.indexOf('data-layout="table"'),
    );
    expect(html).toMatch(/class="[^"]*xl:hidden[^"]*" data-layout="cards"/);
    expect(html).toMatch(/class="[^"]*hidden xl:block[^"]*" data-layout="table"/);
    // Cards hold every measurement without a table or sideways scrolling.
    expect(cards).not.toContain("<table");
    expect(cards).not.toMatch(/overflow-x|min-w-\[/);
    const rivers = WATER.data.observations.filter((o) => o.view === "RIOS");
    expect(cards.match(/<li class="border-t/g)!.length).toBe(rivers.length);
    // No long lists by default: at most 8 stations until the reader asks.
    const big: WaterSnapshot = {
      ...WATER,
      data: {
        ...WATER.data,
        siteInventory: {
          ...WATER.data.siteInventory,
          stations: Array.from({ length: 20 }, (_, i) => ({
            ...WATER.data.siteInventory.stations[0]!,
            id: `USGS-9000000${String(i).padStart(2, "0")}`,
          })),
        },
        observations: Array.from({ length: 20 }, (_, i) => ({
          ...rivers[0]!,
          stationId: `USGS-9000000${String(i).padStart(2, "0")}`,
          timeSeriesId: `t${i}`,
        })),
      },
    };
    const bigHtml = renderToStaticMarkup(<WaterDetails water={big} now={after(WATER_AT, 5)} />);
    const bigCards = bigHtml.slice(
      bigHtml.indexOf('data-layout="cards"'),
      bigHtml.indexOf('data-layout="table"'),
    );
    expect(bigCards.match(/<li class="rounded/g)!.length).toBe(8);
    expect(bigHtml).toMatch(
      /aria-expanded="false"[^>]*>Mostrar las 20 estaciones \(8 a la vista\)/,
    );
  });

  it("provenance is one disclosure at the end, not repeated under each summary", () => {
    const html = view(fresh());
    expect(html.match(/¿De dónde salen estos datos\?/g)).toHaveLength(1);
    expect(html.lastIndexOf("¿De dónde salen estos datos?")).toBeGreaterThan(
      html.indexOf('aria-labelledby="now-water"'),
    );
    expect(html).not.toContain("API del NWS ↗"); // inside the closed disclosure
    expect(text(html).match(/Datos provisionales/g) ?? []).toHaveLength(0);
  });
});

describe("disclosure controls", () => {
  it("a closed disclosure renders a button with aria-expanded and no content; open shows it", () => {
    const closed = renderToStaticMarkup(<Disclosure label="Ver más">contenido</Disclosure>);
    expect(closed).toMatch(/<button type="button" aria-expanded="false" aria-controls="([^"]+)"/);
    const id = /aria-controls="([^"]+)"/.exec(closed)![1];
    expect(closed).toContain(`id="${id}" hidden=""`);
    expect(closed).not.toContain("contenido");
    const open = renderToStaticMarkup(
      <Disclosure label="Ver más" defaultOpen>
        contenido
      </Disclosure>,
    );
    expect(open).toMatch(/aria-expanded="true"/);
    expect(open).toContain("contenido");
  });

  it("every toggle in the panel is a real button with aria-expanded, a label and its region", () => {
    const html = activeView();
    const toggles = [
      ...html.matchAll(
        /<button type="button" aria-expanded="(true|false)" aria-controls="([^"]+)"[^>]*>([\s\S]*?)<\/button>/g,
      ),
    ];
    expect(toggles.length).toBeGreaterThanOrEqual(4);
    for (const [, , id, label] of toggles) {
      expect(html).toContain(`id="${id}"`);
      expect(text(label).trim().length).toBeGreaterThan(3);
    }
  });

  it("detail content and the water series load only when opened", () => {
    const panel = read("src/components/explorer/WaterPanel.tsx");
    const details = panel.slice(
      panel.indexOf("export function WaterDetails"),
      panel.indexOf("export function WaterSection"),
    );
    expect(panel.match(/loadWaterSeries\(\)/g)).toHaveLength(1);
    expect(details).toContain("loadWaterSeries()");
    expect(read("src/components/explorer/now/Disclosure.tsx")).toMatch(/\{open && children\}/);
  });

  it("no fixed widths or sideways-scrolling regions in the current-data components", () => {
    const dir = join(ROOT, "src/components/explorer/now");
    const files = [
      ...readdirSync(dir).map((f) => read(`src/components/explorer/now/${f}`)),
      read("src/components/explorer/WaterPanel.tsx"),
      read("src/components/explorer/NowPanel.tsx"),
    ];
    for (const f of files) {
      expect(f).not.toMatch(/min-w-\[\d+px\]/);
      expect(f).not.toMatch(/overflow-x-auto|overflow-auto/);
    }
  });
});
