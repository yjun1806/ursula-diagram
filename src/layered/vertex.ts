import type { Ruler } from '../metrics.ts';
import type { Diagnostic, LayoutEdge, LayoutNode, Point } from '../types.ts';
import { PASS_CLEAR, tightPasses } from './clearance.ts';
import { hits, overlap, properCross, segs } from './elbows.ts';
import type { Seg } from './elbows.ts';
import type { Face } from './ports.ts';
import { centreOnly, faceOffsets, portShape } from './ports.ts';
import { stats } from './stats.ts';

const EPS = 1e-6;

/** Pixels: a point within this distance of the border of a box is on it. */
const ON_FACE = 0.5;

/** Shortest first leg (out of the face) and last leg (into the other box) of a line drawn again. */
const LEG = 16;

/** Pixels: two ends this close on one face share a port. */
const PORT_APART = 8;

/** Pixels: lines of a path are looked for this far around the two ends before the whole drawing is searched. */
const WINDOW = 96;

/** A count made the first time it is asked for. */
const once = (count: () => number): (() => number) => {
  let made: number | undefined;
  return () => (made ??= count());
};

const FACES: readonly Face[] = ['top', 'bottom', 'left', 'right'];

const NORMAL: Record<Face, Point> = { top: { x: 0, y: -1 }, bottom: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };

const OPPOSITE: Record<Face, Face> = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };

const horizontal = (face: Face): boolean => face === 'top' || face === 'bottom';

const centreX = (n: LayoutNode): number => n.x + n.w / 2;
const centreY = (n: LayoutNode): number => n.y + n.h / 2;

const tidy = (v: number): number => Math.round(v * 1e6) / 1e6;

/** The face of a box the point lies on. */
function faceAt(n: LayoutNode, p: Point): Face | undefined {
  const inX = p.x > n.x - ON_FACE && p.x < n.x + n.w + ON_FACE;
  const inY = p.y > n.y - ON_FACE && p.y < n.y + n.h + ON_FACE;
  if (inX && Math.abs(p.y - n.y) < ON_FACE) return 'top';
  if (inX && Math.abs(p.y - n.y - n.h) < ON_FACE) return 'bottom';
  if (inY && Math.abs(p.x - n.x) < ON_FACE) return 'left';
  if (inY && Math.abs(p.x - n.x - n.w) < ON_FACE) return 'right';
  return undefined;
}

/** The middle of a face. */
function centreOf(n: LayoutNode, face: Face): Point {
  return face === 'top' ? { x: centreX(n), y: n.y } : face === 'bottom' ? { x: centreX(n), y: n.y + n.h } : face === 'left' ? { x: n.x, y: centreY(n) } : { x: n.x + n.w, y: centreY(n) };
}

/** One end of an edge on a node. `first` is the start of the line (the edge leaves the node there). */
interface End {
  index: number;
  edge: LayoutEdge;
  first: boolean;
  node: LayoutNode;
  other: LayoutNode;
  face: Face;
}

const pointOf = (e: End): Point => (e.first ? (e.edge.points[0] as Point) : (e.edge.points[e.edge.points.length - 1] as Point));

/** Along the face: how far the end is from the middle of the face. */
const offCentre = (e: End): number => {
  const p = pointOf(e);
  return horizontal(e.face) ? Math.abs(p.x - centreX(e.node)) : Math.abs(p.y - centreY(e.node));
};

/** Along the face: how far the middle of the box at the other end is from the middle of the face. */
const lean = (e: End): number => (horizontal(e.face) ? Math.abs(centreX(e.other) - centreX(e.node)) : Math.abs(centreY(e.other) - centreY(e.node)));

const apart = (e: End): number => Math.hypot(centreX(e.other) - centreX(e.node), centreY(e.other) - centreY(e.node));

