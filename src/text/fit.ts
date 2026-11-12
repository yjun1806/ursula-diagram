import { cellWidth } from '../metrics.ts';

/** Cuts `text` between characters to at most `limit` as `width` measures it, ending in an ellipsis when something is left off. */
export function clip(text: string, limit: number, width: (s: string) => number = cellWidth): string {
  if (width(text) <= limit) return text;
  let out = '';
  for (const ch of text) {
    if (width(`${out}${ch}…`) > limit) break;
    out += ch;
  }
  return `${out}…`;
}

/**
 * Drops characters from the end, and the spaces they leave behind, until `text` and an ellipsis fit `room`.
 * Undefined when not even the ellipsis fits.
 */
export function shrinkToFit(text: string, room: number, width: (s: string) => number): string | undefined {
  if (width(text) <= room) return text;
  const chars = [...text];
  while (chars.length > 0) {
    chars.pop();
    const cut = `${chars.join('').trimEnd()}…`;
    if (width(cut) <= room) return cut;
  }
  return width('…') <= room ? '…' : undefined;
}
