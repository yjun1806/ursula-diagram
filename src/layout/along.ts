import type { Graph, GraphEdge, Lane } from '../types.ts';
import { structuralEstimate } from './estimate.ts';
import type { AlongSpec } from './lanes-along.ts';

/** The along arrangement is considered only when edges between lanes outnumber edges inside lanes this much. */
export const ALONG_RATIO = 3;
const SWEEPS = 6;

/** Edges inside lanes and edges between lanes, self loops counting as inside. */
function edgeKinds(graph: Graph): { within: GraphEdge[]; between: GraphEdge[] } {
  const laneOf = new Map(graph.nodes.map((n) => [n.id, n.lane] as const));
  const within: GraphEdge[] = [];
  const between: GraphEdge[] = [];
  for (const e of graph.edges) {
    const a = laneOf.get(e.from);
    const b = laneOf.get(e.to);
    if (a === undefined || b === undefined) continue;
    (a === b ? within : between).push(e);
  }
  return { within, between };
}

/** Cheap structural test: two labelled lanes at least and far more edges between lanes than inside them. */
export function considerAlong(graph: Graph): boolean {
  if (graph.lanes.filter((l) => l.label !== '').length < 2) return false;
  const { within, between } = edgeKinds(graph);
  return between.length >= 2 && between.length >= ALONG_RATIO * within.length;
}

/** Columns of one lane: longest path over its own edges, cycles broken by a depth-first search. */
function laneColumns(ids: string[], edges: GraphEdge[]): Map<string, number> {
  const index = new Map(ids.map((id, i) => [id, i] as const));
  const out: number[][] = ids.map(() => []);
  for (const e of edges) {
    const a = index.get(e.from);
    const b = index.get(e.to);
    if (a !== undefined && b !== undefined && a !== b) out[a]?.push(b);
  }
  const state = new Array<number>(ids.length).fill(0);
  const back = new Set<string>();
  const visit = (u: number): void => {
    state[u] = 1;
    for (const v of out[u] ?? []) {
      if (state[v] === 1) back.add(`${u}>${v}`);
      else if (state[v] === 0) visit(v);
    }
    state[u] = 2;
  };
  ids.forEach((_, i) => {
    if (state[i] === 0) visit(i);
  });
  const next: number[][] = ids.map(() => []);
  const pending = new Array<number>(ids.length).fill(0);
  out.forEach((targets, u) => {
    for (const v of targets) {
      const [a, b] = back.has(`${u}>${v}`) ? [v, u] : [u, v];
      next[a]?.push(b);
      pending[b] = (pending[b] ?? 0) + 1;
    }
  });
  const col = new Array<number>(ids.length).fill(0);
  const queue: number[] = [];
  pending.forEach((p, i) => {
    if (p === 0) queue.push(i);
  });
  for (let head = 0; head < queue.length; head++) {
    const u = queue[head] ?? 0;
    for (const v of next[u] ?? []) {
      col[v] = Math.max(col[v] ?? 0, (col[u] ?? 0) + 1);
      pending[v] = (pending[v] ?? 0) - 1;
      if (pending[v] === 0) queue.push(v);
    }
  }
  return new Map(ids.map((id, i) => [id, col[i] ?? 0] as const));
}

/** Lanes ordered by net edge direction: lanes that mostly send come first; ties keep source order. */
function orderLanes(graph: Graph): Lane[] {
  const laneOf = new Map(graph.nodes.map((n) => [n.id, n.lane] as const));
  const net = new Map<string, number>(graph.lanes.map((l) => [l.id, 0] as const));
  for (const e of edgeKinds(graph).between) {
    const a = laneOf.get(e.from) ?? '';
    const b = laneOf.get(e.to) ?? '';
    net.set(a, (net.get(a) ?? 0) + 1);
    net.set(b, (net.get(b) ?? 0) - 1);
  }
  return graph.lanes
    .map((l, i) => ({ l, i }))
    .sort((x, y) => (net.get(y.l.id) ?? 0) - (net.get(x.l.id) ?? 0) || x.i - y.i)
    .map((x) => x.l);
}

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 === 1 ? (s[m] ?? 0) : ((s[m - 1] ?? 0) + (s[m] ?? 0)) / 2;
};

export interface AlongArrangement {
  /** The graph with a single lane; ranks and rows below refer to it. */
  graph: Graph;
  rank: Map<string, number>;
  row: Map<string, number>;
  spec: AlongSpec;
  /** Lanes in flow order, and the column of each node inside its lane. */
  lanes: Lane[];
  col: Map<string, number>;
  /** The graph as given. */
  source: Graph;
}

const dense = (values: Map<string, number>): Map<string, number> => {
  const used = [...new Set(values.values())].sort((a, b) => a - b);
  const at = new Map(used.map((v, i) => [v, i] as const));
  return new Map([...values].map(([id, v]) => [id, at.get(v) ?? 0] as const));
};

