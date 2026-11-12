import { pixelRuler } from '../metrics.ts';
import { registerFrontEnd } from '../registry.ts';
import { renderThemedScene } from '../render/scene-svg.ts';
import { layoutQuadrant } from './layout.ts';
import { parseQuadrant } from './parse.ts';
import { quadrantTextLines } from './text.ts';

const escapeXml = (t: string): string => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

registerFrontEnd({
  name: 'quadrant',
  headers: ['quadrantChart'],
  svg(src, opts) {
    const chart = parseQuadrant(src, opts);
    const layout = layoutQuadrant(chart, pixelRuler(), opts.theme ?? 'solid');
    const svg = renderThemedScene(layout.scene, { theme: opts.theme ?? 'solid', ...(opts.title === undefined ? {} : { title: opts.title }) });
    return chart.accDescr === undefined || chart.accDescr === '' ? svg : svg.replace('</title>', `</title><desc>${escapeXml(chart.accDescr)}</desc>`);
  },
  textLines(src, maxWidth, opts) {
    return quadrantTextLines(parseQuadrant(src, opts), maxWidth);
  },
  json(src, _mode, opts) {
    return layoutQuadrant(parseQuadrant(src, opts), pixelRuler(), opts.theme ?? 'solid');
  },
});
