import type { Ladder } from './model.ts';
import { pieces } from './model.ts';

export interface Aligned {
  /** Start of every node, in slot units. */
  start: number[];
  /** Units from the left edge to the end of the furthest node. */
  width: number;
}

/** Extra units the pair (left, right) of neighbours in a layer needs beyond the units of the left node. */
export type Extra = (left: number, right: number) => number;

interface View {
  up: number[][];
  down: number[][];
}

function neighbours(l: Ladder): View {
  const up = l.nodes.map((): number[] => []);
  const down = l.nodes.map((): number[] => []);
  for (const [a, b] of pieces(l)) {
    up[b]?.push(a);
    down[a]?.push(b);
  }
  return { up, down };
}

/** Pieces that cross an inner segment (dummy to dummy) and are not inner themselves: they lose to it. */
function conflicts(l: Ladder, layers: number[][], pos: number[]): Set<string> {
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
function direction(
  l: Ladder,
  layers: number[][],
  view: View,
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

/** Port geometry in slot units: ports of a box lie on a lattice of 1 / `steps` units around its centre, up to `reach(units)` from it. */
export interface PortGeometry {
  steps: number;
  reach: (units: number) => number;
  /** Two boxes count as straight only when their centres are on one line (a terminal keeps boxes of a column centred). */
  centred?: boolean;
  /** Pixels: how far from its centre a box side may hold a port that another box's centre sets (clear of the corners), in units. */
  inner?: (units: number) => number;
}

/** The pixel ruler's geometry, used when the caller gives none. */
export const DEFAULT_PORTS: PortGeometry = { steps: 4, reach: (units) => units / 2 - 0.375 };

export interface AlignOptions {
  /** Units a layer may hold; the result only exceeds it when no arrangement fits. */
  limit?: number;
  ports?: PortGeometry;
  /** Last resort: nodes that stick out of the limit give up their alignment. */
  squeeze?: boolean;
  /** Pass-through lines that may share one gap, drawn side by side (1 when the gap has no room for more). */
  lines?: number;
  /** Nodes of the main flow: when two arrangements are equally straight, the one that keeps more edges at them straight wins. */
  main?: ReadonlySet<number>;
  /** Edges in and out of a real node: of two alignments that cannot both stand, the one of the heavier node is kept. */
  degree?: (node: number) => number;
  /** Stages: a node with three or more partners in the next layer or the one before stands in the middle of them. */
  hubs?: boolean;
  /** Real nodes whose side (`down` toward the next layer, `up` toward the previous) has this one edge only: the edge is at the centre. */
  single?: (node: number, side: 'up' | 'down') => boolean;
  /** Units a dummy at the end of a layer needs beyond its own slot to stay inside the limit (0 or 1). */
  dummyShift?: number;
}

const EPS = 1e-6;

/**
 * Stage 4: integer starts on the unit grid. The best of four median alignments is kept, a straighten pass
 * moves rigid vertical groups so that more pieces run straight, and leftover gaps are closed group by group.
 */
export function align(l: Ladder, layers: number[][], extra: Extra = () => 0, opts: AlignOptions = {}): Aligned {
  const limit = opts.limit ?? Infinity;
  const geom = opts.ports ?? DEFAULT_PORTS;
  const view = neighbours(l);
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
  const marked = conflicts(l, layers, pos);
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
    if (!real(a) && !real(b)) return Math.abs(ca - cb) < EPS;
    if (!real(a) || !real(b)) {
      const [r, d] = real(a) ? [a, cb] : [b, ca];
      const reach = opts.single?.(r, real(a) ? 'down' : 'up') ? 0 : geom.reach(unitsOf(r));
      return Math.abs(d - centre(r, real(a) ? sa : sb)) <= reach + EPS;
    }
    if (geom.centred) return Math.abs(ca - cb) < EPS;
    // A box whose side holds this edge only has it at the centre: both only, the centres agree; one only, its centre is clear of the other's corners.
    const oneA = opts.single?.(a, 'down') === true;
    const oneB = opts.single?.(b, 'up') === true;
    if (oneA && oneB) return Math.abs(ca - cb) < EPS;
    if (oneA || oneB) {
      const inner = geom.inner?.(unitsOf(oneA ? b : a)) ?? geom.reach(unitsOf(oneA ? b : a));
      return Math.abs(ca - cb) <= inner + EPS;
    }
    const lo = Math.max(ca - geom.reach(unitsOf(a)), cb - geom.reach(unitsOf(b)));
    const hi = Math.min(ca + geom.reach(unitsOf(a)), cb + geom.reach(unitsOf(b)));
    return Math.ceil(lo * geom.steps - EPS) <= Math.floor(hi * geom.steps + EPS);
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
      const raw = direction(l, layers, view, marked, sep, downward, leftward, (upper, lower) => opts.single?.(upper, 'down') === true || opts.single?.(lower, 'up') === true, pieceWeight, (n) => opts.degree?.(n) ?? 0);
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
  // Stages: a node with three or more partners in one adjacent layer stands in the middle of them: level with the middle
  // partner when there is an odd number, between the two middle ones when even.
  if (opts.hubs) {
    for (const n of l.nodes) {
      if (!real(n.idx)) continue;
      const partners = (view.down[n.idx] ?? []).length >= 3 ? (view.down[n.idx] as number[]) : (view.up[n.idx] ?? []).length >= 3 ? (view.up[n.idx] as number[]) : [];
      if (partners.length < 3) continue;
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
