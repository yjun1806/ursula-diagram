import type { Graph } from '../types.ts';
import type { Rows } from './rows.ts';

interface Link {
  a: number;
  b: number;
  /** 1 for an edge inside a lane, 0 for an edge between lanes. */
  w: number;
  main: boolean;
}

/**
 * Stage of every node: the place of the node in the flow, whichever lane it is in. An edge inside a lane moves
 * the stage on by one, an edge between lanes keeps it. Cycles are cut on edges that are not part of the main
 * flow; nodes without incoming edges are as late as their partners allow; nodes in one lane that lead to the
 * same nodes share the later stage; nodes the flow ends in stand one stage behind everything that leads to them.
 */
export function stageOf(graph: Graph, rows: Rows): number[] {
  const n = graph.nodes.length;
  const index = new Map(graph.nodes.map((node, i) => [node.id, i] as const));
  const laneOf = graph.nodes.map((node) => node.lane);
  const onMain = new Set<string>();
  rows.main.forEach((v, i) => {
    const next = rows.main[i + 1];
    if (next !== undefined) onMain.add(`${v}|${next}`);
  });
  const links: Link[] = [];
  graph.edges.forEach((e, edge) => {
    const a = index.get(e.from);
    const b = index.get(e.to);
    if (a === undefined || b === undefined || a === b || e.unranked === true) return;
    const same = laneOf[a] === laneOf[b];
    const [from, to] = same && rows.reversed[edge] ? [b, a] : [a, b];
    links.push({ a: from, b: to, w: same ? 1 : 0, main: onMain.has(`${from}|${to}`) });
  });

  // Cut cycles by a depth-first walk that starts on the main flow and follows its edges first.
  const out = Array.from({ length: n }, (): Link[] => []);
  for (const l of links) out[l.a]?.push(l);
  for (const list of out) list.sort((x, y) => Number(y.main) - Number(x.main));
  const state = new Array<0 | 1 | 2>(n).fill(0);
  const kept: Link[] = [];
  const visit = (v: number): void => {
    state[v] = 1;
    for (const l of out[v] ?? []) {
      if (state[l.b] === 1) continue;
      kept.push(l);
      if (state[l.b] === 0) visit(l.b);
    }
    state[v] = 2;
  };
  for (const v of [...rows.main, ...Array.from({ length: n }, (_, i) => i)]) if (state[v] === 0) visit(v);

  const succ = Array.from({ length: n }, (): Link[] => []);
  const hasIn = new Array<boolean>(n).fill(false);
  for (const l of kept) {
    succ[l.a]?.push(l);
    hasIn[l.b] = true;
  }
  // Topological order of the kept edges.
  const seen = new Array<boolean>(n).fill(false);
  const post: number[] = [];
  const walk = (v: number): void => {
    seen[v] = true;
    for (const l of succ[v] ?? []) if (!seen[l.b]) walk(l.b);
    post.push(v);
  };
  for (let v = 0; v < n; v++) if (!seen[v]) walk(v);
  const topo = post.reverse();
  const forward = (floor: number[]): number[] => {
    const s = [...floor];
    for (const v of topo) for (const l of succ[v] ?? []) s[l.b] = Math.max(s[l.b] ?? 0, (s[v] ?? 0) + l.w);
    return s;
  };

  let floor = new Array<number>(n).fill(0);
  let s = forward(floor);
  // Nodes of one lane with the same set of successors stand in the later stage.
  const groups = new Map<string, number[]>();
  for (let v = 0; v < n; v++) {
    const to = (succ[v] ?? []).map((l) => l.b).sort((x, y) => x - y);
    if (to.length === 0) continue;
    const key = `${laneOf[v]}|${to.join(',')}`;
    groups.set(key, [...(groups.get(key) ?? []), v]);
  }
  for (let round = 0; round < n; round++) {
    let changed = false;
    for (const members of groups.values()) {
      if (members.length < 2) continue;
      const top = Math.max(...members.map((v) => s[v] ?? 0));
      for (const v of members) {
        if ((floor[v] ?? 0) < top) {
          floor = [...floor];
          floor[v] = top;
          changed = true;
        }
      }
    }
    if (!changed) break;
    s = forward(floor);
  }
  // A node the flow ends in stands behind everything that leads to it.
  for (let v = 0; v < n; v++) {
    if ((succ[v] ?? []).length > 0 || !hasIn[v]) continue;
    s[v] = Math.max(s[v] ?? 0, 1 + Math.max(...kept.filter((l) => l.b === v).map((l) => s[l.a] ?? 0)));
  }
  // A node nobody leads to is as late as its partners allow.
  for (let v = 0; v < n; v++) {
    if (hasIn[v] || (succ[v] ?? []).length === 0) continue;
    s[v] = Math.max(s[v] ?? 0, Math.min(...(succ[v] ?? []).map((l) => (s[l.b] ?? 0) - l.w)));
  }
  return s;
}
