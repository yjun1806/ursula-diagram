import type { Ruler } from '../metrics.ts';
import type { Graph } from '../types.ts';
import { crossingCount } from './check.ts';
import { solve } from './solve.ts';

/**
 * Structure search. The initial rank and row assignment is improved by a local
 * search whose cost is measured on a real routing of the candidate. The search
 * runs on a unit-free ruler, so the pixel ruler and the cell ruler end up with
 * the same (rank, row) structure.
 */

const GRID: Ruler = {
  textWidth: () => 8,
  lineHeight: () => 2,
  nodePadX: 0,
  nodePadY: 0,
  nodeBorder: 0,
  labelPadX: 0,
  labelPadY: 0,
  widthStep: 8,
  rankGap: 6,
  laneGap: 1,
  rowGap: 4,
  trackGap: 1,
  lanePad: 3,
  laneLabelGap: 1,
  legendSample: 0,
  legendCaptionGap: 0,
  legendGap: 0,
  legendHeight: 0,
  snap: (v) => v,
};

/** Weights: a crossing outweighs a row, a row outweighs a rank, a rank outweighs a bend. */
const W = {
  crossing: 100,
  detour: 30,
  row: 16,
  rank: 12,
  length: 1,
  bend: 3,
  bentCrossLane: 8,
  /** An in-lane edge between two nodes of one rank runs against the flow axis. */
  stacked: 14,
  /** Per unit of width-to-height ratio above the comfortable ratio. */
  aspect: 40,
};

/** Drawings wider than this multiple of their height are penalised. */
const COMFORT_ASPECT = 2.2;

/** Short drawings are never folded: a few ranks read best in one line. */
const FOLD_FROM_RANKS = 6;

const MAX_EVALS = 110;
const MAX_PASSES = 6;
const SHORTLIST = 2;

interface State {
  rank: number[];
  row: number[];
}

interface Problem {
  graph: Graph;
  /** Graph without edge labels: labels never change the structure. */
  plain: Graph;
  lane: number[];
  lanes: number;
  edges: Array<readonly [number, number]>;
  /** Sign of rank[a] - rank[b] that every in-lane edge must keep. */
  order: Array<readonly [number, number, number]>;
  ids: string[];
  /** Stacking and aspect folding only apply to drawings that start out long. */
  canFold: boolean;
}

function dense(values: number[]): number[] {
  const sorted = [...new Set(values)].sort((a, b) => a - b);
  const at = new Map(sorted.map((v, i) => [v, i] as const));
  return values.map((v) => at.get(v) ?? 0);
}

/** Removes empty rank columns and empty rows. */
function normalise(p: Problem, s: State): State {
  const rank = dense(s.rank);
  const row = new Array<number>(s.row.length).fill(0);
  for (let l = 0; l < p.lanes; l++) {
    const members = s.row.map((_, i) => i).filter((i) => p.lane[i] === l);
    const rows = dense(members.map((i) => s.row[i] ?? 0));
    members.forEach((i, k) => {
      row[i] = rows[k] ?? 0;
    });
  }
  return { rank, row };
}

const keyOf = (s: State): string => `${s.rank.join(',')}|${s.row.join(',')}`;

function valid(p: Problem, s: State): boolean {
  const seen = new Set<string>();
  for (let i = 0; i < s.rank.length; i++) {
    const k = `${p.lane[i]}:${s.rank[i]}:${s.row[i]}`;
    if (seen.has(k)) return false;
    seen.add(k);
  }
  for (const [a, b, sign] of p.order) {
    const d = Math.sign((s.rank[a] ?? 0) - (s.rank[b] ?? 0));
    if (d === sign) continue;
    // Stacking the two ends in one rank (a vertical edge) keeps the flow readable.
    if (d !== 0 || s.row[a] === s.row[b] || !p.canFold) return false;
  }
  return true;
}

function laneRows(p: Problem, s: State): number[] {
  const rows = new Array<number>(p.lanes).fill(1);
  s.row.forEach((r, i) => {
    const l = p.lane[i] ?? 0;
    rows[l] = Math.max(rows[l] ?? 1, r + 1);
  });
  return rows;
}

