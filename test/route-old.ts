// The routing stage as it was before it was rewritten on number arrays, kept as it was; only `route` is renamed (`routeOld`).
import type { Ruler } from '../src/metrics.ts';
import { endFields } from '../src/edge-ends.ts';
import type { Compartment, Diagnostic, Graph, Layout, LayoutEdge, LayoutLane, LayoutNode, NodeShape, Point } from '../src/types.ts';
import { crossings } from '../src/layout/check.ts';
import { withOutline } from '../src/layout/diamond.ts';
import type { LabelSize, Rect, Segment } from '../src/layout/labels.ts';
import { labelSize, placeLabel } from '../src/layout/labels.ts';
import { useElbows } from '../src/layered/elbows.ts';
import { edgeNear, gridUp } from '../src/layout/place.ts';
import type { Ladder } from '../src/layered/model.ts';
import type { Side } from '../src/layered/order.ts';
import type { FlatPlan } from '../src/layered/ports.ts';

import { settleVertices } from '../src/layered/vertex.ts';
import { offCentreEnds } from '../src/layered/centre.ts';
import { settleBodies } from '../src/layered/bodies.ts';
import { evenRecords } from '../src/layered/even-records.ts';
import { placeEndLabels } from '../src/layered/end-labels.ts';
import { ARROW, labelBox, labelLines, lineBeside } from '../src/layered/label-room.ts';
import { BORDER_CLEAR } from '../src/layered/lane-gaps.ts';
import { SLIDE } from '../src/layered/label-spot.ts';
import { bodyLength, boxLength, CORNER_CLEAR, faceOf, faceOffsets, faceReach, LINE_PITCH, portStep, sideFractions } from '../src/layered/ports.ts';

export interface Frame {
  graph: Graph;
  ruler: Ruler;
  td: boolean;
  /** Size of one slot unit along the order axis, and the clear gap between touching boxes. */
  unit: number;
  gap: number;
  /** Space the lane labels take along the order axis. */
  gutter: number;
  /** Natural extent of every real node along the layer axis. */
  layerExt: number[];
  /** Own extent of a real node along the order axis when it is shorter than its slot (a box divided into compartments); it stands in the middle of the slot. */
  /** Width every real node was measured at; the diamonds of a drawing are drawn at the shared width of their kind. */
  measured?: number[];
  /** Compartments a box is drawn with when they differ from the ones it was given (padded to the height of the boxes of its rank). */
  compartments?: ReadonlyMap<number, Compartment[]>;
  bodyLen?: Array<number | undefined>;
  /** Order-axis extent beyond which the drawing counts as overflowing. */
  limit?: number;
  /** Added to (or taken from) the default room of every band between two layers along the layer axis. */
  spread?: number;
  /** The bands cross the reading direction (the drawing is made for stages). */
  stages?: boolean;
  /** Let edges between two layers leave or enter through the side of a box (one bend instead of two). */
  elbows?: boolean;
  /** Edges (`from|to`) that join two nodes of the main flow in turn. */
  main?: ReadonlySet<string>;
}

const EPS = 1e-6;

/** Pixels: a port set at the centre of the other box keeps this far from its other ports (and from the corners of its own box, CORNER_CLEAR). */
const PORT_APART = 8;

/** Space kept free at the outer edge of the drawing: none in a terminal, where an empty cell is lost width. */
export const marginOf = (ruler: Ruler): number => (ruler.uniform ? 0 : gridUp(ruler, ruler.trackGap));

const tidy = (v: number): number => {
  const r = Math.round(v * 1e6) / 1e6;
  return r === 0 ? 0 : r;
};

interface Item {
  chain: number;
  kind: 'piece' | 'u' | 'loop';
  /** Ends: for a piece the upper and the lower node; for a U the left and the right node; a loop has the same node twice. */
  a: number;
  b: number;
  aSide: Side;
  bSide: Side;
  band: number;
  xa: number;
  xb: number;
  track: number;
}

interface End {
  item: Item;
  which: 'a' | 'b';
  node: number;
  side: Side;
  other: number;
}

const key = (n: number, side: Side): string => `${n}|${side}`;
const rk = (x: number): number => Math.round(x * 1000);

/** Picks `count` of the free ports, nearest to the centre and symmetric about it where possible. */
export function pickPorts(free: number[], count: number, centre: number): number[] {
  const byDistance = [...free].sort((x, y) => Math.abs(x - centre) - Math.abs(y - centre) || x - y);
  let pool = byDistance;
  const off = byDistance.filter((x) => Math.abs(x - centre) > EPS);
  if (count % 2 === 0 && off.length >= count) pool = off;
  return pool.slice(0, count).sort((x, y) => x - y);
}

interface Prepared {
  items: Item[];
  ends: End[];
  tracks: number[];
  nodeO: (n: number) => number;
  centre: (n: number) => number;
  len: (n: number) => number;
}

interface TrackSpec {
  order: number;
  lo: number;
  hi: number;
  top: number[];
  bot: number[];
}

/** Pairs of jogs whose spans touch and that collide on a shared column whichever way they are stacked. */
export function hardPairs(items: TrackSpec[]): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const clash = (a: TrackSpec, b: TrackSpec): boolean => a.bot.some((x) => b.top.some((t) => Math.abs(t - x) < EPS));
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i] as TrackSpec;
      const b = items[j] as TrackSpec;
      if (a.lo > b.hi + EPS || b.lo > a.hi + EPS) continue;
      if (clash(a, b) && clash(b, a)) out.push([i, j]);
    }
  }
  return out;
}

