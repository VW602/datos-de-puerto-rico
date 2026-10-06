import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DataTable } from "@/components/explorer/DataTable";
import { NoDataPattern } from "@/components/explorer/AtlasMap";
import geometry from "../../../data/generated/municipios.geometry.json";
import {
  NO_DATA_FILL,
  NO_DATA_HATCH,
  NO_DATA_PATTERN_ID,
  RAMP,
  colorForValue,
  rampColor,
} from "../scale";
import {
  SHAPES,
  SHAPE_BY_ID,
  WORLD_WIDTH,
  boundaryDistance,
  candidatesAt,
  clampView,
  contains,
  fitView,
  focusView,
  labelWidth,
  MAIN_ISLAND,
  mainIslandView,
  neighborInDirection,
  placeLabels,
  viewBox,
  resolveTap,
  zoomView,
  MAX_ZOOM,
} from "./geo";
import { applyLayers } from "./layers";
import { prMetricById } from "./metrics";
import { municipios } from "./places";
import { agencyDisplay, deltaText, searchPlaces, shortPeriod } from "./present";
import { PUBLIC_SOURCES } from "./sources";
import { toPublicPlaces } from "./public";
import { rankByMetric } from "./ranking";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const idByName = new Map(SHAPES.map((shape) => [shape.name, shape.id]));

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

describe("escala Arena → Añil", () => {
  it("usa exactamente las siete paradas aprobadas", () => {
    expect(RAMP).toEqual([
      "#FFF7DA",
      "#DEE197",
      "#85CF95",
      "#3BACA6",
      "#2181A4",
      "#2E5297",
      "#282869",
    ]);
    expect(rampColor(0)).toBe("#FFF7DA");
    expect(rampColor(1)).toBe("#282869");
  });

  it("mezcla en OKLab igual que en la prueba validada (pobreza 40–44 sobre 24.3–63.6)", () => {
    const colors = [40, 41, 42, 43, 44].map((v) => colorForValue(v, 24.3, 63.6, "linear"));
    expect(colors).toEqual(["#6AC19D", "#60BC9F", "#54B7A2", "#48B1A4", "#3BACA6"]);
  });

  it("el cero oficial es el tono más bajo válido", () => {
    expect(colorForValue(0, 0, 22.9, "linear")).toBe(RAMP[0]);
  });
});

describe("sin dato: siempre trama, nunca gris plano", () => {
  it("un valor que falta usa el patrón, no un color de la escala ni un gris", () => {
    expect(colorForValue(null, 0, 10, "linear")).toBe(NO_DATA_FILL);
    expect(NO_DATA_FILL).toBe(`url(#${NO_DATA_PATTERN_ID})`);
    expect(NO_DATA_FILL).not.toBe(colorForValue(0, 0, 10, "linear"));
  });

  it("el patrón dibuja rayas visibles sobre la base (≥ 3:1)", () => {
    const markup = renderToStaticMarkup(
      <svg>
        <NoDataPattern />
      </svg>,
    );
    expect(markup).toContain(`<pattern id="${NO_DATA_PATTERN_ID}"`);
    expect(markup).toMatch(new RegExp(`<line[^>]*stroke="${NO_DATA_HATCH.stripe}"`));
    expect(markup).toMatch(new RegExp(`<rect[^>]*fill="${NO_DATA_HATCH.base}"`));
    expect(NO_DATA_HATCH.stripeWidth).toBeGreaterThan(1);
    expect(contrast(NO_DATA_HATCH.stripe, NO_DATA_HATCH.base)).toBeGreaterThanOrEqual(3);
  });

  it("el CSS del mapa no le pone relleno a los municipios (no tapa la trama)", () => {
    const css = readFileSync(join(ROOT, "src/styles.css"), "utf8");
    const rule = css.match(/\.map-municipio\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(rule).not.toMatch(/(^|[^-])fill\s*:/);
  });
});

describe("estados del mapa sin depender del color", () => {
  const css = readFileSync(join(ROOT, "src/styles.css"), "utf8");
  const rule = (name: string) => css.match(new RegExp(`\\.${name}\\s*\\{([^}]*)\\}`))?.[1] ?? "";

  it("seleccionado: línea sólida sobre halo blanco", () => {
    expect(rule("map-selected-halo")).toMatch(/stroke:\s*#ffffff/);
    expect(rule("map-selected")).not.toMatch(/dasharray/);
  });

  it("foco: línea discontinua sobre halo, distinta de la selección", () => {
    expect(rule("map-focus")).toMatch(/stroke-dasharray/);
    expect(rule("map-focus-halo")).toMatch(/stroke:\s*#ffffff/);
  });

  it("hover: más fina que la selección", () => {
    const width = (text: string) => Number(text.match(/stroke-width:\s*([\d.]+)px/)?.[1]);
    expect(width(rule("map-hover"))).toBeLessThan(width(rule("map-selected")));
  });
});

describe("la paleta y las letras viejas no quedan en producción", () => {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.(ts|tsx|css)$/.test(name) && !/\.test\.tsx?$/.test(name)) files.push(path);
    }
  };
  walk(join(ROOT, "src"));

  it("sin bronce, sin modo oscuro viejo, sin Fraunces/Outfit/Alegreya/Plex", () => {
    expect(files.length).toBeGreaterThan(10);
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      expect(text, file).not.toMatch(
        /#d4a054|#31463c|#7d6840|#f6e7c4|#0c1210|#161e1b|Fraunces|Outfit|Alegreya|IBM Plex/i,
      );
    }
  });

  it("el texto de la interfaz no califica (sin mejor/peor/ganador)", () => {
    for (const file of files.filter((path) => path.includes("components"))) {
      const text = readFileSync(file, "utf8");
      expect(text, file).not.toMatch(
        /\b(mejor(es)?|peor(es)?|ganador|perdedor|best|worst|winner)\b/i,
      );
    }
  });
});

