export interface WrapOptions {
  /** `'space'` splits at single spaces; `'whitespace'` (the default) splits at any run of whitespace. */
  split?: 'space' | 'whitespace';
  /** A word wider than a line is cut between characters (`'break'`, the default) or kept whole on a line of its own (`'keep'`). */
  longWord?: 'break' | 'keep';
  /** Text without a word gives one empty line instead of no line. */
  blank?: boolean;
  /** Text that fits already is the one line, exactly as written (runs of spaces kept). */
  keepIfFits?: boolean;
}

/**
 * Breaks `text` greedily into lines no wider than `limit` as `width` measures them, joining words with one space.
 */
export function wrapWords(text: string, limit: number, width: (s: string) => number, opts: WrapOptions = {}): string[] {
  if (opts.keepIfFits === true && (limit === Infinity || width(text) <= limit)) return [text];
  const words = (opts.split === 'space' ? text.split(' ') : text.split(/\s+/)).filter((w) => w !== '');
  const lines: string[] = [];
  let cur = '';
  for (const word of words) {
    const joined = cur === '' ? word : `${cur} ${word}`;
    if (width(joined) <= limit) {
      cur = joined;
      continue;
    }
    if (cur !== '') {
      lines.push(cur);
      cur = '';
    }
    if (opts.longWord === 'keep' || width(word) <= limit) {
      cur = word;
      continue;
    }
    for (const ch of word) {
      if (cur !== '' && width(cur + ch) > limit) {
        lines.push(cur);
        cur = '';
      }
      cur += ch;
    }
  }
  if (cur !== '') lines.push(cur);
  return lines.length === 0 && opts.blank === true ? [''] : lines;
}

/** Wraps every part on its own and joins the lines. */
export function wrapParagraphs(parts: readonly string[], limit: number, width: (s: string) => number, opts: WrapOptions = {}): string[] {
  return parts.flatMap((p) => wrapWords(p, limit, width, opts));
}
