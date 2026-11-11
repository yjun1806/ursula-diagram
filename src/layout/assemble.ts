import type { Ruler } from '../metrics.ts';
import type { Geo, Side, Skeleton, Slot } from './place.ts';
import { finalNf, origin } from './place.ts';
import type { EdgePlan } from './plan.ts';
import type { PortTable } from './ports.ts';
import { attachOf } from './ports.ts';
import type { Routed, Run } from './route.ts';

/** A point in abstract coordinates: f along the flow axis, c across it. */
export interface AbsPoint {
  f: number;
  c: number;
}

interface Line {
  kind: 'f' | 'c';
  v: number;
}

function portPoint(
  sk: Skeleton,
  geo: Geo,
  ruler: Ruler,
  table: PortTable,
  slot: Slot,
  side: Side,
  plan: EdgePlan,
  role: 'src' | 'tgt',
): AbsPoint {
  const { f0, c0 } = origin(sk, geo, ruler, slot);
  const off = attachOf(table, slot.id, side, plan.index, role)?.off ?? 0;
  const rowCentre = (geo.rowStart[slot.lane]?.[slot.row] ?? 0) + (sk.rowExt[slot.lane]?.[slot.row] ?? 0) / 2;
  const nf = finalNf(sk, geo, slot);
  // A perpendicular line between nodes of different widths runs through the middle of their overlap.
  const peer = sk.byId.get(role === 'src' ? plan.to : plan.from);
  let overlapCentre = sk.align.lineF.get(plan.index) ?? f0 + nf / 2;
  if (!sk.align.lineF.has(plan.index) && peer && peer !== slot) {
    const p0 = origin(sk, geo, ruler, peer).f0;
    overlapCentre = (Math.max(f0, p0) + Math.min(f0 + nf, p0 + finalNf(sk, geo, peer))) / 2;
  }
  switch (side) {
    case 'fH':
      return { f: f0 + nf, c: plan.straight ? rowCentre : c0 + off };
    case 'fL':
      return { f: f0, c: plan.straight ? rowCentre : c0 + off };
    case 'cL':
      return { f: plan.straight ? overlapCentre : f0 + off, c: c0 };
    case 'cH':
      return { f: plan.straight ? overlapCentre : f0 + off, c: c0 + slot.nc };
  }
}

/** Coordinate of a track inside its channel strip. */
export function trackCoord(geo: Geo, ruler: Ruler, run: Run, track: number, count: number): number {
  const inset = geo.inset?.get(`${run.kind}${run.idx}`) ?? 0;
  const start = (run.kind === 'f' ? (geo.fStart[run.idx] ?? 0) : (geo.cStart[run.idx] ?? 0)) + inset;
  const width = (run.kind === 'f' ? (geo.wf[run.idx] ?? 0) : (geo.wc[run.idx] ?? 0)) - inset;
  return start + (width - (count - 1) * ruler.trackGap) / 2 + track * ruler.trackGap;
}

function meet(a: Line, b: Line): AbsPoint {
  return a.kind === 'f' ? { f: a.v, c: b.v } : { f: b.v, c: a.v };
}

/**
 * Builds the polyline of every edge in abstract coordinates. For routed edges the
 * points are: port, the corner where the port's stub meets the first run, the
 * corners between runs, the corner into the last stub, port. Point i + 1 and
 * i + 2 therefore bound run i.
 */
export function buildPaths(
  sk: Skeleton,
  geo: Geo,
  ruler: Ruler,
  plans: EdgePlan[],
  routed: Map<number, Routed>,
  runs: Run[],
  tracks: number[],
  counts: Map<string, number>,
  table: PortTable,
): Map<number, AbsPoint[]> {
  const out = new Map<number, AbsPoint[]>();
  for (const plan of plans) {
    const s = sk.byId.get(plan.from);
    const t = sk.byId.get(plan.to);
    if (!s || !t) continue;
    const start = portPoint(sk, geo, ruler, table, s, plan.srcSide, plan, 'src');
    const end = portPoint(sk, geo, ruler, table, t, plan.tgtSide, plan, 'tgt');
    if (plan.straight) {
      out.set(plan.index, [start, end]);
      continue;
    }
    const r = routed.get(plan.index);
    if (!r) continue;
    const lines: Line[] = r.runs.flatMap((id) => {
      const run = runs[id];
      if (!run) return [];
      const count = counts.get(`${run.kind}${run.idx}`) ?? 1;
      return [{ kind: run.kind, v: trackCoord(geo, ruler, run, tracks[id] ?? 0, count) }];
    });
    const first = runs[r.runs[0] ?? -1];
    const last = runs[r.runs[r.runs.length - 1] ?? -1];
    if (!first || !last) continue;
    const head: Line = first.kind === 'f' ? { kind: 'c', v: start.c } : { kind: 'f', v: start.f };
    const tail: Line = last.kind === 'f' ? { kind: 'c', v: end.c } : { kind: 'f', v: end.f };
    const chain = [head, ...lines, tail];
    const pts: AbsPoint[] = [start];
    for (let i = 0; i + 1 < chain.length; i++) {
      const a = chain[i];
      const b = chain[i + 1];
      if (a && b) pts.push(meet(a, b));
    }
    pts.push(end);
    out.set(plan.index, pts);
  }
  return out;
}
