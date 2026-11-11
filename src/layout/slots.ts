import type { Graph } from '../types.ts';

/**
 * Canvas-first slot placement. The canvas width fixes the number of columns K along the flow axis;
 * every node sits in one slot (lane, column, row) of that grid, wide nodes in `span` consecutive
 * columns. The cost is a pure function of the slot assignment, measured in slot units: edges are
 * drawn as the orthogonal shapes the router prefers, and lengths, crossings and blocked nodes are
 * counted. Nothing is routed while searching.
 */

/** Weights. A crossing outweighs a row; a row outweighs a column of length. */
export const W = {
  cross: 100,
  len: 2,
  bend: 1.5,
  back: 12,
  /** A backward in-lane edge whose target sits directly below or above the source. */
  backAligned: 6,
  misalign: 3,
  row: 22,
  far: 3,
  gap: 3,
  order: 0.05,
  /** A second edge between two nodes cannot also be a straight line. */
  repeat: 24,
};

const PASS_CAP = 12;
/** Starts searched while the best result so far still has a crossing or a blocked node. */
const RESTARTS = 1;
const EPS = 1e-9;
/** Nodes are shrunk by this much (slot units) before an edge is tested against them. */
const INSET = 0.1;

export interface SlotInput {
  graph: Graph;
  /** Rank and row from the unconstrained assignment. */
  rank: Map<string, number>;
  row: Map<string, number>;
  /** Columns of the canvas. */
  columns: number;
  /** Columns each node covers (absent: 1). */
  span: Map<string, number>;
}

export interface SlotResult {
  rank: Map<string, number>;
  row: Map<string, number>;
  span: Map<string, number>;
}

/** A node (index), the column and the row it moves to. */
type Move = readonly [number, number, number];

export interface Edge {
  a: number;
  b: number;
  /** In-lane: the end that comes first in the flow (the one with the lower initial rank). */
  first: number;
  second: number;
  sameLane: boolean;
  /** 0 for the first edge between two nodes, 1 for the next, and so on. */
  repeat: number;
}

/**
 * Segment as [x0, y0, x1, y1, leg] with x0 <= x1 and y0 <= y1. `leg` is 0, or +-1 for the middle leg of a
 * Z shape: +1 when the arm on its low side (left or top) attaches at the low end of the leg.
 */
const SEG = 5;
const MAX_SEGS = 5;

export class Placement {
  readonly n: number;
  readonly K: number;
  readonly lane: number[];
  readonly span: number[];
  readonly edges: Edge[];
  readonly incident: number[][];
  readonly lanes: number;
  col: number[];
  row: number[];
  rows: number[];
  offset: number[];
  private readonly occ: Array<Map<number, number>>;
  private readonly segs: Float64Array[];
  private readonly segCount: number[];
  /** Bounding box [x0, y0, x1, y1] of every edge path. */
  private readonly box: Float64Array;
  private readonly stamp: number[];
  private stampNow = 0;
  /** Number of cost evaluations; `total` is the only whole-assignment one. */
  evaluations = 0;
  totals = 0;
  /** Total cost of the current assignment; cleared whenever the assignment changes for good. */
  baseTotal: number | undefined;
  /** Weight of a crossing or blocked node; lowered during the first search phase. */
  cross = W.cross;

  constructor(
    lanes: number,
    lane: number[],
    span: number[],
    edges: Edge[],
    K: number,
    col: number[],
    row: number[],
  ) {
    this.n = lane.length;
    this.K = K;
    this.lanes = lanes;
    this.lane = lane;
    this.span = span;
    this.edges = edges;
    this.col = col;
    this.row = row;
    this.incident = lane.map(() => []);
    edges.forEach((e, i) => {
      this.incident[e.a]?.push(i);
      this.incident[e.b]?.push(i);
    });
    this.rows = new Array<number>(lanes).fill(1);
    this.offset = new Array<number>(lanes).fill(0);
    this.occ = Array.from({ length: lanes }, () => new Map<number, number>());
    this.segs = edges.map(() => new Float64Array(SEG * MAX_SEGS));
    this.segCount = edges.map(() => 0);
    this.box = new Float64Array(edges.length * 4);
    this.stamp = edges.map(() => 0);
    this.rebuild();
  }

