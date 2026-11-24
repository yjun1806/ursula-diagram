import { crossingCount } from '../layout/check.ts';
import type { Layout, LayoutEdge, Point } from '../types.ts';
import { chipOfLabel, crossedLabels, LINE_CLEAR } from './label-spot.ts';

/** A line that bends runs at least this far straight into a mark at its end, so that the bend and the mark read apart. */
export const HEAD_LEG = 32;

/** Room a bend that is moved keeps from what lies past it, and the least it leaves of the piece that leads to it. */
const BEND_CLEAR = 16;

const EPS = 1e-6;
const NEAR = 0.01;
const TRIES = 64;

type Axis = 'x' | 'y';
type Box = { x: number; y: number; w: number; h: number };

interface Short {
  edge: number;
  first: boolean;
  axis: Axis;
  lo: number;
  hi: number;
  lack: number;
}

const marked = (edge: LayoutEdge, first: boolean): boolean => (first ? (edge.startEnd ?? 'none') !== 'none' : (edge.end ?? 'arrow') !== 'none');

/** The last straight pieces before a mark that are shorter than `HEAD_LEG`, on lines that bend, shortest first. */
function shortLegs(layout: Layout): Short[] {
  const out: Short[] = [];
  for (const [index, edge] of layout.edges.entries()) {
    const pts = edge.points;
    if (edge.invisible || pts.length < 3) continue;
    for (const first of [true, false]) {
      if (!marked(edge, first)) continue;
      const a = (first ? pts[0] : pts[pts.length - 1]) as Point;
      const b = (first ? pts[1] : pts[pts.length - 2]) as Point;
      const axis: Axis = Math.abs(a.y - b.y) < EPS ? 'x' : 'y';
      if (axis === 'y' && Math.abs(a.x - b.x) > EPS) continue;
      const len = Math.abs(a[axis] - b[axis]);
      if (len > EPS && len < HEAD_LEG - EPS) out.push({ edge: index, first, axis, lo: Math.min(a[axis], b[axis]), hi: Math.max(a[axis], b[axis]), lack: HEAD_LEG - len });
    }
  }
  return out.sort((m, n) => n.lack - m.lack);
}

const span = (b: Box, axis: Axis): [number, number] => (axis === 'x' ? [b.x, b.x + b.w] : [b.y, b.y + b.h]);
const straddles = (b: Box, axis: Axis, at: number): boolean => {
  const [lo, hi] = span(b, axis);
  return lo < at && hi > at;
};

/**
 * Whether the drawing can be pulled apart at `at`: no box and no text lies across the cut. The label of edge `free`
 * does not count, and neither does the legend when the cut runs down the page: it spans the drawing and stays where it is.
 */
export function open(layout: Layout, axis: Axis, at: number, free?: number): boolean {
  for (const n of layout.nodes) if (straddles(n, axis, at) || (n.outline !== undefined && straddles(n.outline, axis, at))) return false;
  for (const [i, e] of layout.edges.entries()) for (const t of [i === free ? undefined : e.label, e.startLabel, e.endLabel]) if (t !== undefined && straddles(t, axis, at)) return false;
  for (const l of layout.lanes) if (l.label !== '' && straddles(l.labelBox, axis, at)) return false;
  for (const c of layout.clusters ?? []) if (c.name !== undefined && straddles(c.name, axis, at)) return false;
  if (axis === 'y' && layout.legend !== undefined && straddles(layout.legend, axis, at)) return false;
  return true;
}

/** The drawing with everything past `at` moved `by` further along `axis`; bands and cluster boxes across the cut grow by as much. */
export function pullApart(layout: Layout, axis: Axis, at: number, by: number): Layout {
  const size = axis === 'x' ? 'w' : 'h';
  const moved = <T extends Box>(b: T): T => (b[axis] > at ? { ...b, [axis]: b[axis] + by } : b);
  const grown = <T extends Box>(b: T): T => (b[axis] > at ? { ...b, [axis]: b[axis] + by } : b[axis] + b[size] > at ? { ...b, [size]: b[size] + by } : b);
  const point = (p: Point): Point => (p[axis] > at ? { ...p, [axis]: p[axis] + by } : p);
  const legend = layout.legend;
  const total = axis === 'x' ? 'width' : 'height';
  // A legend below the drawing may be the wider of the two: the drawing grows under it first.
  const whole = legend !== undefined && axis === 'x' ? Math.max(layout.width, legend.base.width + by) : layout[total] + by;
  return {
    ...layout,
    [total]: whole,
    nodes: layout.nodes.map((n) => (n.outline === undefined ? moved(n) : { ...moved(n), outline: moved(n.outline) })),
    lanes: layout.lanes.map((l) => ({ ...grown(l), labelBox: moved(l.labelBox) })),
    ...(layout.clusters === undefined ? {} : { clusters: layout.clusters.map((c) => (c.name === undefined ? grown(c) : { ...grown(c), name: moved(c.name) })) }),
    edges: layout.edges.map((e) => ({
      ...e,
      points: e.points.map(point),
      ...(e.label === undefined ? {} : { label: moved(e.label) }),
      ...(e.startLabel === undefined ? {} : { startLabel: moved(e.startLabel) }),
      ...(e.endLabel === undefined ? {} : { endLabel: moved(e.endLabel) }),
      ...(e.trunk?.dot === undefined ? {} : { trunk: { ...e.trunk, dot: point(e.trunk.dot) } }),
    })),
    ...(legend === undefined
      ? {}
      : { legend: { ...moved(legend), ...(axis === 'x' ? { w: whole } : {}), base: { ...legend.base, [total]: legend.base[total] + by }, items: legend.items.map((i) => (legend[axis] > at ? { ...i, [axis]: i[axis] + by, ...(axis === 'x' ? { captionX: i.captionX + by } : {}) } : i)) } }),
  };
}

