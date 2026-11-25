import { layout } from './layout/index.ts';
import { textCost, writtenOf } from './layout/text-cost.ts';
import { hiddenLabels } from './layout/text-tidy.ts';
import type { Breaks } from './layout/text-intact.ts';
import { breaksMore, breaksOf } from './layout/text-intact.ts';
import type { LegendOption } from './layout/legend.ts';
import { cellRuler, pixelRuler } from './metrics.ts';
import { parse } from './parse.ts';
import { registerFrontEnd } from './registry.ts';
import { renderSvg } from './render/svg.ts';
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
  /** The usual drawing, which every drawing made otherwise is held against (see `LayoutOptions.bare`). */
  bare?: boolean;
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
  const { legend, maxHeight, engine, composition, quality, detail = 'auto', bare = false } = opts;
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
  // Without `room` a drawing is made to be compared: the rows that arrowheads and bands ask for are left out, so that they do not tell which setting wins.
  // A quick drawing is the usual one (see `LayoutOptions.bare`) unless `tidied`, when its labels are brought into sight as in the drawing given out.
  const draw = (a: Attempt, fold: boolean, quick: boolean, as: Composition | undefined = composition, room = true, tidied = false): { lines: string[]; layout: Layout } => {
    const laid = layout(a.graph, cellRuler(), {
      ...layoutOptions({ legend, engine, composition: as, ...(quality === undefined ? {} : { quality }) }),
      ...(maxHeight === undefined ? {} : { maxHeight }),
      ...(maxWidth === undefined ? {} : { maxWidth }),
      fold,
      ...(quick ? { quick: true, refine: false } : {}),
      ...(room ? {} : { room: false }),
      ...(bare ? { bare: true } : tidied ? { bare: false } : {}),
    });
    // The rows the layout chose this drawing on are the rows it is written in.
    const drawn = [...writtenOf(laid)];
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
    /** The settings that fit the width, this one among them. */
    fits: Fit[];
  }
  // The drawing given out for a setting: drawn with candidates and refinement where that fits the width, quickly otherwise.
  const shown = (a: Attempt): { lines: string[]; layout: Layout } => {
    const heavy = draw(a, false, false);
    return widest(heavy.lines) <= (maxWidth ?? Infinity) ? heavy : draw(a, false, true);
  };
  const best = (list: Attempt[]): Fit | undefined => {
    const options = distinct(list);
    let lo = 0;
    let hi = options.length - 1;
    let first = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const quick = draw(options[mid] as Attempt, false, true, composition, false);
      if (widest(quick.lines) <= maxWidth) {
        first = mid;
        hi = mid - 1;
      } else lo = mid + 1;
    }
    if (first < 0) return undefined;
    const fits: Fit[] = [];
    for (const a of options.slice(first)) {
      const quick = draw(a, false, true, composition, false);
      if (widest(quick.lines) > maxWidth) continue;
      fits.push({ a, quick, cost: figureLines(quick) + (a.list ? listLines : 0), fits });
    }
    return fits.reduce<Fit | undefined>((w, f) => (w === undefined || f.cost < w.cost ? f : w), undefined);
  };
  const labels = full.edges.flatMap((e) => (e.label === undefined || e.label === '' ? [] : [e.label]));
  /**
   * A setting whose drawing given out hides a label gives way to the one that hides the fewest, drawn quickly with its labels brought into sight, where it crosses no more lines
   * and breaks nothing more (see `breaksOf`), and where the drawing given out for it hides fewer labels, crosses no more lines and breaks nothing more than the one it replaces.
   */
  const clearer = (fewest: Fit, theirs: { lines: string[]; layout: Layout }): { a: Attempt; drawn: { lines: string[]; layout: Layout } } | undefined => {
    const hidden = hiddenLabels(theirs.layout);
    if (bare || hidden === 0 || fewest.fits.length < 2 || maxWidth === undefined) return undefined;
    const tidied = fewest.fits.flatMap((f) => {
      const quick = draw(f.a, false, true, composition, false, true);
      return widest(quick.lines) > maxWidth ? [] : [{ f, quick, hidden: hiddenLabels(quick.layout), crossings: textCost(quick.layout).crossings }];
    });
    const own = tidied.find((t) => t.f === fewest);
    if (own === undefined || own.hidden === 0) return undefined;
    const breaks = (d: { lines: string[]; layout: Layout }): Breaks => breaksOf(d.layout, d.lines, labels);
    const clearest = tidied
      .filter((t) => t.hidden < own.hidden && t.crossings <= own.crossings && !breaksMore(breaks(t.quick), breaks(own.quick)))
      .reduce<(typeof tidied)[number] | undefined>((w, t) => (w === undefined || t.hidden < w.hidden || (t.hidden === w.hidden && t.f.cost < w.f.cost) ? t : w), undefined);
    if (clearest === undefined) return undefined;
    const mine = shown(clearest.f.a);
    const kept = hiddenLabels(mine.layout) < hidden && textCost(mine.layout).crossings <= textCost(theirs.layout).crossings && !breaksMore(breaks(mine), breaks(theirs));
    return kept ? { a: clearest.f.a, drawn: mine } : undefined;
  };
  const textual = detail === 'auto' || detail === 'full' || detail === 'narrow' ? best([...(detail === 'narrow' ? [] : stepAttempts.full), ...(detail === 'full' ? [] : stepAttempts.narrow)]) : undefined;
  const titles = detail === 'auto' || detail === 'title' ? best(stepAttempts.title) : undefined;
  const chosen = textual && titles ? (titles.cost < textual.cost * 0.7 ? titles : textual) : (textual ?? titles);
  if (chosen) {
    // A clearer setting is looked at once the step is chosen, so that the choice between the steps is the one the usual drawing makes.
    const theirs = shown(chosen.a);
    const { a, drawn } = clearer(chosen, theirs) ?? { a: chosen.a, drawn: theirs };
    const step: TextStep = a.list ? 3 : a.graph === full ? 1 : 2;
    return result(a, step, drawn);
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