/** Builds the arrangement for a column inside the lane and a row of every node. */
function assemble(source: Graph, lanes: Lane[], colIn: Map<string, number>, rowIn: Map<string, number>): AlongArrangement {
  const col = new Map<string, number>();
  const rank = new Map<string, number>();
  const starts: number[] = [];
  let offset = 0;
  for (const lane of lanes) {
    const ids = source.nodes.filter((n) => n.lane === lane.id).map((n) => n.id);
    const own = dense(new Map(ids.map((id) => [id, colIn.get(id) ?? 0] as const)));
    starts.push(offset);
    for (const id of ids) {
      col.set(id, own.get(id) ?? 0);
      rank.set(id, offset + (own.get(id) ?? 0));
    }
    offset += ids.length === 0 ? 0 : Math.max(...own.values()) + 1;
  }
  const laneOf = new Map(source.nodes.map((n) => [n.id, n.lane] as const));
  const single = { id: '__along', label: '' };
  return {
    graph: { ...source, lanes: [single], nodes: source.nodes.map((n) => ({ ...n, lane: single.id })) },
    rank,
    row: dense(rowIn),
    spec: { lanes: lanes.map((l) => ({ id: l.id, label: l.label })), starts, laneOf },
    lanes,
    col,
    source,
  };
}

/**
 * Places lanes one after another along the flow axis. Every lane owns one or more rank columns;
 * the nodes of a column are stacked across the flow axis. The stack order comes from barycentre
 * sweeps over the layers, and rows are then chosen so that partners line up.
 */
export function arrangeAlong(graph: Graph): AlongArrangement {
  const lanes = orderLanes(graph);
  const { within } = edgeKinds(graph);
  const col = new Map<string, number>();
  for (const lane of lanes) {
    const ids = graph.nodes.filter((n) => n.lane === lane.id).map((n) => n.id);
    const set = new Set(ids);
    for (const [id, c] of laneColumns(ids, within.filter((e) => set.has(e.from) && set.has(e.to)))) col.set(id, c);
  }
  const rank = assemble(graph, lanes, col, new Map()).rank;
  const ranks = Math.max(0, ...rank.values()) + 1;

  // Layers: nodes of one rank column, in source order to begin with.
  const layers: string[][] = Array.from({ length: ranks }, () => []);
  for (const n of graph.nodes) layers[rank.get(n.id) ?? 0]?.push(n.id);
  const edges = graph.edges.filter((e) => e.from !== e.to && rank.has(e.from) && rank.has(e.to) && rank.get(e.from) !== rank.get(e.to));
  const nbrs = new Map<string, string[]>(graph.nodes.map((n) => [n.id, []]));
  for (const e of edges) {
    nbrs.get(e.from)?.push(e.to);
    nbrs.get(e.to)?.push(e.from);
  }

  const posOf = (): Map<string, number> => {
    const pos = new Map<string, number>();
    for (const layer of layers) layer.forEach((id, i) => pos.set(id, (i + 0.5) / layer.length));
    return pos;
  };
  const crossingsOf = (): number => {
    const pos = new Map<string, number>();
    for (const layer of layers) layer.forEach((id, i) => pos.set(id, i));
    let total = 0;
    for (let i = 0; i < edges.length; i++) {
      for (let j = i + 1; j < edges.length; j++) {
        const a = edges[i];
        const b = edges[j];
        if (!a || !b) continue;
        const [a0, a1] = (rank.get(a.from) ?? 0) <= (rank.get(a.to) ?? 0) ? [a.from, a.to] : [a.to, a.from];
        const [b0, b1] = (rank.get(b.from) ?? 0) <= (rank.get(b.to) ?? 0) ? [b.from, b.to] : [b.to, b.from];
        if (rank.get(a0) !== rank.get(b0) || rank.get(a1) !== rank.get(b1)) continue;
        const d = ((pos.get(a0) ?? 0) - (pos.get(b0) ?? 0)) * ((pos.get(a1) ?? 0) - (pos.get(b1) ?? 0));
        if (d < 0) total++;
      }
    }
    return total;
  };
  const sweep = (order: number[]): void => {
    for (const r of order) {
      const layer = layers[r];
      if (!layer || layer.length < 2) continue;
      const pos = posOf();
      const keyed = layer.map((id, i) => {
        const near = nbrs.get(id) ?? [];
        return { id, i, key: near.length === 0 ? (pos.get(id) ?? 0) : median(near.map((o) => pos.get(o) ?? 0)) };
      });
      keyed.sort((a, b) => a.key - b.key || a.i - b.i);
      layers[r] = keyed.map((k) => k.id);
    }
  };
  const upRanks = Array.from({ length: ranks }, (_, i) => i);
  let best = layers.map((l) => [...l]);
  let bestCross = crossingsOf();
  for (let pass = 0; pass < SWEEPS; pass++) {
    if (pass % 2 === 0) sweep(upRanks);
    else sweep([...upRanks].reverse());
    const c = crossingsOf();
    if (c < bestCross) {
      bestCross = c;
      best = layers.map((l) => [...l]);
    }
  }
  best.forEach((l, i) => {
    layers[i] = l;
  });

  // Rows: the tallest layer keeps consecutive rows; the others sit at the median row of the partners already placed.
  const row = new Map<string, number>();
  const anchor = layers.reduce((b, l, i) => (l.length > (layers[b]?.length ?? 0) ? i : b), 0);
  (layers[anchor] ?? []).forEach((id, i) => row.set(id, i));
  const place = (r: number): void => {
    const layer = layers[r] ?? [];
    let prev = -1;
    for (const id of layer) {
      const rows = (nbrs.get(id) ?? []).flatMap((o) => (row.has(o) ? [row.get(o) ?? 0] : []));
      const want = rows.length === 0 ? prev + 1 : Math.round(median(rows));
      const at = Math.max(want, prev + 1);
      row.set(id, at);
      prev = at;
    }
  };
  for (let r = anchor - 1; r >= 0; r--) place(r);
  for (let r = anchor + 1; r < ranks; r++) place(r);
  return assemble(graph, lanes, col, row);
}

