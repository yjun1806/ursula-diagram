import type { Layout, LayoutEdge, Point } from '../src/types.ts';

export interface Seg {
  a: Point;
  b: Point;
}

export function segmentsOf(edge: LayoutEdge): Seg[] {
  const out: Seg[] = [];
  for (let i = 0; i + 1 < edge.points.length; i++) {
    const a = edge.points[i];
    const b = edge.points[i + 1];
    if (a && b) out.push({ a, b });
  }
  return out;
}

const EPS = 1e-6;

export function isAxisAligned(s: Seg): boolean {
  return Math.abs(s.a.x - s.b.x) < EPS || Math.abs(s.a.y - s.b.y) < EPS;
}

/** True when the segment passes through the open interior of the rectangle. */
export function crossesInterior(s: Seg, r: { x: number; y: number; w: number; h: number }): boolean {
  const x1 = Math.min(s.a.x, s.b.x);
  const x2 = Math.max(s.a.x, s.b.x);
  const y1 = Math.min(s.a.y, s.b.y);
  const y2 = Math.max(s.a.y, s.b.y);
  return x1 < r.x + r.w - EPS && x2 > r.x + EPS && y1 < r.y + r.h - EPS && y2 > r.y + EPS;
}

/** Length of the collinear overlap between two axis-aligned segments (0 when not collinear). */
export function overlapLength(s: Seg, t: Seg): number {
  const sh = Math.abs(s.a.y - s.b.y) < EPS;
  const th = Math.abs(t.a.y - t.b.y) < EPS;
  if (sh !== th) return 0;
  if (sh) {
    if (Math.abs(s.a.y - t.a.y) > EPS) return 0;
    const lo = Math.max(Math.min(s.a.x, s.b.x), Math.min(t.a.x, t.b.x));
    const hi = Math.min(Math.max(s.a.x, s.b.x), Math.max(t.a.x, t.b.x));
    return Math.max(0, hi - lo);
  }
  if (Math.abs(s.a.x - t.a.x) > EPS) return 0;
  const lo = Math.max(Math.min(s.a.y, s.b.y), Math.min(t.a.y, t.b.y));
  const hi = Math.min(Math.max(s.a.y, s.b.y), Math.max(t.a.y, t.b.y));
  return Math.max(0, hi - lo);
}

export function rectsOverlap(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): boolean {
  return a.x < b.x + b.w - EPS && b.x < a.x + a.w - EPS && a.y < b.y + b.h - EPS && b.y < a.y + a.h - EPS;
}

/** Returns a list of invariant violations; empty when the layout is sound. */
export function geometryViolations(l: Layout): string[] {
  const bad: string[] = [];
  for (let i = 0; i < l.nodes.length; i++) {
    const a = l.nodes[i];
    if (!a) continue;
    if (a.x < 0 || a.y < 0 || a.x + a.w > l.width + EPS || a.y + a.h > l.height + EPS) bad.push(`node ${a.id} outside`);
    for (let j = i + 1; j < l.nodes.length; j++) {
      const b = l.nodes[j];
      if (b && rectsOverlap(a, b)) bad.push(`nodes ${a.id} and ${b.id} overlap`);
    }
  }
  l.edges.forEach((e, i) => {
    const name = `${e.from}->${e.to}`;
    if (e.points.length < 2) bad.push(`edge ${name} has fewer than 2 points`);
    for (const p of e.points) {
      if (p.x < -EPS || p.y < -EPS || p.x > l.width + EPS || p.y > l.height + EPS) bad.push(`edge ${name} point outside`);
    }
    for (const s of segmentsOf(e)) {
      if (!isAxisAligned(s)) bad.push(`edge ${name} has a diagonal segment`);
      for (const n of l.nodes) if (crossesInterior(s, n)) bad.push(`edge ${name} crosses node ${n.id}`);
    }
    for (let j = i + 1; j < l.edges.length; j++) {
      const other = l.edges[j];
      if (!other) continue;
      for (const s of segmentsOf(e)) {
        for (const t of segmentsOf(other)) {
          if (overlapLength(s, t) > EPS) bad.push(`edges ${name} and ${other.from}->${other.to} share a segment`);
        }
      }
    }
    if (e.label) {
      for (const n of l.nodes) if (rectsOverlap(e.label, n)) bad.push(`label of ${name} overlaps node ${n.id}`);
      if (e.label.x < -EPS || e.label.y < -EPS || e.label.x + e.label.w > l.width + EPS || e.label.y + e.label.h > l.height + EPS) {
        bad.push(`label of ${name} outside`);
      }
    }
  });
  return bad;
}
