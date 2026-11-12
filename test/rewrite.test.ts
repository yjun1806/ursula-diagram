import { describe, expect, it } from 'vitest';
import { parse } from '../src/index.ts';
import { align, type AlignOptions, type Aligned, type Extra, type PortGeometry } from '../src/layered/align.ts';
import { buildLadder } from '../src/layered/dummies.ts';
import type { Ladder } from '../src/layered/model.ts';
import { pieces } from '../src/layered/model.ts';
import { adjacency, counting, flatCrossingsFast, flatRoute, orderLayers, pairCrossingsFast, swapDelta } from '../src/layered/order.ts';
import { assignLayers } from '../src/layered/rows.ts';
import type { Rows } from '../src/layered/rows.ts';
import type { Graph } from '../src/types.ts';

// ---- The code before it was rewritten on arrays (order.ts and align.ts), kept as it was, with `Old` on the names. ----


type SideOld = 'up' | 'down';

/** SideOlds a flat edge between non-adjacent nodes may be routed on: inside its lane when the lane has another row. */
function flatOptionsOld(l: Ladder, layer: number): SideOld[] {
  const lane = l.layerLane[layer];
  const above = layer > 0 && l.layerLane[layer - 1] === lane;
  const below = layer + 1 < l.layers.length && l.layerLane[layer + 1] === lane;
  if (above || below) return [...(above ? (['up'] as const) : []), ...(below ? (['down'] as const) : [])];
  return ['up', 'down'];
}

interface AdjacencyOld {
  up: number[][];
  down: number[][];
  preds: number[][];
}

function adjacencyOld(l: Ladder, keep?: Set<number>): AdjacencyOld {
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
function pairCrossingsOld(order: number[][], pos: number[], adj: AdjacencyOld, i: number): number {
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
function flatRouteOld(l: Ladder, order: number[], pos: number[], adj: { up: number[][]; down: number[][] }, lo: number, hi: number, layer: number): { side: SideOld; cost: number; between: number } {
  const p = pos[lo] ?? 0;
  const q = pos[hi] ?? 0;
  const inside = order.slice(Math.min(p, q) + 1, Math.max(p, q));
  const options = flatOptionsOld(l, layer);
  let best: SideOld = options[0] ?? 'up';
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

function flatCrossingsOld(l: Ladder, order: number[][], pos: number[], adj: AdjacencyOld, layer: number): number {
  let total = 0;
  const row = order[layer] ?? [];
  for (const f of l.flat) {
    if ((l.nodes[f.lo]?.layer ?? -1) !== layer) continue;
    total += flatRouteOld(l, row, pos, adj, f.lo, f.hi, layer).cost;
  }
  return total;
}

function setPositionsOld(order: number[][], pos: number[], layer: number): void {
  (order[layer] ?? []).forEach((n, k) => {
    pos[n] = k;
  });
}

/** Takes, among the nodes whose flat-edge predecessors are placed, the one with the smallest key. */
function constrainedOld(nodes: number[], key: (n: number) => number, tie: (n: number) => number, preds: number[][]): number[] {
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

interface OrderedOld {
  layers: number[][];
  crossings: number;
}

function componentsOld(graph: Graph): number[] {
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

const SWEEPS_OLD = 12;

/** Stage 3: the order of every layer, by alternating barycentre sweeps and adjacent swaps. */
function orderLayersOld(graph: Graph, l: Ladder, rows: Rows, free = false, stage?: number[], loose = false, holdStart = true): OrderedOld {
  // Free: only the layers that hold the main flow keep "the earlier node is on the left"; other flat edges follow their partners.
  const adj = adjacencyOld(l, loose ? new Set<number>() : free ? new Set(rows.main.map((n) => l.nodes[n]?.layer ?? -1)) : undefined);
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
  const comp = componentsOld(graph);
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
    return constrainedOld(sorted, (n) => at.get(n) ?? 0, (n) => at.get(n) ?? 0, adj.preds);
  });
  order.forEach((_, i) => setPositionsOld(order, pos, i));
  const count = order.length;

  const total = (): number => {
    let sum = 0;
    for (let i = 0; i < count; i++) sum += pairCrossingsOld(order, pos, adj, i) + flatCrossingsOld(l, order, pos, adj, i);
    return sum;
  };
  const local = (i: number): number => {
    let sum = pairCrossingsOld(order, pos, adj, i) + flatCrossingsOld(l, order, pos, adj, i);
    if (i > 0) sum += pairCrossingsOld(order, pos, adj, i - 1);
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
    order[i] = constrainedOld(row, bary, (n) => prev[n] ?? 0, adj.preds);
    setPositionsOld(order, pos, i);
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
  for (let pass = 0; pass < SWEEPS_OLD && bestCost > 0; pass++) {
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
  // A pass-through line between two ends of a flat edge can stand before or behind the whole flat flow instead.
  order.forEach((_, i) => setPositionsOld(order, pos, i));
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
            setPositionsOld(order, pos, i);
            if (total() <= current && !(Math.min(p, q) < (pos[d] ?? 0) && (pos[d] ?? 0) < Math.max(p, q))) {
              done = true;
              moved = true;
              break;
            }
          }
          if (!done) {
            order[i] = keep;
            setPositionsOld(order, pos, i);
          } else break;
        }
      }
    }
    if (!moved) break;
  }
  return { layers: order, crossings: total() };
}


