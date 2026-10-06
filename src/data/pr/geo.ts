/**
 * Map geometry in one fixed "world" coordinate space, computed once from the
 * generated TIGER/Line 2024 file. Every map on the site (desktop band, mobile
 * overview, mobile detail) draws these same paths; zoom and pan only change
 * the SVG viewBox, never a coordinate. Pure functions, no React, so hit tests
 * and view math are testable.
 */
import { geoMercator, geoPath, type GeoPermissibleObjects } from "d3-geo";
import geometry from "../../../data/generated/municipios.geometry.json";

type Ring = [number, number][];

export type Bounds = { x0: number; y0: number; x1: number; y1: number };

export type MapShape = {
  id: string;
  name: string;
  /** SVG path in world coordinates. */
  d: string;
  /** Projected rings (exterior and holes) for hit tests. */
  rings: Ring[];
  bounds: Bounds;
  /**
   * The municipio's main body: its most detailed ring. For Mayagüez this is
   * the town on the main island, not Mona or Desecheo (whose outlines, with
   * their coastal water, cover more area). Used to place the name and to zoom.
   */
  primary: Bounds;
  /** Label anchor: centroid of the primary ring. */
  label: [number, number];
};

const collection = geometry as unknown as GeoJSON.FeatureCollection;

export const WORLD_WIDTH = 1000;
const projection = geoMercator().fitWidth(WORLD_WIDTH, collection as GeoPermissibleObjects);
const path = geoPath(projection);
const [[, top], [, bottom]] = path.bounds(collection as GeoPermissibleObjects);
export const WORLD_HEIGHT = Math.ceil(bottom - top);
if (Math.abs(top) > 1)
  projection.translate([projection.translate()[0], projection.translate()[1] - top]);

/** Land plus a sea margin for the ocean labels and the scale bar. */
export const WORLD: Bounds = { x0: -24, y0: -38, x1: WORLD_WIDTH + 24, y1: WORLD_HEIGHT + 34 };

function ringCentroid(ring: Ring): [number, number] {
  let x = 0;
  let y = 0;
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const f = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
    x += (ring[j][0] + ring[i][0]) * f;
    y += (ring[j][1] + ring[i][1]) * f;
    a += f;
  }
  return a === 0 ? ring[0] : [x / (3 * a), y / (3 * a)];
}

export const SHAPES: MapShape[] = collection.features.map((feature) => {
  const props = feature.properties as { id: string; name: string };
  const polygons =
    feature.geometry.type === "Polygon"
      ? [feature.geometry.coordinates as [number, number][][]]
      : ((feature.geometry as GeoJSON.MultiPolygon).coordinates as [number, number][][][]);
  const rings: Ring[] = polygons.flatMap((polygon) =>
    polygon.map((ring) =>
      ring.map((point) => projection(point as [number, number]) as [number, number]),
    ),
  );
  const xs = rings.flatMap((ring) => ring.map((p) => p[0]));
  const ys = rings.flatMap((ring) => ring.map((p) => p[1]));
  const main = rings.reduce((best, ring) => (ring.length > best.length ? ring : best), rings[0]);
  const mx = main.map((p) => p[0]);
  const my = main.map((p) => p[1]);
  return {
    id: props.id,
    name: props.name,
    d: path(feature as GeoPermissibleObjects) ?? "",
    rings,
    bounds: { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) },
    primary: { x0: Math.min(...mx), y0: Math.min(...my), x1: Math.max(...mx), y1: Math.max(...my) },
    label: ringCentroid(main),
  };
});

export const SHAPE_BY_ID = new Map(SHAPES.map((shape) => [shape.id, shape]));

/** World units per kilometre at Puerto Rico's latitude (for the scale bar). */
export function unitsPerKm(): number {
  const a = projection([-66.5, 18.2]) as [number, number];
  const b = projection([-66.4, 18.2]) as [number, number];
  const km = 0.1 * 111.32 * Math.cos((18.2 * Math.PI) / 180);
  return Math.abs(b[0] - a[0]) / km;
}

/** Where a longitude/latitude falls in world coordinates (for sea and island labels). */
export function project(lon: number, lat: number): [number, number] {
  return projection([lon, lat]) as [number, number];
}

