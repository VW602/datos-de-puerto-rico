/**
 * Topology-preserving, deterministic simplification for municipio boundaries.
 *
 * Plain per-ring Douglas–Peucker would simplify the same border twice, once in
 * each neighbor, and open gaps or overlaps. Here every ring is split into arcs
 * at junctions (vertices where the set of rings touching the boundary changes),
 * each arc is simplified exactly once in a canonical direction, and both
 * neighbors reuse the identical result. Endpoints of arcs never move.
 */

import type { Ring } from "./shapefile.ts";

type Point = [number, number];
const key = (p: Point) => `${p[0]},${p[1]}`;

/** Douglas–Peucker with an explicit stack; ties keep the lowest index, so the result is deterministic. */
export function douglasPeucker(points: Point[], tolerance: number): Point[] {
  if (points.length <= 2) return points.slice();
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop()!;
    const [ax, ay] = points[first];
    const [bx, by] = points[last];
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let maxDist = -1;
    let index = -1;
    for (let i = first + 1; i < last; i += 1) {
      const [px, py] = points[i];
      let dist: number;
      if (len2 === 0) dist = Math.hypot(px - ax, py - ay);
      else {
        const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
        dist = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
      }
      if (dist > maxDist) {
        maxDist = dist;
        index = i;
      }
    }
    if (index >= 0 && maxDist > tolerance) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }
  return points.filter((_, i) => keep[i] === 1);
}

function lexLess(a: Point, b: Point): boolean {
  return a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]);
}

export type SimplifyStats = { arcs: number; sharedArcs: number; closedRings: number };

/**
 * Simplifies every ring of every feature. `features[i][j][k]` = ring k of
 * polygon j of feature i, closed (first point repeated at the end), as stored
 * by TIGER/Line. Throws if the boundaries are not topologically consistent.
 */
export function simplifyTopology(features: Ring[][][], tolerance: number): { features: Ring[][][]; stats: SimplifyStats } {
  // 1. Which rings touch each vertex.
  const owners = new Map<string, Set<string>>();
  const rings: { id: string; points: Point[] }[] = [];
  features.forEach((polygons, f) =>
    polygons.forEach((polygon, p) =>
      polygon.forEach((ring, r) => {
        const id = `${f}:${p}:${r}`;
        const points = ring.slice(0, -1) as Point[];
        if (key(ring[0]) !== key(ring[ring.length - 1])) throw new Error(`Anillo sin cerrar: ${id}`);
        rings.push({ id, points });
        for (const point of points) {
          const k = key(point);
          if (!owners.has(k)) owners.set(k, new Set());
          owners.get(k)!.add(id);
        }
      }),
    ),
  );
  const signature = (point: Point) => [...owners.get(key(point))!].sort().join("|");

  // 2. Junctions, decided globally so both neighbors split a shared border at the same points.
  const fixed = new Set<string>();
  for (const { points } of rings) {
    const n = points.length;
    for (let i = 0; i < n; i += 1) {
      const here = signature(points[i]);
      if (owners.get(key(points[i]))!.size >= 3 || here !== signature(points[(i - 1 + n) % n]) || here !== signature(points[(i + 1) % n])) {
        fixed.add(key(points[i]));
      }
    }
  }

  // 3. Simplify each arc once, in canonical direction, and count who uses it.
  const cache = new Map<string, Point[]>();
  const uses = new Map<string, number>();
  let closedRings = 0;
  const simplifyArc = (arc: Point[]): Point[] => {
    const forward = lexLess(arc[0], arc[arc.length - 1]) || (key(arc[0]) === key(arc[arc.length - 1]) && arc.length > 2 && lexLess(arc[1], arc[arc.length - 2]));
    const canonical = forward ? arc : arc.slice().reverse();
    const id = canonical.map(key).join(";");
    uses.set(id, (uses.get(id) ?? 0) + 1);
    if (!cache.has(id)) cache.set(id, douglasPeucker(canonical, tolerance));
    const result = cache.get(id)!;
    return forward ? result : result.slice().reverse();
  };

  const simplified = new Map<string, Ring>();
  for (const { id, points } of rings) {
    const n = points.length;
    let starts = points.map((point, i) => (fixed.has(key(point)) ? i : -1)).filter((i) => i >= 0);
    if (starts.length === 0) {
      // A ring that touches no other ring (an island): split at its lowest point and the point farthest from it.
      closedRings += 1;
      let low = 0;
      for (let i = 1; i < n; i += 1) if (lexLess(points[i], points[low])) low = i;
      let far = low;
      let best = -1;
      for (let i = 0; i < n; i += 1) {
        const d = Math.hypot(points[i][0] - points[low][0], points[i][1] - points[low][1]);
        if (d > best) {
          best = d;
          far = i;
        }
      }
      starts = [low, far].sort((a, b) => a - b);
    }
    const out: Point[] = [];
    for (let s = 0; s < starts.length; s += 1) {
      const from = starts[s];
      const to = starts[(s + 1) % starts.length];
      const arc: Point[] = [];
      for (let i = from; ; i = (i + 1) % n) {
        arc.push(points[i]);
        if (i === to && arc.length > 1) break;
        if (starts.length === 1 && arc.length > n) break;
      }
      const part = simplifyArc(arc);
      out.push(...part.slice(0, -1));
    }
    out.push(out[0]);
    simplified.set(id, out);
  }

  // 4. Consistency: every arc on a border between two rings must be used by exactly two rings.
  let sharedArcs = 0;
  for (const [id, count] of uses) {
    const interior = id.split(";").slice(1, -1);
    const shared = interior.length > 0 && owners.get(interior[0])!.size === 2;
    if (shared) {
      sharedArcs += 1;
      if (count !== 2) throw new Error(`Borde compartido usado ${count} veces (debería ser 2): topología inconsistente`);
    }
  }

  const result = features.map((polygons, f) => polygons.map((polygon, p) => polygon.map((_, r) => simplified.get(`${f}:${p}:${r}`)!)));
  return { features: result, stats: { arcs: uses.size, sharedArcs, closedRings } };
}

