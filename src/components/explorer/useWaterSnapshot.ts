import { useEffect, useState } from "react";
import { loadWater, type WaterSnapshot } from "@/data/pr/water";

/** The water snapshot, loaded in the browser after the page renders (it is not in the initial bundle). */
export function useWaterSnapshot(): WaterSnapshot | null | "error" {
  const [water, setWater] = useState<WaterSnapshot | null | "error">(null);
  useEffect(() => {
    let live = true;
    loadWater()
      .then((s) => live && setWater(s))
      .catch(() => live && setWater("error"));
    return () => {
      live = false;
    };
  }, []);
  return water;
}
