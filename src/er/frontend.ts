import { layout } from '../layout/index.ts';
import { cellWidth, cellRuler, pixelRuler } from '../metrics.ts';
import { registerFrontEnd } from '../registry.ts';
import type { RenderOptions, TextOptions } from '../registry.ts';
import { renderSvg } from '../render/svg.ts';
import { renderTextLayout } from '../render/text.ts';
import type { Graph, Layout } from '../types.ts';
import { parseEr } from './parse.ts';
import { titledLines } from '../front/title.ts';

const summary = (g: Graph): string => `Entity relationship diagram: ${g.nodes.length} entities, ${g.edges.length} relationships`;

function pixels(src: string, opts: RenderOptions): Layout & { title: string } {
  const model = parseEr(src, opts.heading);
  const laid = layout({ ...model.graph, placer: 'c4-grid' }, pixelRuler(), {
    legend: false,
    ...(opts.quality === undefined ? {} : { quality: opts.quality }),
    ...(opts.maxWidth === undefined ? {} : { maxWidth: opts.maxWidth }),
  });
  return { ...laid, title: opts.title ?? model.title ?? summary(model.graph) };
}

/** The graph with every entity reduced to its head: the fallback of a terminal that is too narrow for the attributes. */
const headsOnly = (g: Graph): Graph => ({ ...g, nodes: g.nodes.map((n) => ({ ...n, compartments: (n.compartments ?? []).slice(0, 1) })) });

function terminal(src: string, maxWidth: number | undefined, opts: TextOptions): string[] {
  const model = parseEr(src, opts.heading);
  const draw = (g: Graph, fold: boolean, squeeze = true): string[] =>
    renderTextLayout(
      layout(g, cellRuler(), {
        legend: false,
        fold,
        squeeze,
        ...(opts.quality === undefined ? {} : { quality: opts.quality }),
        ...(maxWidth === undefined ? {} : { maxWidth }),
        ...(opts.maxHeight === undefined ? {} : { maxHeight: opts.maxHeight }),
      }),
    );
  const widest = (lines: string[]): number => Math.max(0, ...lines.map(cellWidth));
  // The attributes are drawn only when they fit as they are laid out; the heads alone may be pushed together to fit.
  const full = draw(model.graph, true, false);
  if (maxWidth === undefined || widest(full) <= maxWidth) return full;
  const heads = draw(headsOnly(model.graph), true);
  return widest(heads) < widest(full) ? heads : full;
}

registerFrontEnd({
  name: 'er',
  headers: ['erDiagram'],
  svg(src, opts) {
    const { title, ...laid } = pixels(src, opts);
    return renderSvg(laid, { title, legend: false, ...(opts.theme === undefined ? {} : { theme: opts.theme }), ...(opts.heading === undefined ? {} : { drawTitle: opts.heading }) });
  },
  textLines(src, maxWidth, opts) {
    return titledLines(terminal(src, maxWidth, opts), opts.heading, maxWidth);
  },
  json(src, mode, opts) {
    const model = parseEr(src, opts.heading);
    return mode === 'text' ? layout(model.graph, cellRuler(), { legend: false, ...(opts.maxWidth === undefined ? {} : { maxWidth: opts.maxWidth }) }) : pixels(src, opts);
  },
});