interface ViewOld {
  up: number[][];
  down: number[][];
}

function neighboursOld(l: Ladder): ViewOld {
  const up = l.nodes.map((): number[] => []);
  const down = l.nodes.map((): number[] => []);
  for (const [a, b] of pieces(l)) {
    up[b]?.push(a);
    down[a]?.push(b);
  }
  return { up, down };
}

/** Pieces that cross an inner segment (dummy to dummy) and are not inner themselves: they lose to it. */
function conflictsOld(l: Ladder, layers: number[][], pos: number[]): Set<string> {
  const marked = new Set<string>();
  const all = pieces(l);
  const inner = all.filter(([a, b]) => a >= l.realCount && b >= l.realCount);
  for (const [a, b] of all) {
    if (a >= l.realCount && b >= l.realCount) continue;
    const la = l.nodes[a]?.layer ?? 0;
    for (const [c, d] of inner) {
      if ((l.nodes[c]?.layer ?? -1) !== la) continue;
      if (((pos[a] ?? 0) - (pos[c] ?? 0)) * ((pos[b] ?? 0) - (pos[d] ?? 0)) < 0) marked.add(`${a}|${b}`);
    }
  }
  void layers;
  return marked;
}

/** One of the four directions: vertical alignment into blocks, then compaction. Returns starts from the left edge. */
function directionOld(
  l: Ladder,
  layers: number[][],
  view: ViewOld,
  marked: Set<string>,
  sepOf: (left: number, right: number) => number,
  downward: boolean,
  leftward: boolean,
  centredLink: (upper: number, lower: number) => boolean = () => false,
  weight: (upper: number, lower: number) => number = () => 1,
  degreeOf: (node: number) => number = () => 0,
): number[] {
  const count = layers.length;
  const seq = Array.from({ length: count }, (_, i) => (downward ? i : count - 1 - i));
  const rowsT = layers.map((r) => (leftward ? r : [...r].reverse()));
  const pos = new Array<number>(l.nodes.length).fill(0);
  rowsT.forEach((r) => r.forEach((n, k) => (pos[n] = k)));
  const root = l.nodes.map((n) => n.idx);
  const aligned = l.nodes.map((n) => n.idx);
  // Boxes that join through a side with that edge only are centred on one another, the rest keep their left edges together.
  const wide = (v: number): number => (v < l.realCount ? (l.nodes[v]?.units ?? 2) : 2);
  const pred = new Array<number>(l.nodes.length).fill(-1);
  const rel = new Array<number>(l.nodes.length).fill(0);
  for (let s = 1; s < count; s++) {
    let reach = -1;
    let last: { u: number; v: number; tail: number; reachBefore: number } | undefined;
    for (const v of rowsT[seq[s] as number] ?? []) {
      const prev = (downward ? view.up[v] : view.down[v]) ?? [];
      if (prev.length === 0) continue;
      const ns = [...prev].sort((a, b) => (pos[a] ?? 0) - (pos[b] ?? 0));
      const d = ns.length;
      let medians = d % 2 === 1 ? [(d - 1) / 2] : [d / 2 - 1, d / 2];
      // The partner to align with is the one of the heaviest edge; the middle one when the edges weigh the same.
      const weights = ns.map((u) => (downward ? weight(u, v) : weight(v, u)));
      const top = Math.max(...weights);
      if (weights.some((w) => w !== top)) {
        const heavy = weights.flatMap((w, i) => (w === top ? [i] : []));
        heavy.sort((a, b) => Math.abs(a - (d - 1) / 2) - Math.abs(b - (d - 1) / 2) || a - b);
        medians = [heavy[0] as number];
      }
      for (const m of medians) {
        if (aligned[v] !== v) break;
        const u = ns[m] as number;
        const key = downward ? `${u}|${v}` : `${v}|${u}`;
        if (marked.has(key)) continue;
        if (reach >= (pos[u] ?? 0)) {
          // Two alignments cross: the one of the heavier nodes stays.
          if (!last || degreeOf(u) + degreeOf(v) <= degreeOf(last.u) + degreeOf(last.v)) continue;
          aligned[last.u] = last.tail;
          root[last.v] = last.v;
          aligned[last.v] = last.v;
          pred[last.v] = -1;
          rel[last.v] = 0;
          reach = last.reachBefore;
          last = undefined;
          if (reach >= (pos[u] ?? 0)) continue;
        }
        last = { u, v, tail: aligned[u] as number, reachBefore: reach };
        aligned[u] = v;
        pred[v] = u;
        const [upper, lower] = downward ? [u, v] : [v, u];
        if (centredLink(upper, lower)) rel[v] = (wide(u) - wide(v)) / 2;
        root[v] = root[u] as number;
        aligned[v] = root[v] as number;
        reach = pos[u] ?? 0;
      }
    }
  }
  // Block positions: the smallest start that keeps every layer's separation.
  const members = new Map<number, number[]>();
  for (const n of l.nodes) members.set(root[n.idx] as number, [...(members.get(root[n.idx] as number) ?? []), n.idx]);
  const placed = new Map<number, number>();
  const active = new Set<number>();
  // Offset of a member from the start of its block: through the chain of links, then shifted so the least is zero.
  const raw = new Map<number, number>();
  const rawOff = (v: number): number => {
    const known = raw.get(v);
    if (known !== undefined) return known;
    const u = pred[v] ?? -1;
    const o = u < 0 || root[u] !== root[v] ? 0 : rawOff(u) + (rel[v] ?? 0);
    raw.set(v, o);
    return o;
  };
  const least = new Map<number, number>();
  for (const [r, vs] of members) least.set(r, Math.min(...vs.map(rawOff)));
  const off = (v: number): number => rawOff(v) - (least.get(root[v] as number) ?? 0);
  const place = (r: number): number => {
    const known = placed.get(r);
    if (known !== undefined) return known;
    if (active.has(r)) return 0;
    active.add(r);
    let at = 0;
    for (const v of members.get(r) ?? []) {
      const k = pos[v] ?? 0;
      const row = rowsT[l.nodes[v]?.layer ?? 0] ?? [];
      const p = row[k - 1];
      if (p === undefined) continue;
      const sep = leftward ? sepOf(p, v) : (l.nodes[p]?.units ?? 2) - (l.nodes[v]?.units ?? 2) + sepOf(v, p);
      at = Math.max(at, place(root[p] as number) + off(p) + sep - off(v));
    }
    active.delete(r);
    placed.set(r, at);
    return at;
  };
  const out = new Array<number>(l.nodes.length).fill(0);
  for (const n of l.nodes) out[n.idx] = place(root[n.idx] as number) + off(n.idx);
  if (leftward) return out;
  const width = Math.max(0, ...l.nodes.map((n) => (out[n.idx] ?? 0) + n.units));
  return l.nodes.map((n) => width - ((out[n.idx] ?? 0) + n.units));
}

