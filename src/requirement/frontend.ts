import { layout } from '../layout/index.ts';
import { cellRuler, pixelRuler } from '../metrics.ts';
import { registerFrontEnd } from '../registry.ts';
import type { FrontEnd } from '../registry.ts';
import { renderSvg } from '../render/svg.ts';
import { renderTextLayout } from '../render/text.ts';
import { requirementGraph } from './graph.ts';
import { parseRequirement } from './parse.ts';

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
    const laid = layout(requirementGraph(model, ruler), ruler, { ...(maxWidth === undefined ? {} : { maxWidth }), ...(quality === undefined ? {} : { quality }) });
    return renderSvg(laid, { title, ...(svgOpts.theme === undefined ? {} : { theme: svgOpts.theme }) });
  },
  textLines(src, maxWidth, opts) {
    const ruler = cellRuler();
    const laid = layout(requirementGraph(parseRequirement(src), ruler), ruler, { ...(maxWidth === undefined ? {} : { maxWidth }), ...(opts.quality === undefined ? {} : { quality: opts.quality }) });
    return renderTextLayout(laid);
  },
  json(src, mode, opts) {
    const ruler = mode === 'text' ? cellRuler() : pixelRuler();
    return layout(requirementGraph(parseRequirement(src), ruler), ruler, { ...(opts.maxWidth === undefined ? {} : { maxWidth: opts.maxWidth }) });
  },
};

registerFrontEnd(requirementFrontEnd);
