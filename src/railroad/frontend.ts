import { cellRuler, pixelRuler } from '../metrics.ts';
import { registerFrontEnd } from '../registry.ts';
import { renderThemedScene } from '../render/scene-svg.ts';
import { layoutRailroad } from './layout.ts';
import { parseRailroad } from './parse.ts';
import { railroadTextLines } from './text.ts';

registerFrontEnd({
  name: 'railroad',
  headers: ['railroad-beta', 'railroad-ebnf-beta', 'railroad-abnf-beta', 'railroad-peg-beta'],
  svg(src, opts) {
    const layout = layoutRailroad(parseRailroad(src, opts.heading), pixelRuler());
    return renderThemedScene(layout.scene, opts.title === undefined ? {} : { title: opts.title });
  },
  textLines(src, maxWidth, opts) {
    return railroadTextLines(parseRailroad(src, opts.heading), maxWidth);
  },
  json(src, mode, opts) {
    const model = parseRailroad(src, opts.heading);
    return { model, ...layoutRailroad(model, mode === 'text' ? cellRuler() : pixelRuler()) };
  },
});
