import { SYNTAX } from '../syntax/index.ts';
import type { SyntaxEntry } from '../syntax/entry.ts';
import type { ErrorAdvice } from '../types.ts';
import { UrsulaError } from '../types.ts';
import { hintFor } from './hints.ts';
import { leadingWord, locate, quotedPieces } from './locate.ts';
import { closest } from './suggest.ts';

export interface ExplainContext {
  /** The front-end that read the source; undefined when no front-end claims its header. */
  frontEnd: string | undefined;
  /** The first word of the source, past comments and front matter. */
  header: string;
  /** Every header of every front-end. */
  headers: readonly string[];
}

const prefix = (a: string, b: string): number => {
  let n = 0;
  while (n < a.length && n < b.length && a[n] === b[n]) n++;
  return n;
};

/** The line of `lines` that starts most like `target`; undefined when none shares a first character with it. */
function likest(lines: string[], target: string): string | undefined {
  let best: string | undefined;
  let length = 0;
  for (const l of lines) {
    const n = prefix(l.trim(), target);
    if (n > length) {
      best = l;
      length = n;
    }
  }
  return best;
}

const hasWord = (line: string, word: string): boolean => line.split(/[^\p{L}\p{N}_@-]+/u).includes(word);

/**
 * The example line of `e` that best stands in for the wrong `row`: one holding the suggested word, else one starting
 * with the same word, else the hint's example, else the one that starts most like the row, else the first body line.
 */
function exampleLine(e: SyntaxEntry, row: string, word: string, suggestion: string | undefined, hinted: string | undefined): string | undefined {
  const lines = e.example.split('\n');
  // A wrong header line is best replaced by the header line of the example.
  if (lines[0] !== undefined && e.headers.includes(word) && suggestion === undefined) return lines[0].trim();
  const target = (suggestion === undefined || word === '' ? row : row.replace(word, suggestion)).trim();
  const pick =
    (suggestion === undefined ? undefined : likest(lines.filter((l) => hasWord(l, suggestion)), target) ?? lines.find((l) => hasWord(l, suggestion))) ??
    (word === '' ? undefined : likest(lines.slice(1).filter((l) => leadingWord(l) === word), target) ?? lines.slice(1).find((l) => leadingWord(l) === word)) ??
    hinted ??
    likest(lines.slice(1), target) ??
    lines.slice(1).find((l) => l.trim() !== '');
  if (pick === undefined) return undefined;
  return e.indented && pick !== hinted ? pick.trimEnd() : pick.trim();
}

/** Errors about room on the screen, not about the text; they get no example. */
const isWidth = (code: string): boolean => /width$/.test(code);

/**
 * The error again with what helps to fix it: the column, a hint, the word the text most likely meant, and one line
 * written the right way. Fields the error already has are kept; the message is the same.
 */
export function explain(err: UrsulaError, src: string, ctx: ExplainContext): UrsulaError {
  if (isWidth(err.code)) return err;
  const rows = src.split(/\r?\n/);
  const advice: ErrorAdvice = { ...err.advice };
  const message = err.bare;

  if (ctx.frontEnd === undefined) {
    // No front-end claims the first word: most likely a misspelt header.
    const at = ctx.header === '' ? -1 : rows.findIndex((r) => r.trim().startsWith(ctx.header));
    const row = at >= 0 ? (rows[at] ?? '') : '';
    const suggestion = closest(ctx.header, ctx.headers);
    const rest = at >= 0 ? row.trim().slice(ctx.header.length) : '';
    return new UrsulaError(message, err.code, err.line ?? (at >= 0 ? at + 1 : undefined), {
      ...advice,
      ...(advice.column === undefined && at >= 0 ? { column: row.indexOf(ctx.header) + 1 } : {}),
      ...(suggestion === undefined ? {} : { suggestion }),
      ...(advice.hint === undefined && suggestion === undefined ? { hint: "the first line names the diagram type, such as 'flowchart LR' or 'sequenceDiagram'; 'ursula-diagram syntax' lists them all" } : {}),
      example: advice.example ?? (suggestion === undefined ? 'flowchart LR' : `${suggestion}${rest}`),
    });
  }

  const entry = SYNTAX.find((e) => e.name === ctx.frontEnd);
  const row = err.line === undefined ? undefined : rows[err.line - 1];
  const word = row === undefined ? '' : leadingWord(row);
  const keywords = entry?.keywords ?? [];
  let suggestion = advice.suggestion;
  if (suggestion === undefined && row !== undefined) {
    const known = new Set([...keywords, ...ctx.headers]);
    if (word !== '' && !known.has(word)) suggestion = closest(word, keywords);
    if (suggestion === undefined) {
      for (const piece of quotedPieces(message)) {
        const first = leadingWord(piece);
        if (first === '' || known.has(first) || !row.includes(first)) continue;
        suggestion = closest(first, keywords);
        if (suggestion !== undefined) break;
      }
    }
  }
  let column = advice.column;
  if (column === undefined && row !== undefined) {
    column = locate(message, row);
    if (column === undefined && suggestion !== undefined && word !== '' && suggestion !== word) {
      const at = row.indexOf(word);
      if (at >= 0) column = at + 1;
    }
  }
  const hinted = entry === undefined ? undefined : hintFor(entry.name, message);
  const example = advice.example ?? (entry === undefined ? hinted?.example : exampleLine(entry, row ?? '', word, suggestion, hinted?.example));
  return new UrsulaError(message, err.code, err.line, {
    ...advice,
    ...(column === undefined ? {} : { column }),
    ...(suggestion === undefined ? {} : { suggestion }),
    // With a suggestion the table's general hint says less than the suggestion does.
    ...(advice.hint === undefined && hinted !== undefined && suggestion === undefined ? { hint: hinted.hint } : {}),
    ...(example === undefined ? {} : { example }),
  });
}
