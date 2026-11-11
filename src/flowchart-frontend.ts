import { layout } from './layout/index.ts';
import type { LegendOption } from './layout/legend.ts';
import { cellRuler, pixelRuler } from './metrics.ts';
import { parse } from './parse.ts';
import { registerFrontEnd } from './registry.ts';
import { renderSvg } from './render/svg.ts';
import { renderTextLayout } from './render/text.ts';

function layoutOptions(opts: { maxWidth?: number; legend?: LegendOption; engine?: 'grid' | 'layered' }): { maxWidth?: number; legend?: LegendOption; engine?: 'grid' | 'layered' } {
  return {
    ...(opts.engine === undefined ? {} : { engine: opts.engine }),
    ...(opts.maxWidth === undefined ? {} : { maxWidth: opts.maxWidth }),
    ...(opts.legend === undefined ? {} : { legend: opts.legend }),
  };
}

registerFrontEnd({
  name: 'flowchart',
  headers: ['flowchart', 'graph'],
  svg(src, opts) {
    const { maxWidth, legend, engine, ...svgOpts } = opts;
    return renderSvg(layout(parse(src), pixelRuler(), layoutOptions({ maxWidth, legend, engine })), svgOpts);
  },
  textLines(src, maxWidth, opts) {
    const { legend, maxHeight, engine } = opts;
    return renderTextLayout(
      layout(parse(src), cellRuler(), {
        ...layoutOptions({ legend, engine }),
        ...(maxHeight === undefined ? {} : { maxHeight }),
        ...(maxWidth === undefined ? {} : { maxWidth }),
      }),
    );
  },
  json(src, mode, opts) {
    return layout(parse(src), mode === 'text' ? cellRuler() : pixelRuler(), layoutOptions(opts));
  },
});
