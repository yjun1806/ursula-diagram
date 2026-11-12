import type { Point } from '../types.ts';

/** An axis-aligned rectangle given by its edges. */
export interface Box {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

export type TextAnchor = 'start' | 'middle' | 'end';

/** The box of a text `w` wide and `h` tall whose anchor point is (`x`, `y`) and whose vertical middle is `y`. */
export function anchoredBox(x: number, y: number, w: number, anchor: TextAnchor, h: number): Box {
  const x0 = anchor === 'start' ? x : anchor === 'end' ? x - w : x - w / 2;
  return { x0, x1: x0 + w, y0: y - h / 2, y1: y + h / 2 };
}

/** Whether two boxes come closer than `pad` to each other or overlap. */
export const boxesOverlap = (a: Box, b: Box, pad: number): boolean => a.x0 < b.x1 + pad && b.x0 < a.x1 + pad && a.y0 < b.y1 + pad && b.y0 < a.y1 + pad;

/** What a candidate box is checked against. */
export interface ClashContext {
  /** The area a label has to stay inside. */
  bounds: Box;
  /** Boxes of things that stay where they are. */
  fixed: readonly Box[];
  /** Boxes of the labels placed so far. */
  placed: readonly Box[];
  /** Points along the lines the label should keep off. */
  samples: readonly Point[];
}

/**
 * How badly `box` collides: 100 for leaving `bounds`, 1 for each fixed box within 1 of it, 2 for each placed label
 * within 2 of it and 1 for each line sample within 1 of it. 0 is a free spot.
 */
export function clashCost(box: Box, ctx: ClashContext): number {
  const { bounds } = ctx;
  const inside = box.x0 >= bounds.x0 && box.x1 <= bounds.x1 && box.y0 >= bounds.y0 && box.y1 <= bounds.y1;
  return (
    (inside ? 0 : 100) +
    ctx.fixed.filter((o) => boxesOverlap(box, o, 1)).length +
    ctx.placed.filter((o) => boxesOverlap(box, o, 2)).length * 2 +
    ctx.samples.filter((s) => s.x > box.x0 - 1 && s.x < box.x1 + 1 && s.y > box.y0 - 1 && s.y < box.y1 + 1).length
  );
}

/** The first candidate with the lowest cost, stopping at the first one that costs nothing; undefined without candidates. */
export function pickLeastClash<T>(candidates: Iterable<T>, boxOf: (c: T) => Box, cost: (b: Box) => number): { candidate: T; box: Box } | undefined {
  let best: { candidate: T; box: Box; cost: number } | undefined;
  for (const candidate of candidates) {
    const box = boxOf(candidate);
    const c = cost(box);
    if (best === undefined || c < best.cost) best = { candidate, box, cost: c };
    if (c === 0) break;
  }
  return best === undefined ? undefined : { candidate: best.candidate, box: best.box };
}

/** The shape of a line at one point, from the value there and the values on either side (absent at the ends). */
export type Trend = 'peak' | 'valley' | 'rising' | 'falling';

export function trendAt(cur: number, prev: number | undefined, next: number | undefined): Trend {
  if (prev === undefined && next === undefined) return 'peak';
  const before = prev ?? 2 * cur - (next ?? cur);
  const after = next ?? 2 * cur - before;
  if (cur >= before && cur >= after) return 'peak';
  if (cur <= before && cur <= after) return 'valley';
  return cur > before ? 'rising' : 'falling';
}
