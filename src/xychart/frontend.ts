import type { FrontValue } from '../front-matter.ts';
import { cellRuler, pixelRuler } from '../metrics.ts';
import { registerFrontEnd } from '../registry.ts';
import { renderThemedScene } from '../render/scene-svg.ts';
import { layoutXychart } from './layout.ts';
import { parseXychart } from './parse.ts';
import { xychartTable } from './text.ts';

interface FrontOptions {
  heading?: string;
  config?: Record<string, FrontValue>;
}

/** The title and settings a front matter handed to the front-end. */
function frontOf(opts: object): FrontOptions {
  const out: FrontOptions = {};
  if ('heading' in opts && typeof opts.heading === 'string') out.heading = opts.heading;
  if ('config' in opts && opts.config !== null && typeof opts.config === 'object') out.config = opts.config as Record<string, FrontValue>;
  return out;
}

const read = (src: string, opts: object) => {
  const front = frontOf(opts);
  return parseXychart(src, front.config, front.heading);
};

registerFrontEnd({
  name: 'xychart',
  headers: ['xychart', 'xychart-beta'],
  svg(src, opts) {
    const layout = layoutXychart(read(src, opts), pixelRuler(), opts.theme ?? 'solid');
    return renderThemedScene(layout.scene, { theme: opts.theme ?? 'solid', ...(opts.title === undefined ? {} : { title: opts.title }) });
  },
  textLines(src, maxWidth, opts) {
    return xychartTable(read(src, opts), cellRuler(), maxWidth);
  },
  json(src, mode, opts) {
    const chart = read(src, opts);
    return { chart, layout: layoutXychart(chart, pixelRuler(), opts.theme ?? 'solid') };
  },
});
