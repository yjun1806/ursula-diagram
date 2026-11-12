import type { Ruler } from '../metrics.ts';

/** Breaks one line at spaces into lines no wider than `max`; a single word wider than `max` is cut between characters. */
export function wrapLine(text: string, max: number, width: (s: string) => number): string[] {
  const out: string[] = [];
  let cur = '';
  const push = (s: string): void => {
    if (s !== '') out.push(s);
  };
  for (const word of text.split(' ')) {
    if (word === '') continue;
    const joined = cur === '' ? word : `${cur} ${word}`;
    if (width(joined) <= max) {
      cur = joined;
      continue;
    }
    push(cur);
    cur = '';
    if (width(word) <= max) {
      cur = word;
      continue;
    }
    for (const ch of word) {
      if (cur !== '' && width(cur + ch) > max) {
        push(cur);
        cur = '';
      }
      cur += ch;
    }
  }
  push(cur);
  return out.length === 0 ? [''] : out;
}

/** Wraps every `<br>` line of a text. */
export function wrapLines(parts: readonly string[], max: number, width: (s: string) => number): string[] {
  return parts.flatMap((p) => wrapLine(p, max, width));
}

export const pixelWidth = (ruler: Ruler) => (s: string): number => ruler.textWidth(s, 'title');
