import { cellRuler, pixelRuler } from '../metrics.ts';
import { registerFrontEnd } from '../registry.ts';
import { renderThemedScene } from '../render/scene-svg.ts';
import { joinSpans } from '../text/terminal.ts';
import { layoutArchitecture } from './layout.ts';
import { parseArchitecture } from './parse.ts';
import { layoutArchitectureText } from './text.ts';

registerFrontEnd({
  name: 'architecture',
  headers: ['architecture-beta', 'architecture'],
  svg(src, opts) {
    const layout = layoutArchitecture(parseArchitecture(src, opts.heading), pixelRuler(), opts.theme);
    return renderThemedScene(layout.scene, {
      ...(opts.title === undefined ? {} : { title: opts.title }),
      ...(opts.theme === undefined ? {} : { theme: opts.theme }),
    });
  },
  textLines(src, maxWidth, opts) {
    return layoutArchitectureText(parseArchitecture(src, opts.heading), maxWidth).map(joinSpans);
  },
  textSpans(src, maxWidth, opts) {
    return layoutArchitectureText(parseArchitecture(src, opts.heading), maxWidth);
  },
  json(src, mode, opts) {
    const model = parseArchitecture(src, opts.heading);
    return { model, ...layoutArchitecture(model, mode === 'text' ? cellRuler() : pixelRuler(), opts.theme) };
  },
});
