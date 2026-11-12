import { layout } from './layout/index.ts';
import type { LegendOption } from './layout/legend.ts';
import { cellRuler, pixelRuler } from './metrics.ts';
import { parse } from './parse.ts';
import { registerFrontEnd } from './registry.ts';
import { renderSvg } from './render/svg.ts';
import { renderTextLayout } from './render/text.ts';
import { cellWidth } from './metrics.ts';
import type { Detail } from './text-detail.ts';
import { descriptionList, narrowDescriptions, titlesOnly } from './text-detail.ts';
import type { Graph, Layout } from './types.ts';

type Composition = 'auto' | 'lanes' | 'stages';

function layoutOptions(opts: { maxWidth?: number; legend?: LegendOption; engine?: 'grid' | 'layered'; composition?: Composition; questions?: boolean; elbows?: boolean }): { maxWidth?: number; legend?: LegendOption; engine?: 'grid' | 'layered'; composition?: Composition; questions?: boolean; elbows?: boolean } {
  return {
    ...(opts.engine === undefined ? {} : { engine: opts.engine }),
    ...(opts.composition === undefined ? {} : { composition: opts.composition }),
    ...(opts.questions === undefined ? {} : { questions: opts.questions }),
    ...(opts.elbows === undefined ? {} : { elbows: opts.elbows }),
    ...(opts.maxWidth === undefined ? {} : { maxWidth: opts.maxWidth }),
    ...(opts.legend === undefined ? {} : { legend: opts.legend }),
  };
}

/** The step a terminal drawing was made with: 1 all text, 2 narrower descriptions, 3 titles only, 4 titles only with the flow folded. */
export type TextStep = 1 | 2 | 3 | 4;

interface TextOptionsIn {
  legend?: LegendOption;
  maxHeight?: number;
  engine?: 'grid' | 'layered';
  composition?: Composition;
  detail?: Detail;
}

/** Draws a flowchart for a terminal: the fullest step whose drawing fits `maxWidth`; reports the layout and the step used. */
export function drawText(src: string, maxWidth: number | undefined, opts: TextOptionsIn): { lines: string[]; layout: Layout; step: TextStep } {
  const { legend, maxHeight, engine, composition, detail = 'auto' } = opts;
  const full = parse(src);
  // Each step is drawn to the end; the first whose drawing fits the width is used. Narrower steps show less text.
  const steps = {
    full: { graph: full, list: false, number: 1 as const },
    narrow: { graph: narrowDescriptions(full), list: false, number: 2 as const },
    title: { graph: titlesOnly(full), list: true, number: 3 as const },
  };
  const widest = (lines: string[]): number => Math.max(0, ...lines.map(cellWidth));
  const finish = (step: (typeof steps)[keyof typeof steps], fold: boolean, as: Composition | undefined = composition): { lines: string[]; layout: Layout; step: TextStep } => {
    const laid = layout(step.graph, cellRuler(), {
      ...layoutOptions({ legend, engine, composition: as }),
      ...(maxHeight === undefined ? {} : { maxHeight }),
      ...(maxWidth === undefined ? {} : { maxWidth }),
      fold,
    });
    const drawn = renderTextLayout(laid);
    const list = step.list && maxWidth !== undefined ? descriptionList(full, maxWidth) : [];
    return { lines: list.length === 0 ? drawn : [...drawn, '', ...list], layout: laid, step: fold && maxWidth !== undefined ? 4 : step.number };
  };
  if (maxWidth === undefined) return finish(steps[detail === 'auto' ? 'full' : detail], true);
  // Steps 1 to 3 move blocks to other rows but cut no path; the fold of step 4 is the last resort.
  for (const name of detail === 'auto' ? (['full', 'narrow', 'title'] as const) : ([detail] as const)) {
    const got = finish(steps[name], false);
    if (widest(got.lines) <= maxWidth) return got;
  }
  const narrowest = steps[detail === 'auto' ? 'title' : detail];
  const folded = finish(narrowest, true);
  // Stages are columns and cannot fold; when they stay too wide the same graph is drawn as lanes.
  if (widest(folded.lines) > maxWidth && folded.layout.composition === 'stages' && composition === undefined) {
    const lanes = finish(narrowest, true, 'lanes');
    if (widest(lanes.lines) < widest(folded.lines)) return lanes;
  }
  return folded;
}

registerFrontEnd({
  name: 'flowchart',
  headers: ['flowchart', 'graph'],
  svg(src, opts) {
    const { maxWidth, legend, engine, composition, ...svgOpts } = opts;
    return renderSvg(layout(parse(src), pixelRuler(), layoutOptions({ maxWidth, legend, engine, composition })), svgOpts);
  },
  textLines(src, maxWidth, opts) {
    return drawText(src, maxWidth, opts).lines;
  },
  json(src, mode, opts) {
    return layout(parse(src), mode === 'text' ? cellRuler() : pixelRuler(), layoutOptions(opts));
  },
});
