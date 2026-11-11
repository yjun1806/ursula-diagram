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

function offsets(
  items: Attach[],
  len: number,
  ext: number,
  ruler: Ruler,
): number[] {
  const b = ruler.nodeBorder;
  const startInSlot = ruler.snap((ext - len) / 2);
  const centre = ext / 2 - startInSlot;
  const sIdx = items.findIndex((a) => a.straight);
  if (sIdx < 0) {
    return items.map((_, i) => b + ((i + 0.5) * (len - 2 * b)) / items.length);
  }
  const before = sIdx;
  const after = items.length - sIdx - 1;
  return items.map((_, i) => {
    if (i === sIdx) return centre;
    if (i < sIdx) return b + ((i + 1) * (centre - b)) / (before + 1);
    return centre + ((i - sIdx) * (len - b - centre)) / (after + 1);
  });
}

/**
 * Offsets on a cross-axis side that carries straight perpendicular lines at fixed places. The other
 * attachments keep their order, stay a track gap away from the fixed lines, and the ones that head
 * toward low coordinates sit on the low side of them.
 */
function offsetsAround(items: Attach[], fixed: Map<number, number>, len: number, ruler: Ruler): number[] {
  const b = ruler.nodeBorder;
  const gap = ruler.trackGap;
  const lines = [...fixed.values()].sort((p, q) => p - q);
  const first = lines[0] ?? b;
  const last = lines[lines.length - 1] ?? b;
  const place = (idx: number[], from: number, to: number): Map<number, number> => {
    const out = new Map<number, number>();
    const room = to - from;
    let prev = -Infinity;
    idx.forEach((i, k) => {
      let want = room / idx.length >= gap ? from + ((k + 0.5) * room) / idx.length : from + k * gap;
      want = Math.max(want, prev + gap);
      for (let moved = true; moved; ) {
        moved = false;
        for (const f of lines) {
          if (Math.abs(want - f) < gap - 1e-9) {
            want = f + gap;
            moved = true;
          }
        }
      }
      out.set(i, want);
      prev = want;
    });
    return out;
  };
  const free = items.map((a, i) => [a, i] as const).filter(([, i]) => !fixed.has(i));
  const low = free.filter(([a]) => a.key < 0).map(([, i]) => i);
  const high = free.filter(([a]) => a.key >= 0).map(([, i]) => i);
  const placedLow = place(low, b, Math.max(b, first - gap));
  const placedHigh = place(high, Math.min(len - b, last + gap), len - b);
  return items.map((_, i) => fixed.get(i) ?? placedLow.get(i) ?? placedHigh.get(i) ?? len / 2);
}

function extentsOf(sk: Skeleton, s: Slot, side: Side): { len: number; ext: number } {
  return isFlowSide(side)
    ? { len: s.nc, ext: sk.rowExt[s.lane]?.[s.row] ?? 0 }
    : { len: s.nf, ext: s.span > 1 ? s.nf : (sk.rankExt[s.rank] ?? 0) };
}

/** Orders and positions every attachment on every node side. */
export function buildPorts(
  sk: Skeleton,
  ruler: Ruler,
  plans: EdgePlan[],
  routed: Map<number, Routed>,
  runs: Run[],
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
    const startInSlot = ruler.snap((ext - len) / 2);
    const fixed = new Map<number, number>();
    if (!isFlowSide(side)) {
      sorted.forEach((a, i) => {
        const at = sk.align.off.get(`${a.edge}|${a.role}`);
        if (a.straight && at !== undefined) fixed.set(i, at);
      });
    }
    const offs = fixed.size > 0 ? offsetsAround(sorted, fixed, len, ruler) : offsets(sorted, len, ext, ruler);
    const slide = isFlowSide(side) ? 0 : (sk.align.slide.get(slot.id) ?? 0);
    table.set(
      k,
      sorted.map((a, i) => {
        const off = offs[i] ?? 0;
        return { ...a, off, rel: startInSlot + slide + off - ext / 2 };
      }),
    );
  }
  return table;
}

/** Ordering rules that keep stubs of different edges from crossing or touching. */
export function portOrders(sk: Skeleton, table: PortTable, runs: Run[]): Order[] {
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
          slotKey: isFlowSide(side) ? `r${slot.cRow}` : `k${slot.rank}`,
          side,
          rel: a.rel,
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
