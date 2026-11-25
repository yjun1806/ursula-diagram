import { cellWidth } from '../metrics.ts';
import type { Layout, LayoutEdge, LayoutNode } from '../types.ts';
import { cellsOf, labelsNotShown, roomViolations } from './text-read.ts';

const N = 1;
const E = 2;
const S = 4;
const W = 8;
const LEVEL = E | W;
const UPRIGHT = N | S;

/** The ways the line glyph of a cell runs on. */
const RUNS: Record<string, number> = {
  '─': E | W, '━': E | W, '┄': E | W,
  '│': N | S, '┃': N | S, '┆': N | S,
  '┌': S | E, '┐': S | W, '└': N | E, '┘': N | W,
  '┏': S | E, '┓': S | W, '┗': N | E, '┛': N | W,
  '├': N | S | E, '┤': N | S | W, '┬': E | W | S, '┴': E | W | N, '┼': N | E | S | W,
  '┣': N | S | E, '┫': N | S | W, '┳': E | W | S, '┻': E | W | N, '╋': N | E | S | W,
};

/** Arrowheads. */
const HEADS: ReadonlySet<string> = new Set(['▶', '◀', '▼', '▲', '▷', '◁', '▽', '△']);

/** Arrowheads that point along a row. */
const LEVEL_HEADS: ReadonlySet<string> = new Set(['▶', '◀', '▷', '◁']);

/** What may stand at an end of a line: an arrowhead, or a glyph of a relation mark. */
const MARKS: ReadonlySet<string> = new Set([...HEADS, '◆', '◇', '⊕', '○', '<', '>', '^', 'v', '|', 'o', '┼']);

/** The corners of a box as the drawing writes them, for its shape. */
const CORNERS: Record<string, readonly [string, string, string, string]> = {
  square: ['┌', '┐', '└', '┘'],
  round: ['╭', '╮', '╰', '╯'],
  note: ['┌', '┒', '└', '┘'],
};

/**
 * What breaks in a terminal drawing of boxes and lines, counted on the rows it is written in. The layout says only
 * which line runs where and which label belongs to which line; every count reads the glyphs the rows hold.
 */
export interface Breaks {
  /** Lines that do not run on, cell by cell, from the side of the box they leave to the side of the box they reach. */
  brokenLines: number;
  /** Boxes whose border is not whole: a corner or a cell of a side is written over. */
  brokenBoxes: number;
  /** Cells where two lines that neither leave nor reach a box together run along one another or one turns on the other, and every crossing of two lines after their first. */
  tangled: number;
  /** Labels that stand by the line of another edge, beside two lines one cell apart, or next to another label. */
  strayLabels: number;
  /** Labels and texts at the ends of lines that are not written where they stand: a box, a line or another text covers them. */
  coveredLabels: number;
  /** Labels with no more than a blank between them and an arrowhead that points along their row. */
  labelsAtHeads: number;
  /** Arrowheads without a cell of line behind them, on the rule of a band, and the other breaks of the room arrowheads and bands ask for (see `roomViolations`). */
  room: number;
  /** Label texts the rows do not show in full. */
  unseen: number;
}

export const BREAK_KINDS: ReadonlyArray<keyof Breaks> = ['brokenLines', 'brokenBoxes', 'tangled', 'strayLabels', 'coveredLabels', 'labelsAtHeads', 'room', 'unseen'];

