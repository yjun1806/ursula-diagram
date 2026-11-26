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

/** The side a flat edge takes and the crossings it causes there, given the order of its layer. */
export function flatRoute(l: Ladder, order: number[], pos: number[] | Int32Array, adj: { up: number[][]; down: number[][] }, lo: number, hi: number, layer: number): { side: Side; cost: number; between: number } {
  const p = pos[lo] ?? 0;
  const q = pos[hi] ?? 0;
  const from = Math.min(p, q) + 1;
  const to = Math.max(p, q);
  const options = flatOptions(l, layer);
  let best: Side = options[0] ?? 'up';
  let cost = Infinity;
  for (const side of options) {
    const lists = side === 'up' ? adj.up : adj.down;
    let c = 0;
    for (let k = from; k < to; k++) c += lists[order[k] as number]?.length ?? 0;
    if (c < cost) {
      cost = c;
      best = side;
    }
  }
  // Only pass-through lines between the ends: one straight segment that crosses each of them once.
  let boxes = 0;
  for (let k = from; k < to; k++) if ((order[k] as number) < l.realCount) boxes++;
  if (boxes === 0) return { side: best, cost: Math.max(0, to - from), between: 0 };
  return { side: best, cost, between: boxes };
}

/** A list of lists in two number arrays: the items of list `i` are `items[start[i] .. start[i + 1])`. */
interface Csr {
  start: Int32Array;
  items: Int32Array;
}

function toCsr(lists: number[][]): Csr {
  const start = new Int32Array(lists.length + 1);
  for (let i = 0; i < lists.length; i++) start[i + 1] = (start[i] ?? 0) + (lists[i]?.length ?? 0);
  const items = new Int32Array(start[lists.length] ?? 0);
  for (let i = 0; i < lists.length; i++) {
    const list = lists[i] ?? [];
    const at = start[i] ?? 0;
    for (let k = 0; k < list.length; k++) items[at + k] = list[k] as number;
  }
  return { start, items };
}

/** Everything the counting of crossings needs, in arrays: neighbours above and below, and the flat edges of every layer. */
export interface Counting {
  up: Csr;
  down: Csr;
  /** Per layer: the flat edges whose left end is in it (indices into `lo` and `hi`), as a list of lists. */
  flatStart: Int32Array;
  flatItems: Int32Array;
  lo: Int32Array;
  hi: Int32Array;
  /** The flat edges that end at each node (list of lists), and a buffer for the ones a swap looks at. */
  flatNodeStart: Int32Array;
  flatNodeItems: Int32Array;
  touched: Int32Array;
  /** Per layer: which sides a flat edge may be routed on (1 up, 2 down, 3 both). */
  sides: Uint8Array;
  realCount: number;
  xs: Int32Array;
  ys: Int32Array;
}

export function counting(l: Ladder, adj: Adjacency): Counting {
  const layers = l.layers.length;
  const byLayer: number[][] = Array.from({ length: layers }, () => []);
  l.flat.forEach((f, k) => byLayer[l.nodes[f.lo]?.layer ?? -1]?.push(k));
  const sides = new Uint8Array(layers);
  for (let i = 0; i < layers; i++) {
    const options = flatOptions(l, i);
    sides[i] = (options.includes('up') ? 1 : 0) | (options.includes('down') ? 2 : 0);
  }
  const flat = toCsr(byLayer);
  let edges = 0;
  for (const d of adj.down) edges += d.length;
  const byNode: number[][] = Array.from({ length: l.nodes.length }, () => []);
  l.flat.forEach((f, k) => {
    byNode[f.lo]?.push(k);
    if (f.hi !== f.lo) byNode[f.hi]?.push(k);
  });
  const flatNode = toCsr(byNode);
  return {
    flatNodeStart: flatNode.start,
    flatNodeItems: flatNode.items,
    touched: new Int32Array(Math.max(1, l.flat.length)),
    up: toCsr(adj.up),
    down: toCsr(adj.down),
    flatStart: flat.start,
    flatItems: flat.items,
    lo: Int32Array.from(l.flat, (f) => f.lo),
    hi: Int32Array.from(l.flat, (f) => f.hi),
    sides,
    realCount: l.realCount,
    xs: new Int32Array(edges),
    ys: new Int32Array(edges),
  };
}

