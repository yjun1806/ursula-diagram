import type { Ruler } from '../metrics.ts';
import type { Rect } from '../layout/labels.ts';
import type { Layout, LayoutLane, Point } from '../types.ts';

const EPS = 1e-6;

/** How far a lane name stands in from the top-left corner of its lane. */
export const LANE_NAME_INSET = 16;

/** How far a label keeps off a lane border. */
export const BORDER_CLEAR = 8;

/** Axis the named lanes of a drawing stand one after another on, or nothing when they do not form one row or column. */
function stackAxis(lanes: LayoutLane[]): 'x' | 'y' | undefined {
  const along = (axis: 'x' | 'y'): boolean => {
    const [p, s, q] = axis === 'y' ? (['y', 'h', 'x'] as const) : (['x', 'w', 'y'] as const);
    return lanes.every((b, i) => {
      const a = lanes[i - 1];
      return a === undefined || (b[p] >= a[p] + a[s] - EPS && Math.abs(b[q] - a[q]) < EPS);
    });
  };
  return along('y') ? 'y' : along('x') ? 'x' : undefined;
}

/** The name of a lane `LANE_NAME_INSET` in from its top-left corner, or where it was when the lane is too narrow for that. */
function nameBox(lane: LayoutLane): LayoutLane['labelBox'] {
  const box = lane.labelBox;
  if (box.w + 2 * LANE_NAME_INSET > lane.w + EPS) return box;
  return { ...box, x: lane.x + LANE_NAME_INSET, y: lane.y + LANE_NAME_INSET };
}

/**
 * Pixel drawings with named lanes in one row or column: every gap between two lanes is as wide as the widest one needs
 * (half a node grid step, or room for the lines that run across the gap with a track gap around them), and the room a
 * gap gives up goes half to each lane beside it. Gaps that cannot all take that width are left as they are.
 */
function evenLaneGaps(layout: Layout, ruler: Ruler): Layout {
  const lanes = [...layout.lanes];
  if (ruler.uniform || layout.laneAxis !== 'across' || lanes.length < 2 || lanes.some((l) => l.label === '' || l.bare)) return layout;
  const axis = stackAxis(lanes);
  if (axis === undefined) return layout;
  const [p, s] = axis === 'y' ? (['y', 'h'] as const) : (['x', 'w'] as const);
  const grid = ruler.nodeGrid / 2;
  const least = Math.min(ruler.laneGap, grid);
  // Lines that run across a gap (along the lanes) at these coordinates.
  const runs = lanes.slice(1).map((b, i) => {
    const a = lanes[i] as LayoutLane;
    const [from, to] = [a[p] + a[s], b[p]];
    const at = new Set<number>();
    for (const e of layout.edges) {
      e.points.slice(1).forEach((q, k) => {
        const r = e.points[k] as Point;
        if (Math.abs(r[p] - q[p]) < EPS && r[p] > from + EPS && r[p] < to - EPS) at.add(r[p]);
      });
    }
    return { from, to, at: [...at].sort((m, n) => m - n) };
  });
  const need = (n: number): number => (n === 0 ? least : Math.max(least, (n + 1) * ruler.trackGap + grid));
  const gap = Math.max(...runs.map((r) => need(r.at.length)));
  const borders: Array<{ from: number; to: number }> = [];
  for (const r of runs) {
    if (gap > r.to - r.from + EPS) return layout;
    const lo = r.at[0];
    const hi = r.at.at(-1);
    const centre = lo === undefined || hi === undefined ? (r.from + r.to) / 2 : (lo + hi) / 2;
    const from = Math.min(r.to - gap, Math.max(r.from, r.from + Math.floor((centre - gap / 2 - r.from) / grid + EPS) * grid));
    if (lo !== undefined && hi !== undefined && (lo < from + ruler.trackGap - EPS || hi > from + gap - ruler.trackGap + EPS)) return layout;
    borders.push({ from, to: from + gap });
  }
  const moved = lanes.map((lane, i): LayoutLane => {
    const start = i === 0 ? lane[p] : (borders[i - 1] as { to: number }).to;
    const end = i === lanes.length - 1 ? lane[p] + lane[s] : (borders[i] as { from: number }).from;
    return { ...lane, [p]: start, [s]: end - start };
  });
  return { ...layout, lanes: moved };
}

/** Pixel drawings with lanes across the reading direction: gaps as `evenLaneGaps` makes them and every lane name `LANE_NAME_INSET` in from the top-left corner of its lane. */
export function arrangeLanes(layout: Layout, ruler: Ruler): Layout {
  if (ruler.uniform || layout.laneAxis !== 'across') return layout;
  const even = evenLaneGaps(layout, ruler);
  return { ...even, lanes: even.lanes.map((l) => (l.label === '' || l.bare ? l : { ...l, labelBox: nameBox(l) })) };
}

/** Strips along every border of the named lanes that a label keeps off. */
export function laneBorders(layout: Layout): Rect[] {
  if (layout.lanes.length < 2) return [];
  const c = BORDER_CLEAR;
  return layout.lanes
    .filter((l) => l.label !== '' && !l.bare)
    .flatMap((l) => [
      { x: l.x - c, y: l.y - c, w: l.w + 2 * c, h: 2 * c },
      { x: l.x - c, y: l.y + l.h - c, w: l.w + 2 * c, h: 2 * c },
      { x: l.x - c, y: l.y - c, w: 2 * c, h: l.h + 2 * c },
      { x: l.x + l.w - c, y: l.y - c, w: 2 * c, h: l.h + 2 * c },
    ]);
}
