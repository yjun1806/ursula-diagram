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
function rankComponent(graph: Graph): Map<string, number> {
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

/** Weakly connected components as lists of node ids, ordered by their first node in source order. */
export function components(graph: Graph): string[][] {
  const ids = graph.nodes.map((n) => n.id);
  const parent = new Map(ids.map((id) => [id, id] as const));
  const find = (x: string): string => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r) ?? r;
    return r;
  };
  for (const e of graph.edges) {
    if (!parent.has(e.from) || !parent.has(e.to)) continue;
    const a = find(e.from);
    const b = find(e.to);
    if (a !== b) parent.set(b, a);
  }
  const groups = new Map<string, string[]>();
  for (const id of ids) {
    const root = find(id);
    const list = groups.get(root) ?? [];
    list.push(id);
    groups.set(root, list);
  }
  return [...groups.values()];
}

/**
 * Assigns a rank to every node. Each weakly connected component is ranked on its
 * own; the components are then placed side by side along the flow axis, in source
 * order. A component moves into ranks an earlier component leaves free only when
 * none of its lanes is used there, so unrelated nodes never share a lane and a
 * rank column.
 */
export function assignRanks(graph: Graph): Map<string, number> {
  const out = new Map<string, number>();
  const used = new Map<string, Array<[number, number]>>();
  const free = (lane: string, lo: number, hi: number): boolean =>
    !(used.get(lane) ?? []).some(([a, b]) => lo <= b && a <= hi);
  for (const ids of components(graph)) {
    const set = new Set(ids);
    const sub: Graph = {
      ...graph,
      nodes: graph.nodes.filter((n) => set.has(n.id)),
      edges: graph.edges.filter((e) => set.has(e.from) && set.has(e.to)),
    };
    const local = rankComponent(sub);
    const lanes = [...new Set(sub.nodes.map((n) => n.lane))];
    const width = Math.max(0, ...local.values());
    // Components that share a lane are kept apart by one extra rank so their edges cannot touch.
    let offset = 0;
    while (!lanes.every((lane) => free(lane, offset - 1, offset + width + 1))) offset++;
    for (const n of sub.nodes) out.set(n.id, (local.get(n.id) ?? 0) + offset);
    for (const lane of lanes) used.set(lane, [...(used.get(lane) ?? []), [offset, offset + width]]);
  }
  const distinct = [...new Set(out.values())].sort((a, b) => a - b);
  const dense = new Map(distinct.map((r, i) => [r, i] as const));
  return new Map([...out].map(([id, r]) => [id, dense.get(r) ?? 0] as const));
}
