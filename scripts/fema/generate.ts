/**
 * DATA GENERATE (offline): rebuilds data/generated/fema-pr.json and
 * data/generated/fema-projects/*.json from the saved OpenFEMA responses.
 *
 *   npm run data:fema:generate                    write; refuses to change existing files
 *   npm run data:fema:generate -- --check         fail if the committed files differ from a fresh build
 *   npm run data:fema:generate -- --allow-changes accept a reviewed change (after data:fema:update)
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildFema } from "./pipeline.ts";
import { OUTPUT, PROJECTS_DIR } from "./source.ts";

const rootArg = process.argv.find((arg) => arg.startsWith("--root="));
const ROOT = rootArg
  ? rootArg.slice("--root=".length)
  : join(dirname(fileURLToPath(import.meta.url)), "../..");

let built: ReturnType<typeof buildFema>;
try {
  built = buildFema(ROOT);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

const wanted = new Map<string, string>([[OUTPUT, built.summary]]);
for (const [d, content] of Object.entries(built.projects))
  wanted.set(`${PROJECTS_DIR}/${d}.json`, content);
const dir = join(ROOT, PROJECTS_DIR);
const existing = existsSync(dir) ? readdirSync(dir).map((f) => `${PROJECTS_DIR}/${f}`) : [];
const extra = existing.filter((p) => !wanted.has(p));
const changed = [...wanted].filter(
  ([p, content]) => !existsSync(join(ROOT, p)) || readFileSync(join(ROOT, p), "utf8") !== content,
);
const present = [...wanted.keys()].some((p) => existsSync(join(ROOT, p))) || existing.length > 0;

if (changed.length === 0 && extra.length === 0) {
  console.log("Sin cambios.");
} else if (process.argv.includes("--check")) {
  console.error(`Desactualizado: ${[...changed.map(([p]) => p), ...extra].slice(0, 5).join(", ")}`);
  process.exit(1);
} else if (present && !process.argv.includes("--allow-changes") && existsSync(join(ROOT, OUTPUT))) {
  console.error(
    "Los archivos de FEMA cambiarían. No se sobrescriben sin revisar: usa --allow-changes si el cambio es esperado.",
  );
  process.exit(1);
} else {
  mkdirSync(dir, { recursive: true });
  for (const p of extra) rmSync(join(ROOT, p));
  for (const [p, content] of changed) {
    mkdirSync(dirname(join(ROOT, p)), { recursive: true });
    writeFileSync(join(ROOT, p), content);
  }
  console.log(`Escrito: ${OUTPUT} y ${wanted.size - 1} archivos de proyectos.`);
}
