import { layout } from '../layout/index.ts';
import { layoutOptionsOf } from '../layout/options.ts';
import { cellRuler, pixelRuler } from '../metrics.ts';
import { registerFrontEnd } from '../registry.ts';
import type { FrontEnd } from '../registry.ts';
import { renderSvg } from '../render/svg.ts';
import { renderTextLayout, renderTextLayoutSpans } from '../render/text.ts';
import { requirementGraph } from './graph.ts';
import { parseRequirement } from './parse.ts';
import { titledLines, titledSpans } from '../front/title.ts';

export const requirementFrontEnd: FrontEnd = {
  name: 'requirement',
  headers: ['requirementDiagram'],
  svg(src, opts) {
    const model = parseRequirement(src);
    const ruler = pixelRuler();
    const { maxWidth, quality, ...svgOpts } = opts;
    const requirements = model.nodes.filter((n) => n.kind === 'requirement').length;
    const summary = `Requirement diagram: ${requirements} requirements, ${model.nodes.length - requirements} elements, ${model.relations.length} relations`;
    const title = svgOpts.title ?? model.accTitle ?? opts.heading ?? summary;
    const laid = layout(requirementGraph(model, ruler), ruler, layoutOptionsOf({ maxWidth, quality }));
    return renderSvg(laid, { title, ...(opts.heading === undefined ? {} : { drawTitle: opts.heading }) });
  },
  textLines(src, maxWidth, opts) {
    const ruler = cellRuler();
    const laid = layout(requirementGraph(parseRequirement(src), ruler), ruler, layoutOptionsOf({ maxWidth, quality: opts.quality }));
    return titledLines(renderTextLayout(laid), opts.heading, maxWidth);
  },
  textSpans(src, maxWidth, opts) {
    const ruler = cellRuler();
    const laid = layout(requirementGraph(parseRequirement(src), ruler), ruler, layoutOptionsOf({ maxWidth, quality: opts.quality }));
    return titledSpans(renderTextLayoutSpans(laid), opts.heading, maxWidth);
  },
  json(src, mode, opts) {
    const ruler = mode === 'text' ? cellRuler() : pixelRuler();
    return layout(requirementGraph(parseRequirement(src), ruler), ruler, layoutOptionsOf({ maxWidth: opts.maxWidth, quality: opts.quality }));
  },
};

registerFrontEnd(requirementFrontEnd);
