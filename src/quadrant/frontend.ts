import { withDescription } from '../front/accessibility.ts';
import { pixelRuler } from '../metrics.ts';
import { registerFrontEnd } from '../registry.ts';
import { renderThemedScene } from '../render/scene-svg.ts';
import { layoutQuadrant } from './layout.ts';
import { parseQuadrant } from './parse.ts';
import { quadrantTextLines } from './text.ts';
import { DEFAULT_THEME } from '../render/theme.ts';

registerFrontEnd({
  name: 'quadrant',
  headers: ['quadrantChart'],
  svg(src, opts) {
    const chart = parseQuadrant(src, opts);
    const layout = layoutQuadrant(chart, pixelRuler(), opts.theme ?? DEFAULT_THEME);
    const svg = renderThemedScene(layout.scene, { theme: opts.theme ?? DEFAULT_THEME, ...(opts.title === undefined ? {} : { title: opts.title }) });
    return withDescription(svg, chart.accDescr);
  },
  textLines(src, maxWidth, opts) {
    return quadrantTextLines(parseQuadrant(src, opts), maxWidth);
  },
  json(src, _mode, opts) {
    return layoutQuadrant(parseQuadrant(src, opts), pixelRuler(), opts.theme ?? DEFAULT_THEME);
  },
});