/**
 * Number of pieces between layer i and layer i + 1 that cross: the same count as `pairCrossings`. Two pieces cross
 * when their ends are in opposite order at both layers, strictly; the upper ends are visited in order of place, so a
 * later piece crosses an earlier one when its upper end is further along and its lower end is before it.
 */
export function pairCrossingsFast(c: Counting, order: number[][], pos: Int32Array, i: number): number {
  const upper = order[i];
  if (!upper) return 0;
  const { start, items } = c.down;
  const xs = c.xs;
  const ys = c.ys;
  let m = 0;
  for (let k = 0; k < upper.length; k++) {
    const a = upper[k] as number;
    const x = pos[a] as number;
    for (let e = start[a] as number, end = start[a + 1] as number; e < end; e++) {
      xs[m] = x;
      ys[m] = pos[items[e] as number] as number;
      m++;
    }
  }
  let total = 0;
  for (let p = 0; p < m; p++) {
    const x = xs[p] as number;
    const y = ys[p] as number;
    for (let q = p + 1; q < m; q++) if ((xs[q] as number) > x && (ys[q] as number) < y) total++;
  }
  return total;
}

/** The cost of flat edge `f` (index into the flat edges of the ladder) for the order of its layer: what `flatRoute` gives. */
function flatCost(c: Counting, row: number[], pos: Int32Array, f: number, mask: number): number {
  const p = pos[c.lo[f] as number] as number;
  const q = pos[c.hi[f] as number] as number;
  const from = (p < q ? p : q) + 1;
  const to = p < q ? q : p;
  let up = 0;
  let down = 0;
  let boxes = 0;
  for (let k = from; k < to; k++) {
    const n = row[k] as number;
    up += (c.up.start[n + 1] as number) - (c.up.start[n] as number);
    down += (c.down.start[n + 1] as number) - (c.down.start[n] as number);
    if (n < c.realCount) boxes++;
  }
  // The cheaper of the sides allowed (the first one when equal); only dummies between the ends: each is crossed once.
  const best = mask === 1 ? up : mask === 2 ? down : up <= down ? up : down;
  return boxes === 0 ? to - from : best;
}

/** The crossings flat edges cause in layer `i`: the `cost` of `flatRoute` for each of them, summed. */
export function flatCrossingsFast(c: Counting, order: number[][], pos: Int32Array, i: number): number {
  const row = order[i] ?? [];
  let total = 0;
  const mask = c.sides[i] as number;
  for (let e = c.flatStart[i] as number, end = c.flatStart[i + 1] as number; e < end; e++) total += flatCost(c, row, pos, c.flatItems[e] as number, mask);
  return total;
}

/**
 * What swapping the neighbours at places `k` and `k + 1` of layer `i` adds to the crossings around that layer (the
 * pieces above it, the pieces below it, the flat edges in it): the difference of the pairs that involve one of the two
 * nodes, which is all that changes. The order is left as it was.
 */
