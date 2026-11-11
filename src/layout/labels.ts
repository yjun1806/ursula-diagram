import type { Ruler } from '../metrics.ts';
import type { Point } from '../types.ts';
import type { Geo, Skeleton } from './place.ts';
import type { EdgePlan } from './plan.ts';
import { edgeNear } from './place.ts';
import type { Routed, Run } from './route.ts';

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

/** Position along a channel line for a half-channel coordinate. */
function at(centres: number[], v: number): number {
  const k = Math.floor(v / 2);
  return v % 2 === 0 ? (centres[k] ?? 0) : ((centres[k] ?? 0) + (centres[k + 1] ?? 0)) / 2;
}

function runLength(geo: Geo, run: Run): number {
  const centres = run.kind === 'f' ? geo.cC : geo.fC;
  return Math.abs(at(centres, run.hi) - at(centres, run.lo));
}

/** Index (within the edge's runs) of the run that carries the label. */
export function hostRun(geo: Geo, routed: Routed, runs: Run[]): number {
  let best = 0;
  let bestLen = -1;
  routed.runs.forEach((id, i) => {
    const run = runs[id];
    if (!run) return;
    const len = runLength(geo, run);
    if (len > bestLen + 1e-9) {
      best = i;
      bestLen = len;
    }
  });
  return best;
}

export interface Demands {
  wf: number[];
  wc: number[];
}

/**
 * Minimum widths of the channels that carry edge labels, so a label fits across
 * its channel with a track gap on either side.
 */
export function labelDemands(
  sk: Skeleton,
  geo: Geo,
  ruler: Ruler,
  plans: EdgePlan[],
  routed: Map<number, Routed>,
  runs: Run[],
  sizes: Map<number, LabelSize>,
): Demands {
  const wf = new Array<number>(sk.ranks + 1).fill(0);
  const wc = new Array<number>(sk.channels).fill(0);
  const g = 2 * ruler.trackGap;
  const raise = (arr: number[], i: number, v: number): void => {
    arr[i] = Math.max(arr[i] ?? 0, v);
  };
  for (const plan of plans) {
    const size = sizes.get(plan.index);
    if (!size) continue;
    const lf = sk.td ? size.h : size.w;
    const lc = sk.td ? size.w : size.h;
    const s = sk.byId.get(plan.from);
    const t = sk.byId.get(plan.to);
    if (!s || !t) continue;
    if (plan.straight === 'f') {
      if (t.rank === s.rank + s.span) raise(wf, t.rank, lf + g);
    } else if (plan.straight === 'c') {
      const [top, bottom] = s.cRow < t.cRow ? [s, t] : [t, s];
      if (bottom.cRow === top.cRow + 1) {
        if (top.lane === bottom.lane) {
          raise(wc, bottom.cb, lc + g);
        } else {
          const lower = sk.lanes[bottom.lane];
          const upper = sk.lanes[top.lane];
          if (upper && lower) {
            const need = lc + g - sk.laneGap - (geo.wc[lower.base] ?? 0);
            raise(wc, upper.base + upper.rows, need);
          }
        }
      }
    } else {
      const r = routed.get(plan.index);
      if (!r) continue;
      const run = runs[r.runs[hostRun(geo, r, runs)] ?? -1];
      if (!run) continue;
      if (run.kind === 'f') raise(wf, run.idx, lf + g);
      else raise(wc, run.idx, lc + g);
    }
  }
  return { wf, wc };
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
 * segment of another edge. A label on a vertical segment sits beside the line, as close to the
 * middle of the segment as it fits; a label on a horizontal segment sits on the line (the label
 * box hides the stretch under it) and, failing that, beside it. When nothing is free the label
 * stays at the preferred spot and the overlap is reported.
 */
export function placeLabel(
  segment: Segment,
  size: LabelSize,
  nodes: Rect[],
  placed: Rect[],
  ruler: Ruler,
  foreign: Segment[] = [],
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
  const sides = horizontal ? [0, -1, 1] : [1, -1, 0];
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