interface Seg {
  h: boolean;
  /** Fixed coordinate (y for horizontal, x for vertical). */
  at: number;
  lo: number;
  hi: number;
}

/**
 * Cheap structure-only estimate of the real cost: edges are drawn as the shapes
 * the router prefers (a straight line, or a Z whose cross-axis leg sits just
 * before the target), and crossings, blocked nodes and lengths are counted.
 */
function proxy(p: Problem, s: State): number {
  const rows = laneRows(p, s);
  const start: number[] = [];
  let acc = 0;
  for (const r of rows) {
    start.push(acc);
    acc += r;
  }
  const y = (i: number): number => (start[p.lane[i] ?? 0] ?? 0) + (s.row[i] ?? 0) + (p.lane[i] ?? 0) * 0.5;
  const ys_ = s.rank.map((_, i) => y(i));
  const nodeIn = (x0: number, x1: number, y0: number, y1: number): number => {
    let n = 0;
    s.rank.forEach((r, i) => {
      const yy = ys_[i] ?? 0;
      if (r > x0 && r < x1 && yy > y0 && yy < y1) n++;
    });
    return n;
  };

  const perEdge: Seg[][] = [];
  let cost = 0;
  let blocked = 0;
  for (const [a, b] of p.edges) {
    const [src, dst] = (s.rank[a] ?? 0) <= (s.rank[b] ?? 0) ? [a, b] : [b, a];
    const xs = s.rank[src] ?? 0;
    const xt = s.rank[dst] ?? 0;
    const ys = y(src);
    const yt = y(dst);
    const segs: Seg[] = [];
    if (xs === xt) {
      segs.push({ h: false, at: xs, lo: Math.min(ys, yt), hi: Math.max(ys, yt) });
      blocked += nodeIn(xs - 0.5, xs + 0.5, Math.min(ys, yt), Math.max(ys, yt));
      cost += W.length * Math.abs(ys - yt);
    } else if (ys === yt) {
      segs.push({ h: true, at: ys, lo: xs, hi: xt });
      blocked += nodeIn(xs, xt, ys - 0.25, ys + 0.25);
      cost += W.length * (xt - xs);
    } else {
      segs.push({ h: true, at: ys, lo: xs, hi: xt - 0.5 });
      segs.push({ h: false, at: xt - 0.5, lo: Math.min(ys, yt), hi: Math.max(ys, yt) });
      segs.push({ h: true, at: yt, lo: xt - 0.5, hi: xt });
      blocked += nodeIn(xs, xt, ys - 0.25, ys + 0.25);
      cost += W.length * (xt - xs + Math.abs(ys - yt)) + 2 * W.bend;
      if (p.lane[a] !== p.lane[b]) cost += W.bentCrossLane;
    }
    perEdge.push(segs);
  }
  let crossing = 0;
  const eps = 1e-9;
  for (let i = 0; i < perEdge.length; i++) {
    for (let j = i + 1; j < perEdge.length; j++) {
      for (const u of perEdge[i] ?? []) {
        for (const v of perEdge[j] ?? []) {
          if (u.h === v.h) continue;
          const [h, w] = u.h ? [u, v] : [v, u];
          if (w.at > h.lo + eps && w.at < h.hi - eps && h.at > w.lo + eps && h.at < w.hi - eps) crossing++;
        }
      }
    }
  }
  const ranks = Math.max(0, ...s.rank) + 1;
  return (
    cost +
    (crossing + blocked) * W.crossing +
    rows.reduce((a, b) => a + b, 0) * W.row +
    ranks * W.rank
  );
}

