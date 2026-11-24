import type { Ruler } from '../metrics.ts';
import type { EdgeEnd, Graph, NodeShape } from '../types.ts';
import type { Ladder } from './model.ts';
import type { Side } from './order.ts';
import { adjacency, flatRoute } from './order.ts';

/** Cells between two neighbouring pass-through lines of a terminal drawing: a blank cell separates them. */
export const LINE_PITCH = 2;

/** Distance between neighbouring ports on a side crossed by inter-layer edges; it divides the slot unit. */
export const portStep = (unit: number, ruler: Ruler): number => unit / Math.max(1, Math.round(unit / ruler.portPitch));

/** Extent of a box of `units` slot units along the order axis. */
export const boxLength = (units: number, unit: number, gap: number): number => units * unit - gap;

/** The length of a box of its own `size` standing in a slot of `slot`: its own size, at most the slot. */
export const bodyLength = (size: number, slot: number): number => Math.min(size, slot);

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

/** Distance between two ports on a side that is crowded beyond the lattice: the least two line ends may stand apart. */
export const DENSE_PITCH = 8;

/** Offsets from the start of a side at DENSE_PITCH from one another, centred, at least CORNER_CLEAR from both ends. */
export function denseOffsets(length: number): number[] {
  const each = Math.max(0, Math.floor((length / 2 - CORNER_CLEAR + 1e-6) / DENSE_PITCH));
  const out: number[] = [];
  for (let j = -each; j <= each; j++) out.push(length / 2 + j * DENSE_PITCH);
  return out;
}

/** How many ports a side of this length holds: the lattice of whole steps, or the dense one where that holds more (never in a terminal). */
export const portRoom = (length: number, step: number, terminal: boolean): number =>
  Math.max(portOffsets(length, step).length, terminal ? 0 : evenOffsets(length, step).length);

