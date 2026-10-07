import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SignedPatterns } from "@/components/explorer/AtlasMap";
import { Legend } from "@/components/explorer/MapBits";
import { Ranking78 } from "@/components/explorer/Ranking78";
import {
  NEGATIVE_FILL,
  NEGATIVE_PATTERN_ID,
  NO_DATA_FILL,
  ZERO_FILL,
  ZERO_PATTERN_ID,
  colorForValue,
  rampColor,
  valueClass,
} from "../scale";
import { money } from "./funds";
import { prMetricById } from "./metrics";
import { municipios } from "./places";
import { rankByMetric } from "./ranking";

const obligations = prMetricById("fedObligations");

describe("montos con signo (obligaciones federales)", () => {
  it("las medidas de fondos federales se marcan con signo; las demás no cambian", () => {
    for (const id of ["fedObligations", "fedOutlays", "fedAwards"] as const)
      expect(prMetricById(id).signed).toBe(true);
    expect(prMetricById("traffic").signed).toBeFalsy();
    // Unsigned measures keep their rule: 0 is the lowest ramp color.
    expect(colorForValue(0, 0, 10, "linear")).toBe(rampColor(0));
  });

  it("negativo, cero, sin dato y positivo son cuatro clases distintas", () => {
    expect(valueClass(-1_200_000)).toBe("NEGATIVE");
    expect(valueClass(0)).toBe("ZERO");
    expect(valueClass(null)).toBe("NO_DATA");
    expect(valueClass(4_800_000)).toBe("POSITIVE");
  });

  it("en el mapa, un negativo no es $0, no es sin dato, ni el color positivo más bajo", () => {
    const min = 1_000;
    const max = 1e9;
    const negative = colorForValue(-1_200_000, min, max, "log", true);
    const zero = colorForValue(0, min, max, "log", true);
    const missing = colorForValue(null, min, max, "log", true);
    const lowestPositive = colorForValue(min, min, max, "log", true);
    expect(negative).toBe(NEGATIVE_FILL);
    expect(zero).toBe(ZERO_FILL);
    expect(missing).toBe(NO_DATA_FILL);
    expect(lowestPositive).toBe(rampColor(0));
    expect(new Set([negative, zero, missing, lowestPositive]).size).toBe(4);
    // A tiny positive is still on the ramp, not in a signed class.
    expect(colorForValue(1, min, max, "log", true)).toBe(rampColor(0));
  });

  it("los patrones de cero y negativo existen en el mapa", () => {
    const html = renderToStaticMarkup(
      <svg>
        <defs>
          <SignedPatterns />
        </defs>
      </svg>,
    );
    expect(html).toContain(`id="${ZERO_PATTERN_ID}"`);
    expect(html).toContain(`id="${NEGATIVE_PATTERN_ID}"`);
  });

  it("los montos se escriben con su signo, sin valor absoluto ni piso en cero", () => {
    expect(money(-1_200_000)).toBe("−$1.2 millones");
    expect(money(0)).toBe("$0");
    expect(money(4_800_000)).toBe("$4.8 millones");
    expect(obligations.format(-1_200_000)).toBe("−$1.2 millones");
    expect(obligations.versus(-1_200_000, 5e6)).toBe("Obligación neta negativa (desobligaciones)");
    expect(obligations.versus(0, 5e6)).toBe("$0");
  });

  it("la leyenda nombra el cero y el neto negativo, sin juzgarlos", () => {
    const html = renderToStaticMarkup(
      <Legend
        metric={obligations}
        min={1000}
        max={1e9}
        islandOnly={false}
        missingCount={1}
        zeroCount={1}
        negativeCount={2}
      />,
    );
    expect(html).toContain("Neto negativo (2)");
    expect(html).toContain("$0 (1)");
    expect(html).toContain("Sin dato publicado (1)");
    expect(html).not.toMatch(/peor|mejor|alarma|malo/i);
  });

  it("en el ranking, los negativos quedan bajo el cero y aparte del eje positivo", () => {
    const [a, b, c, d] = municipios;
    const places = [
      { ...a, values: { ...a.values, fedObligations: 5_000_000 } },
      { ...b, values: { ...b.values, fedObligations: 0 } },
      { ...c, values: { ...c.values, fedObligations: -1_200_000 } },
      { ...d, values: { ...d.values, fedObligations: null } },
    ];
    const ranking = rankByMetric(places, "fedObligations", obligations.scale);
    expect(ranking.ranked.map((p) => p.values.fedObligations)).toEqual([5_000_000, 0, -1_200_000]);
    const fills = Object.fromEntries(
      places.map((p) => [
        p.id,
        colorForValue(p.values.fedObligations ?? null, ranking.min, ranking.max, "log", true),
      ]),
    );
    const html = renderToStaticMarkup(
      <Ranking78
        metric={obligations}
        ranking={ranking}
        fills={fills}
        selectedId={null}
        missingCount={1}
        onSelect={() => {}}
      />,
    );
    expect(html).toContain("−$1.2 millones");
  });
});
