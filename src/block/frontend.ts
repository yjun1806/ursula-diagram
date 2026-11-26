import { cellRuler, pixelRuler } from '../metrics.ts';
import { registerFrontEnd } from '../registry.ts';
import { renderThemedScene } from '../render/scene-svg.ts';
import { layoutBlock } from './layout.ts';
import { parseBlock } from './parse.ts';
import { blockTextSpans } from './text.ts';
import { joinSpans } from '../text/terminal.ts';

registerFrontEnd({
  name: 'block',
  headers: ['block', 'block-beta'],
  svg(src, opts) {
    const model = parseBlock(src, opts.heading);
    const layout = layoutBlock(model, pixelRuler());
    return renderThemedScene(layout.scene, opts.title === undefined ? {} : { title: opts.title });
  },
  textLines(src, maxWidth, opts) {
    return blockTextSpans(parseBlock(src, opts.heading), maxWidth).map(joinSpans);
  },
  textSpans(src, maxWidth, opts) {
    return blockTextSpans(parseBlock(src, opts.heading), maxWidth);
  },
  json(src, mode, opts) {
    const model = parseBlock(src, opts.heading);
    return { model, ...layoutBlock(model, mode === 'text' ? cellRuler() : pixelRuler()) };
  },
});
