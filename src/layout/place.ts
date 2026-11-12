import type { Graph, NodeShape } from '../types.ts';
import type { Ruler } from '../metrics.ts';
import { diamondHeight, diamondWidth, hasOutline } from './diamond.ts';
import { isFixedShape, ownSize } from './records.ts';
import type { Compartment } from '../types.ts';

/**
 * Everything here is "abstract": f is the flow axis (x for LR, y for TD) and c is
 * the cross axis. Physical coordinates appear only at the very end of layout().
 */

export type Side = 'fL' | 'fH' | 'cL' | 'cH';

export interface Slot {
  id: string;
  lane: number;
  rank: number;
  /** Number of consecutive slot units the node covers (2 unless the node is wider than the shared width). */
  span: number;
  /** Row inside the lane. */
  row: number;
  /** Row ordinal across all lanes. */
  cRow: number;
  /** Index of the cross-axis channel just before this row. */
  cb: number;
  /** Extent along the flow axis. */
  nf: number;
  /** Extent along the cross axis. */
  nc: number;
  title: string;
  lines: string[];
  shape: NodeShape;
}

export interface LaneInfo {
  id: string;
  label: string;
  rows: number;
  /** Index of the lane's first cross-axis channel; it owns rows + 1 channels. */
  base: number;
}

export interface Topology {
  slots: Slot[];
  byId: Map<string, Slot>;
  lanes: LaneInfo[];
  ranks: number;
  channels: number;
}

export interface Skeleton extends Topology {
  td: boolean;
  /** Flow-axis size of one slot unit: half of a box extent plus one rank gap. */
  unit: number;
  /** Clear distance between two boxes that touch in slot units. */
  gap: number;
  rowExt: number[][];
  gutter: number;
  margin: number;
  laneGap: number;
  baseWf: number[];
  baseWc: number[];
  minBand: number[];
  /** Space at the start of a channel (keyed `f<idx>` or `c<idx>`) that tracks keep clear, e.g. for a lane label. */
  inset?: ReadonlyMap<string, number>;
}

export interface Geo {
  wf: number[];
  wc: number[];
  fStart: number[];
  fC: number[];
  cStart: number[];
  cC: number[];
  rankStart: number[];
  rowStart: number[][];
  bandStart: number[];
  bandExt: number[];
  totalF: number;
  totalC: number;
  inset?: ReadonlyMap<string, number>;
}

export function buildTopology(
  graph: Graph,
  rank: Map<string, number>,
  row: Map<string, number>,
  span: Map<string, number> = new Map(),
): Topology {
  const lanes: LaneInfo[] = [];
  let base = 0;
  let firstRow = 0;
  const rowStartOfLane: number[] = [];
  for (const lane of graph.lanes) {
    const ids = graph.nodes.filter((n) => n.lane === lane.id);
    const rows = Math.max(1, ...ids.map((n) => (row.get(n.id) ?? 0) + 1));
    lanes.push({ id: lane.id, label: lane.label, rows, base });
    rowStartOfLane.push(firstRow);
    base += rows + 1;
    firstRow += rows;
  }
  const slots: Slot[] = graph.nodes.map((n) => {
    const lane = Math.max(0, graph.lanes.findIndex((l) => l.id === n.lane));
    const r = row.get(n.id) ?? 0;
    return {
      id: n.id,
      lane,
      rank: rank.get(n.id) ?? 0,
      span: span.get(n.id) ?? 2,
      row: r,
      cRow: (rowStartOfLane[lane] ?? 0) + r,
      cb: (lanes[lane]?.base ?? 0) + r,
      nf: 0,
      nc: 0,
      title: n.title,
      lines: n.lines,
      shape: n.shape,
    };
  });
  const ranks = slots.length === 0 ? 0 : Math.max(...slots.map((s) => s.rank + s.span));
  return { slots, byId: new Map(slots.map((s) => [s.id, s] as const)), lanes, ranks, channels: base };
}

export interface Need {
  /** Required extent along f (from sides on the cross axis). */
  nf: number;
  /** Required extent along c (from sides on the flow axis). */
  nc: number;
}