const DEFAULT_PORTS_OLD: PortGeometry = { steps: 4, reach: (units) => units / 2 - 0.375 };

const EPS_OLD = 1e-6;

/**
 * Stage 4: integer starts on the unit grid. The best of four median alignments is kept, a straighten pass
 * moves rigid vertical groups so that more pieces run straight, and leftover gaps are closed group by group.
 */
function alignOld(l: Ladder, layers: number[][], extra: Extra = () => 0, opts: AlignOptions = {}): Aligned {
  const limit = opts.limit ?? Infinity;
  const geom = opts.ports ?? DEFAULT_PORTS_OLD;
  const view = neighboursOld(l);
  const real = (n: number): boolean => n < l.realCount;
  const unitsOf = (n: number): number => l.nodes[n]?.units ?? 1;
  // A pass-through line lives in the gap between two boxes: box, line, box needs no extra room, and up to `lines` lines share one gap.
  const lines = Math.max(1, opts.lines ?? 1);
  const runIndex = new Array<number>(l.nodes.length).fill(0);
  for (const row of layers) for (let k = 1; k < row.length; k++) if (!real(row[k] as number) && !real(row[k - 1] as number)) runIndex[row[k] as number] = (runIndex[row[k - 1] as number] ?? 0) + 1;
  const sep = (a: number, b: number): number => {
    if (real(a)) return unitsOf(a) + extra(a, b) - (real(b) ? 0 : 1);
    if (real(b)) return 1;
    return (runIndex[b] ?? 0) % lines === 0 ? 1 : 0;
  };
  const pos = new Array<number>(l.nodes.length).fill(0);
  layers.forEach((r) => r.forEach((n, k) => (pos[n] = k)));
  const marked = conflictsOld(l, layers, pos);
  const all = pieces(l);
  const incident = l.nodes.map((): number[] => []);
  for (const [a, b] of all) {
    incident[a]?.push(b);
    incident[b]?.push(a);
  }
  const centre = (n: number, s: number): number => s + (real(n) ? unitsOf(n) / 2 : 1);
  /** A piece is straight when one port x is shared by both ends. */
  const straightAt = (a: number, sa: number, b: number, sb: number): boolean => {
    const ca = centre(a, sa);
    const cb = centre(b, sb);
    if (!real(a) && !real(b)) return Math.abs(ca - cb) < EPS_OLD;
    if (!real(a) || !real(b)) {
      const [r, d] = real(a) ? [a, cb] : [b, ca];
      const reach = opts.single?.(r, real(a) ? 'down' : 'up') ? 0 : geom.reach(unitsOf(r));
      return Math.abs(d - centre(r, real(a) ? sa : sb)) <= reach + EPS_OLD;
    }
    if (geom.centred) return Math.abs(ca - cb) < EPS_OLD;
    // A box whose side holds this edge only has it at the centre: both only, the centres agree; one only, its centre is clear of the other's corners.
    const oneA = opts.single?.(a, 'down') === true;
    const oneB = opts.single?.(b, 'up') === true;
    if (oneA && oneB) return Math.abs(ca - cb) < EPS_OLD;
    if (oneA || oneB) {
      const inner = geom.inner?.(unitsOf(oneA ? b : a)) ?? geom.reach(unitsOf(oneA ? b : a));
      return Math.abs(ca - cb) <= inner + EPS_OLD;
    }
    const lo = Math.max(ca - geom.reach(unitsOf(a)), cb - geom.reach(unitsOf(b)));
    const hi = Math.min(ca + geom.reach(unitsOf(a)), cb + geom.reach(unitsOf(b)));
    return Math.ceil(lo * geom.steps - EPS_OLD) <= Math.floor(hi * geom.steps + EPS_OLD);
  };
  const countStraight = (st: number[]): number => all.filter(([a, b]) => straightAt(a, st[a] ?? 0, b, st[b] ?? 0)).length;
  // A line in the last gap sticks out of the last box by half a gap only.
  const reachOf = (n: number): number => (real(n) ? unitsOf(n) : 1 + (opts.dummyShift ?? 1));
  const endOf = (st: number[]): number => Math.max(0, ...l.nodes.map((n) => (st[n.idx] ?? 0) + reachOf(n.idx)));

  // A piece weighs 3 when a box holds it alone on its side (it is meant to be straight), else 1, and 2 more on the main flow.
  const mainFlow = opts.main ?? new Set<number>();
  const onMain = (ci: number): boolean => {
    const nodes = l.chains[ci]?.nodes ?? [];
    return mainFlow.has(nodes[0] ?? -1) || mainFlow.has(nodes[nodes.length - 1] ?? -1);
  };
  const weights = new Map<string, number>();
  for (const [a, b, ci] of all) {
    const w = (opts.single?.(a, 'down') === true || opts.single?.(b, 'up') === true ? 3 : 1) + (onMain(ci) ? 2 : 0);
    weights.set(`${a}|${b}`, Math.max(weights.get(`${a}|${b}`) ?? 0, w));
  }
  const pieceWeight = (upper: number, lower: number): number => weights.get(`${upper}|${lower}`) ?? 1;
  // 1. The best of the four directions.
  const candidates: number[][] = [];
  for (const downward of [true, false]) {
    for (const leftward of [true, false]) {
      const raw = directionOld(l, layers, view, marked, sep, downward, leftward, (upper, lower) => opts.single?.(upper, 'down') === true || opts.single?.(lower, 'up') === true, pieceWeight, (n) => opts.degree?.(n) ?? 0);
      const low = Math.min(...raw);
      candidates.push(raw.map((x) => x - low));
    }
  }
  const main = opts.main ?? new Set<number>();
  const touchesMain = (ci: number): boolean => {
    const nodes = l.chains[ci]?.nodes ?? [];
    return main.has(nodes[0] ?? -1) || main.has(nodes[nodes.length - 1] ?? -1);
  };
  const score = (st: number[]): number[] => {
    const straight = all.reduce((sum, [a, b]) => (straightAt(a, st[a] ?? 0, b, st[b] ?? 0) ? sum + pieceWeight(a, b) : sum), 0);
    const off = all.reduce((sum, [a, b]) => (straightAt(a, st[a] ?? 0, b, st[b] ?? 0) ? sum : sum + Math.abs(centre(a, st[a] ?? 0) - centre(b, st[b] ?? 0))), 0);
    return [-straight, Math.max(0, endOf(st) - limit), off];
  };
  let start = candidates[0] as number[];
  let best = score(start);
  for (const c of candidates.slice(1)) {
    const sc = score(c);
    for (let i = 0; i < sc.length; i++) {
      if ((sc[i] as number) === (best[i] as number)) continue;
      if ((sc[i] as number) < (best[i] as number)) {
        start = c;
        best = sc;
      }
      break;
    }
  }
  start = [...start];

  // Rigid groups: nodes joined by straight pieces.
  const groupsOf = (st: number[]): Map<number, number[]> => {
    const parent = l.nodes.map((n) => n.idx);
    const find = (x: number): number => {
      let r = x;
      while ((parent[r] as number) !== r) r = parent[r] as number;
      return r;
    };
    for (const [a, b] of all) if (straightAt(a, st[a] ?? 0, b, st[b] ?? 0)) parent[find(a)] = find(b);
    const out = new Map<number, number[]>();
    for (const n of l.nodes) out.set(find(n.idx), [...(out.get(find(n.idx)) ?? []), n.idx]);
    return out;
  };
  const hasStraight = (st: number[], n: number): boolean => (incident[n] ?? []).some((o) => straightAt(n, st[n] ?? 0, o, st[o] ?? 0));

  /** Moves a group by `delta`, pushing free neighbours along; undefined when that would break anything. */
  const move = (st: number[], group: number[], delta: number, cap: number): number[] | undefined => {
    const next = [...st];
    const moved = new Map<number, number>(group.map((n) => [n, delta]));
    const layerList = [...new Set(group.map((n) => l.nodes[n]?.layer ?? 0))];
    for (const n of group) next[n] = (st[n] ?? 0) + delta;
    for (const layer of layerList) {
      const row = layers[layer] ?? [];
      if (delta > 0) {
        for (let k = 1; k < row.length; k++) {
          const p = row[k - 1] as number;
          const n = row[k] as number;
          const need = (next[p] ?? 0) + sep(p, n);
          if ((next[n] ?? 0) >= need) continue;
          if (moved.has(n) || hasStraight(st, n)) return undefined;
          next[n] = need;
          moved.set(n, need - (st[n] ?? 0));
        }
      } else {
        for (let k = row.length - 2; k >= 0; k--) {
          const q = row[k + 1] as number;
          const n = row[k] as number;
          const most = (next[q] ?? 0) - sep(n, q);
          if ((next[n] ?? 0) <= most) continue;
          if (moved.has(n) || hasStraight(st, n)) return undefined;
          next[n] = most;
          moved.set(n, most - (st[n] ?? 0));
        }
      }
    }
    if (next.some((x) => x < 0) || endOf(next) > cap) return undefined;
    return next;
  };

  // 2. Straighten pass.
  const order = [...all].sort((x, y) => {
    const simple = (p: [number, number, number]): number => Number(real(p[0]) && real(p[1]) && (l.chains[p[2]]?.nodes.length ?? 0) === 2);
    return simple(y) - simple(x) || x[2] - y[2];
  });
  for (let sweep = 0; sweep < 4; sweep++) {
    let changed = false;
    for (const [a, b] of order) {
      if (straightAt(a, start[a] ?? 0, b, start[b] ?? 0)) continue;
      const groups = groupsOf(start);
      const rootOf = new Map<number, number[]>();
      for (const g of groups.values()) for (const n of g) rootOf.set(n, g);
      const base = countStraight(start);
      const cap = Math.max(limit, endOf(start));
      let pick: number[] | undefined;
      let gain = 0;
      for (const [n, o] of [[a, b], [b, a]] as const) {
        const deltas = new Set([(start[o] ?? 0) - (start[n] ?? 0), (start[o] ?? 0) + unitsOf(o) - ((start[n] ?? 0) + unitsOf(n))]);
        for (const d of deltas) {
          if (d === 0) continue;
          const trial = move(start, rootOf.get(n) ?? [n], d, cap);
          if (!trial) continue;
          const g = countStraight(trial) - base;
          if (g > gain) {
            gain = g;
            pick = trial;
          }
        }
      }
      if (pick) {
        start = pick;
        changed = true;
      }
    }
    if (!changed) break;
  }

  // 3. Chain rhythm: flat neighbours sit one box apart when no straight piece holds them.
  for (let round = 0; round < 3; round++) {
    for (const f of l.flat) {
      const row = layers[l.nodes[f.lo]?.layer ?? 0] ?? [];
      if (row[row.indexOf(f.lo) + 1] !== f.hi) continue;
      const target = (start[f.lo] ?? 0) + sep(f.lo, f.hi);
      if ((start[f.hi] ?? 0) <= target || hasStraight(start, f.hi)) continue;
      start[f.hi] = target;
    }
  }

  // 4. Close gaps: whole rigid groups move left as far as the separations allow.
  for (let round = 0; round < 12; round++) {
    const groups = [...groupsOf(start).values()].sort((x, y) => Math.min(...x.map((n) => start[n] ?? 0)) - Math.min(...y.map((n) => start[n] ?? 0)));
    let moved = false;
    for (const members of groups) {
      let shift = Infinity;
      for (const n of members) {
        const row = layers[l.nodes[n]?.layer ?? 0] ?? [];
        const p = row[row.indexOf(n) - 1];
        const lo = p === undefined ? 0 : (start[p] ?? 0) + sep(p, n);
        shift = Math.min(shift, (start[n] ?? 0) - lo);
      }
      if (shift > 0 && Number.isFinite(shift)) {
        for (const n of members) start[n] = (start[n] ?? 0) - shift;
        moved = true;
      }
    }
    if (!moved) break;
  }

  // Last resort once rows and shelves are used up: nodes that stick out give up their alignment.
  if (opts.squeeze && endOf(start) > limit) {
    for (const row of layers) {
      for (let k = row.length - 1; k >= 0; k--) {
        const n = row[k] as number;
        const q = row[k + 1];
        const most = q === undefined ? limit - reachOf(n) : (start[q] ?? 0) - sep(n, q);
        if ((start[n] ?? 0) > most) start[n] = most;
      }
    }
    for (const row of layers) {
      for (let k = 1; k < row.length; k++) {
        const p = row[k - 1] as number;
        const n = row[k] as number;
        start[n] = Math.max(start[n] ?? 0, (start[p] ?? 0) + sep(p, n));
      }
    }
    const lowest = Math.min(...start);
    if (lowest < 0) for (let i = 0; i < start.length; i++) start[i] = (start[i] ?? 0) - lowest;
  }
  // Stages: a node with two or more partners in one adjacent layer stands in the middle of them: level with the middle
  // partner when there is an odd number, between the two middle ones when even.
  if (opts.hubs) {
    for (const n of l.nodes) {
      if (!real(n.idx)) continue;
      const partners = (view.down[n.idx] ?? []).length >= 2 ? (view.down[n.idx] as number[]) : (view.up[n.idx] ?? []).length >= 2 ? (view.up[n.idx] as number[]) : [];
      if (partners.length < 2) continue;
      const centres = partners.map((m) => centre(m, start[m] ?? 0)).sort((x, y) => x - y);
      const d = centres.length;
      const target = d % 2 === 1 ? (centres[(d - 1) / 2] as number) : ((centres[d / 2 - 1] as number) + (centres[d / 2] as number)) / 2;
      const row = layers[n.layer] ?? [];
      const k = row.indexOf(n.idx);
      const before = k > 0 ? row[k - 1] : undefined;
      const after = k + 1 < row.length ? row[k + 1] : undefined;
      const low = before === undefined ? 0 : (start[before] ?? 0) + sep(before, n.idx);
      const high = after === undefined ? Infinity : (start[after] ?? 0) - sep(n.idx, after);
      const wanted = Math.round(target - unitsOf(n.idx) / 2);
      const at = Math.min(Math.max(wanted, low), high);
      if (low <= high && at !== start[n.idx]) start[n.idx] = at;
    }
  }
  // Moves may leave the whole drawing a unit or more from the edge.
  const low = Math.min(...start);
  if (low > 0) for (let i = 0; i < start.length; i++) start[i] = (start[i] ?? 0) - low;
  return { start, width: endOf(start) };
}


