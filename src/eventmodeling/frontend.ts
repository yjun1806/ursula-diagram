import { cellRuler, pixelRuler } from '../metrics.ts';
import { registerFrontEnd } from '../registry.ts';
import { renderThemedScene } from '../render/scene-svg.ts';
import { joinSpans } from '../text/terminal.ts';
import { titledLines } from '../front/title.ts';
import { layoutEventModel } from './layout.ts';
import type { EventModel } from './model.ts';
import { parseEventModeling } from './parse.ts';
import { drawEventModel } from './terminal.ts';
import { layoutEventModelText } from './text.ts';

/** The drawing in boxes and lines for a terminal, or nothing when it cannot be drawn within `maxWidth`: the list is written then. */
function drawn(model: EventModel, maxWidth: number | undefined): string[] | undefined {
  const lines = drawEventModel(model, maxWidth);
  return lines === undefined ? undefined : titledLines(lines, model.title, maxWidth);
}

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
    const model = parseEventModeling(src, opts.heading);
    return drawn(model, maxWidth) ?? layoutEventModelText(model, maxWidth).map(joinSpans);
  },
  textSpans(src, maxWidth, opts) {
    const model = parseEventModeling(src, opts.heading);
    return drawn(model, maxWidth)?.map((text) => [{ text, tone: 'normal' as const }]) ?? layoutEventModelText(model, maxWidth);
  },
  json(src, mode, opts) {
    const model = parseEventModeling(src, opts.heading);
    return { model, ...layoutEventModel(model, mode === 'text' ? cellRuler() : pixelRuler(), opts.theme) };
  },
});
