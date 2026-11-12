import { cellRuler, pixelRuler } from '../metrics.ts';
import { registerFrontEnd } from '../registry.ts';
import type { FrontEnd } from '../registry.ts';
import { renderThemedScene } from '../render/scene-svg.ts';
import { layoutVenn } from './layout.ts';
import { parseVenn } from './parse.ts';
import { vennTextLines } from './text.ts';

export const vennFrontEnd: FrontEnd = {
  name: 'venn',
  headers: ['venn-beta'],
  svg(src, opts) {
    const layout = layoutVenn(parseVenn(src, opts.heading), pixelRuler());
    return renderThemedScene(layout.scene, { ...(opts.title === undefined ? {} : { title: opts.title }), ...(opts.theme === undefined ? {} : { theme: opts.theme }) });
  },
  textLines(src, maxWidth, opts) {
    return vennTextLines(parseVenn(src, opts.heading), maxWidth);
  },
  json(src, mode, opts) {
    const venn = parseVenn(src, opts.heading);
    return { venn, ...layoutVenn(venn, mode === 'text' ? cellRuler() : pixelRuler()) };
  },
};

registerFrontEnd(vennFrontEnd);
