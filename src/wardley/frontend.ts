import { withDescription } from '../front/accessibility.ts';
import { pixelRuler } from '../metrics.ts';
import { registerFrontEnd } from '../registry.ts';
import { renderThemedScene } from '../render/scene-svg.ts';
import { layoutWardley } from './layout.ts';
import { parseWardley } from './parse.ts';
import { wardleyTextLines } from './text.ts';

registerFrontEnd({
  name: 'wardley',
  headers: ['wardley-beta', 'wardley'],
  svg(src, opts) {
    const map = parseWardley(src, opts);
    const layout = layoutWardley(map, pixelRuler());
    const svg = renderThemedScene(layout.scene, opts.title === undefined ? {} : { title: opts.title });
    return withDescription(svg, map.accDescr);
  },
  textLines(src, maxWidth, opts) {
    return wardleyTextLines(parseWardley(src, opts), maxWidth);
  },
  json(src, _mode, opts) {
    const map = parseWardley(src, opts);
    return { model: map, ...layoutWardley(map, pixelRuler()) };
  },
});
