import { cellWidth } from '../metrics.ts';
import type { Layout, LayoutEdge, LayoutNode } from '../types.ts';
import { cellsOf, labelsMissing, roomViolations } from './text-read.ts';

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

/** Arrowheads that point along a column. */
const UPRIGHT_HEADS: ReadonlySet<string> = new Set(['▼', '▲', '▽', '△']);

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
  /** Labels that stand by the line of another edge, the rule of a band or the frame of a group, or by no line of their own; and texts at the ends of lines written right against a word. */
  strayLabels: number;
  /** Labels beside two upright lines of two nets with no more than a blank between them, or next to another label. */
  crowdedLabels: number;
  /** Labels and texts at the ends of lines that are not written where they stand: a box, a line or another text covers them. */
  coveredLabels: number;
  /** Labels with no more than a blank between them and an arrowhead that points along their row. */
  labelsAtHeads: number;
  /** Arrowheads without a cell of line behind them, on the rule of a band, and the other breaks of the room arrowheads and bands ask for (see `roomViolations`). */
  room: number;
  /** Label texts the rows do not show in full. */
  unseen: number;
  /** Cells drawn as a crossing (`┼`) where a line turns or branches: a reader cannot tell the fork from a crossing. */
  forks: number;
  /** Cells drawn as a crossing (`┼`) of two lines or more, away from boxes: the crossings a reader sees. */
  crossMarks: number;
  /** Lines that run as one, so that a reader following them may go from a box to a box no line joins. */
  mixedNets: number;
  /** Lines that run right along the side of a box they neither leave nor reach, or right along another line they do not run with. */
  hugging: number;
  /** Cells a line runs through with a text written in them that is not the label of a line running there: another label written over a line reads as its label. */
  overwritten: number;
}

