import { layout } from '../layout/index.ts';
import { cellRuler, pixelRuler } from '../metrics.ts';
import { registerFrontEnd } from '../registry.ts';
import { renderSvg } from '../render/svg.ts';
import { renderTextLayout } from '../render/text.ts';
import type { Layout } from '../types.ts';
import { c4Graph } from './graph.ts';
import { parseC4 } from './parse.ts';

function draw(src: string, mode: 'svg' | 'text', maxWidth: number | undefined): { layout: Layout; title: string | undefined } {
  const model = parseC4(src);
  // 64: a label chip (24) and 20 of line on each side fit in one gap; at 48 every gap with a label takes a whole extra place (88).
  const ruler = mode === 'text' ? cellRuler() : { ...pixelRuler(), rankGap: 64 };
  const laid = layout(c4Graph(model, ruler), ruler, { ...(maxWidth === undefined ? {} : { maxWidth }) });
  return { layout: laid, title: model.accTitle ?? model.title };
}

registerFrontEnd({
  name: 'c4',
  headers: ['C4Context', 'C4Container', 'C4Component', 'C4Dynamic', 'C4Deployment'],
  svg(src, opts) {
    const { layout: laid, title } = draw(src, 'svg', opts.maxWidth);
    const name = opts.title ?? title ?? opts.heading;
    return renderSvg(laid, { ...(name === undefined ? {} : { title: name }), ...(opts.theme === undefined ? {} : { theme: opts.theme }) });
  },
  textLines(src, maxWidth) {
    return renderTextLayout(draw(src, 'text', maxWidth).layout);
  },
  json(src, mode, opts) {
    return draw(src, mode, opts.maxWidth).layout;
  },
});