  /** Recomputes occupancy, lane heights and every edge path. */
  rebuild(): void {
    this.occ.forEach((m) => m.clear());
    for (let i = 0; i < this.n; i++) this.mark(i, i);
    this.refreshRows();
    this.refreshOffsets();
    this.edges.forEach((_, e) => this.route(e));
  }

  private mark(i: number, value: number | undefined): void {
    const m = this.occ[this.lane[i] ?? 0];
    for (let c = 0; c < (this.span[i] ?? 1); c++) {
      const key = (this.row[i] ?? 0) * this.K + (this.col[i] ?? 0) + c;
      if (value === undefined) m?.delete(key);
      else m?.set(key, value);
    }
  }

  private refreshRows(): void {
    const rows = new Array<number>(this.lanes).fill(1);
    for (let i = 0; i < this.n; i++) {
      const l = this.lane[i] ?? 0;
      rows[l] = Math.max(rows[l] ?? 1, (this.row[i] ?? 0) + 1);
    }
    this.rows = rows;
  }

  private refreshOffsets(): void {
    this.offset = new Array<number>(this.lanes).fill(0);
    let acc = 0;
    for (let l = 0; l < this.lanes; l++) {
      this.offset[l] = acc;
      acc += this.rows[l] ?? 1;
    }
  }

  free(lane: number, row: number, col: number, span: number, self: number, other = -1): boolean {
    if (col < 0 || col + span > this.K || row < 0) return false;
    const m = this.occ[lane];
    for (let c = 0; c < span; c++) {
      const at = m?.get(row * this.K + col + c);
      if (at !== undefined && at !== self && at !== other) return false;
    }
    return true;
  }

  occupant(lane: number, row: number, col: number): number {
    return this.occ[lane]?.get(row * this.K + col) ?? -1;
  }

  private y(i: number): number {
    return (this.offset[this.lane[i] ?? 0] ?? 0) + (this.row[i] ?? 0);
  }

  /** Path of an edge in slot units: slot centres joined by the orthogonal shape the router prefers. */
  private route(e: number): void {
    const edge = this.edges[e];
    const out = this.segs[e];
    if (!edge || !out) return;
    const a = edge.a;
    const b = edge.b;
    const ca = this.col[a] ?? 0;
    const cb = this.col[b] ?? 0;
    const sa = this.span[a] ?? 1;
    const sb = this.span[b] ?? 1;
    const ya = this.y(a) + 0.5;
    const yb = this.y(b) + 0.5;
    const xa = ca + sa / 2;
    const xb = cb + sb / 2;
    let n = 0;
    const put = (x0: number, y0: number, x1: number, y1: number, leg = 0): void => {
      if (Math.abs(x0 - x1) < EPS && Math.abs(y0 - y1) < EPS) return;
      const k = n * SEG;
      out[k] = Math.min(x0, x1);
      out[k + 1] = Math.min(y0, y1);
      out[k + 2] = Math.max(x0, x1);
      out[k + 3] = Math.max(y0, y1);
      out[k + 4] = leg;
      n++;
    };
    if (cb >= ca + sa) {
      // Forward: out of the source's far side, along row boundaries, into the target's near side.
      const x1 = ca + sa;
      if (ya === yb) {
        put(xa, ya, xb, yb);
      } else if (x1 === cb) {
        put(xa, ya, x1, ya);
        put(x1, ya, x1, yb, ya < yb ? 1 : -1);
        put(x1, yb, xb, yb);
      } else {
        const ym = yb > ya ? yb - 0.5 : yb + 0.5;
        put(xa, ya, x1, ya);
        put(x1, ya, x1, ym, ya < ym ? 1 : -1);
        put(x1, ym, cb, ym, ya < ym ? 1 : -1);
        put(cb, ym, cb, yb, ym < yb ? 1 : -1);
        put(cb, yb, xb, yb);
      }
    } else if (ca >= cb + sb) {
      // Backward: down or up from the source, back along a row boundary, into the target.
      const ym = yb > ya ? ya + 0.5 : ya - 0.5;
      put(xa, ya, xa, ym);
      const topAtLow = yb > ya ? xa < xb : xb < xa;
      put(xa, ym, xb, ym, yb === ya ? 0 : topAtLow ? 1 : -1);
      put(xb, ym, xb, yb);
    } else {
      const lo = Math.max(ca, cb);
      const hi = Math.min(ca + sa, cb + sb);
      const x = (lo + hi) / 2;
      put(x, ya, x, yb);
    }
    this.segCount[e] = n;
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (let k = 0; k < n; k++) {
      x0 = Math.min(x0, out[k * SEG] ?? 0);
      y0 = Math.min(y0, out[k * SEG + 1] ?? 0);
      x1 = Math.max(x1, out[k * SEG + 2] ?? 0);
      y1 = Math.max(y1, out[k * SEG + 3] ?? 0);
    }
    this.box.set([x0, y0, x1, y1], e * 4);
  }