/** Rounds a size up to the ruler's node grid. */
export const gridUp = (ruler: Ruler, v: number): number => Math.ceil(v / ruler.nodeGrid - 1e-9) * ruler.nodeGrid;

/** Rounds a position to the nearest multiple of the ruler's node grid. */
export const gridNear = (ruler: Ruler, v: number): number => Math.round(v / ruler.nodeGrid) * ruler.nodeGrid;

/** Rounds a coordinate of an edge or label to the nearest multiple of the ruler's edge grid. */
export const edgeNear = (ruler: Ruler, v: number): number => Math.round(v / ruler.edgeGrid) * ruler.edgeGrid;

export interface Measure {
  /** Content-sized box extents, snapped up to the width step and the grid. */
  w: number[];
  h: number[];
  /** Box width shared by every box that fits it: the smallest width that fits 75 % of the boxes. */
  common: number;
  contentH: number;
  /** Flow-axis size of one slot unit: half of the shared box extent along the flow axis plus half a rank gap. */
  unit: number;
  /** Space the lane labels take along the flow axis. */
  gutter: number;
}

/** Sizes that depend on the text alone, never on where a node is placed. */
export function measureNodes(
  nodes: ReadonlyArray<{ title: string; lines: string[]; shape?: NodeShape | undefined; compartments?: readonly Compartment[] | undefined }>,
  lanes: ReadonlyArray<{ label: string }>,
  ruler: Ruler,
  td: boolean,
): Measure {
  const border = ruler.nodeBorder;
  const snapW = (v: number): number =>
    gridUp(ruler, ruler.snap(Math.ceil(v / ruler.widthStep - 1e-9) * ruler.widthStep));
  // Half of the column pitch is the slot unit; it has to be a whole number of node grid steps.
  // Boxes half a step apart still have to overlap, so a box is wider than a gap.
  const fit = (v: number, minimum = ruler.nodeGrid): number => {
    let r = Math.max(gridUp(ruler, v), minimum);
    while (((r + ruler.rankGap) / 2) % ruler.nodeGrid > 1e-9) r += ruler.nodeGrid;
    return r;
  };
  // Boxes with compartments and the shapes of a fixed size ask for sizes of their own.
  const own = nodes.map((s) => ownSize(s, td, ruler));
  const heights = nodes.map(
    (s, i) => own[i]?.h ?? ruler.lineHeight('title') + s.lines.length * ruler.lineHeight('line') + 2 * ruler.nodePadY + 2 * border,
  );
  // The common height is set by the boxes that fill their slot; a shape of a fixed size does not raise it.
  const sets = heights.filter((_, i) => !isFixedShape(nodes[i]?.shape) || ruler.terminal === true);
  const tallest = Math.max(0, ...(sets.length > 0 ? sets : heights));
  const contentH = td ? fit(tallest) : gridUp(ruler, tallest);
  // A diamond is measured by its outline, which stands out eight pixels above and below the box height.
  const content = nodes.map((s, i) => {
    const texts = [ruler.textWidth(s.title, 'title'), ...s.lines.map((l) => ruler.textWidth(l, 'line'))];
    return {
      w: own[i]?.w ?? (hasOutline(s.shape, ruler) ? diamondWidth(ruler, s, diamondHeight(contentH)) : Math.max(...texts) + 2 * ruler.nodePadX + 2 * border),
      h: heights[i] as number,
    };
  });
  const w = content.map((c) => snapW(c.w));
  const sorted = [...w].sort((a, b) => a - b);
  // The common width: the widest box in a terminal drawing; with `commonWithin`, the widest that is not an outlier; otherwise the width three quarters of the boxes fit. Wider boxes take two places.
  const middle = sorted[Math.floor((sorted.length - 1) / 2)] ?? 0;
  const within = ruler.commonWithin;
  const pick = ruler.uniform
    ? (sorted[sorted.length - 1] ?? 0)
    : within !== undefined
      ? (sorted.filter((v) => v <= within * middle).pop() ?? 0)
      : (sorted[Math.max(0, Math.ceil(0.75 * sorted.length) - 1)] ?? 0);
  const common = td ? gridUp(ruler, pick) : fit(pick, 5 * ruler.nodeGrid);
  if (ruler.uniform) {
    return { w: w.map(() => common), h: td ? content.map(() => contentH) : content.map((c) => gridUp(ruler, c.h)), common, contentH, unit: ((td ? contentH : common) + ruler.rankGap) / 2, gutter: td && lanes.some((l) => l.label !== '') ? 2 : 0 };
  }
  const labelled = lanes.some((l) => l.label !== '');
  const labelWidths = lanes.map((l) => ruler.textWidth(l.label, 'lane'));
  const gutter = !labelled
    ? 0
    : gridUp(ruler, 2 * ruler.laneLabelGap + (td ? ruler.lineHeight('lane') : Math.max(0, ...labelWidths)));
  return { w, h: content.map((c, i) => (!td && own[i] !== undefined ? c.h : contentH)), common, contentH, unit: ((td ? contentH : common) + ruler.rankGap) / 2, gutter };
}

