/**
 * Positions boxes along the flow axis so that edges between neighbouring rows can run as one
 * straight perpendicular line. Everything here is one-dimensional: x is the start of a box along
 * the flow axis, w its extent. Order, row and size of a box never change, only its place.
 */

export interface AlignNode {
  /** Ordinal of the row line (lane and row) the box sits on. */
  line: number;
  /** Nominal slot column and the number of columns the box covers. */
  col: number;
  span: number;
  w: number;
  /** Nominal start. */
  x0: number;
  /** Smallest allowed start and largest allowed end. */
  lo: number;
  hi: number;
}

export interface AlignInput {
  nodes: AlignNode[];
  /** Edges between node indices; repeated pairs add weight. */
  edges: ReadonlyArray<readonly [number, number]>;
  /** Smallest clear distance between two consecutive boxes of one line. */
  gap: (before: number, after: number) => number;
  grid: number;
  /** Room a straight line needs inside the overlap of its two boxes. */
  overlap: number;
  /** Bounds for every box along the flow axis. */
  min: number;
  max: number;
  /** Parallel to `edges`: true for an edge that is already planned as one straight line. */
  planned?: ReadonlyArray<boolean>;
  /**
   * Parallel to `edges`: the nodes on lines strictly between the two ends. A line that is not planned
   * only counts as straight when a place `margin` clear of all of them remains inside the overlap.
   */
  between?: ReadonlyArray<ReadonlyArray<number> | undefined>;
  margin?: number;
}

export interface Pair {
  a: number;
  b: number;
  weight: number;
  /** Largest centre distance at which the two boxes still overlap by the overlap this edge needs. */
  dead: number;
  /** Straight at the nominal positions: it is never a reason to move, only one not to. */
  held: boolean;
  /** Nodes the line must keep clear of; absent for a planned line. */
  between?: ReadonlyArray<number>;
  /** Both boxes have the same width and no other cross-line partner. */
  twin: boolean;
}