/** Rounds to `precision` decimals and drops consecutive duplicates created by rounding. */
export function roundRing(ring: Ring, precision: number): Ring {
  const f = 10 ** precision;
  const out: Ring = [];
  for (const [x, y] of ring) {
    const point: [number, number] = [Math.round(x * f) / f, Math.round(y * f) / f];
    const prev = out[out.length - 1];
    if (!prev || prev[0] !== point[0] || prev[1] !== point[1]) out.push(point);
  }
  return out;
}

/** Segments that properly cross (not just touch or coincide). Grid-indexed. */
export function findCrossings(rings: Ring[], cell = 0.01): number {
  type Seg = { a: Point; b: Point };
  const segments: Seg[] = [];
  const seen = new Set<string>();
  for (const ring of rings) {
    for (let i = 0; i < ring.length - 1; i += 1) {
      const a = ring[i];
      const b = ring[i + 1];
      const id = lexLess(a, b) ? `${key(a)}>${key(b)}` : `${key(b)}>${key(a)}`;
      if (seen.has(id)) continue; // shared border segment, already counted once
      seen.add(id);
      segments.push({ a, b });
    }
  }
  const grid = new Map<string, number[]>();
  segments.forEach((s, index) => {
    const x0 = Math.floor(Math.min(s.a[0], s.b[0]) / cell);
    const x1 = Math.floor(Math.max(s.a[0], s.b[0]) / cell);
    const y0 = Math.floor(Math.min(s.a[1], s.b[1]) / cell);
    const y1 = Math.floor(Math.max(s.a[1], s.b[1]) / cell);
    for (let x = x0; x <= x1; x += 1)
      for (let y = y0; y <= y1; y += 1) {
        const k = `${x},${y}`;
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k)!.push(index);
      }
  });
  const orient = (p: Point, q: Point, r: Point) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  const checked = new Set<string>();
  let crossings = 0;
  for (const list of grid.values()) {
    for (let i = 0; i < list.length; i += 1)
      for (let j = i + 1; j < list.length; j += 1) {
        const a = Math.min(list[i], list[j]);
        const b = Math.max(list[i], list[j]);
        const pair = `${a}-${b}`;
        if (checked.has(pair)) continue;
        checked.add(pair);
        const s = segments[a];
        const t = segments[b];
        if ([s.a, s.b].some((p) => key(p) === key(t.a) || key(p) === key(t.b))) continue;
        const o1 = orient(s.a, s.b, t.a);
        const o2 = orient(s.a, s.b, t.b);
        const o3 = orient(t.a, t.b, s.a);
        const o4 = orient(t.a, t.b, s.b);
        if (o1 * o2 < 0 && o3 * o4 < 0) crossings += 1;
      }
  }
  return crossings;
}