/** Track order of the items of one band: jogs whose spans touch are stacked in the order that crosses least. */
export function assignTracks(items: Array<{ order: number; lo: number; hi: number; top: number[]; bot: number[] }>): number[] {
  const n = items.length;
  const inside = (x: number, it: { lo: number; hi: number }): number => (x > it.lo + EPS && x < it.hi - EPS ? 1 : 0);
  const cost = (a: (typeof items)[number], b: (typeof items)[number]): number => {
    let c = 0;
    for (const x of a.bot) c += inside(x, b) + (b.top.some((t) => Math.abs(t - x) < EPS) ? 1000 : 0);
    for (const x of b.top) c += inside(x, a);
    return c;
  };
  const before: boolean[][] = items.map(() => items.map(() => false));
  const overlap: boolean[][] = items.map(() => items.map(() => false));
  // What it costs to stack the two the other way round.
  const loss: number[][] = items.map(() => items.map(() => 0));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = items[i] as (typeof items)[number];
      const b = items[j] as (typeof items)[number];
      if (a.lo > b.hi + EPS || b.lo > a.hi + EPS) continue;
      overlap[i]![j] = overlap[j]![i] = true;
      const ab = cost(a, b);
      const ba = cost(b, a);
      const first = ab < ba || (ab === ba && a.order <= b.order);
      before[i]![j] = first;
      before[j]![i] = !first;
      loss[i]![j] = loss[j]![i] = Math.abs(ab - ba);
    }
  }
  const done = new Array<boolean>(n).fill(false);
  const sequence: number[] = [];
  while (sequence.length < n) {
    let pick = -1;
    for (let i = 0; i < n; i++) {
      if (done[i]) continue;
      const ready = items.every((_, j) => done[j] || j === i || !overlap[i]![j] || !before[j]![i]);
      if (ready && (pick < 0 || (items[i] as { order: number }).order < (items[pick] as { order: number }).order)) pick = i;
    }
    if (pick < 0) {
      // A cycle of preferences: give up the cheapest ones.
      let least = Infinity;
      for (let i = 0; i < n; i++) {
        if (done[i]) continue;
        const price = items.reduce((sum, _, j) => sum + (!done[j] && j !== i && overlap[i]![j] && before[j]![i] ? (loss[i]![j] ?? 0) : 0), 0);
        if (price < least) {
          least = price;
          pick = i;
        }
      }
    }
    done[pick] = true;
    sequence.push(pick);
  }
  const track = new Array<number>(n).fill(0);
  const placed: number[] = [];
  for (const i of sequence) {
    let t = 0;
    for (const j of placed) if (overlap[i]![j]) t = Math.max(t, (track[j] ?? 0) + 1);
    track[i] = t;
    placed.push(i);
  }
  return track;
}