/** The cells of a line and the ways it runs on in each, as the drawing draws it; undefined for a line with a slanted stretch. */
function runsOf(edge: LayoutEdge, nodes: Map<string, LayoutNode>): { cells: Array<[number, number]>; bits: Map<string, number> } | undefined {
  const cellAt = (index: number): [number, number] => {
    const p = edge.points[index] ?? { x: 0, y: 0 };
    let x = Math.floor(p.x + 1e-9);
    let y = Math.floor(p.y + 1e-9);
    const node = index === 0 ? nodes.get(edge.from) : index === edge.points.length - 1 ? nodes.get(edge.to) : undefined;
    if (node !== undefined) {
      if (Math.abs(p.x - node.x) < 1e-9) x -= 1;
      if (Math.abs(p.y - node.y) < 1e-9) y -= 1;
    }
    return [x, y];
  };
  const corners = edge.points.map((_, i) => cellAt(i));
  const bits = new Map<string, number>();
  const cells: Array<[number, number]> = [];
  const add = (x: number, y: number, bit: number): void => {
    const key = `${x},${y}`;
    if (!bits.has(key)) cells.push([x, y]);
    bits.set(key, (bits.get(key) ?? 0) | bit);
  };
  const first = corners[0];
  if (first === undefined) return undefined;
  add(first[0], first[1], 0);
  for (let i = 0; i + 1 < corners.length; i++) {
    const [x1, y1] = corners[i] as [number, number];
    const [x2, y2] = corners[i + 1] as [number, number];
    const dx = Math.sign(x2 - x1);
    const dy = Math.sign(y2 - y1);
    if (dx !== 0 && dy !== 0) return undefined;
    if (dx === 0 && dy === 0) continue;
    const out = dx > 0 ? E : dx < 0 ? W : dy > 0 ? S : N;
    const back = dx > 0 ? W : dx < 0 ? E : dy > 0 ? N : S;
    for (let x = x1, y = y1; x !== x2 || y !== y2; ) {
      add(x, y, out);
      x += dx;
      y += dy;
      add(x, y, back);
    }
  }
  // The end on a box reaches toward the box.
  const toward = (index: number, id: string): void => {
    const n = nodes.get(id);
    const p = edge.points[index];
    const cell = corners[index];
    if (n === undefined || p === undefined || cell === undefined) return;
    const bit = Math.abs(p.x - n.x) < 1e-9 ? E : Math.abs(p.x - n.x - n.w) < 1e-9 ? W : Math.abs(p.y - n.y) < 1e-9 ? S : Math.abs(p.y - n.y - n.h) < 1e-9 ? N : 0;
    if (bit !== 0) add(cell[0], cell[1], bit);
  };
  toward(0, edge.from);
  toward(edge.points.length - 1, edge.to);
  return { cells, bits };
}

/** Two lines that leave a box together, reach one together or share a port: where they run as one, a reader still reads them right. */
const together = (a: LayoutEdge, b: LayoutEdge): boolean =>
  a.from === b.from || a.to === b.to || (a.sharedPort !== undefined && a.sharedPort.id === b.sharedPort?.id) || (a.trunk !== undefined && a.trunk.id === b.trunk?.id);

interface Spot {
  x0: number;
  x1: number;
  y: number;
  text: string;
}

/** Where a label writes its text: the first and the last cell of it, and its row. */
function spotOf(l: NonNullable<LayoutEdge['label']>): Spot {
  const x = Math.round(l.x);
  const w = cellWidth(l.text);
  const x0 = x + Math.floor((l.w - w) / 2);
  return { x0, x1: x0 + w - 1, y: Math.round(l.y) + Math.floor((l.h - 1) / 2), text: l.text };
}

/** Whether `text` stands in the cells of a row from `x` on. */
function written(grid: readonly string[][], x: number, y: number, text: string): boolean {
  const want = cellsOf([text])[0] ?? [];
  const row = grid[y] ?? [];
  return want.every((ch, k) => (row[x + k] ?? ' ') === ch);
}

/**
 * Counts what breaks in `lines`, the rows a terminal drawing of `layout` is written in. `labels` are the label texts
 * the drawing is asked to show in full (the labels of the layout when absent). `notes`, when given, is told where each break is.
 */