/** Routed evaluations the refinement may spend, after the one for the constructed arrangement. */
export const ALONG_REFINE = 6;

/** Structural estimate of an arrangement: rank columns along the flow axis, rows across it. */
export function alongEstimate(a: AlongArrangement): number {
  const slots = new Map(a.source.nodes.map((n) => [n.id, { flow: a.rank.get(n.id) ?? 0, cross: a.row.get(n.id) ?? 0 }] as const));
  return structuralEstimate(a.source.edges, slots);
}

/** Every arrangement one move away: a node to another column of its lane and another row (swapping with its occupant), or a rank column shifted. */
function neighbours(best: AlongArrangement, columns: boolean): AlongArrangement[] {
  const ids = best.source.nodes.map((n) => n.id);
  const laneOf = new Map(best.source.nodes.map((n) => [n.id, n.lane] as const));
  const top = Math.max(...best.row.values());
  const out: AlongArrangement[] = [];
  for (const id of ids) {
    const c0 = best.col.get(id) ?? 0;
    const r0 = best.row.get(id) ?? 0;
    const laneCols = Math.max(...ids.filter((o) => laneOf.get(o) === laneOf.get(id)).map((o) => best.col.get(o) ?? 0)) + 1;
    for (let c = columns ? -1 : c0; c <= (columns ? laneCols : c0); c++) {
      for (let r = -1; r <= top + 1; r++) {
        if (c === c0 && r === r0) continue;
        const col = new Map(best.col);
        const row = new Map(best.row);
        const other = ids.find((o) => o !== id && laneOf.get(o) === laneOf.get(id) && best.col.get(o) === c && best.row.get(o) === r);
        col.set(id, c);
        row.set(id, r);
        if (other !== undefined) {
          col.set(other, c0);
          row.set(other, r0);
        }
        out.push(assemble(best.source, best.lanes, col, row));
      }
    }
  }
  for (const column of new Set(best.rank.values())) {
    for (const shift of [-2, -1, 1, 2]) {
      const row = new Map(best.row);
      for (const id of ids) if (best.rank.get(id) === column) row.set(id, (best.row.get(id) ?? 0) + shift);
      out.push(assemble(best.source, best.lanes, best.col, row));
    }
  }
  return out;
}

const POLISH_ROUNDS = 4;
const CROSSING_ESTIMATE = 1000;

/** Moves nodes while the structural estimate drops; no routing. Bounded and deterministic. */
export function polishAlong(start: AlongArrangement): AlongArrangement {
  let best = start;
  let bestEstimate = alongEstimate(best);
  if (bestEstimate === 0) return best;
  for (let round = 0; round < POLISH_ROUNDS; round++) {
    let next = best;
    let nextEstimate = bestEstimate;
    // Rows alone are tried first; columns are moved only while crossings remain.
    for (const a of neighbours(best, bestEstimate >= CROSSING_ESTIMATE)) {
      const est = alongEstimate(a);
      if (est < nextEstimate) {
        next = a;
        nextEstimate = est;
      }
    }
    if (next === best) break;
    best = next;
    bestEstimate = nextEstimate;
  }
  return best;
}

/**
 * Improves the arrangement with at most ALONG_REFINE routed evaluations. Neighbours are ranked by the
 * structural estimate and only those estimated no worse than the start are tried, best first;
 * the one with the best routed score wins if it beats the start. Deterministic.
 */
export function refineAlong(
  start: AlongArrangement,
  startScore: number,
  score: (arranged: AlongArrangement) => number,
): AlongArrangement {
  const base = alongEstimate(start);
  const seen = new Set<string>([JSON.stringify([...start.rank, ...start.row])]);
  const ranked: Array<{ a: AlongArrangement; est: number; at: number }> = [];
  neighbours(start, true).forEach((a, at) => {
    const key = JSON.stringify([...a.rank, ...a.row]);
    if (seen.has(key)) return;
    seen.add(key);
    const est = alongEstimate(a);
    if (est <= base) ranked.push({ a, est, at });
  });
  ranked.sort((x, y) => x.est - y.est || x.at - y.at);
  let best = start;
  let bestScore = startScore;
  for (const { a } of ranked.slice(0, ALONG_REFINE)) {
    const s = score(a);
    if (s < bestScore - 1e-9) {
      best = a;
      bestScore = s;
    }
  }
  return best;
}
