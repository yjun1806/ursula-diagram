import { cellRuler, pixelRuler } from '../metrics.ts';
import { registerFrontEnd } from '../registry.ts';
import type { FrontEnd, RenderOptions } from '../registry.ts';
import { renderThemedScene } from '../render/scene-svg.ts';
import { colorByOf, layoutMindmap } from './layout.ts';
import { parseMindmap } from './parse.ts';
import { mindmapTextLines } from './text.ts';

function layoutOf(src: string, opts: RenderOptions, mode: 'svg' | 'text') {
  const map = parseMindmap(src);
  const layout = layoutMindmap(map, mode === 'text' ? cellRuler() : pixelRuler(), {
    ...(opts.heading === undefined ? {} : { heading: opts.heading }),
    colorBy: colorByOf(opts.config),
  });
  return { map, layout };
}

export const mindmapFrontEnd: FrontEnd = {
  name: 'mindmap',
  headers: ['mindmap'],
  svg(src, opts) {
    const { layout } = layoutOf(src, opts, 'svg');
    return renderThemedScene(layout.scene, opts.title === undefined ? {} : { title: opts.title });
  },
  textLines(src, maxWidth, opts) {
    return mindmapTextLines(parseMindmap(src), maxWidth, opts.heading);
  },
  json(src, mode, opts) {
    const { map, layout } = layoutOf(src, opts, mode);
    return { mindmap: map, ...layout };
  },
};

registerFrontEnd(mindmapFrontEnd);
