import { pixelRuler } from '../metrics.ts';
import { registerFrontEnd } from '../registry.ts';
import { renderThemedScene } from '../render/scene-svg.ts';
import { joinSpans } from '../text/terminal.ts';
import { layoutGantt } from './layout.ts';
import { parseGantt } from './parse.ts';
import { layoutGanttText } from './text.ts';

/** For a reader of the check or the JSON, who does not see that the drawing is empty. */
export const EMPTY_NOTE = 'the chart has no tasks, so it draws an empty frame; a task is written "name : start, end"';

registerFrontEnd({
  name: 'gantt',
  headers: ['gantt'],
  svg(src, opts) {
    const layout = layoutGantt(parseGantt(src, { heading: opts.heading, config: opts.config, frontMatter: opts.frontMatter }), pixelRuler());
    return renderThemedScene(layout.scene, {
      ...(opts.title === undefined ? {} : { title: opts.title }),
    });
  },
  textLines(src, maxWidth, opts) {
    return layoutGanttText(parseGantt(src, { heading: opts.heading, config: opts.config, frontMatter: opts.frontMatter }), maxWidth).map(joinSpans);
  },
  textSpans(src, maxWidth, opts) {
    return layoutGanttText(parseGantt(src, { heading: opts.heading, config: opts.config, frontMatter: opts.frontMatter }), maxWidth);
  },
  json(src, mode, opts) {
    const model = parseGantt(src, { heading: opts.heading, config: opts.config, frontMatter: opts.frontMatter });
    const notes = model.tasks.length === 0 ? { notes: [EMPTY_NOTE] } : {};
    if (mode === 'text') return { model, lines: layoutGanttText(model, opts.maxWidth).map(joinSpans), ...notes };
    return { model, ...layoutGantt(model, pixelRuler()), ...notes };
  },
});

