import { cellRuler, pixelRuler } from '../metrics.ts';
import { registerFrontEnd } from '../registry.ts';
import { renderThemedScene } from '../render/scene-svg.ts';
import { joinSpans } from '../text/terminal.ts';
import { titledLines } from '../front/title.ts';
import { layout } from '../layout/index.ts';
import { renderTextLayout } from '../render/text.ts';
import { UrsulaError } from '../types.ts';
import { architectureGraph } from './graph.ts';
import { layoutArchitecture } from './layout.ts';
import type { Architecture } from './model.ts';
import { parseArchitecture } from './parse.ts';
import { layoutArchitectureText } from './text.ts';

/** The drawing in boxes and lines for a terminal, or nothing when it cannot be drawn within `maxWidth`: the list is written then. */
function drawn(model: Architecture, maxWidth: number | undefined): string[] | undefined {
  if (model.nodes.length === 0) return undefined;
  try {
    const lines = renderTextLayout(layout(architectureGraph(model), cellRuler(), { ...(maxWidth === undefined ? {} : { maxWidth }), fold: true, legend: false }));
    return titledLines(lines, model.title, maxWidth);
  } catch (error) {
    if (error instanceof UrsulaError) return undefined;
    throw error;
  }
}

registerFrontEnd({
  name: 'architecture',
  headers: ['architecture-beta', 'architecture'],
  svg(src, opts) {
    const layout = layoutArchitecture(parseArchitecture(src, opts.heading), pixelRuler());
    return renderThemedScene(layout.scene, {
      ...(opts.title === undefined ? {} : { title: opts.title }),
    });
  },
  textLines(src, maxWidth, opts) {
    const model = parseArchitecture(src, opts.heading);
    return drawn(model, maxWidth) ?? layoutArchitectureText(model, maxWidth).map(joinSpans);
  },
  textSpans(src, maxWidth, opts) {
    const model = parseArchitecture(src, opts.heading);
    return drawn(model, maxWidth)?.map((text) => [{ text, tone: 'normal' as const }]) ?? layoutArchitectureText(model, maxWidth);
  },
  json(src, mode, opts) {
    const model = parseArchitecture(src, opts.heading);
    return { model, ...layoutArchitecture(model, mode === 'text' ? cellRuler() : pixelRuler()) };
  },
});
