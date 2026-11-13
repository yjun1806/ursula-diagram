import { layout } from './layout/index.ts';
import type { LegendOption } from './layout/legend.ts';
import { cellRuler, pixelRuler } from './metrics.ts';
import { parse } from './parse.ts';
import { registerFrontEnd } from './registry.ts';
import { renderSvg } from './render/svg.ts';
import { renderTextLayout } from './render/text.ts';
import { cellWidth } from './metrics.ts';
import type { Detail } from './text-detail.ts';
import { descriptionList, innerWidth, innerWidths, titlesOnly, wrapGraph } from './text-detail.ts';
import type { Graph, Layout } from './types.ts';
import { titledLines } from './front/title.ts';

type Composition = 'auto' | 'lanes' | 'stages';

type Quality = 'fast' | 'best';

function layoutOptions(opts: { maxWidth?: number; legend?: LegendOption; engine?: 'grid' | 'layered'; composition?: Composition; questions?: boolean; elbows?: boolean; quality?: Quality }): { maxWidth?: number; legend?: LegendOption; engine?: 'grid' | 'layered'; composition?: Composition; questions?: boolean; elbows?: boolean; quality?: Quality } {
  return {
    ...(opts.quality === undefined ? {} : { quality: opts.quality }),
    ...(opts.engine === undefined ? {} : { engine: opts.engine }),
    ...(opts.composition === undefined ? {} : { composition: opts.composition }),
    ...(opts.questions === undefined ? {} : { questions: opts.questions }),
    ...(opts.elbows === undefined ? {} : { elbows: opts.elbows }),
    ...(opts.maxWidth === undefined ? {} : { maxWidth: opts.maxWidth }),
    ...(opts.legend === undefined ? {} : { legend: opts.legend }),
  };
}

/** The step a terminal drawing was made with: 1 all text, 2 text wrapped narrower, 3 titles only, 4 titles only with the flow folded. */
export type TextStep = 1 | 2 | 3 | 4;

interface TextOptionsIn {
  legend?: LegendOption;
  maxHeight?: number;
  engine?: 'grid' | 'layered';
  composition?: Composition;
  quality?: Quality;
  detail?: Detail;
}

interface Attempt {
  graph: Graph;
  /** Inner width of the boxes (the widest text line). */
  w: number;
  list: boolean;
}

/**
 * Draws a flowchart for a terminal. Steps 1 to 3 are tried in turn, each with box widths from wide to narrow, and the
 * fullest one whose drawing fits `maxWidth` is used; step 4 folds the flow. Trying is done with quick drawings; the
 * setting that fits is then drawn once with candidates and refinement. Reports the layout, the step and the inner width.
 */
