import { layout } from '../layout/index.ts';
import { cellRuler, pixelRuler } from '../metrics.ts';
import { registerFrontEnd } from '../registry.ts';
import { renderSvg } from '../render/svg.ts';
import { renderTextLayout } from '../render/text.ts';
import type { Layout } from '../types.ts';
import { c4Graph } from './graph.ts';
import { parseC4 } from './parse.ts';
import { titledLines } from '../front/title.ts';

function draw(src: string, mode: 'svg' | 'text', maxWidth: number | undefined): { layout: Layout; title: string | undefined; shown: string | undefined } {
  const model = parseC4(src);
  const ruler = mode === 'text' ? cellRuler() : pixelRuler();
  let laid = layout(c4Graph(model, ruler), ruler, { ...(maxWidth === undefined ? {} : { maxWidth }) });
  // A terminal drawing that is too wide is made again with its descriptions wrapped narrower.
  for (const cells of mode === 'text' && maxWidth !== undefined ? [22, 18, 14, 10] : []) {
    if (maxWidth === undefined || laid.width <= maxWidth) break;
    const narrow = layout(c4Graph(model, ruler, cells), ruler, { maxWidth });
    if (narrow.width < laid.width) laid = narrow;
  }
  return { layout: laid, title: model.accTitle ?? model.title, shown: model.title };
}

registerFrontEnd({
  name: 'c4',
  headers: ['C4Context', 'C4Container', 'C4Component', 'C4Dynamic', 'C4Deployment'],
  svg(src, opts) {
    const { layout: laid, title, shown } = draw(src, 'svg', opts.maxWidth);
    const heading = shown === undefined || shown === '' ? opts.heading : shown;
    const name = opts.title ?? title ?? opts.heading;
    return renderSvg(laid, { ...(name === undefined ? {} : { title: name }), ...(opts.theme === undefined ? {} : { theme: opts.theme }), ...(heading === undefined ? {} : { drawTitle: heading }) });
  },
  textLines(src, maxWidth, opts) {
    const { layout: laid, shown } = draw(src, 'text', maxWidth);
    return titledLines(renderTextLayout(laid), shown === undefined || shown === '' ? opts.heading : shown, maxWidth);
  },
  json(src, mode, opts) {
    return draw(src, mode, opts.maxWidth).layout;
  },
});
