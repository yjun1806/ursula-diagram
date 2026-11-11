import { cellRuler, pixelRuler } from '../metrics.ts';
import { registerFrontEnd } from '../registry.ts';
import { renderSceneSvg } from '../render/svg.ts';
import { renderTextScene } from '../render/text.ts';
import { layoutSequence } from './layout.ts';
import { parseSequence } from './parse.ts';

registerFrontEnd({
  name: 'sequence',
  headers: ['sequenceDiagram'],
  svg(src, opts) {
    const layout = layoutSequence(parseSequence(src), pixelRuler(), opts.maxWidth === undefined ? {} : { maxWidth: opts.maxWidth });
    return renderSceneSvg(layout.scene, opts.title === undefined ? {} : { title: opts.title });
  },
  textLines(src, maxWidth) {
    const layout = layoutSequence(parseSequence(src), cellRuler(), maxWidth === undefined ? {} : { maxWidth });
    return renderTextScene(layout.scene);
  },
  json(src, mode, opts) {
    const ruler = mode === 'text' ? cellRuler() : pixelRuler();
    return layoutSequence(parseSequence(src), ruler, opts.maxWidth === undefined ? {} : { maxWidth: opts.maxWidth });
  },
});
