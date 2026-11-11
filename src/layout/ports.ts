import type { Ruler } from '../metrics.ts';
import type { Side, Skeleton, Slot } from './place.ts';
import type { EdgePlan } from './plan.ts';
import { isFlowSide } from './plan.ts';
import type { Order } from './tracks.ts';
import type { Routed, Run } from './route.ts';

export interface Attach {
  edge: number;
  role: 'src' | 'tgt';
  straight: boolean;
  /** Sort key: which way the edge leaves the side (negative: toward low coordinates). */
  key: number;
  /** Offset of the attachment from the node's start along the side. */
  off: number;
  /** Offset relative to the centre of the node's slot; equal values on facing nodes collide. */
  rel: number;
  run: number;
}

export type PortTable = Map<string, Attach[]>;

const portKey = (id: string, side: Side): string => `${id}|${side}`;

/** Pitch of the ports on a side along the flow axis: the ruler's pitch, rounded so that it divides the slot unit. */
export function portStep(unit: number, ruler: Ruler): number {
  return unit / Math.max(1, Math.round(unit / ruler.portPitch));
}

/** Ports on a side along the flow axis: the centre and every pitch from it in both directions, corners left out. */
export function latticePorts(len: number, pitch: number): number[] {
  const out = [len / 2];
  for (let k = 1; len / 2 - k * pitch > 1e-6; k++) out.push(len / 2 - k * pitch, len / 2 + k * pitch);
  return out.sort((x, y) => x - y);
}

/** Ports on a side across the flow axis: equal fractions of the side, the centre among them. */
export function fractionPorts(len: number, count: number): number[] {
  return Array.from({ length: count }, (_, k) => ((k + 1) * len) / (count + 1));
}

function extentsOf(sk: Skeleton, s: Slot, side: Side): { len: number; ext: number } {
  return isFlowSide(side)
    ? { len: s.nc, ext: sk.rowExt[s.lane]?.[s.row] ?? 0 }
    : { len: s.nf, ext: s.nf };
}