describe("geometría del mapa", () => {
  const collection = geometry as unknown as GeoJSON.FeatureCollection;

  it("dibuja los 78 municipios con todos sus anillos, sin quitar ni inventar islas", () => {
    expect(SHAPES).toHaveLength(78);
    expect(WORLD_WIDTH).toBe(1000);
    for (const feature of collection.features) {
      const id = (feature.properties as { id: string }).id;
      const shape = SHAPE_BY_ID.get(id)!;
      const rings =
        feature.geometry.type === "Polygon"
          ? feature.geometry.coordinates.length
          : (feature.geometry as GeoJSON.MultiPolygon).coordinates.reduce(
              (sum, polygon) => sum + polygon.length,
              0,
            );
      expect(shape.rings, id).toHaveLength(rings);
      expect(shape.d.length, id).toBeGreaterThan(10);
    }
  });

  it("Mona y Desecheo siguen siendo parte de Mayagüez, en su lugar al oeste", () => {
    const mayaguez = SHAPE_BY_ID.get("72097")!;
    expect(mayaguez.rings.length).toBeGreaterThanOrEqual(3);
    expect(mayaguez.bounds.x0).toBeLessThan(SHAPE_BY_ID.get("72005")!.bounds.x0);
  });

  it("al escoger Mayagüez, el mapa va al pueblo en la isla grande, no a Mona", () => {
    const mayaguez = SHAPE_BY_ID.get("72097")!;
    const view = focusView("72097", 390, 250)!;
    expect(view.cx).toBeGreaterThan(SHAPE_BY_ID.get("72005")!.bounds.x0);
    expect(contains(mayaguez, view.cx, view.cy)).toBe(true);
    expect(contains(mayaguez, ...mayaguez.label)).toBe(true);
  });
});

describe("toques en municipios pequeños", () => {
  const catano = SHAPE_BY_ID.get(idByName.get("Cataño")!)!;
  const bayamon = SHAPE_BY_ID.get(idByName.get("Bayamón")!)!;

  it("un toque en el borde entre Cataño y Bayamón pide escoger, en el mismo orden siempre", () => {
    const vertex = catano.rings.flat().find(([x, y]) => boundaryDistance(bayamon, x, y) < 0.01)!;
    expect(vertex).toBeDefined();
    const first = resolveTap(vertex[0], vertex[1], 3);
    const again = resolveTap(vertex[0], vertex[1], 3);
    expect(first).toEqual(again);
    expect(first.kind).toBe("choose");
    if (first.kind === "choose") {
      const names = first.candidates.map((c) => c.name);
      expect(names).toContain("Cataño");
      expect(names).toContain("Bayamón");
    }
  });

  it("un toque claro dentro de un municipio grande lo selecciona directamente", () => {
    const utuado = SHAPE_BY_ID.get(idByName.get("Utuado")!)!;
    const [x, y] = utuado.label;
    expect(contains(utuado, x, y)).toBe(true);
    expect(resolveTap(x, y, 1)).toEqual({ kind: "select", id: utuado.id });
  });

  it("los candidatos van: el que contiene el punto primero, luego por distancia y nombre", () => {
    const [x, y] = catano.label;
    const list = candidatesAt(x, y, 40);
    expect(list[0].inside).toBe(true);
    for (let i = 2; i < list.length; i += 1)
      expect(list[i].distance).toBeGreaterThanOrEqual(list[i - 1].distance);
  });

  it("un toque en el mar lejos de la costa no selecciona nada", () => {
    expect(resolveTap(500, -30, 5)).toEqual({ kind: "none" });
  });
});

