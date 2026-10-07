/**
 * When a cached API response may be reused by data:usaspending:update. Pure,
 * so the rule is tested without the network.
 */

import { canonical, type PlannedRequest } from "./plan.ts";
import { sha256 } from "./pipeline.ts";

export type StagedMeta = {
  id: string;
  key: string;
  page: number | null;
  method: "GET" | "POST";
  endpoint: string;
  body: Record<string, unknown> | null;
  planFingerprint: string;
  retrievedAt: string;
  status: number;
  bytes: number;
  sha256: string;
};

export type Expected = Omit<StagedMeta, "retrievedAt" | "status" | "bytes" | "sha256">;

/** A usable answer: a JSON object without an API error, with results where the endpoint has them. Null when fine. */
export function responseProblem(
  text: string,
  request: Pick<PlannedRequest, "endpoint" | "paged">,
): string | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return "la respuesta no es JSON";
  }
  if (!data || typeof data !== "object" || Array.isArray(data))
    return "la respuesta no es un objeto";
  const object = data as Record<string, unknown>;
  if (object.detail) return `error de la API: ${JSON.stringify(object.detail).slice(0, 160)}`;
  if (request.endpoint.startsWith("search/") && !("results" in object)) return "falta «results»";
  if (request.paged && !("page_metadata" in object)) return "falta «page_metadata»";
  return null;
}

/**
 * Reuse only an exact match: same request (method, endpoint, canonical body
 * with page) as one in the current plan, intact bytes, and a valid response.
 * The plan fingerprint the response was fetched under is kept for the record;
 * a request that is identical in a new plan is the same question to the API,
 * so it may be reused (the updater logs that the plan changed). Responses
 * from before a USAspending refresh are never reused (checked by the updater).
 */
export function cacheMatches(
  meta: StagedMeta,
  expected: Expected,
  bytes: Buffer,
  request: Pick<PlannedRequest, "endpoint" | "paged">,
): boolean {
  return (
    meta.id === expected.id &&
    meta.key === expected.key &&
    meta.page === expected.page &&
    meta.method === expected.method &&
    meta.endpoint === expected.endpoint &&
    canonical(meta.body) === canonical(expected.body) &&
    sha256(bytes) === meta.sha256 &&
    responseProblem(bytes.toString("utf8"), request) === null
  );
}
