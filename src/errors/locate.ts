// Finds where on its line an error points, from the pieces of source text its message quotes.

/** The quoted pieces of a message, `near '…'` first, then `"…"` and `'…'` in the order they appear. */
export function quotedPieces(message: string): string[] {
  const near = /near '([\s\S]*?)'(?=[\s.,;:)]|$)/.exec(message)?.[1];
  const rest = message.replace(/near '[\s\S]*?'(?=[\s.,;:)]|$)/, '');
  const quoted = [...rest.matchAll(/(?<![\w])(["'])([\s\S]*?)\1(?=[\s.,;:)]|$)/g)].map((m) => m[2] ?? '');
  return [...(near === undefined ? [] : [near]), ...quoted].map((p) => p.replace(/\.\.\.$/, ''));
}

/**
 * The column (from 1) where the first piece of `message` that occurs on `row` starts. An empty piece points just past
 * the end of the line. Undefined when no piece is on the line.
 */
export function locate(message: string, row: string): number | undefined {
  const closer = /^missing '([\])}])'/.exec(message)?.[1];
  const opener = closer === undefined ? undefined : unclosed(row, closer);
  if (opener !== undefined) return opener;
  const found = locatePiece(message, row);
  if (found !== undefined || row.trim() === '') return found;
  // No quoted piece: guess from what the message is about.
  if (/indent|lines up|one root|level/i.test(message)) return row.length - row.trimStart().length + 1;
  if (/\b(needs?|not closed|never closed|unterminated|missing|has no|is empty|three fields)\b/i.test(message)) return row.trimEnd().length + 1;
  return undefined;
}

const OPENER: Record<string, string> = { ']': '[', ')': '(', '}': '{' };

/**
 * The column (from 1) of the last bracket on `row` that `closer` would close and nothing closes; undefined when every
 * one is closed. Brackets inside double quotes do not count.
 */
export function unclosed(row: string, closer: string): number | undefined {
  const opener = OPENER[closer];
  const open: number[] = [];
  let quoted = false;
  for (let i = 0; i < row.length; i++) {
    const ch = row[i];
    if (ch === '"') quoted = !quoted;
    else if (quoted) continue;
    else if (ch === opener) open.push(i);
    else if (ch === closer) open.pop();
  }
  const at = open.at(-1);
  return at === undefined ? undefined : at + 1;
}

function locatePiece(message: string, row: string): number | undefined {
  for (const piece of quotedPieces(message)) {
    if (piece === '') return row.trimEnd().length + 1;
    const at = row.indexOf(piece);
    if (at >= 0) return at + 1;
    const trimmed = piece.trim();
    if (trimmed !== '' && trimmed !== piece) {
      const again = row.indexOf(trimmed);
      if (again >= 0) return again + 1;
    }
  }
  return undefined;
}

/** The word a line starts with: letters, digits, `_`, `@`, and inner hyphens as in `x-axis`. */
export function leadingWord(row: string): string {
  return /^[\p{L}_@][\p{L}\p{N}_@]*(?:-[\p{L}\p{N}_]+)*/u.exec(row.trim())?.[0] ?? '';
}
