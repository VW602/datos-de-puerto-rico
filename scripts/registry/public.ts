/**
 * Builds data/generated/sources.public.json: the part of the source registry
 * the website is allowed to ship. The full registry
 * (data/registry/sources.json) also keeps rights evidence and review notes;
 * none of that reaches the browser. Only sources that are PUBLIC_READY, with
 * verified provenance and written redistribution rights, are published: any
 * other record fails the build instead of shipping.
 *
 *   npm run data:registry:generate            write
 *   npm run data:registry:generate -- --check fail if the committed file is stale
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

type InternalRecord = Record<string, unknown> & {
  datasetId: string;
  publicStatus: "PUBLIC_READY" | "PUBLIC_PENDING" | "PUBLIC_EXCLUDED";
  redistributionStatus: string;
  metrics: string[];
  methodology: string;
  sourceURL: string;
  provenanceStatus: string;
  valueExclusions: { metric: string; municipioId: string; reason: string; note: string }[];
};

type Manifest = { snapshots: { datasetId: string; retrievedAt: string; release: string }[] };
type GeoManifest = { source: { retrievedAt: string } };

/** Registry entry fed by the geometry pipeline (scripts/geo). */
const GEOMETRY_DATASET = "geometria-municipios";

/** Fields copied as they are. Everything else in the internal registry stays internal. */
export const PUBLIC_FIELDS = [
  "datasetId",
  "title",
  "sourceAgency",
  "sourceTitle",
  "reportingPeriod",
  "geography",
  "attribution",
  "missingValuePolicy",
  "publicStatus",
  "metrics",
] as const;

const UNKNOWN = "UNKNOWN";

/** Written rights that allow the project to redistribute a source's values. */
const PUBLISHABLE_RIGHTS = ["VERIFIED_ALLOWED", "ATTRIBUTION_REQUIRED"];

export function buildPublicRegistry(internal: { records: InternalRecord[] }, manifest: Manifest, geo?: GeoManifest): string {
  const snapshots = new Map(manifest.snapshots.map((s) => [s.datasetId, s]));
  for (const record of internal.records) {
    const ready =
      record.publicStatus === "PUBLIC_READY" &&
      record.provenanceStatus === "VERIFIED" &&
      PUBLISHABLE_RIGHTS.includes(record.redistributionStatus);
    if (!ready) throw new Error(`${record.datasetId}: no está lista para publicarse (${record.publicStatus}, ${record.redistributionStatus})`);
  }
  const records = internal.records
    .map((record) => {
      const out: Record<string, unknown> = {};
      for (const field of PUBLIC_FIELDS) out[field] = record[field];
      const snapshot = snapshots.get(record.datasetId);
      out.sourceURL = record.sourceURL.startsWith("https://") ? record.sourceURL : null;
      out.methodology = record.methodology.startsWith(UNKNOWN) ? null : record.methodology;
      out.verified = record.provenanceStatus === "VERIFIED";
      out.retrievedAt = snapshot ? snapshot.retrievedAt : record.datasetId === GEOMETRY_DATASET && geo ? geo.source.retrievedAt : null;
      out.marginOfErrorAvailable = Boolean(snapshot);
      out.valueExclusions = record.valueExclusions.map(({ metric, municipioId, reason }) => ({ metric, municipioId, reason }));
      return out;
    });
  return (
    JSON.stringify(
      {
        generated: "GENERADO por scripts/registry/public.ts desde data/registry/sources.json. NO EDITAR A MANO.",
        schema: 1,
        records,
      },
      null,
      2,
    ) + "\n"
  );
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
  const internal = JSON.parse(readFileSync(join(root, "data/registry/sources.json"), "utf8"));
  const manifest = JSON.parse(readFileSync(join(root, "data/raw/census/manifest.json"), "utf8"));
  const geo = JSON.parse(readFileSync(join(root, "data/raw/geo/tiger-2024/manifest.json"), "utf8"));
  const content = buildPublicRegistry(internal, manifest, geo);
  const path = join(root, "data/generated/sources.public.json");
  const current = existsSync(path) ? readFileSync(path, "utf8") : null;
  if (process.argv.includes("--check")) {
    if (current !== content) {
      console.error("Desactualizado: data/generated/sources.public.json");
      process.exit(1);
    }
    console.log("Sin cambios.");
  } else {
    writeFileSync(path, content);
    console.log("Escrito: data/generated/sources.public.json");
  }
}
