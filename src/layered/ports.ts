import type { Ruler } from '../metrics.ts';
import type { NodeShape } from '../types.ts';
import type { Ladder } from './model.ts';
import type { Side } from './order.ts';
import { adjacency, flatRoute } from './order.ts';

/** Cells between two neighbouring pass-through lines of a terminal drawing: a blank cell separates them. */
export const LINE_PITCH = 2;

/** Distance between neighbouring ports on a side crossed by inter-layer edges; it divides the slot unit. */
export const portStep = (unit: number, ruler: Ruler): number => unit / Math.max(1, Math.round(unit / ruler.portPitch));

/** Extent of a box of `units` slot units along the order axis. */
export const boxLength = (units: number, unit: number, gap: number): number => units * unit - gap;

/** Pixels: a port keeps this far from the corners of its box. */
export const CORNER_CLEAR = 12;

/** Offsets from the start of a side: the centre and every multiple of the step from it that keeps clear of the corners. */
export function portOffsets(length: number, step: number): number[] {
  const out: number[] = [];
  // A port of one cell keeps clear of the corner cells too.
  const reach = length / 2 - step / 2 - (step <= 1 ? 1 : 0) + 1e-6;
  for (let k = -Math.floor(reach / step); k <= Math.floor(reach / step); k++) out.push(length / 2 + k * step);
  return out;
}

/** Offsets from the start of a short side on the dense lattice: the centre and every half step from it, at least CORNER_CLEAR from both ends. */
export function evenOffsets(length: number, step: number): number[] {
  const half = step / 2;
  const each = Math.max(0, Math.floor((length / 2 - CORNER_CLEAR + 1e-6) / half));
  const out: number[] = [];
  for (let j = -each; j <= each; j++) out.push(length / 2 + j * half);
  return out;
}

/** How many ports a side of this length holds: the lattice of whole steps, or the dense one where that holds more (never in a terminal). */
export const portRoom = (length: number, step: number, terminal: boolean): number =>
  Math.max(portOffsets(length, step).length, terminal ? 0 : evenOffsets(length, step).length);

/** The lattice a side takes for `count` ports: whole steps when that holds them, else the dense one when that does, else whole steps (the box has to grow). */
export function sideOffsets(length: number, step: number, count: number, terminal: boolean): number[] {
  const odd = portOffsets(length, step);
  if (terminal || odd.length >= count) return odd;
  const even = evenOffsets(length, step);
  return even.length >= count ? even : odd;
}

export type Face = 'top' | 'bottom' | 'left' | 'right';

/** The face of a box that a side of the layered pipeline is: layers run along x in a top-down drawing, along y otherwise. */
export const faceOf = (side: Side, td: boolean): Face => (td ? (side === 'up' ? 'left' : 'right') : side === 'up' ? 'top' : 'bottom');

/** Pixels: the straight stretch a hexagon and a parallelogram keep on top and bottom is the face less this much. */
const SLANT_LOSS = 24;

/** Share of its length around the middle of a face of a circle in which ports may stand. */
const CIRCLE_REACH = 0.35;

/** The shape whose ports a shape follows: a slanted or notched shape takes those of a parallelogram, a double circle and an ellipse those of a circle, a dot, a bar and an actor those of a diamond. */
export function portShape(shape: NodeShape | undefined): NodeShape | undefined {
  switch (shape) {
    case 'asym':
    case 'lean-l':
    case 'trap-b':
    case 'trap-t':
      return 'parallelogram';
    case 'dbl-circle':
    case 'ellipse':
      return 'circle';
    // These stand small inside their slot: their faces take the middle port only.
    case 'start-dot':
    case 'end-dot':
    case 'bar':
    case 'actor':
      return 'diamond';
    default:
      return shape;
  }
}

/**
 * How far from the middle of a face (of `length`, on a box `across` thick) a port may stand: Infinity where the
 * whole lattice serves, 0 where the middle is the only port. Terminal drawings draw every shape as a box.
 */
export function faceReach(shape: NodeShape | undefined, face: Face, length: number, across: number, terminal: boolean): number {
  if (terminal) return Infinity;
  const ends = face === 'left' || face === 'right';
  switch (portShape(shape)) {
    case 'diamond':
      return 0;
    case 'circle':
      return CIRCLE_REACH * length;
    case 'stadium':
      return ends ? 0 : Math.max(0, (length - across) / 2);
    case 'hexagon':
    case 'parallelogram':
      return ends ? 0 : Math.max(0, (length - SLANT_LOSS) / 2);
    default:
      return Infinity;
  }
}

/** True for a face whose only port is its middle. */
export const centreOnly = (shape: NodeShape | undefined, face: Face): boolean => {
  const kind = portShape(shape);
  return kind === 'diamond' || ((kind === 'stadium' || kind === 'hexagon' || kind === 'parallelogram') && (face === 'left' || face === 'right'));
};

const within = (offsets: number[], length: number, reach: number): number[] => offsets.filter((o) => Math.abs(o - length / 2) <= reach + 1e-6);

