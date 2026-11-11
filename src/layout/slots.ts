import type { Graph } from '../types.ts';

/**
 * Canvas-first slot placement. The canvas width fixes the number of slot units K along the flow axis; a unit
 * is half of a box plus half a gap, so a normal box covers two units and a box that starts on an odd unit
 * sits half a step off the regular columns. Every node sits in one slot (lane, unit, row), wide nodes in
 * `span` consecutive units. The cost is a pure function of the slot assignment: edges are drawn as the
 * orthogonal shapes the router prefers, and bends, crossings and blocked nodes are counted. Nothing is
 * routed while searching, and edge length is not rewarded.
 */

/** Weights. A crossing outweighs a bend; a bend outweighs a half-step box; rows are charged per lane. */
export const W = {
  cross: 100,
  bend: 10,
  /** A box on an odd unit. */
  half: 4,
  /** Each row of a lane beyond its first. */
  row: 6,
  /** Each row of a lane beyond its second: a third row is worth it only against a crossing. */
  rowMany: 160,
  /** An in-lane edge that does not run forward along the flow axis; less when its ends sit in adjacent rows of one column. */
  back: 5,
  backAligned: 2,
  /** Tie-break that prefers earlier units and rows for earlier nodes. */
  order: 0.02,
};

const PASS_CAP = 12;
/** Starts searched while the best result so far still has a crossing or a blocked node. */
const RESTARTS = 2;
const EPS = 1e-9;
/** Slack for bounds that add up their terms in another order than the cost they bound. */
const BOUND_MARGIN = 1e-6;
/** Nodes are shrunk by this much (slot units) before an edge is tested against them. */
const INSET = 0.1;

export interface SlotInput {
  graph: Graph;
  /** Rank and row from the unconstrained assignment. */
  rank: Map<string, number>;
  row: Map<string, number>;
  /** Columns of the canvas. */
  columns: number;
  /** Slot units each node covers (absent: 2). */
  span: Map<string, number>;
  /** Clear distance between touching boxes as a fraction of a slot unit. */
  gap?: number;
}

