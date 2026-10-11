/**
 * Smoke check of a Cloudflare build (`npm run build:cloudflare`), without
 * deploying or contacting Cloudflare: the preset, the Worker config, the
 * static files, the security headers for static files, and no Node-only
 * modules beyond what `nodejs_compat` provides.
 *
 *   npm run check:cloudflare
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { SECURITY_HEADERS } from "../../src/lib/security-headers.ts";

const OUT = fileURLToPath(new URL("../../.output/", import.meta.url));
/** Modules the Workers runtime provides under nodejs_compat and the bundle may import. */
const ALLOWED_NODE = new Set([
  "async_hooks",
  "buffer",
  "process",
  "stream",
  "events",
  "util",
  "crypto",
]);

/** Pinned in vite.config.ts; a build must never pick up the build machine's date. */
const COMPATIBILITY_DATE = "2026-10-08";
const WORKER_NAME = "datos-de-puerto-rico";

const problems: string[] = [];
const fail = (message: string) => problems.push(message);
const read = (p: string) => readFileSync(join(OUT, p), "utf8");
const files = (dir: string): string[] =>
  readdirSync(join(OUT, dir)).flatMap((name) => {
    const p = join(dir, name);
    return statSync(join(OUT, p)).isDirectory() ? files(p) : [p];
  });

if (!existsSync(join(OUT, "nitro.json"))) {
  console.error("No hay .output/nitro.json. Corre primero: npm run build:cloudflare");
  process.exit(1);
}
const nitro = JSON.parse(read("nitro.json")) as { preset: string; serverEntry: string };
if (nitro.preset !== "cloudflare-module") {
  console.error(
    `La salida es del preset ${nitro.preset}, no cloudflare-module. Corre: npm run build:cloudflare`,
  );
  process.exit(1);
}

const wrangler = JSON.parse(read("server/wrangler.json")) as {
  name: string;
  compatibility_date: string;
  main: string;
  assets?: { directory: string; binding: string };
  compatibility_flags?: string[];
};
if (wrangler.main !== "index.mjs" || !existsSync(join(OUT, "server/index.mjs")))
  fail("falta el Worker server/index.mjs");
if (wrangler.name !== WORKER_NAME) fail(`nombre del Worker ${wrangler.name}, no ${WORKER_NAME}`);
if (wrangler.compatibility_date !== COMPATIBILITY_DATE)
  fail(`fecha de compatibilidad ${wrangler.compatibility_date}, no ${COMPATIBILITY_DATE}`);
if (wrangler.assets?.directory !== "../public") fail("los archivos estáticos no apuntan a public/");
if (!wrangler.compatibility_flags?.includes("nodejs_compat")) fail("falta nodejs_compat");

for (const p of ["public/favicon.svg", "public/robots.txt"])
  if (!existsSync(join(OUT, p))) fail(`falta ${p}`);
const assets = readdirSync(join(OUT, "public/assets"));
for (const lazy of ["usgs-water-", "usgs-water-series-"])
  if (!assets.some((f) => f.startsWith(lazy) && f.endsWith(".js")))
    fail(`falta el pedazo ${lazy}*.js`);

// Static files skip the Worker on Cloudflare: their headers come from _headers.
const headers = read("public/_headers");
const all = headers.slice(headers.indexOf("\n/*\n"));
for (const [name, value] of Object.entries(SECURITY_HEADERS))
  if (!headers.includes("\n/*\n") || !all.includes(`  ${name}: ${value}`))
    fail(`_headers no aplica ${name} a todo el sitio`);
if (/strict-transport-security/i.test(headers)) fail("HSTS antes de tener HTTPS real");

for (const file of files("server").filter((f) => /\.m?js$/.test(f))) {
  for (const m of read(file).matchAll(/(?:from|import\(|require\()\s*["']node:([a-z_/]+)["']/g))
    if (!ALLOWED_NODE.has(m[1]!)) fail(`${file} usa node:${m[1]}`);
}

if (problems.length) {
  console.error(`Cloudflare: ${problems.length} problema(s)\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
console.log(
  `Cloudflare OK: preset ${nitro.preset}, ${assets.length} archivos en assets/, encabezados en _headers.`,
);