  private length(e: number): number {
    const s = this.segs[e];
    let total = 0;
    for (let k = 0; k < (this.segCount[e] ?? 0); k++) {
      total += (s?.[k * SEG + 2] ?? 0) - (s?.[k * SEG] ?? 0) + (s?.[k * SEG + 3] ?? 0) - (s?.[k * SEG + 1] ?? 0);
    }
    return total;
  }

  private crossings(e: number, f: number): number {
    const s = this.segs[e];
    const t = this.segs[f];
    if (!s || !t) return 0;
    const bx = this.box;
    if (
      (bx[e * 4 + 2] ?? 0) < (bx[f * 4] ?? 0) - EPS ||
      (bx[f * 4 + 2] ?? 0) < (bx[e * 4] ?? 0) - EPS ||
      (bx[e * 4 + 3] ?? 0) < (bx[f * 4 + 1] ?? 0) - EPS ||
      (bx[f * 4 + 3] ?? 0) < (bx[e * 4 + 1] ?? 0) - EPS
    ) {
      return 0;
    }
    let n = 0;
    for (let i = 0; i < (this.segCount[e] ?? 0); i++) {
      const ih = s[i * SEG + 1] === s[i * SEG + 3];
      for (let j = 0; j < (this.segCount[f] ?? 0); j++) {
        const jh = t[j * SEG + 1] === t[j * SEG + 3];
        if (ih === jh) {
          n += forcedCrossing(s, i * SEG, t, j * SEG, ih);
          continue;
        }
        const [h, hk, v, vk] = ih ? [s, i * SEG, t, j * SEG] : [t, j * SEG, s, i * SEG];
        const hy = h[hk + 1] ?? 0;
        const vx = v[vk] ?? 0;
        if (vx > (h[hk] ?? 0) + EPS && vx < (h[hk + 2] ?? 0) - EPS && hy > (v[vk + 1] ?? 0) + EPS && hy < (v[vk + 3] ?? 0) - EPS) n++;
      }
    }
    return n;
  }

  private blocked(e: number, node: number): number {
    const edge = this.edges[e];
    if (!edge || edge.a === node || edge.b === node) return 0;
    const s = this.segs[e];
    const x0 = (this.col[node] ?? 0) + INSET;
    const x1 = (this.col[node] ?? 0) + (this.span[node] ?? 1) - INSET;
    const y0 = this.y(node) + INSET;
    const y1 = this.y(node) + 1 - INSET;
    const bx = this.box;
    if ((bx[e * 4 + 2] ?? 0) <= x0 || (bx[e * 4] ?? 0) >= x1 || (bx[e * 4 + 3] ?? 0) <= y0 || (bx[e * 4 + 1] ?? 0) >= y1) return 0;
    for (let k = 0; k < (this.segCount[e] ?? 0); k++) {
      const b = k * SEG;
      if ((s?.[b] ?? 0) < x1 && (s?.[b + 2] ?? 0) > x0 && (s?.[b + 1] ?? 0) < y1 && (s?.[b + 3] ?? 0) > y0) return 1;
    }
    return 0;
  }

