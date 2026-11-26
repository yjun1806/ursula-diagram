import './flowchart-frontend.ts';
import type { LayoutOptions } from './layout/index.ts';
import { cellWidth } from './metrics.ts';
import { selectFrontEnd } from './registry.ts';
import type { TextOptions } from './registry.ts';
import type { SvgOptions } from './render/svg.ts';
import './class/frontend.ts';
import './er/frontend.ts';
import './journey/frontend.ts';
import './gantt/frontend.ts';
import './eventmodeling/frontend.ts';
import './ishikawa/frontend.ts';
import './cynefin/frontend.ts';
import './git/frontend.ts';
import './kanban/frontend.ts';
import './mindmap/frontend.ts';
import './quadrant/frontend.ts';
import './railroad/frontend.ts';
import './block/frontend.ts';
import './pie/frontend.ts';
import './packet/frontend.ts';
import './radar/frontend.ts';
import './requirement/frontend.ts';
import './sankey/frontend.ts';
import './architecture/frontend.ts';
import './sequence/frontend.ts';
import './state/frontend.ts';
import './timeline/frontend.ts';
import './treeview/frontend.ts';
import './usecase/frontend.ts';
import './treemap/frontend.ts';
import './venn/frontend.ts';
import './c4/frontend.ts';
import './wardley/frontend.ts';
import './xychart/frontend.ts';
import './zenuml/frontend.ts';
import { UrsulaError } from './types.ts';
import type { ErrorAdvice, TextSpan } from './types.ts';
import { renderTextSvg as drawTextSvg } from './render/text-svg.ts';

export { parse } from './parse.ts';
export { layout } from './layout/index.ts';
export { layoutLayered, layeredRuler } from './layered/index.ts';
export { checkLines } from './layered/questions.ts';
export { checkDetails } from './layered/details.ts';
export type { LayoutOptions, LegendOption } from './layout/index.ts';
export { cellRuler, cellWidth, pixelRuler } from './metrics.ts';
export type { Ruler, TextRole } from './metrics.ts';
export { renderSvg } from './render/svg.ts';
export type { NodeHook, SvgOptions } from './render/svg.ts';
export { renderTextLayout, spansToAnsi } from './render/text.ts';
export { spansToAscii, toAscii } from './render/ascii.ts';
export type { AsciiOptions } from './render/ascii.ts';
export { renderTextSvg as spansToSvg } from './render/text-svg.ts';
export { registerFrontEnd, registeredFrontEnds, selectFrontEnd } from './registry.ts';
export { syntaxOf, syntaxTypes } from './syntax/lookup.ts';
export type { SyntaxEntry } from './syntax/entry.ts';
export type { FrontEnd, RenderOptions, TextOptions } from './registry.ts';
export { layoutSequenceText } from './sequence/text.ts';
export { parseSequence } from './sequence/parse.ts';
export { layoutSequence } from './sequence/layout.ts';
export { sequenceCheckLines } from './sequence/check.ts';
export type { SequenceLayoutOptions } from './sequence/layout.ts';
export type * from './sequence/model.ts';
export { UrsulaError } from './types.ts';
export { fixSource } from './errors/fix.ts';
export type { FixedSource, SourceFix } from './errors/fix.ts';
export type * from './types.ts';

/** Why a terminal drawing failed: the message, and for a text error where it is and how to fix it. */
export interface TextError extends ErrorAdvice {
  error: string;
  line?: number;
}

const lineOf = (err: UrsulaError): { line?: number } => (err.line === undefined ? {} : { line: err.line });

/** The lines `draw` gives when the widest fits `maxWidth`; else, or when the text has an error, what went wrong. */
function withinWidth<T>(maxWidth: number, draw: () => T[], width: (line: T) => number): { lines: T[] } | TextError {
  try {
    const lines = draw();
    const widest = Math.max(0, ...lines.map(width));
    if (widest > maxWidth) return { error: `Drawing is ${widest} columns wide; the limit is ${maxWidth}.` };
    return { lines };
  } catch (err) {
    if (err instanceof UrsulaError) return { error: err.message, ...lineOf(err), ...err.advice };
    throw err;
  }
}

/** Picks the front-end by the header of `src`, lays it out in terminal cells and draws it as text. */
export function renderText(
  src: string,
  maxWidth: number,
  opts: Pick<LayoutOptions, 'legend' | 'maxHeight' | 'composition' | 'quality'> & Pick<TextOptions, 'detail' | 'charset'> = {},
): { lines: string[] } | TextError {
  return withinWidth(maxWidth, () => selectFrontEnd(src).textLines(src, maxWidth, opts), cellWidth);
}

/**
 * Like `renderText`, with every line as spans that carry a tone (`normal`, `dim`, `bold`, `accent`).
 * The library writes no escape codes; the host decides how to draw each tone.
 */
export function renderTextSpans(
  src: string,
  maxWidth: number,
  opts: Pick<LayoutOptions, 'legend' | 'maxHeight' | 'composition' | 'quality'> & Pick<TextOptions, 'detail' | 'charset'> = {},
): { lines: TextSpan[][] } | TextError {
  const draw = (): TextSpan[][] => {
    const frontEnd = selectFrontEnd(src);
    return frontEnd.textSpans
      ? frontEnd.textSpans(src, maxWidth, opts)
      : frontEnd.textLines(src, maxWidth, opts).map((text): TextSpan[] => (text === '' ? [] : [{ text, tone: 'normal' }]));
  };
  return withinWidth(maxWidth, draw, (line) => cellWidth(line.map((s) => s.text).join('')));
}

/**
 * Like `renderText`, as one inline SVG: lines and arrowheads are drawn as shapes and every word is set on the grid of
 * cells, so the drawing keeps its columns in any font. Colours are the CSS variables of the other pictures.
 */
export function renderTextSvg(
  src: string,
  maxWidth: number,
  opts: Pick<LayoutOptions, 'legend' | 'maxHeight' | 'composition' | 'quality'> & Pick<TextOptions, 'detail' | 'charset'> = {},
): { svg: string } | TextError {
  const drawn = renderTextSpans(src, maxWidth, opts);
  return 'error' in drawn ? drawn : { svg: drawTextSvg(drawn.lines) };
}

/** Picks the front-end by the header of `src`, lays it out in pixels and returns inline SVG. */
export function render(src: string, opts: SvgOptions & { maxWidth?: number } = {}): string {
  return selectFrontEnd(src).svg(src, opts);
}
