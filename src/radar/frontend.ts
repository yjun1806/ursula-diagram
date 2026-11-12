import { pixelRuler } from '../metrics.ts';
import { registerFrontEnd } from '../registry.ts';
import type { FrontEnd } from '../registry.ts';
import { renderThemedScene } from '../render/scene-svg.ts';
import { layoutRadar } from './layout.ts';
import { parseRadar } from './parse.ts';
import { radarTextLines } from './text.ts';

export const radarFrontEnd: FrontEnd = {
  name: 'radar',
  headers: ['radar-beta', 'radar'],
  svg(src, opts) {
    const theme = opts.theme ?? 'solid';
    const layout = layoutRadar(parseRadar(src, opts.heading), pixelRuler(), theme);
    return renderThemedScene(layout.scene, { theme, ...(opts.title === undefined ? {} : { title: opts.title }) });
  },
  textLines(src, maxWidth, opts) {
    return radarTextLines(parseRadar(src, opts.heading), maxWidth);
  },
  json(src, _mode, opts) {
    return layoutRadar(parseRadar(src, opts.heading), pixelRuler(), opts.theme ?? 'solid');
  },
};

registerFrontEnd(radarFrontEnd);