  /** Terms that belong to one edge alone. */
  private edgeTerm(e: number): number {
    const edge = this.edges[e];
    if (!edge) return 0;
    const { a, b } = edge;
    let cost = W.len * this.length(e) + W.bend * Math.max(0, (this.segCount[e] ?? 0) - 1);
    const ca = this.col[a] ?? 0;
    const cb = this.col[b] ?? 0;
    const sa = this.span[a] ?? 1;
    const sb = this.span[b] ?? 1;
    if (edge.repeat > 0 && this.segCount[e] === 1) cost += W.repeat;
    if (edge.sameLane) {
      const p = edge.first;
      const q = edge.second;
      const cp = this.col[p] ?? 0;
      const cq = this.col[q] ?? 0;
      const sp = this.span[p] ?? 1;
      if (cq < cp + sp) {
        const aligned = cq === cp && Math.abs((this.row[p] ?? 0) - (this.row[q] ?? 0)) === 1;
        cost += aligned ? W.backAligned : W.back;
      } else if (this.row[p] === this.row[q]) {
        cost += W.gap * (cq - cp - sp);
      }
    } else {
      const gap = Math.max(ca, cb) - Math.min(ca + sa, cb + sb);
      cost += W.misalign * (gap < 0 ? 0 : gap + 1);
      for (const [n, other] of [[a, b], [b, a]] as const) {
        const l = this.lane[n] ?? 0;
        const toward = (this.lane[other] ?? 0) > l;
        cost += W.far * (toward ? (this.rows[l] ?? 1) - 1 - (this.row[n] ?? 0) : (this.row[n] ?? 0));
      }
    }
    return cost;
  }

  private nodeTerm(i: number): number {
    return (W.order * ((this.n - i) / this.n)) * ((this.col[i] ?? 0) + (this.row[i] ?? 0));
  }

  /** Cost of everything that involves one of the given edges or nodes. */
  private local(edges: number[], nodes: number[]): number {
    this.evaluations++;
    this.stampNow++;
    for (const e of edges) this.stamp[e] = this.stampNow;
    let cost = 0;
    for (const e of edges) {
      cost += this.edgeTerm(e);
      let hits = 0;
      for (let f = 0; f < this.edges.length; f++) {
        if (f === e || (this.stamp[f] === this.stampNow && f < e)) continue;
        hits += this.crossings(e, f);
      }
      for (let i = 0; i < this.n; i++) hits += this.blocked(e, i);
      cost += this.cross * hits;
    }
    for (const i of nodes) {
      cost += this.nodeTerm(i);
      let hits = 0;
      for (let f = 0; f < this.edges.length; f++) if (this.stamp[f] !== this.stampNow) hits += this.blocked(f, i);
      cost += this.cross * hits;
    }
    return cost;
  }

  /** Crossings and blocked nodes of the current assignment. */
  hazards(): { crossings: number; blocked: number } {
    let crossings = 0;
    let blocked = 0;
    for (let e = 0; e < this.edges.length; e++) {
      for (let f = e + 1; f < this.edges.length; f++) crossings += this.crossings(e, f);
      for (let i = 0; i < this.n; i++) blocked += this.blocked(e, i);
    }
    return { crossings, blocked };
  }

  /** Cost of the whole assignment. */
  total(): number {
    this.totals++;
    let cost = 0;
    for (let e = 0; e < this.edges.length; e++) {
      cost += this.edgeTerm(e);
      for (let f = e + 1; f < this.edges.length; f++) cost += this.cross * this.crossings(e, f);
      for (let i = 0; i < this.n; i++) cost += this.cross * this.blocked(e, i);
    }
    for (let i = 0; i < this.n; i++) cost += this.nodeTerm(i);
    for (const r of this.rows) cost += W.row * r;
    return cost;
  }

