import { frontOf } from '../front/options.ts';
import { cellRuler, pixelRuler } from '../metrics.ts';
import { registerFrontEnd } from '../registry.ts';
import type { FrontEnd } from '../registry.ts';
import { renderThemedScene } from '../render/scene-svg.ts';
import { layoutPie } from './layout.ts';
import { parsePie } from './parse.ts';
import { pieTextLines } from './text.ts';

export const pieFrontEnd: FrontEnd = {
  name: 'pie',
  headers: ['pie'],
  svg(src, opts) {
    const layout = layoutPie(parsePie(src, frontOf(opts).heading, frontOf(opts).config), pixelRuler());
    return renderThemedScene(layout.scene, opts.title === undefined ? {} : { title: opts.title });
  },
  textLines(src, maxWidth, opts) {
    return pieTextLines(parsePie(src, frontOf(opts).heading, frontOf(opts).config), maxWidth);
  },
  json(src, mode, opts) {
    const pie = parsePie(src, frontOf(opts).heading, frontOf(opts).config);
    return { pie, ...layoutPie(pie, mode === 'text' ? cellRuler() : pixelRuler()) };
  },
};

registerFrontEnd(pieFrontEnd);
