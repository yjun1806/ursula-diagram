import { cellWidthOf } from '../metrics.ts';
import type { TextSpan } from '../types.ts';

/** The ASCII character of each box-drawing character, U+2500 to U+257F: `-` `|` `+` light, `=` `#` heavy, `.` `:` dashed. */
const BOX =
  '-=|#.=:#.=:#' +
  '+++#+++#+++#+++#+++++++#+++++++#+++++++#+++++++#+++++++++++++++#' +
  '.=:#' +
  '=#'.padEnd(29, '#') +
  '/\\/\\/\\x' +
  '-|-|=#=#-|-|';

const SHAPES: Record<number, string> = {
  0x25c6: '*',
  0x25c7: 'o',
  0x25c8: '*',
  0x25c9: '@',
  0x25ca: 'o',
  0x25cb: 'O',
  0x25cc: 'O',
  0x25ce: '@',
  0x25cf: '*',
};

const ARROWS: Record<number, string> = { 0x2190: '<', 0x2191: '^', 0x2193: 'v', 0x2194: '-', 0x2195: '|', 0x21d0: '<', 0x21d1: '^', 0x21d3: 'v', 0x21d4: '=' };

/** Characters outside the drawing blocks that the drawings use and that some terminals draw two cells wide. */
const OTHERS: Record<number, string> = {
  0x00b7: '.',
  0x00d7: 'x',
  0x2003: ' ',
  0x2013: '-',
  0x2014: '-',
  0x2026: '~',
  0x2229: '&',
  0x2295: '@',
  0x2297: 'x',
};

function asciiOf(ch: string): string {
  const cp = ch.codePointAt(0) ?? 0;
  if (cp < 0x80) return ch;
  if (cp >= 0x2500 && cp <= 0x257f) return BOX[cp - 0x2500] ?? '+';
  if (cp >= 0x2580 && cp <= 0x259f) return cp === 0x2581 ? '_' : cp === 0x2594 ? '-' : cp === 0x258e || cp === 0x258f || cp === 0x2595 ? '|' : '#';
  if (cp >= 0x25a0 && cp <= 0x25ff) {
    if (cp >= 0x25b2 && cp <= 0x25b5) return '^';
    if (cp >= 0x25b6 && cp <= 0x25bb) return '>';
    if (cp >= 0x25bc && cp <= 0x25bf) return 'v';
    if (cp >= 0x25c0 && cp <= 0x25c5) return '<';
    return SHAPES[cp] ?? (cp <= 0x25b1 ? '#' : 'o');
  }
  if (cp >= 0x2190 && cp <= 0x21ff) return ARROWS[cp] ?? '>';
  return OTHERS[cp] ?? ch;
}

/** Whether a character is a piece of a line: straight, a corner, a tee or a crossing. */
function isLine(ch: string | undefined): boolean {
  const cp = ch?.codePointAt(0) ?? 0;
  return cp >= 0x2500 && cp <= 0x2570;
}

/** What the bar of a count stands next to on an upright line: the side of a box, or the foot of a count. */
const BESIDE_BAR = new Set('─━┬┴┌┐└┘╭╮╰╯^v');
const REACHES_RIGHT = new Set('─━┄┈╌┌└├┬┴┼┏┗┣┳┻╋╭╰');
const REACHES_LEFT = new Set('─━┄┈╌┐┘┤┬┴┼┓┛┫┳┻╋╮╯┒');

/** The index in `row` of the character that starts at cell `column`; -1 when no character starts there. */
function indexAt(row: readonly string[] | undefined, column: number): number {
  if (row === undefined) return -1;
  let at = 0;
  for (let i = 0; i < row.length; i++) {
    if (at === column) return i;
    if (at > column) return -1;
    at += cellWidthOf(row[i]?.codePointAt(0) ?? 0);
  }
  return -1;
}

/**
 * The rows with every drawing character replaced by an ASCII one, cell for cell. A hollow arrowhead becomes the head
 * and a bar in the cell of the line behind it (`--|>`), so that it differs from a filled or an open head (`-->`). A
 * crossing that no line reaches from either side and that stands at a box is the bar of a count on an upright line and
 * becomes `-`.
 */
function asciiRows(rows: readonly (readonly string[])[]): string[][] {
  const out = rows.map((row) => row.map(asciiOf));
  const bar = (r: number, i: number, ch: string): void => {
    const target = out[r];
    if (target !== undefined && i >= 0 && isLine(rows[r]?.[i])) target[i] = ch;
  };
  const over = (r: number, column: number): string => rows[r]?.[indexAt(rows[r], column)] ?? '';
  const lone = (r: number, column: number): boolean => {
    const row = rows[r] ?? [];
    const i = indexAt(row, column);
    if (row[i] !== '┼') return false;
    // Bars of lines that run side by side stand side by side: what reaches them is looked for past all of them.
    let first = i;
    let last = i;
    while (row[first - 1] === '┼') first -= 1;
    while (row[last + 1] === '┼') last += 1;
    return !REACHES_RIGHT.has(row[first - 1] ?? '') && !REACHES_LEFT.has(row[last + 1] ?? '');
  };
  const atBox = (r: number, column: number): boolean => lone(r, column) && (BESIDE_BAR.has(over(r - 1, column)) || BESIDE_BAR.has(over(r + 1, column)));
  rows.forEach((row, r) => {
    let column = 0;
    row.forEach((ch, i) => {
      if (ch === '▷') bar(r, i - 1, '|');
      else if (ch === '◁') bar(r, i + 1, '|');
      else if (ch === '▽') bar(r - 1, indexAt(rows[r - 1], column), '-');
      else if (ch === '△') bar(r + 1, indexAt(rows[r + 1], column), '-');
      else if (ch === '┼' && (atBox(r, column) || (lone(r, column) && (atBox(r - 1, column) || atBox(r + 1, column))))) bar(r, i, '-');
      column += cellWidthOf(ch.codePointAt(0) ?? 0);
    });
  });
  return out;
}

/** Terminal rows drawn with ASCII characters only; the text of the diagram itself is left as it is. */
export function toAscii(lines: readonly string[]): string[] {
  return asciiRows(lines.map((line) => [...line])).map((row) => row.join(''));
}

/** `toAscii` for rows of spans; every span keeps its tone and its length. */
export function spansToAscii(lines: readonly (readonly TextSpan[])[]): TextSpan[][] {
  const rows = asciiRows(lines.map((line) => line.flatMap((span) => [...span.text])));
  return lines.map((line, r) => {
    let at = 0;
    return line.map((span) => {
      const length = [...span.text].length;
      const text = (rows[r] ?? []).slice(at, at + length).join('');
      at += length;
      return { ...span, text };
    });
  });
}