  /** Lane heights after the given relocation, without applying it. */
  private heightsAfter(moves: readonly Move[]): number[] {
    const heights = [...this.rows];
    const lanes = new Set(moves.map((m) => this.lane[m[0]] ?? 0));
    for (const l of lanes) {
      let top = 0;
      for (let i = 0; i < this.n; i++) {
        if (this.lane[i] !== l) continue;
        const to = moves.find((m) => m[0] === i);
        top = Math.max(top, (to ? to[2] : (this.row[i] ?? 0)) + 1);
      }
      heights[l] = Math.max(1, top);
    }
    return heights;
  }

  /** Cost of what a set of moves can change, taken before the moves are applied. */
  before(moves: readonly Move[]): number {
    const nodes = moves.map((m) => m[0]);
    return this.local(this.edgesOf(nodes), nodes);
  }

  private edgesOf(nodes: readonly number[]): number[] {
    const set = new Set<number>();
    for (const i of nodes) for (const e of this.incident[i] ?? []) set.add(e);
    return [...set].sort((x, y) => x - y);
  }

  /**
   * Applies a set of moves and returns the change of the total cost. The moves are undone with
   * `restore`. Only the terms of the moved nodes and their edges are recomputed unless a lane's
   * row count changes, which shifts every lane below it. `known` is the result of `before` when the
   * caller already has it.
   */
  apply(moves: readonly Move[], known?: number): { delta: number; restore: () => void } {
    const nodes = moves.map((m) => m[0]);
    const old: Move[] = nodes.map((i) => [i, this.col[i] ?? 0, this.row[i] ?? 0]);
    const edges = this.edgesOf(nodes);
    const rowsBefore = this.rows;
    const offsetsBefore = this.offset;
    const heights = this.heightsAfter(moves);
    const shifts = heights.some((h, l) => h !== this.rows[l]);
    const place = (to: readonly Move[]): void => {
      for (const [i] of to) this.mark(i, undefined);
      for (const [i, c, r] of to) {
        this.col[i] = c;
        this.row[i] = r;
      }
      for (const [i] of to) this.mark(i, i);
    };

    this.baseTotal ??= shifts ? this.total() : undefined;
    const before = shifts ? (this.baseTotal ?? 0) : (known ?? this.local(edges, nodes));
    place(moves);
    if (shifts) {
      this.rows = heights;
      this.offset = [...this.offset];
      this.refreshOffsets();
      this.edges.forEach((_, e) => this.route(e));
    } else {
      for (const e of edges) this.route(e);
    }
    const after = shifts ? this.total() : this.local(edges, nodes);
    const delta = after - before;

    const restore = (): void => {
      place(old);
      this.rows = rowsBefore;
      this.offset = offsetsBefore;
      if (shifts) this.edges.forEach((_, e) => this.route(e));
      else for (const e of edges) this.route(e);
    };
    return { delta, restore };
  }
}

/**
 * Two Z-shaped edges whose middle legs share a channel and overlap must cross when their arms sit on
 * opposite orders, or when one leg lies strictly inside the other: no track order avoids it.
 */
function forcedCrossing(s: Float64Array, a: number, t: Float64Array, b: number, horizontal: boolean): number {
  const oa = s[a + 4] ?? 0;
  const ob = t[b + 4] ?? 0;
  if (oa === 0 || ob === 0) return 0;
  const [p, lo1, hi1, q, lo2, hi2] = horizontal
    ? [s[a + 1] ?? 0, s[a] ?? 0, s[a + 2] ?? 0, t[b + 1] ?? 0, t[b] ?? 0, t[b + 2] ?? 0]
    : [s[a] ?? 0, s[a + 1] ?? 0, s[a + 3] ?? 0, t[b] ?? 0, t[b + 1] ?? 0, t[b + 3] ?? 0];
  if (Math.abs(p - q) > EPS) return 0;
  if (Math.min(hi1, hi2) - Math.max(lo1, lo2) < EPS) return 0;
  if (oa !== ob) return 1;
  const nested = (lo1 < lo2 - EPS && hi2 < hi1 - EPS) || (lo2 < lo1 - EPS && hi1 < hi2 - EPS);
  return nested ? 1 : 0;
}