// ---- Seeded inputs ----

function prng(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WORDS = ['Receive order', 'Check stock', 'Pack', 'Ship parcel', 'Notify', 'Audit log', 'Refund', 'Approve', 'Archive', 'Index'];

function generate(seed: number): string {
  const rnd = prng(seed);
  const pick = (n: number): number => Math.floor(rnd() * n);
  const lanes = 1 + pick(3);
  const count = 4 + pick(17);
  const labels = rnd() < 0.5;
  const members: string[][] = Array.from({ length: lanes }, () => []);
  for (let i = 0; i < count; i++) members[pick(lanes)]?.push(`n${i}`);
  const title = (i: number): string => `n${i}[${WORDS[(i * 7 + seed) % WORDS.length]}]`;
  const lines = ['flowchart LR'];
  members.forEach((ids, k) => {
    if (ids.length === 0) return;
    lines.push(`subgraph l${k}[Lane ${k}]`, ...ids.map((id) => title(Number(id.slice(1)))), 'end');
  });
  const edges = Math.min(count + pick(count + 4), 30);
  for (let e = 0; e < edges; e++) {
    const a = pick(count);
    let b = pick(count);
    if (b === a) b = (a + 1) % count;
    if (e < count - 1 && rnd() < 0.6) b = Math.min(count - 1, a + 1);
    if (a === b) continue;
    lines.push(`n${a} -->${labels && rnd() < 0.5 ? `|e${e}|` : ''} n${b}`);
  }
  return lines.join('\n');
}

interface Case {
  graph: Graph;
  ladder: Ladder;
  rows: Rows;
  rnd: () => number;
}

function make(seed: number): Case {
  const graph = parse(generate(seed));
  const rnd = prng(seed * 7919 + 13);
  const units = graph.nodes.map(() => (rnd() < 0.15 ? 4 : 2));
  const fold = (['flat', 'head', 'headTail'] as const)[Math.floor(rnd() * 3)] as 'flat' | 'head' | 'headTail';
  const rows = assignLayers(graph, units, rnd() < 0.5 ? Infinity : 6 + 2 * Math.floor(rnd() * 5), 0, false, fold);
  const ladder = buildLadder(graph, rows, units);
  return { graph, ladder, rows, rnd };
}

const CASES = 500;

describe('order.ts on arrays gives what it gave on lists', () => {
  it('orders the layers of 500 seeded graphs the same way, with the same crossings', () => {
    for (let seed = 1; seed <= CASES; seed++) {
      const { graph, ladder, rows, rnd } = make(seed);
      const free = rnd() < 0.5;
      const loose = rnd() < 0.3;
      const hold = rnd() < 0.7;
      const stage = rnd() < 0.2 ? graph.nodes.map((_, i) => i % 3) : undefined;
      const a = orderLayers(graph, ladder, rows, free, stage, loose, hold);
      const b = orderLayersOld(graph, ladder, rows, free, stage, loose, hold);
      expect([seed, a.layers, a.crossings]).toEqual([seed, b.layers, b.crossings]);
    }
  });

  it('counts the same crossings of pieces and of flat edges in 500 seeded orders', () => {
    for (let seed = 1; seed <= CASES; seed++) {
      const { ladder, rnd } = make(seed);
      const order = ladder.layers.map((row) => {
        const copy = [...row];
        for (let i = copy.length - 1; i > 0; i--) {
          const j = Math.floor(rnd() * (i + 1));
          [copy[i], copy[j]] = [copy[j] as number, copy[i] as number];
        }
        return copy;
      });
      const pos = new Array<number>(ladder.nodes.length).fill(0);
      order.forEach((row) => row.forEach((n, k) => (pos[n] = k)));
      const adj = adjacencyOld(ladder);
      const c = counting(ladder, adjacency(ladder));
      const fast = Int32Array.from(pos);
      for (let i = 0; i < order.length; i++) {
        expect([seed, i, pairCrossingsFast(c, order, fast, i)]).toEqual([seed, i, pairCrossingsOld(order, pos, adj, i)]);
        expect([seed, i, flatCrossingsFast(c, order, fast, i)]).toEqual([seed, i, flatCrossingsOld(ladder, order, pos, adj, i)]);
      }
    }
  });

  it('routes the flat edges of 500 seeded orders to the same side at the same cost', () => {
    for (let seed = 1; seed <= CASES; seed++) {
      const { ladder, rnd } = make(seed);
      const order = ladder.layers.map((row) => [...row].sort(() => rnd() - 0.5));
      const pos = new Array<number>(ladder.nodes.length).fill(0);
      order.forEach((row) => row.forEach((n, k) => (pos[n] = k)));
      const adj = adjacencyOld(ladder);
      for (const f of ladder.flat) {
        const layer = ladder.nodes[f.lo]?.layer ?? 0;
        expect([seed, flatRoute(ladder, order[layer] ?? [], pos, adj, f.lo, f.hi, layer)]).toEqual([seed, flatRouteOld(ladder, order[layer] ?? [], pos, adj, f.lo, f.hi, layer)]);
      }
    }
  });
});

describe('the crossings of a swap are counted from what changes', () => {
  it('keeps, over 200 random swaps in each of 500 seeded orders, a current value equal to the full recount', () => {
    for (let seed = 1; seed <= CASES; seed++) {
      const { ladder, rnd } = make(seed);
      const order = ladder.layers.map((row) => [...row].sort(() => rnd() - 0.5));
      const pos = new Array<number>(ladder.nodes.length).fill(0);
      order.forEach((row) => row.forEach((n, k) => (pos[n] = k)));
      const fast = Int32Array.from(pos);
      const adj = adjacencyOld(ladder);
      const c = counting(ladder, adjacency(ladder));
      const full = (i: number): number => pairCrossingsOld(order, pos, adj, i) + flatCrossingsOld(ladder, order, pos, adj, i) + (i > 0 ? pairCrossingsOld(order, pos, adj, i - 1) : 0);
      for (let step = 0; step < 200; step++) {
        const i = Math.floor(rnd() * order.length);
        const row = order[i] as number[];
        if (row.length < 2) continue;
        const k = Math.floor(rnd() * (row.length - 1));
        const before = full(i);
        const delta = swapDelta(c, order, fast, i, k);
        // The order and the places are as they were after the call.
        expect(fast[row[k] as number]).toBe(k);
        const a = row[k] as number;
        const b = row[k + 1] as number;
        row[k] = b;
        row[k + 1] = a;
        pos[a] = k + 1;
        pos[b] = k;
        fast[a] = k + 1;
        fast[b] = k;
        expect([seed, step, full(i) - before]).toEqual([seed, step, delta]);
      }
    }
  });
});

describe('align.ts on arrays gives what it gave on lists', () => {
  it('aligns 500 seeded drawings with the same starts and width, under random options', () => {
    for (let seed = 1; seed <= CASES; seed++) {
      const { graph, ladder, rows, rnd } = make(seed);
      const layers = orderLayersOld(graph, ladder, rows, false, undefined, false, true).layers;
      const bits = (n: number, k: number): number => ((Math.imul(n + 1, 2654435761) ^ Math.imul(k + seed, 40503)) >>> 0) % 7;
      const extra: Extra = rnd() < 0.5 ? () => 0 : (a, b) => (bits(a, b) === 0 ? 1 : 0);
      const ports: PortGeometry = { steps: 4, reach: (u) => u / 2 - 0.375, ...(rnd() < 0.5 ? { inner: (u: number) => u / 2 - 0.2 } : {}), ...(rnd() < 0.15 ? { centred: true } : {}) };
      const main = new Set(ladder.nodes.filter((n) => n.idx < ladder.realCount && bits(n.idx, 1) < 2).map((n) => n.idx));
      const opts: AlignOptions = {
        ...(rnd() < 0.5 ? { limit: 8 + Math.floor(rnd() * 16) } : {}),
        ports,
        squeeze: rnd() < 0.3,
        lines: 1 + Math.floor(rnd() * 3),
        dummyShift: rnd() < 0.5 ? 0 : 1,
        main,
        degree: (n) => bits(n, 2),
        hubs: rnd() < 0.4,
        single: (n, side) => n < ladder.realCount && bits(n, side === 'up' ? 3 : 4) < 2,
      };
      const a: Aligned = align(ladder, layers, extra, opts);
      const b: Aligned = alignOld(ladder, layers, extra, opts);
      expect([seed, a.start, a.width]).toEqual([seed, b.start, b.width]);
      void pieces;
    }
  });
});
