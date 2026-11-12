import { cellRuler, pixelRuler } from '../metrics.ts';
import { registerFrontEnd } from '../registry.ts';
import { renderThemedScene } from '../render/scene-svg.ts';
import { layoutCynefin } from './layout.ts';
import { parseCynefin } from './parse.ts';
import { cynefinTextLines } from './text.ts';

registerFrontEnd({
  name: 'cynefin',
  headers: ['cynefin-beta'],
  svg(src, opts) {
    const layout = layoutCynefin(parseCynefin(src, opts.heading), pixelRuler(), opts.theme);
    return renderThemedScene(layout.scene, {
      ...(opts.title === undefined ? {} : { title: opts.title }),
      ...(opts.theme === undefined ? {} : { theme: opts.theme }),
    });
  },
  textLines(src, maxWidth, opts) {
    return cynefinTextLines(parseCynefin(src, opts.heading), maxWidth);
  },
  json(src, mode, opts) {
    const model = parseCynefin(src, opts.heading);
    return { model, ...layoutCynefin(model, mode === 'text' ? cellRuler() : pixelRuler(), opts.theme) };
  },
});
