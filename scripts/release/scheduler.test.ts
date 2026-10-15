import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import worker, {
  DISPATCH,
  SCHEDULES,
  dispatch,
  dispatchRequest,
} from "../../infra/datos-scheduler/index.ts";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const TOKEN = "github_pat_fake_for_tests_only";

describe("datos-scheduler", () => {
  it("each cron dispatches Live data → KV on main, production, with the right water flag", async () => {
    for (const [cron, { refresh_water }] of Object.entries(SCHEDULES)) {
      const r = dispatchRequest(cron, TOKEN);
      expect(r.method).toBe("POST");
      expect(r.url).toBe(
        "https://api.github.com/repos/VW602/datos-de-puerto-rico/actions/workflows/live-kv.yml/dispatches",
      );
      expect(r.headers.get("accept")).toBe("application/vnd.github+json");
      expect(r.headers.get("x-github-api-version")).toBe("2022-11-28");
      expect(r.headers.get("authorization")).toBe(`Bearer ${TOKEN}`);
      expect(await r.json()).toEqual({
        ref: "main",
        inputs: { target: "production", refresh_water: String(refresh_water) },
      });
    }
    expect(SCHEDULES).toEqual({
      "*/15 * * * *": { refresh_water: false },
      "7 * * * *": { refresh_water: true },
    });
    expect(DISPATCH.ref).toBe("main");
  });

  it("GitHub must accept the dispatch; anything else fails the scheduled event without the token", async () => {
    const env = { GITHUB_DISPATCH_TOKEN: TOKEN };
    const ok = (status: number) => async () => new Response(null, { status });
    expect(await dispatch({ cron: "*/15 * * * *", scheduledTime: 0 }, env, ok(204))).toBe(204);
    expect(await dispatch({ cron: "7 * * * *", scheduledTime: 0 }, env, ok(200))).toBe(200);
    for (const status of [401, 403, 404, 422, 500]) {
      const error = await dispatch(
        { cron: "*/15 * * * *", scheduledTime: 0 },
        env,
        ok(status),
      ).catch((e: Error) => e);
      expect(error).toBeInstanceOf(Error);
      expect(String(error)).toContain(String(status));
      expect(String(error)).not.toContain(TOKEN);
    }
    await expect(dispatch({ cron: "0 0 * * *", scheduledTime: 0 }, env, ok(204))).rejects.toThrow(
      /cron desconocido/,
    );
    await expect(
      dispatch({ cron: "*/15 * * * *", scheduledTime: 0 }, { GITHUB_DISPATCH_TOKEN: "" }, ok(204)),
    ).rejects.toThrow(/falta/);
  });

  it("no public surface: fetch answers 404; config has no routes, no workers.dev and no token", async () => {
    expect((await worker.fetch()).status).toBe(404);
    const config = read("infra/datos-scheduler/wrangler.jsonc");
    expect(config).toMatch(/"workers_dev": false/);
    expect(config).toMatch(/"preview_urls": false/);
    expect(config).not.toMatch(/"routes"|"route"|custom_domain|kv_namespaces/);
    expect(config).toMatch(/"crons": \["\*\/15 \* \* \* \*", "7 \* \* \* \*"\]/);
    expect(config + read("infra/datos-scheduler/index.ts")).not.toMatch(
      /github_pat_[A-Za-z0-9]|ghp_[A-Za-z0-9]{20}/,
    );
  });

  it("the scheduled handler only dispatches: no data sources, KV or app code", () => {
    const code = read("infra/datos-scheduler/index.ts");
    expect(code.match(/fetchImpl\(/g)).toHaveLength(1);
    expect(code).not.toMatch(
      /weather\.gov|usgs\.gov|\.put\(|\.get\(|from "\.\.\/\.\.\/(src|scripts)/,
    );
  });
});

describe("workflows: only Live data → KV runs unattended with write access", () => {
  const dir = join(ROOT, ".github/workflows");
  const workflows = Object.fromEntries(
    readdirSync(dir).map((f) => [f, readFileSync(join(dir, f), "utf8")]),
  );

  it("the old deploy-on-refresh workflow is gone and nothing is scheduled except the watchdog", () => {
    expect(Object.keys(workflows)).not.toContain("live.yml");
    for (const [name, text] of Object.entries(workflows))
      if (name !== "watchdog.yml") expect(text, name).not.toMatch(/^\s*schedule:/m);
  });

  it("anything that deploys or pushes runs in an environment that needs approval", () => {
    for (const [name, text] of Object.entries(workflows)) {
      const deploys = /wrangler@[\d.]+ deploy|wrangler deploy/.test(text);
      const pushes = /git push|contents: write/.test(text);
      if (deploys) expect(text, name).toMatch(/environment: preview/);
      if (pushes) expect(text, name).toMatch(/environment: slow-data/);
    }
    expect(workflows["deploy.yml"]).toMatch(/^on:\n {2}workflow_dispatch:\n\n/m);
    expect(workflows["deploy.yml"]).not.toMatch(
      /data:live|data:water|scripts\/live\/update|scripts\/water\/update/,
    );
  });

  it("only live-kv.yml writes KV, and it never builds or deploys", () => {
    for (const [name, text] of Object.entries(workflows))
      if (name !== "live-kv.yml") expect(text, name).not.toMatch(/CLOUDFLARE_KV_API_TOKEN/);
    expect(workflows["live-kv.yml"]).not.toMatch(/wrangler|build:cloudflare|npm ci/);
  });

  it("no pull_request_target, default permissions read-only", () => {
    for (const [name, text] of Object.entries(workflows)) {
      expect(text, name).not.toMatch(/pull_request_target/);
      expect(text, name).toMatch(/^permissions:\n {2}contents: read/m);
    }
  });
});
