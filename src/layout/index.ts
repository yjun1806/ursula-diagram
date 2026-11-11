import type { Ruler } from '../metrics.ts';
import type { Graph, Layout } from '../types.ts';
import type { LegendOption } from './legend.ts';
import { withLegend } from './legend.ts';
import { optimize } from './optimize.ts';
import { assignRanks } from './rank.ts';
import { assignRows } from './rows.ts';
import type { LayoutOptions as SolveOptions } from './solve.ts';
import { solve } from './solve.ts';

export interface LayoutOptions extends SolveOptions {
  /** `false` drops the legend; an object replaces the captions of the styles it names. */
  legend?: LegendOption;
}

export type { LegendOption } from './legend.ts';
export { withLegend } from './legend.ts';

export function layout(graph: Graph, ruler: Ruler, opts: LayoutOptions = {}): Layout {
  const rank = assignRanks(graph);
  const row = assignRows(graph, rank);
  const best = optimize(graph, rank, row);
  const { legend, ...solveOpts } = opts;
  return withLegend(solve(graph, ruler, best.rank, best.row, solveOpts), ruler, legend);
}
