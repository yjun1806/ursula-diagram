import type { Graph } from '../types.ts';

/**
 * How lane bands relate to the reading direction: `lanes` run alongside it, `stages` cross it and follow one
 * another in reading order.
 */
export type Composition = 'lanes' | 'stages';

export interface ZonePlan {
  composition: Composition;
  /** Indexes into `graph.lanes` in drawing order: bands that touch an edge first, bands without any edge last. */
  order: number[];
}

/** Reading-order rank of every band, or undefined when the bands send edges back and forth. */
function stageRanks(count: number, links: Array<[number, number]>, active: number[]): Map<number, number> | undefined {
  const rank = new Map<number, number>(active.map((z) => [z, 0] as const));
  for (let round = 0; round <= active.length; round++) {
    let changed = false;
    for (const [a, b] of links) {
      if ((rank.get(b) ?? 0) < (rank.get(a) ?? 0) + 1) {
        rank.set(b, (rank.get(a) ?? 0) + 1);
        changed = true;
      }
    }
    if (!changed) return rank;
  }
  void count;
  return undefined;
}

/**
 * Picks the composition. With two or more bands that touch edges, `stages` is chosen when the edges between
 * bands run one way only and are at least as many as the edges inside bands; otherwise `lanes`.
 */
export function planZones(graph: Graph, requested: 'auto' | Composition = 'auto'): ZonePlan {
  const lanes = graph.lanes.length;
  const laneOf = new Map(graph.nodes.map((n) => [n.id, Math.max(0, graph.lanes.findIndex((l) => l.id === n.lane))] as const));
  const firstEdge = graph.edges[0];
  const startLane = firstEdge ? (laneOf.get(firstEdge.from) ?? -1) : -1;
  const touched = new Set<number>();
  const links = new Map<string, [number, number]>();
  let inside = 0;
  let across = 0;
  for (const e of graph.edges) {
    const a = laneOf.get(e.from);
    const b = laneOf.get(e.to);
    if (a === undefined || b === undefined) continue;
    touched.add(a);
    touched.add(b);
    if (a === b) inside++;
    else {
      across++;
      links.set(`${a}|${b}`, [a, b]);
    }
  }
  const active = Array.from({ length: lanes }, (_, i) => i).filter((i) => touched.has(i));
  const aside = Array.from({ length: lanes }, (_, i) => i).filter((i) => !touched.has(i));
  const ranks = stageRanks(lanes, [...links.values()], active);
  const oneWay = ranks !== undefined;
  // Subgraphs of a flowchart follow one another in written order when most lines between them run forward: a third or
  // fewer go back.
  let back = 0;
  for (const [a, b] of links.values()) if (b < a) back++;
  const groups = graph.zones === 'groups' && requested === 'auto' && active.length >= 2 && across > 0 && back * 3 <= links.size;
  const stages = requested === 'stages' || groups || (requested === 'auto' && active.length >= 2 && oneWay && across > 0 && across >= inside);
  // Lanes that are rows of a fixed picture stand in the written order; otherwise the bands no line touches go last.
  const written = Array.from({ length: lanes }, (_, i) => i);
  if (!stages || active.length < 2) return { composition: requested === 'stages' ? 'stages' : 'lanes', order: graph.zones === 'rows' ? written : [...active, ...aside] };
  const order = ranks
    ? [...active].sort((x, y) => (ranks.get(x) ?? 0) - (ranks.get(y) ?? 0) || Number(y === startLane) - Number(x === startLane) || x - y)
    : [...active];
  return { composition: 'stages', order: [...order, ...aside] };
}

/** Whether the drawing has no zones: every node stands in the one unnamed zone the parser makes for nodes outside any subgraph. */
export const unzoned = (graph: { lanes: ReadonlyArray<{ label: string }> }): boolean => graph.lanes.length === 1 && graph.lanes[0]?.label === '';
