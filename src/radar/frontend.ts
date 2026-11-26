import { frontOf } from '../front/options.ts';
import { pixelRuler } from '../metrics.ts';
import { registerFrontEnd } from '../registry.ts';
import type { FrontEnd } from '../registry.ts';
import { renderThemedScene } from '../render/scene-svg.ts';
import { layoutRadar } from './layout.ts';
import { parseRadar } from './parse.ts';
import { radarTextSpans } from './text.ts';
import { joinSpans } from '../text/terminal.ts';

export const radarFrontEnd: FrontEnd = {
  name: 'radar',
  headers: ['radar-beta', 'radar'],
  svg(src, opts) {
    const layout = layoutRadar(parseRadar(src, opts.heading, frontOf(opts).config), pixelRuler());
    return renderThemedScene(layout.scene, opts.title === undefined ? {} : { title: opts.title });
  },
  textLines(src, maxWidth, opts) {
    return radarTextSpans(parseRadar(src, opts.heading, frontOf(opts).config), maxWidth).map(joinSpans);
  },
  textSpans(src, maxWidth, opts) {
    return radarTextSpans(parseRadar(src, opts.heading, frontOf(opts).config), maxWidth);
  },
  json(src, _mode, opts) {
    return layoutRadar(parseRadar(src, opts.heading, frontOf(opts).config), pixelRuler());
  },
};

registerFrontEnd(radarFrontEnd);
