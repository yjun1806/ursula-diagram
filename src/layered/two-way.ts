import { withinCanvas } from '../layout/clusters.ts';
import type { Ruler } from '../metrics.ts';
import type { Layout, LayoutEdge, LayoutNode, Point } from '../types.ts';
import { hits, overlap, properCross, segs } from './elbows.ts';

const EPS = 1e-6;

/** How far beside the boxes the line back runs. */
const AWAY = 24;

type Face = 'left' | 'right' | 'top' | 'bottom';

const straight = (e: LayoutEdge): boolean => e.points.length === 2;
const vertical = (e: LayoutEdge): boolean => Math.abs((e.points[0] as Point).x - (e.points[1] as Point).x) < EPS;

/** Whether an end of the edge lies on the face of the node. */
function onFace(p: Point, n: LayoutNode, face: Face): boolean {
  if (face === 'left' || face === 'right') {
    const x = face === 'left' ? n.x : n.x + n.w;
    return Math.abs(p.x - x) < EPS && p.y > n.y - EPS && p.y < n.y + n.h + EPS;
  }
  const y = face === 'top' ? n.y : n.y + n.h;
  return Math.abs(p.y - y) < EPS && p.x > n.x - EPS && p.x < n.x + n.w + EPS;
}

/** The path from the middle of `face` of `u` round to the middle of the same face of `v`, `AWAY` beyond both boxes. */
function around(u: LayoutNode, v: LayoutNode, face: Face): Point[] {
  const cy = (n: LayoutNode): number => n.y + n.h / 2;
  const cx = (n: LayoutNode): number => n.x + n.w / 2;
  switch (face) {
    case 'left': {
      const x = Math.min(u.x, v.x) - AWAY;
      return [{ x: u.x, y: cy(u) }, { x, y: cy(u) }, { x, y: cy(v) }, { x: v.x, y: cy(v) }];
    }
    case 'right': {
      const x = Math.max(u.x + u.w, v.x + v.w) + AWAY;
      return [{ x: u.x + u.w, y: cy(u) }, { x, y: cy(u) }, { x, y: cy(v) }, { x: v.x + v.w, y: cy(v) }];
    }
    case 'top': {
      const y = Math.min(u.y, v.y) - AWAY;
      return [{ x: cx(u), y: u.y }, { x: cx(u), y }, { x: cx(v), y }, { x: cx(v), y: v.y }];
    }
    case 'bottom': {
      const y = Math.max(u.y + u.h, v.y + v.h) + AWAY;
      return [{ x: cx(u), y: u.y + u.h }, { x: cx(u), y }, { x: cx(v), y }, { x: cx(v), y: v.y + v.h }];
    }
  }
}

/** Whether the line runs against the reading direction of the drawing. */
function goesBack(u: LayoutNode, v: LayoutNode, direction: Layout['direction']): boolean {
  return direction === 'TD' ? v.y + v.h < u.y + EPS : v.x + v.w < u.x + EPS;
}

/**
 * Pixel drawings: of two straight lines that join the same two boxes in opposite directions side by side in one gap,
 * the one against the reading direction leaves and enters by the middle of the same side face of both boxes and runs
 * round `AWAY` beyond them. A face is used only when no other line ends on it on either box, the path stays within the
 * lane padding of the boxes of its lane, hits no box, crosses no line and runs along none. The left (or top) face is
 * tried first. A line with a label keeps its place.
 */
export function separateTwoWay(layout: Layout, ruler: Ruler): Layout {
  if (ruler.uniform) return layout;
  const { nodes } = layout;
  const edges = [...layout.edges];
  const byId = new Map(nodes.map((n) => [n.id, n] as const));
  const unnamed = layout.lanes.length <= 1 && (layout.lanes[0]?.label ?? '') === '';
  edges.forEach((e, i) => {
    const u = byId.get(e.from);
    const v = byId.get(e.to);
    if (!u || !v || u === v || e.invisible || e.label || !straight(e) || !goesBack(u, v, layout.direction)) return;
    const pair = edges.some((f, j) => j !== i && f.from === e.to && f.to === e.from && !f.invisible && straight(f) && vertical(f) === vertical(e));
    if (!pair || u.lane !== v.lane) return;
    const faces: Face[] = vertical(e) ? ['left', 'right'] : ['top', 'bottom'];
    const mates = nodes.filter((n) => n.lane === u.lane);
    // A lane with no name draws no box: the line may run out past its padding, and the drawing grows to hold it.
    const pad = unnamed ? Math.max(ruler.lanePad, AWAY + ruler.trackGap) : ruler.lanePad;
    const room = {
      x0: Math.min(...mates.map((n) => n.x)) - pad,
      x1: Math.max(...mates.map((n) => n.x + n.w)) + pad,
      y0: Math.min(...mates.map((n) => n.y)) - pad,
      y1: Math.max(...mates.map((n) => n.y + n.h)) + pad,
    };
    for (const face of faces) {
      const taken = edges.some((f, j) => j !== i && f.points.length > 0 && [f.points[0] as Point, f.points[f.points.length - 1] as Point].some((p) => onFace(p, u, face) || onFace(p, v, face)));
      if (taken) continue;
      const pts = around(u, v, face);
      if (pts.some((p) => p.x < room.x0 - EPS || p.x > room.x1 + EPS || p.y < room.y0 - EPS || p.y > room.y1 + EPS)) continue;
      const mine = segs(pts);
      if (nodes.some((n) => mine.some((s) => hits(s, n)))) continue;
      const others = edges.filter((f, j) => j !== i && !f.invisible).map((f) => segs(f.points));
      if (others.some((o) => o.some((t) => mine.some((s) => properCross(s, t) || overlap(s, t))))) continue;
      edges[i] = { ...e, points: pts };
      return;
    }
  });
  const moved = { ...layout, edges };
  return unnamed && edges.some((e, i) => e !== layout.edges[i]) ? withinCanvas(moved) : moved;
}
