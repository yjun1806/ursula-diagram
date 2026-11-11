import type { Ruler } from '../metrics.ts';
import type { Geo, Side, Skeleton, Slot } from './place.ts';
import { edgeNear, finalNf, origin } from './place.ts';
import type { EdgePlan } from './plan.ts';
import type { PortTable } from './ports.ts';
import { attachOf, latticePorts, portStep } from './ports.ts';
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
  switch (side) {
    case 'fH':
      return { f: f0 + nf, c: plan.straight ? rowCentre : c0 + off };
    case 'fL':
      return { f: f0, c: plan.straight ? rowCentre : c0 + off };
    case 'cL':
      return { f: f0 + off, c: c0 };
    case 'cH':
      return { f: f0 + off, c: c0 + slot.nc };
  }
}

/**
 * Flow-axis coordinate of a straight line across the flow axis between two boxes, from their drawn positions:
 * a port both boxes have, nearest to both centres, else the middle of the overlap; undefined without an overlap.
 */
export function sharedLine(sk: Skeleton, geo: Geo, ruler: Ruler, a: Slot, b: Slot, taken: readonly number[] = []): number | undefined {
  const fa = origin(sk, geo, ruler, a).f0;
  const fb = origin(sk, geo, ruler, b).f0;
  const lo = Math.max(fa, fb);
  const hi = Math.min(fa + a.nf, fb + b.nf);
  if (hi - lo < ruler.nodeGrid - 1e-6) return undefined;
  const free = (v: number): boolean => taken.every((u) => Math.abs(u - v) > 1e-6);
  const pitch = portStep(sk.unit, ruler);
  const mine = latticePorts(a.nf, pitch).map((v) => fa + v);
  const theirs = latticePorts(b.nf, pitch).map((v) => fb + v);
  const both = mine.filter((v) => v > lo + 1e-6 && v < hi - 1e-6 && free(v) && theirs.some((w) => Math.abs(w - v) < 1e-6));
  const ca = fa + a.nf / 2;
  const cb = fb + b.nf / 2;
  // Equally near both centres: the port nearest the centre of the narrower box.
  const narrow = a.nf <= b.nf ? ca : cb;
  both.sort((x, y) => {
    const d = Math.abs(x - ca) + Math.abs(x - cb) - (Math.abs(y - ca) + Math.abs(y - cb));
    return Math.abs(d) > 1e-6 ? d : Math.abs(x - narrow) - Math.abs(y - narrow) || x - y;
  });
  return both[0];
}

/** Line of every straight edge across the flow axis, in plan order, each on a port no other such edge uses; undefined when none is shared. */
export function straightLines(sk: Skeleton, geo: Geo, ruler: Ruler, plans: EdgePlan[]): Map<number, number | undefined> {
  const out = new Map<number, number | undefined>();
  const used = new Map<string, number[]>();
  for (const plan of plans) {
    if (plan.straight !== 'c') continue;
    const s = sk.byId.get(plan.from);
    const t = sk.byId.get(plan.to);
    if (!s || !t) continue;
    const keys = [`${s.id}|${plan.srcSide}`, `${t.id}|${plan.tgtSide}`];
    const taken = keys.flatMap((k) => used.get(k) ?? []);
    const at = sharedLine(sk, geo, ruler, s, t, taken);
    out.set(plan.index, at);
    if (at !== undefined) for (const k of keys) used.set(k, [...(used.get(k) ?? []), at]);
  }
  return out;
}

/** Coordinate of a track inside its channel strip. */
export function trackCoord(geo: Geo, ruler: Ruler, run: Run, track: number, count: number): number {
  const inset = geo.inset?.get(`${run.kind}${run.idx}`) ?? 0;
  const start = (run.kind === 'f' ? (geo.fStart[run.idx] ?? 0) : (geo.cStart[run.idx] ?? 0)) + inset;
  const width = (run.kind === 'f' ? (geo.wf[run.idx] ?? 0) : (geo.wc[run.idx] ?? 0)) - inset;
  return edgeNear(ruler, start + (width - (count - 1) * ruler.trackGap) / 2) + track * ruler.trackGap;
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
  const lines0 = straightLines(sk, geo, ruler, plans);
  for (const plan of plans) {
    const s = sk.byId.get(plan.from);
    const t = sk.byId.get(plan.to);
    if (!s || !t) continue;
    const start = portPoint(sk, geo, ruler, table, s, plan.srcSide, plan, 'src');
    const end = portPoint(sk, geo, ruler, table, t, plan.tgtSide, plan, 'tgt');
    if (plan.straight) {
      // Both ends of a perpendicular line sit on the port the two boxes share.
      const at = plan.straight === 'c' ? lines0.get(plan.index) : undefined;
      out.set(plan.index, at === undefined ? [start, plan.straight === 'c' ? { f: start.f, c: end.c } : end] : [{ f: at, c: start.c }, { f: at, c: end.c }]);
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