/** Positions of the initial assignment, wrapped into K columns. */
function wrap(
  lanes: number,
  lane: number[],
  rank: number[],
  row: number[],
  span: number[],
  K: number,
): { col: number[]; row: number[] } {
  const col = new Array<number>(lane.length).fill(0);
  const out = new Array<number>(lane.length).fill(0);
  const taken = Array.from({ length: lanes }, () => new Set<number>());
  const rowsOf = new Array<number>(lanes).fill(1);
  lane.forEach((l, i) => {
    rowsOf[l] = Math.max(rowsOf[l] ?? 1, (row[i] ?? 0) + 1);
  });
  const order = lane.map((_, i) => i).sort((a, b) => (rank[a] ?? 0) - (rank[b] ?? 0) || (row[a] ?? 0) - (row[b] ?? 0) || a - b);
  for (const i of order) {
    const l = lane[i] ?? 0;
    const s = span[i] ?? 1;
    let want = (rank[i] ?? 0) % K;
    let shift = Math.floor((rank[i] ?? 0) / K) * (rowsOf[l] ?? 1);
    if (want + s > K) {
      want = 0;
      shift += rowsOf[l] ?? 1;
    }
    const fits = (r: number, c: number): boolean => {
      for (let k = 0; k < s; k++) if (taken[l]?.has(r * K + c + k)) return false;
      return true;
    };
    search: for (let r = (row[i] ?? 0) + shift; ; r++) {
      for (let c = r === (row[i] ?? 0) + shift ? want : 0; c + s <= K; c++) {
        if (!fits(r, c)) continue;
        col[i] = c;
        out[i] = r;
        for (let k = 0; k < s; k++) taken[l]?.add(r * K + c + k);
        break search;
      }
    }
  }
  return { col, row: out };
}

/** Removes empty columns and empty rows. */
function compact(lanes: number, lane: number[], span: number[], col: number[], row: number[]): { col: number[]; row: number[] } {
  const used = new Set<number>();
  col.forEach((c, i) => {
    for (let k = 0; k < (span[i] ?? 1); k++) used.add(c + k);
  });
  const sorted = [...used].sort((a, b) => a - b);
  const at = new Map(sorted.map((c, k) => [c, k] as const));
  const outRow = new Array<number>(lane.length).fill(0);
  for (let l = 0; l < lanes; l++) {
    const members = lane.map((x, i) => (x === l ? i : -1)).filter((i) => i >= 0);
    const rows = [...new Set(members.map((i) => row[i] ?? 0))].sort((a, b) => a - b);
    for (const i of members) outRow[i] = rows.indexOf(row[i] ?? 0);
  }
  return { col: col.map((c) => at.get(c) ?? 0), row: outRow };
}

