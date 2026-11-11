import type { Ruler } from '../metrics.ts';
import { pixelRuler } from '../metrics.ts';
import type { Graph, Layout, LaneAxis } from '../types.ts';
import type { AlongArrangement } from './along.ts';
import { arrangeAlong, considerAlong, refineAlong } from './along.ts';
import { arrangementScore } from './score.ts';
import type { LegendOption } from './legend.ts';
import { withLegend } from './legend.ts';
import { measureNodes } from './place.ts';
import { assignRanks } from './rank.ts';
import { assignRows } from './rows.ts';
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

/** Lanes as bands parallel to the flow axis. */
function layoutAcross(graph: Graph, ruler: Ruler, opts: SolveOptions): Layout {
  const { maxHeight, ...solveOpts } = opts;
  const rank = assignRanks(graph);
  const row = assignRows(graph, rank);
  const ranks = Math.max(0, ...rank.values()) + 1;
  const sized = canvasSlots(graph, ruler, ranks, {
    ...solveOpts,
    ...(maxHeight === undefined ? {} : { maxHeight }),
  });
  const limit = solveOpts.maxWidth ?? ruler.defaultWidth;
  const bounded = limit !== undefined && Number.isFinite(limit);
  let drawn: Layout | undefined;
  for (let columns = sized.columns, tries = 0; ; columns--, tries++) {
    const span = new Map([...sized.span].map(([id, s]) => [id, Math.min(s, columns)] as const));
    const placed = placeSlots({ graph, rank, row, columns, span });
    drawn = solve(graph, ruler, placed.rank, placed.row, bounded ? { maxWidth: limit } : {}, placed.span);
    const tooWide = graph.direction === 'LR' && bounded && drawn.width > limit;
    if (!tooWide || columns <= 1 || tries >= MAX_NARROWINGS) break;
  }
  return drawn;
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
  const across = layoutAcross(graph, reference, referenceOpts);
  const score = (layout: Layout): number => arrangementScore(layout, limit);
  const arranged = refineAlong(arrangeAlong(graph), (a) => score(layoutAlong(a, reference, referenceOpts)));
  const along = layoutAlong(arranged, reference, referenceOpts);
  const useAlong = laneAxis === 'along' || score(along) < score(across);
  const chosen = native ? (useAlong ? along : across) : useAlong ? layoutAlong(arranged, ruler, solveOpts) : layoutAcross(graph, ruler, solveOpts);
  return withLegend(chosen, ruler, legend);
}
