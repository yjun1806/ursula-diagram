import type { Ruler } from '../metrics.ts';
import type { Geo, Side, Skeleton, Slot } from './place.ts';
import type { EdgePlan } from './plan.ts';
import { isFlowSide } from './plan.ts';

export type Vertex = readonly [number, number];

/**
 * A maximal straight piece of an edge that lies on one channel centre line.
 * `kind` 'f' is a line at constant f (an f-channel, running along c); 'c' is the
 * reverse. lo and hi are positions along the line in half-channel units: an even
 * value 2k is channel k, and 2k + 1 is the middle of the node slot between
 * channel k and channel k + 1.
 */
export interface Run {
  id: number;
  edge: number;
  kind: 'f' | 'c';
  idx: number;
  lo: number;
  hi: number;
}

export interface Routed {
  plan: EdgePlan;
  runs: number[];
}

type Dir = 0 | 1; // 0: moving along f (a changes), 1: moving along c (b changes)

function corners(s: Slot, side: Side): Vertex[] {
  const r = s.rank;
  const cb = s.cb;
  switch (side) {
    case 'fH':
      return [[r + s.span, cb], [r + s.span, cb + 1]];
    case 'fL':
      return [[r, cb], [r, cb + 1]];
    case 'cL':
      return [[r, cb], [r + s.span, cb]];
    case 'cH':
      return [[r, cb + 1], [r + s.span, cb + 1]];
  }
}

const sideDir = (side: Side): Dir => (isFlowSide(side) ? 1 : 0);

/** Where the stub of a port meets its channel line, in half-channel units (A for f, B for c). */
function stubPoint(s: Slot, side: Side): Vertex {
  switch (side) {
    case 'fH':
      return [2 * (s.rank + s.span), 2 * s.cb + 1];
    case 'fL':
      return [2 * s.rank, 2 * s.cb + 1];
    case 'cL':
      return [2 * s.rank + s.span, 2 * s.cb];
    case 'cH':
      return [2 * s.rank + s.span, 2 * (s.cb + 1)];
  }
}

/** Binary min-heap of (cost, seq) keys with an integer payload, in parallel typed arrays. */
class Heap {
  private cost = new Float64Array(64);
  private seq = new Int32Array(64);
  private state = new Int32Array(64);
  size = 0;
  /** Cost of the entry `pop` returned last. */
  popped = 0;

  private less(a: number, b: number): boolean {
    const x = this.cost[a] ?? 0;
    const y = this.cost[b] ?? 0;
    return x < y || (x === y && (this.seq[a] ?? 0) < (this.seq[b] ?? 0));
  }

  private swap(a: number, b: number): void {
    const c = this.cost[a] ?? 0;
    const q = this.seq[a] ?? 0;
    const s = this.state[a] ?? 0;
    this.cost[a] = this.cost[b] ?? 0;
    this.seq[a] = this.seq[b] ?? 0;
    this.state[a] = this.state[b] ?? 0;
    this.cost[b] = c;
    this.seq[b] = q;
    this.state[b] = s;
  }

  private grow(): void {
    const cost = new Float64Array(this.cost.length * 2);
    const seq = new Int32Array(this.seq.length * 2);
    const state = new Int32Array(this.state.length * 2);
    cost.set(this.cost);
    seq.set(this.seq);
    state.set(this.state);
    this.cost = cost;
    this.seq = seq;
    this.state = state;
  }

  push(cost: number, seq: number, state: number): void {
    if (this.size === this.cost.length) this.grow();
    let i = this.size++;
    this.cost[i] = cost;
    this.seq[i] = seq;
    this.state[i] = state;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!this.less(i, parent)) break;
      this.swap(i, parent);
      i = parent;
    }
  }

  /** Removes the smallest entry, sets `popped` to its cost and returns its state. */
  pop(): number {
    this.popped = this.cost[0] ?? 0;
    const top = this.state[0] ?? 0;
    const last = --this.size;
    if (last > 0) {
      this.cost[0] = this.cost[last] ?? 0;
      this.seq[0] = this.seq[last] ?? 0;
      this.state[0] = this.state[last] ?? 0;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < last && this.less(l, m)) m = l;
        if (r < last && this.less(r, m)) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }
}

interface Terminal {
  v: Vertex;
  dir: Dir;
  cost: number;
}

/** What every search of one routing shares: the grid, the cells no line may cross, and scratch arrays. */
interface Grid {
  A: number;
  B: number;
  /** A wide box covers the inner rank channels of its row: no line may run across it. */
  inside: Uint8Array;
  dist: Float64Array;
  prev: Int32Array;
  heap: Heap;
}

function gridOf(sk: Skeleton): Grid {
  const A = sk.ranks + 1;
  const B = sk.channels;
  const inside = new Uint8Array(A * B);
  for (const slot of sk.slots) for (let a = slot.rank + 1; a < slot.rank + slot.span; a++) inside[a * B + slot.cb] = 1;
  return { A, B, inside, dist: new Float64Array(A * B * 2), prev: new Int32Array(A * B * 2), heap: new Heap() };
}

