import { withDescription } from '../front/accessibility.ts';
import { pixelRuler } from '../metrics.ts';
import { registerFrontEnd } from '../registry.ts';
import { renderThemedScene } from '../render/scene-svg.ts';
import { layoutQuadrant } from './layout.ts';
import { parseQuadrant } from './parse.ts';
import { quadrantTextSpans } from './text.ts';
import { joinSpans } from '../text/terminal.ts';

registerFrontEnd({
  name: 'quadrant',
  headers: ['quadrantChart'],
  svg(src, opts) {
    const chart = parseQuadrant(src, opts);
    const layout = layoutQuadrant(chart, pixelRuler());
    const svg = renderThemedScene(layout.scene, opts.title === undefined ? {} : { title: opts.title });
    return withDescription(svg, chart.accDescr);
  },
  textLines(src, maxWidth, opts) {
    return quadrantTextSpans(parseQuadrant(src, opts), maxWidth).map(joinSpans);
  },
  textSpans(src, maxWidth, opts) {
    return quadrantTextSpans(parseQuadrant(src, opts), maxWidth);
  },
  json(src, _mode, opts) {
    return layoutQuadrant(parseQuadrant(src, opts), pixelRuler());
  },
});
