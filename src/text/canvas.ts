import { cellWidthOf } from '../metrics.ts';
import type { TextSpan, TextTone } from '../types.ts';

/**
 * A grid of terminal cells. A wide character takes two cells and leaves an empty string in the second; writing over
 * either half of a wide character clears the other half, so a row never shifts.
 */
export class Canvas {
  readonly rows: string[][];
  /** The tone of every cell; kept only for a drawing given out in spans. */
  readonly tones: TextTone[][] | undefined;
  width: number;
  readonly height: number;
  /** The tone `put` and `text` write in when they are given none. */
  tone: TextTone = 'normal';

  constructor(width: number, height: number, toned = false) {
    this.width = width;
    this.height = height;
    this.rows = Array.from({ length: height }, () => new Array<string>(width).fill(' '));
    this.tones = toned ? Array.from({ length: height }, () => new Array<TextTone>(width).fill('normal')) : undefined;
  }

  /** Makes every row at least `width` cells wide; the new cells are blank. */
  widen(width: number): void {
    if (width <= this.width) return;
    for (const row of this.rows) while (row.length < width) row.push(' ');
    for (const row of this.tones ?? []) while (row.length < width) row.push('normal');
    this.width = width;
  }

  /** Writes one character; wide characters take two cells and never get split. */
  put(x: number, y: number, ch: string, tone: TextTone = this.tone): void {
    const row = this.rows[y];
    if (!row || x < 0 || x >= this.width) return;
    const wide = cellWidthOf(ch.codePointAt(0) ?? 0) === 2;
    if (wide && x + 1 >= this.width) return;
    if (row[x] === '' && x > 0) row[x - 1] = ' ';
    if (row[x + 1] === '' && !wide) row[x + 1] = ' ';
    if (wide) {
      if (row[x + 1] === '' && x + 2 < this.width) row[x + 2] = row[x + 2] === '' ? ' ' : row[x + 2] ?? ' ';
      if (row[x + 2] === '') row[x + 2] = ' ';
      row[x + 1] = '';
    }
    row[x] = ch;
    const tones = this.tones?.[y];
    if (tones !== undefined) tones[x] = tone;
  }

  get(x: number, y: number): string {
    return this.rows[y]?.[x] ?? ' ';
  }

  text(x: number, y: number, s: string, tone: TextTone = this.tone): void {
    let cx = x;
    for (const ch of s) {
      this.put(cx, y, ch, tone);
      cx += cellWidthOf(ch.codePointAt(0) ?? 0);
    }
  }

  lines(): string[] {
    return this.rows.map((r) => r.join('').trimEnd());
  }

  /**
   * The rows as spans of one tone, with the same text as `lines`. A blank takes the tone of the text on both sides of it
   * when they agree, so that a name of several words is one span; other blanks are plain.
   */
  spans(): TextSpan[][] {
    return this.rows.map((row, y) => {
      const text = row.join('').trimEnd();
      const tones = this.tones?.[y] ?? [];
      const out: TextSpan[] = [];
      let at = 0;
      const toneAt = (x: number): TextTone => {
        if (row[x] !== ' ') return tones[x] ?? 'normal';
        let l = x - 1;
        while (l >= 0 && (row[l] === ' ' || row[l] === '')) l--;
        let r = x + 1;
        while (r < row.length && (row[r] === ' ' || row[r] === '')) r++;
        const left = l >= 0 ? tones[l] : undefined;
        return left !== undefined && left === tones[r] && r < row.length ? left : 'normal';
      };
      for (let x = 0; x < row.length && at < text.length; x++) {
        const ch = row[x] ?? '';
        if (ch === '') continue;
        at += ch.length;
        const tone = toneAt(x);
        const last = out[out.length - 1];
        if (last !== undefined && last.tone === tone) out[out.length - 1] = { text: last.text + ch, tone };
        else out.push({ text: ch, tone });
      }
      return out;
    });
  }
}
