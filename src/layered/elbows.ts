import type { Ruler } from '../metrics.ts';
import type { LayoutEdge, LayoutNode, Point } from '../types.ts';

const EPS = 1e-6;

interface Box {
  o0: number;
  o1: number;
  l0: number;
  l1: number;
}

interface Seg {
  ax: number;
  ay: number;
  bx: number;
  by: number;
}

const segs = (points: Point[]): Seg[] => points.slice(1).map((q, i) => ({ ax: (points[i] as Point).x, ay: (points[i] as Point).y, bx: q.x, by: q.y }));

function overlap(s: Seg, t: Seg): boolean {
  const sh = Math.abs(s.ay - s.by) < EPS;
  const th = Math.abs(t.ay - t.by) < EPS;
  if (sh !== th) return false;
  if (sh) return Math.abs(s.ay - t.ay) < EPS && Math.min(Math.max(s.ax, s.bx), Math.max(t.ax, t.bx)) - Math.max(Math.min(s.ax, s.bx), Math.min(t.ax, t.bx)) > EPS;
  return Math.abs(s.ax - t.ax) < EPS && Math.min(Math.max(s.ay, s.by), Math.max(t.ay, t.by)) - Math.max(Math.min(s.ay, s.by), Math.min(t.ay, t.by)) > EPS;
}

const hits = (s: Seg, r: { x: number; y: number; w: number; h: number }): boolean =>
  Math.min(s.ax, s.bx) < r.x + r.w - EPS && Math.max(s.ax, s.bx) > r.x + EPS && Math.min(s.ay, s.by) < r.y + r.h - EPS && Math.max(s.ay, s.by) > r.y + EPS;

function properCross(a: Seg, b: Seg): boolean {
  const ah = Math.abs(a.ay - a.by) < EPS;
  const bh = Math.abs(b.ay - b.by) < EPS;
  if (ah === bh) return false;
  const [h, v] = ah ? [a, b] : [b, a];
  return v.ax > Math.min(h.ax, h.bx) + EPS && v.ax < Math.max(h.ax, h.bx) - EPS && h.ay > Math.min(v.ay, v.by) + EPS && h.ay < Math.max(v.ay, v.by) - EPS;
}

/** Crossings of one line with a set of other lines. */
const crossings = (mine: Seg[], others: Seg[][]): number => others.reduce((n, o) => n + mine.reduce((m, s) => m + o.filter((t) => properCross(s, t)).length, 0), 0);

const length = (points: Point[]): number => segs(points).reduce((n, s) => n + Math.abs(s.bx - s.ax) + Math.abs(s.by - s.ay), 0);

/**
 * Edges between two layers that jog (down, across, down) may leave through the side of a box instead: one
 * bend, either out of the side of the first box and into the top or bottom of the second, or out of the top or
 * bottom of the first and into the side of the second. Edges are taken in the order of the text, one at a
 * time; a shape is used only when nothing is in its way, no port is shared, and no crossing is added.
 * Returns the number of edges changed.
 */
export function useElbows(edges: LayoutEdge[], nodes: LayoutNode[], ruler: Ruler, td: boolean): number {
  if (ruler.sidePorts < 3) return 0;
  const byId = new Map(nodes.map((n) => [n.id, n] as const));
  const box = (n: LayoutNode): Box => (td ? { o0: n.y, o1: n.y + n.h, l0: n.x, l1: n.x + n.w } : { o0: n.x, o1: n.x + n.w, l0: n.y, l1: n.y + n.h });
  const phys = (o: number, l: number): Point => (td ? { x: l, y: o } : { x: o, y: l });
  const abstract = (p: Point): { o: number; l: number } => (td ? { o: p.y, l: p.x } : { o: p.x, l: p.y });
  const clear = ruler.trackGap / 2;
  let changed = 0;
  edges.forEach((edge, index) => {
    const u = byId.get(edge.from);
    const v = byId.get(edge.to);
    if (!u || !v || u === v || edge.points.length !== 4) return;
    const [p0, p1, p2, p3] = edge.points.map(abstract) as [ReturnType<typeof abstract>, ReturnType<typeof abstract>, ReturnType<typeof abstract>, ReturnType<typeof abstract>];
    if (Math.abs(p0.o - p1.o) > EPS || Math.abs(p1.l - p2.l) > EPS || Math.abs(p2.o - p3.o) > EPS || Math.abs(p1.o - p2.o) < EPS) return;
    const bu = box(u);
    const bv = box(v);
    const candidates: Array<{ path: Point[]; side: Point }> = [];
    // Out of the side of the first box.
    if (p2.o > bu.o1 + EPS || p2.o < bu.o0 - EPS) {
      const ls = bu.l0 + (bu.l1 - bu.l0) * (p3.l > p0.l ? 0.75 : 0.25);
      const path = [phys(p2.o > bu.o1 ? bu.o1 : bu.o0, ls), phys(p2.o, ls), phys(p3.o, p3.l)];
      candidates.push({ path, side: path[0] as Point });
    }
    // Into the side of the second box.
    if (p0.o > bv.o1 + EPS || p0.o < bv.o0 - EPS) {
      const lt = bv.l0 + (bv.l1 - bv.l0) * (p0.l < p3.l ? 0.25 : 0.75);
      const path = [phys(p0.o, p0.l), phys(p0.o, lt), phys(p0.o > bv.o1 ? bv.o1 : bv.o0, lt)];
      candidates.push({ path, side: path[2] as Point });
    }
    const others = edges.filter((_, i) => i !== index);
    const otherSegs = others.map((e) => segs(e.points));
    const taken = (point: Point): boolean =>
      others.some((e) => [e.points[0], e.points[e.points.length - 1]].some((q) => q !== undefined && Math.abs(q.x - point.x) < EPS && Math.abs(q.y - point.y) < EPS));
    const before = crossings(segs(edge.points), otherSegs);
    let best: Point[] | undefined;
    for (const { path, side } of candidates) {
      // The end on a side must be a port nobody else uses; the other end keeps the port the edge had.
      if (taken(side)) continue;
      const mine = segs(path);
      if (mine.some((s) => nodes.some((n) => (n === u || n === v ? hits(s, n) : hits(s, { x: n.x - clear, y: n.y - clear, w: n.w + 2 * clear, h: n.h + 2 * clear }))))) continue;
      if (otherSegs.some((o) => o.some((t) => mine.some((s) => overlap(s, t))))) continue;
      if (crossings(mine, otherSegs) > before) continue;
      if (!best || length(path) < length(best) - EPS) best = path;
    }
    if (best) {
      edge.points = best;
      edge.elbow = true;
      changed++;
    }
  });
  return changed;
}
