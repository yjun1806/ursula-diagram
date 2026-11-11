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
  lambda?: number;
  sweeps?: number;
}

const LAMBDA = 0.05;
const SWEEPS = 12;

export interface Pair {
  a: number;
  b: number;
  weight: number;
  /** Largest centre distance at which the two boxes still overlap by `overlap`. */
  dead: number;
}

/** Edges that can become a straight perpendicular line: different lines, neighbouring columns. */
export function candidatePairs(input: AlignInput): Pair[] {
  const weights = new Map<string, Pair>();
  for (const [u, v] of input.edges) {
    const a = input.nodes[u];
    const b = input.nodes[v];
    if (!a || !b || a.line === b.line) continue;
    if (a.col > b.col + b.span || b.col > a.col + a.span) continue;
    const dead = (a.w + b.w) / 2 - input.overlap;
    if (dead < 0) continue;
    const lo = Math.min(u, v);
    const hi = Math.max(u, v);
    const key = `${lo}|${hi}`;
    const cur = weights.get(key);
    if (cur) cur.weight++;
    else weights.set(key, { a: lo, b: hi, weight: 1, dead });
  }
  return [...weights.values()];
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

export function objective(input: AlignNode[], x: number[], pairs: Pair[], lambda: number): number {
  let total = 0;
  for (const p of pairs) {
    const a = input[p.a];
    const b = input[p.b];
    if (!a || !b) continue;
    const d = Math.abs(x[p.a]! + a.w / 2 - (x[p.b]! + b.w / 2));
    const over = Math.max(0, d - p.dead);
    total += p.weight * over * over;
  }
  input.forEach((n, i) => {
    const d = (x[i] ?? 0) - n.x0;
    total += lambda * d * d;
  });
  return total;
}

/**
 * The centre closest to `self` that lies in the dead zone of the largest total weight of partners.
 * Each goal is a partner centre with its dead-zone radius and weight.
 */
function bestCentre(self: number, goals: ReadonlyArray<{ centre: number; dead: number; weight: number }>): number {
  const points = [self, ...goals.flatMap((g) => [g.centre - g.dead, g.centre + g.dead])];
  const cover = (x: number): number =>
    goals.reduce((sum, g) => sum + (Math.abs(x - g.centre) <= g.dead + 1e-9 ? g.weight : 0), 0);
  let best = self;
  let bestCover = -1;
  for (const x of points) {
    const c = cover(x);
    const closer = Math.abs(x - self) < Math.abs(best - self) - 1e-9 || (Math.abs(Math.abs(x - self) - Math.abs(best - self)) <= 1e-9 && x < best);
    if (c > bestCover || (c === bestCover && closer)) {
      best = x;
      bestCover = c;
    }
  }
  return best;
}

/** Start of every box along the flow axis, on the grid. */
export function alignBoxes(input: AlignInput): number[] {
  const { nodes, grid } = input;
  const lambda = input.lambda ?? LAMBDA;
  const sweeps = input.sweeps ?? SWEEPS;
  const pairs = candidatePairs(input);
  if (pairs.length === 0) return nodes.map((n) => n.x0);

  const partners = nodes.map(() => [] as Array<{ other: number; weight: number; dead: number }>);
  for (const p of pairs) {
    partners[p.a]?.push({ other: p.b, weight: p.weight, dead: p.dead });
    partners[p.b]?.push({ other: p.a, weight: p.weight, dead: p.dead });
  }
  const lineIds = [...new Set(nodes.map((n) => n.line))].sort((a, b) => a - b);
  const chains = new Map<number, number[]>();
  for (const id of lineIds) {
    chains.set(
      id,
      nodes
        .map((n, i) => [n, i] as const)
        .filter(([n]) => n.line === id)
        .sort((p, q) => p[0].col - q[0].col || p[0].x0 - q[0].x0 || p[1] - q[1])
        .map(([, i]) => i),
    );
  }
  const chainParts = (members: number[]) => ({
    w: members.map((i) => nodes[i]?.w ?? 0),
    gap: members.map((m, k) => {
      const next = members[k + 1];
      return next === undefined ? 0 : input.gap(m, next);
    }),
    lo: members.map((i) => Math.max(nodes[i]?.lo ?? -Infinity, input.min)),
    hi: members.map((i) => Math.min(nodes[i]?.hi ?? Infinity, input.max)),
  });

  let x = nodes.map((n) => n.x0);
  let best = x;
  let bestCost = objective(nodes, x, pairs, lambda);
  for (let s = 0; s < sweeps; s++) {
    const order = s % 2 === 0 ? lineIds : [...lineIds].reverse();
    let moved = 0;
    for (const id of order) {
      const members = chains.get(id) ?? [];
      const parts = chainParts(members);
      const target = members.map((i) => {
        const n = nodes[i];
        if (!n) return 0;
        const ps = partners[i] ?? [];
        if (ps.length === 0) return n.x0;
        const self = (x[i] ?? 0) + n.w / 2;
        const goals = ps.map((p) => ({
          centre: (x[p.other] ?? 0) + (nodes[p.other]?.w ?? 0) / 2,
          dead: p.dead,
          weight: p.weight,
        }));
        return bestCentre(self, goals) - n.w / 2;
      });
      const next = projectChain(target, parts.w, parts.gap, parts.lo, parts.hi);
      const copy = [...x];
      members.forEach((i, k) => {
        const v = next[k] ?? copy[i] ?? 0;
        moved = Math.max(moved, Math.abs(v - (copy[i] ?? 0)));
        copy[i] = v;
      });
      x = copy;
    }
    const cost = objective(nodes, x, pairs, lambda);
    if (cost < bestCost - 1e-9) {
      bestCost = cost;
      best = x;
    }
    if (moved < grid) break;
  }

  const out = nodes.map((n) => n.x0);
  for (const id of lineIds) {
    const members = chains.get(id) ?? [];
    const parts = chainParts(members);
    const snapped = snapChain(
      members.map((i) => best[i] ?? 0),
      parts.w,
      parts.gap,
      parts.lo,
      parts.hi,
      grid,
    );
    if (!snapped) continue;
    members.forEach((i, k) => {
      out[i] = snapped[k] ?? nodes[i]?.x0 ?? 0;
    });
  }
  return objective(nodes, out, pairs, lambda) <= objective(nodes, nodes.map((n) => n.x0), pairs, lambda) ? out : nodes.map((n) => n.x0);
}
