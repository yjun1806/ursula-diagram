// layout/check.ts as it was before the segments were built once per edge; kept as it was.
import type { Diagnostic, LayoutEdge } from '../src/types.ts';

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

/** Number of proper crossings between different edges (an edge crossing another twice counts twice). */
export function crossingCount(edges: LayoutEdge[]): number {
  let total = 0;
  for (let i = 0; i < edges.length; i++) {
    for (let j = i + 1; j < edges.length; j++) {
      const a = edges[i];
      const b = edges[j];
      if (!a || !b) continue;
      const sb = segments(b);
      for (const s of segments(a)) for (const t of sb) if (properCross(s, t)) total++;
    }
  }
  return total;
}

export function crossings(edges: LayoutEdge[]): Diagnostic[] {
  const out: Diagnostic[] = [];
  for (let i = 0; i < edges.length; i++) {
    for (let j = i + 1; j < edges.length; j++) {
      const a = edges[i];
      const b = edges[j];
      if (!a || !b) continue;
      const sb = segments(b);
      let count = 0;
      for (const s of segments(a)) for (const t of sb) if (properCross(s, t)) count++;
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
