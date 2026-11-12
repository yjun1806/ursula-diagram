// sides.ts as it was before the rewrite on indexes; kept as it was.
import type { Diagnostic, Layout, LayoutNode, Point } from '../src/types.ts';

export type BoxSide = 'left' | 'right' | 'top' | 'bottom';

/** What decides the side an edge is meant to use: the drawing's axes and the order of its bands. */
export interface Directions {
  /** Bands stand across the reading direction (the stages composition). */
  stages: boolean;
  /** Layers run along x: the drawing is a top-down one in its own axes. */
  td: boolean;
  /** Position of every band (lane id) along the axis they are ordered on. */
  order: ReadonlyMap<string, number>;
}

/**
 * The side of `node` that an edge to `other` is meant to use. Lanes: another lane or another row of the lane is up
 * or down, the same row is ahead (right) or behind (left). Stages: a later band is ahead, an earlier one behind,
 * and the same band is up or down along the stack. A top-down drawing is the same turned over: ahead is down.
 */
export function designatedSide(node: LayoutNode, other: LayoutNode, d: Directions): BoxSide {
  const EPS = 0.5;
  const later = (d.order.get(other.lane) ?? 0) > (d.order.get(node.lane) ?? 0);
  if (!d.td) {
    if (d.stages) return other.lane !== node.lane ? (later ? 'bottom' : 'top') : other.x < node.x ? 'left' : 'right';
    if (Math.abs(other.y - node.y) > EPS) return other.y < node.y ? 'top' : 'bottom';
    return other.x > node.x ? 'right' : 'left';
  }
  if (d.stages) return other.lane !== node.lane ? (later ? 'right' : 'left') : other.y < node.y ? 'top' : 'bottom';
  if (Math.abs(other.x - node.x) > EPS) return other.x < node.x ? 'left' : 'right';
  return other.y > node.y ? 'bottom' : 'top';
}

/** The side of `node` the point lies on. */
export function sideOfPoint(node: LayoutNode, p: Point): BoxSide {
  const EPS = 0.75;
  if (Math.abs(p.y - node.y) < EPS) return 'top';
  if (Math.abs(p.y - node.y - node.h) < EPS) return 'bottom';
  if (Math.abs(p.x - node.x) < EPS) return 'left';
  return 'right';
}

/**
 * How the partner stands against the node along the axis across the layers: 0 when their ranges overlap, 1 or -1 when the
 * partner lies wholly to one side. An edge to a partner that stands clear of the node may leave through the node's side.
 */
function clearSide(node: LayoutNode, other: LayoutNode, td: boolean): number {
  const [n0, n1, o0, o1] = td ? [node.y, node.y + node.h, other.y, other.y + other.h] : [node.x, node.x + node.w, other.x, other.x + other.w];
  if (o0 >= n1 - 1e-6) return 1;
  if (o1 <= n0 + 1e-6) return -1;
  return 0;
}

/**
 * Edge ends that break the rule that edges leaving or arriving the same way at a node use the same side: among the
 * ends of a node that look the same way (two or more), every end that is not on that way's side. Partners that stand wholly
 * to one side of the node look another way than partners that overlap it, and each such side is a way of its own; the
 * ends of such a way may use any one face, as long as they use the same one.
 */
export function mixedSideEnds(l: Pick<Layout, 'nodes' | 'edges'>, d: Directions): Diagnostic[] {
  const byId = new Map(l.nodes.map((n) => [n.id, n] as const));
  const groups = new Map<string, { id: string; side: BoxSide; clear: number; ends: Array<{ actual: BoxSide; edge: string }> }>();
  for (const e of l.edges) {
    const a = byId.get(e.from);
    const b = byId.get(e.to);
    const first = e.points[0];
    const last = e.points[e.points.length - 1];
    if (!a || !b || a === b || !first || !last) continue;
    for (const [node, other, p] of [[a, b, first], [b, a, last]] as const) {
      const side = designatedSide(node, other, d);
      const clear = clearSide(node, other, d.td);
      const key = `${node.id}|${side}|${clear}`;
      const group = groups.get(key) ?? { id: node.id, side, clear, ends: [] };
      groups.set(key, { ...group, ends: [...group.ends, { actual: sideOfPoint(node, p), edge: `${e.from} -> ${e.to}` }] });
    }
  }
  const sides: BoxSide[] = ['left', 'right', 'top', 'bottom'];
  const out: Diagnostic[] = [];
  for (const { id, side: designated, clear, ends } of groups.values()) {
    if (ends.length < 2) continue;
    // Ends of a way that partners standing clear of the node look: the face most of them use, the designated one on a tie.
    const used = (s: BoxSide): number => ends.filter((end) => end.actual === s).length;
    const common = sides.reduce((best, s) => (used(s) > used(best) ? s : best), designated);
    const side = clear === 0 ? designated : used(designated) >= used(common) ? designated : common;
    for (const end of ends) {
      if (end.actual !== side) out.push({ kind: 'mixed-side', nodes: [id], message: `The end of ${end.edge} at ${id} is on the ${end.actual}, but other edges that look the same way use the ${side}.` });
    }
  }
  return out;
}

/** The context of a finished layout (one made by the layered engine; a layout without a composition is lanes). */
export function directionsOf(l: Pick<Layout, 'lanes' | 'direction' | 'composition'>): Directions {
  const stages = l.composition === 'stages';
  // Stages are drawn as lanes of the turned-over reading direction, so their layers run the other way.
  const td = stages ? l.direction === 'LR' : l.direction === 'TD';
  return { stages, td, order: new Map(l.lanes.map((lane, i) => [lane.id, i] as const)) };
}
