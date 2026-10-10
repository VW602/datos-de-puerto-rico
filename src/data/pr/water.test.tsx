import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WaterBlock } from "@/components/explorer/WaterPanel";
import {
  buildData,
  normalizeWater,
  recordWaterFailure,
  waterSnapshot,
  type WaterRaw,
} from "../../../scripts/water/normalize.ts";
import { API_BASE } from "../../../scripts/water/source.ts";
import { prTime } from "./currentModel";
import { viewCounts, viewRows, waterStatus, type WaterView } from "./water";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const fx = (name: string) =>
  JSON.parse(read(`scripts/water/fixtures/${name}.json`)) as {
    retrievedAt: string;
    features: WaterRaw["latest"];
  };
const IDS = new Set(
  Object.keys(
    (JSON.parse(read("data/generated/census-municipios.json")) as { municipios: object })
      .municipios,
  ),
);
const RETRIEVED = fx("latest").retrievedAt;
const snap = waterSnapshot({
  retrievedAt: RETRIEVED,
  lastAttempt: { at: RETRIEVED, ok: true, error: null },
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
        latest: fx("latest").features,
        meta: fx("meta").features,
        locations: fx("locations").features,
        continuous: fx("continuous").features,
      },
      RETRIEVED,
      IDS,
    ),
  ),
});
const SOON = new Date(Date.parse(RETRIEVED) + 10 * 60000);
const render = (view: WaterView = "RIOS", now = SOON, s = snap) =>
  renderToStaticMarkup(<WaterBlock now={now} water={s} initialView={view} />);
