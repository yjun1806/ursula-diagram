import type { Ruler } from '../metrics.ts';
import type { EdgeStyle, Layout, LayoutEdge, Point } from '../types.ts';
import type { LabelSize, Rect, Segment } from '../layout/labels.ts';
import { overlaps } from '../layout/labels.ts';
import { edgeNear } from '../layout/place.ts';
import { ARROW, lineBeside } from './label-room.ts';

/** Least distance a label keeps from the line of another edge. */
export const LINE_CLEAR = 12;
/** Least gap a label keeps from another label. */
export const LABEL_CLEAR = 8;
/** Distance between two candidate places along a segment. */
const SLIDE = 8;
/** Least gap a label keeps from the mark at an end of its line. */
export const MARK_CLEAR = 8;
const EPS = 1e-6;

export interface SpotQuery {
  /** Segments of the edge the label belongs to, in path order. The last one ends in the arrowhead. */
  own: Segment[];
  /** Segments of every other edge. */
  foreign: Segment[];
  nodes: Rect[];
  /** Boxes of the labels already placed. */
  placed: Rect[];
  size: LabelSize;
  style: EdgeStyle;
  ruler: Ruler;
  /** The place the label would take without this check, and the index in `own` of the segment it stands at. */
  basic: Rect;
  basicSeg: number;
  /** Boxes a label may not touch: it is never taken over one, as over a node. */
  avoid?: Rect[];
  /** Ends of the line that carry a mark: a label keeps `MARK_CLEAR` from each. */
  marks?: Point[];
}

export interface Spot {
  rect: Rect;
  /** True when the label stands somewhere else than at the basic place. */
  moved: boolean;
  /** True when the label still overlaps a box, a label or a line of another edge. */
  overlap: boolean;
}

const gapOf = (a: Rect, b: Rect): number => Math.hypot(Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w), 0), Math.max(a.y - (b.y + b.h), b.y - (a.y + a.h), 0));

