/**
 * DATA GENERATE (offline): rebuilds data/generated/municipios.geometry.json
 * from the saved TIGER/Line extract.
 *
 *   npm run data:geo:generate                  write; refuses to change an existing file
 *   npm run data:geo:generate -- --check       fail if the committed file differs from a fresh build
 *   npm run data:geo:generate -- --allow-changes   accept a reviewed change (new vintage or parameters)
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildGeometry } from "./pipeline.ts";
import { OUTPUT } from "./source.ts";

// --root=<dir> lets tests run the real check against a temporary copy of the data.
const rootArg = process.argv.find((arg) => arg.startsWith("--root="));
const ROOT = rootArg ? rootArg.slice("--root=".length) : join(dirname(fileURLToPath(import.meta.url)), "../..");
let built: ReturnType<typeof buildGeometry>;
try {
  built = buildGeometry(ROOT);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
const { content, report } = built;
const path = join(ROOT, OUTPUT);
const current = existsSync(path) ? readFileSync(path, "utf8") : null;

if (process.argv.includes("--report")) console.log(JSON.stringify(report, null, 2));
if (current === content) {
  console.log("Sin cambios.");
} else if (process.argv.includes("--check")) {
  console.error(`Desactualizado: ${OUTPUT}`);
  process.exit(1);
} else if (current !== null && !process.argv.includes("--allow-changes")) {
  console.error(`${OUTPUT} cambiaría. No se sobrescribe sin revisar: usa --allow-changes si el cambio es esperado.`);
  process.exit(1);
} else {
  writeFileSync(path, content);
  console.log(`Escrito: ${OUTPUT} (${report.outputVertices} vértices de ${report.rawVertices})`);
}
