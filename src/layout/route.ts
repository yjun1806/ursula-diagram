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

class Heap {
  private readonly items: Array<{ cost: number; seq: number; state: number }> = [];

  get size(): number {
    return this.items.length;
  }

  private less(a: number, b: number): boolean {
    const x = this.items[a];
    const y = this.items[b];
    if (!x || !y) return false;
    return x.cost < y.cost || (x.cost === y.cost && x.seq < y.seq);
  }

  private swap(a: number, b: number): void {
    const x = this.items[a];
    const y = this.items[b];
    if (!x || !y) return;
    this.items[a] = y;
    this.items[b] = x;
  }

  push(cost: number, seq: number, state: number): void {
    this.items.push({ cost, seq, state });
    let i = this.items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!this.less(i, parent)) break;
      this.swap(i, parent);
      i = parent;
    }
  }

  pop(): { cost: number; state: number } | undefined {
    const top = this.items[0];
    const last = this.items.pop();
    if (!top || !last) return undefined;
    if (this.items.length > 0) {
      this.items[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < this.items.length && this.less(l, m)) m = l;
        if (r < this.items.length && this.less(r, m)) m = r;
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

/** Shortest orthogonal path on the channel grid; each bend costs `bend`. */
function shortestPath(
  sk: Skeleton,
  geo: Geo,
  bend: number,
  starts: Terminal[],
  ends: Terminal[],
): Vertex[] | null {
  const A = sk.ranks + 1;
  const B = sk.channels;
  // A wide box covers the inner rank channels of its row: no line may run across it.
  const inside = new Set<number>();
  for (const slot of sk.slots) for (let a = slot.rank + 1; a < slot.rank + slot.span; a++) inside.add(a * B + slot.cb);
  const id = (a: number, b: number, d: Dir): number => (a * B + b) * 2 + d;
  const dist = new Array<number>(A * B * 2).fill(Infinity);
  const prev = new Array<number>(A * B * 2).fill(-1);
  const heap = new Heap();
  let seq = 0;
  for (const s of starts) {
    const st = id(s.v[0], s.v[1], s.dir);
    if (s.cost < (dist[st] ?? Infinity)) {
      dist[st] = s.cost;
      heap.push(s.cost, seq++, st);
    }
  }
  while (heap.size > 0) {
    const cur = heap.pop();
    if (!cur) break;
    if (cur.cost > (dist[cur.state] ?? Infinity)) continue;
    const d = (cur.state % 2) as Dir;
    const cell = (cur.state - d) / 2;
    const a = Math.floor(cell / B);
    const b = cell % B;
    for (const nd of [0, 1] as const) {
      for (const step of [-1, 1]) {
        const na = nd === 0 ? a + step : a;
        const nb = nd === 1 ? b + step : b;
        if (na < 0 || na >= A || nb < 0 || nb >= B) continue;
        if (nd === 1 && inside.has(a * B + Math.min(b, nb))) continue;
        const len = nd === 0 ? Math.abs((geo.fC[na] ?? 0) - (geo.fC[a] ?? 0)) : Math.abs((geo.cC[nb] ?? 0) - (geo.cC[b] ?? 0));
        const cost = cur.cost + len + (nd !== d ? bend : 0);
        const ns = id(na, nb, nd);
        if (cost < (dist[ns] ?? Infinity) - 1e-9) {
          dist[ns] = cost;
          prev[ns] = cur.state;
          heap.push(cost, seq++, ns);
        }
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
    const cell = (st - (st % 2)) / 2;
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
        sk,
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
