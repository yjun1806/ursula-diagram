import type { Direction, Graph, GraphCluster, GraphEdge, GraphNode } from '../types.ts';
import type { ArchEdge, Architecture, Side } from './model.ts';

const LANE = '';
const LEVEL: ReadonlySet<Side> = new Set<Side>(['L', 'R']);

/** Whether the line runs against the reading direction as written: it leaves `from` on the side the drawing reads from. */
const against = (e: ArchEdge, direction: Direction): boolean => (direction === 'LR' ? e.fromSide === 'L' && e.toSide === 'R' : e.fromSide === 'T' && e.toSide === 'B');

/**
 * The drawing as a graph of boxes, for a terminal: a service is a box with its icon name under the label, a junction a
 * dot, a group a cluster. The sides the lines are written with give the reading direction (left to right when most
 * lines join a left and a right side) and turn every line so that it runs along it; where a box stands is left to the layout.
 */
export function architectureGraph(model: Architecture): Graph {
  const level = model.edges.filter((e) => LEVEL.has(e.fromSide) && LEVEL.has(e.toSide)).length;
  const upright = model.edges.filter((e) => !LEVEL.has(e.fromSide) && !LEVEL.has(e.toSide)).length;
  const direction: Direction = level > upright ? 'LR' : 'TD';
  const clusters: GraphCluster[] = model.groups.map((g) => ({ id: `group:${g.id}`, label: g.label, ...(g.parent === undefined ? {} : { parent: `group:${g.parent}` }) }));
  const nodes: GraphNode[] = model.nodes.map((n) => ({
    id: n.id,
    title: n.kind === 'junction' ? '' : n.label,
    lines: n.kind === 'junction' || n.icon === undefined ? [] : [`[${n.icon}]`],
    shape: n.kind === 'junction' ? 'start-dot' : 'rect',
    lane: LANE,
    ...(n.parent === undefined ? {} : { cluster: `group:${n.parent}` }),
  }));
  const groupOf = new Map(model.nodes.map((n) => [n.id, n.parent]));
  const endOf = (id: string, group: boolean): string => (group && groupOf.get(id) !== undefined ? `group:${groupOf.get(id)}` : id);
  const edges: GraphEdge[] = model.edges.map((e) => {
    const turn = against(e, direction);
    const [from, to] = [endOf(e.from, e.fromGroup), endOf(e.to, e.toGroup)];
    const [startArrow, endArrow] = turn ? [e.endArrow, e.startArrow] : [e.startArrow, e.endArrow];
    return { from: turn ? to : from, to: turn ? from : to, style: 'normal', end: endArrow ? 'arrow' : 'none', ...(startArrow ? { startEnd: 'arrow' as const } : {}) };
  });
  return { direction, lanes: [{ id: LANE, label: '' }], clusters, nodes, edges };
}
