import type { Graph } from '../types.ts';
import type { Ruler } from '../metrics.ts';

/**
 * Everything here is "abstract": f is the flow axis (x for LR, y for TD) and c is
 * the cross axis. Physical coordinates appear only at the very end of layout().
 */

export type Side = 'fL' | 'fH' | 'cL' | 'cH';

export interface Slot {
  id: string;
  lane: number;
  rank: number;
  /** Number of consecutive rank columns the node covers (1 unless the node is wider than the shared width). */
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

/** Where boxes slid along the flow axis and which perpendicular edges run as one straight line. */
export interface Alignment {
  /** Shift of a box along the flow axis from the centre of its slot. */
  slide: Map<string, number>;
  /** Flow-axis coordinate of every straight perpendicular line, by edge index. */
  lineF: Map<number, number>;
  /** Offset of such a line's end from the start of the box, keyed `${edge}|src` or `${edge}|tgt`. */
  off: Map<string, number>;
}

export const noAlignment = (): Alignment => ({ slide: new Map(), lineF: new Map(), off: new Map() });

export interface Skeleton extends Topology {
  td: boolean;
  align: Alignment;
  rankExt: number[];
  rowExt: number[][];
  gutter: number;
  margin: number;
  laneGap: number;
  baseWf: number[];
  baseWc: number[];
  minBand: number[];
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
      span: span.get(n.id) ?? 1,
      row: r,
      cRow: (rowStartOfLane[lane] ?? 0) + r,
      cb: (lanes[lane]?.base ?? 0) + r,
      nf: 0,
      nc: 0,
      title: n.title,
      lines: n.lines,
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

/** Rounds a size up to the ruler's fine grid. */
export const gridUp = (ruler: Ruler, v: number): number => Math.ceil(v / ruler.grid - 1e-9) * ruler.grid;

/** Rounds a position to the nearest multiple of the ruler's fine grid. */
export const gridNear = (ruler: Ruler, v: number): number => Math.round(v / ruler.grid) * ruler.grid;

export interface Measure {
  /** Content-sized box extents, snapped up to the width step and the grid. */
  w: number[];
  h: number[];
  /** Box width shared by every box that fits it: the smallest width that fits 75 % of the boxes. */
  common: number;
  contentH: number;
  /** Space the lane labels take along the flow axis. */
  gutter: number;
}

/** Sizes that depend on the text alone, never on where a node is placed. */
export function measureNodes(
  nodes: ReadonlyArray<{ title: string; lines: string[] }>,
  lanes: ReadonlyArray<{ label: string }>,
  ruler: Ruler,
  td: boolean,
): Measure {
  const border = ruler.nodeBorder;
  const snapW = (v: number): number =>
    gridUp(ruler, ruler.snap(Math.ceil(v / ruler.widthStep - 1e-9) * ruler.widthStep));
  const content = nodes.map((s) => {
    const texts = [ruler.textWidth(s.title, 'title'), ...s.lines.map((l) => ruler.textWidth(l, 'line'))];
    return {
      w: Math.max(...texts) + 2 * ruler.nodePadX + 2 * border,
      h:
        ruler.lineHeight('title') +
        s.lines.length * ruler.lineHeight('line') +
        2 * ruler.nodePadY +
        2 * border,
    };
  });
  const w = content.map((c) => snapW(c.w));
  const sorted = [...w].sort((a, b) => a - b);
  const common = sorted[Math.max(0, Math.ceil(0.75 * sorted.length) - 1)] ?? 0;
  const contentH = gridUp(ruler, Math.max(0, ...content.map((c) => c.h)));
  const labelled = lanes.some((l) => l.label !== '');
  const labelWidths = lanes.map((l) => ruler.textWidth(l.label, 'lane'));
  const gutter = !labelled
    ? 0
    : gridUp(ruler, 2 * ruler.laneLabelGap + (td ? ruler.lineHeight('lane') : Math.max(0, ...labelWidths)));
  return { w, h: content.map(() => contentH), common, contentH, gutter };
}

export function sizeSlots(
  topo: Topology,
  ruler: Ruler,
  direction: 'LR' | 'TD',
  needs: Map<string, Need>,
  /** Smallest extents a box may take; keeps a second pass from shrinking boxes the first pass sized. */
  floor: ReadonlyMap<string, { nf: number; nc: number }> = new Map(),
): Skeleton {
  const td = direction === 'TD';
  const m = measureNodes(topo.slots, topo.lanes, ruler, td);
  const snapW = (v: number): number =>
    gridUp(ruler, ruler.snap(Math.ceil(v / ruler.widthStep - 1e-9) * ruler.widthStep));
  const need = (s: Slot): Need => needs.get(s.id) ?? { nf: 0, nc: 0 };
  const needW = (s: Slot): number => (td ? need(s).nc : need(s).nf);
  const needH = (s: Slot): number => (td ? need(s).nf : need(s).nc);
  const { common, contentH } = m;
  const pitch = common + ruler.rankGap;
  // A box wider than the shared width covers whole columns: `span` of them, drawn as one box.
  const physW = (i: number, s: Slot): number => {
    const base = s.span > 1 ? s.span * pitch - ruler.rankGap : Math.max(m.w[i] ?? 0, common);
    return snapW(Math.max(base, needW(s)));
  };
  const slots = topo.slots.map((s, i) => {
    const w = physW(i, s);
    const h = gridUp(ruler, Math.max(contentH, needH(s)));
    const min = floor.get(s.id);
    const [nf, nc] = td ? [h, w] : [w, h];
    return { ...s, nf: Math.max(nf, min?.nf ?? 0), nc: Math.max(nc, min?.nc ?? 0) };
  });

  const rankExt = Array.from({ length: topo.ranks }, (_, r) =>
    Math.max(
      0,
      ...slots.filter((s) => s.rank <= r && r < s.rank + s.span).map((s) => (s.span > 1 ? common : s.nf)),
    ),
  );
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
    a === 0 || a === topo.ranks ? ruler.lanePad : ruler.rankGap,
  );
  const baseWc: number[] = [];
  for (const lane of topo.lanes) {
    for (let k = 0; k <= lane.rows; k++) baseWc.push(k === 0 || k === lane.rows ? ruler.lanePad : ruler.rowGap);
  }

