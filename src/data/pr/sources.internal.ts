/**
 * FULL internal registry (data/registry/sources.json): rights evidence,
 * internal notes, endpoints of excluded sources. For tests and tooling only —
 * the website must import ./sources.ts (public projection) instead. A test
 * fails if product code imports this file.
 */
import registry from "../../../data/registry/sources.json";
import type { PrMetricId } from "./metrics";

/** Marker for anything the project has not verified yet. Never guessed. */
export const UNKNOWN = "UNKNOWN";

export type RedistributionStatus =
  | "VERIFIED_ALLOWED"
  | "ATTRIBUTION_REQUIRED"
  | "REVIEW_REQUIRED"
  | "DO_NOT_REDISTRIBUTE";

export type ProvenanceStatus = "VERIFIED" | "PARTIAL" | "PENDING";

export type LinkHealth = "LIVE" | "REDIRECT" | "ARCHIVED" | "BROKEN" | "AUTH_REQUIRED" | "UNKNOWN";

/**
 * Publication boundary of the product. Only metadata decides it; components
 * read it through src/data/pr/public.ts.
 */
export type PublicStatus = "PUBLIC_READY" | "PUBLIC_PENDING" | "PUBLIC_EXCLUDED";

/** A single stored value that is not shown, with the reason. */
export type ValueExclusion = {
  metric: string;
  municipioId: string;
  reason: "source_conflict";
  note: string;
};

/** One entry of data/registry/sources.json (schema: data/schemas/source-record.schema.json). */
export type SourceRecord = {
  datasetId: string;
  title: string;
  topic: string;
  sourceAgency: string;
  sourceTitle: string;
  sourceURL: string;
  additionalURLs: { label: string; url: string; linkHealth: LinkHealth }[];
  sourceType: string;
  sourceStatus: "RESOLVED" | "PARTIAL" | "UNRESOLVED";
  linkHealth: LinkHealth;
  reportingPeriod: string;
  sourcePublishedAt: string;
  /** When the project first obtained these values. UNKNOWN when it cannot be proven. */
  originalRetrievalAt: string;
  /** When the values were last checked against the official source. */
  verifiedAt: string;
  geography: "municipio" | "isla";
  nativeGeography: string;
  geographyJoin: string;
  updateFrequency: string;
  redistributionStatus: RedistributionStatus;
  rightsEvidence: string;
  attribution: string;
  methodology: string;
  fieldMap: Record<string, string>;
  missingValuePolicy: string;
  provenanceStatus: ProvenanceStatus;
  readiness: "READY" | "PARTIAL" | "BLOCKED";
  publicationDecision:
    | "KEEP_FOR_PUBLIC_LAUNCH"
    | "KEEP_BUT_LINK_ONLY"
    | "REMOVE_FROM_PUBLIC_LAUNCH"
    | "RESEARCH_MORE";
  publicStatus: PublicStatus;
  valueExclusions: ValueExclusion[];
  files: string[];
  metrics: string[];
  notes: string;
};

// The JSON shape is checked against the schema in sources.test.ts.
export const SOURCES = (registry as unknown as { records: SourceRecord[] }).records;

const byId = new Map(SOURCES.map((record) => [record.datasetId, record]));
const byMetric = new Map<string, SourceRecord>();
for (const record of SOURCES) {
  for (const metric of record.metrics) byMetric.set(metric, record);
}

export function sourceById(datasetId: string): SourceRecord | null {
  return byId.get(datasetId) ?? null;
}

export function sourceForMetric(id: PrMetricId): SourceRecord | null {
  return byMetric.get(id) ?? null;
}
