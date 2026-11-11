import type { EdgeStyle, Graph } from '../types.ts';
import type { Ruler } from '../metrics.ts';
import type { Need, Side, Slot, Topology } from './place.ts';

export interface EdgePlan {
  index: number;
  from: string;
  to: string;
  style: EdgeStyle;
  label?: string;
  self: boolean;
  /** 'f': one line along the flow axis; 'c': one line across it; null: routed. */
  straight: 'f' | 'c' | null;
  srcSide: Side;
  tgtSide: Side;
}

export function isFlowSide(side: Side): boolean {
  return side === 'fL' || side === 'fH';
}

/** Chooses attachment sides and finds edges that can be drawn as one straight line. */
/** `forced` lists edges that run as one straight perpendicular line because their boxes were slid to overlap. */
/** With `facing`, an edge that runs back to an earlier column leaves by the near flow side and enters by the far one. */
export function planEdges(
  graph: Graph,
  topo: Topology,
  forced: ReadonlySet<number> = new Set(),
  facing = false,
): EdgePlan[] {
  const used = new Set<string>();
  const plans: EdgePlan[] = [];
  graph.edges.forEach((e, index) => {
    const s = topo.byId.get(e.from);
    const t = topo.byId.get(e.to);
    if (!s || !t) return;
    const self = s === t;
    let srcSide: Side;
    let tgtSide: Side;
    if (self) [srcSide, tgtSide] = ['cL', 'cL'];
    else if (t.rank >= s.rank + s.span) [srcSide, tgtSide] = ['fH', 'fL'];
    else if (facing && s.rank >= t.rank + t.span) [srcSide, tgtSide] = ['fL', 'fH'];
    else if (t.cRow > s.cRow) [srcSide, tgtSide] = ['cH', 'cL'];
    else if (t.cRow < s.cRow) [srcSide, tgtSide] = ['cL', 'cH'];
    else [srcSide, tgtSide] = ['cH', 'cH'];

    if (!self && forced.has(index) && s.cRow !== t.cRow) {
      [srcSide, tgtSide] = t.cRow > s.cRow ? ['cH', 'cL'] : ['cL', 'cH'];
    }

    let straight: 'f' | 'c' | null = null;
    if (!self) {
      let key = '';
      if (t.rank >= s.rank + s.span && t.cRow === s.cRow) {
        const blocked = topo.slots.some((n) => n.cRow === s.cRow && n.rank >= s.rank + s.span && n.rank < t.rank);
        if (!blocked) {
          straight = 'f';
          key = `f:${s.cRow}:${s.rank}:${t.rank}`;
        }
      } else if (facing && s.rank >= t.rank + t.span && t.cRow === s.cRow) {
        const blocked = topo.slots.some((n) => n.cRow === s.cRow && n.rank >= t.rank + t.span && n.rank < s.rank);
        if (!blocked) {
          straight = 'f';
          key = `f:${s.cRow}:${t.rank}:${s.rank}`;
        }
      } else if (t.rank < s.rank + s.span && s.rank < t.rank + t.span && t.cRow !== s.cRow) {
        // The columns overlap: one perpendicular line through the middle of the overlap.
        const lo = Math.min(s.cRow, t.cRow);
        const hi = Math.max(s.cRow, t.cRow);
        const from = Math.max(s.rank, t.rank);
        const to = Math.min(s.rank + s.span, t.rank + t.span);
        const blocked = topo.slots.some((n) => n.rank < to && from < n.rank + n.span && n.cRow > lo && n.cRow < hi);
        if (!blocked) {
          straight = 'c';
          key = `c:${from}:${lo}:${hi}`;
        }
      }
      if (straight) {
        if (used.has(key)) straight = null;
        else used.add(key);
      }
      if (!straight && forced.has(index) && t.cRow !== s.cRow) straight = 'c';
    }
    plans.push({
      index,
      from: e.from,
      to: e.to,
      style: e.style,
      ...(e.label ? { label: e.label } : {}),
      self,
      straight,
      srcSide,
      tgtSide,
    });
  });
  return plans;
}

/** Length a node side needs so that its attachments stay a track gap apart. */
export function requiredLength(count: number, hasStraight: boolean, ruler: Ruler): number {
  if (count === 0) return 0;
  const slots = hasStraight && count > 1 ? 2 * count : count;
  return slots * ruler.trackGap + 2 * ruler.nodeBorder;
}

export function nodeNeeds(plans: EdgePlan[], topo: Topology, ruler: Ruler): Map<string, Need> {
  const sides = new Map<string, { n: number; straight: boolean }>();
  const bump = (slot: Slot, side: Side, straight: boolean): void => {
    const key = `${slot.id}|${side}`;
    const cur = sides.get(key) ?? { n: 0, straight: false };
    sides.set(key, { n: cur.n + 1, straight: cur.straight || straight });
  };
  for (const p of plans) {
    const s = topo.byId.get(p.from);
    const t = topo.byId.get(p.to);
    if (!s || !t) continue;
    bump(s, p.srcSide, p.straight !== null);
    bump(t, p.tgtSide, p.straight !== null);
  }
  const needs = new Map<string, Need>();
  for (const slot of topo.slots) {
    const len = (side: Side): number => {
      const e = sides.get(`${slot.id}|${side}`);
      return e ? requiredLength(e.n, e.straight, ruler) : 0;
    };
    needs.set(slot.id, { nf: Math.max(len('cL'), len('cH')), nc: Math.max(len('fL'), len('fH')) });
  }
  return needs;
}
