// Fixes the errors that have one reading only: a misspelt header, a misspelt keyword with one suggestion, and a
// flowchart `->`. Nothing is invented and no line is added or taken away, so line numbers stay those of the source.
import { blankFrontMatter, firstWord, registeredFrontEnds, selectFrontEnd } from '../registry.ts';
import { UrsulaError } from '../types.ts';
import { hintFor } from './hints.ts';
import { leadingWord } from './locate.ts';
import { closest } from './suggest.ts';

/** One change `fixSource` made: on line `line` (from 1), at column `column` (from 1), `from` became `to`. */
export interface SourceFix {
  line: number;
  column?: number;
  from: string;
  to: string;
  reason: string;
}

export interface FixedSource {
  /** The source with every fix made; the source itself when there was nothing to fix. */
  source: string;
  fixes: SourceFix[];
}

/** The most fixes one call makes. */
export const MOST_FIXES = 5;

interface Edit extends SourceFix {
  column: number;
}

/** What laying out `src` gives: nothing when it draws, else the error. */
function failure(src: string): unknown {
  try {
    selectFrontEnd(src).json(src, 'svg', { quality: 'fast' });
    return undefined;
  } catch (err) {
    return err;
  }
}

const rowsOf = (src: string): string[] => src.split('\n');

function applied(src: string, e: Edit): string {
  const rows = rowsOf(src);
  const row = rows[e.line - 1] ?? '';
  const at = e.column - 1;
  return rows.map((r, i) => (i === e.line - 1 ? `${row.slice(0, at)}${e.to}${row.slice(at + e.from.length)}` : r)).join('\n');
}

/** The header, when no front-end claims the first word and exactly one header is one or two edits from it. */
function headerFix(src: string): Edit | undefined {
  const word = firstWord(src);
  const headers = registeredFrontEnds().flatMap((f) => f.headers);
  if (word === '' || headers.includes(word)) return undefined;
  const to = closest(word, headers);
  if (to === undefined) return undefined;
  const rows = rowsOf(blankFrontMatter(src));
  const at = rows.findIndex((r) => r.trim() !== '' && !r.trim().startsWith('%%'));
  const column = (rows[at] ?? '').indexOf(word);
  if (at < 0 || column < 0) return undefined;
  return { line: at + 1, column: column + 1, from: word, to, reason: `'${word}' is no diagram type; '${to}' is the only one this close` };
}

const WORD = /[\p{L}\p{N}_@]+(?:-[\p{L}\p{N}_]+)*/uy;

/** How many times `word` stands as a whole word in `src`. */
function uses(src: string, word: string): number {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return [...src.matchAll(new RegExp(`(?<![\\p{L}\\p{N}_@-])${escaped}(?![\\p{L}\\p{N}_@-])`, 'gu'))].length;
}

/** The word that starts at index `at` of `row`, when one does. */
function wordAt(row: string, at: number): string {
  if (at > 0 && /[\p{L}\p{N}_@-]/u.test(row[at - 1] ?? '')) return '';
  WORD.lastIndex = at;
  return WORD.exec(row)?.[0] ?? '';
}

/**
 * The suggested keyword in place of the word the error points at, or of the first word of its line: when that word is
 * near the suggestion and used nowhere else in the text (a word used twice is likely a name).
 */
function keywordFix(src: string, err: UrsulaError): Edit | undefined {
  const to = err.suggestion;
  if (to === undefined || err.line === undefined) return undefined;
  const row = rowsOf(src)[err.line - 1] ?? '';
  const lead = leadingWord(row);
  const spots = [
    ...(err.column === undefined ? [] : [{ word: wordAt(row, err.column - 1), at: err.column - 1 }]),
    { word: lead, at: row.indexOf(lead) },
  ];
  const spot = spots.find((s) => s.word !== '' && s.at >= 0 && s.word !== to && closest(s.word, [to]) === to && uses(src, s.word) === 1);
  if (spot === undefined) return undefined;
  return { line: err.line, column: spot.at + 1, from: spot.word, to, reason: `'${spot.word}' is no keyword here; '${to}' is the only one this close` };
}

/** The change from `before` to `after`, widened to whole runs of non-space characters. */
function difference(before: string, after: string): { at: number; from: string; to: string } | undefined {
  if (before === after) return undefined;
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start++;
  let tail = 0;
  while (tail < before.length - start && tail < after.length - start && before[before.length - 1 - tail] === after[after.length - 1 - tail]) tail++;
  while (start > 0 && !/\s/.test(before[start - 1] ?? '')) start--;
  while (tail > 0 && !/\s/.test(before[before.length - tail] ?? '')) tail--;
  return { at: start, from: before.slice(start, before.length - tail), to: after.slice(start, after.length - tail) };
}

/** The change the hint table makes to the line, when the table marks it as one with one reading. */
function hintedFix(src: string, err: UrsulaError): Edit | undefined {
  if (err.line === undefined) return undefined;
  const row = rowsOf(src)[err.line - 1] ?? '';
  const found = hintFor(selectFrontEnd(src).name, err.bare, row, err.column);
  if (!found?.autofix || found.example === undefined) return undefined;
  const change = difference(row.trim(), found.example);
  if (change === undefined || change.from === '') return undefined;
  const indent = row.length - row.trimStart().length;
  return { line: err.line, column: indent + change.at + 1, from: change.from, to: change.to, reason: found.hint ?? 'the hint table puts this line right' };
}

/** A fix holds when the text then draws, or fails somewhere else than at the fix. */
function holds(err: UrsulaError, e: Edit, after: unknown): boolean {
  if (after === undefined) return true;
  if (!(after instanceof UrsulaError)) return false;
  if (after.line === err.line && after.bare === err.bare) return false;
  return !(after.line === e.line && after.column !== undefined && after.column >= e.column && after.column < e.column + e.to.length);
}

/**
 * The source with the errors that have one reading fixed, one at a time, `MOST_FIXES` at most: a misspelt header, a
 * misspelt keyword with one suggestion, and `->` in a flowchart. Each fix is kept only when the text then draws or
 * fails elsewhere. A label, a name or a bracket is never invented and a line is never added or taken away.
 */
export function fixSource(src: string): FixedSource {
  let source = src;
  const fixes: SourceFix[] = [];
  let err = failure(source);
  while (fixes.length < MOST_FIXES && err instanceof UrsulaError && !/width$/.test(err.code)) {
    const edit = headerFix(source) ?? keywordFix(source, err) ?? hintedFix(source, err);
    if (edit === undefined) break;
    const next = applied(source, edit);
    const after = failure(next);
    if (!holds(err, edit, after)) break;
    source = next;
    fixes.push(edit);
    err = after;
  }
  return { source, fixes };
}