/**
 * Where to put an island's name: just outside the outline (TIGER outlines
 * include coastal water) of the ring that holds the given longitude/latitude.
 */
export function islandLabelAnchor(
  lon: number,
  lat: number,
  side: "above" | "below",
): { x: number; y: number; x0: number; x1: number } {
  const [x, y] = project(lon, lat);
  for (const shape of SHAPES) {
    for (const ring of shape.rings) {
      const xs = ring.map((p) => p[0]);
      const ys = ring.map((p) => p[1]);
      const x0 = Math.min(...xs);
      const x1 = Math.max(...xs);
      const y0 = Math.min(...ys);
      const y1 = Math.max(...ys);
      if (x >= x0 && x <= x1 && y >= y0 && y <= y1 && inRing(x, y, ring))
        return { x: (x0 + x1) / 2, y: side === "above" ? y0 : y1, x0, x1 };
    }
  }
  return { x, y, x0: x, x1: x };
}

// ---------------------------------------------------------------- hit tests

function inRing(x: number, y: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Even-odd test over every ring, so holes and multi-part municipios work. */
export function contains(shape: MapShape, x: number, y: number): boolean {
  const { x0, y0, x1, y1 } = shape.bounds;
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  let inside = false;
  for (const ring of shape.rings) if (inRing(x, y, ring)) inside = !inside;
  return inside;
}

function segmentDistance(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len = dx * dx + dy * dy;
  const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Distance from a point to the nearest boundary of the shape (0 if the shape has no rings). */
export function boundaryDistance(shape: MapShape, x: number, y: number): number {
  let best = Infinity;
  for (const ring of shape.rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const d = segmentDistance(x, y, ring[j][0], ring[j][1], ring[i][0], ring[i][1]);
      if (d < best) best = d;
    }
  }
  return best;
}

export type Candidate = { id: string; name: string; inside: boolean; distance: number };

const byName = (a: string, b: string) => a.localeCompare(b, "es");

/**
 * Municipios a touch at (x, y) could have meant: the one that contains the
 * point plus every municipio whose boundary is within `radius` world units.
 * Deterministic order: the containing municipio first, then by distance,
 * then by name. Never random.
 */
export function candidatesAt(x: number, y: number, radius: number, limit = 5): Candidate[] {
  const out: Candidate[] = [];
  for (const shape of SHAPES) {
    const { x0, y0, x1, y1 } = shape.bounds;
    if (x < x0 - radius || x > x1 + radius || y < y0 - radius || y > y1 + radius) continue;
    const inside = contains(shape, x, y);
    const distance = inside ? 0 : boundaryDistance(shape, x, y);
    if (inside || distance <= radius)
      out.push({ id: shape.id, name: shape.name, inside, distance });
  }
  out.sort(
    (a, b) =>
      Number(b.inside) - Number(a.inside) || a.distance - b.distance || byName(a.name, b.name),
  );
  return out.slice(0, limit);
}

export type TapResult =
  { kind: "none" } | { kind: "select"; id: string } | { kind: "choose"; candidates: Candidate[] };

/**
 * A touch selects directly only when exactly one municipio is a reasonable
 * reading of it: it lands inside that municipio and no other boundary is
 * within reach. Anything else asks the person to choose. No silent guesses.
 */
export function resolveTap(x: number, y: number, radius: number): TapResult {
  const candidates = candidatesAt(x, y, radius);
  if (candidates.length === 0) return { kind: "none" };
  if (candidates.length === 1 && candidates[0].inside)
    return { kind: "select", id: candidates[0].id };
  return { kind: "choose", candidates };
}

/** Pointer (mouse) hit: the municipio under the point, if any. */
export function shapeAt(x: number, y: number): MapShape | null {
  return SHAPES.find((shape) => contains(shape, x, y)) ?? null;
}

// ---------------------------------------------------------------- views

/** A view: the world point at the center of the map and its scale in px per world unit. */
export type View = { cx: number; cy: number; k: number };

export const MAX_ZOOM = 16;

export function fitView(width: number, height: number, area: Bounds = WORLD): View {
  const k = Math.min(width / (area.x1 - area.x0), height / (area.y1 - area.y0));
  return { cx: (area.x0 + area.x1) / 2, cy: (area.y0 + area.y1) / 2, k };
}

/** Keeps the zoom between "toda la isla" and MAX_ZOOM, and the center over the world. */
export function clampView(view: View, width: number, height: number): View {
  const kMin = fitView(width, height).k;
  const k = Math.min(kMin * MAX_ZOOM, Math.max(kMin, view.k));
  const halfW = width / k / 2;
  const halfH = height / k / 2;
  const clamp = (v: number, lo: number, hi: number) =>
    lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v));
  return {
    k,
    cx: clamp(view.cx, WORLD.x0 + halfW, WORLD.x1 - halfW),
    cy: clamp(view.cy, WORLD.y0 + halfH, WORLD.y1 - halfH),
  };
}

