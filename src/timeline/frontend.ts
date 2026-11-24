import { pixelRuler } from '../metrics.ts';
import { registerFrontEnd } from '../registry.ts';
import { renderThemedScene } from '../render/scene-svg.ts';
import { joinSpans } from '../text/terminal.ts';
import { layoutTimeline } from './layout.ts';
import { parseTimeline } from './parse.ts';
import { layoutTimelineText } from './text.ts';
import type { TimelineLayoutOptions } from './layout.ts';

/** Layout options from the render options: the width limit. */
const layoutOptions = (opts: { maxWidth?: number }): TimelineLayoutOptions => (opts.maxWidth === undefined ? {} : { maxWidth: opts.maxWidth });

registerFrontEnd({
  name: 'timeline',
  headers: ['timeline'],
  svg(src, opts) {
    const layout = layoutTimeline(parseTimeline(src, opts.heading), pixelRuler(), layoutOptions(opts));
    return renderThemedScene(layout.scene, opts.title === undefined ? {} : { title: opts.title });
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
    return layoutTimeline(model, pixelRuler(), layoutOptions(opts));
  },
});
