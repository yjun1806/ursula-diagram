import type { Ruler } from '../metrics.ts';
import { pixelRuler } from '../metrics.ts';
import type { Graph, Layout, LaneAxis } from '../types.ts';
import type { AlongArrangement } from './along.ts';
import { alongEstimate, arrangeAlong, considerAlong, polishAlong, refineAlong } from './along.ts';
import { structuralEstimate } from './estimate.ts';
import { arrangementScore } from './score.ts';
import type { LegendOption } from './legend.ts';
import { withLegend } from './legend.ts';
import { measureNodes } from './place.ts';
import { assignRanks } from './rank.ts';
import { assignRows } from './rows.ts';
import type { SlotResult } from './slots.ts';
import { placeSlots } from './slots.ts';
import type { LayoutOptions as SolveOptions } from './solve.ts';
import { solve } from './solve.ts';

export interface LayoutOptions extends SolveOptions {
  /** `false` drops the legend; an object replaces the captions of the styles it names. */
  legend?: LegendOption;
  /**
   * 'across' keeps lanes parallel to the flow axis, 'along' places them one after another along it.
   * 'auto' (the default) tries 'along' only when edges between lanes far outnumber edges inside lanes.
   */
  laneAxis?: 'auto' | LaneAxis;
}

export type { LegendOption } from './legend.ts';
export { withLegend } from './legend.ts';

/**
 * Number of rank columns the canvas holds, and how many of them each node covers.
 * Without a known canvas length every rank gets its own column.
 */
export function canvasSlots(
  graph: Graph,
  ruler: Ruler,
  ranks: number,
  opts: Pick<SolveOptions, 'maxWidth' | 'maxHeight'>,
): { columns: number; span: Map<string, number> } {
  const td = graph.direction === 'TD';
  const m = measureNodes(graph.nodes, graph.lanes, ruler, td);
  const limit = td ? opts.maxHeight : (opts.maxWidth ?? ruler.defaultWidth);
  const pitch = (td ? m.contentH : m.common) + ruler.rankGap;
  const fixed = 2 * ruler.trackGap + m.gutter + 2 * ruler.lanePad;
  const columns =
    limit === undefined || !Number.isFinite(limit)
      ? Math.max(1, ranks)
      : Math.max(1, Math.floor((limit - fixed + ruler.rankGap) / pitch + 1e-9));
  const span = new Map<string, number>();
  if (!td) {
    graph.nodes.forEach((n, i) => {
      const own = m.w[i] ?? 0;
      if (own > m.common) span.set(n.id, Math.min(columns, Math.ceil((own + ruler.rankGap) / pitch - 1e-9)));
    });
  }
  return { columns, span };
}

/** A drawing that overflows its canvas because channels grew is placed again with one column fewer. */
const MAX_NARROWINGS = 3;

interface AcrossStart {
  sized: ReturnType<typeof canvasSlots>;
  placed: SlotResult;
  rank: Map<string, number>;
  row: Map<string, number>;
}

/** Slot assignment of the first, widest attempt of the parallel-lane arrangement; no routing happens here. */
function startAcross(graph: Graph, ruler: Ruler, opts: SolveOptions): AcrossStart {
  const { maxHeight, ...solveOpts } = opts;
  const rank = assignRanks(graph);
  const row = assignRows(graph, rank);
  const ranks = Math.max(0, ...rank.values()) + 1;
  const sized = canvasSlots(graph, ruler, ranks, { ...solveOpts, ...(maxHeight === undefined ? {} : { maxHeight }) });
  return { sized, placed: slotsFor(graph, rank, row, sized, sized.columns), rank, row };
}

function slotsFor(graph: Graph, rank: Map<string, number>, row: Map<string, number>, sized: AcrossStart['sized'], columns: number): SlotResult {
  const span = new Map([...sized.span].map(([id, s]) => [id, Math.min(s, columns)] as const));
  return placeSlots({ graph, rank, row, columns, span });
}

