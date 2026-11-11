import type { SvgOptions } from './render/svg.ts';
import type { TextSpan } from './types.ts';

export interface RenderOptions extends SvgOptions {
  maxWidth?: number;
}

export interface TextOptions {
  legend?: SvgOptions['legend'];
  maxHeight?: number;
}

/** One diagram syntax with the pipeline that turns its source into output. */
export interface FrontEnd {
  name: string;
  /** First words of the source that select this front-end. */
  headers: string[];
  svg(src: string, opts: RenderOptions): string;
  /** Terminal rows; `maxWidth` is absent when the caller sets no limit. */
  textLines(src: string, maxWidth: number | undefined, opts: TextOptions): string[];
  /** The same rows as `textLines`, as spans that carry a tone; absent when the front-end draws no tones. */
  textSpans?(src: string, maxWidth: number | undefined, opts: TextOptions): TextSpan[][];
  /** The placed drawing data of this front-end. */
  json(src: string, mode: 'svg' | 'text', opts: RenderOptions): unknown;
}

const frontEnds: FrontEnd[] = [];

/** The first registered front-end handles sources whose header no front-end claims, so it reports the error. */
export function registerFrontEnd(frontEnd: FrontEnd): void {
  frontEnds.push(frontEnd);
}

function firstWord(src: string): string {
  for (const row of src.split(/\r?\n/)) {
    const text = row.trim();
    if (text === '' || text.startsWith('%%')) continue;
    return text.split(/[\s;]+/)[0] ?? '';
  }
  return '';
}

export function selectFrontEnd(src: string): FrontEnd {
  const word = firstWord(src);
  const found = frontEnds.find((f) => f.headers.includes(word)) ?? frontEnds[0];
  if (!found) throw new Error('no front-end registered');
  return found;
}