function realCost(p: Problem, s: State): number {
  const rank = new Map(p.ids.map((id, i) => [id, s.rank[i] ?? 0] as const));
  const row = new Map(p.ids.map((id, i) => [id, s.row[i] ?? 0] as const));
  const l = solve(p.plain, GRID, rank, row);
  let cost = crossingCount(l.edges) * W.crossing;
  cost += l.diagnostics.filter((d) => d.kind === 'detour').length * W.detour;
  const laneOf = new Map(p.graph.nodes.map((n) => [n.id, n.lane] as const));
  for (const e of l.edges) {
    for (let i = 0; i + 1 < e.points.length; i++) {
      const a = e.points[i];
      const b = e.points[i + 1];
      if (a && b) cost += (W.length * (Math.abs(a.x - b.x) + Math.abs(a.y - b.y))) / GRID.rankGap;
    }
    const bends = Math.max(0, e.points.length - 2);
    cost += bends * W.bend;
    if (bends > 0 && laneOf.get(e.from) !== laneOf.get(e.to)) cost += W.bentCrossLane;
  }
  cost += laneRows(p, s).reduce((a, b) => a + b, 0) * W.row;
  cost += (Math.max(0, ...s.rank) + 1) * W.rank;
  for (const [a, b, sign] of p.order) if (sign !== 0 && s.rank[a] === s.rank[b]) cost += W.stacked;
  if (l.height > 0 && p.canFold) cost += W.aspect * Math.max(0, l.width / l.height - COMFORT_ASPECT);
  return cost;
}

const ranksOf = (s: State): number => Math.max(0, ...s.rank) + 1;

interface Target {
  at: number;
  insert: boolean;
}

function moveNode(s: State, p: Problem, i: number, rank: Target, row: Target): State {
  const next: State = { rank: [...s.rank], row: [...s.row] };
  if (rank.insert) {
    next.rank = next.rank.map((r) => (r >= rank.at ? r + 1 : r));
  }
  if (row.insert) {
    next.row = next.row.map((r, k) => (p.lane[k] === p.lane[i] && r >= row.at ? r + 1 : r));
  }
  next.rank[i] = rank.at;
  next.row[i] = row.at;
  return normalise(p, next);
}

function neighbours(p: Problem, i: number): number[] {
  const out: number[] = [];
  for (const [a, b] of p.edges) {
    if (a === i) out.push(b);
    else if (b === i) out.push(a);
  }
  return out;
}

function rankTargets(p: Problem, s: State, i: number): Target[] {
  const total = Math.max(0, ...s.rank) + 1;
  const base = new Set<number>([s.rank[i] ?? 0]);
  for (const n of neighbours(p, i)) base.add(s.rank[n] ?? 0);
  const ranks = new Set<number>();
  for (const v of base) for (const d of [-1, 0, 1]) ranks.add(v + d);
  const out: Target[] = [];
  for (const v of [...ranks].sort((a, b) => a - b)) {
    if (v >= 0 && v < total) out.push({ at: v, insert: false });
  }
  const inserts = new Set<number>();
  for (const v of base) {
    inserts.add(v);
    inserts.add(v + 1);
  }
  for (const v of [...inserts].sort((a, b) => a - b)) if (v >= 0 && v <= total) out.push({ at: v, insert: true });
  return out;
}

function rowTargets(p: Problem, s: State, i: number): Target[] {
  const rows = laneRows(p, s)[p.lane[i] ?? 0] ?? 1;
  const out: Target[] = [];
  for (let r = 0; r < rows; r++) out.push({ at: r, insert: false });
  out.push({ at: 0, insert: true }, { at: rows, insert: true });
  return out;
}

function swapNodes(s: State, a: number, b: number): State {
  const next: State = { rank: [...s.rank], row: [...s.row] };
  next.rank[a] = s.rank[b] ?? 0;
  next.rank[b] = s.rank[a] ?? 0;
  next.row[a] = s.row[b] ?? 0;
  next.row[b] = s.row[a] ?? 0;
  return next;
}

function flipLane(p: Problem, s: State, lane: number): State {
  const rows = laneRows(p, s)[lane] ?? 1;
  return { rank: s.rank, row: s.row.map((r, i) => (p.lane[i] === lane ? rows - 1 - r : r)) };
}