describe("vistas del mapa", () => {
  it("el zoom se queda entre «toda la isla» y el máximo", () => {
    const fit = fitView(390, 250);
    expect(zoomView(fit, 1 / 4, 390, 250).k).toBeCloseTo(fit.k);
    expect(zoomView(fit, 1000, 390, 250).k).toBeCloseTo(fit.k * MAX_ZOOM);
    expect(clampView({ cx: 99999, cy: 99999, k: fit.k * 3 }, 390, 250).cx).toBeLessThan(1100);
  });

  it("al escoger un municipio pequeño, el mapa se acerca al menos 2.5×", () => {
    for (const name of [
      "Cataño",
      "Florida",
      "Culebra",
      "Ponce",
      "San Juan",
      "Vieques",
      "Mayagüez",
    ]) {
      const view = focusView(idByName.get(name)!, 390, 250)!;
      expect(view.k, name).toBeGreaterThanOrEqual(fitView(390, 250).k * 2.5 - 1e-9);
    }
  });

  it("las flechas del teclado llevan a un vecino, siempre el mismo", () => {
    const ponce = idByName.get("Ponce")!;
    for (const dir of ["left", "right", "up"] as const) {
      const next = neighborInDirection(ponce, dir);
      expect(next, dir).not.toBeNull();
      expect(neighborInDirection(ponce, dir)).toBe(next);
    }
  });
});

describe("textos de presentación", () => {
  const poverty = prMetricById("poverty");
  const income = prMetricById("income");

  it("el periodo corto sale del periodo de la fuente", () => {
    expect(shortPeriod("2020–2024 (estimado de 5 años; dólares ajustados a 2024)")).toBe(
      "2020–2024",
    );
    expect(shortPeriod("Años calendario 2022 y 2023")).toBe("2022–2023");
  });

  it("la diferencia con la mediana siempre lleva signo y número", () => {
    expect(deltaText(poverty, 5.65)).toBe("+5.7 pts");
    expect(deltaText(poverty, -19.75)).toBe("−19.8 pts");
    expect(deltaText(income, 1200)).toBe("+$1,200");
  });

  it("el buscador encuentra los 78, sin importar acentos", () => {
    expect(searchPlaces(SHAPES, "catano")[0].name).toBe("Cataño");
    expect(searchPlaces(SHAPES, "mayaguez")[0].name).toBe("Mayagüez");
    for (const shape of SHAPES) expect(searchPlaces(SHAPES, shape.name)[0].name).toBe(shape.name);
  });
});

