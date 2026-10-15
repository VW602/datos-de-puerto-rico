/**
 * datos-scheduler: the clock for live data. On each Cloudflare Cron Trigger
 * it asks GitHub to run the "Live data → KV" workflow, and nothing else: it
 * reads no data, writes no KV and serves no routes (workers.dev is off and it
 * has no domain). The GitHub token is the Worker secret GITHUB_DISPATCH_TOKEN
 * and appears only in the Authorization header, never in errors or logs.
 */

export interface Env {
  GITHUB_DISPATCH_TOKEN: string;
}

/** Minimal shape of the Workers ScheduledController this handler uses. */
export type Scheduled = { cron: string; scheduledTime: number };

export const DISPATCH = {
  owner: "VW602",
  repo: "datos-de-puerto-rico",
  workflow: "live-kv.yml",
  ref: "main",
} as const;

/**
 * Cron → workflow inputs. Every 15 minutes: NWS alerts and USGS earthquakes.
 * Minute 7 of every hour: the same plus USGS water. The two never fire at the
 * same minute.
 */
export const SCHEDULES: Record<string, { refresh_water: boolean }> = {
  "*/15 * * * *": { refresh_water: false },
  "7 * * * *": { refresh_water: true },
};

export function dispatchRequest(cron: string, token: string): Request {
  const schedule = SCHEDULES[cron];
  if (!schedule) throw new Error(`cron desconocido: ${cron}`);
  if (!token) throw new Error("falta GITHUB_DISPATCH_TOKEN");
  const { owner, repo, workflow, ref } = DISPATCH;
  return new Request(
    `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflow}/dispatches`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
        "content-type": "application/json",
        "user-agent": "datos-scheduler (https://datos.tn242.com/)",
      },
      body: JSON.stringify({
        ref,
        inputs: { target: "production", refresh_water: String(schedule.refresh_water) },
      }),
    },
  );
}

/** Dispatches the workflow for one cron event. Throws unless GitHub accepts it. */
export async function dispatch(
  event: Scheduled,
  env: Env,
  fetchImpl: (r: Request) => Promise<Response> = fetch,
): Promise<number> {
  const response = await fetchImpl(dispatchRequest(event.cron, env.GITHUB_DISPATCH_TOKEN));
  if (response.status !== 204 && response.status !== 200)
    throw new Error(`GitHub no aceptó el dispatch (${event.cron}): HTTP ${response.status}`);
  return response.status;
}

export default {
  async scheduled(event: Scheduled, env: Env): Promise<void> {
    await dispatch(event, env);
  },
  /** No public surface: any request that somehow reaches the Worker gets 404. */
  async fetch(): Promise<Response> {
    return new Response(null, { status: 404 });
  },
};