function prepare(f: Frame, l: Ladder, layers: number[][], start: number[], plan: Map<number, FlatPlan>): Prepared {
  const { ruler, unit, gap } = f;
  const margin = marginOf(ruler);
  const origin = margin + f.gutter + ruler.lanePad;
  // A drawing never starts further than its margin from the edge, whatever the placement before it left.
  const first = Math.min(...start);
  const real = (n: number): boolean => n < l.realCount;
  const slot = (n: number): number => boxLength(l.nodes[n]?.units ?? 2, unit, gap);
  const len = (n: number): number => {
    const own = real(n) ? f.bodyLen?.[n] : undefined;
    return own === undefined ? slot(n) : bodyLength(own, slot(n));
  };
  const nodeO = (n: number): number => origin + ((start[n] ?? 0) - (Number.isFinite(first) ? first : 0)) * unit + (slot(n) - len(n)) / 2;
  // Lines that share a gap are drawn a track gap apart, in layer order, around the middle of the gap.
  const shift = new Map<number, number>();
  for (const row of layers) {
    for (let k = 0; k < row.length; k++) {
      const n = row[k] as number;
      if (real(n) || shift.has(n)) continue;
      const group = [n];
      while (!real(row[k + group.length] ?? 0) && row[k + group.length] !== undefined && start[row[k + group.length] as number] === start[n]) group.push(row[k + group.length] as number);
      group.forEach((d, i) => shift.set(d, edgeNear(ruler, (i - (group.length - 1) / 2) * (ruler.uniform ? (ruler.linePitch ?? LINE_PITCH) : ruler.trackGap))));
    }
  }
  const centre = (n: number): number => nodeO(n) + (real(n) ? len(n) / 2 : boxLength(2, unit, gap) / 2 + (shift.get(n) ?? 0));
  const step = portStep(unit, ruler);
  const shapeOf = (n: number): NodeShape | undefined => f.graph.nodes[n]?.shape;
  const acrossOf = (n: number): number => f.layerExt[n] ?? 0;
  /** A port off the lattice may stand at `x` on `side` of box `n` only where the shape of the box has room for it. */
  const reaches = (n: number, side: Side, x: number): boolean =>
    Math.abs(x - (nodeO(n) + len(n) / 2)) <= faceReach(shapeOf(n), faceOf(side, f.td), len(n), acrossOf(n), ruler.uniform === true) + EPS;

  const items: Item[] = [];
  for (const [ci, c] of l.chains.entries()) {
    if (c.kind === 'span') {
      for (let k = 0; k + 1 < c.nodes.length; k++) {
        const p = c.nodes[k] as number;
        const q = c.nodes[k + 1] as number;
        const [a, b] = (l.nodes[p]?.layer ?? 0) < (l.nodes[q]?.layer ?? 0) ? [p, q] : [q, p];
        items.push({ chain: ci, kind: 'piece', a, b, aSide: 'down', bSide: 'up', band: l.nodes[b]?.layer ?? 0, xa: real(a) ? NaN : centre(a), xb: real(b) ? NaN : centre(b), track: -1 });
      }
    } else if (c.kind === 'loop') {
      const n = c.nodes[0] as number;
      items.push({ chain: ci, kind: 'loop', a: n, b: n, aSide: 'up', bSide: 'up', band: l.nodes[n]?.layer ?? 0, xa: NaN, xb: NaN, track: -1 });
    } else {
      const p = plan.get(ci);
      if (p?.mode !== 'u') continue;
      const [a, b] = c.reversed ? [c.nodes[1] as number, c.nodes[0] as number] : [c.nodes[0] as number, c.nodes[1] as number];
      const layer = l.nodes[a]?.layer ?? 0;
      items.push({ chain: ci, kind: 'u', a, b, aSide: p.side, bSide: p.side, band: p.side === 'down' ? layer + 1 : layer, xa: NaN, xb: NaN, track: -1 });
    }
  }
  const ends: End[] = [];
  for (const it of items) {
    if (real(it.a)) ends.push({ item: it, which: 'a', node: it.a, side: it.aSide, other: it.b });
    if (real(it.b)) ends.push({ item: it, which: 'b', node: it.b, side: it.bSide, other: it.a });
  }
  const taken = new Map<string, Set<number>>();
  const mark = (n: number, side: Side, x: number): void => {
    const k = key(n, side);
    const set = taken.get(k) ?? new Set<number>();
    set.add(rk(x));
    taken.set(k, set);
  };
  // Ports off the lattice (set at the centre of the box a straight edge comes from) keep the lattice ports within eight pixels away.
  const custom = new Map<string, number[]>();
  const free = (n: number, side: Side): number[] => {
    const set = taken.get(key(n, side));
    const near = custom.get(key(n, side)) ?? [];
    return faceOffsets(shapeOf(n), faceOf(side, f.td), len(n), acrossOf(n), step, sideCount.get(key(n, side)) ?? 0, ruler.uniform === true)
      .map((o) => nodeO(n) + o)
      .filter((x) => !set?.has(rk(x)) && !near.some((c) => Math.abs(c - x) < PORT_APART - EPS));
  };
  // A side that only one edge touches takes it at the centre; where the side has two cells at the centre, the left or upper one.
  const sideCount = new Map<string, number>();
  for (const e of ends) sideCount.set(key(e.node, e.side), (sideCount.get(key(e.node, e.side)) ?? 0) + 1);
  const single = (n: number, side: Side): boolean => sideCount.get(key(n, side)) === 1;
  const portCentre = (n: number): number => centre(n) - (ruler.uniform && len(n) % 2 === 0 ? 0.5 : 0);
  const setX = (it: Item, which: 'a' | 'b', x: number): void => {
    if (which === 'a') it.xa = x;
    else it.xb = x;
  };
  const done = (e: End): boolean => !Number.isNaN(e.which === 'a' ? e.item.xa : e.item.xb);

  // Pieces between two boxes that share a port go straight on it. In pixels a box with only this edge on its side has
  // it at the centre, so two such boxes go straight only when their centres agree; a box with several edges on its side
  // puts its port at the centre of the other box when that lies clear of its corners and of its other ports.
  for (const it of items) {
    if (it.kind !== 'piece' || !real(it.a) || !real(it.b) || ruler.uniform) continue;
    const sa = single(it.a, 'down');
    const sb = single(it.b, 'up');
    if (!sa && !sb) continue;
    const [one, many, manySide] = sa ? [it.a, it.b, 'up' as const] : [it.b, it.a, 'down' as const];
    let x: number | undefined;
    if (sa && sb) x = Math.abs(centre(it.a) - centre(it.b)) < EPS ? centre(it.a) : undefined;
    else {
      const c = centre(one);
      const near = [...(taken.get(key(many, manySide)) ?? [])].some((t) => Math.abs(t / 1000 - c) < PORT_APART - EPS);
      x = c >= nodeO(many) + CORNER_CLEAR - EPS && c <= nodeO(many) + len(many) - CORNER_CLEAR + EPS && !near && reaches(many, manySide, c) ? c : undefined;
      if (x !== undefined) custom.set(key(many, manySide), [...(custom.get(key(many, manySide)) ?? []), x]);
    }
    if (x === undefined) continue;
    it.xa = it.xb = x;
    mark(it.a, 'down', x);
    mark(it.b, 'up', x);
  }
  // Pixels: two or more pieces between the same two boxes stand a step apart, symmetric about the centre of the narrower box (of both centres' midpoint when the boxes are equally wide), when every port keeps clear of the corners and of the other ports of both boxes.
  if (!ruler.uniform) {
    const pairs = new Map<string, Item[]>();
    for (const it of items) {
      if (it.kind !== 'piece' || !real(it.a) || !real(it.b) || !Number.isNaN(it.xa)) continue;
      const k = `${it.a}|${it.b}`;
      pairs.set(k, [...(pairs.get(k) ?? []), it]);
    }
    for (const group of pairs.values()) {
      const first = group[0] as Item;
      if (group.length < 2) continue;
      const [a, b] = [first.a, first.b];
      const c = len(a) === len(b) ? (centre(a) + centre(b)) / 2 : centre(len(a) < len(b) ? a : b);
      const xs = group.map((_, i) => c + (i - (group.length - 1) / 2) * step);
      const clear = (n: number, side: Side): boolean =>
        xs.every(
          (x) =>
            x >= nodeO(n) + CORNER_CLEAR - EPS &&
            x <= nodeO(n) + len(n) - CORNER_CLEAR + EPS &&
            reaches(n, side, x) &&
            ![...(taken.get(key(n, side)) ?? [])].some((t) => Math.abs(t / 1000 - x) < PORT_APART - EPS),
        );
      if (!clear(a, 'down') || !clear(b, 'up')) continue;
      // The pieces take the places in the order the lattice would give them: the one nearest the midpoint of the two centres first.
      const mid = (centre(a) + centre(b)) / 2;
      const left = [...xs];
      group.forEach((it) => {
        left.sort((p, q) => Math.abs(p - mid) - Math.abs(q - mid) || p - q);
        const x = left.shift() as number;
        it.xa = it.xb = x;
        mark(a, 'down', x);
        mark(b, 'up', x);
        custom.set(key(a, 'down'), [...(custom.get(key(a, 'down')) ?? []), x]);
        custom.set(key(b, 'up'), [...(custom.get(key(b, 'up')) ?? []), x]);
      });
    }
  }
  for (const it of items) {
    if (it.kind !== 'piece' || !real(it.a) || !real(it.b) || !Number.isNaN(it.xa)) continue;
    if (!ruler.uniform && (single(it.a, 'down') || single(it.b, 'up'))) continue;
    const fb = free(it.b, 'up');
    // A terminal keeps boxes of one column centred: only two boxes with the same centre are joined by a straight line.
    if (ruler.uniform && Math.abs(centre(it.a) - centre(it.b)) > EPS) continue;
    const common = free(it.a, 'down').filter((x) => fb.some((y) => Math.abs(x - y) < EPS));
    const mid = (centre(it.a) + centre(it.b)) / 2;
    common.sort((x, y) => Math.abs(x - mid) - Math.abs(y - mid) || x - y);
    const x = common[0];
    if (x === undefined) continue;
    it.xa = it.xb = x;
    mark(it.a, 'down', x);
    mark(it.b, 'up', x);
  }
  // A piece whose other end is a dummy line takes that line when the box has a free port there.
  for (const e of ends) {
    if (done(e) || e.item.kind !== 'piece' || real(e.other) || single(e.node, e.side)) continue;
    const x = centre(e.other);
    if (free(e.node, e.side).some((p) => Math.abs(p - x) < EPS)) {
      setX(e.item, e.which, x);
      mark(e.node, e.side, x);
    }
  }
  // A loop takes two neighbouring free ports as near the centre as it can.
  for (const it of items) {
    if (it.kind !== 'loop') continue;
    const ports = free(it.a, 'up');
    let best: [number, number] | undefined;
    for (let k = 0; k + 1 < ports.length; k++) {
      const p = ports[k] as number;
      const q = ports[k + 1] as number;
      if (Math.abs(q - p - step) > EPS) continue;
      const d = Math.abs((p + q) / 2 - centre(it.a));
      if (!best || d < Math.abs((best[0] + best[1]) / 2 - centre(it.a)) - EPS) best = [p, q];
    }
    const [p, q] = best ?? [ports[0] ?? centre(it.a), ports[1] ?? centre(it.a)];
    it.xa = p;
    it.xb = q;
    mark(it.a, 'up', p);
    mark(it.a, 'up', q);
  }
  // On one side of a box every piece takes a port in the left-to-right order of the other end it leads to; the ports already fixed by straight pieces keep their place in that order.
  const groups = new Map<string, End[]>();
  for (const e of ends) groups.set(key(e.node, e.side), [...(groups.get(key(e.node, e.side)) ?? []), e]);
  const xOf = (e: End): number => (e.which === 'a' ? e.item.xa : e.item.xb);
  for (const group of groups.values()) {
    const first = group[0] as End;
    const loose = group.filter((e) => !done(e)).sort((x, y) => centre(x.other) - centre(y.other) || x.item.chain - y.item.chain);
    if (loose.length === 0) continue;
    const fixed = group.filter(done).map(xOf).sort((x, y) => x - y);
    const taken$ = new Set<number>();
    const assign = (list: End[], xs: number[]): void => {
      list.forEach((e, k) => {
        const x = xs[k] ?? xs[xs.length - 1] ?? centre(first.node);
        setX(e.item, e.which, x);
        taken$.add(rk(x));
        mark(first.node, first.side, x);
      });
    };
    if (group.length === 1) {
      assign(loose, [portCentre(first.node)]);
      continue;
    }
    if (fixed.length === 0) {
      assign(loose, pickPorts(free(first.node, first.side), loose.length, centre(first.node)));
      continue;
    }
    for (let seg = 0; seg <= fixed.length; seg++) {
      const members = loose.filter((e) => fixed.filter((fx) => fx < centre(e.other) - EPS).length === seg);
      if (members.length === 0) continue;
      const lo = seg === 0 ? -Infinity : (fixed[seg - 1] as number);
      const hi = seg === fixed.length ? Infinity : (fixed[seg] as number);
      const room = free(first.node, first.side).filter((x) => x > lo + EPS && x < hi - EPS);
      const near = seg === 0 ? room.slice(-members.length) : room.slice(0, members.length);
      const rest = free(first.node, first.side).filter((x) => !near.includes(x));
      assign(members, near.length === members.length ? near : [...near, ...rest].slice(0, members.length).sort((x, y) => x - y));
    }
  }

  // Tracks, band by band. Two jogs that swap places over the same two columns collide whichever way they are stacked; one of them then moves to another port.
  const tracks = new Array<number>(items.length).fill(-1);
  const bands = new Map<number, number[]>();
  items.forEach((it, i) => bands.set(it.band, [...(bands.get(it.band) ?? []), i]));
  const specsOf = (members: number[]): { horizontal: number[]; specs: TrackSpec[] } => {
    const horizontal = members.filter((i) => {
      const it = items[i] as Item;
      return it.kind !== 'piece' || Math.abs(it.xa - it.xb) > EPS;
    });
    const specs = horizontal.map((i) => {
      const it = items[i] as Item;
      const lo = Math.min(it.xa, it.xb);
      const hi = Math.max(it.xa, it.xb);
      const fromBottom = it.kind !== 'piece' && it.aSide === 'up';
      const top = it.kind === 'piece' ? [it.xa] : fromBottom ? [] : [it.xa, it.xb];
      const bot = it.kind === 'piece' ? [it.xb] : fromBottom ? [it.xa, it.xb] : [];
      return { order: i, lo, hi, top, bot };
    });
    return { horizontal, specs };
  };
  for (let round = 0; round < 3; round++) {
    let moved = false;
    for (const members of bands.values()) {
      const { specs } = specsOf(members);
      for (const [p, q] of hardPairs(specs)) {
        const pair = [items[specs[p]?.order ?? 0], items[specs[q]?.order ?? 0]];
        const candidates = ends.filter((e) => pair.includes(e.item) && Math.abs(e.item.xa - e.item.xb) > EPS && !single(e.node, e.side));
        for (const e of candidates) {
          const now = e.which === 'a' ? e.item.xa : e.item.xb;
          const others = free(e.node, e.side).filter((x) => Math.abs(x - now) > EPS).sort((x, y) => Math.abs(x - now) - Math.abs(y - now));
          const x = others[0];
          if (x === undefined) continue;
          taken.get(key(e.node, e.side))?.delete(rk(now));
          mark(e.node, e.side, x);
          setX(e.item, e.which, x);
          moved = true;
          break;
        }
      }
    }
    if (!moved) break;
  }
  for (const members of bands.values()) {
    const { horizontal, specs } = specsOf(members);
    const assigned = assignTracks(specs);
    horizontal.forEach((i, k) => {
      tracks[i] = assigned[k] ?? 0;
    });
  }
  items.forEach((it, i) => {
    it.track = tracks[i] ?? -1;
  });
  return { items, ends, tracks, nodeO, centre, len };
}