describe("tabla secundaria accesible", () => {
  const places = toPublicPlaces(applyLayers(municipios));
  const metric = prMetricById("poverty");
  const ranking = rankByMetric(places, "poverty", "linear");
  const markup = renderToStaticMarkup(
    <DataTable
      metric={metric}
      places={places}
      ranking={ranking}
      selectedId="72113"
      onSelect={() => {}}
    />,
  );

  it("los encabezados anuncian su orden", () => {
    expect(markup).toContain('aria-sort="ascending"');
    expect(markup.match(/aria-sort="none"/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("la fila seleccionada se marca con texto y borde, no solo color", () => {
    expect(markup).toContain('Ponce<span class="sr-only"> (seleccionado)</span>');
    expect(markup).toMatch(/<tr class="[^"]*border-y-2[^"]*font-bold/);
  });

  it("cada barra frente a la mediana lleva su número con signo", () => {
    expect(markup).toContain("+5.7 pts");
    expect(markup.match(/ pts</g)?.length).toBe(78);
  });
});

describe("pulido final del atlas", () => {
  const W = 390;
  const H = 250;

  it("en el teléfono, el mapa ampliado empieza en la isla grande, más cerca que la vista general", () => {
    const start = mainIslandView(W, H);
    const fit = fitView(W, H);
    expect(start.k).toBeGreaterThan(fit.k * 1.4);
    const box = viewBox(start, W, H);
    expect(box.x0).toBeLessThanOrEqual(MAIN_ISLAND.x0);
    expect(box.x1).toBeGreaterThanOrEqual(MAIN_ISLAND.x1);
    const mona = SHAPE_BY_ID.get("72097")!.rings.reduce(
      (min, ring) => Math.min(min, ...ring.map((p) => p[0])),
      Infinity,
    );
    expect(mona).toBeLessThan(box.x0);
  });

  const overlaps = (
    labels: ReturnType<typeof placeLabels>,
    k: number,
    box: { x0: number; y0: number },
  ) => {
    const rects = labels.map((l) => {
      const w = labelWidth(l.name, l.size);
      const cx = (l.x - box.x0) * k;
      const top = (l.y - box.y0) * k - l.size * 0.95;
      return { x0: cx - w / 2, x1: cx + w / 2, y0: top, y1: top + l.size * 1.25 };
    });
    let count = 0;
    for (let i = 0; i < rects.length; i += 1)
      for (let j = i + 1; j < rects.length; j += 1) {
        const a = rects[i];
        const b = rects[j];
        if (a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0) count += 1;
      }
    return count;
  };

  it("los nombres no se tapan, el seleccionado siempre gana y el resultado es siempre igual", () => {
    for (const name of ["Ponce", "Cataño", "San Juan", "Mayagüez", "Florida"]) {
      const id = idByName.get(name)!;
      const view = focusView(id, W, H)!;
      const box = viewBox(view, W, H);
      const first = placeLabels(box, view.k, { selectedId: id, showAll: true });
      expect(first[0].id, name).toBe(id);
      expect(first[0].bold).toBe(true);
      expect(overlaps(first, view.k, box), name).toBe(0);
      expect(placeLabels(box, view.k, { selectedId: id, showAll: true })).toEqual(first);
    }
  });

  it("Peñuelas y Guayanilla no chocan; al acercarse más, vuelven los dos", () => {
    const ponce = idByName.get("Ponce")!;
    const view = focusView(ponce, W, H)!;
    const near = placeLabels(viewBox(view, W, H), view.k, { selectedId: ponce, showAll: true });
    expect(overlaps(near, view.k, viewBox(view, W, H))).toBe(0);
    const pen = SHAPE_BY_ID.get(idByName.get("Peñuelas")!)!.label;
    const gua = SHAPE_BY_ID.get(idByName.get("Guayanilla")!)!.label;
    const closer = { cx: (pen[0] + gua[0]) / 2, cy: (pen[1] + gua[1]) / 2, k: view.k * 4 };
    const zoomedIn = placeLabels(viewBox(closer, W, H), closer.k, {
      selectedId: ponce,
      showAll: true,
    }).map((l) => l.name);
    expect(zoomedIn).toContain("Peñuelas");
    expect(zoomedIn).toContain("Guayanilla");
  });

  it("de lejos solo se rotulan el seleccionado y el foco", () => {
    const fit = fitView(1440, 512);
    const box = viewBox(fit, 1440, 512);
    const ponce = idByName.get("Ponce")!;
    const cayey = idByName.get("Cayey")!;
    const labels = placeLabels(box, fit.k, { selectedId: ponce, focusId: cayey, showAll: false });
    expect(labels.map((l) => l.id).sort()).toEqual([ponce, cayey].sort());
  });

  it("cada agencia muestra una descripción en español sin cambiar su nombre oficial", () => {
    for (const source of PUBLIC_SOURCES) {
      const shown = agencyDisplay(source.sourceAgency);
      expect(shown.es, source.datasetId).toBeTruthy();
      expect(shown.official).toBe(source.sourceAgency);
    }
    expect(agencyDisplay("U.S. Census Bureau, Geography Division").from).toBe(
      "la Oficina del Censo de EE. UU.",
    );
    expect(agencyDisplay("Centers for Disease Control and Prevention (CDC), BRFSS").from).toMatch(
      /^los Centros/,
    );
  });

  it("las letras se sirven desde el sitio: ni una sola petición a Google Fonts", () => {
    const files = [
      join(ROOT, "src/routes/__root.tsx"),
      join(ROOT, "src/styles.css"),
      join(ROOT, "src/fonts.css"),
    ];
    for (const file of files)
      expect(readFileSync(file, "utf8"), file).not.toMatch(/fonts\.(googleapis|gstatic)\.com/);
    const fonts = readFileSync(join(ROOT, "src/fonts.css"), "utf8");
    const urls = [...fonts.matchAll(/url\("([^"]+)"\)/g)].map((m) => m[1].split("/").pop());
    expect(urls.sort()).toEqual([
      "newsreader-latin-opsz-normal.woff2",
      "source-sans-3-latin-400-italic.woff2",
      "source-sans-3-latin-400-normal.woff2",
      "source-sans-3-latin-600-normal.woff2",
      "source-sans-3-latin-700-normal.woff2",
    ]);
    expect(fonts.match(/font-display: swap;/g)).toHaveLength(5);
    expect(readFileSync(join(ROOT, "src/styles.css"), "utf8")).toMatch(
      /^@import "\.\/fonts\.css";/,
    );
  });
});
