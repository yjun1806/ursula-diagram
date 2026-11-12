import type { Ruler } from '../metrics.ts';
import { tightPasses } from './clearance.ts';
import type { Directions } from './sides.ts';
import { designatedSide, sideOfPoint } from './sides.ts';
import type { LayoutEdge, LayoutNode, Point } from '../types.ts';

const EPS = 1e-6;

/** Shortest leg an elbow may have in a pixel drawing: an arrowhead and a visible piece of line. */
const MIN_LEG = 24;

interface Box {
  o0: number;
  o1: number;
  l0: number;
  l1: number;
}

export interface Seg {
  ax: number;
  ay: number;
  bx: number;
  by: number;
}

export const segs = (points: Point[]): Seg[] => points.slice(1).map((q, i) => ({ ax: (points[i] as Point).x, ay: (points[i] as Point).y, bx: q.x, by: q.y }));

export function overlap(s: Seg, t: Seg): boolean {
  const sh = Math.abs(s.ay - s.by) < EPS;
  const th = Math.abs(t.ay - t.by) < EPS;
  if (sh !== th) return false;
  if (sh) return Math.abs(s.ay - t.ay) < EPS && Math.min(Math.max(s.ax, s.bx), Math.max(t.ax, t.bx)) - Math.max(Math.min(s.ax, s.bx), Math.min(t.ax, t.bx)) > EPS;
  return Math.abs(s.ax - t.ax) < EPS && Math.min(Math.max(s.ay, s.by), Math.max(t.ay, t.by)) - Math.max(Math.min(s.ay, s.by), Math.min(t.ay, t.by)) > EPS;
}

export const hits = (s: Seg, r: { x: number; y: number; w: number; h: number }): boolean =>
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
 * In a pixel drawing an edge whose other box stands wholly to one side of the first (along the axis the jog runs across)
 * may use a side when no edge end of the opposite direction is on it and at most two
 * ends are on it already, whatever else uses the face the jog leaves. Edges that leave (or enter) the same face of
 * a box and turn to the same side are changed together or not at all.
 * Returns the number of edges changed.
 */