export function drawText(src: string, maxWidth: number | undefined, opts: TextOptionsIn): { lines: string[]; layout: Layout; step: TextStep; w: number } {
  const { legend, maxHeight, engine, composition, quality, detail = 'auto' } = opts;
  const full = parse(src);
  const inner = innerWidth(full);
  const widths = innerWidths(full);
  const stepAttempts = {
    full: [{ graph: full, w: inner, list: false }] as Attempt[],
    narrow: widths.flatMap((w) => { const g = wrapGraph(full, w, true); return g ? [{ graph: g, w, list: false }] : []; }),
    title: widths.flatMap((w) => { const g = wrapGraph(full, w, false); return g ? [{ graph: g, w, list: true }] : []; }),
  };
  if (stepAttempts.title.length === 0) stepAttempts.title.push({ graph: titlesOnly(full), w: inner, list: true });
  const numberOf = { full: 1, narrow: 2, title: 3 } as const;
  const widest = (lines: string[]): number => Math.max(0, ...lines.map(cellWidth));
  const draw = (a: Attempt, fold: boolean, quick: boolean, as: Composition | undefined = composition): { lines: string[]; layout: Layout } => {
    const laid = layout(a.graph, cellRuler(), {
      ...layoutOptions({ legend, engine, composition: as, ...(quality === undefined ? {} : { quality }) }),
      ...(maxHeight === undefined ? {} : { maxHeight }),
      ...(maxWidth === undefined ? {} : { maxWidth }),
      fold,
      ...(quick ? { quick: true, refine: false } : {}),
    });
    const drawn = renderTextLayout(laid);
    const list = a.list && maxWidth !== undefined ? descriptionList(full, maxWidth) : [];
    return { lines: list.length === 0 ? drawn : [...drawn, '', ...list], layout: laid };
  };
  const result = (a: Attempt, step: TextStep, drawn: { lines: string[]; layout: Layout }): { lines: string[]; layout: Layout; step: TextStep; w: number } => ({ ...drawn, step, w: innerWidth(a.graph) });
  const names = detail === 'auto' ? (['full', 'narrow', 'title'] as const) : ([detail] as const);
  if (maxWidth === undefined) {
    const a = stepAttempts[names[0]][0] as Attempt;
    return result(a, numberOf[names[0]], draw(a, true, false));
  }
  // Every width that fits is drawn quickly and the one with the fewest lines of drawing wins (the wider on a tie);
  // fitting grows as the boxes narrow, so a bisection finds the widest that fits and the narrower ones follow.
  const distinct = (list: Attempt[]): Attempt[] => {
    const seen = new Set<string>();
    return list.filter((a) => {
      const key = JSON.stringify(a.graph.nodes.map((n) => [n.title, n.lines]));
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };
  const listLines = descriptionList(full, maxWidth).length;
  const figureLines = (d: { lines: string[]; layout: Layout }): number => (d.layout.legend ? Math.ceil(d.layout.legend.base.height) : d.lines.length);
  interface Fit {
    a: Attempt;
    quick: { lines: string[]; layout: Layout };
    cost: number;
  }
  const best = (list: Attempt[]): Fit | undefined => {
    const options = distinct(list);
    let lo = 0;
    let hi = options.length - 1;
    let first = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const quick = draw(options[mid] as Attempt, false, true);
      if (widest(quick.lines) <= maxWidth) {
        first = mid;
        hi = mid - 1;
      } else lo = mid + 1;
    }
    if (first < 0) return undefined;
    let winner: Fit | undefined;
    for (const a of options.slice(first)) {
      const quick = draw(a, false, true);
      if (widest(quick.lines) > maxWidth) continue;
      const cost = figureLines(quick) + (a.list ? listLines : 0);
      if (!winner || cost < winner.cost) winner = { a, quick, cost };
    }
    return winner;
  };
  const textual = detail === 'auto' || detail === 'full' || detail === 'narrow' ? best([...(detail === 'narrow' ? [] : stepAttempts.full), ...(detail === 'full' ? [] : stepAttempts.narrow)]) : undefined;
  const titles = detail === 'auto' || detail === 'title' ? best(stepAttempts.title) : undefined;
  const chosen = textual && titles ? (titles.cost < textual.cost * 0.7 ? titles : textual) : (textual ?? titles);
  if (chosen) {
    const heavy = draw(chosen.a, false, false);
    const step: TextStep = chosen.a.list ? 3 : chosen.a.graph === full ? 1 : 2;
    return result(chosen.a, step, widest(heavy.lines) <= maxWidth ? heavy : chosen.quick);
  }
  // Fold the flow at the narrowest boxes of the last step.
  const narrowest = (stepAttempts[names[names.length - 1] as keyof typeof stepAttempts].at(-1)) as Attempt;
  let drawn = draw(narrowest, true, true);
  if (widest(drawn.lines) <= maxWidth) {
    const heavy = draw(narrowest, true, false);
    if (widest(heavy.lines) <= maxWidth) drawn = heavy;
  }
  // Stages are columns and cannot fold; when they stay too wide the same graph is drawn as lanes.
  if (widest(drawn.lines) > maxWidth && drawn.layout.composition === 'stages' && composition === undefined) {
    let lanes = draw(narrowest, true, true, 'lanes');
    if (widest(lanes.lines) <= maxWidth) {
      const heavy = draw(narrowest, true, false, 'lanes');
      if (widest(heavy.lines) <= maxWidth) lanes = heavy;
    }
    if (widest(lanes.lines) < widest(drawn.lines)) drawn = lanes;
  }
  return result(narrowest, 4, drawn);
}

registerFrontEnd({
  name: 'flowchart',
  headers: ['flowchart', 'graph', 'swimlane-beta'],
  svg(src, opts) {
    const { maxWidth, legend, engine, composition, quality, ...svgOpts } = opts;
    return renderSvg(layout(parse(src), pixelRuler(), layoutOptions({ maxWidth, legend, engine, composition, ...(quality === undefined ? {} : { quality }) })), { ...svgOpts, ...(opts.heading === undefined ? {} : { drawTitle: opts.heading }) });
  },
  textLines(src, maxWidth, opts) {
    return titledLines(drawText(src, maxWidth, opts).lines, opts.heading, maxWidth);
  },
  json(src, mode, opts) {
    return layout(parse(src), mode === 'text' ? cellRuler() : pixelRuler(), layoutOptions(opts));
  },
});