/** The lattice a side takes for `count` ports: whole steps when that holds them, else the dense one when that does, else whole steps (the box has to grow). */
export function sideOffsets(length: number, step: number, count: number, terminal: boolean, crowded = false): number[] {
  const odd = portOffsets(length, step);
  if (terminal || odd.length >= count) return odd;
  // A box that keeps its size spaces its ports DENSE_PITCH apart, not closer, rather than grow.
  if (crowded) {
    const dense = denseOffsets(length);
    return dense.length >= count ? dense : odd;
  }
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
export function faceOffsets(shape: NodeShape | undefined, face: Face, length: number, across: number, step: number, count: number, terminal: boolean, crowded = false): number[] {
  const reach = faceReach(shape, face, length, across, terminal);
  if (reach === Infinity) return sideOffsets(length, step, count, terminal, crowded);
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

/**
 * The ends of lines that share one port on a side of a box: the bundle of an end, by twice the index of its chain plus
 * 0 for the end at the source or 1 for the end at the target. An end that is not in it has a port of its own.
 */
export type Bundles = ReadonlyMap<number, number>;

const NO_BUNDLES: Bundles = new Map();

/** The bundle the end of chain `chain` at its source (`0`) or its target (`1`) belongs to; -1 when the end has a port of its own. */
export const bundleAt = (bundles: Bundles, chain: number, end: 0 | 1): number => bundles.get(2 * chain + end) ?? -1;

/** Counts the placements in which lines were given a port to share: a drawing during which it stands still is the same with and without shared ports. */
export const sharing = { placements: 0 };

/** Marks that take two cells at the end of a line: lines that carry one keep a port of their own. */
const COUNT_MARKS: ReadonlySet<EdgeEnd> = new Set<EdgeEnd>(['one', 'zero-one', 'many', 'one-many', 'zero-many', 'lollipop']);

interface BundleEnd {
  chain: number;
  end: 0 | 1;
  /** The box at the other end of the line. */
  other: number;
  /** Place in its layer of the next node of the chain: the ends of a side take their ports in this order. */
  place: number;
  /** What the line looks like from this end; empty for a line that is never joined. */
  look: string;
}

/**
 * Terminal drawings whose layers are columns: lines without a label that end on one side of a box share its port there
 * and split after they have left the box, so that the box needs one line of the side for all of them. Only lines that
 * look alike are joined: the same style and the same marks, with a mark at exactly one end, so that the lines that
 * leave a box are never joined with those that arrive. The joined ends are neighbours in the order of the side, so
 * no other line of the side has to cross them. A line is joined at one of its ends only, and two lines between the
 * same two boxes are not joined, so every branch still leads to one box.
 */
export function endBundles(graph: Graph, l: Ladder, layers: number[][], plan: Map<number, FlatPlan>, on: boolean): Bundles {
  if (!on) return NO_BUNDLES;
  const place = new Array<number>(l.nodes.length).fill(0);
  layers.forEach((row) => row.forEach((n, k) => (place[n] = k)));
  const sides = new Map<number, BundleEnd[]>();
  const closed = new Set<number>();
  const sideKey = (node: number, next: number): number => 2 * node + ((l.nodes[next]?.layer ?? 0) > (l.nodes[node]?.layer ?? 0) ? 1 : 0);
  l.chains.forEach((c, ci) => {
    if (c.kind !== 'span' || c.nodes.length < 2) return;
    const e = graph.edges[c.edge];
    const startMark: EdgeEnd = e?.startEnd ?? 'none';
    const endMark: EdgeEnd = e?.end ?? 'arrow';
    const alike =
      e !== undefined &&
      e.invisible !== true &&
      (e.label ?? '') === '' &&
      (e.startLabel ?? '') === '' &&
      (e.endLabel ?? '') === '' &&
      (startMark === 'none') !== (endMark === 'none') &&
      !COUNT_MARKS.has(startMark) &&
      !COUNT_MARKS.has(endMark);
    const src = c.nodes[0] as number;
    const tgt = c.nodes[c.nodes.length - 1] as number;
    const add = (node: number, next: number, end: 0 | 1, here: EdgeEnd, there: EdgeEnd, other: number): void => {
      const k = sideKey(node, next);
      sides.set(k, [...(sides.get(k) ?? []), { chain: ci, end, other, place: place[next] ?? 0, look: alike ? `${e?.style}|${here}|${there}` : '' }]);
    };
    add(src, c.nodes[1] as number, 0, startMark, endMark, tgt);
    add(tgt, c.nodes[c.nodes.length - 2] as number, 1, endMark, startMark, src);
  });
  // A side that a loop or a line within the layer also uses keeps a port for every end.
  l.chains.forEach((c, ci) => {
    const side = c.kind === 'loop' ? 'up' : c.kind === 'flat' && plan.get(ci)?.mode === 'u' ? plan.get(ci)?.side : undefined;
    if (side !== undefined) for (const n of c.nodes) closed.add(2 * n + (side === 'down' ? 1 : 0));
  });
  const taken = new Set<number>();
  /** The runs of neighbouring ends of a side that look alike and are still free, each run leading to different boxes. */
  const runsOf = (ends: BundleEnd[]): BundleEnd[][] => {
    const runs: BundleEnd[][] = [];
    let run: BundleEnd[] = [];
    for (const m of ends) {
      const joins = m.look !== '' && !taken.has(m.chain) && run[0]?.look === m.look && !run.some((r) => r.other === m.other);
      if (!joins) {
        if (run.length >= 2) runs.push(run);
        run = m.look !== '' && !taken.has(m.chain) ? [m] : [];
      } else run = [...run, m];
    }
    if (run.length >= 2) runs.push(run);
    return runs;
  };
  // Two lines to the same neighbour have no order of their own on the side: neither is joined.
  const ordered = [...sides]
    .filter(([k]) => !closed.has(k))
    .map(([, ends]) => [...ends].sort((a, b) => a.place - b.place || a.chain - b.chain))
    .map((ends) => ends.map((m, i) => (ends[i - 1]?.place === m.place || ends[i + 1]?.place === m.place ? { ...m, look: '' } : m)));
  const at = new Map<number, number>();
  let next = 0;
  // The longest run first: a line that could be joined at both ends is joined where more lines meet.
  for (;;) {
    let best: BundleEnd[] | undefined;
    for (const ends of ordered) for (const run of runsOf(ends)) if (best === undefined || run.length > best.length) best = run;
    if (best === undefined) break;
    for (const m of best) {
      taken.add(m.chain);
      at.set(2 * m.chain + m.end, next);
    }
    next++;
  }
  return next === 0 ? NO_BUNDLES : at;
}

/** Ports every real node needs on its sides crossed by inter-layer edges; the ends of one bundle need one port together. */
export function portDemand(l: Ladder, plan: Map<number, FlatPlan>, bundles: Bundles = NO_BUNDLES): Array<{ up: number; down: number }> {
  const need = l.nodes.map(() => ({ up: 0, down: 0 }));
  const counted = new Set<number>();
  /** False for an end of a bundle that has been counted already. */
  const fresh = (chain: number, end: 0 | 1): boolean => {
    const b = bundleAt(bundles, chain, end);
    if (b < 0) return true;
    if (counted.has(b)) return false;
    counted.add(b);
    return true;
  };
  l.chains.forEach((c, ci) => {
    if (c.kind === 'span') {
      for (let k = 0; k + 1 < c.nodes.length; k++) {
        const p = c.nodes[k] as number;
        const q = c.nodes[k + 1] as number;
        const pDown = (l.nodes[p]?.layer ?? 0) < (l.nodes[q]?.layer ?? 0);
        const a = need[p];
        const b = need[q];
        if (a && (k > 0 || fresh(ci, 0))) a[pDown ? 'down' : 'up']++;
        if (b && (k + 2 < c.nodes.length || fresh(ci, 1))) b[pDown ? 'up' : 'down']++;
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
export function growForPorts(l: Ladder, plan: Map<number, FlatPlan>, unit: number, gap: number, step: number, terminal: boolean, shapes: readonly NodeShape[], td: boolean, across: number, given: ReadonlyArray<number | undefined> = [], bundles: Bundles = NO_BUNDLES): void {
  const need = portDemand(l, plan, bundles);
  for (const n of l.nodes) {
    if (n.idx >= l.realCount) continue;
    const up = need[n.idx]?.up ?? 0;
    const down = need[n.idx]?.down ?? 0;
    // A box of a given size keeps it: its line ends stand DENSE_PITCH apart, and it grows only when they do not fit even so.
    const own = given[n.idx];
    if (own !== undefined) {
      while (denseOffsets(bodyLength(own, boxLength(n.units, unit, gap))).length < Math.max(up, down) && n.units < 40) n.units += 2;
      continue;
    }
    while (lacksRoom(shapes[n.idx], td, boxLength(n.units, unit, gap), step, across, terminal, up, down) && n.units < 40) n.units += 2;
  }
}
