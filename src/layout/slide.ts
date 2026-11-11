import type { Ruler } from '../metrics.ts';
import type { AlignNode } from './align.ts';
import { alignBoxes } from './align.ts';
import type { Alignment, Geo, Skeleton } from './place.ts';
import { finalNf, origin } from './place.ts';
import type { EdgePlan } from './plan.ts';
import { trackCoord } from './assemble.ts';
import type { Run } from './route.ts';

export interface Slid {
  alignment: Alignment;
  /** Edges that were routed before and now run as one straight perpendicular line. */
  forced: Set<number>;
}

interface Band {
  cLo: number;
  cHi: number;
  lo: number;
  hi: number;
}

const floorGrid = (ruler: Ruler, v: number): number => Math.floor(v / ruler.grid + 1e-9) * ruler.grid;
const ceilGrid = (ruler: Ruler, v: number): number => Math.ceil(v / ruler.grid - 1e-9) * ruler.grid;

/** Cross-axis position of a half-channel unit: even values are channel centres, odd ones row middles. */
function crossAt(geo: Geo, h: number): number {
  const k = Math.floor(h / 2);
  return h % 2 === 0 ? (geo.cC[k] ?? 0) : ((geo.cC[k] ?? 0) + (geo.cC[k + 1] ?? 0)) / 2;
}