/**
 * Edges whose label stands on a stretch of line that shows too little of it: a line of `lineBeside` on the side away
 * from the arrowhead and eight more on the arrowhead side of a straight edge between neighbours, sixteen each side on
 * other stretches. A label beside a line, not on it, hides nothing.
 */
function tightLabels(edges: LayoutEdge[]): Diagnostic[] {
  const out: Diagnostic[] = [];
  for (const edge of edges) {
    const l = edge.label;
    if (!l) continue;
    const straight = edge.points.length === 2;
    for (let i = 1; i < edge.points.length; i++) {
      const a = edge.points[i - 1] as Point;
      const b = edge.points[i] as Point;
      if (Math.abs(a.y - b.y) > EPS || a.y < l.y - EPS || a.y > l.y + l.h + EPS) continue;
      const lo = Math.min(a.x, b.x);
      const hi = Math.max(a.x, b.x);
      if (l.x < lo - EPS || l.x + l.w > hi + EPS) continue;
      const toRight = b.x >= a.x;
      const last = i === edge.points.length - 1;
      const keep = straight ? lineBeside(edge.style) : lineBeside('normal');
      const [tail, head] = toRight ? [l.x - lo, hi - (l.x + l.w)] : [hi - (l.x + l.w), l.x - lo];
      if (tail < keep - 0.5 || head < keep + (last ? ARROW : 0) - 0.5) {
        out.push({ kind: 'label-tight', nodes: [edge.from, edge.to], message: `Label of ${edge.from} -> ${edge.to} leaves only ${Math.round(Math.min(tail, head))}px of line beside it.` });
        break;
      }
    }
  }
  return out;
}

