import type { Layout, LayoutEdge, Point } from '../types.ts';

/** A line that bends runs at least this far straight into a mark at its end, so that the bend and the mark read apart. */
export const HEAD_LEG = 32;

const EPS = 1e-6;
const NEAR = 0.01;
const TRIES = 64;

type Axis = 'x' | 'y';
type Box = { x: number; y: number; w: number; h: number };

interface Short {
  axis: Axis;
  lo: number;
  hi: number;
  lack: number;
}

const marked = (edge: LayoutEdge, first: boolean): boolean => (first ? (edge.startEnd ?? 'none') !== 'none' : (edge.end ?? 'arrow') !== 'none');

/** The last straight pieces before a mark that are shorter than `HEAD_LEG`, on lines that bend, shortest first. */
function shortLegs(layout: Layout): Short[] {
  const out: Short[] = [];
  for (const edge of layout.edges) {
    const pts = edge.points;
    if (edge.invisible || pts.length < 3) continue;
    for (const first of [true, false]) {
      if (!marked(edge, first)) continue;
      const a = (first ? pts[0] : pts[pts.length - 1]) as Point;
      const b = (first ? pts[1] : pts[pts.length - 2]) as Point;
      const axis: Axis = Math.abs(a.y - b.y) < EPS ? 'x' : 'y';
      if (axis === 'y' && Math.abs(a.x - b.x) > EPS) continue;
      const len = Math.abs(a[axis] - b[axis]);
      if (len > EPS && len < HEAD_LEG - EPS) out.push({ axis, lo: Math.min(a[axis], b[axis]), hi: Math.max(a[axis], b[axis]), lack: HEAD_LEG - len });
    }
  }
  return out.sort((m, n) => n.lack - m.lack);
}

const span = (b: Box, axis: Axis): [number, number] => (axis === 'x' ? [b.x, b.x + b.w] : [b.y, b.y + b.h]);
const straddles = (b: Box, axis: Axis, at: number): boolean => {
  const [lo, hi] = span(b, axis);
  return lo < at && hi > at;
};

/** Whether the drawing can be pulled apart at `at`: no box and no text lies across the cut. */
function open(layout: Layout, axis: Axis, at: number): boolean {
  for (const n of layout.nodes) if (straddles(n, axis, at) || (n.outline !== undefined && straddles(n.outline, axis, at))) return false;
  for (const e of layout.edges) for (const t of [e.label, e.startLabel, e.endLabel]) if (t !== undefined && straddles(t, axis, at)) return false;
  for (const l of layout.lanes) if (l.label !== '' && straddles(l.labelBox, axis, at)) return false;
  for (const c of layout.clusters ?? []) if (c.name !== undefined && straddles(c.name, axis, at)) return false;
  if (layout.legend !== undefined && straddles(layout.legend, axis, at)) return false;
  return true;
}

/** The drawing with everything past `at` moved `by` further along `axis`; bands and cluster boxes across the cut grow by as much. */
function pullApart(layout: Layout, axis: Axis, at: number, by: number): Layout {
  const size = axis === 'x' ? 'w' : 'h';
  const moved = <T extends Box>(b: T): T => (b[axis] > at ? { ...b, [axis]: b[axis] + by } : b);
  const grown = <T extends Box>(b: T): T => (b[axis] > at ? { ...b, [axis]: b[axis] + by } : b[axis] + b[size] > at ? { ...b, [size]: b[size] + by } : b);
  const point = (p: Point): Point => (p[axis] > at ? { ...p, [axis]: p[axis] + by } : p);
  const legend = layout.legend;
  const total = axis === 'x' ? 'width' : 'height';
  return {
    ...layout,
    [total]: layout[total] + by,
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
      : { legend: { ...moved(legend), base: { ...legend.base, [total]: legend.base[total] + by }, items: legend.items.map((i) => (legend[axis] > at ? { ...i, [axis]: i[axis] + by, ...(axis === 'x' ? { captionX: i.captionX + by } : {}) } : i)) } }),
  };
}

/**
 * Pixel drawings: where a line bends less than `HEAD_LEG` before the mark at its end, the drawing is pulled apart
 * across that last piece, by whole `step`s, until the piece is that long. A cut is made only where no box and no text
 * lies across it, and never past `maxWidth`; a piece that no cut can reach stays as it is.
 */
export function headRoom(layout: Layout, step: number, maxWidth?: number): Layout {
  let out = layout;
  for (let i = 0; i < TRIES; i++) {
    let cut: { axis: Axis; at: number; by: number } | undefined;
    for (const s of shortLegs(out)) {
      const by = Math.ceil((s.lack - EPS) / step) * step;
      if (s.axis === 'x' && maxWidth !== undefined && Number.isFinite(maxWidth) && out.width + by > maxWidth) continue;
      const at = [s.hi - NEAR, s.lo + NEAR, (s.lo + s.hi) / 2].find((c) => open(out, s.axis, c));
      if (at === undefined) continue;
      cut = { axis: s.axis, at, by };
      break;
    }
    if (cut === undefined) break;
    out = pullApart(out, cut.axis, cut.at, cut.by);
  }
  return out;
}
