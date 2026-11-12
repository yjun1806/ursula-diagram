import type { Diagnostic, Layout, LayoutNode, Point } from '../types.ts';

export type BoxSide = 'left' | 'right' | 'top' | 'bottom';

const SIDES: readonly BoxSide[] = ['left', 'right', 'top', 'bottom'];

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
 * Edge ends that break the rule that edges leaving or arriving the same way at a node use the same side: among the
 * ends of a node that look the same way (two or more), every end that is not on that way's side.
 */
export function mixedSideEnds(l: Pick<Layout, 'nodes' | 'edges'>, d: Directions): Diagnostic[] {
  const nodeAt = new Map(l.nodes.map((n, i) => [n.id, i] as const));
  // Groups in the order they are first met: a node and the side its edges to partners looking the same way should use.
  const groupAt = new Int32Array(l.nodes.length * SIDES.length).fill(-1);
  const groups: Array<{ node: LayoutNode; side: BoxSide; ends: Array<{ actual: BoxSide; edge: number }> }> = [];
  l.edges.forEach((e, i) => {
    const ia = nodeAt.get(e.from);
    const ib = nodeAt.get(e.to);
    const first = e.points[0];
    const last = e.points[e.points.length - 1];
    if (ia === undefined || ib === undefined || ia === ib || !first || !last) return;
    const a = l.nodes[ia] as LayoutNode;
    const b = l.nodes[ib] as LayoutNode;
    for (const [at, node, other, p] of [[ia, a, b, first], [ib, b, a, last]] as const) {
      const side = designatedSide(node, other, d);
      const k = at * SIDES.length + SIDES.indexOf(side);
      let g = groupAt[k] as number;
      if (g < 0) {
        g = groupAt[k] = groups.length;
        groups.push({ node, side, ends: [] });
      }
      (groups[g] as { ends: Array<{ actual: BoxSide; edge: number }> }).ends.push({ actual: sideOfPoint(node, p), edge: i });
    }
  });
  const out: Diagnostic[] = [];
  for (const { node, side, ends } of groups) {
    if (ends.length < 2) continue;
    const id = node.id;
    for (const end of ends) {
      if (end.actual !== side) {
        const e = l.edges[end.edge] as Layout['edges'][number];
        out.push({ kind: 'mixed-side', nodes: [id], message: `The end of ${e.from} -> ${e.to} at ${id} is on the ${end.actual}, but other edges that look the same way use the ${side}.` });
      }
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
