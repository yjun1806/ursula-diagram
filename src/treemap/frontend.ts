import type { FrontValue } from '../front-matter.ts';
import { cellRuler, pixelRuler } from '../metrics.ts';
import { registerFrontEnd } from '../registry.ts';
import { renderThemedScene } from '../render/scene-svg.ts';
import { layoutTreemap } from './layout.ts';
import { parseTreemap } from './parse.ts';
import { treemapTextLines } from './text.ts';

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
  return parseTreemap(src, front.heading, front.config);
};

registerFrontEnd({
  name: 'treemap',
  headers: ['treemap-beta', 'treemap'],
  svg(src, opts) {
    const layout = layoutTreemap(read(src, opts), pixelRuler());
    return renderThemedScene(layout.scene, { ...(opts.title === undefined ? {} : { title: opts.title }), ...(opts.theme === undefined ? {} : { theme: opts.theme }) });
  },
  textLines(src, maxWidth, opts) {
    return treemapTextLines(read(src, opts), maxWidth);
  },
  json(src, mode, opts) {
    const treemap = read(src, opts);
    return { treemap, ...layoutTreemap(treemap, mode === 'text' ? cellRuler() : pixelRuler()) };
  },
});
