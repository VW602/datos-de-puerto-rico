/**
 * DATA GENERATE (offline): rebuilds data/normalized/census/* and
 * data/generated/census-municipios.json from the saved raw snapshot.
 *
 *   npm run data:census:generate             write files; refuses to change existing values
 *   npm run data:census:generate -- --check  fail if committed files differ from a fresh build
 *   npm run data:census:generate -- --allow-changes   accept new values (after a reviewed update)
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildCensusArtifacts } from "./pipeline.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const check = process.argv.includes("--check");
const allowChanges = process.argv.includes("--allow-changes");

const artifacts = buildCensusArtifacts(ROOT);
let changed = 0;
for (const [path, content] of Object.entries(artifacts)) {
  const full = join(ROOT, path);
  const current = existsSync(full) ? readFileSync(full, "utf8") : null;
  if (current === content) continue;
  changed += 1;
  if (check) {
    console.error(`Desactualizado: ${path}`);
    continue;
  }
  if (current !== null && !allowChanges) {
    console.error(
      `${path} cambiaría. No se sobrescribe sin revisar: corre con --allow-changes solo si el cambio es esperado (nueva edición del Censo).`,
    );
    process.exitCode = 1;
    continue;
  }
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
  console.log(`Escrito: ${path}`);
}
if (check && changed > 0) process.exit(1);
if (!process.exitCode) console.log(changed === 0 ? "Sin cambios." : "Listo.");