/** Orders and positions every attachment on every node side. */
export function buildPorts(
  sk: Skeleton,
  ruler: Ruler,
  plans: EdgePlan[],
  routed: Map<number, Routed>,
  runs: Run[],
  /** Flow-axis coordinate of every straight line across the flow axis, from the drawn boxes. */
  lines: ReadonlyMap<number, number | undefined> = new Map(),
  /** Flow-axis start of a box. */
  start: (slot: Slot) => number = () => 0,
): PortTable {
  const raw = new Map<string, Attach[]>();
  const add = (slot: Slot, side: Side, a: Omit<Attach, 'off' | 'rel'>): void => {
    const k = portKey(slot.id, side);
    raw.set(k, [...(raw.get(k) ?? []), { ...a, off: 0, rel: 0 }]);
  };
  for (const p of plans) {
    const s = sk.byId.get(p.from);
    const t = sk.byId.get(p.to);
    if (!s || !t) continue;
    const r = routed.get(p.index);
    const ids = r?.runs ?? [];
    const first = ids[0] ?? -1;
    const last = ids[ids.length - 1] ?? -1;
    if (!p.straight && !r) continue;
    const keyOf = (slot: Slot, side: Side, run: number, fallback: number): number => {
      if (p.straight) return 0;
      if (p.self) return fallback;
      const rr = runs[run];
      if (!rr) return 0;
      // The run touching a port starts at the slot middle (2k + 1) and heads one way.
      const mid = isFlowSide(side) ? 2 * slot.cb + 1 : 2 * slot.rank + slot.span;
      const other = rr.lo === mid ? rr.hi : rr.lo;
      return other === mid ? fallback : other - mid;
    };
    add(s, p.srcSide, { edge: p.index, role: 'src', straight: p.straight !== null, key: keyOf(s, p.srcSide, first, -0.5), run: first });
    add(t, p.tgtSide, { edge: p.index, role: 'tgt', straight: p.straight !== null, key: keyOf(t, p.tgtSide, last, 0.5), run: last });
  }

  const table: PortTable = new Map();
  for (const [k, list] of raw) {
    const [id, side] = k.split('|') as [string, Side];
    const slot = sk.byId.get(id);
    if (!slot) continue;
    const sorted = [...list].sort(
      (a, b) => a.key - b.key || a.edge - b.edge || (a.role === 'src' ? -1 : 1) - (b.role === 'src' ? -1 : 1),
    );
    const { len, ext } = extentsOf(sk, slot, side);
    const startInSlot = 0;
    const pitch = portStep(sk.unit, ruler);
    const lowCount = sorted.filter((a) => !a.straight && a.key < 0).length;
    const highCount = sorted.filter((a) => !a.straight && a.key >= 0).length;
    const wanted = sorted.some((a) => a.straight) ? 1 + 2 * Math.max(lowCount, highCount) : sorted.length;
    const free: number[] =
      isFlowSide(side) && wanted <= ruler.sidePorts ? fractionPorts(len, ruler.sidePorts) : latticePorts(len, pitch);
    if (free.length < sorted.length) free.splice(0, free.length, ...fractionPorts(len, sorted.length));
    const centre = len / 2;
    const taken = new Set<number>();
    const chosen = new Map<number, number>();
    // Straight lines first: along the flow axis through the centre port, across it through a port both boxes share.
    sorted.forEach((a, i) => {
      if (!a.straight) return;
      const plan = plans.find((p) => p.index === a.edge);
      let wanted = free.map((_, j) => j).sort((x, y) => Math.abs((free[x] ?? 0) - centre) - Math.abs((free[y] ?? 0) - centre));
      const line = lines.get(a.edge);
      if (!isFlowSide(side) && line !== undefined) {
        // The line was fixed from the drawn boxes: it takes that port, and no other edge on the side may use it.
        const off = line - start(slot);
        const j = free.findIndex((v, k) => !taken.has(k) && Math.abs(v - off) < 1e-6);
        if (j >= 0) taken.add(j);
        chosen.set(i, off);
        return;
      }
      if (!isFlowSide(side)) {
        const peer = sk.byId.get(a.role === 'src' ? (plan?.to ?? '') : (plan?.from ?? ''));
        if (peer && peer !== slot) {
          const base = slot.rank * sk.unit;
          const other = peer.rank * sk.unit;
          const theirs = latticePorts(peer.nf, pitch).map((v) => other + v);
          const mine = free.map((v) => base + v);
          const both = mine.flatMap((v, j) => (theirs.some((w) => Math.abs(w - v) < 1e-6) ? [j] : []));
          const mid = base + slot.nf / 2;
          const peerMid = other + peer.nf / 2;
          const cost = (j: number): number => Math.abs((mine[j] ?? 0) - mid) + Math.abs((mine[j] ?? 0) - peerMid);
          if (both.length === 0) {
            // No port of this box lies in the overlap: the line runs through the middle of the overlap instead.
            const lo = Math.max(base, other);
            const hi = Math.min(base + slot.nf, other + peer.nf);
            chosen.set(i, (lo + hi) / 2 - base);
            return;
          }
          const pool = both;
          wanted = [...pool].sort((x, y) => {
            const d = cost(x) - cost(y);
            if (Math.abs(d) > 1e-6) return d;
            // Equally near both centres: the one nearest the partner's centre.
            const e = Math.abs((mine[x] ?? 0) - peerMid) - Math.abs((mine[y] ?? 0) - peerMid);
            return Math.abs(e) > 1e-6 ? e : x - y;
          });
        }
      }
      const routed = sorted.filter((o) => !o.straight);
      const nLow = routed.filter((o) => o.key < 0).length;
      const nHigh = routed.length - nLow;
      // The shared port also has to leave room for the other edges on the side, each toward its own partner.
      const roomy = (j: number): boolean =>
        free.filter((v, k) => !taken.has(k) && k !== j && v < (free[j] ?? 0) - 1e-6).length >= nLow &&
        free.filter((v, k) => !taken.has(k) && k !== j && v > (free[j] ?? 0) + 1e-6).length >= nHigh;
      // A line along the flow axis is drawn through the middle of the row, so it keeps the centre port.
      const j = isFlowSide(side) ? wanted.find((w) => !taken.has(w)) : (wanted.find((w) => !taken.has(w) && roomy(w)) ?? wanted.find((w) => !taken.has(w)));
      if (j !== undefined) {
        taken.add(j);
        chosen.set(i, free[j] ?? centre);
      }
    });
    // The other edges take the free ports nearest the centre, in the order of their partners.
    const rest = sorted.map((_, i) => i).filter((i) => !chosen.has(i));
    const fixed = [...chosen.values()];
    const avail = free.map((_, j) => j).filter((j) => !taken.has(j));
    const lo = fixed.length > 0 ? Math.min(...fixed) : centre;
    const hi = fixed.length > 0 ? Math.max(...fixed) : centre;
    const below = avail.filter((j) => (free[j] ?? 0) < lo - 1e-6).sort((x, y) => y - x);
    const above = avail.filter((j) => (free[j] ?? 0) > hi + 1e-6).sort((x, y) => x - y);
    const lows = rest.filter((i) => (sorted[i]?.key ?? 0) < 0);
    const highs = rest.filter((i) => (sorted[i]?.key ?? 0) >= 0);
    if (fixed.length > 0 && below.length >= lows.length && above.length >= highs.length) {
      const giveLow = below.slice(0, lows.length).sort((x, y) => x - y);
      const giveHigh = above.slice(0, highs.length).sort((x, y) => x - y);
      lows.forEach((i, k) => chosen.set(i, free[giveLow[k] ?? 0] ?? centre));
      highs.forEach((i, k) => chosen.set(i, free[giveHigh[k] ?? 0] ?? centre));
    } else {
      // An even number of edges leaves the centre port free so that the ports stay symmetric about it.
      const pickable = fixed.length === 0 && rest.length % 2 === 0 ? avail.filter((j) => Math.abs((free[j] ?? 0) - centre) > 1e-6) : avail;
      const set = (pickable.length >= rest.length ? pickable : avail)
        .sort((x, y) => {
          const d = Math.abs((free[x] ?? 0) - centre) - Math.abs((free[y] ?? 0) - centre);
          return Math.abs(d) > 1e-6 ? d : x - y;
        })
        .slice(0, rest.length)
        .sort((x, y) => x - y);
      rest.forEach((i, k) => chosen.set(i, free[set[k] ?? 0] ?? centre));
    }
    const offs = sorted.map((_, i) => chosen.get(i) ?? centre);
    table.set(
      k,
      sorted.map((a, i) => {
        const off = offs[i] ?? 0;
        return { ...a, off, rel: startInSlot + off - (isFlowSide(side) ? len : ext) / 2 };
      }),
    );
  }
  return table;
}