/** The ports of a face that are on the lattice and inside the reach of its shape (never none: the middle always serves). */
export function faceOffsets(shape: NodeShape | undefined, face: Face, length: number, across: number, step: number, count: number, terminal: boolean): number[] {
  const reach = faceReach(shape, face, length, across, terminal);
  if (reach === Infinity) return sideOffsets(length, step, count, terminal);
  if (reach === 0) return [length / 2];
  const odd = within(portOffsets(length, step), length, reach);
  if (odd.length >= count) return odd;
  const even = within(evenOffsets(length, step), length, reach);
  const pick = even.length >= count ? even : odd;
  return pick.length === 0 ? [length / 2] : pick;
}

/** How many ports a face of this shape holds. */
export function sideCapacity(shape: NodeShape | undefined, face: Face, length: number, step: number, across: number, terminal: boolean): number {
  const reach = faceReach(shape, face, length, across, terminal);
  if (reach === Infinity) return portRoom(length, step, terminal);
  if (reach === 0) return 1;
  return Math.max(1, within(portOffsets(length, step), length, reach).length, within(evenOffsets(length, step), length, reach).length);
}

/** True when a face that more ports would help has fewer than the layers need on its side: `up` and `down` ports wanted. */
export function lacksRoom(shape: NodeShape | undefined, td: boolean, length: number, step: number, across: number, terminal: boolean, up: number, down: number): boolean {
  return ([['up', up], ['down', down]] as const).some(([side, want]) => {
    const face = faceOf(side, td);
    return (terminal || !centreOnly(shape, face)) && sideCapacity(shape, face, length, step, across, terminal) < want;
  });
}

/** Fraction positions of the ports on a side along the layer axis: the centre first, then outward. */
export function sideFractions(count: number): number[] {
  const all = Array.from({ length: count }, (_, i) => (i + 1) / (count + 1));
  return all.sort((a, b) => Math.abs(a - 0.5) - Math.abs(b - 0.5) || a - b);
}

export interface FlatPlan {
  chain: number;
  mode: 'straight' | 'u';
  /** Side of the layer a U hangs on. */
  side: Side;
  /** Port slot on the facing sides of a straight flat edge. */
  slot: number;
}

/** How every flat edge is drawn: straight between neighbours while side ports last, else a U through a band. */
export function planFlat(l: Ladder, layers: number[][], ruler: Ruler): Map<number, FlatPlan> {
  const adj = adjacency(l);
  const pos = new Array<number>(l.nodes.length).fill(0);
  layers.forEach((r) => r.forEach((n, k) => (pos[n] = k)));
  const out = new Map<number, FlatPlan>();
  const used = new Map<string, number>();
  for (const f of l.flat) {
    const layer = l.nodes[f.lo]?.layer ?? 0;
    const route = flatRoute(l, layers[layer] ?? [], pos, adj, f.lo, f.hi, layer);
    if (route.between === 0) {
      const key = `${f.lo}|${f.hi}`;
      const n = used.get(key) ?? 0;
      if (n < ruler.sidePorts) {
        used.set(key, n + 1);
        out.set(f.chain, { chain: f.chain, mode: 'straight', side: route.side, slot: n });
        continue;
      }
    }
    out.set(f.chain, { chain: f.chain, mode: 'u', side: route.side, slot: 0 });
  }
  return out;
}

/** Ports every real node needs on its sides crossed by inter-layer edges. */
export function portDemand(l: Ladder, plan: Map<number, FlatPlan>): Array<{ up: number; down: number }> {
  const need = l.nodes.map(() => ({ up: 0, down: 0 }));
  l.chains.forEach((c, ci) => {
    if (c.kind === 'span') {
      for (let k = 0; k + 1 < c.nodes.length; k++) {
        const p = c.nodes[k] as number;
        const q = c.nodes[k + 1] as number;
        const [upper, lower] = (l.nodes[p]?.layer ?? 0) < (l.nodes[q]?.layer ?? 0) ? [p, q] : [q, p];
        const a = need[upper];
        const b = need[lower];
        if (a) a.down++;
        if (b) b.up++;
      }
    } else if (c.kind === 'loop') {
      const n = need[c.nodes[0] as number];
      if (n) n.up += 2;
    } else {
      const p = plan.get(ci);
      if (p?.mode === 'u') {
        for (const end of c.nodes) {
          const n = need[end];
          if (n) n[p.side]++;
        }
      }
    }
  });
  return need;
}

/** Widens real nodes by whole pairs of slot units until their sides hold the ports that edges need. */
export function growForPorts(l: Ladder, plan: Map<number, FlatPlan>, unit: number, gap: number, step: number, terminal: boolean, shapes: readonly NodeShape[], td: boolean, across: number): void {
  const need = portDemand(l, plan);
  for (const n of l.nodes) {
    if (n.idx >= l.realCount) continue;
    const up = need[n.idx]?.up ?? 0;
    const down = need[n.idx]?.down ?? 0;
    while (lacksRoom(shapes[n.idx], td, boxLength(n.units, unit, gap), step, across, terminal, up, down) && n.units < 40) n.units += 2;
  }
}