export function sizeSlots(topo: Topology, ruler: Ruler, direction: 'LR' | 'TD', needs: Map<string, Need>): Skeleton {
  const td = direction === 'TD';
  const m = measureNodes(topo.slots, topo.lanes, ruler, td);
  const snapW = (v: number): number =>
    gridUp(ruler, ruler.snap(Math.ceil(v / ruler.widthStep - 1e-9) * ruler.widthStep));
  const need = (s: Slot): Need => needs.get(s.id) ?? { nf: 0, nc: 0 };
  const needW = (s: Slot): number => (td ? need(s).nc : need(s).nf);
  const needH = (s: Slot): number => (td ? need(s).nf : need(s).nc);
  const { common, contentH, unit } = m;
  const gap = ruler.rankGap;
  // A box covers `span` slot units: its extent along the flow axis is whole units less one gap.
  const slots = topo.slots.map((s, i) => {
    const lattice = s.span * unit - gap;
    // Along the flow axis a box that needs more room grows by whole slot units, which also adds ports.
    const grown = (need: number): number => lattice + Math.max(0, Math.ceil((need - lattice) / unit - 1e-9)) * unit;
    const w = snapW(td ? Math.max(m.w[i] ?? 0, common, needW(s)) : grown(Math.max(needW(s), lattice)));
    const h = gridUp(ruler, td ? grown(Math.max(needH(s), lattice)) : Math.max(contentH, needH(s)));
    const [nf, nc] = td ? [h, w] : [w, h];
    return { ...s, nf, nc };
  });

  const rowExt = topo.lanes.map((lane, l) =>
    Array.from({ length: lane.rows }, (_, i) =>
      Math.max(0, ...slots.filter((s) => s.lane === l && s.row === i).map((s) => s.nc)),
    ),
  );

  const { gutter } = m;
  const labelWidths = topo.lanes.map((l) => ruler.textWidth(l.label, 'lane'));
  const minBand = topo.lanes.map((l, i) =>
    td && l.label !== '' ? gridUp(ruler, (labelWidths[i] ?? 0) + 2 * ruler.laneLabelGap) : 0,
  );

  const baseWf = Array.from({ length: topo.ranks + 1 }, (_, a) =>
    a === 0 || a === topo.ranks ? ruler.lanePad : gap,
  );
  // A box that needs more than its units gives pushes the following column away instead of overlapping it.
  // The box overhangs the start of the channel after it: tracks of that channel keep clear of the overhang.
  const inset = new Map<string, number>();
  for (const s of slots) {
    const end = s.rank + s.span;
    const excess = s.nf - (s.span * unit - gap);
    if (excess > 0 && end < topo.ranks) {
      baseWf[end] = Math.max(baseWf[end] ?? 0, gap + gridUp(ruler, excess));
      inset.set(`f${end}`, Math.max(inset.get(`f${end}`) ?? 0, gridUp(ruler, excess)));
    }
  }
  const baseWc: number[] = [];
  for (const lane of topo.lanes) {
    for (let k = 0; k <= lane.rows; k++) baseWc.push(k === 0 || k === lane.rows ? ruler.lanePad : ruler.rowGap);
  }

  return {
    ...topo,
    slots,
    byId: new Map(slots.map((s) => [s.id, s] as const)),
    td,
    unit,
    gap,
    rowExt,
    gutter,
    margin: gridUp(ruler, ruler.trackGap),
    laneGap: gridUp(ruler, ruler.laneGap),
    baseWf,
    baseWc,
    minBand,
    ...(inset.size > 0 ? { inset } : {}),
  };
}