const within = (b: Box, p: Point): boolean => p.x > b.x && p.x < b.x + b.w && p.y > b.y && p.y < b.y + b.h;
const holds = (b: Box, p: Point): boolean => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
const touches = (p: Point, q: Point, b: Box): boolean => Math.min(p.x, q.x) <= b.x + b.w && Math.max(p.x, q.x) >= b.x && Math.min(p.y, q.y) <= b.y + b.h && Math.max(p.y, q.y) >= b.y;
const meets = (a: Box, b: Box): boolean => a.x < b.x + b.w - EPS && b.x < a.x + a.w - EPS && a.y < b.y + b.h - EPS && b.y < a.y + a.h - EPS;

/** A box grown by `by` on every side. */
const grown = (b: Box, by: number): Box => ({ x: b.x - by, y: b.y - by, w: b.w + 2 * by, h: b.h + 2 * by });

/**
 * For every piece of line `index` against every piece of the other lines, how far the two run side by side closer
 * than a label keeps from a line.
 */
function sideBySide(layout: Layout, index: number): number[] {
  const own = (layout.edges[index] as LayoutEdge).points;
  const out: number[] = [];
  for (let k = 0; k + 1 < own.length; k++) {
    const [p, q] = [own[k] as Point, own[k + 1] as Point];
    const axis: Axis | undefined = Math.abs(p.y - q.y) < EPS ? 'x' : Math.abs(p.x - q.x) < EPS ? 'y' : undefined;
    for (const [i, e] of layout.edges.entries()) {
      if (i === index || e.invisible) continue;
      for (let m = 0; m + 1 < e.points.length; m++) {
        const [r, t] = [e.points[m] as Point, e.points[m + 1] as Point];
        if (axis === undefined) {
          out.push(0);
          continue;
        }
        const across: Axis = axis === 'x' ? 'y' : 'x';
        const level = Math.abs(r[across] - t[across]) < EPS && Math.abs(r[across] - p[across]) < LINE_CLEAR - EPS;
        out.push(level ? Math.max(0, Math.min(Math.max(p[axis], q[axis]), Math.max(r[axis], t[axis])) - Math.max(Math.min(p[axis], q[axis]), Math.min(r[axis], t[axis]))) : 0);
      }
    }
  }
  return out;
}

/**
 * Whether the drawing `after`, in which only the points of line `index` differ from `before`, is no worse for it:
 * no more labels another line runs through, no more crossings, and no pair of pieces running side by side for longer.
 */
function noWorse(before: Layout, after: Layout, index: number): boolean {
  if (crossedLabels(after) > crossedLabels(before)) return false;
  if (crossingCount(after.edges) > crossingCount(before.edges)) return false;
  const was = sideBySide(before, index);
  return sideBySide(after, index).every((run, k) => run <= (was[k] ?? 0) + EPS);
}

/**
 * The drawing with the bend before the short piece `s` moved away from the mark until the piece is `HEAD_LEG` long.
 * Undefined unless the line runs on from the bend to a second bend and back along the piece, the stretch the bend
 * moves over holds no box, no text and no other line, the chip of no label, the line's own among them, is closer to
 * it than a label keeps from a line, and the bend stays inside the drawing and on its side of the border of every band and
 * cluster. Undefined too when the moved line would leave the drawing worse in the sense of `noWorse`.
 */
