import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import laus from "../../../data/generated/bls-laus.json";
import {
  comparisons,
  LAUS_LATEST,
  LAUS_LATEST_LABEL,
  latestRates,
  monthLabel,
  monthShort,
  trend,
} from "./laus";
import { applyLayers } from "./layers";
import { prMetricById } from "./metrics";
import { municipios } from "./places";
import { agencyDisplay } from "./present";
import { isPublicMetric, toPublicPlaces } from "./public";
import { rankByMetric } from "./ranking";
import { provenanceForMetric, publicSourceForMetric } from "./sources";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const places = toPublicPlaces(applyLayers(municipios));
const ID = "unemploymentMonthly" as const;
const latestIndex = laus.months.indexOf(laus.latest);
const byName = (name: string) => places.find((p) => p.name === name)!;

describe("desempleo mensual en el sitio", () => {
  it("es una medida pública, con la tasa de BLS del último mes en los 78 municipios", () => {
    expect(isPublicMetric(ID)).toBe(true);
    expect(places).toHaveLength(78);
    const rates = latestRates();
    for (const place of places) {
      const block = (laus.municipios as Record<string, { rate: (number | null)[] }>)[place.id];
      expect(place.values[ID], place.name).toBe(block.rate[latestIndex]);
      expect(place.values[ID]).toBe(rates[place.id]);
    }
  });

  it("Ponce, San Juan, Cataño, Vieques y Culebra tienen su valor", () => {
    for (const name of ["Ponce", "San Juan", "Cataño", "Vieques", "Culebra"]) {
      expect(typeof byName(name).values[ID], name).toBe("number");
    }
  });

  it("el ranking de los 78 va de mayor a menor tasa", () => {
    const metric = prMetricById(ID);
    const ranking = rankByMetric(places, ID, metric.scale);
    expect(ranking.ranked).toHaveLength(78);
    for (let i = 1; i < 78; i++) {
      expect(ranking.ranked[i - 1].values[ID]!).toBeGreaterThanOrEqual(
        ranking.ranked[i].values[ID]!,
      );
    }
  });

  it("dice el mes exacto y si es preliminar", () => {
    const metric = prMetricById(ID);
    expect(metric.label).toBe("Desempleo mensual");
    expect(metric.hint).toContain(LAUS_LATEST_LABEL);
    expect(metric.source).toContain(monthShort(LAUS_LATEST));
    const preliminary = laus.preliminary.includes(laus.latest);
    expect(metric.source.includes("preliminar")).toBe(preliminary);
    expect(monthLabel("2026-08")).toBe("agosto de 2026");
  });

  it("compara con el mes anterior y con el mismo mes del año anterior", () => {
    const ponce = byName("Ponce");
    const cmp = comparisons(ponce.id, "rate")!;
    expect(cmp.latest.key).toBe(laus.latest);
    expect(cmp.previous!.key).toBe(laus.months[latestIndex - 1]);
    expect(cmp.yearAgo!.key).toBe(`${Number(laus.latest.slice(0, 4)) - 1}${laus.latest.slice(4)}`);
    expect(cmp.latest.value).toBe(ponce.values[ID]);
    expect(trend(ponce.id, "rate", 24)).toHaveLength(24);
    expect(trend(ponce.id, "rate", 24).at(-1)!.key).toBe(laus.latest);
    expect(comparisons(null, "rate")!.latest.value).toBe(laus.puertoRico.rate[latestIndex]);
  });

  it("la procedencia nombra a BLS y LAUS, con fecha de descarga, enlace y metodología", () => {
    const record = publicSourceForMetric(ID)!;
    expect(record.datasetId).toBe("bls-laus-municipios");
    expect(record.sourceAgency).toMatch(/^U\.S\. Bureau of Labor Statistics/);
    expect(record.sourceAgency).toContain("Local Area Unemployment Statistics");
    expect(record.retrievedAt).toBe(laus.source.retrievedAt);
    expect(record.sourceURL).toBe("https://www.bls.gov/lau/");
    expect(record.attribution).toContain("BLS.gov cannot vouch for the data");
    expect(record.marginOfErrorAvailable).toBe(false);
    expect(provenanceForMetric(ID)!.methodology).toMatch(/sin ajuste estacional/);
    expect(agencyDisplay(record.sourceAgency).from).toBe(
      "la Oficina de Estadísticas Laborales de EE. UU. (BLS)",
    );
  });

  it("el sitio nunca llama a BLS: solo lee el archivo generado", () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) files.push(path);
      }
    };
    walk(join(ROOT, "src"));
    expect(files.length).toBeGreaterThan(10);
    for (const file of files)
      expect(readFileSync(file, "utf8"), file).not.toMatch(/api\.bls\.gov|publicAPI/);
  });
});
