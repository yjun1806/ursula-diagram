import { endFields } from '../edge-ends.ts';
import type { EdgeStyle, Graph, LayoutEdge } from '../types.ts';
import type { Ruler } from '../metrics.ts';
import type { Need, Side, Slot, Topology } from './place.ts';

export interface EdgePlan {
  index: number;
  from: string;
  to: string;
  style: EdgeStyle;
  ends: Pick<LayoutEdge, 'id' | 'startEnd' | 'end' | 'invisible'>;
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
/** With `facing`, an edge that runs back to an earlier column leaves by the near flow side and enters by the far one. */
export function planEdges(
  graph: Graph,
  topo: Topology,
  facing = false,
  /** Clear distance between touching boxes as a fraction of a slot unit. */
  gap = 0.5,
  /** Edges that must be routed although their boxes overlap in slot units: drawn, they do not overlap. */
  demote: ReadonlySet<number> = new Set(),
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
        const to = Math.min(s.rank + s.span, t.rank + t.span) - gap;
        const x = (from + to) / 2;
        const blocked = topo.slots.some((n) => x > n.rank - 0.1 && x < n.rank + n.span - gap + 0.1 && n.cRow > lo && n.cRow < hi);
        if (!blocked) {
          straight = 'c';
          key = `c:${from}:${lo}:${hi}`;
        }
      }
      if (straight === 'c' && demote.has(index)) straight = null;
      if (straight) {
        if (used.has(key)) straight = null;
        else used.add(key);
      }
    }
    plans.push({
      index,
      from: e.from,
      to: e.to,
      style: e.style,
      ends: endFields(e),
      ...(e.label ? { label: e.label } : {}),
      self,
      straight,
      srcSide,
      tgtSide,
    });
  });
  return plans;
}

/**
 * Length a node side needs so that every edge on it has its own port: the side holds a port at every
 * `pitch` along the flow axis, and a fixed few across it.
 */
export function requiredLength(count: number, alongFlow: boolean, ruler: Ruler, pitch: number): number {
  if (count === 0) return 0;
  if (!alongFlow && count <= ruler.sidePorts) return 0;
  const step = alongFlow ? pitch : ruler.portPitch;
  const raw = (count + 1) * step + 2 * ruler.nodeBorder;
  // A side that runs across the flow axis keeps a port at its centre by growing in pairs of pitches.
  return alongFlow ? raw : Math.ceil(raw / (2 * step) - 1e-9) * 2 * step;
}

export function nodeNeeds(plans: EdgePlan[], topo: Topology, ruler: Ruler, pitch: number): Map<string, Need> {
  const sides = new Map<string, { low: number; high: number; straight: boolean }>();
  const bump = (slot: Slot, side: Side, peer: Slot, straight: boolean): void => {
    const key = `${slot.id}|${side}`;
    const cur = sides.get(key) ?? { low: 0, high: 0, straight: false };
    // Edges whose partner lies toward low coordinates need ports below the straight one, the others above it.
    const before = isFlowSide(side) ? peer.cRow < slot.cRow : peer.rank + peer.span / 2 < slot.rank + slot.span / 2;
    sides.set(key, {
      low: cur.low + (!straight && before ? 1 : 0),
      high: cur.high + (!straight && !before ? 1 : 0),
      straight: cur.straight || straight,
    });
  };
  for (const p of plans) {
    const s = topo.byId.get(p.from);
    const t = topo.byId.get(p.to);
    if (!s || !t) continue;
    bump(s, p.srcSide, t, p.straight !== null);
    bump(t, p.tgtSide, s, p.straight !== null);
  }
  const needs = new Map<string, Need>();
  for (const slot of topo.slots) {
    const len = (side: Side): number => {
      const e = sides.get(`${slot.id}|${side}`);
      if (!e) return 0;
      // With a straight line on the centre port, every other edge keeps to its own side of it.
      const ports = e.straight ? 1 + 2 * Math.max(e.low, e.high) : e.low + e.high;
      return requiredLength(ports, !isFlowSide(side), ruler, pitch);
    };
    needs.set(slot.id, { nf: Math.max(len('cL'), len('cH')), nc: Math.max(len('fL'), len('fH')) });
  }
  return needs;
}
