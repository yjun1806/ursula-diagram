import { cellRuler, pixelRuler } from '../metrics.ts';
import { registerFrontEnd } from '../registry.ts';
import { renderThemedScene } from '../render/scene-svg.ts';
import { layoutIshikawa } from './layout.ts';
import { parseIshikawa } from './parse.ts';
import { joinSpans, layoutIshikawaText } from './text.ts';

registerFrontEnd({
  name: 'ishikawa',
  headers: ['ishikawa', 'ishikawa-beta'],
  svg(src, opts) {
    const layout = layoutIshikawa(parseIshikawa(src), pixelRuler(), opts.theme, opts.heading);
    return renderThemedScene(layout.scene, {
      ...(opts.title === undefined ? {} : { title: opts.title }),
      ...(opts.theme === undefined ? {} : { theme: opts.theme }),
    });
  },
  textLines(src, maxWidth) {
    return layoutIshikawaText(parseIshikawa(src), maxWidth).map(joinSpans);
  },
  textSpans(src, maxWidth) {
    return layoutIshikawaText(parseIshikawa(src), maxWidth);
  },
  json(src, mode, opts) {
    const model = parseIshikawa(src);
    return { model, ...layoutIshikawa(model, mode === 'text' ? cellRuler() : pixelRuler(), opts.theme, opts.heading) };
  },
});