const text = (html: string) =>
  html
    .replace(/<title>[\s\S]*?<\/title>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");

describe("Agua ahora: what the reader sees", () => {
  it("says these are USGS station measurements, provisional, and not flood warnings", () => {
    const t = text(render());
    expect(t).toMatch(/Agua ahora: estaciones del USGS/);
    expect(t).toMatch(/Estas son mediciones de estaciones del USGS; no son avisos de inundación\./);
    expect(t).toMatch(/Datos provisionales sujetos a revisión por el USGS/);
    // No invented categories (as labels) and no danger language.
    expect(t).not.toMatch(/\b(Normal|Alto|Bajo|Peligroso|Seguro|Crítico)\b/);
    expect(t).not.toMatch(/\b(peligro|emergencia|evacua\w*|riesgo)\b/i);
    // "inundación" only ever appears to say what these are not.
    for (const m of t.matchAll(/inundación/g))
      expect(t.slice(Math.max(0, m.index - 40), m.index)).toMatch(
        /no son avisos de |ni un nivel de /,
      );
  });

  it("counts reporting, stale and no-data stations per measure", () => {
    expect(viewCounts(snap, "RIOS", SOON)).toEqual({
      DISCHARGE: { reporting: 3, stale: 1, noData: 1, total: 5 },
      GAGE_HEIGHT: { reporting: 3, stale: 0, noData: 1, total: 4 },
    });
    const t = text(render());
    expect(t).toMatch(
      /Caudal: 3 de 5 estaciones con dato reciente · sin dato reciente: 1 · sin dato: 1/,
    );
  });

  it("stale station, no-data station and a qualified zero are told apart", () => {
    const t = text(render());
    expect(t).toMatch(/TEST FIXTURE STALE STATION[\s\S]*?Sin dato reciente \(hace 10 h\)/);
    expect(t).toMatch(/Sin dato Provisional · curva de caudal en desarrollo/);
    expect(t).toMatch(/0\.00 ft³\/s Provisional · seco \(USGS\)/);
  });

  it("shows units as published with a readable name, and the station's place only as a location", () => {
    const html = render();
    expect(html).toContain('<abbr title="pies cúbicos por segundo">ft³/s</abbr>');
    expect(text(html)).toMatch(/Estación ubicada en Hormigueros · USGS-50136400/);
    expect(text(html)).not.toMatch(/condiciones (de|en) (todo )?Hormigueros/);
    expect(text(html)).toMatch(/Altura del medidor/);
    expect(text(html)).toMatch(/no es la profundidad del río ni un nivel de inundación/);
  });

  it("rain: per-station 24-hour totals, never an island total or ranking", () => {
    const t = text(render("LLUVIA"));
    expect(t).toMatch(/0\.43 in en 24 h hasta/);
    expect(t).toMatch(/Total de 24 h no disponible \(registros incompletos\)/);
    expect(t).toMatch(/no se suman ni se ordenan estaciones entre sí/);
    expect(t).not.toMatch(/total de Puerto Rico|en toda la isla|ranking/i);
    expect(t).toMatch(/Valor negativo publicado por el USGS: se marca para revisión/);
  });

  it("reservoirs: elevation with its datum, never a percent full", () => {
    const t = text(render("EMBALSES"));
    expect(t).toMatch(
      /Elevación del agua sobre el Datum Vertical de Puerto Rico de 2002 \(PRVD02\)/,
    );
    expect(t).toMatch(/2421\.82 ft/);
    expect(t).toMatch(/No es un porcentaje de llenado/);
    expect(t).not.toMatch(/\d\s*%|\blleno\b|capacidad:/i);
  });

  it("the map draws points, one shape per view, the same size for every station", () => {
    for (const [view, tag] of [
      ["RIOS", "circle"],
      ["LLUVIA", "path"],
      ["EMBALSES", "rect"],
    ] as const) {
      const html = render(view);
      const map = html.slice(
        html.indexOf('role="img"'),
        html.indexOf("</svg>", html.indexOf('role="img"')),
      );
      const markers = map.match(/<g>[\s\S]*?<\/g>/g) ?? [];
      expect(markers).toHaveLength(viewRows(snap, view, SOON).length);
      for (const m of markers) expect(m).toContain(`<${tag}`);
      if (view === "RIOS") expect(new Set(map.match(/ r="[^"]+"/g))).toEqual(new Set([' r="13"']));
      expect(map).toMatch(/no un municipio/);
    }
  });

  it("is reachable and readable without color: buttons, table, region, legend", () => {
    const html = render();
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html).toContain('tabindex="0"');
    expect(html).toMatch(/<caption class="sr-only">/);
    expect(text(html)).toMatch(
      /relleno: dato reciente\. vacío: sin dato reciente\. con equis: sin dato\./,
    );
    expect(html).toMatch(/scope="row"/);
  });

  it("source unavailable: never zero stations, says it could not confirm", () => {
    const never = recordWaterFailure(null, { at: RETRIEVED, ok: false, error: "timeout" });
    expect(waterStatus(never, SOON).kind).toBe("UNCONFIRMED");
    const t = text(render("RIOS", SOON, never));
    expect(t).toMatch(
      /No se pudieron confirmar las condiciones actuales del agua\. No hay ninguna copia del USGS\./,
    );
    expect(t).not.toMatch(/con dato reciente|0 de 0/);
  });

  it("source stale: last saved values, labelled as such", () => {
    const later = new Date(Date.parse(RETRIEVED) + 26 * 3600_000);
    const t = text(render("RIOS", later));
    expect(t).toMatch(
      /No se pudieron confirmar las condiciones actuales del agua\. Lo que sigue es lo último/,
    );
  });

  it("provenance names the agency, service, site, parameter, unit, times and status", () => {
    const html = render();
    const t = text(html);
    expect(t).toMatch(/¿De dónde sale este dato\?/);
    expect(t).toMatch(/U\.S\. Geological Survey \(USGS\), Water Data for the Nation/);
    expect(t).toMatch(/USGS Water Data OGC APIs, V1/);
    expect(t).toMatch(/parámetro 00060/);
    expect(t).toContain(`Obtenido: ${prTime(RETRIEVED)}`);
    expect(t).toMatch(/La hora de obtención no es la hora de las mediciones/);
    expect(html).toContain('href="https://api.waterdata.usgs.gov/docs/ogcapi/"');
    expect(html).toContain('href="https://waterdata.usgs.gov/provisional-data-statement/"');
    expect(html).toContain('href="https://waterdata.usgs.gov/monitoring-location/USGS-50136400/"');
  });

  it("the page never calls USGS, and loads the water files only on demand", () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const f of readdirSync(dir)) {
        const p = join(dir, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f)) files.push(p);
      }
    };
    walk(join(ROOT, "src"));
    for (const f of files) {
      const s = readFileSync(f, "utf8");
      expect(s).not.toMatch(/fetch\(|XMLHttpRequest/);
      expect(s).not.toMatch(/from "[^"]*usgs-water[^"]*\.json"/);
    }
  });
});