/** A way to draw an edge end again: the path, the lines of other edges it crosses, its bends and its length. */
interface Way {
  path: Point[];
  crossings: number;
  bends: number;
  /** Pieces of the path that run beside a box it does not end on, nearer than PASS_CLEAR; counted when first asked. */
  tight: () => number;
  length: number;
}

export interface Settled {
  /** Edge ends moved to another face or onto the middle of their face. */
  moved: number;
  diagnostics: Diagnostic[];
}

/**
 * The tools both vertex steps share: the ends of a node, a path drawn again, the best free face for an end. `moved` counts the ends drawn again.
 * With `roomy`, bends may also stand where they keep the room a passing line keeps from a box (PASS_CLEAR), and of two
 * ways with as many crossings and bends the one that passes fewer boxes nearer than that wins before the shorter one.
 */
function kit(edges: LayoutEdge[], nodes: LayoutNode[], ruler: Ruler, step: number, roomy = false) {
  const closer = (a: Way, b: Way): boolean => (roomy && a.tight() !== b.tight() ? a.tight() < b.tight() : a.length < b.length - EPS);
  const byId = new Map(nodes.map((n) => [n.id, n] as const));
  const clear = ruler.trackGap / 2;
  const grid = ruler.edgeGrid;
  let moved = 0;

  const endsOf = (node: LayoutNode): End[] => {
    const out: End[] = [];
    edges.forEach((edge, index) => {
      if (edge.points.length < 2) return;
      for (const first of [true, false]) {
        const [mine, theirs] = first ? [edge.from, edge.to] : [edge.to, edge.from];
        const other = byId.get(theirs);
        if (mine !== node.id || !other) continue;
        const face = faceAt(node, first ? (edge.points[0] as Point) : (edge.points[edge.points.length - 1] as Point));
        if (face) out.push({ index, edge, first, node, other, face });
      }
    });
    return out;
  };

  /** Coordinates a bend may take on one axis, on the edge grid. */
  const lines = (axis: 'x' | 'y', c: Point, n: Point, q: Point, m: Point, near: boolean): number[] => {
    const down = (v: number): number => Math.floor(v / grid + EPS) * grid;
    const up = (v: number): number => Math.ceil(v / grid - EPS) * grid;
    const vals = new Set<number>();
    const edgesOf: number[] = [];
    for (const b of nodes) {
      const [a0, a1] = axis === 'x' ? [b.x, b.x + b.w] : [b.y, b.y + b.h];
      vals.add(down(a0 - clear));
      vals.add(up(a1 + clear));
      if (roomy) {
        vals.add(down(a0 - PASS_CLEAR));
        vals.add(up(a1 + PASS_CLEAR));
      }
      edgesOf.push(a0, a1);
    }
    edgesOf.sort((a, b) => a - b);
    for (let i = 0; i + 1 < edgesOf.length; i++) {
      const u = edgesOf[i] as number;
      const v = edgesOf[i + 1] as number;
      if (v - u >= 2 * grid) vals.add(Math.round((u + v) / 2 / grid) * grid);
    }
    const [ca, qa, na, ma] = axis === 'x' ? [c.x, q.x, n.x, m.x] : [c.y, q.y, n.y, m.y];
    if (na !== 0) vals.add(na > 0 ? up(ca + LEG) : down(ca - LEG));
    if (ma !== 0) vals.add(ma > 0 ? up(qa + LEG) : down(qa - LEG));
    vals.add(Math.round((ca + qa) / 2 / grid) * grid);
    const lo = Math.min(ca, qa) - WINDOW;
    const hi = Math.max(ca, qa) + WINDOW;
    return [...vals].filter((v) => !near || (v >= lo && v <= hi)).sort((a, b) => a - b);
  };

  /** The paths with `bends` bends from `c` (leaving square to `n`) to `q` (arrived at square to `m`), the free coordinates taken from `xs` and `ys`. */
  const shapes = (bends: number, c: Point, n: Point, q: Point, m: Point, xs: number[], ys: number[]): Point[][] => {
    const sameAxis = n.x * m.x + n.y * m.y !== 0;
    const out: Point[][] = [];
    if (bends === 0) {
      if (sameAxis && (n.y !== 0 ? Math.abs(c.x - q.x) < EPS : Math.abs(c.y - q.y) < EPS)) out.push([c, q]);
    } else if (bends === 1 && !sameAxis) {
      out.push([c, n.y === 0 ? { x: q.x, y: c.y } : { x: c.x, y: q.y }, q]);
    } else if (bends === 2 && sameAxis) {
      if (n.y !== 0) for (const y of ys) out.push([c, { x: c.x, y }, { x: q.x, y }, q]);
      else for (const x of xs) out.push([c, { x, y: c.y }, { x, y: q.y }, q]);
    } else if (bends === 3 && !sameAxis) {
      if (n.y === 0) for (const a of xs) for (const b of ys) out.push([c, { x: a, y: c.y }, { x: a, y: b }, { x: q.x, y: b }, q]);
      else for (const a of ys) for (const b of xs) out.push([c, { x: c.x, y: a }, { x: b, y: a }, { x: b, y: q.y }, q]);
    }
    return out;
  };

  /** Every sound path with 0 to 3 bends from the face point `c` of `end.node` to the other end of the edge; the ones near the two ends, or the whole drawing when none of those is sound. A path that crosses more lines than `limit` or than a path found before it is counted with a number above that, not exactly. Paths with more bends than one that crosses no line are left out. */
  const waysFor = (end: End, face: Face, c: Point, limit = Infinity, far?: { at: Point; face: Face }): Way[] => {
    let cap = limit;
    const pts = end.edge.points;
    const q = far?.at ?? (end.first ? (pts[pts.length - 1] as Point) : (pts[0] as Point));
    const qFace = far?.face ?? faceAt(end.other, q);
    if (!qFace) return [];
    const n = NORMAL[face];
    const m = NORMAL[qFace];
    const levels: Seg[] = [];
    const uprights: Seg[] = [];
    for (const e of edges) if (e !== end.edge) for (const t of segs(e.points)) (Math.abs(t.ay - t.by) < EPS ? levels : uprights).push(t);
    const level = (s: Seg): boolean => Math.abs(s.ay - s.by) < EPS;
    const walls = nodes.map((b) => (b === end.node || b === end.other ? b : { ...b, x: b.x - clear, y: b.y - clear, w: b.w + 2 * clear, h: b.h + 2 * clear }));
    const run = (s: Seg): number => Math.abs(s.bx - s.ax) + Math.abs(s.by - s.ay);
    const sound = (path: Point[]): boolean => {
      const p0 = path[0] as Point;
      const p1 = path[1] as Point;
      const pe = path[path.length - 1] as Point;
      const pd = path[path.length - 2] as Point;
      if (Math.abs(p1.x - p0.x) + Math.abs(p1.y - p0.y) < LEG - EPS || (p1.x - p0.x) * n.x + (p1.y - p0.y) * n.y <= 0) return false;
      if (Math.abs(pe.x - pd.x) + Math.abs(pe.y - pd.y) < LEG - EPS || (pe.x - pd.x) * m.x + (pe.y - pd.y) * m.y >= 0) return false;
      const mine = segs(path);
      for (const s of mine) {
        if (run(s) < grid - EPS) return false;
        for (const b of walls) if (hits(s, b)) return false;
      }
      for (const s of mine) for (const t of level(s) ? levels : uprights) if (overlap(s, t)) return false;
      for (let i = 0; i < mine.length; i++) for (let j = i + 2; j < mine.length; j++) if (overlap(mine[i] as Seg, mine[j] as Seg)) return false;
      return true;
    };
    const length = (path: Point[]): number => segs(path).reduce((sum, s) => sum + run(s), 0);
    const tightness = (path: Point[]): number => tightPasses({ nodes, edges: [{ ...end.edge, points: path }] });
    const crossings = (path: Point[]): number => {
      let count = 0;
      for (const s of segs(path)) {
        for (const t of level(s) ? uprights : levels) if (properCross(s, t)) count++;
        if (count > cap) return count;
      }
      return count;
    };
    for (const near of [true, false]) {
      const xs = lines('x', c, n, q, m, near);
      const ys = lines('y', c, n, q, m, near);
      const found: Way[] = [];
      // The first and the last line of a three-bend path depend on one coordinate each: those that fail alone are not paired.
      const leg = (from: Point, to: Point, normal: Point, sign: 1 | -1): boolean => {
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const run = Math.abs(dx) + Math.abs(dy);
        if (run < LEG - EPS || run < grid - EPS || (dx * normal.x + dy * normal.y) * sign <= 0) return false;
        const s: Seg = { ax: from.x, ay: from.y, bx: to.x, by: to.y };
        return !walls.some((b) => hits(s, b));
      };
      const starts = n.y === 0 ? xs.filter((a) => leg(c, { x: a, y: c.y }, n, 1)) : ys.filter((a) => leg(c, { x: c.x, y: a }, n, 1));
      const stops = n.y === 0 ? ys.filter((b) => leg({ x: q.x, y: b }, q, m, -1)) : xs.filter((b) => leg({ x: b, y: q.y }, q, m, -1));
      for (let bends = 0; bends <= 3; bends++) {
        const [pxs, pys] = bends < 3 ? [xs, ys] : n.y === 0 ? [starts, stops] : [stops, starts];
        for (const path of shapes(bends, c, n, q, m, pxs, pys)) {
          if (!sound(path)) continue;
          const tidied = path.map((p) => ({ x: tidy(p.x), y: tidy(p.y) }));
          const crossed = crossings(tidied);
          cap = Math.min(cap, crossed);
          found.push({ path: tidied, crossings: crossed, bends, tight: once(() => tightness(tidied)), length: length(path) });
        }
        // A path with more bends never beats one that crosses nothing.
        if (found.some((w) => w.crossings === 0)) break;
      }
      if (found.length > 0) return found;
    }
    return [];
  };

  /** The path with the fewest bends, the shortest of those, from the face point `c` of `end.node` to the other end of the edge, or nothing. */
  const pathFor = (end: End, face: Face, c: Point): Point[] | undefined => {
    let best: Way | undefined;
    for (const way of waysFor(end, face, c)) if (!best || way.bends < best.bends || (way.bends === best.bends && closer(way, best))) best = way;
    return best?.path;
  };

  const apply = (end: End, path: Point[]): void => {
    end.edge.points = end.first ? path : [...path].reverse();
    delete end.edge.elbow;
    moved++;
    stats.moved.set(end.edge, (stats.moved.get(end.edge) ?? 0) + 1);
  };

  const redraw = (end: End, face: Face, c: Point): boolean => {
    const path = pathFor(end, face, c);
    if (!path) return false;
    apply(end, path);
    return true;
  };

  /** A free port of `face`: the port of its shape nearest the middle that no end of `node` is within PORT_APART of, or nothing when an end of the opposite direction is there. */
  const freePort = (node: LayoutNode, face: Face, end: End): Point | undefined => {
    const here = endsOf(node).filter((e) => e.face === face && !(e.edge === end.edge && e.first === end.first));
    if (here.some((e) => e.first !== end.first)) return undefined;
    const [length, across, origin] = horizontal(face) ? [node.w, node.h, node.x] : [node.h, node.w, node.y];
    const slots = faceOffsets(node.shape, face, length, across, step, here.length + 1, false)
      .map((o) => origin + o)
      .filter((at) => here.every((e) => Math.abs((horizontal(face) ? pointOf(e).x : pointOf(e).y) - at) >= PORT_APART - EPS))
      .sort((a, b) => Math.abs(a - origin - length / 2) - Math.abs(b - origin - length / 2) || a - b);
    const at = slots[0];
    if (at === undefined) return undefined;
    const c = centreOf(node, face);
    return horizontal(face) ? { x: at, y: c.y } : { x: c.x, y: at };
  };

  /** The faces an end may move to, most wanted first: the side faces (the one the other box lies towards first), then the face across. */
  const targets = (end: End): Face[] => {
    const d = horizontal(end.face) ? centreX(end.other) - centreX(end.node) : centreY(end.other) - centreY(end.node);
    const [toward, away]: [Face, Face] = horizontal(end.face) ? ['right', 'left'] : ['bottom', 'top'];
    return d < -EPS ? [away, toward, OPPOSITE[end.face]] : [toward, away, OPPOSITE[end.face]];
  };

  /** Of the paths from every free face of an end, the one that crosses the fewest lines, then bends least, then is shortest; the face met first wins a tie. */
  const bestWay = (end: End, limit = Infinity): Way | undefined => {
    let best: Way | undefined;
    for (const face of targets(end)) {
      const c = freePort(end.node, face, end);
      if (!c) continue;
      for (const way of waysFor(end, face, c, Math.min(limit, best?.crossings ?? Infinity))) {
        if (!best || way.crossings < best.crossings || (way.crossings === best.crossings && (way.bends < best.bends || (way.bends === best.bends && closer(way, best))))) best = way;
      }
    }
    return best;
  };

  /**
   * As `bestWay`, with the other end of the edge moved too: every free face of the box at the other end that the edge
   * does not stand on yet is tried against every free face of this one.
   */
  const bestWayBoth = (end: End, limit = Infinity, sameFace = false): Way | undefined => {
    const pts = end.edge.points;
    const q = end.first ? (pts[pts.length - 1] as Point) : (pts[0] as Point);
    const held = faceAt(end.other, q);
    if (!held) return undefined;
    const farEnd: End = { index: end.index, edge: end.edge, first: !end.first, node: end.other, other: end.node, face: held };
    let best: Way | undefined;
    for (const face of targets(end)) {
      const c = freePort(end.node, face, end);
      if (!c) continue;
      for (const farFace of FACES) {
        if (farFace === held && !sameFace) continue;
        const at = freePort(end.other, farFace, farEnd);
        if (!at) continue;
        for (const way of waysFor(end, face, c, Math.min(limit, best?.crossings ?? Infinity), { at, face: farFace })) {
          if (!best || way.crossings < best.crossings || (way.crossings === best.crossings && (way.bends < best.bends || (way.bends === best.bends && closer(way, best))))) best = way;
        }
      }
    }
    return best;
  };

  return { endsOf, redraw, apply, bestWay, bestWayBoth, moved: (): number => moved };
}

