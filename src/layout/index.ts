import type { Ruler } from '../metrics.ts';
import type { Graph, Layout } from '../types.ts';
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

export function layout(graph: Graph, ruler: Ruler, opts: LayoutOptions = {}): Layout {
  const { legend, maxHeight, ...solveOpts } = opts;
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
  return withLegend(drawn, ruler, legend);
}
