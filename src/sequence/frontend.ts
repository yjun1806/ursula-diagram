import { cellRuler, pixelRuler } from '../metrics.ts';
import { registerFrontEnd } from '../registry.ts';
import { renderSceneSvg } from '../render/svg.ts';
import { renderTextScene } from '../render/text.ts';
import { layoutSequence } from './layout.ts';
import type { SequenceLayoutOptions } from './layout.ts';
import type { SequenceLegendOption } from './model.ts';
import { parseSequence } from './parse.ts';

function layoutOptions(maxWidth: number | undefined, legend: SequenceLegendOption | undefined): SequenceLayoutOptions {
  return { ...(maxWidth === undefined ? {} : { maxWidth }), ...(legend === undefined ? {} : { legend }) };
}

registerFrontEnd({
  name: 'sequence',
  headers: ['sequenceDiagram'],
  svg(src, opts) {
    const layout = layoutSequence(parseSequence(src), pixelRuler(), layoutOptions(opts.maxWidth, opts.legend));
    return renderSceneSvg(layout.scene, opts.title === undefined ? {} : { title: opts.title });
  },
  textLines(src, maxWidth, opts) {
    const layout = layoutSequence(parseSequence(src), cellRuler(), layoutOptions(maxWidth, opts.legend));
    return renderTextScene(layout.scene);
  },
  json(src, mode, opts) {
    const ruler = mode === 'text' ? cellRuler() : pixelRuler();
    return layoutSequence(parseSequence(src), ruler, layoutOptions(opts.maxWidth, opts.legend));
  },
});
