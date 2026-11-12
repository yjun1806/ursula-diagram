import { cellRuler, pixelRuler } from '../metrics.ts';
import { registerFrontEnd } from '../registry.ts';
import { renderThemedScene } from '../render/scene-svg.ts';
import { joinSpans } from '../text/terminal.ts';
import { layoutEventModel } from './layout.ts';
import { parseEventModeling } from './parse.ts';
import { layoutEventModelText } from './text.ts';

registerFrontEnd({
  name: 'eventmodeling',
  headers: ['eventmodeling'],
  svg(src, opts) {
    const layout = layoutEventModel(parseEventModeling(src, opts.heading), pixelRuler(), opts.theme);
    return renderThemedScene(layout.scene, {
      ...(opts.title === undefined ? {} : { title: opts.title }),
      ...(opts.theme === undefined ? {} : { theme: opts.theme }),
    });
  },
  textLines(src, maxWidth, opts) {
    return layoutEventModelText(parseEventModeling(src, opts.heading), maxWidth).map(joinSpans);
  },
  textSpans(src, maxWidth, opts) {
    return layoutEventModelText(parseEventModeling(src, opts.heading), maxWidth);
  },
  json(src, mode, opts) {
    const model = parseEventModeling(src, opts.heading);
    return { model, ...layoutEventModel(model, mode === 'text' ? cellRuler() : pixelRuler(), opts.theme) };
  },
});
