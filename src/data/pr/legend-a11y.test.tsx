import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Legend } from "@/components/explorer/MapBits";
import { prMetricById, type PrMetricId } from "./metrics";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const text = (html: string) => html.replace(/<[^>]+>/g, "").replace(/&#x27;/g, "'");

function legend(
  id: PrMetricId,
  min: number,
  max: number,
  extra: { zero?: number; negative?: number; missing?: number; compact?: boolean } = {},
) {
  const metric = prMetricById(id);
  const html = renderToStaticMarkup(
    <Legend
      metric={metric}
      min={min}
      max={max}
      islandOnly={false}
      missingCount={extra.missing ?? 0}
      zeroCount={extra.zero ?? 0}
      negativeCount={extra.negative ?? 0}
      compact={extra.compact}
    />,
  );
  return { html, metric };
}

// The Legend function's own source (MapBits holds other components too).
const LEGEND_SOURCE = (() => {
  const s = read("src/components/explorer/MapBits.tsx");
  const start = s.indexOf("export function Legend(");
  return s.slice(start, s.indexOf("\nexport function", start + 10));
})();

describe("Atlas map legend at large text, zoom and narrow widths", () => {
  it("follows its own width: one line with room, ramp on its own line when narrow", () => {
    for (const compact of [false, true]) {
      const { html } = legend("fedObligations", 7_100_000, 1_810_000_000, { compact });
      expect(html).toMatch(/<div class="@container flex flex-wrap[^"]*" data-map-legend="true">/);
      // The value row itself can wrap.
      expect(html).toMatch(
        /<div class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 tabular/,
      );
      // Narrow: the ramp takes a full line below; wide: back between the values.
      expect(html).toMatch(
        /class="order-last block h-3 basis-full[^"]*@\[22rem\]:order-none[^"]*@\[22rem\]:min-w-24[^"]*@\[22rem\]:flex-1/,
      );
      // The highest value stays at the right end when the row wraps.
      expect(html).toMatch(
        /<span class="ml-auto min-w-0 text-right @\[22rem\]:ml-0"><span class="sr-only">Valor más alto: /,
      );
    }
  });

  it("keeps the full formatted values for money, percentages and counts", () => {
    const cases: [PrMetricId, number, number][] = [
      ["fedObligations", 7_100_000, 1_810_000_000],
      ["femaPaObligated", 5_900_000, 655_900_000],
      ["unemploymentMonthly", 1.7, 30.8],
      ["poverty", 24.3, 63.6],
      ["population", 1281, 338_661],
    ];
    for (const [id, min, max] of cases) {
      const { html, metric } = legend(id, min, max);
      const t = text(html);
      expect(t).toContain(`Valor más bajo: ${metric.formatTick(min)}`);
      expect(t).toContain(`Valor más alto: ${metric.formatTick(max)}`);
    }
  });

  it("zero, net-negative and no-data states stay in the legend", () => {
    const { html, metric } = legend("fedObligations", -1_200_000, 1_810_000_000, {
      zero: 3,
      negative: 2,
      missing: 1,
    });
    const t = text(html);
    expect(t).toContain(`${metric.format(0)} (3)`);
    expect(t).toContain("Neto negativo (2)");
    expect(t).toContain("Sin dato publicado (1)");
    expect(t).toContain("Más oscuro = más alto · escala logarítmica");
    expect(t).toContain("Seleccionado");
  });

  it("no nowrap, clipping, ellipsis or rigid widths in the legend", () => {
    expect(LEGEND_SOURCE).not.toMatch(
      /whitespace-nowrap|truncate|text-ellipsis|line-clamp|overflow-hidden/,
    );
    // Value labels may shrink and wrap; only decorative swatches keep their size.
    expect(LEGEND_SOURCE).not.toMatch(/<span className="shrink-0">\{metric\.formatTick/);
    expect(LEGEND_SOURCE).not.toMatch(/min-w-\[\d+(px|rem)\]/);
    // The ramp's minimum width applies only when the legend has room for it.
    expect(LEGEND_SOURCE).not.toMatch(/"block h-3 min-w-24/);
  });

  it("the desktop map bar lets the legend move under a long metric name", () => {
    const app = read("src/components/explorer/PuertoRicoApp.tsx");
    expect(app).toMatch(
      /flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-divider bg-surface px-14 py-3/,
    );
    expect(app).toMatch(/<p className="min-w-0 text-\[13px\] font-bold">\{metric\.label\}<\/p>/);
    expect(app).toMatch(/<div className="min-w-0 flex-1 basis-72">/);
  });
});
