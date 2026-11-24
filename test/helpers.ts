import type { Ruler } from '../src/metrics.ts';
import { CORNER_CLEAR } from '../src/layered/ports.ts';
import { measureNodes } from '../src/layout/place.ts';
import type { Graph, Layout, LayoutEdge, Point } from '../src/types.ts';

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

/**
 * True when segments `s` of `e` and `t` of `other` may run along one another: the two lines share a port, they
 * end at the same point of a box there, and each segment is the one its line starts with at that point.
 */
function sharedStub(e: LayoutEdge, other: LayoutEdge, s: Seg, t: Seg): boolean {
  if (e.sharedPort === undefined || e.sharedPort.id !== other.sharedPort?.id) return false;
  /** The port of a line, and whether `seg` is the segment the line starts with there. */
  const stub = (x: LayoutEdge, seg: Seg): Point | undefined => {
    const [port, next] = x.sharedPort?.at === 'start' ? [x.points[0], x.points[1]] : [x.points[x.points.length - 1], x.points[x.points.length - 2]];
    return (seg.a === port && seg.b === next) || (seg.b === port && seg.a === next) ? port : undefined;
  };
  const [p, q] = [stub(e, s), stub(other, t)];
  return p !== undefined && q !== undefined && Math.abs(p.x - q.x) < EPS && Math.abs(p.y - q.y) < EPS;
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
    for (const [p, id] of [[e.points[0], e.from], [e.points[e.points.length - 1], e.to]] as const) {
      const n = l.nodes.find((x) => x.id === id);
      if (!p || !n) continue;
      const inX = p.x > n.x - 0.01 && p.x < n.x + n.w + 0.01;
      const inY = p.y > n.y - 0.01 && p.y < n.y + n.h + 0.01;
      const onBorder = ((Math.abs(p.x - n.x) < 0.01 || Math.abs(p.x - n.x - n.w) < 0.01) && inY) || ((Math.abs(p.y - n.y) < 0.01 || Math.abs(p.y - n.y - n.h) < 0.01) && inX);
      if (!onBorder) bad.push(`edge ${name} ends off the border of ${id}`);
    }
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
          if (overlapLength(s, t) > EPS && !sharedStub(e, other, s, t)) bad.push(`edges ${name} and ${other.from}->${other.to} share a segment`);
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

/** Canvas width in the ruler's units that holds exactly `columns` columns (two slot units each) of the graph. */
export function widthForColumns(graph: Graph, ruler: Ruler, columns: number): number {
  const m = measureNodes(graph.nodes, graph.lanes, ruler, graph.direction === 'TD');
  const margin = ruler.uniform ? 0 : Math.ceil(ruler.trackGap / ruler.nodeGrid - 1e-9) * ruler.nodeGrid;
  return columns * 2 * m.unit - ruler.rankGap + 2 * margin + m.gutter + 2 * ruler.lanePad;
}

/**
 * Every edge starts on the border of its `from` box and ends on the border of its `to` box, at a port of that box.
 * A port lies at the centre of a side or a multiple of the pitch from it, or at an equal fraction of the side.
 * The pitch depends on how far the rank gap was stretched or squeezed, so every unit that can give is accepted.
 */
/**
 * Where line ends stand, against the ports of the boxes. A drawing is made either with one width per kind of box or, when that
 * costs a worse drawing, with every box at its own width: it is measured the way it was made, so the fewer violations count.
 */
export function endpointViolations(l: Layout, ruler: Ruler, graph: Graph): string[] {
  const shared = endpointsAgainst(l, ruler, graph);
  if (shared.length === 0 || ruler.shareWithin === undefined) return shared;
  const { shareWithin: _, ...own } = ruler;
  const apart = endpointsAgainst(l, own, graph);
  return apart.length < shared.length ? apart : shared;
}

function endpointsAgainst(l: Layout, ruler: Ruler, graph: Graph): string[] {
  const m = measureNodes(graph.nodes, graph.lanes, ruler, graph.direction === 'TD');
  const pitches: number[] = [];
  for (let gap = Math.max(ruler.nodeGrid, ruler.rankGap - 2 * ruler.nodeGrid); gap <= 2 * ruler.rankGap; gap += 2 * ruler.nodeGrid) {
    const unit = (graph.direction === 'TD' ? m.contentH : m.common) / 2 + gap / 2;
    pitches.push(unit / Math.max(1, Math.round(unit / ruler.portPitch)));
  }
  // An engine that refits the box width to a narrower gap has its own unit for every gap down to the ruler's minimum.
  for (let gap = Math.max(ruler.nodeGrid, Math.min(ruler.rankGapMin, ruler.rankGap)); gap <= 2 * ruler.rankGap; gap += ruler.nodeGrid) {
    if (gap % ruler.nodeGrid !== 0) continue;
    const refit = measureNodes(graph.nodes, graph.lanes, { ...ruler, rankGap: gap }, graph.direction === 'TD');
    pitches.push(refit.unit / Math.max(1, Math.round(refit.unit / ruler.portPitch)));
  }
  const bad: string[] = [];
  const near = (a: number, b: number): boolean => Math.abs(a - b) < 0.01;
  // A side whose whole steps cannot hold its ends takes the dense lattice: the centre and every half step from it, kept CORNER_CLEAR from both ends.
  // The lattice is chosen before one-bend edges move an end to another side, so the ends that stay may stand on the dense lattice of a side that now holds fewer.
  const evenPortOf = (len: number, off: number, _ends: number): boolean =>
    pitches.some((pitch) => {
      const k = Math.abs(off - len / 2) / (pitch / 2);
      return near(k, Math.round(k)) && Math.abs(off - len / 2) <= len / 2 - CORNER_CLEAR + 0.01;
    });

  const endsOnSide = new Map<string, number>();
  const sideOfEnd = (p: Point, n: Layout['nodes'][number]): string | undefined => {
    const inX = p.x > n.x - 0.01 && p.x < n.x + n.w + 0.01;
    const inY = p.y > n.y - 0.01 && p.y < n.y + n.h + 0.01;
    if (near(p.x, n.x) && inY) return `${n.id}|left`;
    if (near(p.x, n.x + n.w) && inY) return `${n.id}|right`;
    if (near(p.y, n.y) && inX) return `${n.id}|top`;
    if (near(p.y, n.y + n.h) && inX) return `${n.id}|bottom`;
    return undefined;
  };
  for (const e of l.edges) {
    for (const [p, id] of [[e.points[0], e.from], [e.points[e.points.length - 1], e.to]] as const) {
      const n = l.nodes.find((x) => x.id === id);
      const side = p && n ? sideOfEnd(p, n) : undefined;
      if (side !== undefined) endsOnSide.set(side, (endsOnSide.get(side) ?? 0) + 1);
    }
  }
  const portOf = (len: number, off: number): boolean => {
    for (const pitch of pitches) {
      const k = (off - len / 2) / pitch;
      if (near(k, Math.round(k))) return true;
    }
    for (let count = 1; count <= 40; count++) {
      const k = (off * (count + 1)) / len;
      if (near(k, Math.round(k)) && Math.round(k) >= 1 && Math.round(k) <= count) return true;
    }
    return false;
  };
  // Straight edges between the same two boxes stand as a bundle around the centre of the narrower box: half a pitch from it counts.
  const pairKey = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const straightBetween = new Map<string, number>();
  for (const e of l.edges) if (e.points.length === 2) straightBetween.set(pairKey(e.from, e.to), (straightBetween.get(pairKey(e.from, e.to)) ?? 0) + 1);
  const halfPortOf = (len: number, off: number): boolean => pitches.some((pitch) => near((off - len / 2) / (pitch / 2), Math.round((off - len / 2) / (pitch / 2))));
  const bundled = (e: Layout['edges'][number]): boolean => {
    if (e.points.length !== 2 || (straightBetween.get(pairKey(e.from, e.to)) ?? 0) < 2) return false;
    const vertical = near((e.points[0] as Point).x, (e.points[1] as Point).x);
    return [e.from, e.to].some((id, i) => {
      const n = l.nodes.find((x) => x.id === id);
      const p = e.points[i] as Point;
      return n !== undefined && halfPortOf(vertical ? n.w : n.h, vertical ? p.x - n.x : p.y - n.y);
    });
  };
  for (const e of l.edges) {
    const name = `${e.from}->${e.to}`;
    const ends: Array<[Point | undefined, string]> = [[e.points[0], e.from], [e.points[e.points.length - 1], e.to]];
    if (bundled(e)) continue;
    for (const [p, id] of ends) {
      const n = l.nodes.find((x) => x.id === id);
      if (!p || !n) continue;
      const inX = p.x > n.x - 0.01 && p.x < n.x + n.w + 0.01;
      const inY = p.y > n.y - 0.01 && p.y < n.y + n.h + 0.01;
      const onV = (near(p.x, n.x) || near(p.x, n.x + n.w)) && inY;
      const onH = (near(p.y, n.y) || near(p.y, n.y + n.h)) && inX;
      if (!onV && !onH) {
        bad.push(`edge ${name} ends off the border of ${id}`);
        continue;
      }
      const off = onH ? p.x - n.x : p.y - n.y;
      const ends = endsOnSide.get(sideOfEnd(p, n) ?? '') ?? 0;
      if (!portOf(onH ? n.w : n.h, off) && !evenPortOf(onH ? n.w : n.h, off, ends)) bad.push(`edge ${name} ends off the ports of ${id}`);
    }
  }
  return bad;
}

/** How far the line of an edge stops short of the tip of its arrowhead. */
export const ARROW_TRIM = 8;

/** The tip of the arrowhead of an edge drawn with path data `d`: the end of the line plus the length the line stops short. */
export function tipOf(d: string): Point {
  const ends = (d.match(/[MLA][^MLA]*/g) ?? []).map((c) => {
    const n = c.slice(1).match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
    return { x: n[n.length - 2] ?? 0, y: n[n.length - 1] ?? 0 };
  });
  const last = ends[ends.length - 1] as Point;
  const prev = ends[ends.length - 2] as Point;
  const len = Math.hypot(last.x - prev.x, last.y - prev.y) || 1;
  return { x: last.x + ((last.x - prev.x) / len) * ARROW_TRIM, y: last.y + ((last.y - prev.y) / len) * ARROW_TRIM };
}
