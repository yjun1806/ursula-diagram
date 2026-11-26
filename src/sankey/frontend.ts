import { frontOf } from '../front/options.ts';
import { cellRuler, pixelRuler } from '../metrics.ts';
import { registerFrontEnd } from '../registry.ts';
import { renderThemedScene } from '../render/scene-svg.ts';
import { layoutSankey } from './layout.ts';
import { parseSankey } from './parse.ts';
import { sankeyTextSpans } from './text.ts';
import { joinSpans } from '../text/terminal.ts';

const read = (src: string, opts: object) => {
  const front = frontOf(opts);
  return parseSankey(src, front.heading, front.config);
};

registerFrontEnd({
  name: 'sankey',
  headers: ['sankey-beta', 'sankey'],
  svg(src, opts) {
    const layout = layoutSankey(read(src, opts), pixelRuler());
    return renderThemedScene(layout.scene, opts.title === undefined ? {} : { title: opts.title });
  },
  textLines(src, maxWidth, opts) {
    return sankeyTextSpans(read(src, opts), maxWidth).map(joinSpans);
  },
  textSpans(src, maxWidth, opts) {
    return sankeyTextSpans(read(src, opts), maxWidth);
  },
  json(src, mode, opts) {
    const sankey = read(src, opts);
    return { sankey, ...layoutSankey(sankey, mode === 'text' ? cellRuler() : pixelRuler()) };
  },
});