export function viewBox(view: View, width: number, height: number): Bounds {
  const w = width / view.k;
  const h = height / view.k;
  return { x0: view.cx - w / 2, y0: view.cy - h / 2, x1: view.cx + w / 2, y1: view.cy + h / 2 };
}

/** Zoom by a factor around a world point (default: the center). */
export function zoomView(
  view: View,
  factor: number,
  width: number,
  height: number,
  at?: [number, number],
): View {
  const [ax, ay] = at ?? [view.cx, view.cy];
  const k = view.k * factor;
  const next = { k, cx: ax + (view.cx - ax) / factor, cy: ay + (view.cy - ay) / factor };
  return clampView(next, width, height);
}

/** Brings one municipio's main body into view: centered, comfortably zoomed, never less than 2.5× the whole island. */
export function focusView(id: string, width: number, height: number): View | null {
  const shape = SHAPE_BY_ID.get(id);
  if (!shape) return null;
  const { x0, y0, x1, y1 } = shape.primary;
  const kFit = fitView(width, height).k;
  const k = Math.max(
    kFit * 2.5,
    Math.min(kFit * 10, 0.5 * Math.min(width / (x1 - x0), height / (y1 - y0))),
  );
  return clampView({ cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, k }, width, height);
}

// ---------------------------------------------------------------- keyboard

export type Direction = "left" | "right" | "up" | "down";

const VECTORS: Record<Direction, [number, number]> = {
  left: [-1, 0],
  right: [1, 0],
  up: [0, -1],
  down: [0, 1],
};

/**
 * The municipio a keyboard arrow should move to: the nearest label anchor in
 * that direction, favoring ones straight ahead. Deterministic; null at the edge.
 */
export function neighborInDirection(fromId: string, direction: Direction): string | null {
  const from = SHAPE_BY_ID.get(fromId);
  if (!from) return null;
  const [vx, vy] = VECTORS[direction];
  // Look straight ahead first (within ~45°), then wider (~68°) at the edges of the island.
  for (const cone of [1, 2.5]) {
    let best: { id: string; score: number; name: string } | null = null;
    for (const shape of SHAPES) {
      if (shape.id === fromId) continue;
      const dx = shape.label[0] - from.label[0];
      const dy = shape.label[1] - from.label[1];
      const along = dx * vx + dy * vy;
      if (along <= 0) continue;
      const across = Math.abs(dx * vy - dy * vx);
      if (across > along * cone) continue;
      const score = along + across * 2;
      if (
        !best ||
        score < best.score ||
        (score === best.score && byName(shape.name, best.name) < 0)
      ) {
        best = { id: shape.id, score, name: shape.name };
      }
    }
    if (best) return best.id;
  }
  return null;
}

// ---------------------------------------------------------------- main island

/** Municipios that are their own islands; everything else shares the main island. */
const OFFSHORE_MUNICIPIOS = new Set(["72049", "72147"]); // Culebra, Vieques

/**
 * The main island's extent, from each municipio's main body (so Mona and
 * Desecheo, which belong to Mayagüez, are left out). Computed from the
 * geometry, never typed in.
 */
export const MAIN_ISLAND: Bounds = SHAPES.filter(
  (shape) => !OFFSHORE_MUNICIPIOS.has(shape.id),
).reduce(
  (acc, shape) => ({
    x0: Math.min(acc.x0, shape.primary.x0),
    y0: Math.min(acc.y0, shape.primary.y0),
    x1: Math.max(acc.x1, shape.primary.x1),
    y1: Math.max(acc.y1, shape.primary.y1),
  }),
  { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity },
);

