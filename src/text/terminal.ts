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
