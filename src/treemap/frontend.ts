import { frontOf } from '../front/options.ts';
import { cellRuler, pixelRuler } from '../metrics.ts';
import { registerFrontEnd } from '../registry.ts';
import { renderThemedScene } from '../render/scene-svg.ts';
import { layoutTreemap } from './layout.ts';
import { parseTreemap } from './parse.ts';
import { treemapTextSpans } from './text.ts';
import { joinSpans } from '../text/terminal.ts';

const read = (src: string, opts: object) => {
  const front = frontOf(opts);
  return parseTreemap(src, front.heading, front.config);
};

registerFrontEnd({
  name: 'treemap',
  headers: ['treemap-beta', 'treemap'],
  svg(src, opts) {
    const layout = layoutTreemap(read(src, opts), pixelRuler());
    return renderThemedScene(layout.scene, opts.title === undefined ? {} : { title: opts.title });
  },
  textLines(src, maxWidth, opts) {
    return treemapTextSpans(read(src, opts), maxWidth).map(joinSpans);
  },
  textSpans(src, maxWidth, opts) {
    return treemapTextSpans(read(src, opts), maxWidth);
  },
  json(src, mode, opts) {
    const treemap = read(src, opts);
    return { treemap, ...layoutTreemap(treemap, mode === 'text' ? cellRuler() : pixelRuler()) };
  },
});
