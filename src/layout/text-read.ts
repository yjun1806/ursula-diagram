/**
 * Reading a terminal drawing from the rows it is written in: its boxes, the rules of its bands, the room its arrowheads
 * and bands ask for, and the labels it shows in full.
 */
import { cellWidthOf } from '../metrics.ts';
import { E, N, RUNS, S, W } from '../text/lines.ts';

/** Arrowheads that say which way they point: the step back to the cell behind them, and the way that cell has to run on. */
const HEADS: Record<string, readonly [number, number, number]> = {
  '▶': [-1, 0, E], '▷': [-1, 0, E],
  '◀': [1, 0, W], '◁': [1, 0, W],
  '▼': [0, -1, S], '▽': [0, -1, S],
  '▲': [0, 1, N], '△': [0, 1, N],
};

/** Marks at the end of a line that point no way. */
const ROUND_MARKS: ReadonlySet<string> = new Set(['◆', '◇', '⊕', '○']);

const TOP_LEFT: ReadonlySet<string> = new Set(['┌', '╭']);
const TOP_RIGHT: ReadonlySet<string> = new Set(['┐', '╮', '┒']);
const BOTTOM_LEFT: ReadonlySet<string> = new Set(['└', '╰']);
const BOTTOM_RIGHT: ReadonlySet<string> = new Set(['┘', '╯']);
const DOTS: ReadonlySet<string> = new Set(['●', '◉']);

/** What stands in an upright run between two boxes: the line, its crossings and the marks at its ends. */
const UPRIGHT: ReadonlySet<string> = new Set(['│', '┃', '┆', '┼', '╋', '├', '┤', '┣', '┫', '▼', '▲', '▽', '△', '◆', '◇', '⊕', '○', 'v', '^']);

const LEGEND = /^(──|━━|┄┄) .+ {3}(──|━━|┄┄) /;

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface RoomViolations {
  /** Arrowheads with no cell of line behind them. */
  headless: string[];
  /** Arrowheads whose cell of line, on the rule of a band, the name of the band is written over. */
  underName: string[];
  /** Arrowheads on the rule of a band. */
  onRule: string[];
  /** Boxes right below or right above the rule of a band. */
  tight: string[];
  /** Two boxes joined by a straight upright line with less than two rows between them. */
  close: string[];
}

/** The rows of a drawing as cells: a wide character takes two, the second one empty. */
export function cellsOf(lines: readonly string[]): string[][] {
  return lines.map((line) => {
    const row: string[] = [];
    for (const ch of line) {
      row.push(ch);
      if (cellWidthOf(ch.codePointAt(0) ?? 0) === 2) row.push('');
    }
    return row;
  });
}

/** The boxes of a drawing: whole rectangles of border glyphs, bars, and the dots a state diagram starts and ends at. */
export function boxesOf(grid: readonly string[][]): Box[] {
  const at = (x: number, y: number): string => grid[y]?.[x] ?? ' ';
  const out: Box[] = [];
  grid.forEach((row, y) => {
    row.forEach((ch, x) => {
      if (ch === '█' && at(x - 1, y) !== '█' && at(x, y - 1) !== '█') {
        let x1 = x;
        let y1 = y;
        while (at(x1 + 1, y) === '█') x1++;
        while (at(x, y1 + 1) === '█') y1++;
        out.push({ x0: x, y0: y, x1, y1 });
        return;
      }
      if (!TOP_LEFT.has(ch)) return;
      let x1 = x + 1;
      while (at(x1, y) === '─') x1++;
      if (x1 === x + 1 || !TOP_RIGHT.has(at(x1, y))) return;
      let y1 = y + 1;
      while ((at(x, y1) === '│' || at(x, y1) === '├') && (at(x1, y1) === '│' || at(x1, y1) === '┤')) y1++;
      if (y1 === y + 1 || !BOTTOM_LEFT.has(at(x, y1)) || !BOTTOM_RIGHT.has(at(x1, y1))) return;
      for (let k = x + 1; k < x1; k++) if (at(k, y1) !== '─') return;
      out.push({ x0: x, y0: y, x1, y1 });
    });
  });
  const framed = (x: number, y: number): boolean => out.some((b) => x > b.x0 && x < b.x1 && y > b.y0 && y < b.y1);
  const dots: Box[] = [];
  grid.forEach((row, y) => {
    row.forEach((ch, x) => {
      if (DOTS.has(ch) && !framed(x, y)) dots.push({ x0: x, y0: y, x1: x, y1: y });
    });
  });
  return [...out, ...dots];
}

