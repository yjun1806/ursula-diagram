import { layout } from '../layout/index.ts';
import { cellRuler, pixelRuler } from '../metrics.ts';
import { registerFrontEnd } from '../registry.ts';
import type { RenderOptions } from '../registry.ts';
import { renderSvg } from '../render/svg.ts';
import { renderTextLayout } from '../render/text.ts';
import type { Layout } from '../types.ts';
import { parseState } from './parse.ts';
import { titledLines } from '../front/title.ts';

type Opts = Pick<RenderOptions, 'maxWidth' | 'legend' | 'engine' | 'composition' | 'questions' | 'elbows' | 'quality'>;

function drawn(src: string, ruler: ReturnType<typeof pixelRuler>, opts: Opts): { layout: Layout; title: string | undefined } {
  const { graph, accTitle } = parseState(src);
  const laid = layout(graph, ruler, {
    legend: false,
    ...(opts.engine === undefined ? {} : { engine: opts.engine }),
    ...(opts.composition === undefined ? {} : { composition: opts.composition }),
    ...(opts.questions === undefined ? {} : { questions: opts.questions }),
    ...(opts.elbows === undefined ? {} : { elbows: opts.elbows }),
    ...(opts.quality === undefined ? {} : { quality: opts.quality }),
    ...(opts.maxWidth === undefined ? {} : { maxWidth: opts.maxWidth }),
  });
  return { layout: laid, title: accTitle };
}

registerFrontEnd({
  name: 'state',
  headers: ['stateDiagram', 'stateDiagram-v2'],
  svg(src, opts) {
    const { layout: laid, title } = drawn(src, pixelRuler(), opts);
    const name = opts.title ?? title ?? opts.heading;
    return renderSvg(laid, { ...(opts.theme === undefined ? {} : { theme: opts.theme }), ...(opts.node === undefined ? {} : { node: opts.node }), ...(name === undefined ? {} : { title: name }), ...(opts.heading === undefined ? {} : { drawTitle: opts.heading }) });
  },
  textLines(src, maxWidth, opts) {
    return titledLines(renderTextLayout(drawn(src, cellRuler(), { ...opts, ...(maxWidth === undefined ? {} : { maxWidth }) }).layout), opts.heading, maxWidth);
  },
  json(src, mode, opts) {
    return drawn(src, mode === 'text' ? cellRuler() : pixelRuler(), opts).layout;
  },
});