/** Strips of the flow axis that tracks of routed edges occupy, with the cross-axis range they span. */
export function trackBands(
  geo: Geo,
  ruler: Ruler,
  runs: Run[],
  counts: Map<string, number>,
  skip: ReadonlySet<number> = new Set(),
  tracks?: number[],
): Band[] {
  const out: Band[] = [];
  const seen = new Set<string>();
  for (const run of runs) {
    if (run.kind !== 'f' || skip.has(run.edge)) continue;
    const count = counts.get(`f${run.idx}`) ?? 0;
    if (count === 0) continue;
    const key = `${run.idx}|${run.lo}|${run.hi}|${tracks ? tracks[run.id] : ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const mid = geo.fC[run.idx] ?? 0;
    // With the track assignment known a strip is one track wide; otherwise it is the whole channel.
    const at = tracks ? trackCoord(geo, ruler, run, tracks[run.id] ?? 0, count) : undefined;
    const half = at === undefined ? (count * ruler.trackGap) / 2 : ruler.trackGap / 2;
    const centre = at ?? mid;
    out.push({ cLo: crossAt(geo, run.lo), cHi: crossAt(geo, run.hi), lo: centre - half, hi: centre + half });
  }
  return out;
}

/**
 * Slides boxes along the flow axis until perpendicular edges can drop straight through the overlap
 * of their two boxes. Boxes stay inside the span of the rank columns and never enter a strip that
 * routed edges use next to them; the rank geometry itself does not change.
 */
export function slideBoxes(
  sk: Skeleton,
  geo: Geo,
  ruler: Ruler,
  plans: EdgePlan[],
  runs: Run[],
  counts: Map<string, number>,
  tracks?: number[],
): Slid | undefined {
  // Routes of edges that may become straight lines do not hold their strips; an edge that stays
  // routed gets its strip back when a slid box would sit in it, and the boxes are placed again.
  const rows = new Map(sk.slots.map((n) => [n.id, n] as const));
  // A line cannot be dropped through a row that has a box in the columns the two ends share.
  const open = (p: EdgePlan): boolean => {
    const a = rows.get(p.from);
    const b = rows.get(p.to);
    if (!a || !b || a === b || a.cRow === b.cRow) return false;
    const colLo = Math.min(a.rank, b.rank);
    const colHi = Math.max(a.rank + a.span, b.rank + b.span);
    return !sk.slots.some(
      (n) => n.cRow > Math.min(a.cRow, b.cRow) && n.cRow < Math.max(a.cRow, b.cRow) && n.rank < colHi && colLo < n.rank + n.span,
    );
  };
  const excluded = new Set(plans.filter((p) => p.straight === null && open(p)).map((p) => p.index));
  for (let round = 0; round < 4; round++) {
    const attempt = slideOnce(sk, geo, ruler, plans, runs, counts, excluded, open, tracks);
    if (!attempt) return undefined;
    const left = new Set([...excluded].filter((e) => !attempt.slid.forced.has(e)));
    const hit = new Set<number>();
    for (const r of runs) {
      if (!left.has(r.edge) || r.kind !== 'f') continue;
      const mine = trackBands(geo, ruler, [r], counts, new Set(), tracks)[0];
      if (!mine) continue;
      const blocked = sk.slots.some((n, i) => {
        const o = origin({ ...sk, align: attempt.slid.alignment }, geo, ruler, n);
        const f1 = o.f0 + (attempt.w[i] ?? 0);
        return mine.cHi > o.c0 + 1e-6 && mine.cLo < o.c0 + n.nc - 1e-6 && o.f0 < mine.hi - 1e-6 && f1 > mine.lo + 1e-6;
      });
      if (blocked) hit.add(r.edge);
    }
    if (hit.size === 0) return attempt.slid;
    for (const e of hit) excluded.delete(e);
  }
  return undefined;
}

function slideOnce(
  sk: Skeleton,
  geo: Geo,
  ruler: Ruler,
  plans: EdgePlan[],
  runs: Run[],
  counts: Map<string, number>,
  excluded: ReadonlySet<number>,
  open: (p: EdgePlan) => boolean,
  tracks?: number[],
): { slid: Slid; w: number[] } | undefined {
  const slots = sk.slots;
  if (slots.length === 0 || sk.ranks === 0) return undefined;
  const index = new Map(slots.map((s, i) => [s.id, i] as const));
  const first = geo.rankStart[0] ?? 0;
  const lastRank = sk.ranks - 1;
  const xmax = (geo.rankStart[lastRank] ?? 0) + (sk.rankExt[lastRank] ?? 0);
  const bands = trackBands(geo, ruler, runs, counts, excluded, tracks);
  const x0 = slots.map((s) => origin(sk, geo, ruler, s).f0);
  const w = slots.map((s) => finalNf(sk, geo, s));
  const nodes: AlignNode[] = slots.map((s, i) => {
    const start = x0[i] ?? 0;
    const end = start + (w[i] ?? 0);
    const c0 = origin(sk, geo, ruler, s).c0;
    let lo = first;
    let hi = xmax;
    for (const b of bands) {
      if (b.cHi <= c0 + 1e-6 || b.cLo >= c0 + s.nc - 1e-6) continue;
      if (b.hi <= start + 1e-6) lo = Math.max(lo, b.hi);
      else if (b.lo >= end - 1e-6) hi = Math.min(hi, b.lo);
    }
    return {
      line: s.cRow,
      col: s.rank,
      span: s.span,
      w: w[i] ?? 0,
      x0: start,
      lo: Math.min(start, ceilGrid(ruler, lo)),
      hi: Math.max(end, floorGrid(ruler, hi)),
    };
  });
  const edges: Array<readonly [number, number]> = [];
  const linked = new Set<string>();
  for (const p of plans) {
    const a = index.get(p.from);
    const b = index.get(p.to);
    if (a === undefined || b === undefined || a === b) continue;
    if (p.straight === null && !open(p)) continue;
    edges.push([a, b]);
    linked.add(`${a}|${b}`);
    linked.add(`${b}|${a}`);
  }
  const minGap = ceilGrid(ruler, ruler.rankGapMin);
  const xs = alignBoxes({
    nodes,
    edges,
    grid: ruler.grid,
    overlap: 2 * ruler.trackGap,
    min: first,
    max: xmax,
    gap: (a, b) => {
      const clear = (nodes[b]?.x0 ?? 0) - ((nodes[a]?.x0 ?? 0) + (nodes[a]?.w ?? 0));
      return Math.min(clear, linked.has(`${a}|${b}`) ? clear : minGap);
    },
  });

  const slide = new Map<string, number>();
  slots.forEach((s, i) => {
    const d = (xs[i] ?? 0) - (x0[i] ?? 0);
    if (d !== 0) slide.set(s.id, d);
  });

  // Straight perpendicular lines: the ones already planned first, then every other edge whose
  // boxes now overlap enough. A line keeps a track gap from the other lines on the same side.
  const taken = new Map<string, number[]>();
  const lineF = new Map<number, number>();
  const off = new Map<string, number>();
  const forced = new Set<number>();
  const gap = ruler.trackGap;
  const margin = gap / 2;
  const ordered = [...plans.filter((p) => p.straight === 'c'), ...plans.filter((p) => p.straight === null)];
  for (const p of ordered) {
    const a = index.get(p.from);
    const b = index.get(p.to);
    const s = a === undefined ? undefined : slots[a];
    const t = b === undefined ? undefined : slots[b];
    if (a === undefined || b === undefined || !s || !t || p.self || s.cRow === t.cRow) continue;
    const planned = p.straight === 'c';
    if (!planned && p.straight !== null) continue;
    const [srcSide, tgtSide] = t.cRow > s.cRow ? (['cH', 'cL'] as const) : (['cL', 'cH'] as const);
    const sa = xs[a] ?? 0;
    const ta = xs[b] ?? 0;
    const lo = Math.max(sa, ta);
    const hi = Math.min(sa + (w[a] ?? 0), ta + (w[b] ?? 0));
    if (hi - lo < 2 * gap - 1e-9 && !planned) continue;
    const loRow = Math.min(s.cRow, t.cRow);
    const hiRow = Math.max(s.cRow, t.cRow);
    const between = slots.flatMap((n, i) => (n.cRow > loRow && n.cRow < hiRow ? [i] : []));
    const free = (x: number): boolean =>
      between.every((i) => x <= (xs[i] ?? 0) - margin + 1e-9 || x >= (xs[i] ?? 0) + (w[i] ?? 0) + margin - 1e-9);
    const sKey = `${s.id}|${srcSide}`;
    const tKey = `${t.id}|${tgtSide}`;
    const apart = (x: number): boolean =>
      [...(taken.get(sKey) ?? []), ...(taken.get(tKey) ?? [])].every((u) => Math.abs(u - x) >= gap - 1e-9);
    const centre = Math.round((lo + hi) / 2 / ruler.grid) * ruler.grid;
    const candidates: number[] = [];
    for (let k = 0; centre - k * ruler.grid >= lo + gap - 1e-9 || centre + k * ruler.grid <= hi - gap + 1e-9; k++) {
      for (const x of k === 0 ? [centre] : [centre - k * ruler.grid, centre + k * ruler.grid]) {
        if (x >= lo + gap - 1e-9 && x <= hi - gap + 1e-9) candidates.push(x);
      }
    }
    const pick = candidates.find((x) => free(x) && apart(x)) ?? (planned ? (lo + hi) / 2 : undefined);
    if (pick === undefined) continue;
    if (!planned) forced.add(p.index);
    lineF.set(p.index, pick);
    off.set(`${p.index}|src`, pick - sa);
    off.set(`${p.index}|tgt`, pick - ta);
    taken.set(sKey, [...(taken.get(sKey) ?? []), pick]);
    taken.set(tKey, [...(taken.get(tKey) ?? []), pick]);
  }
  if (slide.size === 0 && forced.size === 0) return undefined;
  return { slid: { alignment: { slide, lineF, off }, forced }, w };
}

/** True when no two boxes of a line overlap, every box stays on the canvas and clear of track strips. */
export function boxesClear(
  sk: Skeleton,
  geo: Geo,
  ruler: Ruler,
  runs: Run[],
  counts: Map<string, number>,
  tracks: number[],
): boolean {
  const bands = trackBands(geo, ruler, runs, counts, new Set(), tracks);
  const first = geo.rankStart[0] ?? 0;
  const lastRank = sk.ranks - 1;
  const xmax = (geo.rankStart[lastRank] ?? 0) + (sk.rankExt[lastRank] ?? 0);
  const boxes = sk.slots.map((s) => {
    const o = origin(sk, geo, ruler, s);
    return { s, f0: o.f0, f1: o.f0 + finalNf(sk, geo, s), c0: o.c0, c1: o.c0 + s.nc };
  });
  for (const a of boxes) {
    if (a.f0 < first - 1e-6 || a.f1 > xmax + 1e-6) return false;
    for (const b of bands) {
      if (b.cHi <= a.c0 + 1e-6 || b.cLo >= a.c1 - 1e-6) continue;
      if (a.f0 < b.hi - 1e-6 && a.f1 > b.lo + 1e-6) return false;
    }
    for (const o of boxes) {
      if (o === a) continue;
      if (a.f0 < o.f1 - 1e-6 && o.f0 < a.f1 - 1e-6 && a.c0 < o.c1 - 1e-6 && o.c0 < a.c1 - 1e-6) return false;
    }
  }
  return true;
}