/** The rows that hold the rule of a band: `── name ───`, from the first column on. The legend is not one. */
export function ruleRows(lines: readonly string[]): number[] {
  const out: number[] = [];
  lines.forEach((line, y) => {
    if ((line.startsWith('─') || line.startsWith('━')) && !LEGEND.test(line)) out.push(y);
  });
  return out;
}

/**
 * What a terminal drawing of boxes and lines shows against the room its arrowheads and bands ask for: every
 * arrowhead has a cell of line behind it and stands off the rule of a band, a rule has a row between it and the
 * boxes on either side, and two boxes one above the other that a straight line joins are two rows apart. An
 * arrowhead whose line the name of a band hides is told apart: the rule was too short for the name.
 */
export function roomViolations(lines: readonly string[], grid: readonly string[][] = cellsOf(lines)): RoomViolations {
  const at = (x: number, y: number): string => grid[y]?.[x] ?? ' ';
  const rules = ruleRows(lines);
  const onRule = new Set(rules);
  const boxes = boxesOf(grid);
  const found: RoomViolations = { headless: [], underName: [], onRule: [], tight: [], close: [] };
  const show = (y: number): string => `${y}: ${lines[y] ?? ''}`;
  grid.forEach((row, y) => {
    row.forEach((ch, x) => {
      const head = HEADS[ch];
      if (head !== undefined) {
        const [dx, dy, run] = head;
        if (onRule.has(y)) found.onRule.push(show(y));
        if (((RUNS[at(x + dx, y + dy)] ?? 0) & run) === 0) (dy !== 0 && onRule.has(y + dy) ? found.underName : found.headless).push(show(y));
        return;
      }
      if (!ROUND_MARKS.has(ch)) return;
      if (onRule.has(y)) found.onRule.push(show(y));
      const joined =
        ((RUNS[at(x - 1, y)] ?? 0) & E) !== 0 || ((RUNS[at(x + 1, y)] ?? 0) & W) !== 0 || ((RUNS[at(x, y - 1)] ?? 0) & S) !== 0 || ((RUNS[at(x, y + 1)] ?? 0) & N) !== 0;
      if (!joined) (onRule.has(y - 1) || onRule.has(y + 1) ? found.underName : found.headless).push(show(y));
    });
  });
  for (const r of rules) {
    for (const b of boxes) {
      if (b.y0 === r + 1 || b.y1 === r - 1) {
        found.tight.push(show(r));
        break;
      }
    }
  }
  const tops = new Map(boxes.map((b) => [b.y0, [] as Box[]] as const));
  for (const b of boxes) tops.get(b.y0)?.push(b);
  for (const a of boxes) {
    for (let x = a.x0; x <= a.x1; x++) {
      let y = a.y1 + 1;
      while (UPRIGHT.has(at(x, y))) y++;
      const gap = y - a.y1 - 1;
      if (gap === 0 || gap >= 2) continue;
      if ((tops.get(y) ?? []).some((b) => b !== a && x >= b.x0 && x <= b.x1)) found.close.push(show(a.y1 + 1));
    }
  }
  return found;
}

/**
 * The labels of a terminal drawing that are not written in full: for every label text, how many times fewer it stands
 * in the rows of the drawing than it was asked for. A text that is part of another one is found more often than asked
 * for; that never counts. A label the drawing cut short with an ellipsis is told apart by `cut`.
 */
/** How many label texts in all the rows of a drawing do not show in full (see `labelsNotShown`). */
export function labelsMissing(labels: readonly string[], lines: readonly string[]): number {
  const wanted = new Map<string, number>();
  for (const t of labels) if (t.trim() !== '') wanted.set(t.trim(), (wanted.get(t.trim()) ?? 0) + 1);
  let missing = 0;
  for (const [text, count] of wanted) missing += Math.max(0, count - lines.reduce((n, line) => n + line.split(text).length - 1, 0));
  return missing;
}

export function labelsNotShown(labels: readonly string[], lines: readonly string[]): Array<{ text: string; missing: number; cut: boolean }> {
  const wanted = new Map<string, number>();
  for (const t of labels) if (t.trim() !== '') wanted.set(t.trim(), (wanted.get(t.trim()) ?? 0) + 1);
  const times = (t: string): number => lines.reduce((n, line) => n + line.split(t).length - 1, 0);
  const shortened = (t: string): boolean => {
    for (let k = [...t].length - 1; k >= 1; k--) if (lines.some((line) => line.includes(`${[...t].slice(0, k).join('').trimEnd()}…`))) return true;
    return false;
  };
  const out: Array<{ text: string; missing: number; cut: boolean }> = [];
  for (const [text, count] of wanted) {
    const missing = count - times(text);
    if (missing > 0) out.push({ text, missing, cut: shortened(text) });
  }
  return out;
}
