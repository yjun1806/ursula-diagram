import type { Graph } from '../types.ts';
import type { Ladder } from './model.ts';
import { pieces } from './model.ts';
import type { Rows } from './rows.ts';

export type Side = 'up' | 'down';

/** Sides a flat edge between non-adjacent nodes may be routed on: inside its lane when the lane has another row. */
export function flatOptions(l: Ladder, layer: number): Side[] {
  const lane = l.layerLane[layer];
  const above = layer > 0 && l.layerLane[layer - 1] === lane;
  const below = layer + 1 < l.layers.length && l.layerLane[layer + 1] === lane;
  if (above || below) return [...(above ? (['up'] as const) : []), ...(below ? (['down'] as const) : [])];
  return ['up', 'down'];
}

interface Adjacency {
  up: number[][];
  down: number[][];
  preds: number[][];
}

function adjacency(l: Ladder, keep?: Set<number>): Adjacency {
  const up = l.nodes.map((): number[] => []);
  const down = l.nodes.map((): number[] => []);
  for (const [a, b] of pieces(l)) {
    up[b]?.push(a);
    down[a]?.push(b);
  }
  const preds = l.nodes.map((): number[] => []);
  for (const f of l.flat) if (!keep || keep.has(l.nodes[f.lo]?.layer ?? -1)) preds[f.hi]?.push(f.lo);
  return { up, down, preds };
}

/** Number of pieces between layer i and layer i + 1 that cross. */
function pairCrossings(order: number[][], pos: number[], adj: Adjacency, i: number): number {
  const upper = order[i];
  if (!upper) return 0;
  const list: Array<[number, number]> = [];
  for (const a of upper) for (const b of adj.down[a] ?? []) list.push([pos[a] ?? 0, pos[b] ?? 0]);
  let total = 0;
  for (let p = 0; p < list.length; p++) {
    for (let q = p + 1; q < list.length; q++) {
      const x = list[p] as [number, number];
      const y = list[q] as [number, number];
      if ((x[0] - y[0]) * (x[1] - y[1]) < 0) total++;
    }
  }
  return total;
}

/** The side a flat edge takes and the crossings it causes there, given the order of its layer. */
export function flatRoute(l: Ladder, order: number[], pos: number[], adj: { up: number[][]; down: number[][] }, lo: number, hi: number, layer: number): { side: Side; cost: number; between: number } {
  const p = pos[lo] ?? 0;
  const q = pos[hi] ?? 0;
  const inside = order.slice(Math.min(p, q) + 1, Math.max(p, q));
  const options = flatOptions(l, layer);
  let best: Side = options[0] ?? 'up';
  let cost = Infinity;
  for (const side of options) {
    const c = inside.reduce((s, n) => s + ((side === 'up' ? adj.up[n] : adj.down[n])?.length ?? 0), 0);
    if (c < cost) {
      cost = c;
      best = side;
    }
  }
  // Only pass-through lines between the ends: one straight segment that crosses each of them once.
  const boxes = inside.filter((n) => n < l.realCount).length;
  if (boxes === 0) return { side: best, cost: inside.length, between: 0 };
  return { side: best, cost, between: boxes };
}

function flatCrossings(l: Ladder, order: number[][], pos: number[], adj: Adjacency, layer: number): number {
  let total = 0;
  const row = order[layer] ?? [];
  for (const f of l.flat) {
    if ((l.nodes[f.lo]?.layer ?? -1) !== layer) continue;
    total += flatRoute(l, row, pos, adj, f.lo, f.hi, layer).cost;
  }
  return total;
}

function setPositions(order: number[][], pos: number[], layer: number): void {
  (order[layer] ?? []).forEach((n, k) => {
    pos[n] = k;
  });
}

/** Takes, among the nodes whose flat-edge predecessors are placed, the one with the smallest key. */
function constrained(nodes: number[], key: (n: number) => number, tie: (n: number) => number, preds: number[][]): number[] {
  const rest = [...nodes];
  const placed = new Set<number>();
  const here = new Set(nodes);
  const out: number[] = [];
  while (rest.length > 0) {
    let pick = -1;
    for (let k = 0; k < rest.length; k++) {
      const n = rest[k] as number;
      if (!(preds[n] ?? []).every((p) => !here.has(p) || placed.has(p))) continue;
      if (pick < 0) {
        pick = k;
        continue;
      }
      const m = rest[pick] as number;
      const dk = key(n) - key(m);
      if (dk < 0 || (dk === 0 && tie(n) < tie(m))) pick = k;
    }
    const chosen = rest.splice(Math.max(0, pick), 1)[0] as number;
    placed.add(chosen);
    out.push(chosen);
  }
  return out;
}

export interface Ordered {
  layers: number[][];
  crossings: number;
}

