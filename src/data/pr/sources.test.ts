import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import schema from "../../../data/schemas/source-record.schema.json";
import { PR_METRICS } from "./metrics";
import { isPublicMetric } from "./public";
import { provenanceForMetric } from "./sources";
import { SOURCES, sourceForMetric } from "./sources.internal";

const metricIds = new Set<string>(PR_METRICS.map((metric) => metric.id));
const props = schema.properties as Record<string, { enum?: string[] }>;

describe("registro de fuentes", () => {
  it("cada medida publicada tiene una fuente en el registro", () => {
    for (const metric of PR_METRICS) {
      expect(sourceForMetric(metric.id), metric.id).not.toBeNull();
      if (isPublicMetric(metric.id)) expect(provenanceForMetric(metric.id)?.agency, metric.id).toBeTruthy();
      else expect(provenanceForMetric(metric.id), metric.id).toBeNull();
    }
  });

  it("ninguna medida aparece en dos fuentes, y el registro no nombra medidas que no existen", () => {
    const seen = new Set<string>();
    for (const record of SOURCES) {
      for (const metric of record.metrics) {
        expect(metricIds.has(metric), `${record.datasetId}: ${metric}`).toBe(true);
        expect(seen.has(metric), metric).toBe(false);
        seen.add(metric);
      }
    }
  });

  it("cada entrada cumple el esquema", () => {
    const ids = new Set<string>();
    for (const record of SOURCES) {
      expect(ids.has(record.datasetId)).toBe(false);
      ids.add(record.datasetId);
      expect(Object.keys(record).sort()).toEqual([...schema.required].sort());
      for (const [key, value] of Object.entries(record)) {
        const allowed = props[key]?.enum;
        if (allowed) expect(allowed, `${record.datasetId}.${key}`).toContain(value);
      }
      expect(record.sourceURL === "UNKNOWN" || record.sourceURL.startsWith("https://")).toBe(true);
      expect(record.originalRetrievalAt === "UNKNOWN" || /^\d{4}-\d{2}-\d{2}$/.test(record.originalRetrievalAt)).toBe(true);
      expect(record.verifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      for (const link of record.additionalURLs) expect(link.url, record.datasetId).toMatch(/^https:\/\//);
    }
  });

  it("los archivos que nombra cada fuente existen", () => {
    for (const record of SOURCES) {
      for (const file of record.files) {
        expect(existsSync(new URL(`../../../${file}`, import.meta.url)), file).toBe(true);
      }
    }
  });

  it("lo que ve la gente no dice UNKNOWN ni null", () => {
    for (const metric of PR_METRICS.filter((item) => isPublicMetric(item.id))) {
      const source = provenanceForMetric(metric.id)!;
      const shown = [source.agency, source.title, source.period, source.methodology ?? "", source.missingValues];
      for (const text of shown) expect(text, metric.id).not.toMatch(/UNKNOWN|\bnull\b|undefined/);
    }
  });

  it("READY exige procedencia verificada y derechos con evidencia", () => {
    for (const record of SOURCES) {
      if (record.readiness !== "READY") continue;
      expect(record.provenanceStatus, record.datasetId).toBe("VERIFIED");
      expect(record.sourceStatus, record.datasetId).toBe("RESOLVED");
      expect(["VERIFIED_ALLOWED", "ATTRIBUTION_REQUIRED"], record.datasetId).toContain(record.redistributionStatus);
      expect(record.publicationDecision, record.datasetId).toBe("KEEP_FOR_PUBLIC_LAUNCH");
    }
  });

  it("una fuente sin resolver o que no se puede redistribuir queda bloqueada", () => {
    for (const record of SOURCES) {
      if (record.sourceStatus === "UNRESOLVED" || record.redistributionStatus === "DO_NOT_REDISTRIBUTE") {
        expect(record.readiness, record.datasetId).toBe("BLOCKED");
        expect(record.publicationDecision, record.datasetId).not.toBe("KEEP_FOR_PUBLIC_LAUNCH");
      }
    }
  });

  it("nada se marca como redistribuible sin una procedencia verificada", () => {
    for (const record of SOURCES) {
      if (record.redistributionStatus === "VERIFIED_ALLOWED" || record.redistributionStatus === "ATTRIBUTION_REQUIRED") {
        expect(record.provenanceStatus, record.datasetId).toBe("VERIFIED");
        expect(record.sourceURL, record.datasetId).not.toBe("UNKNOWN");
      }
    }
  });
});

describe("medidas descriptivas, no evaluativas", () => {
  it("ninguna medida usa palabras que califiquen", () => {
    for (const metric of PR_METRICS) {
      const text = [metric.label, metric.hint, metric.versus(60, 40), metric.versus(20, 40)].join(" ");
      expect(text, metric.id).not.toMatch(/mejor|peor|bueno|malo|ganador|perdedor/i);
    }
  });
});
