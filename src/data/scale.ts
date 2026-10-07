export type ScaleKind = "linear" | "log";

/**
 * Arena → Añil: the approved choropleth ramp (light = low, dark = high).
 * Measured with CIEDE2000 under normal vision, deuteranopia and protanopia:
 * neighbouring values stay distinguishable on the real ranges of the site's
 * measures. Colors between stops are mixed in OKLab, the space the palette
 * was validated in. Do not edit a stop without re-running that test.
 */
export const RAMP: readonly string[] = [
  "#FFF7DA",
  "#DEE197",
  "#85CF95",
  "#3BACA6",
  "#2181A4",
  "#2E5297",
  "#282869",
];

export const RAMP_GRADIENT = `linear-gradient(90deg, ${RAMP.join(", ")})`;

/** SVG pattern id for "sin dato publicado". Never a flat fill: see MapPatterns. */
export const NO_DATA_PATTERN_ID = "pr-no-data";
export const NO_DATA_FILL = `url(#${NO_DATA_PATTERN_ID})`;
/** No-data hatch: base and stripe colors, stripe at least 3:1 against the base. */
export const NO_DATA_HATCH = {
  base: "#E9E5DC",
  stripe: "#7A7468",
  size: 5,
  stripeWidth: 1.6,
} as const;
/**
 * Signed metrics (e.g. federal obligations, which can be net negative) keep
 * zero and negative values off the ramp, each with its own neutral pattern:
 * a negative amount is not missing, not $0 and not "a little". Neither
 * pattern implies good or bad.
 */
export type ValueClass = "POSITIVE" | "ZERO" | "NEGATIVE" | "NO_DATA";
export const ZERO_PATTERN_ID = "pr-zero";
export const NEGATIVE_PATTERN_ID = "pr-negative";
export const ZERO_FILL = `url(#${ZERO_PATTERN_ID})`;
export const NEGATIVE_FILL = `url(#${NEGATIVE_PATTERN_ID})`;
/** Zero: white with a dot grid. Negative: white with horizontal "minus" lines. */
export const SIGNED_PATTERNS = {
  zero: { base: "#FFFFFF", dot: "#57534B", size: 5, radius: 0.9 },
  negative: { base: "#FFFFFF", stripe: "#3E5A62", size: 5, stripeWidth: 1.5 },
} as const;

export function valueClass(value: number | null): ValueClass {
  if (value == null || !Number.isFinite(value)) return "NO_DATA";
  if (value > 0) return "POSITIVE";
  return value < 0 ? "NEGATIVE" : "ZERO";
}

/** Metrics that only exist for the whole island paint the land this neutral color. */
export const ISLAND_ONLY_FILL = "#DDD7CB";

type Lab = [number, number, number];

function hexToRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const fromLinear = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

function toOklab(hex: string): Lab {
  const [r, g, b] = hexToRgb(hex).map(toLinear);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function fromOklab([L, a, b]: Lab): string {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const rgb = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return `#${rgb
    .map((c) =>
      Math.round(Math.min(1, Math.max(0, fromLinear(c))) * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")
    .toUpperCase()}`;
}

const RAMP_LAB = RAMP.map(toOklab);

/** Color at position t (0–1) of the ramp. */
export function rampColor(t: number): string {
  const x = Math.min(1, Math.max(0, Number.isFinite(t) ? t : 0)) * (RAMP_LAB.length - 1);
  const i = Math.min(Math.floor(x), RAMP_LAB.length - 2);
  const u = x - i;
  const a = RAMP_LAB[i];
  const b = RAMP_LAB[i + 1];
  return fromOklab([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u]);
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

/**
 * Fill for one municipio. A published value (0 included) always gets a ramp
 * color; 0 is the lowest valid color. A missing value gets the no-data hatch,
 * never a ramp color and never a flat gray. For signed metrics, zero and
 * negative values get their own patterns instead (see ValueClass).
 */
export function colorForValue(
  value: number | null,
  min: number,
  max: number,
  scale: ScaleKind,
  signed = false,
): string {
  if (value == null) return NO_DATA_FILL;
  if (signed) {
    // Only positive amounts are on the ramp; never clamp a negative or $0 into its lowest color.
    const cls = valueClass(value);
    if (cls === "NEGATIVE") return NEGATIVE_FILL;
    if (cls === "ZERO") return ZERO_FILL;
  }
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