export function placeSlots(input: SlotInput): SlotResult {
  const { graph } = input;
  const ids = graph.nodes.map((n) => n.id);
  const index = new Map(ids.map((id, i) => [id, i] as const));
  const laneIndex = new Map(graph.lanes.map((l, i) => [l.id, i] as const));
  const lane = graph.nodes.map((n) => laneIndex.get(n.lane) ?? 0);
  const rank = ids.map((id) => input.rank.get(id) ?? 0);
  const row = ids.map((id) => input.row.get(id) ?? 0);
  const K = Math.max(1, input.columns);
  const span = ids.map((id) => Math.min(K, input.span.get(id) ?? 1));

  const edges: Edge[] = [];
  for (const e of graph.edges) {
    const a = index.get(e.from);
    const b = index.get(e.to);
    if (a === undefined || b === undefined || a === b) continue;
    const [first, second] = (rank[a] ?? 0) <= (rank[b] ?? 0) ? [a, b] : [b, a];
    const repeat = edges.filter((o) => (o.a === a && o.b === b) || (o.a === b && o.b === a)).length;
    edges.push({ a, b, first, second, sameLane: lane[a] === lane[b], repeat });
  }

  // Chains longer than the wrap width continue on the next row. Every wrap width gives a start;
  // the cheapest start is searched first and the others only while hazards remain.
  const starts: Array<{ p: Placement; cost: number }> = [];
  for (let width = K; width >= Math.max(1, Math.ceil(K / 2)); width--) {
    if (width < K && span.some((s) => s > width)) break;
    const start = wrap(graph.lanes.length, lane, rank, row, span, width);
    const candidate = new Placement(graph.lanes.length, lane, span, edges, K, start.col, start.row);
    starts.push({ p: candidate, cost: candidate.total() });
  }
  starts.sort((x, y) => x.cost - y.cost);

  const descend = (p: Placement): void => {
    for (let pass = 0; pass < PASS_CAP; pass++) {
      let improved = false;
      for (let i = 0; i < ids.length; i++) {
        const l = lane[i] ?? 0;
        const s = span[i] ?? 1;
        const choice: { delta: number; moves: Move[] | null } = { delta: -EPS, moves: null };
        const known = p.before([[i, p.col[i] ?? 0, p.row[i] ?? 0]]);
        const consider = (moves: Move[]): void => {
          const { delta, restore } = p.apply(moves, moves.length === 1 ? known : undefined);
          restore();
          if (delta < choice.delta) {
            choice.delta = delta;
            choice.moves = moves;
          }
        };
        const here = (p.rows[l] ?? 1) + 1;
        for (let r = 0; r < here; r++) {
          for (let c = 0; c + s <= K; c++) {
            if (c === p.col[i] && r === p.row[i]) continue;
            if (p.free(l, r, c, s, i)) consider([[i, c, r]]);
          }
        }
        for (let j = 0; j < ids.length; j++) {
          if (j === i || lane[j] !== l) continue;
          const [ci, ri, cj, rj] = [p.col[i] ?? 0, p.row[i] ?? 0, p.col[j] ?? 0, p.row[j] ?? 0];
          const sj = span[j] ?? 1;
          if (p.free(l, rj, cj, s, i, j) && p.free(l, ri, ci, sj, j, i) && !overlaps(ci, ri, sj, cj, rj, s)) {
            consider([[i, cj, rj], [j, ci, ri]]);
          }
        }
        if (choice.moves) {
          p.apply(choice.moves);
          p.baseTotal = undefined;
          improved = true;
        }
      }
      if (!improved) break;
    }
  };

  let p = starts[0]?.p;
  if (!p) return { rank: new Map(), row: new Map(), span: new Map() };
  let best = Infinity;
  if (ids.length > 1) {
    for (const start of starts.slice(0, RESTARTS)) {
      descend(start.p);
      const cost = start.p.total();
      if (cost < best - EPS) {
        best = cost;
        p = start.p;
      }
      const hz = p.hazards();
      if (hz.crossings + hz.blocked === 0) break;
    }
  }

  const final = compact(graph.lanes.length, lane, span, p.col, p.row);
  return {
    rank: new Map(ids.map((id, i) => [id, final.col[i] ?? 0] as const)),
    row: new Map(ids.map((id, i) => [id, final.row[i] ?? 0] as const)),
    span: new Map(ids.map((id, i) => [id, span[i] ?? 1] as const)),
  };
}

/** True when the two boxes (given as column, row, span of one and the same for the other) share a slot. */
function overlaps(ci: number, ri: number, sj: number, cj: number, rj: number, si: number): boolean {
  // Node i moves to (cj, rj) with span si; node j moves to (ci, ri) with span sj.
  return rj === ri && cj < ci + sj && ci < cj + si;
}