function components(graph: Graph): number[] {
  const index = new Map(graph.nodes.map((n, i) => [n.id, i] as const));
  const parent = graph.nodes.map((_, i) => i);
  const find = (x: number): number => {
    let r = x;
    while ((parent[r] as number) !== r) r = parent[r] as number;
    return r;
  };
  for (const e of graph.edges) {
    const a = index.get(e.from);
    const b = index.get(e.to);
    if (a === undefined || b === undefined) continue;
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb);
  }
  return graph.nodes.map((_, i) => find(i));
}

const SWEEPS = 12;

/** Stage 3: the order of every layer, by alternating barycentre sweeps and adjacent swaps. */
export function orderLayers(graph: Graph, l: Ladder, rows: Rows, free = false, stage?: number[], loose = false): Ordered {
  // Free: only the layers that hold the main flow keep "the earlier node is on the left"; other flat edges follow their partners.
  const adj = adjacency(l, loose ? new Set<number>() : free ? new Set(rows.main.map((n) => l.nodes[n]?.layer ?? -1)) : undefined);
  // Nodes of an earlier stage stand before nodes of a later stage; only nodes of one stage are ordered by crossings.
  if (stage) {
    for (const row of l.layers) {
      for (const a of row) {
        for (const b of row) if (a < l.realCount && b < l.realCount && (stage[a] ?? 0) < (stage[b] ?? 0)) adj.preds[b]?.push(a);
      }
    }
  }
  const comp = components(graph);
  const keyOf = (n: number): number[] => {
    const o = l.nodes[n]?.origin ?? n;
    return [rows.pathIndex[o] ?? 0, comp[o] ?? 0, rows.pathPos[o] ?? 0, n < l.realCount ? 0 : 1, n < l.realCount ? n : (l.nodes[n]?.chain ?? 0)];
  };
  const compare = (a: number, b: number): number => {
    const x = keyOf(a);
    const y = keyOf(b);
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return (x[i] ?? 0) - (y[i] ?? 0);
    return 0;
  };
  const pos = new Array<number>(l.nodes.length).fill(0);
  let order = l.layers.map((nodes) => {
    const sorted = [...nodes].sort(compare);
    const at = new Map(sorted.map((n, k) => [n, k] as const));
    return constrained(sorted, (n) => at.get(n) ?? 0, (n) => at.get(n) ?? 0, adj.preds);
  });
  order.forEach((_, i) => setPositions(order, pos, i));
  const count = order.length;

  const total = (): number => {
    let sum = 0;
    for (let i = 0; i < count; i++) sum += pairCrossings(order, pos, adj, i) + flatCrossings(l, order, pos, adj, i);
    return sum;
  };
  const local = (i: number): number => {
    let sum = pairCrossings(order, pos, adj, i) + flatCrossings(l, order, pos, adj, i);
    if (i > 0) sum += pairCrossings(order, pos, adj, i - 1);
    return sum;
  };
  const reorder = (i: number, fixed: number[][]): void => {
    const row = order[i] ?? [];
    if (row.length < 2) return;
    const bary = (n: number): number => {
      const ns = fixed[n] ?? [];
      return ns.length === 0 ? (pos[n] ?? 0) : ns.reduce((s, m) => s + (pos[m] ?? 0), 0) / ns.length;
    };
    const prev = [...pos];
    order[i] = constrained(row, bary, (n) => prev[n] ?? 0, adj.preds);
    setPositions(order, pos, i);
  };
  const swaps = (): void => {
    for (let round = 0; round < 40; round++) {
      let improved = false;
      for (let i = 0; i < count; i++) {
        const row = order[i] as number[];
        for (let k = 0; k + 1 < row.length; k++) {
          const a = row[k] as number;
          const b = row[k + 1] as number;
          if ((adj.preds[b] ?? []).includes(a)) continue;
          const before = local(i);
          row[k] = b;
          row[k + 1] = a;
          pos[a] = k + 1;
          pos[b] = k;
          if (local(i) < before) improved = true;
          else {
            row[k] = a;
            row[k + 1] = b;
            pos[a] = k;
            pos[b] = k + 1;
          }
        }
      }
      if (!improved) break;
    }
  };

  let best = order.map((r) => [...r]);
  let bestCost = total();
  for (let pass = 0; pass < SWEEPS && bestCost > 0; pass++) {
    if (pass % 2 === 0) for (let i = 1; i < count; i++) reorder(i, adj.up);
    else for (let i = count - 2; i >= 0; i--) reorder(i, adj.down);
    swaps();
    const cost = total();
    if (cost < bestCost) {
      bestCost = cost;
      best = order.map((r) => [...r]);
    }
  }
  order = best;
  return { layers: order, crossings: bestCost };
}

export { adjacency };
export type { Adjacency };
