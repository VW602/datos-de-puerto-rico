export type ScaleKind = "linear" | "log";

/** Brass ramp. The 70% stop matches --color-accent. */
export const RAMP_STOPS: { t: number; hex: string }[] = [
  { t: 0, hex: "#31463c" },
  { t: 0.38, hex: "#7d6840" },
  { t: 0.7, hex: "#d4a054" },
  { t: 1, hex: "#f6e7c4" },
];

export const RAMP_GRADIENT = `linear-gradient(90deg, ${RAMP_STOPS.map((stop) => `${stop.hex} ${stop.t * 100}%`).join(", ")})`;

const NO_DATA = "var(--color-land)";

function hexToRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  const channel = (value: number) => Math.round(value).toString(16).padStart(2, "0");
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

export function rampColor(t: number): string {
  const x = Math.min(1, Math.max(0, t));
  let index = 0;
  while (index < RAMP_STOPS.length - 2 && x > RAMP_STOPS[index + 1].t) index += 1;
  const start = RAMP_STOPS[index];
  const end = RAMP_STOPS[index + 1];
  const span = end.t - start.t || 1;
  const u = (x - start.t) / span;
  const a = hexToRgb(start.hex);
  const b = hexToRgb(end.hex);
  return rgbToHex(a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u);
}

export function normalize(value: number, min: number, max: number, scale: ScaleKind): number {
  if (!Number.isFinite(value) || max === min) return 0.5;
  if (scale === "log") {
    const safeMin = Math.max(min, Number.MIN_VALUE);
    const safeMax = Math.max(max, safeMin);
    const safeValue = Math.max(value, safeMin);
    const span = Math.log(safeMax) - Math.log(safeMin);
    if (span === 0) return 0.5;
    return (Math.log(safeValue) - Math.log(safeMin)) / span;
  }
  return (value - min) / (max - min);
}

export function valueAt(t: number, min: number, max: number, scale: ScaleKind): number {
  const x = Math.min(1, Math.max(0, t));
  if (scale === "log") {
    const safeMin = Math.max(min, Number.MIN_VALUE);
    const safeMax = Math.max(max, safeMin);
    return Math.exp(Math.log(safeMin) + x * (Math.log(safeMax) - Math.log(safeMin)));
  }
  return min + x * (max - min);
}

export function colorForValue(
  value: number | null,
  min: number,
  max: number,
  scale: ScaleKind,
): string {
  if (value == null) return NO_DATA;
  return rampColor(normalize(value, min, max, scale));
}

export function domain(values: number[], scale: ScaleKind): { min: number; max: number } {
  const pool = scale === "log" ? values.filter((value) => value > 0) : values;
  if (pool.length === 0) return { min: 0, max: 1 };
  return { min: Math.min(...pool), max: Math.max(...pool) };
}

export function medianOf(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}
