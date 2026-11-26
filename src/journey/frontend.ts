import { withDescription } from '../front/accessibility.ts';
import { pixelRuler } from '../metrics.ts';
import { registerFrontEnd } from '../registry.ts';
import { renderThemedScene } from '../render/scene-svg.ts';
import { layoutJourney } from './layout.ts';
import { parseJourney } from './parse.ts';
import { journeyTextSpans } from './text.ts';
import { joinSpans } from '../text/terminal.ts';

registerFrontEnd({
  name: 'journey',
  headers: ['journey'],
  svg(src, opts) {
    const journey = parseJourney(src, opts.heading);
    const layout = layoutJourney(journey, pixelRuler(), opts.maxWidth === undefined ? {} : { maxWidth: opts.maxWidth });
    const svg = renderThemedScene(layout.scene, opts.title === undefined ? {} : { title: opts.title });
    return withDescription(svg, journey.accDescr);
  },
  textLines(src, maxWidth, opts) {
    return journeyTextSpans(parseJourney(src, opts.heading), maxWidth).map(joinSpans);
  },
  textSpans(src, maxWidth, opts) {
    return journeyTextSpans(parseJourney(src, opts.heading), maxWidth);
  },
  json(src, _mode, opts) {
    const journey = parseJourney(src, opts.heading);
    return { journey, ...layoutJourney(journey, pixelRuler(), opts.maxWidth === undefined ? {} : { maxWidth: opts.maxWidth }) };
  },
});
