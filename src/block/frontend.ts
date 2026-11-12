import { cellRuler, pixelRuler } from '../metrics.ts';
import { registerFrontEnd } from '../registry.ts';
import { renderThemedScene } from '../render/scene-svg.ts';
import { layoutBlock } from './layout.ts';
import { parseBlock } from './parse.ts';
import { blockTextLines } from './text.ts';

registerFrontEnd({
  name: 'block',
  headers: ['block', 'block-beta'],
  svg(src, opts) {
    const model = parseBlock(src, opts.heading);
    const layout = layoutBlock(model, pixelRuler(), opts.theme);
    return renderThemedScene(layout.scene, { ...(opts.title === undefined ? {} : { title: opts.title }), ...(opts.theme === undefined ? {} : { theme: opts.theme }) });
  },
  textLines(src, maxWidth, opts) {
    return blockTextLines(parseBlock(src, opts.heading), maxWidth);
  },
  json(src, mode, opts) {
    const model = parseBlock(src, opts.heading);
    return { model, ...layoutBlock(model, mode === 'text' ? cellRuler() : pixelRuler(), opts.theme) };
  },
});