interface Block {
  sum: number;
  count: number;
  lo: number;
  hi: number;
  val: number;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/**
 * Closest ordered placement to the targets: x[i + 1] >= x[i] + w[i] + gap[i], every start inside
 * [lo[i], hi[i] - w[i]]. Shifts the offsets away so the order becomes plain monotonicity, pools
 * adjacent violators and clamps each pool to the bounds it inherits.
 */
export function projectChain(target: number[], w: number[], gap: number[], lo: number[], hi: number[]): number[] {
  const n = target.length;
  const off: number[] = [];
  let acc = 0;
  for (let i = 0; i < n; i++) {
    off.push(acc);
    acc += (w[i] ?? 0) + (gap[i] ?? 0);
  }
  const yl: number[] = [];
  const yh: number[] = [];
  let run = -Infinity;
  for (let i = 0; i < n; i++) {
    run = Math.max(run, (lo[i] ?? -Infinity) - (off[i] ?? 0));
    yl.push(run);
  }
  run = Infinity;
  for (let i = n - 1; i >= 0; i--) {
    run = Math.min(run, (hi[i] ?? Infinity) - (w[i] ?? 0) - (off[i] ?? 0));
    yh[i] = run;
  }
  const blocks: Block[] = [];
  for (let i = 0; i < n; i++) {
    const t = (target[i] ?? 0) - (off[i] ?? 0);
    const b: Block = { sum: t, count: 1, lo: yl[i] ?? -Infinity, hi: yh[i] ?? Infinity, val: 0 };
    b.val = clamp(t, b.lo, b.hi);
    blocks.push(b);
    while (blocks.length > 1) {
      const cur = blocks[blocks.length - 1];
      const prev = blocks[blocks.length - 2];
      if (!cur || !prev || prev.val <= cur.val) break;
      blocks.length -= 2;
      const sum = prev.sum + cur.sum;
      const count = prev.count + cur.count;
      const merged: Block = { sum, count, lo: Math.max(prev.lo, cur.lo), hi: Math.min(prev.hi, cur.hi), val: 0 };
      merged.val = clamp(sum / count, merged.lo, merged.hi);
      blocks.push(merged);
    }
  }
  const out: number[] = [];
  for (const b of blocks) for (let k = 0; k < b.count; k++) out.push(b.val + (off[out.length] ?? 0));
  return out;
}

const snap = (v: number, grid: number): number => Math.round(v / grid) * grid;

/** Puts a chain on the grid and repairs the gap constraints; returns undefined when it cannot. */
function snapChain(x: number[], w: number[], gap: number[], lo: number[], hi: number[], grid: number): number[] | undefined {
  const n = x.length;
  const out = x.map((v) => snap(v, grid));
  for (let i = 0; i < n; i++) {
    const before = i > 0 ? (out[i - 1] ?? 0) + (w[i - 1] ?? 0) + (gap[i - 1] ?? 0) : -Infinity;
    out[i] = Math.max(out[i] ?? 0, before, lo[i] ?? -Infinity);
  }
  for (let i = n - 1; i >= 0; i--) {
    const after = i < n - 1 ? (out[i + 1] ?? 0) - (w[i] ?? 0) - (gap[i] ?? 0) : Infinity;
    out[i] = Math.min(out[i] ?? 0, after, (hi[i] ?? Infinity) - (w[i] ?? 0));
  }
  for (let i = 0; i < n; i++) {
    const ok =
      (out[i] ?? 0) >= (lo[i] ?? -Infinity) - 1e-9 &&
      (out[i] ?? 0) + (w[i] ?? 0) <= (hi[i] ?? Infinity) + 1e-9 &&
      (i === 0 || (out[i] ?? 0) >= (out[i - 1] ?? 0) + (w[i - 1] ?? 0) + (gap[i - 1] ?? 0) - 1e-9);
    if (!ok) return undefined;
  }
  return out;
}

const sum = (xs: number[]): number => xs.reduce((t, v) => t + v, 0);

/**
 * Edges between different lines whose boxes sit in neighbouring columns, or that are straight
 * already. An edge that is straight at the nominal positions must keep at least the overlap it has
 * (up to `overlap`); any other one needs the full `overlap` to count as straight.
 */
export function trackedPairs(input: AlignInput): Pair[] {
  const found = new Map<string, Pair>();
  input.edges.forEach(([u, v], k) => {
    const a = input.nodes[u];
    const b = input.nodes[v];
    if (!a || !b || a.line === b.line) return;
    const lo = Math.min(u, v);
    const hi = Math.max(u, v);
    const na = input.nodes[lo];
    const nb = input.nodes[hi];
    if (!na || !nb) return;
    const ov0 = Math.min(na.x0 + na.w, nb.x0 + nb.w) - Math.max(na.x0, nb.x0);
    const planned = input.planned?.[k] === true;
    const adjacent = !(a.col > b.col + b.span || b.col > a.col + a.span);
    const need = planned ? Math.min(input.overlap, ov0) : input.overlap;
    const dead = (na.w + nb.w) / 2 - need;
    if (!planned && (!adjacent || dead < 0)) return;
    const key = `${lo}|${hi}`;
    const cur = found.get(key);
    if (cur) cur.weight++;
    else {
      const between = planned ? undefined : input.between?.[k];
      found.set(key, { a: lo, b: hi, weight: 1, dead, held: planned, ...(between ? { between } : {}), twin: false });
    }
  });
  const pairs = [...found.values()];
  const nominal = input.nodes.map((n) => n.x0);
  for (const p of pairs) p.held = p.held || straightIn(input, nominal, p);
  const degree = new Map<number, number>();
  for (const p of pairs) for (const i of [p.a, p.b]) degree.set(i, (degree.get(i) ?? 0) + 1);
  for (const p of pairs) {
    p.twin = degree.get(p.a) === 1 && degree.get(p.b) === 1 && input.nodes[p.a]?.w === input.nodes[p.b]?.w;
  }
  return pairs;
}

const floorTo = (v: number, grid: number): number => Math.floor(v / grid + 1e-9) * grid;
const ceilTo = (v: number, grid: number): number => Math.ceil(v / grid - 1e-9) * grid;

/** True when the two boxes overlap enough and, for an unplanned line, a clear place remains. */
export function straightIn(input: AlignInput, x: number[], p: Pair): boolean {
  const a = input.nodes[p.a];
  const b = input.nodes[p.b];
  if (!a || !b) return false;
  if (Math.abs(x[p.a]! + a.w / 2 - (x[p.b]! + b.w / 2)) > p.dead + 1e-9) return false;
  if (!p.between) return true;
  const margin = input.margin ?? 0;
  const inset = input.overlap / 2;
  const lo = Math.max(x[p.a]!, x[p.b]!) + inset;
  const hi = Math.min(x[p.a]! + a.w, x[p.b]! + b.w) - inset;
  const clear = (at: number): boolean =>
    p.between!.every((i) => at <= (x[i] ?? 0) - margin + 1e-9 || at >= (x[i] ?? 0) + (input.nodes[i]?.w ?? 0) + margin - 1e-9);
  const spots = [ceilTo(lo, input.grid), floorTo(hi, input.grid)];
  for (const i of p.between) {
    const n = input.nodes[i];
    if (n) spots.push(ceilTo((x[i] ?? 0) + n.w + margin, input.grid), floorTo((x[i] ?? 0) - margin, input.grid));
  }
  return spots.some((at) => at >= lo - 1e-9 && at <= hi + 1e-9 && clear(at));
}

/**
 * Start of every box along the flow axis, on the grid. Boxes sit at their nominal start unless
 * moving turns a bent edge into a straight one without bending more straight edges than it gains.
 * Candidates are tried by the smallest move that straightens them; a move drags the neighbours of
 * its line only as far as the gaps demand.
 */
export function alignBoxes(input: AlignInput): number[] {
  const { nodes, grid } = input;
  const pairs = trackedPairs(input);
  const nominal = nodes.map((n) => n.x0);
  if (!pairs.some((p) => !p.held)) return nominal;

  const chains = new Map<number, number[]>();
  for (const n of [...new Set(nodes.map((v) => v.line))].sort((p, q) => p - q)) {
    chains.set(
      n,
      nodes
        .map((v, i) => [v, i] as const)
        .filter(([v]) => v.line === n)
        .sort((p, q) => p[0].col - q[0].col || p[0].x0 - q[0].x0 || p[1] - q[1])
        .map(([, i]) => i),
    );
  }
  const straightAt = (x: number[], p: Pair): boolean => straightIn(input, x, p);
  const score = (x: number[]): number => sum(pairs.map((p) => (straightAt(x, p) ? p.weight : 0)));
  const off = (x: number[]): number => x.filter((v, i) => v !== nominal[i]).length;
  const drift = (x: number[]): number => sum(x.map((v, i) => Math.abs(v - (nominal[i] ?? 0))));

  /** Positions with box `i` at `at` and its line pushed apart as little as needed. */
  const move = (x: number[], i: number, at: number): number[] | undefined => {
    const n = nodes[i];
    if (!n) return undefined;
    const members = chains.get(n.line) ?? [];
    const w = members.map((m) => nodes[m]?.w ?? 0);
    const gap = members.map((m, k) => {
      const next = members[k + 1];
      return next === undefined ? 0 : input.gap(m, next);
    });
    const lo = members.map((m) => Math.max(m === i ? at : (nodes[m]?.lo ?? -Infinity), input.min));
    const hi = members.map((m) => Math.min(m === i ? at + n.w : (nodes[m]?.hi ?? Infinity), input.max));
    if (at < Math.max(n.lo, input.min) - 1e-9 || at + n.w > Math.min(n.hi, input.max) + 1e-9) return undefined;
    const target = members.map((m) => (m === i ? at : (x[m] ?? 0)));
    const pushed = projectChain(target, w, gap, lo, hi);
    const snapped = snapChain(pushed, w, gap, lo, hi, grid);
    if (!snapped) return undefined;
    const out = [...x];
    members.forEach((m, k) => {
      out[m] = snapped[k] ?? out[m] ?? 0;
    });
    return out;
  };

  const order = pairs
    .map((p, k) => {
      const a = nodes[p.a];
      const b = nodes[p.b];
      const dist = a && b ? Math.abs(a.x0 + a.w / 2 - (b.x0 + b.w / 2)) : 0;
      return { p, k, need: Math.max(0, dist - p.dead) };
    })
    .filter((c) => !c.p.held)
    .sort((u, v) => u.need - v.need || u.k - v.k);

  let x = nominal;
  for (const { p } of order) {
    if (straightAt(x, p)) continue;
    const a = nodes[p.a];
    const b = nodes[p.b];
    if (!a || !b) continue;
    const before = score(x);
    const towards = (i: number, other: number): number => {
      const n = nodes[i]!;
      const m = nodes[other]!;
      const d = (x[other] ?? 0) + m.w / 2 - ((x[i] ?? 0) + n.w / 2);
      const short = Math.ceil((Math.abs(d) - p.dead) / grid - 1e-9) * grid;
      return (x[i] ?? 0) + Math.sign(d) * short;
    };
    const minimal = [move(x, p.a, towards(p.a, p.b)), move(x, p.b, towards(p.b, p.a))];
    const exact = p.twin ? [move(x, p.a, x[p.b] ?? 0), move(x, p.b, x[p.a] ?? 0)] : [];
    // A box in the way of the line steps aside just far enough to leave a place at either end of the overlap.
    const margin = input.margin ?? 0;
    const lo = Math.max(x[p.a] ?? 0, x[p.b] ?? 0) + input.overlap / 2;
    const hi = Math.min((x[p.a] ?? 0) + a.w, (x[p.b] ?? 0) + b.w) - input.overlap / 2;
    const aside = (p.between ?? []).flatMap((i) => {
      const w = nodes[i]?.w ?? 0;
      return [move(x, i, ceilTo(lo + margin, grid)), move(x, i, floorTo(hi - margin - w, grid))];
    });
    // A move that carries a box away from another bent edge that is no further from straight than
    // this one gives that edge's chance up for this one's: the gain has to outweigh it, so an even
    // trade stays put.
    const gone = (v: number[], q: Pair): number =>
      Math.max(0, Math.abs(v[q.a]! + nodes[q.a]!.w / 2 - (v[q.b]! + nodes[q.b]!.w / 2)) - q.dead);
    const away = (c: number[]): number =>
      sum(
        pairs.map((q) => {
          if (q === p || q.held || straightAt(x, q) || straightAt(c, q)) return 0;
          return gone(c, q) > gone(x, q) + 1e-9 && gone(x, q) <= gone(x, p) + 1e-9 ? q.weight : 0;
        }),
      );
    const pick = (list: Array<number[] | undefined>): number[] | undefined =>
      list
        .filter((c): c is number[] => c !== undefined && straightAt(c, p) && score(c) > before && p.weight > away(c))
        .sort((u, v) => score(v) - score(u) || off(u) - off(v) || drift(u) - drift(v))[0];
    const best = pick([...minimal, ...aside]);
    if (!best) continue;
    // A pair with no other partner and equal widths is drawn exactly above one another when that
    // costs no more boxes off their column and keeps as many straight edges.
    const flush = pick(exact);
    x = flush && score(flush) >= score(best) && off(flush) <= off(best) ? flush : best;
  }
  return x;
}
