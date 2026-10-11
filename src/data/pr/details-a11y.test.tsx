import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SourcePanel } from "@/components/explorer/SourcePanel";
import { Summary } from "@/components/explorer/Summary";
import { applyLayers } from "./layers";
import { prMetricById, type PrMetricId } from "./metrics";
import { municipios } from "./places";
import { toPublicPlaces } from "./public";
import { rankByMetric } from "./ranking";
import { publicSourceForMetric } from "./sources";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, "")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&");
const PLACES = toPublicPlaces(applyLayers(municipios));
const NO_CLIP = /whitespace-nowrap|truncate|text-ellipsis|line-clamp|overflow-hidden/;

describe("source panel: long machine identifiers", () => {
  const panel = (id: PrMetricId) =>
    renderToStaticMarkup(<SourcePanel metric={prMetricById(id)} place={PLACES[0]!} />);

  it("dataset, field and series identifiers stay complete and may wrap", () => {
    const fema = text(panel("femaPaObligated"));
    expect(fema).toContain("PublicAssistanceFundedProjectsDetails");
    expect(fema).toContain("federalShareObligated");
    expect(text(panel("fedObligations"))).toContain("federal_action_obligation");
    expect(text(panel("unemploymentMonthly"))).toMatch(/LAU[A-Z0-9]{10,}/);
    for (const id of [
      "femaPaObligated",
      "fedObligations",
      "unemploymentMonthly",
      "income",
    ] as const) {
      const html = panel(id);
      // The panel lets any unbreakable string break instead of widening the page…
      expect(html).toMatch(
        /aria-label="¿De dónde sale este dato\?" class="[^"]*\[overflow-wrap:anywhere\]/,
      );
      // …and its two columns can shrink below their longest word.
      expect(html).toContain("md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]");
      expect(html).not.toMatch(NO_CLIP);
      expect(html).not.toContain("…");
    }
  });

  it("the official-source link keeps a descriptive label and its exact destination", () => {
    const html = panel("femaPaObligated");
    const source = publicSourceForMetric("femaPaObligated")!;
    expect(html).toContain(`href="${source.sourceURL!.replace(/&/g, "&amp;")}"`);
    expect(html).toMatch(/>Ver la fuente oficial ↗<\/a>/);
    expect(html).not.toMatch(/min-w-\[\d+(px|rem)\]/);
  });

  it("no clipping or forced widths in the source panel", () => {
    const source = read("src/components/explorer/SourcePanel.tsx");
    expect(source).not.toMatch(NO_CLIP);
    expect(source).not.toMatch(/min-w-\[\d+(px|rem)\]/);
  });
});

describe("selected-municipio summary: large values", () => {
  const summary = (id: PrMetricId, place = PLACES.find((p) => p.name === "San Juan")!) => {
    const metric = prMetricById(id);
    const ranking = rankByMetric(PLACES, id, metric.scale);
    const html = renderToStaticMarkup(
      <Summary metric={metric} place={place} ranking={ranking} onClear={() => {}} />,
    );
    const headline = /<p class="[^"]*font-display[^"]*" aria-live="polite">([^<]*)<\/p>/.exec(html);
    return { html, metric, ranking, headline: headline?.[1], value: place.values[id] };
  };

  it("large currency, percentage and FEMA headlines show the exact formatted value", () => {
    for (const id of ["fedObligations", "femaPaObligated", "poverty", "income"] as const) {
      const { headline, metric, value } = summary(id);
      expect(value).not.toBeNull();
      expect(headline).toBe(metric.format(value!));
    }
  });

  it("a negative currency headline stays complete, sign included", () => {
    const base = PLACES.find((p) => p.name === "San Juan")!;
    const negative = { ...base, values: { ...base.values, fedObligations: -1_234_567 } };
    const { headline, metric } = summary("fedObligations", negative);
    expect(headline).toBe(metric.format(-1_234_567));
    expect(headline).toMatch(/^−\$/);
  });

  it("the headline size follows the summary's width, never below a large floor", () => {
    const { html } = summary("fedObligations");
    expect(html).toMatch(
      /aria-label="Municipio seleccionado: San Juan" class="@container [^"]*break-words/,
    );
    expect(html).toMatch(/text-\[clamp\(2\.25rem,20cqi,4\.5rem\)\]/);
    expect(html).toMatch(/md:text-\[clamp\(2\.25rem,20cqi,6rem\)\]/);
  });

  it("comparison and detail rows can wrap; nothing requires nowrap", () => {
    const { html, metric, ranking } = summary("fedObligations");
    expect(text(html)).toContain(`Frente a la mediana (${metric.format(ranking.median)})`);
    expect(html).toMatch(/grid grid-cols-1 border-t border-divider @\[18rem\]:grid-cols-2/);
    for (const file of ["Summary", "FundsDetail", "FemaDetail"]) {
      const source = read(`src/components/explorer/${file}.tsx`);
      expect(source).not.toMatch(NO_CLIP);
      expect(source).not.toMatch(/shrink-0 [^"]*tabular|className="shrink-0/);
      // A fixed-width table is allowed only inside its own scroll container (FEMA project list).
      for (const m of source.matchAll(/min-w-\[\d+(px|rem)\]/g)) {
        const before = source.slice(Math.max(0, m.index - 400), m.index);
        expect(before).toMatch(/overflow-x-auto/);
      }
    }
    // Label and value rows wrap the value under the label instead of squeezing it.
    expect(read("src/components/explorer/FundsDetail.tsx")).toMatch(
      /flex flex-wrap items-baseline justify-between gap-x-3/,
    );
    expect(read("src/components/explorer/FemaDetail.tsx")).toMatch(
      /flex flex-wrap items-baseline justify-between gap-x-3/,
    );
  });
});
