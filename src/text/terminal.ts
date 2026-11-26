import { cellWidth } from '../metrics.ts';
import type { TextSpan, TextTone } from '../types.ts';
import { clip } from './fit.ts';

/** Cuts `text` to at most `limit` terminal cells, ending in an ellipsis when something is left off. */
export const cut = (text: string, limit: number): string => clip(text, limit, cellWidth);

/** Pads `text` with spaces on the right up to `width` cells. */
export const padEnd = (text: string, width: number): string => text + ' '.repeat(Math.max(0, width - cellWidth(text)));

/** Pads `text` with spaces on the left up to `width` cells. */
export const padStart = (text: string, width: number): string => ' '.repeat(Math.max(0, width - cellWidth(text))) + text;

export const span = (text: string, tone: TextTone = 'normal'): TextSpan => ({ text, tone });

/** The text of a row of spans, without tones. */
export const joinSpans = (row: readonly TextSpan[]): string => row.map((s) => s.text).join('');

/** One piece of a row: plain text, `[text, tone]`, a span, or a row of spans. */
export type SpanPiece = string | readonly [string, TextTone] | TextSpan | readonly TextSpan[];

/** A row of spans from its pieces: empty pieces are left out and neighbours of one tone are joined. */
export function spansOf(...pieces: readonly SpanPiece[]): TextSpan[] {
  const flat = pieces.flatMap((p): Array<readonly [string, TextTone]> => {
    if (typeof p === 'string') return [[p, 'normal']];
    if ('text' in p) return [[p.text, p.tone]];
    if (p.length === 2 && typeof p[0] === 'string') return [p as readonly [string, TextTone]];
    return (p as readonly TextSpan[]).map((s) => [s.text, s.tone] as const);
  });
  const out: TextSpan[] = [];
  for (const [text, tone] of flat) {
    if (text === '') continue;
    const last = out[out.length - 1];
    if (last !== undefined && last.tone === tone) out[out.length - 1] = { text: last.text + text, tone };
    else out.push({ text, tone });
  }
  return out;
}

/** The spans of `row` between the UTF-16 offsets `start` and `end` of its text, as `String.slice` cuts it. */
export function sliceSpans(row: readonly TextSpan[], start: number, end: number = Infinity): TextSpan[] {
  const out: TextSpan[] = [];
  let at = 0;
  for (const s of row) {
    const from = Math.max(start, at);
    const to = Math.min(end, at + s.text.length);
    if (from < to) out.push({ text: s.text.slice(from - at, to - at), tone: s.tone });
    at += s.text.length;
  }
  return spansOf(out);
}

/** `row` without the white space at its end, as `String.trimEnd` leaves it. */
export const trimEndSpans = (row: readonly TextSpan[]): TextSpan[] => sliceSpans(row, 0, joinSpans(row).trimEnd().length);

/** The text and tone of `row` cut to at most `limit` cells as `cut` cuts its text; the ellipsis takes the tone of the first character left off. */
export function cutSpans(row: readonly TextSpan[], limit: number): TextSpan[] {
  const text = joinSpans(row);
  const kept = cut(text, limit);
  if (kept === text) return spansOf(row);
  const at = kept.length - 1;
  const tone = sliceSpans(row, at, at + 1)[0]?.tone ?? 'normal';
  return spansOf(sliceSpans(row, 0, at), ['…', tone]);
}

/** `row` padded with spaces on the right up to `width` cells. */
export const padEndSpans = (row: readonly TextSpan[], width: number): TextSpan[] => spansOf(row, padEnd('', width - cellWidth(joinSpans(row))));
