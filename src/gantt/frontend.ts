import { pixelRuler } from '../metrics.ts';
import { registerFrontEnd } from '../registry.ts';
import { renderThemedScene } from '../render/scene-svg.ts';
import { layoutGantt } from './layout.ts';
import { parseGantt } from './parse.ts';
import { joinSpans, layoutGanttText } from './text.ts';

registerFrontEnd({
  name: 'gantt',
  headers: ['gantt'],
  svg(src, opts) {
    const layout = layoutGantt(parseGantt(src, { heading: opts.heading, config: opts.config }), pixelRuler(), opts.theme);
    return renderThemedScene(layout.scene, {
      ...(opts.title === undefined ? {} : { title: opts.title }),
      ...(opts.theme === undefined ? {} : { theme: opts.theme }),
    });
  },
  textLines(src, maxWidth, opts) {
    return layoutGanttText(parseGantt(src, { heading: opts.heading, config: opts.config }), maxWidth).map(joinSpans);
  },
  textSpans(src, maxWidth, opts) {
    return layoutGanttText(parseGantt(src, { heading: opts.heading, config: opts.config }), maxWidth);
  },
  json(src, mode, opts) {
    const model = parseGantt(src, { heading: opts.heading, config: opts.config });
    if (mode === 'text') return { model, lines: layoutGanttText(model, opts.maxWidth).map(joinSpans) };
    return { model, ...layoutGantt(model, pixelRuler(), opts.theme) };
  },
});

