import { describe, expect, it } from "vitest";
import { colorForValue } from "@/data/scale";
import { applyLayers } from "./layers";
import { PR_METRICS, metricGrain } from "./metrics";
import { MISSING_COPY, missingReason } from "./missing";
import { municipios } from "./places";
import { toPublicPlaces } from "./public";
import { rankByMetric } from "./ranking";

const places = toPublicPlaces(applyLayers(municipios));

describe("null no es cero", () => {
  it("un valor que falta queda null en el producto, nunca 0", () => {
    const tampered = places.map((place) => ({
      ...place,
      values: { ...place.values, poverty: place.name === "Culebra" ? null : place.values.poverty },
    }));
    expect(tampered.find((place) => place.name === "Culebra")!.values.poverty).toBeNull();
    expect(rankByMetric(tampered, "poverty", "linear").ranked).toHaveLength(77);
  });

  it("un valor que falta no se pinta con el color del valor más bajo", () => {
    expect(colorForValue(null, 0, 100, "linear")).not.toBe(colorForValue(0, 0, 100, "linear"));
    expect(colorForValue(null, 1, 100, "log")).not.toBe(colorForValue(1, 1, 100, "log"));
  });

  it("los textos de dato faltante nunca dicen 0 ni N/A", () => {
    for (const copy of Object.values(MISSING_COPY)) {
      for (const text of [copy.short, copy.long]) {
        expect(text).not.toMatch(/\b0\b/);
        expect(text).not.toMatch(/N\/A/i);
      }
    }
  });

  it("las medidas de toda la isla explican que no hay cifra por municipio", () => {
    for (const metric of PR_METRICS) {
      const reason = missingReason(metric.id);
      if (metricGrain(metric.id) === "isla") expect(reason).toBe("geography_unavailable");
      else expect(reason).toBe("not_published");
    }
  });
});

describe("rankings con datos que faltan", () => {
  it("dejan fuera los municipios sin cifra y ordenan de mayor a menor", () => {
    const partial = places.map((place) => ({
      ...place,
      values: {
        ...place.values,
        poverty: place.name === "Hormigueros" ? null : place.values.poverty,
      },
    }));
    const { ranked } = rankByMetric(partial, "poverty", "linear");
    expect(ranked).toHaveLength(77);
    expect(ranked.some((place) => place.name === "Hormigueros")).toBe(false);
    for (let i = 1; i < ranked.length; i += 1) {
      expect(ranked[i - 1].values.poverty!).toBeGreaterThanOrEqual(ranked[i].values.poverty!);
    }
  });

  it("calculan la mediana solo con las cifras publicadas", () => {
    const three = places.map((place, index) => ({
      ...place,
      values: { ...place.values, poverty: index < 3 ? [10, 30, 20][index] : null },
    }));
    const { median, ranked } = rankByMetric(three, "poverty", "linear");
    expect(ranked).toHaveLength(3);
    expect(median).toBe(20);
  });

  it("dan el mismo orden cada vez, aun con empates", () => {
    const first = rankByMetric(places, "traffic", "linear").ranked.map((place) => place.id);
    const second = rankByMetric([...places].reverse(), "traffic", "linear").ranked.map(
      (place) => place.id,
    );
    expect(second).toEqual(first);
  });

  it("devuelven una lista vacía, no ceros, cuando nadie tiene cifra", () => {
    const empty = places.map((place) => ({ ...place, values: { ...place.values, poverty: null } }));
    expect(rankByMetric(empty, "poverty", "linear").ranked).toEqual([]);
  });
});

describe("límites de las cifras", () => {
  const percentMetrics = PR_METRICS.filter((metric) => metric.format(50).endsWith("%"));

  it("hay medidas en por ciento que revisar", () => {
    expect(percentMetrics.length).toBeGreaterThan(15);
  });

  it("todo por ciento está entre 0 y 100", () => {
    for (const metric of percentMetrics) {
      if (metricGrain(metric.id) === "isla") continue;
      for (const place of places) {
        const value = place.values[metric.id];
        if (value == null) continue;
        expect(value, `${metric.id} ${place.name}`).toBeGreaterThanOrEqual(0);
        expect(value, `${metric.id} ${place.name}`).toBeLessThanOrEqual(100);
      }
    }
  });

  it("todas las medidas por municipio son números finitos o null (nunca undefined)", () => {
    for (const metric of PR_METRICS) {
      for (const place of places) {
        const value = place.values[metric.id];
        if (value === null) continue;
        expect(Number.isFinite(value), `${metric.id} ${place.name}`).toBe(true);
      }
    }
  });

  it("las cifras por municipio no son negativas", () => {
    for (const metric of PR_METRICS) {
      for (const place of places) {
        const value = place.values[metric.id];
        if (value != null) expect(value, `${metric.id} ${place.name}`).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
