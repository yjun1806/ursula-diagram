import { cellRuler, pixelRuler } from '../metrics.ts';
import { registerFrontEnd } from '../registry.ts';
import { renderThemedScene } from '../render/scene-svg.ts';
import { joinSpans } from '../text/terminal.ts';
import { layoutIshikawa } from './layout.ts';
import { parseIshikawa } from './parse.ts';
import { layoutIshikawaText } from './text.ts';
import { titledLines, titledSpans } from '../front/title.ts';

registerFrontEnd({
  name: 'ishikawa',
  headers: ['ishikawa', 'ishikawa-beta'],
  svg(src, opts) {
    const layout = layoutIshikawa(parseIshikawa(src), pixelRuler(), opts.heading);
    return renderThemedScene(layout.scene, {
      ...(opts.title === undefined ? {} : { title: opts.title }),
    });
  },
  textLines(src, maxWidth, opts) {
    return titledLines(layoutIshikawaText(parseIshikawa(src), maxWidth).map(joinSpans), opts.heading, maxWidth);
  },
  textSpans(src, maxWidth, opts) {
    return titledSpans(layoutIshikawaText(parseIshikawa(src), maxWidth), opts.heading, maxWidth);
  },
  json(src, mode, opts) {
    const model = parseIshikawa(src);
    return { model, ...layoutIshikawa(model, mode === 'text' ? cellRuler() : pixelRuler(), opts.heading) };
  },
});