function bendBack(layout: Layout, s: Short): Layout | undefined {
  const edge = layout.edges[s.edge] as LayoutEdge;
  if (edge.trunk !== undefined) return undefined;
  const pts = s.first ? edge.points : [...edge.points].reverse();
  const [a, b, c, d] = pts;
  if (a === undefined || b === undefined || c === undefined || d === undefined) return undefined;
  const along = s.axis;
  const across: Axis = along === 'x' ? 'y' : 'x';
  if (Math.abs(a[across] - b[across]) > EPS || Math.abs(b[along] - c[along]) > EPS || Math.abs(c[across] - d[across]) > EPS) return undefined;
  const dir = Math.sign(b[along] - a[along]);
  const to = a[along] + dir * HEAD_LEG;
  if ((to - b[along]) * dir < EPS) return undefined;
  if (Math.sign(d[along] - c[along]) === dir) {
    const keep = pts.length === 4 && marked(edge, !s.first) ? HEAD_LEG : BEND_CLEAR;
    if ((d[along] - to) * dir < keep - EPS) return undefined;
  }
  const from = b[along] + dir * NEAR;
  const past = to + dir * BEND_CLEAR;
  const lo = Math.min(b[across], c[across]);
  const span = Math.abs(b[across] - c[across]);
  const zone: Box = along === 'x' ? { x: Math.min(from, past), y: lo, w: Math.abs(past - from), h: span } : { x: lo, y: Math.min(from, past), w: span, h: Math.abs(past - from) };
  // A label is held against the stretch the bend itself moves over, without the room kept past it.
  const swept: Box = along === 'x' ? { ...zone, x: Math.min(from, to), w: Math.abs(to - from) } : { ...zone, y: Math.min(from, to), h: Math.abs(to - from) };
  const moved = (p: Point): Point => ({ ...p, [along]: to });
  for (const n of layout.nodes) if (meets(n, zone) || (n.outline !== undefined && meets(n.outline, zone))) return undefined;
  for (const [i, e] of layout.edges.entries()) {
    for (const t of [e.label, e.startLabel, e.endLabel]) if (t !== undefined && (meets(t, zone) || meets(grown(chipOfLabel(t), LINE_CLEAR), swept))) return undefined;
    if (e.invisible) continue;
    const own = i === s.edge ? (s.first ? [0, 1, 2] : [e.points.length - 2, e.points.length - 3, e.points.length - 4]) : [];
    for (let k = 0; k + 1 < e.points.length; k++) if (!own.includes(k) && touches(e.points[k] as Point, e.points[k + 1] as Point, zone)) return undefined;
  }
  // Half the room past the bend is kept from the border of a band or a cluster, and from the edge of the drawing.
  const probe = (p: Point): Point => ({ ...p, [along]: to + (dir * BEND_CLEAR) / 2 });
  const stays = (box: Box): boolean => [b, c, { x: (b.x + c.x) / 2, y: (b.y + c.y) / 2 }].every((p) => (within(box, p) ? holds(box, probe(p)) : !within(box, probe(p))));
  if (!holds({ x: 0, y: 0, w: layout.width, h: layout.legend?.base.height ?? layout.height }, probe(b))) return undefined;
  for (const l of layout.lanes) if ((l.label !== '' && meets(l.labelBox, zone)) || !stays(l)) return undefined;
  for (const k of layout.clusters ?? []) if ((k.name !== undefined && meets(k.name, zone)) || !stays(k)) return undefined;
  const points = [a, moved(b), moved(c), ...pts.slice(3)];
  const out = { ...layout, edges: layout.edges.map((e, i) => (i === s.edge ? { ...e, points: s.first ? points : [...points].reverse() } : e)) };
  return noWorse(layout, out, s.edge) ? out : undefined;
}

/**
 * Pixel drawings: where a line bends less than `HEAD_LEG` before the mark at its end, the drawing is pulled apart
 * across that last piece, by whole `step`s, until the piece is that long. A cut is made only where no box and no text
 * lies across it, and never past `maxWidth`. Where no cut can be made the bend itself moves away from the mark when
 * the way is free (`bendBack`); a piece that neither reaches stays as it is. No step is taken that leaves more labels
 * with another line running through them than the drawing came with.
 */
export function headRoom(layout: Layout, step: number, maxWidth?: number): Layout {
  let out = layout;
  for (let i = 0; i < TRIES; i++) {
    let next: Layout | undefined;
    for (const s of shortLegs(out)) {
      const by = Math.ceil((s.lack - EPS) / step) * step;
      if (s.axis === 'x' && maxWidth !== undefined && Number.isFinite(maxWidth) && out.width + by > maxWidth) continue;
      const at = [s.hi - NEAR, s.lo + NEAR, (s.lo + s.hi) / 2].find((c) => open(out, s.axis, c));
      if (at === undefined) continue;
      const apart = pullApart(out, s.axis, at, by);
      if (crossedLabels(apart) > crossedLabels(out)) continue;
      next = apart;
      break;
    }
    if (next === undefined) break;
    out = next;
  }
  for (const s of shortLegs(out)) out = bendBack(out, s) ?? out;
  return out;
}
