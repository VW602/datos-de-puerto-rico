/**
 * Turns one Summary File cell into a number or an explained null. Census
 * writes special conditions as negative sentinel numbers; none of them is a
 * real value, and none of them becomes 0.
 *
 * Source: "Notes on ACS Estimate and Annotation Values", U.S. Census Bureau.
 */

export type CellStatus =
  | "ok"
  /** Empty cell or "null": no data for this geography. */
  | "missing"
  /** -666666666: estimate could not be computed (too few observations, or a median in an open-ended interval). */
  | "not_computable"
  /** -999999999: insufficient sample cases in the area. */
  | "insufficient_sample"
  /** -888888888: not applicable or not available. */
  | "not_applicable"
  /** -222222222: MOE could not be computed (insufficient observations). */
  | "moe_not_computable"
  /** -333333333: MOE not computed because the median is in an open-ended interval. */
  | "moe_open_ended_median"
  /** -555555555: MOE not appropriate; the estimate is controlled to an independent population estimate. */
  | "moe_controlled";

export type Cell = { value: number | null; status: CellStatus };

const SENTINELS: Record<string, CellStatus> = {
  "-666666666": "not_computable",
  "-999999999": "insufficient_sample",
  "-888888888": "not_applicable",
  "-222222222": "moe_not_computable",
  "-333333333": "moe_open_ended_median",
  "-555555555": "moe_controlled",
};

/** Throws on anything that is not a number or a documented sentinel, so a format change cannot slip through. */
export function parseCensusCell(raw: string): Cell {
  const text = raw.trim();
  if (text === "" || text.toLowerCase() === "null") return { value: null, status: "missing" };
  const sentinel = SENTINELS[text.replace(/\.0+$/, "")];
  if (sentinel) return { value: null, status: sentinel };
  if (!/^-?\d+(\.\d+)?$/.test(text)) throw new Error(`Valor del Censo no reconocido: "${raw}"`);
  const value = Number(text);
  if (value < 0) throw new Error(`Valor negativo del Censo sin significado documentado: "${raw}"`);
  return { value, status: "ok" };
}
