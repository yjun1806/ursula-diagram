import { cellRuler, pixelRuler } from '../metrics.ts';
import { registerFrontEnd } from '../registry.ts';
import { renderThemedScene } from '../render/scene-svg.ts';
import { layoutSequence } from './layout.ts';
import { joinSpans, layoutSequenceText } from './text.ts';
import type { SequenceLayoutOptions } from './layout.ts';
import type { SequenceLegendOption } from './model.ts';
import { parseSequence } from './parse.ts';
import { titledLines, titledSpans } from '../front/title.ts';

/** The text of the `title` line of a sequence source, when it has one; a front-matter title is the fallback. */
function titleOf(src: string, heading: string | undefined): string | undefined {
  for (const row of src.split(/\r?\n/u)) {
    const found = /^\s*title(?:\s*:\s*|\s+)(.+?)\s*$/u.exec(row);
    if (found !== null) return found[1];
  }
  return heading;
}

function layoutOptions(maxWidth: number | undefined, legend: SequenceLegendOption | undefined): SequenceLayoutOptions {
  return { ...(maxWidth === undefined ? {} : { maxWidth }), ...(legend === undefined ? {} : { legend }) };
}

registerFrontEnd({
  name: 'sequence',
  headers: ['sequenceDiagram'],
  svg(src, opts) {
    const layout = layoutSequence(parseSequence(src), pixelRuler(), layoutOptions(opts.maxWidth, opts.legend));
    const title = opts.title ?? opts.heading;
    const drawTitle = titleOf(src, opts.heading);
    return renderThemedScene(layout.scene, {
      ...(title === undefined ? {} : { title }),
      ...(drawTitle === undefined ? {} : { drawTitle }),
      ...(opts.theme === undefined ? {} : { theme: opts.theme }),
    });
  },
  textLines(src, maxWidth, opts) {
    return titledLines(layoutSequenceText(parseSequence(src), cellRuler(), maxWidth, opts.legend).map(joinSpans), titleOf(src, opts.heading), maxWidth);
  },
  textSpans(src, maxWidth, opts) {
    return titledSpans(layoutSequenceText(parseSequence(src), cellRuler(), maxWidth, opts.legend), titleOf(src, opts.heading), maxWidth);
  },
  json(src, mode, opts) {
    const ruler = mode === 'text' ? cellRuler() : pixelRuler();
    return layoutSequence(parseSequence(src), ruler, layoutOptions(opts.maxWidth, opts.legend));
  },
});
