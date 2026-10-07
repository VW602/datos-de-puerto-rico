import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import publicRegistry from "../../../data/generated/sources.public.json";
import funds from "../../../data/generated/usaspending-pr.json";
import { FUNDS_FY, FUNDS_ISLAND, GEO_STATE_ORDER, fundsFor, money } from "./funds";
import { applyLayers } from "./layers";
import { prMetricById, metricGroup } from "./metrics";
import { municipios } from "./places";
import { agencyDisplay } from "./present";
import { isPublicMetric, toPublicPlaces } from "./public";
import { rankByMetric } from "./ranking";
import { publicSourceForMetric } from "./sources";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const places = toPublicPlaces(applyLayers(municipios));
const IDS = ["fedObligations", "fedOutlays", "fedAwards"] as const;
type M = {
  attributable: number | null;
  recorded: number | null;
  award: { attributableOutlays: number | null };
};
const raw = funds as unknown as { municipios: Record<string, M>; island: { total: number } };
const byName = (name: string) => places.find((p) => p.name === name)!;

describe("fondos federales en el sitio", () => {
  it("tres medidas públicas en el grupo «Fondos federales»", () => {
    for (const id of IDS) {
      expect(isPublicMetric(id), id).toBe(true);
      expect(metricGroup(id)).toBe("Fondos federales");
      expect(prMetricById(id).source).toContain(`AF ${FUNDS_FY}`);
    }
    expect(prMetricById("fedObligations").hint).toMatch(
      /Obligado no quiere decir pagado ni gastado/,
    );
  });

  it("el mapa pinta solo lo atribuible al municipio; nulo sigue nulo", () => {
    for (const place of places) {
      const m = raw.municipios[place.id];
      expect(place.values.fedObligations, place.name).toBe(m.attributable);
      expect(place.values.fedOutlays, place.name).toBe(m.award.attributableOutlays);
    }
  });

  it("San Juan: el mapa usa lo atribuible, no todo lo registrado allí", () => {
    const sj = byName("San Juan");
    const f = fundsFor(sj.id)!;
    expect(sj.values.fedObligations).toBe(f.attributable);
    expect(sj.values.fedObligations).not.toBe(f.recorded);
    expect(f.recorded! - f.attributable!).toBeGreaterThan(1e9);
  });

  it("Ponce, San Juan, Bayamón, Mayagüez, Vieques y Culebra tienen su cifra", () => {
    for (const name of ["Ponce", "San Juan", "Bayamón", "Mayagüez", "Vieques", "Culebra"]) {
      expect(typeof byName(name).values.fedObligations, name).toBe("number");
    }
  });

  it("el ranking va de mayor a menor y deja fuera lo que falta", () => {
    for (const id of IDS) {
      const metric = prMetricById(id);
      const ranking = rankByMetric(places, id, metric.scale);
      const withValue = places.filter((p) => p.values[id] != null).length;
      expect(ranking.ranked).toHaveLength(withValue);
      for (let i = 1; i < ranking.ranked.length; i++) {
        expect(ranking.ranked[i - 1].values[id]!).toBeGreaterThanOrEqual(
          ranking.ranked[i].values[id]!,
        );
      }
    }
  });

  it("Puerto Rico: los cuatro estados suman el total", () => {
    const sum = GEO_STATE_ORDER.reduce((a, s) => a + FUNDS_ISLAND.states[s], 0);
    expect(Math.abs(sum - FUNDS_ISLAND.total)).toBeLessThan(0.05);
    expect(FUNDS_ISLAND.total).toBe(raw.island.total);
  });

  it("los dólares se escriben en español, con signo cuando son negativos", () => {
    expect(money(13_448_010_697.01)).toBe("$13.45 mil millones");
    expect(money(957_614_187)).toBe("$957.6 millones");
    expect(money(45_210.4)).toBe("$45,210");
    expect(money(-10_900_000)).toBe("−$10.9 millones");
    expect(money(0)).toBe("$0");
  });

  it("la procedencia nombra al Tesoro y USAspending, con fecha de descarga y enlace", () => {
    const record = publicSourceForMetric("fedObligations")!;
    expect(record.datasetId).toBe("usaspending-pr");
    expect(record.sourceAgency).toMatch(/^U\.S\. Department of the Treasury/);
    expect(record.sourceURL).toBe("https://www.usaspending.gov/");
    expect(record.retrievedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(record.attribution).toContain("USAspending.gov");
    expect(record.methodology).toMatch(/Obligado no quiere decir desembolsado ni gastado/);
    expect(record.marginOfErrorAvailable).toBe(false);
    expect(agencyDisplay(record.sourceAgency).from).toBe(
      "el Departamento del Tesoro de EE. UU. (USAspending)",
    );
  });

  it("las fuentes del gobierno de Puerto Rico, LUMA y cáncer siguen fuera", () => {
    const text = JSON.stringify(publicRegistry);
    expect(text).not.toMatch(
      /LUMA|cancer|cáncer|Registro Central|Gobierno de Puerto Rico|COR3|OpenFEMA/i,
    );
  });

  it("el sitio nunca llama a USAspending: solo lee el archivo generado", () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) files.push(path);
      }
    };
    walk(join(ROOT, "src"));
    for (const file of files)
      expect(readFileSync(file, "utf8"), file).not.toMatch(/api\.usaspending\.gov|fetch\(/);
  });
});
