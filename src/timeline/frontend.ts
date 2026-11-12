import { pixelRuler } from '../metrics.ts';
import { registerFrontEnd } from '../registry.ts';
import { renderThemedScene } from '../render/scene-svg.ts';
import { layoutTimeline } from './layout.ts';
import { parseTimeline } from './parse.ts';
import { joinSpans, layoutTimelineText } from './text.ts';

registerFrontEnd({
  name: 'timeline',
  headers: ['timeline'],
  svg(src, opts) {
    const theme = opts.theme ?? 'solid';
    const layout = layoutTimeline(parseTimeline(src, opts.heading), pixelRuler(), theme, opts.maxWidth === undefined ? {} : { maxWidth: opts.maxWidth });
    return renderThemedScene(layout.scene, { theme, ...(opts.title === undefined ? {} : { title: opts.title }) });
  },
  textLines(src, maxWidth, opts) {
    return layoutTimelineText(parseTimeline(src, opts.heading), maxWidth).map(joinSpans);
  },
  textSpans(src, maxWidth, opts) {
    return layoutTimelineText(parseTimeline(src, opts.heading), maxWidth);
  },
  json(src, mode, opts) {
    const model = parseTimeline(src, opts.heading);
    if (mode === 'text') return { model, lines: layoutTimelineText(model, opts.maxWidth) };
    return layoutTimeline(model, pixelRuler(), opts.theme ?? 'solid', opts.maxWidth === undefined ? {} : { maxWidth: opts.maxWidth });
  },
});
