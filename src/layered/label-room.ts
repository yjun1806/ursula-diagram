import type { Ruler } from '../metrics.ts';
import type { EdgeStyle } from '../types.ts';
import type { LabelSize } from '../layout/labels.ts';

/** Length of arrowhead the drawing puts at the end of an edge. */
export const ARROW = 8;

/** Line that has to stay visible on the side of a label away from the arrowhead: more for a dotted line, which needs a few dashes to read. */
export const lineBeside = (style: EdgeStyle): number => (style === 'dotted' ? 24 : 16);

/** Room a label on a straight edge between neighbours needs beyond its own width: a line on each side, and the arrowhead on one. */
export const roomAround = (style: EdgeStyle): number => 2 * lineBeside(style) + ARROW;

/** Size of a label of one or two lines. */
export function labelBox(lines: string[], ruler: Ruler): LabelSize {
  return {
    w: Math.max(0, ...lines.map((l) => ruler.textWidth(l, 'edge'))) + 2 * ruler.labelPadX,
    h: lines.length * ruler.lineHeight('edge') + 2 * ruler.labelPadY,
  };
}

/** The text cut at the space that leaves the two lines nearest in width; undefined when it has no space. */
export function splitLabel(text: string, ruler: Ruler): string[] | undefined {
  let best: string[] | undefined;
  let bestDiff = Infinity;
  for (let i = 1; i < text.length - 1; i++) {
    if (text[i] !== ' ') continue;
    const a = text.slice(0, i).trim();
    const b = text.slice(i + 1).trim();
    if (a === '' || b === '') continue;
    const diff = Math.abs(ruler.textWidth(a, 'edge') - ruler.textWidth(b, 'edge'));
    if (diff < bestDiff) {
      bestDiff = diff;
      best = [a, b];
    }
  }
  return best;
}

/**
 * The lines a label between neighbouring boxes is written in: one, unless that needs more than the gap and two lines
 * need fewer places (units of the slot grid) of room.
 */
export function labelLines(text: string, style: EdgeStyle, ruler: Ruler, gap: number, unit: number): string[] {
  const one = labelBox([text], ruler).w + roomAround(style);
  if (one <= gap) return [text];
  const split = splitLabel(text, ruler);
  if (!split) return [text];
  const two = labelBox(split, ruler).w + roomAround(style);
  const places = (need: number): number => Math.max(0, Math.ceil((need - gap) / unit - 1e-9));
  return places(two) < places(one) ? split : [text];
}