function pointToSegment(p: Point, s: Segment): number {
  const [a, b] = s;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = dx * dx + dy * dy;
  const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function crossesEdges(a: Point, b: Point, c: Point, d: Point): boolean {
  const side = (p: Point, q: Point, r: Point): number => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
  return side(a, b, c) * side(a, b, d) <= 0 && side(c, d, a) * side(c, d, b) <= 0;
}

/** Least distance between a segment and a box; 0 when they touch. */
export function segmentToRect(s: Segment, r: Rect): number {
  const [a, b] = s;
  const inside = (p: Point): boolean => p.x >= r.x - EPS && p.x <= r.x + r.w + EPS && p.y >= r.y - EPS && p.y <= r.y + r.h + EPS;
  if (inside(a) || inside(b)) return 0;
  const corners: Point[] = [
    { x: r.x, y: r.y },
    { x: r.x + r.w, y: r.y },
    { x: r.x + r.w, y: r.y + r.h },
    { x: r.x, y: r.y + r.h },
  ];
  let best = Infinity;
  corners.forEach((c, i) => {
    const next = corners[(i + 1) % 4] as Point;
    if (crossesEdges(a, b, c, next)) best = 0;
    best = Math.min(best, pointToSegment(a, [c, next]), pointToSegment(b, [c, next]), pointToSegment(c, s), pointToSegment(next, s));
  });
  return best;
}

const nearestLine = (r: Rect, foreign: Segment[]): number => foreign.reduce((m, s) => Math.min(m, segmentToRect(s, r)), Infinity);

/** Distance of the box to the lines of other edges, whether it overlaps something, and whether it is clean in the sense of `chooseSpot`. */
function measure(r: Rect, q: SpotQuery): { line: number; clean: boolean; overlap: boolean; marked: boolean } {
  const line = nearestLine(r, q.foreign);
  const overlap = q.nodes.some((n) => overlaps(r, n)) || (q.avoid ?? []).some((a) => overlaps(r, a)) || q.placed.some((o) => overlaps(r, o)) || line < EPS;
  const marked = (q.marks ?? []).some((m) => gapOf(r, { x: m.x, y: m.y, w: 0, h: 0 }) < MARK_CLEAR - EPS);
  const clean = !overlap && !marked && line >= LINE_CLEAR - EPS && q.placed.every((o) => gapOf(r, o) >= LABEL_CLEAR - EPS);
  return { line, clean, overlap, marked };
}

interface Candidate {
  rect: Rect;
  seg: number;
  side: number;
}

/** Side of a segment a box stands on: 0 on the line, otherwise -1 or 1. */
function sideOf(seg: Segment, r: Rect): number {
  const [p, q] = seg;
  if (p.y === q.y) {
    const d = r.y + r.h / 2 - p.y;
    return Math.abs(d) < EPS ? 0 : Math.sign(d);
  }
  const d = r.x + r.w / 2 - p.x;
  return Math.abs(d) < EPS ? 0 : Math.sign(d);
}

/**
 * The stretch a label of `size` may be centred on along segment `si` of a line of `count` segments, so that a line stays
 * visible on both sides of it (and the room of the arrowhead at the last end); undefined when the segment is too short
 * or runs aslant.
 */
export function slideRange(seg: Segment, si: number, count: number, size: LabelSize, style: EdgeStyle): { from: number; to: number; horizontal: boolean } | undefined {
  const [p, z] = seg;
  const horizontal = p.y === z.y;
  if (!horizontal && p.x !== z.x) return undefined;
  const beside = lineBeside(style);
  const dim = horizontal ? size.w : size.h;
  const lo = horizontal ? Math.min(p.x, z.x) : Math.min(p.y, z.y);
  const hi = horizontal ? Math.max(p.x, z.x) : Math.max(p.y, z.y);
  if (hi - lo < dim + 2 * beside - EPS) return undefined;
  const headHigh = horizontal ? z.x > p.x : z.y > p.y;
  const head = si === count - 1 ? ARROW : 0;
  const from = lo + beside + dim / 2 + (head && !headHigh ? head : 0);
  const to = hi - beside - dim / 2 - (head && headHigh ? head : 0);
  return to < from - EPS ? undefined : { from, to, horizontal };
}

/**
 * Candidate places along every segment long enough to keep a line visible on both sides of the label: a label sits on
 * the line, or beside it on a vertical segment. Slides in steps of `SLIDE` from the middle of the allowed stretch; at the
 * arrowhead the stretch also leaves the room of the arrowhead.
 */
function candidates(q: SpotQuery): Candidate[] {
  const { own, size, ruler } = q;
  const out: Candidate[] = [];
  own.forEach((seg, si) => {
    const range = slideRange(seg, si, own.length, size, q.style);
    if (!range) return;
    const { from, to, horizontal } = range;
    const [p] = seg;
    const mid = (from + to) / 2;
    const reach = Math.floor((to - from) / 2 / SLIDE + EPS);
    const gap = (horizontal ? size.h : size.w) / 2 + (horizontal ? ruler.labelPadY : ruler.labelPadX);
    for (const side of horizontal ? [0] : [0, 1, -1]) {
      for (let k = 0; k <= reach; k++) {
        for (const sign of k === 0 ? [1] : [1, -1]) {
          const along = mid + sign * k * SLIDE;
          const cx = horizontal ? along : p.x + side * gap;
          const cy = horizontal ? p.y + side * gap : along;
          out.push({ rect: { x: edgeNear(ruler, cx - size.w / 2), y: edgeNear(ruler, cy - size.h / 2), w: size.w, h: size.h }, seg: si, side });
        }
      }
    }
  });
  return out;
}

/**
 * Keeps the basic place of a label when it is clean: 12px or more from the line of every other edge, 8px or more from
 * every placed label and overlapping no node. Otherwise takes the nearest clean candidate, or, when none is clean, the
 * place farthest from the lines of other edges.
 */
export function chooseSpot(q: SpotQuery): Spot {
  const basic = measure(q.basic, q);
  if (basic.clean) return { rect: q.basic, moved: false, overlap: false };
  const centre = (r: Rect): Point => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
  const from = centre(q.basic);
  const away = (r: Rect): number => Math.abs(centre(r).x - from.x) + Math.abs(centre(r).y - from.y);
  const basicSide = q.own[q.basicSeg] ? sideOf(q.own[q.basicSeg] as Segment, q.basic) : 0;
  const rank = (c: Candidate): number => (c.seg === q.basicSeg ? 0 : 2) + (c.side === basicSide ? 0 : 1);
  const scored = candidates(q).map((c) => ({ c, ...measure(c.rect, q) }));
  const clean = scored.filter((s) => s.clean).sort((a, b) => away(a.c.rect) - away(b.c.rect) || rank(a.c) - rank(b.c));
  const first = clean[0];
  if (first) return { rect: first.c.rect, moved: true, overlap: false };
  // A basic place over a box to avoid gives way to any place that is not over one.
  const onAvoided = (q.avoid ?? []).some((a) => overlaps(q.basic, a));
  let best = { rect: q.basic, line: onAvoided ? -Infinity : basic.line, overlap: basic.overlap, away: 0 };
  for (const s of scored) {
    // A place over a box is never taken, however far it stands from the other lines.
    if (s.overlap || s.marked) continue;
    const next = { rect: s.c.rect, line: s.line, overlap: s.overlap, away: away(s.c.rect) };
    if (next.line > best.line + EPS || (Math.abs(next.line - best.line) <= EPS && next.away < best.away - EPS)) best = next;
  }
  return { rect: best.rect, moved: best.rect !== q.basic, overlap: best.overlap };
}

/** The place of a label on the middle of the longest straight stretch of a line that was drawn again: the label sits on it. */
function onLongest(own: Segment[], label: Rect, ruler: Ruler): Rect {
  const long = (sg: Segment): number => Math.abs(sg[1].x - sg[0].x) + Math.abs(sg[1].y - sg[0].y);
  const [p, z] = own.reduce((a, b) => (long(b) > long(a) ? b : a)) as Segment;
  const horizontal = p.y === z.y;
  const cx = horizontal ? (p.x + z.x) / 2 : p.x;
  const cy = horizontal ? p.y : (p.y + z.y) / 2;
  return { x: edgeNear(ruler, cx - label.w / 2), y: edgeNear(ruler, cy - label.h / 2), w: label.w, h: label.h };
}

/** The ends of a line that carry a mark: the arrowhead unless the edge says none, and the start when it has one. */
function marksOf(edge: LayoutEdge): Point[] {
  const first = edge.points[0];
  const last = edge.points.at(-1);
  return [...(first !== undefined && edge.startEnd !== undefined && edge.startEnd !== 'none' ? [first] : []), ...(last !== undefined && edge.end !== 'none' ? [last] : [])];
}

/**
 * Moves the labels of a finished drawing that stand too near the line of another edge or another label. Labels are
 * handled in the order of the edges, each against the labels before it; edges and boxes stay where they are.
 */
export function refineLabels(layout: Layout, ruler: Ruler, redrawn: ReadonlySet<number> = new Set(), avoid: Rect[] = []): Layout {
  const segsOf = (points: Point[]): Segment[] => points.slice(1).map((q, i) => [points[i] as Point, q] as Segment);
  const all = layout.edges.map((e) => segsOf(e.points));
  const nodes: Rect[] = layout.nodes.map(({ x, y, w, h }) => ({ x, y, w, h }));
  const finals: Rect[] = [];
  let changed = false;
  const edges = layout.edges.map((edge, ei) => {
    const label = edge.label;
    if (!label) return edge;
    const own = all[ei] as Segment[];
    const foreign = all.flatMap((ss, k) => (k === ei ? [] : ss));
    const basic: Rect = redrawn.has(ei) ? onLongest(own, label, ruler) : { x: label.x, y: label.y, w: label.w, h: label.h };
    const near = own.map((sg) => segmentToRect(sg, basic));
    const spot = chooseSpot({ own, foreign, nodes, placed: finals, size: { w: label.w, h: label.h }, style: edge.style, ruler, basic, basicSeg: near.indexOf(Math.min(...near)), ...(avoid.length === 0 ? {} : { avoid }), marks: marksOf(edge) });
    finals.push(spot.rect);
    if (!spot.moved && !redrawn.has(ei)) return edge;
    changed = true;
    return { ...edge, label: { ...label, x: spot.rect.x, y: spot.rect.y } };
  });
  const levelled = levelSiblings(layout, edges, all, nodes, ruler, avoid);
  return changed || levelled.some((e, i) => e !== edges[i]) ? { ...layout, edges: levelled } : layout;
}

/**
 * Lines that leave one box carry their labels at one distance from it along the reading direction (one height down the
 * page, one column across it): the nearest to the box at which every label of the group keeps the room that
 * `chooseSpot` asks of a clean place. A group whose labels cannot stand at one level stays as it is.
 */
function levelSiblings(layout: Layout, edges: LayoutEdge[], all: Segment[][], nodes: Rect[], ruler: Ruler, avoid: Rect[]): LayoutEdge[] {
  const flowsDown = layout.direction !== 'LR' && layout.direction !== 'RL';
  const groups = new Map<string, number[]>();
  edges.forEach((e, i) => {
    if (e.label && e.from !== e.to) groups.set(e.from, [...(groups.get(e.from) ?? []), i]);
  });
  const out = [...edges];
  const centreOf = (r: Rect): number => (flowsDown ? r.y + r.h / 2 : r.x + r.w / 2);
  for (const [from, members] of groups) {
    const source = layout.nodes.find((n) => n.id === from);
    if (members.length < 2 || !source) continue;
    const sourceAt = flowsDown ? source.y + source.h / 2 : source.x + source.w / 2;
    const spans = members.map((i) => {
      const edge = out[i] as LayoutEdge;
      const label = edge.label as NonNullable<LayoutEdge['label']>;
      const rect: Rect = { x: label.x, y: label.y, w: label.w, h: label.h };
      const own = all[i] as Segment[];
      const near = own.map((sg) => segmentToRect(sg, rect));
      const si = near.indexOf(Math.min(...near));
      const seg = own[si] as Segment;
      const range = slideRange(seg, si, own.length, { w: label.w, h: label.h }, edge.style);
      const along = flowsDown ? seg[0].x === seg[1].x : seg[0].y === seg[1].y;
      const sits = flowsDown ? Math.abs(rect.x + rect.w / 2 - seg[0].x) < ruler.edgeGrid : Math.abs(rect.y + rect.h / 2 - seg[0].y) < ruler.edgeGrid;
      const here = centreOf(rect);
      const free = range !== undefined && along && sits;
      return { i, rect, here, from: free ? range.from : here, to: free ? range.to : here };
    });
    const above = spans.map((s) => Math.sign(s.here - sourceAt));
    if (new Set(above).size !== 1 || above[0] === 0) continue;
    const low = Math.max(...spans.map((s) => s.from));
    const high = Math.min(...spans.map((s) => s.to));
    if (high < low - EPS) continue;
    const sign = above[0] as number;
    const moved = (s: (typeof spans)[number], at: number): Rect => ({ ...s.rect, ...(flowsDown ? { y: edgeNear(ruler, at - s.rect.h / 2) } : { x: edgeNear(ruler, at - s.rect.w / 2) }) });
    for (let k = 0; low + k * SLIDE <= high + EPS; k++) {
      const at = sign > 0 ? low + k * SLIDE : high - k * SLIDE;
      const rects = spans.map((s) => moved(s, at));
      const clean = spans.every((s, m) => {
        const edge = out[s.i] as LayoutEdge;
        const others = edges.flatMap((e, j) => (j === s.i || !e.label ? [] : spans.some((t) => t.i === j) ? [rects[spans.findIndex((t) => t.i === j)] as Rect] : [{ x: e.label.x, y: e.label.y, w: e.label.w, h: e.label.h }]));
        const foreign = all.flatMap((ss, j) => (j === s.i ? [] : ss));
        return measure(rects[m] as Rect, { own: all[s.i] as Segment[], foreign, nodes, placed: others, size: { w: s.rect.w, h: s.rect.h }, style: edge.style, ruler, basic: s.rect, basicSeg: 0, ...(avoid.length === 0 ? {} : { avoid }), marks: marksOf(edge) }).clean;
      });
      if (!clean) continue;
      spans.forEach((s, m) => {
        const r = rects[m] as Rect;
        if (r.x === s.rect.x && r.y === s.rect.y) return;
        const edge = out[s.i] as LayoutEdge;
        out[s.i] = { ...edge, label: { ...(edge.label as NonNullable<LayoutEdge['label']>), x: r.x, y: r.y } };
      });
      break;
    }
  }
  return out;
}