interface Built {
  layout: Layout;
  failed: number[];
  /** Per failed label: the band along the layer axis that holds the place it wanted, or -1. */
  failedBand: number[];
}

function simplify(points: Point[]): Point[] {
  const dedup: Point[] = [];
  for (const p of points) {
    const last = dedup[dedup.length - 1];
    if (!last || Math.abs(last.x - p.x) > EPS || Math.abs(last.y - p.y) > EPS) dedup.push(p);
  }
  const out: Point[] = [];
  for (const p of dedup) {
    for (;;) {
      const a = out[out.length - 2];
      const b = out[out.length - 1];
      if (!a || !b) break;
      const collinear = (Math.abs(a.x - b.x) < EPS && Math.abs(b.x - p.x) < EPS) || (Math.abs(a.y - b.y) < EPS && Math.abs(b.y - p.y) < EPS);
      if (!collinear) break;
      out.pop();
    }
    out.push(p);
  }
  return out;
}

function build(f: Frame, l: Ladder, layers: number[][], start: number[], plan: Map<number, FlatPlan>, prep: Prepared, demand: number[]): Built {
  const { graph, ruler, td } = f;
  const { items, nodeO, len } = prep;
  const count = layers.length;
  const margin = marginOf(ruler);
  const laneCount = graph.lanes.length;

  const thick = layers.map((row) => Math.max(...row.filter((n) => n < l.realCount).map((n) => f.layerExt[n] ?? 0), 0));
  const trackCount = new Array<number>(count + 1).fill(0);
  for (const it of items) if (it.track >= 0) trackCount[it.band] = Math.max(trackCount[it.band] ?? 0, it.track + 1);

  // Bands: before layer 0, between layers, after the last layer.
  const laneRange = new Map<number, [number, number]>();
  l.layerLane.forEach((lane, i) => {
    const r = laneRange.get(lane);
    laneRange.set(lane, r ? [r[0], i] : [i, i]);
  });
  const bottomPad = new Array<number>(laneCount).fill(ruler.lanePad);
  const wanted = (b: number): number => {
    const tracks = trackCount[b] === 0 ? 0 : ((trackCount[b] ?? 0) + 1) * ruler.trackGap;
    // Beside the outermost bands there is no neighbour to share a label's room with.
    return b === 0 || b === count ? tracks + (demand[b] ?? 0) : Math.max(tracks, demand[b] ?? 0);
  };
  const baseExt = (b: number): number => {
    if (b === 0) return ruler.lanePad;
    if (b === count) return bottomPad[l.layerLane[count - 1] ?? 0] ?? ruler.lanePad;
    if (l.layerLane[b - 1] === l.layerLane[b]) return ruler.rowGap;
    // Lines that turn between two lanes run in the gap between the lane borders, clear of both.
    const between = (trackCount[b] ?? 0) === 0 ? ruler.laneGap : Math.max(ruler.laneGap, ((trackCount[b] ?? 0) + 1) * ruler.trackGap + ruler.nodeGrid);
    return (bottomPad[l.layerLane[b - 1] ?? 0] ?? ruler.lanePad) + between + ruler.lanePad;
  };
  // A terminal band holds the lane's name line (when the lane below has a name) and one line per track, and at least one line between two rows.
  const nameLine = (b: number): number => (b < count && (b === 0 || l.layerLane[b - 1] !== l.layerLane[b]) && (graph.lanes[l.layerLane[b] ?? 0]?.label ?? '') !== '' ? 1 : 0);
  const terminalExt = (b: number): number => {
    const tracks = trackCount[b] ?? 0;
    if (td) {
      // Columns of boxes: a gap holds the arrows of the edges that pass, and its jogs stand a blank column apart.
      if (b === 0 || b === count) return tracks === 0 ? 0 : 2 * tracks + 1 + (demand[b] ?? 0);
      const own = l.layerLane[b - 1] !== l.layerLane[b] ? (bottomPad[l.layerLane[b - 1] ?? 0] ?? 0) : 0;
      return Math.max(3, 2 * tracks + 1) + own + (demand[b] ?? 0);
    }
    const line = nameLine(b);
    const body = b > 0 && b < count && line === 0 ? Math.max(tracks, 1) : tracks;
    return line + body + (demand[b] ?? 0);
  };
  const ext = (b: number): number => (ruler.uniform ? terminalExt(b) : gridUp(ruler, Math.max(baseExt(b) + (b > 0 && b < count ? Math.max(f.spread ?? 0, 2 * ruler.trackGap - baseExt(b)) : 0), wanted(b))));
  if (td) {
    for (const [lane, [first, last]] of laneRange) {
      const label = graph.lanes[lane]?.label ?? '';
      if (label === '') continue;
      const need = gridUp(ruler, ruler.textWidth(label, 'lane') + 2 * ruler.laneLabelGap);
      let size = first === 0 ? ext(0) : ruler.lanePad;
      for (let i = first; i <= last; i++) size += (thick[i] ?? 0) + (i < last ? ext(i + 1) : 0);
      size += last + 1 === count ? ext(count) : (bottomPad[lane] ?? 0);
      if (size < need) bottomPad[lane] = (bottomPad[lane] ?? 0) + gridUp(ruler, need - size);
    }
  }
  const bandStart = new Array<number>(count + 1).fill(0);
  const layerStart = new Array<number>(count).fill(0);
  const bandSize = new Array<number>(count + 1).fill(0);
  let cursor = margin;
  for (let b = 0; b <= count; b++) {
    bandStart[b] = cursor;
    bandSize[b] = ext(b);
    cursor += bandSize[b] ?? 0;
    if (b < count) {
      layerStart[b] = cursor;
      cursor += thick[b] ?? 0;
    }
  }
  const totalL = cursor + margin;

  const order = (o: number, c: number): Point => (td ? { x: tidy(c), y: tidy(o) } : { x: tidy(o), y: tidy(c) });
  const trackY = (it: Item): number => {
    if (ruler.uniform) return (bandStart[it.band] ?? 0) + (td ? 1 + 2 * it.track : it.track);
    const n = trackCount[it.band] ?? 1;
    const first = (bandStart[it.band] ?? 0) + ((bandSize[it.band] ?? 0) - (n - 1) * ruler.trackGap) / 2;
    return edgeNear(ruler, first + it.track * ruler.trackGap);
  };
  const bound = (it: Item, side: Side): number => (side === 'down' ? (bandStart[it.band] ?? 0) : (bandStart[it.band] ?? 0) + (bandSize[it.band] ?? 0));
  // A box given from outside can make its layer thicker than the boxes beside it: those stand in the middle of the layer, as thick as they are.
  // Boxes divided into compartments are not stretched to the thickest box of their layer either: every box of such a layer is as thick as it is
  // and stands against the face the flow comes from, so that the heads of the boxes read as one line.
  const boxLayer = new Set<number>();
  const flush = new Set<number>();
  graph.nodes.forEach((n, i) => {
    if (i >= l.realCount) return;
    const layer = l.nodes[i]?.layer ?? 0;
    if (n.box !== undefined) boxLayer.add(layer);
    // Down the page, a plain box narrower than the widest box of its layer keeps its own width and stands in the middle.
    if (td && !ruler.uniform && n.box === undefined && n.compartments === undefined && (f.layerExt[i] ?? 0) < (thick[layer] ?? 0)) boxLayer.add(layer);
    if (n.compartments !== undefined && !ruler.uniform) {
      boxLayer.add(layer);
      flush.add(layer);
    }
  });
  const own = (i: number): { off: number; ext: number } => {
    const layer = l.nodes[i]?.layer ?? 0;
    const full = thick[layer] ?? 0;
    if (!boxLayer.has(layer) || i >= l.realCount) return { off: 0, ext: full };
    const ext = Math.min(full, f.layerExt[i] ?? full);
    if (flush.has(layer)) return { off: 0, ext };
    return { off: Math.floor((full - ext) / 2 / ruler.nodeGrid + 1e-9) * ruler.nodeGrid, ext };
  };
  /** Where the line of a node meets its face on `side`; `fallback` when the node fills its layer. */
  const faceAt = (n: number, side: Side, fallback: number): number => {
    const layer = l.nodes[n]?.layer ?? 0;
    if (!boxLayer.has(layer) || n >= l.realCount) return fallback;
    const { off, ext } = own(n);
    return (layerStart[layer] ?? 0) + off + (side === 'down' ? ext : 0);
  };

  const nodes: LayoutNode[] = graph.nodes.map((n, i) => {
    const ln = l.nodes[i] as { layer: number; units: number };
    const o = nodeO(i);
    const mine = own(i);
    const c = (layerStart[ln.layer] ?? 0) + mine.off;
    const [x, y, w, h] = td ? [c, o, mine.ext, len(i)] : [o, c, len(i), mine.ext];
    return withOutline({
      id: n.id,
      lane: n.lane,
      rank: Math.floor((start[i] ?? 0) / 2),
      span: ln.units / 2,
      row: l.layerRow[ln.layer] ?? 0,
      x: tidy(x),
      y: tidy(y),
      w: tidy(w),
      h: tidy(h),
      title: n.title,
      lines: n.lines,
      shape: n.shape,
      ...(n.compartments === undefined ? {} : { compartments: f.compartments?.get(i) ?? n.compartments }),
    }, ruler, f.measured?.[i] ?? 0);
  });
  const rects: Rect[] = nodes.map(({ x, y, w, h }) => ({ x, y, w, h }));

  const byChain = new Map<number, Item[]>();
  for (const it of items) byChain.set(it.chain, [...(byChain.get(it.chain) ?? []), it]);
  const edges: LayoutEdge[] = [];
  const raw: Point[][] = [];
  l.chains.forEach((c, ci) => {
    const e = graph.edges[c.edge];
    if (!e) return;
    const mine = byChain.get(ci) ?? [];
    const pts: Point[] = [];
    if (c.kind === 'span') {
      mine.forEach((it, k) => {
        const p = c.nodes[k] as number;
        const upperFirst = it.a === p;
        const top = bandStart[it.band] ?? 0;
        const bottom = top + (bandSize[it.band] ?? 0);
        const seg: Point[] = [order(it.xa, faceAt(it.a, 'down', top))];
        if (it.track >= 0) seg.push(order(it.xa, trackY(it)), order(it.xb, trackY(it)));
        seg.push(order(it.xb, faceAt(it.b, 'up', bottom)));
        pts.push(...(upperFirst ? seg : seg.reverse()));
      });
    } else if (c.kind === 'flat') {
      const p = plan.get(ci);
      const [lo, hi] = c.reversed ? [c.nodes[1] as number, c.nodes[0] as number] : [c.nodes[0] as number, c.nodes[1] as number];
      if (p?.mode === 'straight') {
        const layer = l.nodes[lo]?.layer ?? 0;
        const h = thick[layer] ?? 0;
        // A terminal box with two middle lines takes a lone edge on the upper one.
        let at = (layerStart[layer] ?? 0) + (ruler.uniform && p.slot === 0 ? (h - (h % 2 === 0 ? 1 : 0)) / 2 : h * (sideFractions(ruler.sidePorts)[p.slot] ?? 0.5));
        if (!ruler.uniform && boxLayer.has(layer)) {
          // Both boxes meet the line: it runs through the part of the layer that both of them cover.
          const [u, v] = [own(lo), own(hi)];
          const from = Math.max(u.off, v.off);
          const to = Math.min(u.off + u.ext, v.off + v.ext);
          at = (layerStart[layer] ?? 0) + from + (to - from) * (sideFractions(ruler.sidePorts)[p.slot] ?? 0.5);
        }
        pts.push(order(nodeO(lo) + len(lo), at), order(nodeO(hi), at));
      } else {
        const it = mine[0];
        if (it) {
          const edge = bound(it, it.aSide);
          pts.push(order(it.xa, faceAt(it.a, it.aSide, edge)), order(it.xa, trackY(it)), order(it.xb, trackY(it)), order(it.xb, faceAt(it.b, it.bSide, edge)));
        }
      }
      if (c.reversed) pts.reverse();
    } else {
      const it = mine[0];
      if (it) {
        const edge = bound(it, 'up');
        pts.push(order(it.xa, faceAt(it.a, 'up', edge)), order(it.xa, trackY(it)), order(it.xb, trackY(it)), order(it.xb, faceAt(it.b, 'up', edge)));
      }
    }
    raw.push(pts);
    edges.push({ from: e.from, to: e.to, style: e.style, ...endFields(e), points: simplify(pts), ...(f.main?.has(`${e.from}|${e.to}`) ? { main: true as const } : {}) });
  });

  if (f.elbows) useElbows(edges, nodes, ruler, td, { stages: f.stages === true, td, order: new Map(graph.lanes.map((lane, i) => [lane.id, i] as const)) });

  const vertices = settleVertices(edges, nodes, ruler, portStep(f.unit, ruler));

  // Labels. A terminal label never starts before the first cell.
  const obstacles: Rect[] = ruler.uniform ? [...rects, td ? { x: -1000, y: -1000, w: 3000, h: 1000 } : { x: -1000, y: -1000, w: 1000, h: 3000 }] : rects;
  const diagnostics: Diagnostic[] = [];
  const placed: Rect[] = [];
  const failed: number[] = [];
  const failedBand: number[] = [];
  const segs = (points: Point[]): Segment[] => points.slice(1).map((q, i) => [points[i] as Point, q] as Segment);
  edges.forEach((edge, ei) => {
    const c = l.chains[ei];
    const text = graph.edges[c?.edge ?? -1]?.label;
    if (!c || text === undefined || text === '') return;
    // Pixels: a label on a straight edge between neighbours may be wrapped onto two lines when that saves room.
    const straightFlat = !ruler.uniform && !td && c.kind === 'flat' && plan.get(ei)?.mode === 'straight';
    const lines = straightFlat ? labelLines(text, edge.style, ruler, f.gap, f.unit) : [text];
    const size: LabelSize = ruler.uniform ? labelSize(text, ruler) : labelBox(lines, ruler);
    const foreign = edges.flatMap((o, k) => (k === ei ? [] : segs(o.points)));
    let mine = segs(edge.points).sort((p, q) => Math.hypot(q[1].x - q[0].x, q[1].y - q[0].y) - Math.hypot(p[1].x - p[0].x, p[1].y - p[0].y));
    // Pixels: a label on a stretch of line that cannot keep a line visible on both sides moves to a longer stretch.
    // A stretch that is still too short holds the label beside the line rather than on it.
    const roomy = (s: Segment): boolean => ruler.uniform || Math.abs(s[1].x - s[0].x) + Math.abs(s[1].y - s[0].y) >= (s[0].y === s[1].y ? size.w : size.h) + 2 * lineBeside(edge.style) + ARROW;
    if (!ruler.uniform) mine = [...mine.filter(roomy), ...mine.filter((s) => !roomy(s))];
    let best: ReturnType<typeof placeLabel> | undefined;
    for (const s of mine) {
      const got = placeLabel(s, size, obstacles, placed, ruler, foreign, !roomy(s));
      best ??= got;
      if (!got.overlap) {
        best = got;
        break;
      }
    }
    // In a terminal a label may stand over the line of another edge (it hides one cell of it) when no free place exists;
    // more lines in a band cannot make room that lines running through it have taken.
    if (ruler.uniform && best?.overlap) {
      for (const s of mine) {
        const got = placeLabel(s, size, obstacles, placed, ruler, []);
        const [from, to] = td ? [got.rect.x, got.rect.x + got.rect.w] : [got.rect.y, got.rect.y + got.rect.h];
        if (!got.overlap && from >= 0 && to <= totalL + EPS && (td ? got.rect.y : got.rect.x) >= 0) {
          best = got;
          break;
        }
      }
    }
    if (!best) return;
    placed.push(best.rect);
    // On a straight edge between neighbours the arrowhead takes eight pixels of the room: the label sits that much nearer the tail.
    let labelX = best.rect.x;
    if (straightFlat && edge.points.length === 2) {
      const [a, z] = edge.points as [Point, Point];
      labelX = edgeNear(ruler, labelX - (z.x >= a.x ? ARROW : -ARROW) / 2);
    }
    edge.label = { text, x: tidy(labelX), y: tidy(best.rect.y), w: size.w, h: size.h, ...(lines.length > 1 ? { lines } : {}) };
    if (best.overlap) {
      failed.push(ei);
      const centre = td ? best.rect.x + best.rect.w / 2 : best.rect.y + best.rect.h / 2;
      failedBand.push(bandStart.findIndex((b, i) => centre >= b - EPS && centre < b + (bandSize[i] ?? 0) - EPS));
      diagnostics.push({ kind: 'label-overlap', nodes: [edge.from, edge.to], message: `Label of ${edge.from} -> ${edge.to} overlaps a node, another label or another edge.` });
    }
  });

  if (!ruler.uniform) diagnostics.push(...tightLabels(edges), ...offCentreEnds({ nodes, edges }));
  diagnostics.push(...crossings(edges), ...vertices.diagnostics);
  // Shapes of a fixed size shrink to their own boxes; the small texts at the ends of lines then find their places.
  const drawn = settleBodies(nodes, edges, td, ruler);
  if (graph.edges.some((e) => e.startLabel !== undefined || e.endLabel !== undefined)) {
    diagnostics.push(...placeEndLabels(edges, l.chains.map((c) => graph.edges[c.edge]).map((e) => (e === undefined ? undefined : { start: e.startLabel, end: e.endLabel })), drawn, ruler));
  }
  // A label beside a line near the end of the order axis may reach past the lane padding: the canvas grows to hold it.
  const labelEnd = Math.max(0, ...edges.map((e) => (e.label ? (td ? e.label.y + e.label.h : e.label.x + e.label.w) : 0)));
  const totalO = Math.max(prepWidth(f, l, start, nodeO, prep.centre), gridUp(ruler, labelEnd) + margin);
  const lanes: LayoutLane[] = [];
  graph.lanes.forEach((lane, k) => {
    const range = laneRange.get(k);
    if (!range) return;
    const [first, last] = range;
    const top = first === 0 ? margin : (bandStart[first] ?? 0) + (bandSize[first] ?? 0) - ruler.lanePad;
    const bottom = last + 1 === count ? (bandStart[count] ?? 0) + (bandSize[count] ?? 0) : (bandStart[last + 1] ?? 0) + (bottomPad[k] ?? 0);
    const labelW = ruler.textWidth(lane.label, 'lane');
    const labelH = ruler.lineHeight('lane');
    const contentO = totalO - margin;
    if (ruler.uniform && td) {
      // Stages: no border; the name stands on the first line of the band, a blank line below it.
      lanes.push({ id: lane.id, label: lane.label, x: tidy(top), y: tidy(margin), w: tidy(bottom - top), h: tidy(contentO - margin), labelBox: { x: tidy(top), y: tidy(margin), w: labelW, h: labelH }, bare: true });
      return;
    }
    if (ruler.uniform && !td) {
      // A terminal lane is one line of its own: `── name ───` in the last line of the band above its first layer.
      const lineRow = (bandStart[first] ?? 0) + (bandSize[first] ?? 0) - 1;
      lanes.push({ id: lane.id, label: lane.label, x: tidy(margin), y: tidy(lineRow), w: tidy(contentO - margin), h: tidy(bottom - lineRow), labelBox: { x: tidy(margin + 3), y: tidy(lineRow), w: labelW, h: labelH }, bare: true });
      return;
    }
    lanes.push(
      td
        ? { id: lane.id, label: lane.label, x: tidy(top), y: tidy(margin), w: tidy(bottom - top), h: tidy(contentO - margin), labelBox: { x: tidy(top + ruler.laneLabelGap), y: tidy(margin + ruler.laneLabelGap), w: labelW, h: labelH } }
        : { id: lane.id, label: lane.label, x: tidy(margin), y: tidy(top), w: tidy(contentO - margin), h: tidy(bottom - top), labelBox: { x: tidy(margin + ruler.laneLabelGap), y: tidy(layerStart[first] ?? top), w: labelW, h: labelH } },
    );
  });
  const whole = (v: number): number => (ruler.uniform ? Math.ceil(v - EPS) : v);
  const [width, height] = td ? [whole(totalL), whole(totalO)] : [whole(totalO), whole(totalL)];
  const layout: Layout = { pitch: 2 * f.unit, width: tidy(width), height: tidy(height), direction: graph.direction, laneAxis: 'across', lanes, nodes: drawn, edges, diagnostics };
  void raw;
  return { layout, failed: failed.map((ei) => ei), failedBand };
}

