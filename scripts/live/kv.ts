/**
 * Minimal Cloudflare Workers KV REST client for the live data refresh
 * (scripts/live/publish.ts). Only get and put of one value at a time.
 *
 * The API token is used only in the Authorization header and never appears
 * in errors or logs: errors carry the HTTP status and Cloudflare's error
 * codes and messages, nothing from the request.
 */

export type KvConfig = { accountId: string; namespaceId: string; token: string };
export type Fetch = (url: string, init: RequestInit) => Promise<Response>;

const API = "https://api.cloudflare.com/client/v4";
const TIMEOUT_MS = 30_000;

const valueUrl = (c: KvConfig, key: string) =>
  `${API}/accounts/${c.accountId}/storage/kv/namespaces/${c.namespaceId}/values/${encodeURIComponent(key)}`;

/** Cloudflare's own error codes and messages, for a useful but secret-free error. */
async function apiErrors(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { errors?: { code?: number; message?: string }[] };
    return (body.errors ?? []).map((e) => `${e.code ?? "?"} ${e.message ?? ""}`.trim()).join("; ");
  } catch {
    return "";
  }
}

export class KvError extends Error {}

/** The stored text, or null when the key does not exist. Any other outcome throws. */
export async function kvGet(
  c: KvConfig,
  key: string,
  fetchImpl: Fetch = fetch,
): Promise<string | null> {
  const response = await fetchImpl(valueUrl(c, key), {
    method: "GET",
    headers: { authorization: `Bearer ${c.token}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (response.status === 404) return null;
  if (response.status !== 200)
    throw new KvError(
      `KV: lectura de ${key} respondió ${response.status} ${await apiErrors(response)}`.trim(),
    );
  return response.text();
}

/** Stores one value; the whole value is replaced at once. Throws unless Cloudflare confirms success. */
export async function kvPut(
  c: KvConfig,
  key: string,
  value: string,
  fetchImpl: Fetch = fetch,
): Promise<void> {
  const response = await fetchImpl(valueUrl(c, key), {
    method: "PUT",
    headers: { authorization: `Bearer ${c.token}`, "content-type": "text/plain; charset=utf-8" },
    body: value,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  let success = false;
  let errors = "";
  try {
    const body = (await response.clone().json()) as { success?: boolean };
    success = body.success === true;
  } catch {
    success = false;
  }
  if (!success) errors = await apiErrors(response);
  if (response.status !== 200 || !success)
    throw new KvError(`KV: escritura de ${key} respondió ${response.status} ${errors}`.trim());
}
