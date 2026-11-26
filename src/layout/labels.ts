import type { Ruler } from '../metrics.ts';
import type { Point } from '../types.ts';
import { edgeNear } from './place.ts';

export interface LabelSize {
  /** Physical box of the label. */
  w: number;
  h: number;
}

export function labelSize(text: string, ruler: Ruler): LabelSize {
  return {
    w: ruler.textWidth(text, 'edge') + 2 * ruler.labelPadX,
    h: ruler.lineHeight('edge') + 2 * ruler.labelPadY,
  };
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function overlaps(a: Rect, b: Rect): boolean {
  const eps = 1e-6;
  return a.x < b.x + b.w - eps && b.x < a.x + a.w - eps && a.y < b.y + b.h - eps && b.y < a.y + a.h - eps;
}

export interface Placed {
  rect: Rect;
  overlap: boolean;
}

export type Segment = readonly [Point, Point];

/** True when the segment passes through the open interior of the rectangle. */
function segmentHits(seg: Segment, r: Rect): boolean {
  const eps = 1e-6;
  const [p, q] = seg;
  return (
    Math.min(p.x, q.x) < r.x + r.w - eps &&
    Math.max(p.x, q.x) > r.x + eps &&
    Math.min(p.y, q.y) < r.y + r.h - eps &&
    Math.max(p.y, q.y) > r.y + eps
  );
}

/**
 * Places a label next to its own edge, in space that holds no node, no other label and no
 * segment of another edge. A label sits on the line, as close to the middle of the segment as it
 * fits (the label box hides the stretch under it) and, failing that, beside it. When nothing is free the label
 * stays at the preferred spot and the overlap is reported.
 */
export function placeLabel(
  segment: Segment,
  size: LabelSize,
  nodes: Rect[],
  placed: Rect[],
  ruler: Ruler,
  foreign: Segment[] = [],
  beside = false,
): Placed {
  const [p, q] = segment;
  const horizontal = p.y === q.y;
  const lo = horizontal ? Math.min(p.x, q.x) : Math.min(p.y, q.y);
  const hi = horizontal ? Math.max(p.x, q.x) : Math.max(p.y, q.y);
  const mid = (lo + hi) / 2;
  const rectAt = (along: number, side: number): Rect => {
    const gap = (horizontal ? size.h : size.w) / 2 + (horizontal ? ruler.labelPadY : ruler.labelPadX);
    const cx = horizontal ? along : p.x + side * gap;
    const cy = horizontal ? p.y + side * gap : along;
    return { x: edgeNear(ruler, cx - size.w / 2), y: edgeNear(ruler, cy - size.h / 2), w: size.w, h: size.h };
  };
  const free = (r: Rect, side: number): boolean =>
    (side === 0 || !segmentHits(segment, r)) &&
    !nodes.some((n) => overlaps(r, n)) && !placed.some((o) => overlaps(r, o)) && !foreign.some((f) => segmentHits(f, r));
  const step = ruler.trackGap;
  const reach = Math.floor((hi - lo) / 2 / step);
  // A label on a vertical line hides a stretch of it only in pixels; a terminal keeps it beside.
  // `beside`: the stretch is too short to show a line on both sides of a label on it, so the label stands next to it first.
  const sides = horizontal ? (beside ? [-1, 1, 0] : [0, -1, 1]) : ruler.terminal === true || beside ? [1, -1, 0] : [0, 1, -1];
  for (const side of sides) {
    for (let k = 0; k <= reach; k++) {
      for (const sign of k === 0 ? [1] : [1, -1]) {
        const rect = rectAt(mid + sign * k * step, side);
        if (free(rect, side)) return { rect, overlap: false };
      }
    }
  }
  return { rect: rectAt(mid, sides[0] ?? 0), overlap: true };
}
