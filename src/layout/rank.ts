import type { Graph } from '../types.ts';

interface DagEdge {
  from: number;
  to: number;
  span: number;
}

/**
 * Assigns a rank (slot along the flow axis) to every node.
 *
 * Cycles are broken by a depth-first search in source order; back edges are
 * reversed for ranking only. An edge needs a rank distance of 1 inside a lane and
 * 0 across lanes, so a cross-lane edge can become a short perpendicular line.
 */
export function assignRanks(graph: Graph): Map<string, number> {
  const index = new Map(graph.nodes.map((n, i) => [n.id, i] as const));
  const lane = graph.nodes.map((n) => n.lane);
  const n = graph.nodes.length;

  const out: Array<Array<{ to: number }>> = graph.nodes.map(() => []);
  for (const e of graph.edges) {
    const a = index.get(e.from);
    const b = index.get(e.to);
    if (a === undefined || b === undefined || a === b) continue;
    out[a]?.push({ to: b });
  }

  const state = new Array<number>(n).fill(0);
  const back = new Set<string>();
  const visit = (u: number): void => {
    state[u] = 1;
    for (const { to } of out[u] ?? []) {
      if (state[to] === 1) back.add(`${u}>${to}`);
      else if (state[to] === 0) visit(to);
    }
    state[u] = 2;
  };
  for (let i = 0; i < n; i++) if (state[i] === 0) visit(i);

  const dag: DagEdge[] = [];
  for (const e of graph.edges) {
    const a = index.get(e.from);
    const b = index.get(e.to);
    if (a === undefined || b === undefined || a === b) continue;
    const [from, to] = back.has(`${a}>${b}`) ? [b, a] : [a, b];
    dag.push({ from, to, span: lane[a] === lane[b] ? 1 : 0 });
  }

  const incoming = new Array<number>(n).fill(0);
  const outgoing: DagEdge[][] = graph.nodes.map(() => []);
  for (const e of dag) {
    incoming[e.to] = (incoming[e.to] ?? 0) + 1;
    outgoing[e.from]?.push(e);
  }

  const rank = new Array<number>(n).fill(0);
  const pending = [...incoming];
  const queue: number[] = [];
  for (let i = 0; i < n; i++) if (pending[i] === 0) queue.push(i);
  for (let head = 0; head < queue.length; head++) {
    const u = queue[head] ?? 0;
    for (const e of outgoing[u] ?? []) {
      rank[e.to] = Math.max(rank[e.to] ?? 0, (rank[u] ?? 0) + e.span);
      pending[e.to] = (pending[e.to] ?? 0) - 1;
      if (pending[e.to] === 0) queue.push(e.to);
    }
  }

  // Nodes without incoming edges move next to their successors.
  // Nodes without outgoing edges already sit exactly at their latest predecessor.
  for (let i = 0; i < n; i++) {
    const succ = outgoing[i] ?? [];
    if (incoming[i] === 0 && succ.length > 0) {
      rank[i] = Math.min(...succ.map((e) => (rank[e.to] ?? 0) - e.span));
    }
  }

  const distinct = [...new Set(rank)].sort((a, b) => a - b);
  const dense = new Map(distinct.map((r, i) => [r, i] as const));
  return new Map(graph.nodes.map((node, i) => [node.id, dense.get(rank[i] ?? 0) ?? 0] as const));
}
