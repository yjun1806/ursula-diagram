import { pixelRuler } from '../metrics.ts';
import { registerFrontEnd } from '../registry.ts';
import { renderThemedScene } from '../render/scene-svg.ts';
import { layoutJourney } from './layout.ts';
import { parseJourney } from './parse.ts';
import { journeyTextLines } from './text.ts';

const escapeXml = (t: string): string => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

registerFrontEnd({
  name: 'journey',
  headers: ['journey'],
  svg(src, opts) {
    const theme = opts.theme ?? 'solid';
    const journey = parseJourney(src, opts.heading);
    const layout = layoutJourney(journey, pixelRuler(), theme, opts.maxWidth === undefined ? {} : { maxWidth: opts.maxWidth });
    const svg = renderThemedScene(layout.scene, { theme, ...(opts.title === undefined ? {} : { title: opts.title }) });
    return journey.accDescr === undefined || journey.accDescr === '' ? svg : svg.replace('</title>', `</title><desc>${escapeXml(journey.accDescr)}</desc>`);
  },
  textLines(src, maxWidth, opts) {
    return journeyTextLines(parseJourney(src, opts.heading), maxWidth);
  },
  json(src, _mode, opts) {
    const journey = parseJourney(src, opts.heading);
    return { journey, ...layoutJourney(journey, pixelRuler(), opts.theme ?? 'solid', opts.maxWidth === undefined ? {} : { maxWidth: opts.maxWidth }) };
  },
});