/** Lanes as bands parallel to the flow axis. */
function layoutAcross(graph: Graph, ruler: Ruler, opts: SolveOptions, start: AcrossStart = startAcross(graph, ruler, opts)): Layout {
  const { sized, rank, row } = start;
  const limit = opts.maxWidth ?? ruler.defaultWidth;
  const bounded = limit !== undefined && Number.isFinite(limit);
  let drawn: Layout | undefined;
  for (let columns = sized.columns, tries = 0; ; columns--, tries++) {
    const placed = tries === 0 ? start.placed : slotsFor(graph, rank, row, sized, columns);
    drawn = solve(graph, ruler, placed.rank, placed.row, bounded ? { maxWidth: limit } : {}, placed.span);
    const tooWide = graph.direction === 'LR' && bounded && drawn.width > limit;
    if (!tooWide || columns <= 1 || tries >= MAX_NARROWINGS) break;
  }
  return drawn;
}

/** Slots of the parallel-lane arrangement: lanes stack across the flow axis, rows are local to a lane. */
function acrossEstimate(graph: Graph, placed: SlotResult): number {
  const offset = new Map<string, number>();
  let next = 0;
  for (const lane of graph.lanes) {
    offset.set(lane.id, next);
    const rows = graph.nodes.filter((n) => n.lane === lane.id).map((n) => placed.row.get(n.id) ?? 0);
    next += rows.length === 0 ? 0 : Math.max(...rows) + 1;
  }
  const slots = new Map(
    graph.nodes.map((n) => [n.id, { flow: placed.rank.get(n.id) ?? 0, cross: (offset.get(n.lane) ?? 0) + (placed.row.get(n.id) ?? 0) }] as const),
  );
  return structuralEstimate(graph.edges, slots);
}

/** Lanes as bands one after another along the flow axis. */
function layoutAlong(arranged: AlongArrangement, ruler: Ruler, opts: SolveOptions): Layout {
  const limit = opts.maxWidth ?? ruler.defaultWidth;
  const bounded = limit !== undefined && Number.isFinite(limit);
  return solve(arranged.graph, ruler, arranged.rank, arranged.row, bounded ? { maxWidth: limit } : {}, new Map(), false, arranged.spec);
}

/**
 * Lays the graph out. When edges between lanes far outnumber edges inside lanes, the lanes are also tried
 * one after another along the flow axis and the drawing with the better score is kept. The choice is made
 * with the pixel ruler (the given ruler when it is one), so every medium shows the same arrangement.
 */
export function layout(graph: Graph, ruler: Ruler, opts: LayoutOptions = {}): Layout {
  const { legend, laneAxis = 'auto', ...solveOpts } = opts;
  if (laneAxis === 'across' || (laneAxis === 'auto' && !considerAlong(graph))) {
    return withLegend(layoutAcross(graph, ruler, solveOpts), ruler, legend);
  }
  const native = ruler.defaultWidth !== undefined;
  const reference = native ? ruler : pixelRuler();
  const referenceOpts: SolveOptions = native ? solveOpts : {};
  const limit = referenceOpts.maxWidth ?? reference.defaultWidth;
  const score = (layout: Layout): number => arrangementScore(layout, limit);
  const start = startAcross(graph, reference, referenceOpts);
  const constructed = polishAlong(arrangeAlong(graph));
  // Gate: the parallel arrangement is returned untouched unless slots alone say the other one is better.
  if (laneAxis === 'auto' && alongEstimate(constructed) >= acrossEstimate(graph, start.placed)) {
    return withLegend(layoutAcross(graph, ruler, solveOpts, native ? start : undefined), ruler, legend);
  }
  const routed = new Map<AlongArrangement, Layout>();
  const route = (a: AlongArrangement): number => {
    const l = layoutAlong(a, reference, referenceOpts);
    routed.set(a, l);
    return score(l);
  };
  const arranged = refineAlong(constructed, route(constructed), route);
  const along = routed.get(arranged) ?? layoutAlong(arranged, reference, referenceOpts);
  const across = layoutAcross(graph, reference, referenceOpts, start);
  const useAlong = laneAxis === 'along' || score(along) < score(across);
  const chosen = native ? (useAlong ? along : across) : useAlong ? layoutAlong(arranged, ruler, solveOpts) : layoutAcross(graph, ruler, solveOpts);
  return withLegend(chosen, ruler, legend);
}
