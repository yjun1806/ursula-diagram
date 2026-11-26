import type { NodeShape } from '../types.ts';
import type { Ruler } from '../metrics.ts';
import { diamondHeight, diamondWidth, hasOutline } from './diamond.ts';
import { isFixedShape, ownSize, ROUND_MIN_W } from './records.ts';
import type { Compartment } from '../types.ts';

/** Rounds a size up to the ruler's node grid. */
export const gridUp = (ruler: Ruler, v: number): number => Math.ceil(v / ruler.nodeGrid - 1e-9) * ruler.nodeGrid;

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

/** Shapes that keep a size of their own and are never made to match each other. */
const OWN_SIZED = new Set<NodeShape | undefined>(['start-dot', 'end-dot', 'bar', 'actor']);

/**
 * One width per kind of box: boxes of one kind (a plain box and a rounded box count as one kind, boxes divided into
 * compartments as another, each other shape on its own) take the width of the widest of them that is at most
 * `ruler.shareWithin` times as wide as the median of the kind. Terminal drawings and rulers without it keep their own sizes.
 */
function sharedWidths(w: number[], nodes: ReadonlyArray<{ shape?: NodeShape | undefined; compartments?: readonly Compartment[] | undefined }>, ruler: Ruler): number[] {
  const within = ruler.shareWithin;
  if (ruler.uniform || within === undefined) return w;
  const kinds = new Map<string, number[]>();
  nodes.forEach((n, i) => {
    if (OWN_SIZED.has(n.shape)) return;
    const plain = n.shape === undefined || n.shape === 'round' ? 'rect' : n.shape;
    const key = (n.compartments?.length ?? 0) > 0 ? `record:${n.shape ?? ''}` : plain;
    kinds.set(key, [...(kinds.get(key) ?? []), i]);
  });
  const out = [...w];
  for (const members of kinds.values()) {
    const widths = members.map((i) => w[i] as number).sort((a, b) => a - b);
    const median = widths[Math.floor((widths.length - 1) / 2)] ?? 0;
    const shared = widths.filter((v) => v <= within * median).pop() ?? 0;
    for (const i of members) if ((w[i] as number) <= within * median) out[i] = shared;
  }
  return out;
}

type MeasuredNodes = ReadonlyArray<{ title: string; lines: string[]; shape?: NodeShape | undefined; compartments?: readonly Compartment[] | undefined; box?: { w: number; h: number } | undefined }>;

/**
 * Measures already taken, by node array, ruler and direction. A layout measures the same nodes with the same ruler
 * many times over; nodes and rulers are not changed once made, so the same objects give the same sizes.
 */
const measured = new WeakMap<MeasuredNodes, WeakMap<Ruler, Map<boolean, { lanes: ReadonlyArray<{ label: string }>; measure: Measure }>>>();

/** Sizes that depend on the text alone, never on where a node is placed. */
export function measureNodes(nodes: MeasuredNodes, lanes: ReadonlyArray<{ label: string }>, ruler: Ruler, td: boolean): Measure {
  let byRuler = measured.get(nodes);
  if (byRuler === undefined) measured.set(nodes, (byRuler = new WeakMap()));
  let byDirection = byRuler.get(ruler);
  if (byDirection === undefined) byRuler.set(ruler, (byDirection = new Map()));
  const known = byDirection.get(td);
  if (known !== undefined && known.lanes === lanes) return known.measure;
  const measure = measureAfresh(nodes, lanes, ruler, td);
  byDirection.set(td, { lanes, measure });
  return measure;
}

function measureAfresh(nodes: MeasuredNodes, lanes: ReadonlyArray<{ label: string }>, ruler: Ruler, td: boolean): Measure {
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
      w: own[i]?.w ?? Math.max(hasOutline(s.shape, ruler) ? diamondWidth(ruler, s, diamondHeight(contentH)) : Math.max(...texts) + 2 * ruler.nodePadX + 2 * border, s.shape === 'round' && ruler.terminal !== true ? ROUND_MIN_W : 0),
      h: heights[i] as number,
    };
  });
  const w = sharedWidths(content.map((c) => snapW(c.w)), nodes, ruler);
  const sorted = [...w].sort((a, b) => a - b);
  // A box given from outside has that size; its text still counts for the shared width, as it would in any other box.
  const sizedW = w.map((v, i) => { const box = nodes[i]?.box; return box === undefined ? v : snapW(box.w); });
  const sizedH = (h: number, i: number): number => { const box = nodes[i]?.box; return box === undefined ? h : gridUp(ruler, box.h); };
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
  return { w: sizedW, h: content.map((c, i) => sizedH(!td && own[i] !== undefined ? c.h : contentH, i)), common, contentH, unit: ((td ? contentH : common) + ruler.rankGap) / 2, gutter };
}