/**
 * Pixel drawings: a face of a box that has only its middle for a port (the four faces of a diamond, the left and
 * right faces of a stadium, a hexagon and a parallelogram) takes one edge end. Of the ends that meet on such a face
 * the one that stays is a straight line or else the one whose other box lies nearest the middle of the face; it
 * is put at the middle. The others move to a side face of the node and are drawn again from there, with at least
 * LEG pixels out of the face and square into the face of the box at the other end. Every free face is tried; of all
 * the paths that hold, the one that crosses the fewest other lines wins, then the one with fewest bends, then the
 * shortest, then the face met first. An end that finds no free face or no path keeps the middle of its face with
 * the end that stays, and a `shared-port` diagnostic says so.
 * The edges are changed in place.
 */
export function settleVertices(edges: LayoutEdge[], nodes: LayoutNode[], ruler: Ruler, step: number): Settled {
  const diagnostics: Diagnostic[] = [];
  if (ruler.uniform) return { moved: 0, diagnostics };
  const { endsOf, redraw, apply, bestWay, moved } = kit(edges, nodes, ruler, step);
  for (const node of nodes) {
    const kind = portShape(node.shape);
    if (!(kind === 'diamond' || kind === 'stadium' || kind === 'hexagon' || kind === 'parallelogram')) continue;
    let shared = 0;
    const sharedFaces: Face[] = [];
    for (const face of FACES) {
      if (!centreOnly(node.shape, face)) continue;
      const ends = endsOf(node).filter((e) => e.face === face);
      if (ends.length < 2) continue;
      const straight = ends.find((e) => e.edge.points.length === 2);
      const keeper = straight ?? [...ends].sort((a, b) => lean(a) - lean(b) || a.index - b.index)[0];
      if (!keeper) continue;
      if (offCentre(keeper) > ON_FACE) redraw(keeper, face, centreOf(node, face));
      const rest = ends.filter((e) => e !== keeper).sort((a, b) => apart(a) - apart(b) || a.index - b.index);
      let stuck = false;
      for (const end of rest) {
        const way = bestWay(end);
        if (way) apply(end, way.path);
        else stuck = true;
      }
      if (stuck) {
        shared++;
        sharedFaces.push(face);
      }
    }
    if (shared > 0) {
      diagnostics.push({ kind: 'shared-port', nodes: [node.id], message: `Edge ends meet at the ${sharedFaces.join(' and ')} of the ${node.shape} ${node.id}: its sides have room for one end each.` });
    }
  }
  return { moved: moved(), diagnostics };
}