export function swapDelta(c: Counting, order: number[][], pos: Int32Array, i: number, k: number): number {
  const row = order[i] as number[];
  const u = row[k] as number;
  const v = row[k + 1] as number;
  let delta = 0;
  // Pieces to the layer below: u's against v's. Before the swap u is left of v, so a pair crosses when u's end is further along.
  for (let e = c.down.start[u] as number, end = c.down.start[u + 1] as number; e < end; e++) {
    const y1 = pos[c.down.items[e] as number] as number;
    for (let f = c.down.start[v] as number, fend = c.down.start[v + 1] as number; f < fend; f++) {
      const y2 = pos[c.down.items[f] as number] as number;
      delta += (y2 > y1 ? 1 : 0) - (y1 > y2 ? 1 : 0);
    }
  }
  // Pieces from the layer above: their upper ends are fixed, the lower ends u and v change places.
  for (let e = c.up.start[u] as number, end = c.up.start[u + 1] as number; e < end; e++) {
    const xa = pos[c.up.items[e] as number] as number;
    for (let f = c.up.start[v] as number, fend = c.up.start[v + 1] as number; f < fend; f++) {
      const xb = pos[c.up.items[f] as number] as number;
      delta += (xa < xb ? 1 : 0) - (xa > xb ? 1 : 0);
    }
  }
  // Flat edges with an end at u or v: their cost is looked at before and after (the other flat edges keep theirs).
  const mask = c.sides[i] as number;
  let before = 0;
  let count = 0;
  for (let pass = 0; pass < 2; pass++) {
    const node = pass === 0 ? u : v;
    for (let e = c.flatNodeStart[node] as number, end = c.flatNodeStart[node + 1] as number; e < end; e++) {
      const f = c.flatNodeItems[e] as number;
      // An edge between u and v is listed for both: counted once.
      if (pass === 1 && (c.lo[f] === u || c.hi[f] === u)) continue;
      c.touched[count++] = f;
      before += flatCost(c, row, pos, f, mask);
    }
  }
  if (count > 0) {
    row[k] = v;
    row[k + 1] = u;
    pos[u] = k + 1;
    pos[v] = k;
    let after = 0;
    for (let t = 0; t < count; t++) after += flatCost(c, row, pos, c.touched[t] as number, mask);
    row[k] = u;
    row[k + 1] = v;
    pos[u] = k;
    pos[v] = k + 1;
    delta += after - before;
  }
  return delta;
}

