import { cellRuler, pixelRuler } from '../metrics.ts';
import { registerFrontEnd } from '../registry.ts';
import { renderThemedScene } from '../render/scene-svg.ts';
import type { SequenceLayoutOptions } from '../sequence/layout.ts';
import type { SequenceLegendOption } from '../sequence/model.ts';
import { joinSpans, layoutSequenceText } from '../sequence/text.ts';
import type { TextSpan } from '../types.ts';
import { layoutZenuml } from './layout.ts';
import { parseZenuml } from './parse.ts';

function layoutOptions(maxWidth: number | undefined, legend: SequenceLegendOption | undefined): SequenceLayoutOptions {
  return { ...(maxWidth === undefined ? {} : { maxWidth }), ...(legend === undefined ? {} : { legend }) };
}

function textSpans(src: string, maxWidth: number | undefined, heading: string | undefined, legend: SequenceLegendOption | undefined): TextSpan[][] {
  const model = parseZenuml(src, heading);
  const body = layoutSequenceText(model.sequence, cellRuler(), maxWidth, legend ?? false);
  return model.title === undefined ? body : [[{ text: model.title, tone: 'bold' }], [], ...body];
}

registerFrontEnd({
  name: 'zenuml',
  headers: ['zenuml'],
  svg(src, opts) {
    const model = parseZenuml(src, opts.heading);
    const layout = layoutZenuml(model, pixelRuler(), layoutOptions(opts.maxWidth, opts.legend));
    const title = opts.title ?? model.accTitle ?? model.title;
    return renderThemedScene(layout.scene, {
      ...(title === undefined ? {} : { title }),
      ...(opts.theme === undefined ? {} : { theme: opts.theme }),
    });
  },
  textLines(src, maxWidth, opts) {
    return textSpans(src, maxWidth, opts.heading, opts.legend).map(joinSpans);
  },
  textSpans(src, maxWidth, opts) {
    return textSpans(src, maxWidth, opts.heading, opts.legend);
  },
  json(src, mode, opts) {
    const model = parseZenuml(src, opts.heading);
    const ruler = mode === 'text' ? cellRuler() : pixelRuler();
    return { ...model, tags: [...model.tags], layout: layoutZenuml(model, ruler, layoutOptions(opts.maxWidth, opts.legend)) };
  },
});
