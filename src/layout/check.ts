import type { Diagnostic, LayoutEdge } from '../types.ts';

type Seg = { x1: number; y1: number; x2: number; y2: number };

function segments(edge: LayoutEdge): Seg[] {
  const out: Seg[] = [];
  for (let i = 0; i + 1 < edge.points.length; i++) {
    const p = edge.points[i];
    const q = edge.points[i + 1];
    if (p && q) out.push({ x1: p.x, y1: p.y, x2: q.x, y2: q.y });
  }
  return out;
}

function properCross(a: Seg, b: Seg): boolean {
  const aH = a.y1 === a.y2;
  const bH = b.y1 === b.y2;
  if (aH === bH) return false;
  const [h, v] = aH ? [a, b] : [b, a];
  const eps = 1e-6;
  return (
    v.x1 > Math.min(h.x1, h.x2) + eps &&
    v.x1 < Math.max(h.x1, h.x2) - eps &&
    h.y1 > Math.min(v.y1, v.y2) + eps &&
    h.y1 < Math.max(v.y1, v.y2) - eps
  );
}

/** The segments of every edge and the box around each edge: two edges whose boxes do not meet cannot cross. */
function prepared(edges: LayoutEdge[]): Array<{ segs: Seg[]; x0: number; x1: number; y0: number; y1: number }> {
  return edges.map((edge) => {
    const segs = segments(edge);
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    for (const s of segs) {
      x0 = Math.min(x0, s.x1, s.x2);
      x1 = Math.max(x1, s.x1, s.x2);
      y0 = Math.min(y0, s.y1, s.y2);
      y1 = Math.max(y1, s.y1, s.y2);
    }
    return { segs, x0, x1, y0, y1 };
  });
}

function crossCount(a: ReturnType<typeof prepared>[number], b: ReturnType<typeof prepared>[number]): number {
  if (a.x1 < b.x0 || b.x1 < a.x0 || a.y1 < b.y0 || b.y1 < a.y0) return 0;
  let count = 0;
  for (const s of a.segs) for (const t of b.segs) if (properCross(s, t)) count++;
  return count;
}

/** Number of proper crossings between different edges (an edge crossing another twice counts twice). */
export function crossingCount(edges: LayoutEdge[]): number {
  const all = prepared(edges);
  let total = 0;
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) total += crossCount(all[i] as (typeof all)[number], all[j] as (typeof all)[number]);
  }
  return total;
}

export function crossings(edges: LayoutEdge[]): Diagnostic[] {
  const out: Diagnostic[] = [];
  const all = prepared(edges);
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const a = edges[i] as LayoutEdge;
      const b = edges[j] as LayoutEdge;
      const count = crossCount(all[i] as (typeof all)[number], all[j] as (typeof all)[number]);
      if (count === 0) continue;
      out.push({
        kind: 'crossing',
        nodes: [a.from, a.to, b.from, b.to],
        message: `Edge ${a.from} -> ${a.to} crosses ${b.from} -> ${b.to}${count > 1 ? ` (${count} times)` : ''}.`,
      });
    }
  }
  return out;
}
