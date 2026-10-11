import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import publicRegistry from "../../../data/generated/sources.public.json";
import { applyLayers } from "./layers";
import { METRIC_GROUPS, PR_METRICS, metricGroup, type PrMetricId } from "./metrics";
import { municipios } from "./places";
import {
  DEFAULT_METRIC_ID,
  PUBLIC_GROUPS,
  PUBLIC_METRICS,
  isPublicMetric,
  publicMetricsInGroup,
  publicStatusForMetric,
  toPublicPlaces,
} from "./public";
import { rankByMetric } from "./ranking";
import { SOURCES, sourceById } from "./sources.internal";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const publicPlaces = toPublicPlaces(applyLayers(municipios));

/** The source families of the public version: the five of v1, plus BLS LAUS. */
const V1_SOURCES = [
  "acs-2019-2023-base",
  "acs-2020-2024-layers",
  "nhtsa-fars-2022-2023",
  "cdc-brfss-2023",
  "bls-laus-municipios",
  "usaspending-pr",
  "openfema-declaraciones-pr",
  "openfema-asistencia-publica-pr",
  "openfema-hogares-pr",
  "openfema-mitigacion-pr",
  "nws-alertas-pr",
  "usgs-sismos-pr",
  "usgs-agua-pr",
  "geometria-municipios",
];

/** Publishers allowed in this version: federal agencies whose terms are written down in DATA_LICENSES.md. */
const ALLOWED_AGENCY =
  /^(U\.S\. Census Bureau|National Highway Traffic Safety Administration|Centers for Disease Control and Prevention|U\.S\. Bureau of Labor Statistics|U\.S\. Department of the Treasury|Federal Emergency Management Agency|National Weather Service|U\.S\. Geological Survey)/;
const ALLOWED_METRIC_SOURCE = /^(Censo|NHTSA|CDC|BLS|USAspending|FEMA)\b/;

function filesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(join(ROOT, dir))) {
    const path = join(dir, name);
    if (statSync(join(ROOT, path)).isDirectory()) out.push(...filesUnder(path));
    else out.push(path);
  }
  return out;
}

describe("frontera de publicación", () => {
  it("el registro tiene exactamente las fuentes de esta versión", () => {
    expect(SOURCES.map((record) => record.datasetId).sort()).toEqual([...V1_SOURCES].sort());
    expect(publicRegistry.records.map((record) => record.datasetId).sort()).toEqual(
      [...V1_SOURCES].sort(),
    );
  });

  it("cada fuente está lista: procedencia verificada y derechos escritos", () => {
    for (const record of SOURCES) {
      expect(record.publicStatus, record.datasetId).toBe("PUBLIC_READY");
      expect(record.readiness, record.datasetId).toBe("READY");
      expect(record.provenanceStatus, record.datasetId).toBe("VERIFIED");
      expect(["VERIFIED_ALLOWED", "ATTRIBUTION_REQUIRED"], record.datasetId).toContain(
        record.redistributionStatus,
      );
      expect(record.rightsEvidence.length, record.datasetId).toBeGreaterThan(40);
      expect(record.attribution, record.datasetId).toMatch(/^(Fuente|Límites)/);
    }
  });

  it("cada medida del catálogo es pública; ninguna queda escondida en el código", () => {
    expect(PUBLIC_METRICS.map((metric) => metric.id)).toEqual(
      PR_METRICS.map((metric) => metric.id),
    );
    for (const metric of PR_METRICS)
      expect(publicStatusForMetric(metric.id), metric.id).toBe("PUBLIC_READY");
  });

  it("una medida sin entrada en el registro queda fuera (falla cerrada)", () => {
    expect(publicStatusForMetric("no-existe" as PrMetricId)).toBe("PUBLIC_EXCLUDED");
    expect(isPublicMetric("no-existe" as PrMetricId)).toBe(false);
  });

  it("ningún grupo queda vacío y la medida inicial es pública", () => {
    expect(PUBLIC_GROUPS).toEqual(METRIC_GROUPS);
    for (const group of PUBLIC_GROUPS)
      expect(publicMetricsInGroup(group).length, group).toBeGreaterThan(0);
    expect(isPublicMetric(DEFAULT_METRIC_ID)).toBe(true);
  });

  it("el teclado nunca cae en una medida que no existe", () => {
    for (const metric of PUBLIC_METRICS) {
      const pool = publicMetricsInGroup(metricGroup(metric.id));
      const index = pool.findIndex((item) => item.id === metric.id);
      expect(index, metric.id).toBeGreaterThanOrEqual(0);
      for (const delta of [1, -1]) {
        const next = pool[(index + delta + pool.length) % pool.length];
        expect(isPublicMetric(next.id), `${metric.id} → ${next.id}`).toBe(true);
      }
    }
  });

  it("ningún ranking por municipio queda vacío", () => {
    for (const metric of PUBLIC_METRICS) {
      if (metric.id === "obesity" || metric.id === "inactivity") continue;
      const ranked = rankByMetric(publicPlaces, metric.id, metric.scale).ranked.length;
      // FEMA programs reach only some municipios in a given program: the rest stay without data, never 0.
      if (metricGroup(metric.id) === "Recuperación y desastres")
        expect(ranked, metric.id).toBeGreaterThan(60);
      else expect(ranked, metric.id).toBe(78);
    }
  });

  it("solo publican agencias permitidas, y cada medida dice una de ellas", () => {
    for (const record of SOURCES)
      expect(record.sourceAgency, record.datasetId).toMatch(ALLOWED_AGENCY);
    for (const metric of PR_METRICS)
      expect(metric.source, metric.id).toMatch(ALLOWED_METRIC_SOURCE);
  });

  it("los archivos públicos son solo los esperados", () => {
    expect(filesUnder("public").sort()).toEqual(["public/favicon.svg", "public/robots.txt"]);
    const generated = filesUnder("data/generated").filter(
      (f) => !f.startsWith("data/generated/fema-projects/"),
    );
    expect(generated.sort()).toEqual([
      "data/generated/bls-laus.json",
      "data/generated/census-municipios.json",
      "data/generated/fema-pr.json",
      "data/generated/municipios.geometry.json",
      "data/generated/sources.public.json",
      "data/generated/usaspending-pr.json",
    ]);
    for (const file of filesUnder("data/generated/fema-projects"))
      expect(file).toMatch(/^data\/generated\/fema-projects\/\d+\.json$/);
  });

  it("no hay datos de investigación sin resolver en el repositorio", () => {
    expect(existsSync(join(ROOT, "data/research"))).toBe(false);
  });

  it("el mapa usa la geometría generada desde TIGER/Line", () => {
    const map = sourceById("geometria-municipios")!;
    expect(map.files).toContain("data/generated/municipios.geometry.json");
    expect(existsSync(join(ROOT, "data/generated/municipios.geometry.json"))).toBe(true);
  });
});
