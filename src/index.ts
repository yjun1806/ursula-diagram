import './flowchart-frontend.ts';
import type { LayoutOptions } from './layout/index.ts';
import { cellWidth } from './metrics.ts';
import { selectFrontEnd } from './registry.ts';
import type { TextOptions } from './registry.ts';
import type { SvgOptions } from './render/svg.ts';
import './journey/frontend.ts';
import './gantt/frontend.ts';
import './ishikawa/frontend.ts';
import './cynefin/frontend.ts';
import './git/frontend.ts';
import './kanban/frontend.ts';
import './mindmap/frontend.ts';
import './quadrant/frontend.ts';
import './pie/frontend.ts';
import './packet/frontend.ts';
import './radar/frontend.ts';
import './sequence/frontend.ts';
import './timeline/frontend.ts';
import './treeview/frontend.ts';
import './treemap/frontend.ts';
import './venn/frontend.ts';
import './xychart/frontend.ts';
import './zenuml/frontend.ts';
import { UrsulaError } from './types.ts';
import type { TextSpan } from './types.ts';

export { parse } from './parse.ts';
export { layout } from './layout/index.ts';
export { layoutLayered, layeredRuler } from './layered/index.ts';
export { checkLines } from './layered/questions.ts';
export type { LayoutOptions, LegendOption } from './layout/index.ts';
export { cellRuler, cellWidth, pixelRuler } from './metrics.ts';
export type { Ruler, TextRole } from './metrics.ts';
export { renderSvg } from './render/svg.ts';
export type { NodeHook, SvgOptions } from './render/svg.ts';
export { THEMES } from './render/theme.ts';
export type { Theme } from './render/theme.ts';
export { renderTextLayout, renderTextScene, spansToAnsi } from './render/text.ts';
export { registerFrontEnd, selectFrontEnd } from './registry.ts';
export type { FrontEnd, RenderOptions, TextOptions } from './registry.ts';
export { layoutSequenceText } from './sequence/text.ts';
export { parseSequence } from './sequence/parse.ts';
export { layoutSequence } from './sequence/layout.ts';
export type { SequenceLayoutOptions } from './sequence/layout.ts';
export type * from './sequence/model.ts';
export { UrsulaError } from './types.ts';
export type * from './types.ts';

/** Picks the front-end by the header of `src`, lays it out in terminal cells and draws it as text. */
export function renderText(
  src: string,
  maxWidth: number,
  opts: Pick<LayoutOptions, 'legend' | 'maxHeight' | 'engine' | 'composition' | 'questions' | 'elbows' | 'quality'> & Pick<TextOptions, 'detail'> = {},
): { lines: string[] } | { error: string } {
  try {
    const lines = selectFrontEnd(src).textLines(src, maxWidth, opts);
    const widest = Math.max(0, ...lines.map(cellWidth));
    if (widest > maxWidth) return { error: `Drawing is ${widest} columns wide; the limit is ${maxWidth}.` };
    return { lines };
  } catch (err) {
    if (err instanceof UrsulaError) return { error: err.message };
    throw err;
  }
}

/**
 * Like `renderText`, with every line as spans that carry a tone (`normal`, `dim`, `bold`, `accent`).
 * The library writes no escape codes; the host decides how to draw each tone.
 */
export function renderTextSpans(
  src: string,
  maxWidth: number,
  opts: Pick<LayoutOptions, 'legend' | 'maxHeight' | 'engine' | 'composition' | 'questions' | 'elbows' | 'quality'> & Pick<TextOptions, 'detail'> = {},
): { lines: TextSpan[][] } | { error: string } {
  try {
    const frontEnd = selectFrontEnd(src);
    const spans = (o: typeof opts): TextSpan[][] =>
      frontEnd.textSpans
        ? frontEnd.textSpans(src, maxWidth, o)
        : frontEnd.textLines(src, maxWidth, o).map((text): TextSpan[] => (text === '' ? [] : [{ text, tone: 'normal' }]));
    const widthOf = (ls: TextSpan[][]): number => Math.max(0, ...ls.map((l) => cellWidth(l.map((s) => s.text).join(''))));
    const lines = spans(opts);
    const widest = widthOf(lines);
    if (widest > maxWidth) return { error: `Drawing is ${widest} columns wide; the limit is ${maxWidth}.` };
    return { lines };
  } catch (err) {
    if (err instanceof UrsulaError) return { error: err.message };
    throw err;
  }
}

/** Picks the front-end by the header of `src`, lays it out in pixels and returns inline SVG. */
export function render(src: string, opts: SvgOptions & { maxWidth?: number } = {}): string {
  return selectFrontEnd(src).svg(src, opts);
}
