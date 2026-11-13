import { withDescription } from '../front/accessibility.ts';
import { layout } from '../layout/index.ts';
import { cellRuler, pixelRuler } from '../metrics.ts';
import { registerFrontEnd } from '../registry.ts';
import type { RenderOptions } from '../registry.ts';
import { renderSvg } from '../render/svg.ts';
import type { NodeHook } from '../render/svg.ts';
import { renderTextLayout } from '../render/text.ts';
import type { LayoutNode } from '../types.ts';
import type { UsecaseModel } from './model.ts';
import { parseUsecase } from './parse.ts';
import { titledLines } from '../front/title.ts';

const num = (n: number): string => String(Math.round(n * 100) / 100);

/** Marks the engine has no shape for: the business slash, and the kind of an actor figure, which also stays in `data-` attributes. */
function nodeHook(model: UsecaseModel): NodeHook {
  return (node: LayoutNode) => {
    const m = model.meta.get(node.id);
    if (!m) return undefined;
    const attrs: Record<string, string> = { 'data-kind': m.kind };
    if (m.variant !== undefined && m.variant !== 'normal') attrs['data-variant'] = m.variant;
    if (m.business === true) attrs['data-business'] = 'true';
    if (m.stereotype !== undefined) attrs['data-stereotype'] = m.stereotype;
    let extra = '';
    if (m.business === true && m.kind === 'usecase' && node.shape === 'ellipse') {
      // The slash is a chord that cuts the lower-left of the ellipse, with both ends on the outline.
      const cx = node.x + node.w / 2;
      const cy = node.y + node.h / 2;
      const at = (t: number): string => `${num(cx + (node.w / 2) * Math.cos(t))} ${num(cy + (node.h / 2) * Math.sin(t))}`;
      extra = `<path class="ursula-actor" d="M${at(Math.PI * 0.93)}L${at(Math.PI * 0.62)}"/>`;
    } else if (m.business === true && m.kind === 'actor') {
      // The slash crosses the body of the figure.
      const cx = node.x + node.w / 2;
      extra = `<path class="ursula-actor" d="M${num(cx - 9)} ${num(node.y + 34)}L${num(cx + 9)} ${num(node.y + 18)}"/>`;
    }
    return { attrs, extra };
  };
}

function summary(model: UsecaseModel): string {
  const actors = [...model.meta.values()].filter((m) => m.kind === 'actor').length;
  return `Use case diagram: ${actors} actors, ${model.graph.nodes.length - actors} other elements, ${model.graph.edges.length} lines`;
}

function laidOut(model: UsecaseModel, opts: RenderOptions, text: boolean) {
  return layout(model.graph, text ? cellRuler() : pixelRuler(), {
    ...(opts.engine === undefined ? {} : { engine: opts.engine }),
    ...(opts.quality === undefined ? {} : { quality: opts.quality }),
    ...(opts.maxWidth === undefined ? {} : { maxWidth: opts.maxWidth }),
    ...(text ? { fold: true } : {}),
    legend: false,
  });
}

registerFrontEnd({
  name: 'usecase',
  headers: ['usecase-beta'],
  svg(src, opts) {
    const model = parseUsecase(src);
    const title = opts.title ?? model.accTitle ?? opts.heading ?? summary(model);
    const svg = renderSvg(laidOut(model, opts, false), { ...opts, title, node: nodeHook(model), legend: false, ...(opts.heading === undefined ? {} : { drawTitle: opts.heading }) });
    return withDescription(svg, model.accDescr);
  },
  textLines(src, maxWidth, opts) {
    const model = parseUsecase(src);
    return titledLines(renderTextLayout(laidOut(model, { ...opts, ...(maxWidth === undefined ? {} : { maxWidth }) }, true)), opts.heading, maxWidth);
  },
  json(src, mode, opts) {
    const model = parseUsecase(src);
    return { graph: model.graph, layout: laidOut(model, opts, mode === 'text') };
  },
});
