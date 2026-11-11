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

export interface Skeleton extends Topology {
  td: boolean;
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

export function buildTopology(graph: Graph, rank: Map<string, number>, row: Map<string, number>): Topology {
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
      row: r,
      cRow: (rowStartOfLane[lane] ?? 0) + r,
      cb: (lanes[lane]?.base ?? 0) + r,
      nf: 0,
      nc: 0,
      title: n.title,
      lines: n.lines,
    };
  });
  const ranks = slots.length === 0 ? 0 : Math.max(...slots.map((s) => s.rank)) + 1;
  return { slots, byId: new Map(slots.map((s) => [s.id, s] as const)), lanes, ranks, channels: base };
}

export interface Need {
  /** Required extent along f (from sides on the cross axis). */
  nf: number;
  /** Required extent along c (from sides on the flow axis). */
  nc: number;
}

export function sizeSlots(topo: Topology, ruler: Ruler, direction: 'LR' | 'TD', needs: Map<string, Need>): Skeleton {
  const td = direction === 'TD';
  const border = ruler.nodeBorder;
  const content = topo.slots.map((s) => {
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
  const snapW = (v: number): number => ruler.snap(Math.ceil(v / ruler.widthStep - 1e-9) * ruler.widthStep);
  const need = (s: Slot): Need => needs.get(s.id) ?? { nf: 0, nc: 0 };
  const needW = (s: Slot): number => (td ? need(s).nc : need(s).nf);
  const needH = (s: Slot): number => (td ? need(s).nf : need(s).nc);
  // Every box takes the widest content width, except boxes much wider than the median, which keep
  // their own. A box that needs more room for its attachments grows alone.
  const own = content.map((c) => snapW(c.w));
  const median = [...own].sort((a, b) => a - b)[Math.floor(own.length / 2)] ?? 0;
  const limit = 1.6 * median;
  const common = Math.max(0, ...own.filter((w) => w <= limit));
  const physW = (i: number, s: Slot): number => {
    const mine = own[i] ?? 0;
    return snapW(Math.max(mine > limit ? mine : common, needW(s)));
  };
  const contentH = Math.max(0, ...content.map((c) => c.h));
  const slots = topo.slots.map((s, i) => {
    const w = physW(i, s);
    const h = Math.max(contentH, needH(s));
    return td ? { ...s, nf: h, nc: w } : { ...s, nf: w, nc: h };
  });

  const rankExt = Array.from({ length: topo.ranks }, (_, r) =>
    Math.max(0, ...slots.filter((s) => s.rank === r).map((s) => s.nf)),
  );
  const rowExt = topo.lanes.map((lane, l) =>
    Array.from({ length: lane.rows }, (_, i) =>
      Math.max(0, ...slots.filter((s) => s.lane === l && s.row === i).map((s) => s.nc)),
    ),
  );

  const labelled = topo.lanes.some((l) => l.label !== '');
  const labelWidths = topo.lanes.map((l) => ruler.textWidth(l.label, 'lane'));
  const gutter = !labelled
    ? 0
    : 2 * ruler.laneLabelGap + (td ? ruler.lineHeight('lane') : Math.max(0, ...labelWidths));
  const minBand = topo.lanes.map((l, i) =>
    td && l.label !== '' ? (labelWidths[i] ?? 0) + 2 * ruler.laneLabelGap : 0,
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
    slots,
    byId: new Map(slots.map((s) => [s.id, s] as const)),
    td,
    rankExt,
    rowExt,
    gutter,
    margin: ruler.trackGap,
    laneGap: ruler.trackGap,
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

/** Abstract top-left corner (f, c) of a node, centred in its rank and row slot. */
export function origin(sk: Skeleton, geo: Geo, ruler: Ruler, s: Slot): { f0: number; c0: number } {
  const rankExt = sk.rankExt[s.rank] ?? 0;
  const rowExt = sk.rowExt[s.lane]?.[s.row] ?? 0;
  return {
    f0: (geo.rankStart[s.rank] ?? 0) + ruler.snap((rankExt - s.nf) / 2),
    c0: (geo.rowStart[s.lane]?.[s.row] ?? 0) + ruler.snap((rowExt - s.nc) / 2),
  };
}