/** Widens the last channel of a lane whose band is narrower than its label (TD only). */
export function fitLaneLabels(sk: Skeleton, wc: number[]): number[] {
  const out = [...wc];
  sk.lanes.forEach((lane, l) => {
    const rows = sk.rowExt[l] ?? [];
    let sum = rows.reduce((a, b) => a + b, 0);
    for (let k = 0; k <= lane.rows; k++) sum += out[lane.base + k] ?? 0;
    const missing = (sk.minBand[l] ?? 0) - sum;
    if (missing > 0) out[lane.base + lane.rows] = (out[lane.base + lane.rows] ?? 0) + missing;
  });
  return out;
}

export function geometry(sk: Skeleton, wf: number[], wc: number[]): Geo {
  const cStart = new Array<number>(sk.channels).fill(0);
  const rowStart = sk.lanes.map((l) => new Array<number>(l.rows).fill(0));
  const bandStart: number[] = [];
  const bandExt: number[] = [];
  let c = sk.margin;
  sk.lanes.forEach((lane, l) => {
    bandStart.push(c);
    for (let k = 0; k <= lane.rows; k++) {
      cStart[lane.base + k] = c;
      c += wc[lane.base + k] ?? 0;
      if (k < lane.rows) {
        const r = rowStart[l];
        if (r) r[k] = c;
        c += sk.rowExt[l]?.[k] ?? 0;
      }
    }
    bandExt.push(c - (bandStart[l] ?? 0));
    if (l < sk.lanes.length - 1) c += sk.laneGap;
  });
  const totalC = c + sk.margin;

  // Channel a sits just before slot unit a; a unit column starts where the channel before it ends.
  // Channels wider than a rank gap push every later unit away.
  const fStart = new Array<number>(sk.ranks + 1).fill(0);
  const rankStart = new Array<number>(sk.ranks).fill(0);
  fStart[0] = sk.margin + sk.gutter;
  if (sk.ranks > 0) rankStart[0] = fStart[0] + (wf[0] ?? 0);
  for (let a = 1; a < sk.ranks; a++) {
    rankStart[a] = (rankStart[a - 1] ?? 0) + sk.unit + ((wf[a] ?? 0) - sk.gap);
    fStart[a] = (rankStart[a] ?? 0) - (wf[a] ?? 0);
  }
  let end = sk.ranks > 0 ? (rankStart[sk.ranks - 1] ?? 0) + sk.unit - sk.gap : fStart[0];
  for (const s of sk.slots) end = Math.max(end, (rankStart[s.rank] ?? 0) + s.nf);
  fStart[sk.ranks] = end;
  const totalF = end + (wf[sk.ranks] ?? 0) + sk.margin;

  return {
    wf,
    wc,
    fStart,
    fC: fStart.map((s, a) => s + (wf[a] ?? 0) / 2),
    cStart,
    cC: cStart.map((s, b) => s + (wc[b] ?? 0) / 2),
    rankStart,
    rowStart,
    bandStart,
    bandExt,
    totalF,
    totalC,
    ...(sk.inset ? { inset: sk.inset } : {}),
  };
}

/** Extent along the flow axis of a node: whole slot units less one gap, or more when its sides need the room. */
export function finalNf(_sk: Skeleton, _geo: Geo, s: Slot): number {
  return s.nf;
}

/** Abstract top-left corner (f, c) of a node: at the start of its first slot unit, centred in its row. */
export function origin(sk: Skeleton, geo: Geo, ruler: Ruler, s: Slot): { f0: number; c0: number } {
  const rowExt = sk.rowExt[s.lane]?.[s.row] ?? 0;
  return {
    f0: geo.rankStart[s.rank] ?? 0,
    c0: (geo.rowStart[s.lane]?.[s.row] ?? 0) + gridNear(ruler, (rowExt - s.nc) / 2),
  };
}
