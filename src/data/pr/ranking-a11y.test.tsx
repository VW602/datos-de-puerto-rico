import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Ranking78 } from "@/components/explorer/Ranking78";
import { prMetricById, type PrMetricId } from "./metrics";
import { applyLayers } from "./layers";
import { municipios } from "./places";
import { toPublicPlaces } from "./public";
import { rankByMetric } from "./ranking";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

// The places the site shows, with every published layer (Census, BLS, USAspending, FEMA).
const PLACES = toPublicPlaces(applyLayers(municipios));

function render(id: PrMetricId, places = PLACES, withSelection = true) {
  const metric = prMetricById(id);
  const ranking = rankByMetric(places, id, metric.scale);
  // The municipio with the longest name, to stress the median line.
  const selected = withSelection
    ? [...ranking.ranked].sort((a, b) => b.name.length - a.name.length)[0]!
    : null;
  const html = renderToStaticMarkup(
    <Ranking78
      metric={metric}
      ranking={ranking}
      fills={{}}
      selectedId={selected?.id ?? null}
      missingCount={0}
      onSelect={() => {}}
    />,
  );
  return { html, metric, ranking, selected };
}
const scaleRow = (html: string) => {
  const start = html.indexOf("data-scale-labels");
  const open = html.lastIndexOf("<div", start);
  return html.slice(open, html.indexOf("</div>", start));
};
const text = (html: string) => html.replace(/<[^>]+>/g, "").replace(/&#x27;/g, "'");

// Census, BLS, USAspending (signed, with negatives and zero) and FEMA.
const METRICS: PrMetricId[] = [
  "income",
  "unemploymentMonthly",
  "fedObligations",
  "femaPaObligated",
];

describe("Atlas ranking at large zoom and on narrow columns", () => {
  it("the min / median / max labels can wrap, by the ranking's own width", () => {
    for (const id of METRICS) {
      const { html } = render(id);
      const row = scaleRow(html);
      // A container query on the ranking, not the screen.
      expect(html).toMatch(
        /class="@container mt-1"><div class="[^"]*flex-wrap[^"]*@md:flex-nowrap/,
      );
      // Narrow: lowest and highest stay at the ends; the median gets its own line.
      expect(row).toMatch(/class="[^"]*order-last[^"]*basis-full[^"]*text-center/);
      expect(row).toMatch(
        /class="ml-auto min-w-0 text-right"><span class="sr-only">Valor más alto: /,
      );
      expect(row).toMatch(/<span class="min-w-0"><span class="sr-only">Valor más bajo: /);
    }
  });

  it("labels keep their full values: nothing abbreviated, clipped or dropped", () => {
    for (const id of METRICS) {
      const { html, metric, ranking, selected } = render(id);
      const row = text(scaleRow(html));
      const low = ranking.ranked[ranking.ranked.length - 1]!;
      const high = ranking.ranked[0]!;
      expect(row).toContain(`Valor más bajo: ${metric.format(low.values[id]!)}`);
      expect(row).toContain(`Valor más alto: ${metric.format(high.values[id]!)}`);
      expect(row).toContain(`mediana ${metric.format(ranking.median)}`);
      expect(row).toContain(`${selected!.name} ${metric.format(selected!.values[id]!)}`);
    }
  });

  it("negative and zero values keep their signed format on the scale", () => {
    const [a, b, c] = municipios;
    const places = [
      { ...a, values: { ...a.values, fedObligations: 5_000_000 } },
      { ...b, values: { ...b.values, fedObligations: 0 } },
      { ...c, values: { ...c.values, fedObligations: -1_200_000 } },
    ];
    const row = text(scaleRow(render("fedObligations", places, false).html));
    expect(row).toContain("Valor más bajo: −$1.2 millones");
    expect(row).toContain("Valor más alto: $5.0 millones");
  });

  it("ranking rows let the value move under the name instead of overlapping it", () => {
    const { html, metric, ranking } = render("femaPaObligated");
    const buttons = html.match(/<button type="button"[^>]*>[\s\S]*?<\/button>/g)!;
    expect(buttons.length).toBeGreaterThanOrEqual(10);
    for (const b of buttons) {
      expect(b).toMatch(/class="flex min-h-11 w-full flex-wrap/);
      expect(b).toMatch(/<span class="ml-auto min-w-0 text-right">/);
    }
    // The value text is the full formatted value.
    expect(text(buttons[0]!)).toContain(metric.format(ranking.ranked[0]!.values.femaPaObligated!));
  });

  it("no fixed widths, no-wrap or clipping that could force or hide overflow", () => {
    const source = read("src/components/explorer/Ranking78.tsx");
    expect(source).not.toMatch(
      /min-w-\[\d+(px|rem)\]|whitespace-nowrap|truncate|text-ellipsis|overflow-hidden|shrink-0/,
    );
    const { html } = render("femaPaObligated");
    expect(html).not.toMatch(
      /min-w-\[\d+(px|rem)\]|whitespace-nowrap|truncate|text-ellipsis|overflow-hidden/,
    );
  });

  it("the ranking column keeps a usable minimum width beside the summary", () => {
    const app = read("src/components/explorer/PuertoRicoApp.tsx");
    const track = /md:grid-cols-\[minmax\(0,500px\)_minmax\(([^,]+),1fr\)\]/.exec(app);
    expect(track).not.toBeNull();
    expect(track![1]).not.toBe("0");
    expect(track![1]).toMatch(/rem$/); // grows with the reader's text size
  });
});
