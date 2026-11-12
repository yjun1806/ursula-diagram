import type { Ruler } from '../metrics.ts';
import { wrapParagraphs } from '../text/wrap.ts';

/** Wraps every `<br>` line of a text at spaces; an empty line stays one empty line. */
export const wrapLines = (parts: readonly string[], max: number, width: (s: string) => number): string[] => wrapParagraphs(parts, max, width, { split: 'space', blank: true });

export const pixelWidth = (ruler: Ruler) => (s: string): number => ruler.textWidth(s, 'title');