/** Shortest orthogonal path on the channel grid; each bend costs `bend`. */
function shortestPath(grid: Grid, geo: Geo, bend: number, starts: Terminal[], ends: Terminal[]): Vertex[] | null {
  const { A, B, inside, dist, prev, heap } = grid;
  dist.fill(Infinity);
  prev.fill(-1);
  heap.size = 0;
  const id = (a: number, b: number, d: Dir): number => (a * B + b) * 2 + d;
  let seq = 0;
  for (const s of starts) {
    const st = id(s.v[0], s.v[1], s.dir);
    if (s.cost < (dist[st] ?? Infinity)) {
      dist[st] = s.cost;
      heap.push(s.cost, seq++, st);
    }
  }
  while (heap.size > 0) {
    const state = heap.pop();
    const cost0 = heap.popped;
    if (cost0 > (dist[state] ?? Infinity)) continue;
    const d = state & 1;
    const cell = state >> 1;
    const a = Math.floor(cell / B);
    const b = cell % B;
    // Order matters for ties: along f toward lower then higher, then along c.
    for (let k = 0; k < 4; k++) {
      const nd = k >> 1;
      const step = (k & 1) === 0 ? -1 : 1;
      const na = nd === 0 ? a + step : a;
      const nb = nd === 1 ? b + step : b;
      if (na < 0 || na >= A || nb < 0 || nb >= B) continue;
      if (nd === 1 && inside[a * B + Math.min(b, nb)] === 1) continue;
      const len = nd === 0 ? Math.abs((geo.fC[na] ?? 0) - (geo.fC[a] ?? 0)) : Math.abs((geo.cC[nb] ?? 0) - (geo.cC[b] ?? 0));
      const cost = cost0 + len + (nd !== d ? bend : 0);
      const ns = (na * B + nb) * 2 + nd;
      if (cost < (dist[ns] ?? Infinity) - 1e-9) {
        dist[ns] = cost;
        prev[ns] = state;
        heap.push(cost, seq++, ns);
      }
    }
  }
  let best = Infinity;
  let bestState = -1;
  for (const e of ends) {
    for (const d of [0, 1] as const) {
      const st = id(e.v[0], e.v[1], d);
      const total = (dist[st] ?? Infinity) + (d !== e.dir ? bend : 0) + e.cost;
      if (total < best - 1e-9) {
        best = total;
        bestState = st;
      }
    }
  }
  if (bestState < 0) return null;
  const out: Vertex[] = [];
  for (let st = bestState; st >= 0; st = prev[st] ?? -1) {
    const cell = st >> 1;
    const v: Vertex = [Math.floor(cell / B), cell % B];
    const last = out[out.length - 1];
    if (!last || last[0] !== v[0] || last[1] !== v[1]) out.push(v);
  }
  return out.reverse();
}

function terminals(sk: Skeleton, geo: Geo, s: Slot, side: Side): Terminal[] {
  const midC = ((geo.cC[s.cb] ?? 0) + (geo.cC[s.cb + 1] ?? 0)) / 2;
  const midF = ((geo.fC[s.rank] ?? 0) + (geo.fC[s.rank + s.span] ?? 0)) / 2;
  return corners(s, side).map(([a, b]) => ({
    v: [a, b] as const,
    dir: sideDir(side),
    cost: isFlowSide(side) ? Math.abs((geo.cC[b] ?? 0) - midC) : Math.abs((geo.fC[a] ?? 0) - midF),
  }));
}

/** Cuts a vertex path into runs of collinear movement, starting and ending at the port stubs. */
function runsOf(verts: Vertex[], from: Slot, srcSide: Side, to: Slot, tgtSide: Side): Array<Omit<Run, 'id' | 'edge'>> {
  const pts: Vertex[] = [stubPoint(from, srcSide), ...verts.map((v) => [2 * v[0], 2 * v[1]] as const), stubPoint(to, tgtSide)];
  const out: Array<Omit<Run, 'id' | 'edge'>> = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const p = pts[i];
    const q = pts[i + 1];
    if (!p || !q || (p[0] === q[0] && p[1] === q[1])) continue;
    const piece =
      p[0] === q[0]
        ? { kind: 'f' as const, idx: p[0] / 2, lo: Math.min(p[1], q[1]), hi: Math.max(p[1], q[1]) }
        : { kind: 'c' as const, idx: p[1] / 2, lo: Math.min(p[0], q[0]), hi: Math.max(p[0], q[0]) };
    const last = out[out.length - 1];
    if (last && last.kind === piece.kind && last.idx === piece.idx) {
      out[out.length - 1] = { ...last, lo: Math.min(last.lo, piece.lo), hi: Math.max(last.hi, piece.hi) };
    } else {
      out.push(piece);
    }
  }
  return out;
}

/** Routes every non-straight edge on the channel grid and returns the runs it occupies. */
export function routeEdges(
  sk: Skeleton,
  geo: Geo,
  ruler: Ruler,
  plans: EdgePlan[],
): { routed: Map<number, Routed>; runs: Run[] } {
  const routed = new Map<number, Routed>();
  const runs: Run[] = [];
  const grid = gridOf(sk);
  for (const plan of plans) {
    if (plan.straight) continue;
    const from = sk.byId.get(plan.from);
    const to = sk.byId.get(plan.to);
    if (!from || !to) continue;
    let pieces: Array<Omit<Run, 'id' | 'edge'>>;
    if (plan.self) {
      pieces = [{ kind: 'c', idx: from.cb, lo: 2 * from.rank + from.span, hi: 2 * from.rank + from.span }];
    } else {
      const path = shortestPath(
        grid,
        geo,
        ruler.rankGap,
        terminals(sk, geo, from, plan.srcSide),
        terminals(sk, geo, to, plan.tgtSide),
      );
      if (!path) continue;
      pieces = runsOf(path, from, plan.srcSide, to, plan.tgtSide);
    }
    const ids: number[] = [];
    for (const piece of pieces) {
      const id = runs.length;
      runs.push({ ...piece, id, edge: plan.index });
      ids.push(id);
    }
    routed.set(plan.index, { plan, runs: ids });
  }
  return { routed, runs };
}
