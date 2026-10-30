/**
 * Which sources one "Live data → KV" run refreshes and publishes.
 *
 *   node scripts/live/sources.ts --sources=auto|all|nws,earthquakes|water --refresh-water=true|false
 *
 * prints `sources=<list>` for $GITHUB_OUTPUT.
 *
 * The scheduler (infra/datos-scheduler) sends only `refresh_water`, so its runs
 * use "auto": every 15 minutes NWS alerts and USGS earthquakes; at minute 7 of
 * each hour USGS water only (the alerts and earthquakes were refreshed 7 minutes
 * earlier and will be again 8 minutes later). A manual run can ask for any set,
 * including all three.
 */
import { fileURLToPath } from "node:url";
import type { LiveSource } from "./publish.ts";

export const SOURCE_CHOICES = ["auto", "all", "nws,earthquakes", "water"] as const;
export type SourceChoice = (typeof SOURCE_CHOICES)[number];

export function chooseSources(choice: string, refreshWater: string): LiveSource[] {
  switch (choice) {
    case "all":
      return ["nws", "earthquakes", "water"];
    case "nws,earthquakes":
      return ["nws", "earthquakes"];
    case "water":
      return ["water"];
    case "auto":
    case "":
      if (refreshWater === "true") return ["water"];
      if (refreshWater === "false" || refreshWater === "") return ["nws", "earthquakes"];
      throw new Error(`refresh_water no válido: ${refreshWater}`);
    default:
      throw new Error(`sources no válido: ${choice} (${SOURCE_CHOICES.join(" | ")})`);
  }
}

const arg = (name: string) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? "";

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    console.log(`sources=${chooseSources(arg("sources"), arg("refresh-water")).join(",")}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