export const BREAK_KINDS: ReadonlyArray<keyof Breaks> = ['brokenLines', 'brokenBoxes', 'tangled', 'strayLabels', 'crowdedLabels', 'coveredLabels', 'labelsAtHeads', 'room', 'unseen', 'forks', 'crossMarks', 'mixedNets', 'hugging', 'overwritten'];

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
    for (const [x, y] of run?.cells ?? []) {
      const key = `${x},${y}`;
      const list = byCell.get(key);
      if (list === undefined) byCell.set(key, [i]);
      else list.push(i);
    }
  });
  // Lines that share a cell other than where they cross run as one: a reader may follow them from the start of any to the end of any.
  const root = drawn.map((_, i) => i);
  const find = (i: number): number => (root[i] === i ? i : find(root[i] as number));
  for (const [key, list] of byCell) {
    list.forEach((i, k) =>
      list.slice(k + 1).forEach((j) => {
        const [a, b] = [runs[i]?.bits.get(key) ?? 0, runs[j]?.bits.get(key) ?? 0];
        if ((a === LEVEL && b === UPRIGHT) || (a === UPRIGHT && b === LEVEL)) return;
        root[find(i)] = find(j);
      }),
    );
  }
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
  const inBox = (x: number, y: number): boolean => layout.nodes.some((n) => x >= Math.round(n.x) && x < Math.round(n.x + n.w) && y >= Math.round(n.y) && y < Math.round(n.y + n.h));
  // A line glyph that is no line of an edge and no side of a box: the rule of a band or the frame of a group.
  const rule = (x: number, y: number): boolean => RUNS[at(x, y)] !== undefined && !byCell.has(`${x},${y}`) && !inBox(x, y);
  const uprightAt = (x: number, y: number): boolean => ((RUNS[at(x, y)] ?? 0) & UPRIGHT) !== 0 || UPRIGHT_HEADS.has(at(x, y));
  // Lines of two nets: no cell of one is a cell of the other, but where they cross.
  const apart = (p: readonly number[], q: readonly number[]): boolean => !p.some((i) => q.some((j) => find(i) === find(j)));
  const spots = drawn.map((e) => (e.label === undefined ? undefined : spotOf(e.label)));
  let strayLabels = 0;
  let crowdedLabels = 0;
  let coveredLabels = 0;
  let labelsAtHeads = 0;
  drawn.forEach((e, i) => {
    const spot = spots[i];
    if (spot === undefined) return;
    // A label that is not written where it stands is covered, and nothing else is said of it: a reader does not see it to read it astray.
    if (!written(grid, spot.x0, spot.y, spot.text)) {
      coveredLabels++;
      note(`label ${spot.text} covered`);
      return;
    }
    const other = (x: number, y: number): boolean => (lineOf(x, y).some((j) => j !== i) && !lineOf(x, y).includes(i)) || rule(x, y);
    const mine = (x: number, y: number): boolean => lineOf(x, y).includes(i);
    const blank = (x: number, y: number): boolean => at(x, y) === ' ';
    let stray = false;
    // The line of another edge right beside the text or a blank away from it, or right above or below it.
    if (other(spot.x0 - 1, spot.y) || other(spot.x1 + 1, spot.y)) stray = true;
    if ((blank(spot.x0 - 1, spot.y) && other(spot.x0 - 2, spot.y)) || (blank(spot.x1 + 1, spot.y) && other(spot.x1 + 2, spot.y))) stray = true;
    for (let x = spot.x0; x <= spot.x1 && !stray; x++) if (other(x, spot.y - 1) || other(x, spot.y + 1)) stray = true;
    // Or no cell of its own line right beside it, up to two blanks away, above or below it: it is the label of no line.
    const reach = (side: 1 | -1): Array<[number, number]> => {
      const edge = side > 0 ? spot.x1 : spot.x0;
      const out: Array<[number, number]> = [];
      for (let k = 1; k <= 3; k++) {
        out.push([edge + k * side, spot.y]);
        if (!blank(edge + k * side, spot.y)) break;
      }
      return out;
    };
    const around = [...reach(1), ...reach(-1), ...Array.from({ length: spot.x1 - spot.x0 + 1 }, (_, k) => [[spot.x0 + k, spot.y - 1], [spot.x0 + k, spot.y + 1]]).flat()] as Array<[number, number]>;
    if (!around.some(([x, y]) => mine(x, y))) stray = true;
    if (stray) {
      strayLabels++;
      note(`label ${spot.text} stray`);
    }
    let crowded = false;
    // Beside its own upright line with another line one cell beyond it: the label reads as the label of either.
    for (const [side, edge] of [[1, spot.x1], [-1, spot.x0]] as const) {
      const near = edge + 2 * side;
      if (!crowded && blank(edge + side, spot.y) && mine(near, spot.y) && ((RUNS[at(near, spot.y)] ?? 0) & UPRIGHT) !== 0 && blank(near + side, spot.y) && other(near + 2 * side, spot.y) && ((RUNS[at(near + 2 * side, spot.y)] ?? 0) & UPRIGHT) !== 0) crowded = true;
    }
    // Two upright lines that are not drawn as one, with no more than a blank between the text and the first and between the two: the label reads as the label of either.
    for (const side of [1, -1] as const) {
      if (crowded) break;
      let x = (side > 0 ? spot.x1 : spot.x0) + side;
      if (blank(x, spot.y)) x += side;
      if (!uprightAt(x, spot.y) || lineOf(x, spot.y).length === 0) continue;
      let x2 = x + side;
      if (blank(x2, spot.y)) x2 += side;
      if (uprightAt(x2, spot.y) && lineOf(x2, spot.y).length > 0 && apart(lineOf(x, spot.y), lineOf(x2, spot.y))) crowded = true;
    }
    // Another label in the same row with no more than two blanks and no line between them.
    for (const [j, o] of spots.entries()) {
      if (crowded || o === undefined || j === i || o.y !== spot.y) continue;
      const [a, b] = o.x0 > spot.x1 ? [spot.x1, o.x0] : o.x1 < spot.x0 ? [o.x1, spot.x0] : [0, 0];
      if (b - a - 1 <= 2 && b > a && Array.from({ length: b - a - 1 }, (_, k) => a + 1 + k).every((x) => blank(x, spot.y))) crowded = true;
    }
    if (crowded) {
      crowdedLabels++;
      note(`label ${spot.text} crowded`);
    }
    const headAt = (x: number, between: number): boolean => LEVEL_HEADS.has(at(x, spot.y)) && (between === 0 || blank(between, spot.y));
    if (headAt(spot.x1 + 1, 0) || headAt(spot.x1 + 2, spot.x1 + 1) || headAt(spot.x0 - 1, 0) || headAt(spot.x0 - 2, spot.x0 - 1)) labelsAtHeads++;
  });
  const word = (x: number, y: number): boolean => /[\p{L}\p{N}*]/u.test(at(x, y)) && !inBox(x, y);
  for (const e of drawn) {
    for (const t of [e.startLabel, e.endLabel]) {
      if (t === undefined || t.text === '') continue;
      const [x, y] = [Math.round(t.x), Math.round(t.y)];
      if (!written(grid, x, y, t.text)) {
        coveredLabels++;
        note(`end text ${t.text} covered`);
      } else if (word(x - 1, y) || word(x + cellWidth(t.text), y)) {
        // A text at the end of a line written right against a label or another text reads as one word with it.
        strayLabels++;
        note(`end text ${t.text} against a word`);
      }
    }
  }

  // A crossing glyph where a line turns or branches reads as a crossing.
  let forks = 0;
  let crossMarks = 0;
  for (const [key, list] of byCell) {
    const [x, y] = key.split(',').map(Number) as [number, number];
    if (at(x, y) !== '┼' && at(x, y) !== '╋') continue;
    if ([[0, -1], [1, 0], [0, 1], [-1, 0]].some(([dx, dy]) => inBox(x + (dx as number), y + (dy as number)))) continue;
    // A line that crosses the rule of a band is not a crossing of two lines.
    if (list.length > 1) crossMarks++;
    if (list.some((i) => {
      const b = runs[i]?.bits.get(key) ?? 0;
      return b !== LEVEL && b !== UPRIGHT;
    })) {
      forks++;
      note(`fork drawn as a crossing at ${key}`);
    }
  }

  const twoWay = (e: LayoutEdge): boolean => e.end === 'none' || e.startEnd !== undefined;
  const joins = new Set(drawn.flatMap((e) => (twoWay(e) ? [`${e.from}>${e.to}`, `${e.to}>${e.from}`] : [`${e.from}>${e.to}`])));
  let mixedNets = 0;
  const nets = new Map<number, LayoutEdge[]>();
  drawn.forEach((e, i) => nets.set(find(i), [...(nets.get(find(i)) ?? []), e]));
  for (const net of nets.values()) {
    if (net.length < 2) continue;
    const froms = new Set(net.flatMap((e) => (twoWay(e) ? [e.from, e.to] : [e.from])));
    const tos = new Set(net.flatMap((e) => (twoWay(e) ? [e.from, e.to] : [e.to])));
    if (net.every((e) => e.from === net[0]?.from) || net.every((e) => e.to === net[0]?.to)) continue;
    if ([...froms].every((a) => [...tos].every((b) => a === b || joins.has(`${a}>${b}`)))) continue;
    mixedNets++;
    note(`lines ${net.map((e) => `${e.from}->${e.to}`).join(', ')} run as one`);
  }

  // A line right along the side of a box it neither leaves nor reaches, or right along a line it is not drawn with, for two cells or more.
  let hugging = 0;
  const hugged = new Set<string>();
  // The cells of the sides of boxes, corners left out, with whether the side runs along a row.
  const sides = new Map<string, Array<{ id: string; level: boolean }>>();
  const side = (x: number, y: number, id: string, level: boolean): void => {
    const key = `${x},${y}`;
    const list = sides.get(key);
    if (list === undefined) sides.set(key, [{ id, level }]);
    else list.push({ id, level });
  };
  for (const n of layout.nodes) {
    const [x0, y0, x1, y1] = [Math.round(n.x), Math.round(n.y), Math.round(n.x + n.w) - 1, Math.round(n.y + n.h) - 1];
    for (let x = x0 + 1; x < x1; x++) {
      side(x, y0, n.id, true);
      side(x, y1, n.id, true);
    }
    for (let y = y0 + 1; y < y1; y++) {
      side(x0, y, n.id, false);
      side(x1, y, n.id, false);
    }
  }
  drawn.forEach((e, i) => {
    const run = runs[i];
    if (run === undefined) return;
    for (const [x, y] of run.cells) {
      const b = run.bits.get(`${x},${y}`) ?? 0;
      if (b !== LEVEL && b !== UPRIGHT) continue;
      const across = b === LEVEL ? [[0, -1], [0, 1]] : [[-1, 0], [1, 0]];
      const along = b === LEVEL ? [1, 0] : [0, 1];
      for (const [dx, dy] of across as Array<[number, number]>) {
        const [nx, ny] = [x + dx, y + dy];
        // Nothing beside the cell: no box and no line to run along.
        if (!sides.has(`${nx},${ny}`) && !byCell.has(`${nx},${ny}`)) continue;
        const [fx, fy] = [x + (along[0] as number), y + (along[1] as number)];
        if ((run.bits.get(`${fx},${fy}`) ?? 0) !== b) continue;
        const near = sides.get(`${nx},${ny}`);
        const box = near === undefined ? undefined : near.find((n) => n.level === (b === LEVEL) && n.id !== e.from && n.id !== e.to && sides.get(`${nx + (along[0] as number)},${ny + (along[1] as number)}`)?.some((m) => m.id === n.id && m.level === n.level));
        if (box !== undefined && !hugged.has(`${i}|${box.id}`)) {
          hugged.add(`${i}|${box.id}`);
          hugging++;
          note(`line ${e.from}->${e.to} along box ${box.id}`);
        }
        for (const j of byCell.get(`${nx},${ny}`) ?? []) {
          const pair = i < j ? `${i}|${j}` : `${j}|${i}`;
          if (j === i || hugged.has(pair) || !apart([i], [j]) || together(e, drawn[j] as LayoutEdge)) continue;
          const [ob, of] = [runs[j]?.bits.get(`${nx},${ny}`) ?? 0, runs[j]?.bits.get(`${nx + (along[0] as number)},${ny + (along[1] as number)}`) ?? 0];
          if (ob !== b || of !== b) continue;
          hugged.add(pair);
          hugging++;
          note(`lines ${e.from}->${e.to} and ${drawn[j]?.from}->${drawn[j]?.to} run side by side`);
        }
      }
    }
  });

  // Cells of a line with a text in them that is not the label of a line running there, each cell once.
  let overwritten = 0;
  const textAt = new Set<string>();
  runs.forEach((run, i) => {
    const ends = run?.cells.length ?? 0;
    run?.cells.forEach(([x, y], k) => {
      const key = `${x},${y}`;
      const ch = at(x, y);
      if (textAt.has(key) || ch === ' ' || RUNS[ch] !== undefined || ((k < 2 || k >= ends - 2) && MARKS.has(ch)) || inBox(x, y)) return;
      // Its own label, or the label of a line it runs with, written on the line.
      if ((byCell.get(key) ?? [i]).some((j) => {
        const s = spots[j];
        return s !== undefined && s.y === y && x >= s.x0 && x <= s.x1;
      })) return;
      textAt.add(key);
      overwritten++;
    });
  });
  if (overwritten > 0) note(`${overwritten} cells of lines written over`);

  const room = roomViolations(lines, grid);
  const asked = labels ?? drawn.flatMap((e) => (e.label === undefined ? [] : (e.label.lines ?? [e.label.text])));
  return {
    brokenLines,
    brokenBoxes,
    tangled,
    strayLabels,
    crowdedLabels,
    coveredLabels,
    labelsAtHeads,
    room: room.headless.length + room.underName.length + room.onRule.length + room.tight.length + room.close.length,
    unseen: labelsMissing(asked, lines),
    forks,
    crossMarks,
    mixedNets,
    hugging,
    overwritten,
  };
}

/** Whether drawing `a` breaks more than drawing `b` in some respect. */
export const breaksMore = (a: Breaks, b: Breaks): boolean => BREAK_KINDS.some((k) => a[k] > b[k]);