export function useElbows(edges: LayoutEdge[], nodes: LayoutNode[], ruler: Ruler, td: boolean, directions?: Directions): number {
  if (ruler.sidePorts < 3 && !ruler.uniform) return 0;
  const byId = new Map(nodes.map((n) => [n.id, n] as const));
  const box = (n: LayoutNode): Box => (td ? { o0: n.y, o1: n.y + n.h, l0: n.x, l1: n.x + n.w } : { o0: n.x, o1: n.x + n.w, l0: n.y, l1: n.y + n.h });
  const phys = (o: number, l: number): Point => (td ? { x: l, y: o } : { x: o, y: l });
  const abstract = (p: Point): { o: number; l: number } => (td ? { o: p.y, l: p.x } : { o: p.x, l: p.y });
  const clear = ruler.trackGap / 2;
  type Abstract = ReturnType<typeof abstract>;
  interface Jog {
    u: LayoutNode;
    v: LayoutNode;
    p: [Abstract, Abstract, Abstract, Abstract];
  }
  /** The two nodes and the four corners of an edge that jogs, or nothing for any other edge. */
  const jogOf = (edge: LayoutEdge): Jog | undefined => {
    const u = byId.get(edge.from);
    const v = byId.get(edge.to);
    if (!u || !v || u === v || edge.points.length !== 4) return undefined;
    const p = edge.points.map(abstract) as Jog['p'];
    const [p0, p1, p2, p3] = p;
    if (Math.abs(p0.o - p1.o) > EPS || Math.abs(p1.l - p2.l) > EPS || Math.abs(p2.o - p3.o) > EPS || Math.abs(p1.o - p2.o) < EPS) return undefined;
    return { u, v, p };
  };
  const stepsOut = (b: Box, o: number): boolean => o > b.o1 + EPS || o < b.o0 - EPS;
  /** The whole second box stands clear of the first along the axis the jog runs across. */
  const apart = (u: LayoutNode, v: LayoutNode): boolean => {
    const bu = box(u);
    const bv = box(v);
    return bv.o0 >= bu.o1 - EPS || bv.o1 <= bu.o0 + EPS;
  };

  // Edges that share a face of a box and turn to the same side of it belong together; a pixel drawing changes such a set whole.
  // `ends[i]` names, for the edge at `i`, the face-and-side group of each end that has a side to turn to.
  const ends = edges.map((edge): { out?: string; in?: string } => {
    const jog = jogOf(edge);
    if (!jog || ruler.uniform || !apart(jog.u, jog.v)) return {};
    const [p0, , p2, p3] = jog.p;
    const bu = box(jog.u);
    const bv = box(jog.v);
    const fixed = (n: number): number => Math.round(n * 100);
    return {
      ...(stepsOut(bu, p2.o) ? { out: `${jog.u.id}|out|${fixed(p0.l)}|${p2.o > bu.o1 ? 1 : 0}` } : {}),
      ...(stepsOut(bv, p0.o) ? { in: `${jog.v.id}|in|${fixed(p3.l)}|${p0.o > bv.o1 ? 1 : 0}` } : {}),
    };
  });
  const groupSize = new Map<string, number>();
  const parent = edges.map((_, i) => i);
  const find = (i: number): number => ((parent[i] as number) === i ? i : (parent[i] = find(parent[i] as number)));
  const firstWith = new Map<string, number>();
  ends.forEach((e, i) => {
    for (const key of [e.out, e.in]) {
      if (key === undefined) continue;
      groupSize.set(key, (groupSize.get(key) ?? 0) + 1);
      const other = firstWith.get(key);
      if (other === undefined) firstWith.set(key, i);
      else parent[find(i)] = find(other);
    }
  });

  /** The best one-bend path for the edge at `index` against the edges as they are now, if any shape is free. */
  const plan = (index: number): Point[] | undefined => {
    const edge = edges[index] as LayoutEdge;
    const jog = jogOf(edge);
    if (!jog) return undefined;
    const { u, v } = jog;
    const [p0, , p2, p3] = jog.p;
    const bu = box(u);
    const bv = box(v);
    // Only a pixel edge whose other end stands wholly to one side takes the side rule; any other edge keeps the old one.
    const fresh = !ruler.uniform && apart(u, v);
    const candidates: Array<{ path: Point[]; side: Point }> = [];
    // Positions on a side of a box along the layer axis, most wanted first. A terminal box has one port per text line
    // (per cell on a side that runs across the lines); the title line is the last choice, since a flat edge between neighbours uses the middle.
    // An end may leave the side its direction asks for only when no other edge of that node looks the same way,
    // unless the other box stands wholly to one side: then it may use a side that has no end of the opposite direction and at most two ends already.
    const may = (node: LayoutNode, other: LayoutNode, at: Point, outgoing: boolean): boolean => {
      if (!fresh) {
        if (!directions) return true;
        const wanted = designatedSide(node, other, directions);
        if (sideOfPoint(node, at) === wanted) return true;
        const same = edges.filter((e) => {
          const a = byId.get(e.from);
          const b = byId.get(e.to);
          if (!a || !b || a === b) return false;
          return (a === node && designatedSide(a, b, directions) === wanted) || (b === node && designatedSide(b, a, directions) === wanted);
        });
        return same.length <= 1;
      }
      if (directions && sideOfPoint(node, at) === designatedSide(node, other, directions)) return true;
      const border = abstract(at).o;
      const b = box(node);
      let leaving = 0;
      let entering = 0;
      edges.forEach((e, i) => {
        if (i === index) return;
        const ends: Array<[Point | undefined, string, boolean]> = [[e.points[0], e.from, true], [e.points[e.points.length - 1], e.to, false]];
        for (const [q, id, leaves] of ends) {
          if (!q || id !== node.id) continue;
          const a = abstract(q);
          if (Math.abs(a.o - border) < EPS && a.l >= b.l0 - EPS && a.l <= b.l1 + EPS) {
            if (leaves) leaving++;
            else entering++;
          }
        }
      });
      return (outgoing ? entering : leaving) === 0 && leaving + entering <= 2;
    };
    // A side no other edge ends on takes the edge at its centre (the left or upper cell where two share the middle).
    // In a pixel drawing an edge that is changed together with others turning to the same side does not take the centre.
    const sole = (node: LayoutNode, border: number, group: string | undefined): boolean =>
      (group === undefined || (groupSize.get(group) ?? 1) <= 1) &&
      !edges.some((e, i) => i !== index && [e.points[0], e.points[e.points.length - 1]].some((q) => {
        if (!q) return false;
        const a = abstract(q);
        const b = box(node);
        return Math.abs(a.o - border) < EPS && a.l >= b.l0 - EPS && a.l <= b.l1 + EPS;
      }));
    const ports = (b: Box, toward: number, from: number, alone: boolean): number[] => {
      if (alone) return [ruler.uniform ? b.l0 + Math.floor((b.l1 - b.l0 - 1) / 2) + 0.5 : (b.l0 + b.l1) / 2];
      if (!ruler.uniform) return [b.l0 + (b.l1 - b.l0) * (toward > from ? 0.75 : 0.25)];
      const cells = Array.from({ length: Math.max(0, Math.floor(b.l1 - b.l0) - 2) }, (_, k) => b.l0 + 1 + k + 0.5);
      const ordered = td ? cells.sort((x, y) => Math.abs(x - (b.l0 + (b.l1 - b.l0) * (toward > from ? 0.75 : 0.25))) - Math.abs(y - (b.l0 + (b.l1 - b.l0) * (toward > from ? 0.75 : 0.25)))) : toward > from ? [...cells.slice(1)].reverse().concat(cells.slice(0, 1)) : [...cells.slice(1), ...cells.slice(0, 1)];
      return ordered;
    };
    // A box that stands wholly to one side is reached through the face the header's reading direction points to (out of the
    // first box) or comes from (into the second); a pixel drawing offers no other face for it.
    const reading = directions === undefined ? undefined : (directions.stages ? directions.td : !directions.td) ? 'LR' : 'TD';
    const allowed = (node: LayoutNode, at: Point, leaving: boolean): boolean =>
      !fresh || reading === undefined || sideOfPoint(node, at) === (reading === 'LR' ? (leaving ? 'right' : 'left') : leaving ? 'bottom' : 'top');
    // Out of the side of the first box.
    if (stepsOut(bu, p2.o)) {
      for (const ls of ports(bu, p3.l, p0.l, sole(u, p2.o > bu.o1 ? bu.o1 : bu.o0, ends[index]?.out))) {
        const path = [phys(p2.o > bu.o1 ? bu.o1 : bu.o0, ls), phys(p2.o, ls), phys(p3.o, p3.l)];
        if (!allowed(u, path[0] as Point, true) || !may(u, v, path[0] as Point, true)) continue;
        candidates.push({ path, side: path[0] as Point });
      }
    }
    // Into the side of the second box.
    if (stepsOut(bv, p0.o)) {
      for (const lt of ports(bv, p0.l, p3.l, sole(v, p0.o > bv.o1 ? bv.o1 : bv.o0, ends[index]?.in))) {
        const path = [phys(p0.o, p0.l), phys(p0.o, lt), phys(p0.o > bv.o1 ? bv.o1 : bv.o0, lt)];
        if (!allowed(v, path[2] as Point, false) || !may(v, u, path[2] as Point, false)) continue;
        candidates.push({ path, side: path[2] as Point });
      }
    }
    const others = edges.filter((_, i) => i !== index);
    const otherSegs = others.map((e) => segs(e.points));
    const taken = (point: Point): boolean =>
      others.some((e) => [e.points[0], e.points[e.points.length - 1]].some((q) => q !== undefined && Math.abs(q.x - point.x) < EPS && Math.abs(q.y - point.y) < EPS));
    const before = crossings(segs(edge.points), otherSegs);
    const tightBefore = !fresh ? 0 : tightPasses({ nodes, edges: [edge] });
    let best: Point[] | undefined;
    for (const { path, side } of candidates) {
      // The end on a side must be a port nobody else uses; the other end keeps the port the edge had.
      if (taken(side)) continue;
      const mine = segs(path);
      // Each leg stays long enough to read as a line with its arrowhead.
      if (!ruler.uniform && mine.some((s) => Math.abs(s.bx - s.ax) + Math.abs(s.by - s.ay) < MIN_LEG)) continue;
      if (mine.some((s) => nodes.some((n) => (n === u || n === v ? hits(s, n) : hits(s, { x: n.x - clear, y: n.y - clear, w: n.w + 2 * clear, h: n.h + 2 * clear }))))) continue;
      if (otherSegs.some((o) => o.some((t) => mine.some((s) => overlap(s, t))))) continue;
      if (crossings(mine, otherSegs) > before) continue;
      if (fresh && tightPasses({ nodes, edges: [{ ...edge, points: path }] }) > tightBefore) continue;
      if (!best || length(path) < length(best) - EPS) best = path;
    }
    return best;
  };

  const reach = (i: number): number => {
    const jog = jogOf(edges[i] as LayoutEdge);
    return jog ? Math.abs(jog.p[3].l - jog.p[0].l) : 0;
  };

  let changed = 0;
  const done = new Set<number>();
  edges.forEach((_, index) => {
    if (done.has(index)) return;
    // The nearer the other end, the nearer the facing face of the box its port on the side.
    const members = edges.map((__, i) => i).filter((i) => find(i) === find(index)).sort((a, b) => reach(a) - reach(b) || a - b);
    members.forEach((i) => done.add(i));
    const saved = members.map((i) => ({ points: (edges[i] as LayoutEdge).points, elbow: (edges[i] as LayoutEdge).elbow }));
    let all = true;
    for (const i of members) {
      const path = plan(i);
      if (!path) {
        all = false;
        break;
      }
      const edge = edges[i] as LayoutEdge;
      edge.points = path;
      edge.elbow = true;
    }
    if (all) {
      changed += members.length;
      return;
    }
    members.forEach((i, k) => {
      const edge = edges[i] as LayoutEdge;
      const before = saved[k] as { points: Point[]; elbow: boolean | undefined };
      edge.points = before.points;
      if (before.elbow === undefined) delete edge.elbow;
      else edge.elbow = before.elbow;
    });
  });
  return changed;
}
