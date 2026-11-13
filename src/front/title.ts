import { pixelRuler } from '../metrics.ts';
import { clip } from '../text/fit.ts';
import type { TextSpan } from '../types.ts';

/** Height the title row adds above a drawing, the centre line of the title text inside it, and its font size. */
export const TITLE_ROW = 40;
export const TITLE_CENTRE = 33;
const TITLE_FONT = 15;
/** Space kept to the right of a title that is wider than the drawing. */
const TITLE_MARGIN = 24;

/** The pixel width of a drawn title (`ursula-title`, 15px against the 13px of the ruler's title role). */
export function titleWidth(text: string): number {
  return (pixelRuler().textWidth(text, 'title') * TITLE_FONT) / 13;
}

/** The width a canvas of `width` needs to hold `text` starting at `left`. */
export function widthWithTitle(width: number, left: number, text: string): number {
  return Math.max(width, Math.ceil(left + titleWidth(text) + TITLE_MARGIN));
}

/** The terminal rows with the title as the first row and a blank row after it (unchanged when there is no title); the title is cut to `maxWidth` cells. */
export function titledLines(lines: string[], title: string | undefined, maxWidth: number | undefined): string[] {
  if (title === undefined || title === '') return lines;
  return [maxWidth === undefined ? title : clip(title, maxWidth), '', ...lines];
}

/** The same as `titledLines`, for rows of spans; the title row is bold. */
export function titledSpans(rows: TextSpan[][], title: string | undefined, maxWidth: number | undefined): TextSpan[][] {
  if (title === undefined || title === '') return rows;
  return [[{ text: maxWidth === undefined ? title : clip(title, maxWidth), tone: 'bold' }], [], ...rows];
}
