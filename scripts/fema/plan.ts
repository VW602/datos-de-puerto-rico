/**
 * The exact OpenFEMA requests the project keeps. Shared by update (which
 * sends them) and generate (which checks every one came back). Pure.
 */

import { createHash } from "node:crypto";
import { canonical } from "../usaspending/plan.ts";
import { DATASETS, DATASET_KEYS, PAGE_SIZE, PLAN_VERSION, type DatasetKey } from "./source.ts";

export { canonical };

export type PlannedRequest = {
  key: string;
  /** Path under the API root, e.g. "v2/DisasterDeclarationsSummaries". */
  endpoint: string;
  /** OData query parameters, without $skip (added per page). */
  params: Record<string, string>;
  /** Records are paged with $skip until metadata.count is reached. */
  paged: boolean;
  dataset?: DatasetKey;
};

export function datasetEndpoint(key: DatasetKey): string {
  const d = DATASETS[key];
  return `v${d.version}/${d.name}`;
}

/** Query string in a fixed order, as sent. */
export function queryString(params: Record<string, string>): string {
  return Object.keys(params)
    .sort()
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`)
    .join("&");
}

/** Deterministic ID of one HTTP request (endpoint and parameters, with $skip). */
export function requestId(endpoint: string, params: Record<string, string>): string {
  return createHash("sha256")
    .update(canonical({ method: "GET", endpoint, params }))
    .digest("hex")
    .slice(0, 24);
}

export function planFingerprint(plan: PlannedRequest[]): string {
  return createHash("sha256")
    .update(canonical({ version: PLAN_VERSION, plan }))
    .digest("hex");
}

export function planRequests(): PlannedRequest[] {
  const out: PlannedRequest[] = [];
  for (const key of DATASET_KEYS) {
    const d = DATASETS[key];
    // The catalog entry of the pinned version: its refresh dates and record count.
    out.push({
      key: `catalog/${key}`,
      endpoint: "v1/DataSets",
      params: { $filter: `name eq '${d.name}' and version eq ${d.version}`, $top: "10" },
      paged: false,
    });
  }
  for (const key of DATASET_KEYS) {
    const d = DATASETS[key];
    const params: Record<string, string> = {
      $filter: d.filter,
      $orderby: d.orderby,
      $top: String(PAGE_SIZE),
      $inlinecount: "allpages",
    };
    if (d.select) params.$select = d.select.join(",");
    out.push({
      key: `data/${key}`,
      endpoint: datasetEndpoint(key),
      params,
      paged: true,
      dataset: key,
    });
  }
  return out;
}