/** Order-axis size of the drawing: the furthest box or dummy line, the lane padding and the margin. */
function prepWidth(f: Frame, l: Ladder, start: number[], nodeO: (n: number) => number, centre: (n: number) => number): number {
  const margin = marginOf(f.ruler);
  let end = 0;
  for (const n of l.nodes) {
    const right = n.idx < l.realCount ? nodeO(n.idx) + boxLength(n.units, f.unit, f.gap) : centre(n.idx);
    end = Math.max(end, right);
  }
  void start;
  return end + f.ruler.lanePad + margin;
}

/**
 * Stage 5: coordinates, ports and routes. No path search: every edge is a vertical, a jog on a track of the
 * band it crosses, a straight segment between neighbours, or a U through the band above or below its layer.
 */
export function routeOld(given: Frame, l: Ladder, layers: number[][], start: number[], plan: Map<number, FlatPlan>): Layout {
  const f = evenRecords(given, l, start);
  const prep = prepare(f, l, layers, start, plan);
  const demand = new Array<number>(layers.length + 1).fill(0);
  const { ruler, td } = f;
  const need = (text: string): number => {
    const s = labelSize(text, ruler);
    return (td ? s.w : s.h) + 2 * ruler.trackGap;
  };
  const across = (text: string, style: LayoutEdge['style']): number => {
    const s = labelSize(text, ruler);
    return (td ? s.w : s.h) + 2 * lineBeside(style) + 2 * ARROW;
  };
  const named = f.graph.lanes.some((lane) => lane.label !== '');
  l.chains.forEach((c, ci) => {
    const e = f.graph.edges[c.edge];
    const text = e?.label;
    if (e === undefined || text === undefined || text === '') return;
    const first = prep.items.find((it) => it.chain === ci);
    const straight = first?.kind === 'piece' && first.track < 0 && first.xa === first.xb;
    // Between two named lanes the label stands inside one of them: the gap between the lanes and the room the label keeps off both borders come on top.
    const lanes = first !== undefined && named && l.layerLane[first.band - 1] !== l.layerLane[first.band] ? ruler.nodeGrid + 2 * (BORDER_CLEAR + SLIDE) : 0;
    if (first && !ruler.uniform) demand[first.band] = Math.max(demand[first.band] ?? 0, straight ? across(text, e.style) + lanes : need(text));
  });
  let built = build(f, l, layers, start, plan, prep, demand);
  if (ruler.uniform) {
    // Labels never widen a band by themselves: a band grows by one line, once per round, only where a label found no room.
    for (let round = 0; round < 8 && built.failedBand.some((b) => b >= 0); round++) {
      for (const b of new Set(built.failedBand)) if (b >= 0) demand[b] = (demand[b] ?? 0) + 1;
      built = build(f, l, layers, start, plan, prep, demand);
    }
    return built.layout;
  }
  for (let round = 0; round < 3 && built.failed.length > 0; round++) {
    for (const ei of built.failed) {
      const c = l.chains[ei];
      const text = f.graph.edges[c?.edge ?? -1]?.label;
      if (!c || text === undefined) continue;
      for (const it of prep.items) if (it.chain === ei) demand[it.band] = Math.max(demand[it.band] ?? 0, need(text));
    }
    built = build(f, l, layers, start, plan, prep, demand);
  }
  return built.layout;
}
