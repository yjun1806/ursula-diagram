import type { Ruler } from '../metrics.ts';
import type { Layout, Point } from '../types.ts';
import type { Rect } from '../layout/labels.ts';
import { open, pullApart } from './head-room.ts';
import { chipOfLabel, crossedLabel, placeAgain, segmentToRect, SLIDE } from './label-spot.ts';

/** The most a drawing is pulled apart for one label, in steps of the box grid. */
const STEPS = 3;

/** The most the area of a drawing grows for all its labels together. */
const GROWTH = 1.1;

/** Room the chip of a label that is given a new place keeps from the other lines. */
const CHIP_CLEAR = 8;

/** A box or a text that begins right at a cut lies past it but would stay behind: a cut is asked about this far past itself too. */
const NEAR = 0.01;

/** Least distance from the straight piece between `p` and `q` to the box `t`; 0 when they touch. */
function away(p: Point, q: Point, t: Rect): number {
  const dx = Math.max(t.x - Math.max(p.x, q.x), Math.min(p.x, q.x) - (t.x + t.w), 0);
  const dy = Math.max(t.y - Math.max(p.y, q.y), Math.min(p.y, q.y) - (t.y + t.h), 0);
  return Math.hypot(dx, dy);
}

/** Where every line end stands on the box it ends on, edge by edge. */
function ends(layout: Layout): number[] {
  const boxes = new Map(layout.nodes.map((n) => [n.id, n] as const));
  return layout.edges.flatMap((e) =>
    ([[e.from, e.points[0]], [e.to, e.points[e.points.length - 1]]] as const).flatMap(([id, p]) => {
      const n = boxes.get(id);
      return n === undefined || p === undefined ? [0, 0] : [p.x - n.x, p.y - n.y];
    }),
  );
}

/** How far each label of the drawing stands from the line it belongs to, edge by edge. */
function ownGaps(layout: Layout): number[] {
  return layout.edges.flatMap((e) =>
    [e.label, e.startLabel, e.endLabel].map((t) => {
      if (t === undefined) return 0;
      return e.points.slice(1).reduce((least, q, k) => Math.min(least, away(e.points[k] as Point, q, t)), Infinity);
    }),
  );
}

/**
 * Pixel drawings: where another line runs through a label, the drawing is pulled apart across the stretch the label
 * stands on, by whole `step`s, until the label has a clean place on its line. A cut is made only where no box and no
 * other text lies across it or begins, never between another label and the line that label belongs to, and never past
 * `maxWidth` or past `GROWTH` times the area the drawing came with. A cut that moves a line end on its box is not
 * made, and neither is one that leaves the chip of the label against a box or closer than `CHIP_CLEAR` to another
 * line; of the cuts that give a place, the one that leaves the label farthest from the other lines is taken. A
 * label no cut makes room for stays as it is.
 */
export function clearLabels(layout: Layout, ruler: Ruler, step: number, avoidOf: (l: Layout) => Rect[], maxWidth?: number): Layout {
  let out = layout;
  const most = GROWTH * layout.width * layout.height;
  for (let i = 0; i < layout.edges.length; i++) {
    if (!crossedLabel(out, i)) continue;
    out = cleared(out, i, ruler, step, avoidOf, most, maxWidth) ?? out;
  }
  return out;
}

function cleared(layout: Layout, i: number, ruler: Ruler, step: number, avoidOf: (l: Layout) => Rect[], most: number, maxWidth?: number): Layout | undefined {
  const edge = layout.edges[i];
  const label = edge?.label;
  if (!edge || !label) return undefined;
  const pieces = edge.points.slice(1).map((q, k) => [edge.points[k] as Point, q] as const);
  const near = pieces.map((sg) => segmentToRect(sg, label));
  const [p, z] = pieces[near.indexOf(Math.min(...near))] ?? [];
  if (!p || !z || (p.x !== z.x && p.y !== z.y)) return undefined;
  const axis = p.y === z.y ? 'x' : 'y';
  const lo = Math.min(p[axis], z[axis]);
  const hi = Math.max(p[axis], z[axis]);
  const cuts = Array.from({ length: Math.max(0, Math.floor((hi - lo) / SLIDE)) }, (_, k) => lo + SLIDE / 2 + k * SLIDE).filter((at) => at < hi && open(layout, axis, at, i) && open(layout, axis, at + NEAR, i));
  const held = ownGaps(layout);
  const stood = ends(layout);
  for (let n = 1; n <= STEPS; n++) {
    const by = n * step;
    if (axis === 'x' && maxWidth !== undefined && Number.isFinite(maxWidth) && layout.width + by > maxWidth) return undefined;
    let best: { drawn: Layout; line: number } | undefined;
    for (const at of cuts) {
      const apart = pullApart(layout, axis, at, by);
      if (apart.width * apart.height > most + 1e-6) continue;
      if (ends(apart).some((v, k) => Math.abs(v - (stood[k] ?? 0)) > 1e-6)) continue;
      if (ownGaps(apart).some((gap, k) => Math.floor(k / 3) !== i && gap > (held[k] ?? 0) + 1e-6)) continue;
      const drawn = placeAgain(apart, i, ruler, avoidOf(apart));
      const placed = drawn?.edges[i]?.label;
      if (!drawn || !placed) continue;
      const chip = chipOfLabel(placed);
      if (drawn.nodes.some((b) => away({ x: b.x, y: b.y }, { x: b.x + b.w, y: b.y + b.h }, chip) < 1e-6)) continue;
      if (drawn.edges.some((e, k) => k !== i && !e.invisible && e.points.slice(1).some((q, s) => away(e.points[s] as Point, q, chip) < CHIP_CLEAR - 1e-6))) continue;
      const line = drawn.edges.reduce((m, e, k) => (k === i || e.invisible ? m : e.points.slice(1).reduce((mm, q, s) => Math.min(mm, segmentToRect([e.points[s] as Point, q], placed)), m)), Infinity);
      if (best === undefined || line > best.line + 1e-6) best = { drawn, line };
    }
    if (best) return best.drawn;
  }
  return undefined;
}