export interface SlotResult {
  rank: Map<string, number>;
  row: Map<string, number>;
  span: Map<string, number>;
  /** The assignments of the other starts, cheapest first; searched on demand. */
  rest?: () => SlotResult[];
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
  /** Gap between touching boxes in slot units: a box covers its units less this much. */
  readonly g: number;
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
  /** Rectangle [x0, y0, x1, y1] of every node, shrunk by INSET; the y values follow the lane offsets. */
  private readonly rect: Float64Array;
  /** Crossings of every edge pair and blocked nodes of every edge in the assignment `baseTotal` belongs to. */
  private readonly baseCross: Int32Array;
  private readonly baseBlocked: Int32Array;
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
    g = 0.5,
  ) {
    this.g = g;
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
    this.rect = new Float64Array(lane.length * 4);
    this.baseCross = new Int32Array(edges.length * edges.length);
    this.baseBlocked = new Int32Array(edges.length * lane.length);
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
    for (let c = 0; c < (this.span[i] ?? 2); c++) {
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
    this.refreshRects();
  }

  private refreshRects(): void {
    for (let i = 0; i < this.n; i++) this.refreshRect(i);
  }

  private refreshRect(i: number): void {
    const k = i * 4;
    const y = this.y(i);
    this.rect[k] = (this.col[i] ?? 0) + INSET;
    this.rect[k + 1] = y + INSET;
    this.rect[k + 2] = (this.col[i] ?? 0) + (this.span[i] ?? 2) - this.g - INSET;
    this.rect[k + 3] = y + 1 - INSET;
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
    const sa = this.span[a] ?? 2;
    const sb = this.span[b] ?? 2;
    const ya = this.y(a) + 0.5;
    const yb = this.y(b) + 0.5;
    const g = this.g;
    const xa = ca + (sa - g) / 2;
    const xb = cb + (sb - g) / 2;
    let n = 0;
    if (cb >= ca + sa) {
      // Forward: out of the source's far side, along row boundaries, into the target's near side.
      const x1 = ca + sa - g / 2;
      const x2 = cb - g / 2;
      if (ya === yb) {
        n = put(out, n, xa, ya, xb, yb);
      } else if (ca + sa === cb) {
        n = put(out, n, xa, ya, x1, ya);
        n = put(out, n, x1, ya, x1, yb, ya < yb ? 1 : -1);
        n = put(out, n, x1, yb, xb, yb);
      } else {
        const ym = yb > ya ? yb - 0.5 : yb + 0.5;
        n = put(out, n, xa, ya, x1, ya);
        n = put(out, n, x1, ya, x1, ym, ya < ym ? 1 : -1);
        n = put(out, n, x1, ym, x2, ym, ya < ym ? 1 : -1);
        n = put(out, n, x2, ym, x2, yb, ym < yb ? 1 : -1);
        n = put(out, n, x2, yb, xb, yb);
      }
    } else if (ca >= cb + sb) {
      // Backward: down or up from the source, back along a row boundary, into the target.
      const ym = yb > ya ? ya + 0.5 : ya - 0.5;
      n = put(out, n, xa, ya, xa, ym);
      const topAtLow = yb > ya ? xa < xb : xb < xa;
      n = put(out, n, xa, ym, xb, ym, yb === ya ? 0 : topAtLow ? 1 : -1);
      n = put(out, n, xb, ym, xb, yb);
    } else {
      const lo = Math.max(ca, cb);
      const hi = Math.min(ca + sa, cb + sb) - g;
      const x = (lo + hi) / 2;
      n = put(out, n, x, ya, x, yb);
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
    this.box[e * 4] = x0;
    this.box[e * 4 + 1] = y0;
    this.box[e * 4 + 2] = x1;
    this.box[e * 4 + 3] = y1;
  }

  private crossings(e: number, f: number): number {
    const bx = this.box;
    if (
      (bx[e * 4 + 2] ?? 0) < (bx[f * 4] ?? 0) - EPS ||
      (bx[f * 4 + 2] ?? 0) < (bx[e * 4] ?? 0) - EPS ||
      (bx[e * 4 + 3] ?? 0) < (bx[f * 4 + 1] ?? 0) - EPS ||
      (bx[f * 4 + 3] ?? 0) < (bx[e * 4 + 1] ?? 0) - EPS
    ) {
      return 0;
    }
    const s = this.segs[e];
    const t = this.segs[f];
    if (!s || !t) return 0;
    let n = 0;
    for (let i = 0; i < (this.segCount[e] ?? 0); i++) {
      const ih = s[i * SEG + 1] === s[i * SEG + 3];
      for (let j = 0; j < (this.segCount[f] ?? 0); j++) {
        const jh = t[j * SEG + 1] === t[j * SEG + 3];
        if (ih === jh) {
          n += forcedCrossing(s, i * SEG, t, j * SEG, ih);
          continue;
        }
        const h = ih ? s : t;
        const hk = ih ? i * SEG : j * SEG;
        const v = ih ? t : s;
        const vk = ih ? j * SEG : i * SEG;
        const hy = h[hk + 1] ?? 0;
        const vx = v[vk] ?? 0;
        if (vx > (h[hk] ?? 0) + EPS && vx < (h[hk + 2] ?? 0) - EPS && hy > (v[vk + 1] ?? 0) + EPS && hy < (v[vk + 3] ?? 0) - EPS) n++;
      }
    }
    return n;
  }

  private blocked(e: number, node: number): number {
    const bx = this.box;
    const r = this.rect;
    const k = node * 4;
    const x0 = r[k] ?? 0;
    const y0 = r[k + 1] ?? 0;
    const x1 = r[k + 2] ?? 0;
    const y1 = r[k + 3] ?? 0;
    if ((bx[e * 4 + 2] ?? 0) <= x0 || (bx[e * 4] ?? 0) >= x1 || (bx[e * 4 + 3] ?? 0) <= y0 || (bx[e * 4 + 1] ?? 0) >= y1) return 0;
    const edge = this.edges[e];
    if (!edge || edge.a === node || edge.b === node) return 0;
    const s = this.segs[e];
    for (let q = 0; q < (this.segCount[e] ?? 0); q++) {
      const b = q * SEG;
      if ((s?.[b] ?? 0) < x1 && (s?.[b + 2] ?? 0) > x0 && (s?.[b + 1] ?? 0) < y1 && (s?.[b + 3] ?? 0) > y0) return 1;
    }
    return 0;
  }

  /** Nodes that edge `e` runs through. */
  private blockedBy(e: number): number {
    let hits = 0;
    for (let i = 0; i < this.n; i++) hits += this.blocked(e, i);
    return hits;
  }

  /** Terms that belong to one edge alone: the bends of its predicted path. */
  private edgeTerm(e: number): number {
    const edge = this.edges[e];
    let cost = W.bend * Math.max(0, (this.segCount[e] ?? 0) - 1);
    if (edge?.sameLane) {
      const p = edge.first;
      const q = edge.second;
      const cp = this.col[p] ?? 0;
      const cq = this.col[q] ?? 0;
      if (cq < cp + (this.span[p] ?? 2)) {
        const aligned = cq === cp && Math.abs((this.row[p] ?? 0) - (this.row[q] ?? 0)) === 1;
        cost += aligned ? W.backAligned : W.back;
      }
    }
    return cost;
  }

  private nodeTerm(i: number): number {
    const c = this.col[i] ?? 0;
    return (c % 2 === 1 ? W.half : 0) + (W.order * ((this.n - i) / this.n)) * (c + (this.row[i] ?? 0));
  }

  /**
   * Cost of everything that involves one of the given edges or nodes. Without `hazards` the crossing and
   * blocked-node terms are left out, which gives a lower bound: they are never negative. With `bound` the sum
   * stops early, returning a partial sum, once it exceeds `before + bound` (every term is non-negative).
   */
  private local(edges: number[], nodes: number[], hazards = true, before = 0, bound = Infinity): number {
    this.evaluations++;
    this.stampNow++;
    for (const e of edges) this.stamp[e] = this.stampNow;
    let cost = 0;
    for (const e of edges) {
      cost += this.edgeTerm(e);
      if (!hazards) continue;
      let hits = 0;
      for (let f = 0; f < this.edges.length; f++) {
        if (f === e || (this.stamp[f] === this.stampNow && f < e)) continue;
        hits += this.crossings(e, f);
      }
      hits += this.blockedBy(e);
      cost += this.cross * hits;
      if (cost - before >= bound) return cost;
    }
    for (const i of nodes) {
      cost += this.nodeTerm(i);
      if (!hazards) continue;
      let hits = 0;
      for (let f = 0; f < this.edges.length; f++) if (this.stamp[f] !== this.stampNow) hits += this.blocked(f, i);
      cost += this.cross * hits;
      if (cost - before >= bound) return cost;
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

  /** Cost of the whole assignment; without `hazards`, a lower bound that leaves out crossings and blocked nodes. */
  total(hazards = true): number {
    this.totals++;
    let cost = 0;
    for (let e = 0; e < this.edges.length; e++) {
      cost += this.edgeTerm(e);
      if (!hazards) continue;
      for (let f = e + 1; f < this.edges.length; f++) cost += this.cross * this.crossings(e, f);
      for (let i = 0; i < this.n; i++) cost += this.cross * this.blocked(e, i);
    }
    for (let i = 0; i < this.n; i++) cost += this.nodeTerm(i);
    for (const r of this.rows) cost += W.row * Math.max(0, r - 1) + W.rowMany * Math.max(0, r - 2);
    return cost;
  }

  /** Remembers the crossings and blocked nodes of every edge in the current assignment. */
  private recordBase(): void {
    const count = this.edges.length;
    for (let e = 0; e < count; e++) {
      for (let f = e + 1; f < count; f++) this.baseCross[e * count + f] = this.crossings(e, f);
      for (let i = 0; i < this.n; i++) this.baseBlocked[e * this.n + i] = this.blocked(e, i);
    }
  }

  /**
   * Crossings and blocked nodes that stay the same when `node` moves and the lanes after its lane shift
   * to `heights`: both parts of a pair move together, so their relation is unchanged.
   */
  private keptHazards(node: number, heights: readonly number[]): number {
    const l = this.lane[node] ?? 0;
    const d = (heights[l] ?? 0) - (this.rows[l] ?? 0);
    const shiftOf = (m: number): number => ((this.lane[m] ?? 0) > l ? d : 0);
    const count = this.edges.length;
    let kept = 0;
    for (let e = 0; e < count; e++) {
      const edge = this.edges[e];
      if (!edge || edge.a === node || edge.b === node) continue;
      const se = shiftOf(edge.a);
      if (shiftOf(edge.b) !== se) continue;
      for (let f = e + 1; f < count; f++) {
        const other = this.edges[f];
        if (!other || other.a === node || other.b === node) continue;
        if (shiftOf(other.a) === se && shiftOf(other.b) === se) kept += this.baseCross[e * count + f] ?? 0;
      }
      for (let m = 0; m < this.n; m++) if (m !== node && shiftOf(m) === se) kept += this.baseBlocked[e * this.n + m] ?? 0;
    }
    return kept;
  }

  /** Lane heights after the given relocation, without applying it. */
  private heightsAfter(moves: readonly Move[]): number[] {
    const heights = [...this.rows];
    for (const [moved] of moves) {
      const l = this.lane[moved] ?? 0;
      let top = 0;
      for (let i = 0; i < this.n; i++) {
        if (this.lane[i] !== l) continue;
        let r = this.row[i] ?? 0;
        for (const m of moves) if (m[0] === i) r = m[2];
        top = Math.max(top, r + 1);
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
    const [only] = nodes;
    if (nodes.length === 1 && only !== undefined) return this.incident[only] ?? [];
    const set = new Set<number>();
    for (const i of nodes) for (const e of this.incident[i] ?? []) set.add(e);
    return [...set].sort((x, y) => x - y);
  }

  /**
   * Applies a set of moves and returns the change of the total cost. The moves are undone with
   * `restore`. Only the terms of the moved nodes and their edges are recomputed unless a lane's
   * row count changes, which shifts every lane below it. `known` is the result of `before` when the
   * caller already has it. With `bound`, a move that cannot get below it even without its crossings is
   * not evaluated further and reports a delta that is not below `bound`.
   */
  apply(moves: readonly Move[], known?: number, bound?: number): { delta: number; restore: () => void } {
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
      for (const [i] of to) {
        this.mark(i, i);
        this.refreshRect(i);
      }
    };

    if (shifts && this.baseTotal === undefined) {
      this.baseTotal = this.total();
      this.recordBase();
    }
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
    const restore = (): void => {
      place(old);
      this.rows = rowsBefore;
      this.offset = offsetsBefore;
      if (shifts) {
        this.refreshRects();
        this.edges.forEach((_, e) => this.route(e));
      } else for (const e of edges) this.route(e);
    };

    let after = bound === undefined ? undefined : shifts ? this.total(false) : this.local(edges, nodes, false);
    if (after !== undefined && bound !== undefined && after - before >= bound) return { delta: after - before, restore };
    if (after !== undefined && bound !== undefined && shifts && moves.length === 1) {
      // The kept hazards are added as one lump, so the sum may differ from the real one by rounding.
      const kept = this.keptHazards(moves[0]?.[0] ?? 0, heights);
      if (after + this.cross * kept - before >= bound + BOUND_MARGIN) return { delta: Infinity, restore };
    }
    after = shifts ? this.total() : this.local(edges, nodes, true, before, bound ?? Infinity);
    const delta = after - before;

    return { delta, restore };
  }
}

/** Appends a segment to a path unless it has no length; returns the new segment count. */
function put(out: Float64Array, n: number, x0: number, y0: number, x1: number, y1: number, leg = 0): number {
  if (Math.abs(x0 - x1) < EPS && Math.abs(y0 - y1) < EPS) return n;
  const k = n * SEG;
  out[k] = Math.min(x0, x1);
  out[k + 1] = Math.min(y0, y1);
  out[k + 2] = Math.max(x0, x1);
  out[k + 3] = Math.max(y0, y1);
  out[k + 4] = leg;
  return n + 1;
}

/**
 * Two Z-shaped edges whose middle legs share a channel and overlap must cross when their arms sit on
 * opposite orders, or when one leg lies strictly inside the other: no track order avoids it.
 */
function forcedCrossing(s: Float64Array, a: number, t: Float64Array, b: number, horizontal: boolean): number {
  const oa = s[a + 4] ?? 0;
  const ob = t[b + 4] ?? 0;
  if (oa === 0 || ob === 0) return 0;
  const p = horizontal ? (s[a + 1] ?? 0) : (s[a] ?? 0);
  const lo1 = horizontal ? (s[a] ?? 0) : (s[a + 1] ?? 0);
  const hi1 = horizontal ? (s[a + 2] ?? 0) : (s[a + 3] ?? 0);
  const q = horizontal ? (t[b + 1] ?? 0) : (t[b] ?? 0);
  const lo2 = horizontal ? (t[b] ?? 0) : (t[b + 1] ?? 0);
  const hi2 = horizontal ? (t[b + 2] ?? 0) : (t[b + 3] ?? 0);
  if (Math.abs(p - q) > EPS) return 0;
  if (Math.min(hi1, hi2) - Math.max(lo1, lo2) < EPS) return 0;
  if (oa !== ob) return 1;
  const nested = (lo1 < lo2 - EPS && hi2 < hi1 - EPS) || (lo2 < lo1 - EPS && hi1 < hi2 - EPS);
  return nested ? 1 : 0;
}

/** Positions of the initial assignment: ranks wrapped into `width` columns of two units each, K units wide. */
function wrap(
  lanes: number,
  lane: number[],
  rank: number[],
  row: number[],
  span: number[],
  K: number,
  width: number,
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
    const s = span[i] ?? 2;
    let want = 2 * ((rank[i] ?? 0) % width);
    let shift = Math.floor((rank[i] ?? 0) / width) * (rowsOf[l] ?? 1);
    if (want + s > K) {
      want = 0;
      shift += rowsOf[l] ?? 1;
    }
    const fits = (r: number, c: number): boolean => {
      for (let k = 0; k < s; k++) if (taken[l]?.has(r * K + c + k)) return false;
      return true;
    };
    // A start on an even unit is preferred: it costs no half step.
    search: for (let r = (row[i] ?? 0) + shift; ; r++) {
      const from = r === (row[i] ?? 0) + shift ? want : 0;
      for (const parity of [0, 1]) {
        for (let c = from + ((from + parity) % 2); c + s <= K; c += 2) {
          if (!fits(r, c)) continue;
          col[i] = c;
          out[i] = r;
          for (let k = 0; k < s; k++) taken[l]?.add(r * K + c + k);
          break search;
        }
      }
    }
  }
  return { col, row: out };
}

/**
 * Removes empty rows and empty unit columns. Empty units go in pairs, so no box changes between an
 * even and an odd unit: half steps are decided by the search alone.
 */
function compact(lanes: number, lane: number[], span: number[], col: number[], row: number[]): { col: number[]; row: number[] } {
  const used = new Set<number>();
  col.forEach((c, i) => {
    for (let k = 0; k < (span[i] ?? 2); k++) used.add(c + k);
  });
  const top = Math.max(-1, ...used);
  const at = new Map<number, number>();
  let removed = 0;
  for (let u = 0; u <= top; ) {
    if (used.has(u)) {
      at.set(u, u - removed);
      u++;
      continue;
    }
    let end = u;
    while (end <= top && !used.has(end)) end++;
    removed += 2 * Math.floor((end - u) / 2);
    u = end;
  }
  const outRow = new Array<number>(lane.length).fill(0);
  for (let l = 0; l < lanes; l++) {
    const members = lane.map((x, i) => (x === l ? i : -1)).filter((i) => i >= 0);
    const rows = [...new Set(members.map((i) => row[i] ?? 0))].sort((a, b) => a - b);
    for (const i of members) outRow[i] = rows.indexOf(row[i] ?? 0);
  }
  return { col: col.map((c) => at.get(c) ?? 0), row: outRow };
}

export function placeSlots(input: SlotInput): SlotResult {
  return placeRanked(input, false)[0] ?? { rank: new Map(), row: new Map(), span: new Map() };
}

/** The assignments of every start, cheapest first; without `all` the search stops at the first one without hazards. */
export function placeRanked(input: SlotInput, all: boolean): SlotResult[] {
  const { graph } = input;
  const ids = graph.nodes.map((n) => n.id);
  const index = new Map(ids.map((id, i) => [id, i] as const));
  const laneIndex = new Map(graph.lanes.map((l, i) => [l.id, i] as const));
  const lane = graph.nodes.map((n) => laneIndex.get(n.lane) ?? 0);
  const rank = ids.map((id) => input.rank.get(id) ?? 0);
  const row = ids.map((id) => input.row.get(id) ?? 0);
  const K = Math.max(2, input.columns);
  const span = ids.map((id) => Math.min(K, Math.max(2, input.span.get(id) ?? 2)));

  const edges: Edge[] = [];
  for (const e of graph.edges) {
    const a = index.get(e.from);
    const b = index.get(e.to);
    if (a === undefined || b === undefined || a === b) continue;
    const [first, second] = (rank[a] ?? 0) <= (rank[b] ?? 0) ? [a, b] : [b, a];
    edges.push({ a, b, first, second, sameLane: lane[a] === lane[b] });
  }

  // Chains longer than the wrap width continue on the next row. Every wrap width gives a start;
  // the cheapest start is searched first and the others only while hazards remain.
  const starts: Array<{ p: Placement; cost: number }> = [];
  const columns = Math.max(1, Math.floor(K / 2));
  for (let width = columns; width >= Math.max(1, Math.ceil(columns / 2)); width--) {
    if (width < columns && span.some((s) => s > 2 * width)) break;
    const start = wrap(graph.lanes.length, lane, rank, row, span, K, width);
    const candidate = new Placement(graph.lanes.length, lane, span, edges, K, start.col, start.row, input.gap);
    starts.push({ p: candidate, cost: candidate.total() });
  }
  starts.sort((x, y) => x.cost - y.cost);

  const descend = (p: Placement): void => {
    for (let pass = 0; pass < PASS_CAP; pass++) {
      let improved = false;
      for (let i = 0; i < ids.length; i++) {
        const l = lane[i] ?? 0;
        const s = span[i] ?? 2;
        const choice: { delta: number; moves: Move[] | null } = { delta: -EPS, moves: null };
        const known = p.before([[i, p.col[i] ?? 0, p.row[i] ?? 0]]);
        const consider = (moves: Move[]): void => {
          const { delta, restore } = p.apply(moves, moves.length === 1 ? known : undefined, choice.delta);
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
          const sj = span[j] ?? 2;
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

  const resultOf = (q: Placement): SlotResult => {
    const final = compact(graph.lanes.length, lane, span, q.col, q.row);
    return {
      rank: new Map(ids.map((id, i) => [id, final.col[i] ?? 0] as const)),
      row: new Map(ids.map((id, i) => [id, final.row[i] ?? 0] as const)),
      span: new Map(ids.map((id, i) => [id, span[i] ?? 2] as const)),
    };
  };
  if (starts.length === 0) return [];
  if (ids.length <= 1) return [resultOf(starts[0]?.p as Placement)];

  /** A box on an odd unit that does not pay for itself moves back: the rest of its row follows, one unit. */
  const unhalf = (q: Placement): void => {
    for (let pass = 0; pass < PASS_CAP; pass++) {
      let moved = false;
      for (let i = 0; i < ids.length; i++) {
        if ((q.col[i] ?? 0) % 2 === 0) continue;
        for (const d of [-1, 1]) {
          const block = ids.flatMap((_, j) => (lane[j] === lane[i] && q.row[j] === q.row[i] && (q.col[j] ?? 0) >= (q.col[i] ?? 0) ? [j] : []));
          const inBlock = new Set(block);
          const fits = block.every((j) => {
            const c = (q.col[j] ?? 0) + d;
            if (c < 0 || c + (span[j] ?? 2) > K) return false;
            return ids.every((o, k) => inBlock.has(k) || lane[k] !== lane[j] || q.row[k] !== q.row[j] || (q.col[k] ?? 0) + (span[k] ?? 2) <= c || c + (span[j] ?? 2) <= (q.col[k] ?? 0));
          });
          if (!fits) continue;
          const moves = block.map((j) => [j, (q.col[j] ?? 0) + d, q.row[j] ?? 0] as Move);
          const { delta, restore } = q.apply(moves);
          if (delta < -EPS) {
            q.baseTotal = undefined;
            moved = true;
            break;
          }
          restore();
        }
      }
      if (!moved) break;
    }
  };

  const out: Array<{ p: Placement; cost: number }> = [];
  const searched = (start: { p: Placement }): void => {
    descend(start.p);
    unhalf(start.p);
    out.push({ p: start.p, cost: start.p.total() });
  };
  const tried = starts.slice(0, RESTARTS);
  for (const start of tried) {
    searched(start);
    if (!all) {
      const hz = start.p.hazards();
      if (hz.crossings + hz.blocked === 0) break;
    }
  }
  const sorted = [...out].sort((x, y) => x.cost - y.cost);
  const first = sorted[0];
  if (!first) return [];
  const list = (all ? sorted : sorted.slice(0, 1)).map((o) => resultOf(o.p));
  const head = list[0];
  if (head && !all) {
    head.rest = () => {
      for (const start of tried) if (!out.some((o) => o.p === start.p)) searched(start);
      return [...out].filter((o) => o.p !== first.p).sort((x, y) => x.cost - y.cost).map((o) => resultOf(o.p));
    };
  }
  return list;
}

/** True when the two boxes (given as column, row, span of one and the same for the other) share a slot. */
function overlaps(ci: number, ri: number, sj: number, cj: number, rj: number, si: number): boolean {
  // Node i moves to (cj, rj) with span si; node j moves to (ci, ri) with span sj.
  return rj === ri && cj < ci + sj && ci < cj + si;
}

/**
 * Moves single boxes by one slot unit, in either direction, wherever that lowers the cost. Used for an
 * arrangement whose columns are fixed by other rules: only half steps may be added or removed.
 */
export function shiftHalfSteps(graph: Graph, rank: Map<string, number>, row: Map<string, number>, span: Map<string, number>, gap = 0.5, limits: ReadonlyMap<string, readonly [number, number]> = new Map()): Map<string, number> {
  const ids = graph.nodes.map((n) => n.id);
  const index = new Map(ids.map((id, i) => [id, i] as const));
  const lane = graph.nodes.map(() => 0);
  const sp = ids.map((id) => span.get(id) ?? 2);
  const col = ids.map((id) => rank.get(id) ?? 0);
  const K = Math.max(2, ...col.map((c, i) => c + (sp[i] ?? 2))) + 2;
  const edges: Edge[] = [];
  for (const e of graph.edges) {
    const a = index.get(e.from);
    const b = index.get(e.to);
    if (a !== undefined && b !== undefined && a !== b) edges.push({ a, b, first: a, second: b, sameLane: true });
  }
  const p = new Placement(1, lane, sp, edges, K, [...col], ids.map((id) => row.get(id) ?? 0), gap);
  for (let pass = 0; pass < PASS_CAP; pass++) {
    let improved = false;
    for (let i = 0; i < ids.length; i++) {
      const known = p.before([[i, p.col[i] ?? 0, p.row[i] ?? 0]]);
      let best = -EPS;
      let move: Move | null = null;
      for (const d of [-1, 1]) {
        const c = (p.col[i] ?? 0) + d;
        const [lo, hi] = limits.get(ids[i] ?? '') ?? [0, Infinity];
        if (c < lo || c + (sp[i] ?? 2) > hi || !p.free(0, p.row[i] ?? 0, c, sp[i] ?? 2, i)) continue;
        const { delta, restore } = p.apply([[i, c, p.row[i] ?? 0]], known, best);
        restore();
        if (delta < best) {
          best = delta;
          move = [i, c, p.row[i] ?? 0];
        }
      }
      if (move) {
        p.apply([move]);
        p.baseTotal = undefined;
        improved = true;
      }
    }
    if (!improved) break;
  }
  return new Map(ids.map((id, i) => [id, p.col[i] ?? 0] as const));
}
