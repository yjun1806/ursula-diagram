import type { GraphEdge } from '../types.ts';

/** A node's slot: position along the flow axis and across it, in whole slots. */
export interface SlotPoint {
  flow: number;
  cross: number;
}

/** Weights of the structural estimate; same order of magnitude as the routed score. */
const WEIGHT = { crossing: 1000, bend: 10 };

const side = (a: SlotPoint, b: SlotPoint, c: SlotPoint): number =>
  Math.sign((b.flow - a.flow) * (c.cross - a.cross) - (b.cross - a.cross) * (c.flow - a.flow));

/** True when the segments cross in a single interior point, or lie on one line and overlap. */
function cross(a: SlotPoint, b: SlotPoint, c: SlotPoint, d: SlotPoint): boolean {
  const s1 = side(a, b, c);
  const s2 = side(a, b, d);
  const s3 = side(c, d, a);
  const s4 = side(c, d, b);
  if (s1 === 0 && s2 === 0 && s3 === 0 && s4 === 0) {
    const key = (p: SlotPoint): number => (a.flow === b.flow && c.flow === d.flow ? p.cross : p.flow);
    return Math.max(Math.min(key(a), key(b)), Math.min(key(c), key(d))) < Math.min(Math.max(key(a), key(b)), Math.max(key(c), key(d)));
  }
  return s1 * s2 < 0 && s3 * s4 < 0;
}

/** Whether another slot lies strictly between two aligned slots. */
function blocked(a: SlotPoint, b: SlotPoint, all: Iterable<SlotPoint>): boolean {
  const alongFlow = a.cross === b.cross;
  const lo = Math.min(alongFlow ? a.flow : a.cross, alongFlow ? b.flow : b.cross);
  const hi = Math.max(alongFlow ? a.flow : a.cross, alongFlow ? b.flow : b.cross);
  for (const p of all) {
    if (p === a || p === b) continue;
    if (alongFlow ? p.cross === a.cross && p.flow > lo && p.flow < hi : p.flow === a.flow && p.cross > lo && p.cross < hi) return true;
  }
  return false;
}

/**
 * Structural estimate of an assignment from slots alone: 0 bends for an edge whose ends share a row (or a
 * column) with nothing between them, 2 bends otherwise (4 when a node stands between aligned ends), plus crossings of the straight segments between
 * slot centres. Lower is better.
 */
export function structuralEstimate(edges: GraphEdge[], slots: Map<string, SlotPoint>): number {
  const segments: Array<[string, string, SlotPoint, SlotPoint]> = [];
  let bends = 0;
  for (const e of edges) {
    const a = slots.get(e.from);
    const b = slots.get(e.to);
    if (!a || !b || e.from === e.to) continue;
    segments.push([e.from, e.to, a, b]);
    const aligned = a.flow === b.flow || a.cross === b.cross;
    if (!aligned) bends += 2;
    else if (blocked(a, b, slots.values())) bends += 4;
  }
  let crossings = 0;
  for (let i = 0; i < segments.length; i++) {
    for (let j = i + 1; j < segments.length; j++) {
      const s = segments[i];
      const t = segments[j];
      if (!s || !t || s[0] === t[0] || s[0] === t[1] || s[1] === t[0] || s[1] === t[1]) continue;
      if (cross(s[2], s[3], t[2], t[3])) crossings++;
    }
  }
  return WEIGHT.crossing * crossings + WEIGHT.bend * bends;
}
