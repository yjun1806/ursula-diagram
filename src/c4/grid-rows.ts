import type { Graph, GridSpec } from '../types.ts';

/** What the rows of a grid drawing are: a row per node with a line or a place asked for, and who stands beside whom. */
export interface GridRows {
  /** Row of every node that has a line to another node or a place asked for; the first row is 0. */
  row: Map<string, number>;
  /** Pairs asked to stand in one row, the left one first. */
  beside: Array<[string, string]>;
}

interface Ask {
  /** `below`: `b` stands in a row below `a`; `beside`: `b` stands right of `a` in its row. */
  kind: 'below' | 'beside';
  a: string;
  b: string;
  /** Rank of the rule that asks: the hint of the source, a person on the start side, the end written first, the line. */
  tier: number;
  step: number;
  index: number;
}

export const emptySpec = (graph: Graph): GridSpec => ({
  hints: [],
  upper: [],
  steps: [],
  lays: [],
  starts: [],
  order: [...graph.nodes.map((n) => n.id), ...(graph.clusters ?? []).map((c) => c.id)],
  shapeInRow: 4,
  boundaryInRow: 2,
});

function asksOf(graph: Graph, spec: GridSpec): Ask[] {
  const nodes = new Set(graph.nodes.map((n) => n.id));
  const starts = new Set(spec.starts);
  const asks: Ask[] = [];
  const hinted = (a: string, b: string, hint: string, tier: number, step: number, index: number): void => {
    if (hint === 'down') asks.push({ kind: 'below', a, b, tier, step, index });
    else if (hint === 'up') asks.push({ kind: 'below', a: b, b: a, tier, step, index });
    else if (hint === 'right') asks.push({ kind: 'beside', a, b, tier, step, index });
    else asks.push({ kind: 'beside', a: b, b: a, tier, step, index });
  };
  // A line to a boundary stands its other end above or below everything in the boundary, after every other rule.
  const inside = (cid: string): string[] => graph.nodes.filter((n) => {
    for (let at = n.cluster; at !== undefined; at = graph.clusters?.find((c) => c.id === at)?.parent) if (at === cid) return true;
    return false;
  }).map((n) => n.id);
  const clusterIds = new Set((graph.clusters ?? []).map((c) => c.id));
  graph.edges.forEach((e, index) => {
    const [fromBox, toBox] = [clusterIds.has(e.from), clusterIds.has(e.to)];
    if (fromBox !== toBox && (nodes.has(e.from) || nodes.has(e.to))) {
      const hint = spec.hints[index];
      for (const id of inside(fromBox ? e.from : e.to)) {
        const [a, b] = fromBox ? [id, e.to] : [e.from, id];
        if (a === b) continue;
        if (hint === 'up' || hint === 'down') hinted(a, b, hint, 0, Infinity, index);
        else if (hint === undefined) asks.push({ kind: 'below', a, b, tier: 4, step: Infinity, index });
      }
      return;
    }
    if (!nodes.has(e.from) || !nodes.has(e.to) || e.from === e.to) return;
    const hint = spec.hints[index];
    const step = spec.steps[index] ?? Infinity;
    if (hint !== undefined) return hinted(e.from, e.to, hint, 0, step, index);
    if (starts.has(e.from) !== starts.has(e.to)) {
      const [a, b] = starts.has(e.from) ? [e.from, e.to] : [e.to, e.from];
      asks.push({ kind: 'below', a, b, tier: 1, step, index });
      return;
    }
    const upper = spec.upper[index];
    if (upper !== undefined) {
      const [a, b] = upper === 'from' ? [e.from, e.to] : [e.to, e.from];
      asks.push({ kind: 'below', a, b, tier: 2, step, index });
      return;
    }
    asks.push({ kind: 'below', a: e.from, b: e.to, tier: 3, step, index });
  });
  spec.lays.forEach((l, k) => {
    if (nodes.has(l.from) && nodes.has(l.to) && l.from !== l.to) hinted(l.from, l.to, l.hint, 0, Infinity, graph.edges.length + k);
  });
  return asks.sort((x, y) => x.tier - y.tier || x.step - y.step || x.index - y.index);
}

/**
 * The rows of the nodes that have lines: in turn a hint of the source, a person above what it uses, the end written first
 * above for a line whose arrowheads do not tell, the steps of a dynamic diagram, and the order of writing. A line that
 * would close a cycle of the ones read before it is read the other way. The rows are the longest paths from the top; a
 * node that only starts lines stands right above the first of the nodes it reaches.
 */
export function gridRows(graph: Graph, spec: GridSpec): GridRows {
  const asks = asksOf(graph, spec);
  const group = new Map<string, string>();
  const find = (id: string): string => {
    let at = id;
    while ((group.get(at) ?? at) !== at) at = group.get(at) as string;
    return at;
  };
  for (const a of asks) for (const id of [a.a, a.b]) if (!group.has(id)) group.set(id, id);
  const below: Array<[string, string]> = [];
  const reaches = (from: string, to: string): boolean => {
    const seen = new Set<string>([from]);
    const stack = [from];
    while (stack.length > 0) {
      const at = stack.pop() as string;
      if (at === to) return true;
      for (const [a, b] of below) {
        const [ga, gb] = [find(a), find(b)];
        if (ga === at && !seen.has(gb)) {
          seen.add(gb);
          stack.push(gb);
        }
      }
    }
    return false;
  };
  const beside: Array<[string, string]> = [];
  for (const ask of asks) {
    const [ga, gb] = [find(ask.a), find(ask.b)];
    if (ask.kind === 'beside') {
      if (ga !== gb && (reaches(ga, gb) || reaches(gb, ga))) continue;
      group.set(gb, ga);
      beside.push([ask.a, ask.b]);
      continue;
    }
    if (ga === gb || reaches(gb, ga)) continue;
    below.push([ask.a, ask.b]);
  }
  const groups = [...new Set([...group.keys()].map(find))];
  const preds = new Map<string, Set<string>>(groups.map((g) => [g, new Set<string>()]));
  const succs = new Map<string, Set<string>>(groups.map((g) => [g, new Set<string>()]));
  for (const [a, b] of below) {
    preds.get(find(b))?.add(find(a));
    succs.get(find(a))?.add(find(b));
  }
  const rank = new Map<string, number>();
  const waiting = new Map(groups.map((g) => [g, preds.get(g)?.size ?? 0]));
  const ready = groups.filter((g) => waiting.get(g) === 0);
  const sorted: string[] = [];
  while (ready.length > 0) {
    const g = ready.shift() as string;
    sorted.push(g);
    rank.set(g, Math.max(0, ...[...(preds.get(g) ?? [])].map((p) => (rank.get(p) ?? 0) + 1)));
    for (const s of succs.get(g) ?? []) {
      waiting.set(s, (waiting.get(s) ?? 0) - 1);
      if (waiting.get(s) === 0) ready.push(s);
    }
  }
  for (const g of [...sorted].reverse()) {
    const after = [...(succs.get(g) ?? [])];
    if ((preds.get(g)?.size ?? 0) === 0 && after.length > 0) rank.set(g, Math.min(...after.map((s) => rank.get(s) ?? 0)) - 1);
  }
  const row = new Map<string, number>();
  for (const id of group.keys()) row.set(id, rank.get(find(id)) ?? 0);
  return { row, beside };
}
