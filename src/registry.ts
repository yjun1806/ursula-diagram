import type { SvgOptions } from './render/svg.ts';
import type { TextSpan } from './types.ts';
import { frontMatterRows, readFrontMatter } from './front-matter.ts';
import type { FrontValue } from './front-matter.ts';
import { spansToAscii, toAscii } from './render/ascii.ts';
import { explain } from './errors/explain.ts';
import { UrsulaError } from './types.ts';

export interface RenderOptions extends SvgOptions {
  /** Title from a leading front-matter block (`title: ...`); a front-end draws it when the diagram text gives none. */
  heading?: string;
  /** The `config` map of a leading front-matter block; a front-end reads its own section (for example `config.packet`). */
  config?: Record<string, FrontValue>;
  /** Every key of a leading front-matter block, for front-ends that read keys outside `config` (for example `displayMode`). */
  frontMatter?: Record<string, FrontValue>;
  maxWidth?: number;
  composition?: 'auto' | 'lanes' | 'stages';
  /** 'fast' or 'best'; pixels draw 'best', the terminal 'fast', unless told. */
  quality?: 'fast' | 'best';
}

export interface TextOptions {
  /** Title from a leading front-matter block; see `RenderOptions.heading`. */
  heading?: string;
  /** See `RenderOptions.config`. */
  config?: Record<string, FrontValue>;
  /** See `RenderOptions.frontMatter`. */
  frontMatter?: Record<string, FrontValue>;
  legend?: SvgOptions['legend'];
  maxHeight?: number;
  composition?: 'auto' | 'lanes' | 'stages';
  quality?: 'fast' | 'best';
  /** How much of every box a terminal drawing keeps; 'auto' (the default) takes the fullest step that fits the width. */
  detail?: 'auto' | 'full' | 'narrow' | 'title';
  /** The characters boxes and lines are drawn with: box-drawing characters ('unicode', the default) or ASCII only. */
  charset?: 'unicode' | 'ascii';
}

/** The front-ends whose rounded corners are bends of their own (`git`) or shapes of their own (`block`, `kanban`), drawn as `/` and `\` in ASCII. */
const ROUND_BENDS: ReadonlySet<string> = new Set(['block', 'git', 'kanban']);

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

/** The name and headers of every registered front-end, in the order they were registered. */
export function registeredFrontEnds(): Array<{ name: string; headers: readonly string[] }> {
  return frontEnds.map((f) => ({ name: f.name, headers: f.headers }));
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
  const claimed = frontEnds.find((f) => f.headers.includes(word));
  const found = claimed ?? frontEnds[0];
  if (!found) throw new Error('no front-end registered');
  // Every call goes through `guard`, so a text error reaches the caller with its column, suggestion and example.
  const guard = <A extends [string, ...unknown[]], R>(call: (...a: A) => R) => (...a: A): R => {
    try {
      return call(...a);
    } catch (err) {
      if (!(err instanceof UrsulaError)) throw err;
      throw explain(err, a[0], { frontEnd: claimed?.name, header: word, headers: frontEnds.flatMap((f) => f.headers) });
    }
  };
  const spans = found.textSpans;
  // Rounded corners are the corners of boxes, except where a drawing bends its own lines with them.
  const ascii = { countBars: found.name === 'er', roundAsPlus: !ROUND_BENDS.has(found.name) };
  const head = <T extends { heading?: string; config?: Record<string, FrontValue>; frontMatter?: Record<string, FrontValue> }>(s: string, o: T): T => {
    const front = readFrontMatter(s);
    const title = front['title'];
    const heading = o.heading ?? (title === undefined || title === null || typeof title === 'object' ? undefined : String(title));
    const config = front['config'];
    return {
      ...o,
      ...(heading === undefined ? {} : { heading }),
      ...(o.config === undefined && config !== null && typeof config === 'object' ? { config } : {}),
      ...(o.frontMatter === undefined && Object.keys(front).length > 0 ? { frontMatter: front } : {}),
    };
  };
  return {
    ...found,
    svg: guard((s: string, o: RenderOptions) => found.svg(blankFrontMatter(s), head(s, o))),
    textLines: guard((s: string, w: number | undefined, o: TextOptions) => {
      const lines = found.textLines(blankFrontMatter(s), w, head(s, o));
      return o.charset === 'ascii' ? toAscii(lines, ascii) : lines;
    }),
    json: guard((s: string, m: 'svg' | 'text', o: RenderOptions) => found.json(blankFrontMatter(s), m, head(s, o))),
    ...(spans
      ? {
          textSpans: guard((s: string, w: number | undefined, o: TextOptions) => {
            const lines = spans.call(found, blankFrontMatter(s), w, head(s, o));
            return o.charset === 'ascii' ? spansToAscii(lines, ascii) : lines;
          }),
        }
      : {}),
  };
}