  return {
    ...topo,
    align: noAlignment(),
    slots,
    byId: new Map(slots.map((s) => [s.id, s] as const)),
    td,
    rankExt,
    rowExt,
    gutter,
    margin: gridUp(ruler, ruler.trackGap),
    laneGap: gridUp(ruler, ruler.laneGap),
    baseWf,
    baseWc,
    minBand,
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

  const fStart = new Array<number>(sk.ranks + 1).fill(0);
  const rankStart = new Array<number>(sk.ranks).fill(0);
  let f = sk.margin + sk.gutter;
  for (let a = 0; a <= sk.ranks; a++) {
    fStart[a] = f;
    f += wf[a] ?? 0;
    if (a < sk.ranks) {
      rankStart[a] = f;
      f += sk.rankExt[a] ?? 0;
    }
  }
  const totalF = f + sk.margin;

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
  };
}

/** Extent along the flow axis of a node once the channels have their final widths. */
export function finalNf(sk: Skeleton, geo: Geo, s: Slot): number {
  if (s.span <= 1) return s.nf;
  const last = s.rank + s.span - 1;
  return (geo.rankStart[last] ?? 0) + (sk.rankExt[last] ?? 0) - (geo.rankStart[s.rank] ?? 0);
}

/** Abstract top-left corner (f, c) of a node, centred in its rank and row slot. */
export function origin(sk: Skeleton, geo: Geo, ruler: Ruler, s: Slot): { f0: number; c0: number } {
  const rankExt = sk.rankExt[s.rank] ?? 0;
  const rowExt = sk.rowExt[s.lane]?.[s.row] ?? 0;
  return {
    f0:
      (geo.rankStart[s.rank] ?? 0) +
      (s.span > 1 ? 0 : gridNear(ruler, (rankExt - s.nf) / 2)) +
      (sk.align.slide.get(s.id) ?? 0),
    c0: (geo.rowStart[s.lane]?.[s.row] ?? 0) + gridNear(ruler, (rowExt - s.nc) / 2),
  };
}