/**
 * Pixel drawings: a face of a box that takes the start of one edge and the end of another is a mixed face. Each
 * incoming end on it, in the order of the edges, is drawn again from a face of the node that holds no end or only
 * incoming ends, with the same search as settleVertices (the face is free when its shape has a port left). Of all
 * the paths that hold the one that crosses the fewest other lines wins, then the one with fewest bends, then the
 * shortest. When that path crosses more lines than the path the end has, has more than 2 bends beyond it, or when
 * none holds, the other end of the edge may move to a free face of its box as well: such a path is taken when it
 * crosses no more lines and has no more bends than the path the end has. Otherwise the end stays where it is. The
 * edges are changed in place.
 */
export function settleMixedSides(edges: LayoutEdge[], nodes: LayoutNode[], ruler: Ruler, step: number): Settled {
  if (ruler.uniform) return { moved: 0, diagnostics: [] };
  const { endsOf, apply, bestWay, bestWayBoth, moved } = kit(edges, nodes, ruler, step, true);
  const crossing = (edge: LayoutEdge): number => {
    const mine = segs(edge.points);
    return edges.reduce((sum, e) => (e === edge ? sum : sum + segs(e.points).reduce((k, t) => k + mine.filter((s) => properCross(s, t)).length, 0)), 0);
  };
  for (const node of nodes) {
    for (const face of FACES) {
      const onFace = (): End[] => endsOf(node).filter((e) => e.face === face && e.edge.from !== e.edge.to);
      for (const end of onFace().filter((e) => !e.first).sort((a, b) => a.index - b.index)) {
        if (!onFace().some((e) => e.first)) break;
        const had = crossing(end.edge);
        const bends = Math.max(0, end.edge.points.length - 2);
        const way = bestWay(end, had);
        if (way && way.crossings <= had && way.bends <= bends + 2) {
          // A way that passes a box too near may move its other end too, on any face of its box, when that passes fewer.
          const roomier = way.tight() > 0 ? bestWayBoth(end, way.crossings, true) : undefined;
          apply(end, roomier && roomier.crossings <= way.crossings && roomier.bends <= way.bends && roomier.tight() < way.tight() ? roomier.path : way.path);
          continue;
        }
        // No face of this box alone serves: the line may leave the other box by another face, as long as it bends no more than it did.
        const both = bestWayBoth(end, had);
        if (both && both.crossings <= had && both.bends <= bends) apply(end, both.path);
      }
    }
  }
  return { moved: moved(), diagnostics: [] };
}
