import { frontOf } from '../front/options.ts';
import { cellRuler, pixelRuler } from '../metrics.ts';
import { registerFrontEnd } from '../registry.ts';
import { renderThemedScene } from '../render/scene-svg.ts';
import { layoutXychart } from './layout.ts';
import { parseXychart } from './parse.ts';
import { xychartTable } from './text.ts';
import { DEFAULT_THEME } from '../render/theme.ts';

const read = (src: string, opts: object) => {
  const front = frontOf(opts);
  return parseXychart(src, front.config, front.heading);
};

registerFrontEnd({
  name: 'xychart',
  headers: ['xychart', 'xychart-beta'],
  svg(src, opts) {
    const layout = layoutXychart(read(src, opts), pixelRuler(), opts.theme ?? DEFAULT_THEME);
    return renderThemedScene(layout.scene, { theme: opts.theme ?? DEFAULT_THEME, ...(opts.title === undefined ? {} : { title: opts.title }) });
  },
  textLines(src, maxWidth, opts) {
    return xychartTable(read(src, opts), cellRuler(), maxWidth);
  },
  json(src, mode, opts) {
    const chart = read(src, opts);
    return { chart, layout: layoutXychart(chart, pixelRuler(), opts.theme ?? DEFAULT_THEME) };
  },
});
