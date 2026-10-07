/**
 * DATA GENERATE (offline): rebuilds data/generated/bls-laus.json from the
 * saved BLS API responses.
 *
 *   npm run data:bls:generate                    write; refuses to change an existing file
 *   npm run data:bls:generate -- --check         fail if the committed file differs from a fresh build
 *   npm run data:bls:generate -- --allow-changes accept a reviewed change (after data:bls:update)
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildLaus } from "./pipeline.ts";
import { OUTPUT } from "./source.ts";

const rootArg = process.argv.find((arg) => arg.startsWith("--root="));
const ROOT = rootArg
  ? rootArg.slice("--root=".length)
  : join(dirname(fileURLToPath(import.meta.url)), "../..");

let content: string;
try {
  content = buildLaus(ROOT).content;
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
const path = join(ROOT, OUTPUT);
const current = existsSync(path) ? readFileSync(path, "utf8") : null;

if (current === content) {
  console.log("Sin cambios.");
} else if (process.argv.includes("--check")) {
  console.error(`Desactualizado: ${OUTPUT}`);
  process.exit(1);
} else if (current !== null && !process.argv.includes("--allow-changes")) {
  console.error(
    `${OUTPUT} cambiaría. No se sobrescribe sin revisar: usa --allow-changes si el cambio es esperado.`,
  );
  process.exit(1);
} else {
  writeFileSync(path, content);
  console.log(`Escrito: ${OUTPUT}`);
}