export function optimize(graph: Graph, rank: Map<string, number>, row: Map<string, number>): {
  rank: Map<string, number>;
  row: Map<string, number>;
} {
  const ids = graph.nodes.map((n) => n.id);
  const index = new Map(ids.map((id, i) => [id, i] as const));
  const laneIndex = new Map(graph.lanes.map((l, i) => [l.id, i] as const));
  const lane = graph.nodes.map((n) => laneIndex.get(n.lane) ?? 0);
  const edges: Array<readonly [number, number]> = [];
  for (const e of graph.edges) {
    const a = index.get(e.from);
    const b = index.get(e.to);
    if (a !== undefined && b !== undefined && a !== b) edges.push([a, b]);
  }
  const start: State = { rank: ids.map((id) => rank.get(id) ?? 0), row: ids.map((id) => row.get(id) ?? 0) };
  const order: Array<readonly [number, number, number]> = [];
  for (const [a, b] of edges) {
    if (lane[a] === lane[b]) order.push([a, b, Math.sign((start.rank[a] ?? 0) - (start.rank[b] ?? 0))]);
  }
  const p: Problem = {
    graph,
    plain: { ...graph, edges: graph.edges.map(({ label: _label, ...e }) => e) },
    lane,
    lanes: graph.lanes.length,
    edges,
    order,
    ids,
    canFold: ranksOf(start) >= FOLD_FROM_RANKS,
  };
  let cur = normalise(p, start);
  if (ids.length < 2 || edges.length === 0) return toMaps(p, cur);

  const cache = new Map<string, number>();
  let evals = 0;
  const real = (s: State): number => {
    const k = keyOf(s);
    const hit = cache.get(k);
    if (hit !== undefined) return hit;
    evals++;
    const c = realCost(p, s);
    cache.set(k, c);
    return c;
  };
  let best = real(cur);

  /** Tries the most promising candidates by estimate and keeps the best real improvement. */
  const tryCandidates = (cands: State[]): boolean => {
    const seen = new Set<string>();
    const scored: Array<{ s: State; est: number }> = [];
    for (const c of cands) {
      const k = keyOf(c);
      if (seen.has(k) || k === keyOf(cur) || !valid(p, c)) continue;
      seen.add(k);
      scored.push({ s: c, est: proxy(p, c) });
    }
    const floor = proxy(p, cur);
    scored.sort((x, y) => x.est - y.est);
    let pick: State | undefined;
    let pickCost = best;
    for (const { s, est } of scored.slice(0, SHORTLIST)) {
      if (evals >= MAX_EVALS || est > floor + W.crossing * 0.6) break;
      const c = real(s);
      if (c < pickCost - 1e-9) {
        pick = s;
        pickCost = c;
      }
    }
    if (!pick) return false;
    cur = pick;
    best = pickCost;
    return true;
  };

  for (let pass = 0; pass < MAX_PASSES && evals < MAX_EVALS; pass++) {
    let improved = false;
    for (let i = 0; i < ids.length && evals < MAX_EVALS; i++) {
      const cands: State[] = [];
      for (const r of rankTargets(p, cur, i)) for (const w of rowTargets(p, cur, i)) cands.push(moveNode(cur, p, i, r, w));
      if (tryCandidates(cands)) improved = true;
    }
    for (let l = 0; l < p.lanes && evals < MAX_EVALS; l++) {
      const members = ids.map((_, i) => i).filter((i) => lane[i] === l);
      const swaps: State[] = [];
      for (const a of members) for (const b of members) if (a < b) swaps.push(swapNodes(cur, a, b));
      if (tryCandidates(swaps)) improved = true;
      if (tryCandidates([flipLane(p, cur, l)])) improved = true;
    }
    if (!improved) break;
  }
  return toMaps(p, cur);
}

function toMaps(p: Problem, s: State): { rank: Map<string, number>; row: Map<string, number> } {
  return {
    rank: new Map(p.ids.map((id, i) => [id, s.rank[i] ?? 0] as const)),
    row: new Map(p.ids.map((id, i) => [id, s.row[i] ?? 0] as const)),
  };
}