function setPositions(order: number[][], pos: Int32Array, layer: number): void {
  const row = order[layer] ?? [];
  for (let k = 0; k < row.length; k++) pos[row[k] as number] = k;
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
export function orderLayers(graph: Graph, l: Ladder, rows: Rows, free = false, stage?: number[], loose = false, holdStart = true): Ordered {
  // Free: only the layers that hold the main flow keep "the earlier node is on the left"; other flat edges follow their partners.
  const adj = adjacency(l, loose ? new Set<number>() : free ? new Set(rows.main.map((n) => l.nodes[n]?.layer ?? -1)) : undefined);
  // The node the text starts from stands first in its layer when the candidate holds it there.
  const startNode = holdStart ? graph.nodes.findIndex((n) => n.id === graph.edges[0]?.from) : -1;
  if (startNode >= 0) {
    for (const n of l.layers[l.nodes[startNode]?.layer ?? 0] ?? []) if (n !== startNode) adj.preds[n]?.push(startNode);
  }
  // Nodes of an earlier stage stand before nodes of a later stage; only nodes of one stage are ordered by crossings.
  if (stage) {
    for (const row of l.layers) {
      for (const a of row) {
        for (const b of row) if (a < l.realCount && b < l.realCount && (stage[a] ?? 0) < (stage[b] ?? 0)) adj.preds[b]?.push(a);
      }
    }
  }
  const comp = components(graph);
  // Order of two nodes by (path index, component, place in the path, real before dummy, node or chain): the five keys of each, compared in turn.
  const key0 = (n: number): number => rows.pathIndex[l.nodes[n]?.origin ?? n] ?? 0;
  const key1 = (n: number): number => comp[l.nodes[n]?.origin ?? n] ?? 0;
  const key2 = (n: number): number => rows.pathPos[l.nodes[n]?.origin ?? n] ?? 0;
  const key3 = (n: number): number => (n < l.realCount ? 0 : 1);
  const key4 = (n: number): number => (n < l.realCount ? n : (l.nodes[n]?.chain ?? 0));
  const compare = (a: number, b: number): number => {
    let x = key0(a);
    let y = key0(b);
    if (x !== y) return x - y;
    x = key1(a);
    y = key1(b);
    if (x !== y) return x - y;
    x = key2(a);
    y = key2(b);
    if (x !== y) return x - y;
    x = key3(a);
    y = key3(b);
    if (x !== y) return x - y;
    x = key4(a);
    y = key4(b);
    return x !== y ? x - y : 0;
  };
  const pos = new Int32Array(l.nodes.length);
  // The work is done on arrays: the neighbours and flat edges are listed once, buffers are reused.
  const c = counting(l, adj);
  const preds = toCsr(adj.preds);
  const nodeCount = l.nodes.length;
  const keys = new Float64Array(nodeCount);
  const prev = new Int32Array(nodeCount);
  const stamp = new Int32Array(nodeCount);
  const placedAt = new Int32Array(nodeCount);
  const rest = new Int32Array(nodeCount);
  const chosenRow = new Int32Array(nodeCount);
  let round = 0;

  /** The layer reordered by the keys in `keys`, a node only after its flat-edge predecessors; ties go to the earlier place in `prev`. */
  const constrainRow = (i: number, row: number[]): void => {
    const size = row.length;
    round++;
    for (let k = 0; k < size; k++) {
      const n = row[k] as number;
      rest[k] = n;
      stamp[n] = round;
      placedAt[n] = 0;
    }
    let left = size;
    for (let out = 0; out < size; out++) {
      let pick = -1;
      for (let k = 0; k < left; k++) {
        const n = rest[k] as number;
        let ready = true;
        for (let e = preds.start[n] as number, end = preds.start[n + 1] as number; e < end; e++) {
          const q = preds.items[e] as number;
          if (stamp[q] === round && placedAt[q] === 0) {
            ready = false;
            break;
          }
        }
        if (!ready) continue;
        if (pick < 0) {
          pick = k;
          continue;
        }
        const m = rest[pick] as number;
        const dk = (keys[n] as number) - (keys[m] as number);
        if (dk < 0 || (dk === 0 && (prev[n] as number) < (prev[m] as number))) pick = k;
      }
      const at = pick < 0 ? 0 : pick;
      const chosen = rest[at] as number;
      for (let k = at; k + 1 < left; k++) rest[k] = rest[k + 1] as number;
      left--;
      placedAt[chosen] = 1;
      chosenRow[out] = chosen;
    }
    for (let k = 0; k < size; k++) row[k] = chosenRow[k] as number;
    void i;
  };

  let order = l.layers.map((nodes) => {
    const sorted = [...nodes].sort(compare);
    sorted.forEach((n, k) => {
      keys[n] = k;
      prev[n] = k;
    });
    constrainRow(0, sorted);
    return sorted;
  });
  order.forEach((_, i) => setPositions(order, pos, i));
  const count = order.length;

  const total = (): number => {
    let sum = 0;
    for (let i = 0; i < count; i++) sum += pairCrossingsFast(c, order, pos, i) + flatCrossingsFast(c, order, pos, i);
    return sum;
  };
  const local = (i: number): number => {
    let sum = pairCrossingsFast(c, order, pos, i) + flatCrossingsFast(c, order, pos, i);
    if (i > 0) sum += pairCrossingsFast(c, order, pos, i - 1);
    return sum;
  };
  const reorder = (i: number, fixed: Csr): void => {
    const row = order[i] ?? [];
    if (row.length < 2) return;
    for (let k = 0; k < nodeCount; k++) prev[k] = pos[k] as number;
    for (let k = 0; k < row.length; k++) {
      const n = row[k] as number;
      const from = fixed.start[n] as number;
      const to = fixed.start[n + 1] as number;
      if (to === from) keys[n] = pos[n] as number;
      else {
        let sum = 0;
        for (let e = from; e < to; e++) sum += pos[fixed.items[e] as number] as number;
        keys[n] = sum / (to - from);
      }
    }
    constrainRow(i, row);
    setPositions(order, pos, i);
  };
  const upCsr = c.up;
  const downCsr = c.down;
  const swaps = (): void => {
    for (let pass = 0; pass < 40; pass++) {
      let improved = false;
      for (let i = 0; i < count; i++) {
        const row = order[i] as number[];
        // The crossings around this layer as they stand: kept up to date by the swaps (a swap that does not help is undone).
        let current = row.length > 1 ? local(i) : 0;
        for (let k = 0; k + 1 < row.length; k++) {
          const a = row[k] as number;
          const b = row[k + 1] as number;
          let blocked = false;
          for (let e = preds.start[b] as number, end = preds.start[b + 1] as number; e < end; e++) {
            if (preds.items[e] === a) {
              blocked = true;
              break;
            }
          }
          if (blocked) continue;
          const delta = swapDelta(c, order, pos, i, k);
          if (delta < 0) {
            row[k] = b;
            row[k + 1] = a;
            pos[a] = k + 1;
            pos[b] = k;
            improved = true;
            current += delta;
          }
        }
      }
      if (!improved) break;
    }
  };

  let best = order.map((r) => [...r]);
  let bestCost = total();
  for (let pass = 0; pass < SWEEPS && bestCost > 0; pass++) {
    if (pass % 2 === 0) for (let i = 1; i < count; i++) reorder(i, upCsr);
    else for (let i = count - 2; i >= 0; i--) reorder(i, downCsr);
    swaps();
    const cost = total();
    if (cost < bestCost) {
      bestCost = cost;
      best = order.map((r) => [...r]);
    }
  }
  order = best;
  // A pass-through line between two ends of a flat edge can stand before or behind the whole flat flow instead.
  order.forEach((_, i) => setPositions(order, pos, i));
  for (let round = 0; round < 3; round++) {
    let moved = false;
    for (let i = 0; i < count; i++) {
      for (const f of l.flat) {
        if ((l.nodes[f.lo]?.layer ?? -1) !== i) continue;
        const row = order[i] as number[];
        const p = pos[f.lo] ?? 0;
        const q = pos[f.hi] ?? 0;
        for (const d of row.slice(Math.min(p, q) + 1, Math.max(p, q))) {
          if (d < l.realCount) continue;
          const current = total();
          const keep = [...row];
          // The ends of the whole flow of flat edges that holds this one.
          let from = Math.min(p, q);
          let to = Math.max(p, q);
          for (let grew = true; grew; ) {
            grew = false;
            for (const g of l.flat) {
              if ((l.nodes[g.lo]?.layer ?? -1) !== i) continue;
              const a = pos[g.lo] ?? 0;
              const b = pos[g.hi] ?? 0;
              if (Math.max(a, b) >= from && Math.min(a, b) <= to && (Math.min(a, b) < from || Math.max(a, b) > to)) {
                from = Math.min(from, a, b);
                to = Math.max(to, a, b);
                grew = true;
              }
            }
          }
          let done = false;
          for (const at of [from, to]) {
            const next = keep.filter((n) => n !== d);
            next.splice(at === from ? from : to - (keep.indexOf(d) < to ? 1 : 0) + 1, 0, d);
            order[i] = next;
            setPositions(order, pos, i);
            if (total() <= current && !(Math.min(p, q) < (pos[d] ?? 0) && (pos[d] ?? 0) < Math.max(p, q))) {
              done = true;
              moved = true;
              break;
            }
          }
          if (!done) {
            order[i] = keep;
            setPositions(order, pos, i);
          } else break;
        }
      }
    }
    if (!moved) break;
  }
  return { layers: order, crossings: total() };
}

export { adjacency };
export type { Adjacency };
