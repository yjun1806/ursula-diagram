import type { SvgOptions } from './render/svg.ts';
import type { TextSpan } from './types.ts';
import { frontMatterRows, readFrontMatter } from './front-matter.ts';
import type { FrontValue } from './front-matter.ts';

export interface RenderOptions extends SvgOptions {
  /** Title from a leading front-matter block (`title: ...`); a front-end draws it when the diagram text gives none. */
  heading?: string;
  /** The `config` map of a leading front-matter block; a front-end reads its own section (for example `config.packet`). */
  config?: Record<string, FrontValue>;
  maxWidth?: number;
  engine?: 'grid' | 'layered';
  composition?: 'auto' | 'lanes' | 'stages';
  questions?: boolean;
  elbows?: boolean;
  /** 'fast' or 'best'; pixels draw 'best', the terminal 'fast', unless told. */
  quality?: 'fast' | 'best';
}

export interface TextOptions {
  /** Title from a leading front-matter block; see `RenderOptions.heading`. */
  heading?: string;
  /** See `RenderOptions.config`. */
  config?: Record<string, FrontValue>;
  legend?: SvgOptions['legend'];
  maxHeight?: number;
  engine?: 'grid' | 'layered';
  composition?: 'auto' | 'lanes' | 'stages';
  questions?: boolean;
  elbows?: boolean;
  quality?: 'fast' | 'best';
  /** How much of every box a terminal drawing keeps; 'auto' (the default) takes the fullest step that fits the width. */
  detail?: 'auto' | 'full' | 'narrow' | 'title';
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

/**
 * The source with a leading `---` front-matter block turned into blank lines, so line numbers stay the same.
 * Front-ends read diagram text only; the block reaches them as `heading` and `config` options.
 */
export function blankFrontMatter(src: string): string {
  const rows = src.split(/\r?\n/);
  const span = frontMatterRows(rows);
  if (!span) return src;
  return rows.map((r, i) => (i >= span[0] && i <= span[1] ? '' : r)).join('\n');
}

/** The `title:` of a leading front-matter block; undefined when there is none. */
export function frontMatterTitle(src: string): string | undefined {
  const title = readFrontMatter(src)['title'];
  return title === undefined || title === null || typeof title === 'object' ? undefined : String(title);
}

/** The first word of the source, past blank lines, `%%` comments and a leading `---` front-matter block. */
export function firstWord(src: string): string {
  for (const row of blankFrontMatter(src).split(/\r?\n/)) {
    const text = row.trim();
    if (text === '' || text.startsWith('%%')) continue;
    return text.split(/[\s;]+/)[0] ?? '';
  }
  return '';
}

/** The front-end for the header of `src`; its calls see the source with the front-matter block blanked. */
export function selectFrontEnd(src: string): FrontEnd {
  const word = firstWord(src);
  const found = frontEnds.find((f) => f.headers.includes(word)) ?? frontEnds[0];
  if (!found) throw new Error('no front-end registered');
  const spans = found.textSpans;
  const head = <T extends { heading?: string; config?: Record<string, FrontValue> }>(s: string, o: T): T => {
    const front = readFrontMatter(s);
    const title = front['title'];
    const heading = o.heading ?? (title === undefined || title === null || typeof title === 'object' ? undefined : String(title));
    const config = front['config'];
    return {
      ...o,
      ...(heading === undefined ? {} : { heading }),
      ...(o.config === undefined && config !== null && typeof config === 'object' ? { config } : {}),
    };
  };
  return {
    ...found,
    svg: (s, o) => found.svg(blankFrontMatter(s), head(s, o)),
    textLines: (s, w, o) => found.textLines(blankFrontMatter(s), w, head(s, o)),
    json: (s, m, o) => found.json(blankFrontMatter(s), m, head(s, o)),
    ...(spans ? { textSpans: (s: string, w: number | undefined, o: TextOptions) => spans.call(found, blankFrontMatter(s), w, head(s, o)) } : {}),
  };
}