/** Starting view for the phone's detail map: the main island filling the frame. */
export function mainIslandView(width: number, height: number): View {
  const pad = 8;
  const k = Math.min(
    (width - 2 * pad) / (MAIN_ISLAND.x1 - MAIN_ISLAND.x0),
    (height - 2 * pad) / (MAIN_ISLAND.y1 - MAIN_ISLAND.y0),
  );
  return clampView(
    { cx: (MAIN_ISLAND.x0 + MAIN_ISLAND.x1) / 2, cy: (MAIN_ISLAND.y0 + MAIN_ISLAND.y1) / 2, k },
    width,
    height,
  );
}

// ---------------------------------------------------------------- labels

export type PlacedLabel = {
  id: string;
  name: string;
  x: number;
  y: number;
  size: number;
  bold: boolean;
};

/** Approximate rendered width of a label in px (Source Sans 3 averages ~0.55 em per character). */
export function labelWidth(name: string, size: number): number {
  return name.length * size * 0.55 + 6;
}

/**
 * Municipio names that fit without touching each other, for the current view.
 * Deterministic greedy placement: the selected municipio first, then keyboard
 * focus, then hover, then the rest by distance to the center of the view and
 * by name. A label that would overlap one already placed is hidden (it comes
 * back as the zoom increases and labels spread apart). Geometry never moves.
 *
 * `showAll` is false at low zoom: then only the promoted labels are drawn.
 */
export function placeLabels(
  box: Bounds,
  k: number,
  options: {
    selectedId: string | null;
    focusId?: string | null;
    hoverId?: string | null;
    showAll: boolean;
    size?: number;
  },
): PlacedLabel[] {
  const size = options.size ?? 11;
  const width = (box.x1 - box.x0) * k;
  const height = (box.y1 - box.y0) * k;
  const centerX = (box.x0 + box.x1) / 2;
  const centerY = (box.y0 + box.y1) / 2;
  const rank = (id: string) =>
    id === options.selectedId ? 0 : id === options.focusId ? 1 : id === options.hoverId ? 2 : 3;

  const candidates = SHAPES.filter((shape) => options.showAll || rank(shape.id) < 3)
    .map((shape) => ({
      shape,
      rank: rank(shape.id),
      sx: (shape.label[0] - box.x0) * k,
      sy: (shape.label[1] - box.y0) * k,
    }))
    .filter(({ sx, sy }) => sx > 0 && sx < width && sy > 0 && sy < height)
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        Math.hypot(a.shape.label[0] - centerX, a.shape.label[1] - centerY) -
          Math.hypot(b.shape.label[0] - centerX, b.shape.label[1] - centerY) ||
        byName(a.shape.name, b.shape.name),
    );

  const placed: { box: Bounds; label: PlacedLabel }[] = [];
  for (const { shape, rank: r, sx, sy } of candidates) {
    const labelSize = r === 0 ? size + 2 : size;
    const w = labelWidth(shape.name, labelSize);
    const h = labelSize * 1.25;
    // Keep the whole label inside the frame by sliding it, never past the municipio's own anchor by more than half a label.
    const left = Math.min(Math.max(sx - w / 2, 2), width - w - 2);
    const top = Math.min(Math.max(sy - labelSize * 0.95, 2), height - h - 2);
    // A little air around each name, so neighbours read as separate labels.
    const rect = { x0: left - 6, y0: top - 3, x1: left + w + 6, y1: top + h + 3 };
    const collides = placed.some(
      ({ box: other }) =>
        rect.x0 < other.x1 && rect.x1 > other.x0 && rect.y0 < other.y1 && rect.y1 > other.y0,
    );
    if (collides && r !== 0) continue;
    placed.push({
      box: rect,
      label: {
        id: shape.id,
        name: shape.name,
        x: box.x0 + (left + w / 2) / k,
        y: box.y0 + (top + labelSize * 0.95) / k,
        size: labelSize,
        bold: r === 0,
      },
    });
  }
  return placed.map(({ label }) => label);
}
