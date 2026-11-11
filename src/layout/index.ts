import type { Ruler } from '../metrics.ts';
import type { Graph, Layout } from '../types.ts';
import { optimize } from './optimize.ts';
import { assignRanks } from './rank.ts';
import { assignRows } from './rows.ts';
import type { LayoutOptions } from './solve.ts';
import { solve } from './solve.ts';

export type { LayoutOptions } from './solve.ts';

export function layout(graph: Graph, ruler: Ruler, opts: LayoutOptions = {}): Layout {
  const rank = assignRanks(graph);
  const row = assignRows(graph, rank);
  const best = optimize(graph, rank, row);
  return solve(graph, ruler, best.rank, best.row, opts);
}
