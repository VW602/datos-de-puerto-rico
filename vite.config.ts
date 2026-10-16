import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";
import { LIVE_KV } from "./src/lib/live-kv";
import { SECURITY_HEADERS } from "./src/lib/security-headers";

// TanStack Start renders the page on the server; Nitro builds that server.
// With no preset it targets plain Node (`.output/`); set NITRO_PRESET
// (vercel, netlify, cloudflare_module, …) to target a host. The site reads
// only the data committed in this repository and calls no data service.
// See docs/ARCHITECTURE.md § Despliegue.
//
// Security headers (src/lib/security-headers.ts) go out two ways: the route
// rule covers static files (and becomes Cloudflare's `_headers`), and the
// runtime hook in src/server/security-headers.ts covers rendered pages,
// including 404 and error pages, which route-rule headers skip.
export default defineConfig(({ command, isPreview }) => ({
  server: { port: 8080 },
  resolve: { tsconfigPaths: true },
  plugins: [
    tailwindcss(),
    tanstackStart(),
    ...(command === "build" || isPreview
      ? [
          nitro({
            // Pinned, not "latest" (the build machine's date), so every build,
            // local or CI, targets the same Workers runtime behavior. The
            // Worker's date is also set directly: Nitro's own date handling
            // shifts it by a day per pass outside UTC.
            compatibilityDate: "2026-10-08",
            cloudflare: {
              wrangler: {
                name: "datos-de-puerto-rico",
                compatibility_date: "2026-10-08",
                // Served only at datos.tn242.com: no *.workers.dev address and no
                // per-version preview URLs.
                workers_dev: false,
                preview_urls: false,
                // Read-only live data; this Worker has no cron triggers and never refreshes data.
                kv_namespaces: [
                  { binding: LIVE_KV.binding, id: LIVE_KV.id, preview_id: LIVE_KV.previewId },
                ],
              },
            },
            routeRules: { "/**": { headers: SECURITY_HEADERS } },
            plugins: ["./src/server/security-headers.ts"],
            // GET/HEAD-only /live/* routes: KV when newer and valid, else the built-in copy.
            handlers: [{ route: "/live/**", handler: "./src/server/live-route.ts" }],
          }),
        ]
      : []),
    viteReact(),
  ],
}));