/** Ordering rules that keep stubs of different edges from crossing or touching. */
export function portOrders(sk: Skeleton, table: PortTable, runs: Run[], at: (slot: Slot, off: number) => number = (slot, off) => slot.rank * sk.unit + off): Order[] {
  const orders: Order[] = [];
  const stubs: Array<{ line: string; slotKey: string; side: Side; rel: number; run: number }> = [];
  for (const [k, list] of table) {
    const [id, side] = k.split('|') as [string, Side];
    const slot = sk.byId.get(id);
    if (!slot) continue;
    const sign = side === 'fH' || side === 'cH' ? 1 : -1;
    list.forEach((a, i) => {
      const run = runs[a.run];
      if (run && !a.straight) {
        stubs.push({
          line: `${run.kind}${run.idx}`,
          slotKey: isFlowSide(side) ? `r${slot.cRow}` : 'f',
          side,
          // Along the flow axis boxes of different extents share a coordinate only by absolute position.
          rel: isFlowSide(side) ? a.rel : at(slot, a.off),
          run: a.run,
        });
      }
      const b = list[i + 1];
      if (!b || a.straight || b.straight || a.run < 0 || b.run < 0) return;
      if (Math.sign(a.key) !== Math.sign(b.key)) return;
      // Within one group the attachment nearer the corner keeps its stub shorter.
      const [near, far] = a.key < 0 ? [a, b] : [b, a];
      orders.push(sign > 0 ? { before: near.run, after: far.run } : { before: far.run, after: near.run });
    });
  }
  for (const lowSide of stubs) {
    if (lowSide.side !== 'fH' && lowSide.side !== 'cH') continue;
    for (const highSide of stubs) {
      if (highSide.side !== (lowSide.side === 'fH' ? 'fL' : 'cL')) continue;
      if (lowSide.line === highSide.line && lowSide.slotKey === highSide.slotKey && Math.abs(lowSide.rel - highSide.rel) < 1e-6) {
        orders.push({ before: lowSide.run, after: highSide.run });
      }
    }
  }
  return orders;
}

export function attachOf(table: PortTable, id: string, side: Side, edge: number, role: 'src' | 'tgt'): Attach | undefined {
  return table.get(portKey(id, side))?.find((a) => a.edge === edge && a.role === role);
}