export function breaksOf(layout: Layout, lines: readonly string[], labels?: readonly string[], notes?: string[]): Breaks {
  const note = (what: string): void => {
    notes?.push(what);
  };
  const grid = cellsOf(lines);
  const at = (x: number, y: number): string => grid[y]?.[x] ?? ' ';
  const nodes = new Map(layout.nodes.map((n) => [n.id, n] as const));
  const drawn = layout.edges.filter((e) => e.invisible !== true && e.points.length >= 2);
  const runs = drawn.map((e) => runsOf(e, nodes));

  let brokenLines = 0;
  drawn.forEach((e, i) => {
    const run = runs[i];
    if (run === undefined) return;
    const own = e.label === undefined ? undefined : spotOf(e.label);
    const ends = run.cells.length;
    const broken = run.cells.find(([x, y], k) => {
      const ch = at(x, y);
      const need = run.bits.get(`${x},${y}`) ?? 0;
      if (((RUNS[ch] ?? 0) & need) === need && need !== 0) return false;
      if ((k < 2 || k >= ends - 2) && MARKS.has(ch)) return false;
      // Its own label stands on a straight stretch of the line.
      if (own !== undefined && y === own.y && x >= own.x0 - 1 && x <= own.x1 + 1 && (need === LEVEL || need === UPRIGHT || need === E || need === W)) return false;
      return true;
    });
    if (broken !== undefined) {
      brokenLines++;
      note(`line ${e.from}->${e.to} broken at ${broken[0]},${broken[1]}`);
    }
  });

  let brokenBoxes = 0;
  for (const n of layout.nodes) {
    const [x0, y0, w, h] = [Math.round(n.x), Math.round(n.y), Math.round(n.w), Math.round(n.h)];
    if (w < 2 || h < 2) continue;
    const [x1, y1] = [x0 + w - 1, y0 + h - 1];
    let whole: boolean;
    if (n.shape === 'bar') {
      whole = [at(x0, y0), at(x1, y0), at(x0, y1), at(x1, y1)].every((c) => c === '█');
    } else {
      const [tl, tr, bl, br] = CORNERS[n.shape === 'ellipse' || n.shape === 'actor' ? 'round' : n.shape === 'note' ? 'note' : 'square'] as readonly [string, string, string, string];
      whole = at(x0, y0) === tl && at(x1, y0) === tr && at(x0, y1) === bl && at(x1, y1) === br;
      for (let x = x0 + 1; whole && x < x1; x++) whole = at(x, y0) === '─' && at(x, y1) === '─';
      for (let y = y0 + 1; whole && y < y1; y++) whole = (at(x0, y) === '│' || at(x0, y) === '├') && (at(x1, y) === '│' || at(x1, y) === '┤');
    }
    if (!whole) {
      brokenBoxes++;
      note(`box ${n.id} broken`);
    }
  }

  // Cells of every line, and the lines in each.
  const byCell = new Map<string, number[]>();
  runs.forEach((run, i) => {
    for (const [x, y] of run?.cells ?? []) byCell.set(`${x},${y}`, [...(byCell.get(`${x},${y}`) ?? []), i]);
  });
  let tangled = 0;
  for (const [key, list] of byCell) {
    if (list.length < 2) continue;
    const tangles = list.some((i, k) =>
      list.slice(k + 1).some((j) => {
        if (together(drawn[i] as LayoutEdge, drawn[j] as LayoutEdge)) return false;
        const [a, b] = [runs[i]?.bits.get(key) ?? 0, runs[j]?.bits.get(key) ?? 0];
        return ((a & LEVEL) !== 0 && (b & LEVEL) !== 0) || ((a & UPRIGHT) !== 0 && (b & UPRIGHT) !== 0);
      }),
    );
    if (tangles) {
      tangled++;
      note(`lines tangled at ${key}`);
    }
  }
  // Two lines that cross one another more than once wind about each other: every crossing after the first counts.
  const crossings = new Map<string, number>();
  for (const [key, list] of byCell) {
    list.forEach((i, k) =>
      list.slice(k + 1).forEach((j) => {
        const [a, b] = [runs[i]?.bits.get(key) ?? 0, runs[j]?.bits.get(key) ?? 0];
        if ((a === LEVEL && b === UPRIGHT) || (a === UPRIGHT && b === LEVEL)) crossings.set(`${i}|${j}`, (crossings.get(`${i}|${j}`) ?? 0) + 1);
      }),
    );
  }
  for (const [pair, n] of crossings) {
    tangled += n - 1;
    if (n > 1) note(`lines ${pair} cross ${n} times`);
  }

  // Labels: their own line, the lines of others, arrowheads and other labels about them.
  const lineOf = (x: number, y: number): number[] => (RUNS[at(x, y)] === undefined && !MARKS.has(at(x, y)) ? [] : (byCell.get(`${x},${y}`) ?? []));
  const spots = drawn.map((e) => (e.label === undefined ? undefined : spotOf(e.label)));
  let strayLabels = 0;
  let coveredLabels = 0;
  let labelsAtHeads = 0;
  drawn.forEach((e, i) => {
    const spot = spots[i];
    if (spot === undefined) return;
    if (!written(grid, spot.x0, spot.y, spot.text)) {
      coveredLabels++;
      note(`label ${spot.text} covered`);
    }
    const other = (x: number, y: number): boolean => lineOf(x, y).some((j) => j !== i) && !lineOf(x, y).includes(i);
    const mine = (x: number, y: number): boolean => lineOf(x, y).includes(i);
    const blank = (x: number, y: number): boolean => at(x, y) === ' ';
    let stray = false;
    // The line of another edge right beside the text or a blank away from it, or right above or below it.
    if (other(spot.x0 - 1, spot.y) || other(spot.x1 + 1, spot.y)) stray = true;
    if ((blank(spot.x0 - 1, spot.y) && other(spot.x0 - 2, spot.y)) || (blank(spot.x1 + 1, spot.y) && other(spot.x1 + 2, spot.y))) stray = true;
    for (let x = spot.x0; x <= spot.x1 && !stray; x++) if (other(x, spot.y - 1) || other(x, spot.y + 1)) stray = true;
    // Beside its own upright line with another line one cell beyond it: the label reads as the label of either.
    for (const [side, edge] of [[1, spot.x1], [-1, spot.x0]] as const) {
      const near = edge + 2 * side;
      if (!stray && blank(edge + side, spot.y) && mine(near, spot.y) && ((RUNS[at(near, spot.y)] ?? 0) & UPRIGHT) !== 0 && blank(near + side, spot.y) && other(near + 2 * side, spot.y) && ((RUNS[at(near + 2 * side, spot.y)] ?? 0) & UPRIGHT) !== 0) stray = true;
    }
    // Another label in the same row with no more than two blanks and no line between them.
    for (const [j, o] of spots.entries()) {
      if (stray || o === undefined || j === i || o.y !== spot.y) continue;
      const [a, b] = o.x0 > spot.x1 ? [spot.x1, o.x0] : o.x1 < spot.x0 ? [o.x1, spot.x0] : [0, 0];
      if (b - a - 1 <= 2 && b > a && Array.from({ length: b - a - 1 }, (_, k) => a + 1 + k).every((x) => blank(x, spot.y))) stray = true;
    }
    if (stray) {
      strayLabels++;
      note(`label ${spot.text} stray`);
    }
    const headAt = (x: number, between: number): boolean => LEVEL_HEADS.has(at(x, spot.y)) && (between === 0 || blank(between, spot.y));
    if (headAt(spot.x1 + 1, 0) || headAt(spot.x1 + 2, spot.x1 + 1) || headAt(spot.x0 - 1, 0) || headAt(spot.x0 - 2, spot.x0 - 1)) labelsAtHeads++;
  });
  for (const e of drawn) {
    for (const t of [e.startLabel, e.endLabel]) {
      if (t !== undefined && t.text !== '' && !written(grid, Math.round(t.x), Math.round(t.y), t.text)) {
        coveredLabels++;
        note(`end text ${t.text} covered`);
      }
    }
  }

  const room = roomViolations(lines);
  const asked = labels ?? drawn.flatMap((e) => (e.label === undefined ? [] : (e.label.lines ?? [e.label.text])));
  return {
    brokenLines,
    brokenBoxes,
    tangled,
    strayLabels,
    coveredLabels,
    labelsAtHeads,
    room: room.headless.length + room.underName.length + room.onRule.length + room.tight.length + room.close.length,
    unseen: labelsNotShown(asked, lines).reduce((n, m) => n + m.missing, 0),
  };
}

/** Whether drawing `a` breaks more than drawing `b` in some respect. */
export const breaksMore = (a: Breaks, b: Breaks): boolean => BREAK_KINDS.some((k) => a[k] > b[k]);

/** What a label can suffer: standing astray, covered, at an arrowhead, or not shown in full. */
const LABEL_KINDS: ReadonlyArray<keyof Breaks> = ['strayLabels', 'coveredLabels', 'labelsAtHeads', 'unseen'];

/**
 * Whether drawing `a` breaks more than drawing `b` where a label that is moved trades one break for another: every
 * break of lines, boxes and room counts on its own, and the breaks of labels count together.
 */
export const breaksMoreMovingLabels = (a: Breaks, b: Breaks): boolean => {
  const sum = (x: Breaks): number => LABEL_KINDS.reduce((n, k) => n + x[k], 0);
  return BREAK_KINDS.some((k) => !LABEL_KINDS.includes(k) && a[k] > b[k]) || sum(a) > sum(b);
};
