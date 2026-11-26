import { Heap } from '../layout/heap.ts';

/** A box on the cell grid: `x`, `y` is its top left border cell. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A line to draw, by the indexes of the boxes it joins. */
export interface Wire {
  from: number;
  to: number;
}

export type Cell = readonly [number, number];

/**
 * What a row of the grid may hold: `channel` rows are the only ones a line runs along, a line only crosses a `rule`
 * row or a `box` row upright. `rank` orders the channel rows of one gap: a line takes the lowest rank that is free.
 */
export interface Row {
  kind: 'channel' | 'rule' | 'box';
  rank: number;
  /** A channel row that stays in the drawing when no line runs along it. */
  keep?: true;
}

const N = 1;
const E = 2;
const S = 4;
const W = 8;
const UPRIGHT = N | S;
const LEVEL = E | W;
const DX = [0, 1, 0, -1];
const DY = [-1, 0, 1, 0];
const BIT = [N, E, S, W];
const UP = 0;
const DOWN = 2;

const STEP = 10;
const SHARED = 1;
const BEND = 100;
const CROSS = 200;
const BESIDE_LINE = 20;
const BESIDE_BOX = 10;
const PORT_CAP = 80;
/** Turning to run along a row no line runs along yet: such a row would otherwise be taken out of the drawing. */
const OPEN = 60;
/** Columns and rows a line may leave the span of its two boxes by before the whole grid is searched. */
const WINDOW = 8;

/** Lines looked through for the cost of one settled cell. */
const SCAN = 16;

/** What joining the stem of a box may cost a line over its cheapest path: about two bends and a row. */
const STEM_MOST = 300;

const NONE: readonly Use[] = [];

/** A path and what the search counted for it. */
interface Found {
  cells: Cell[];
  cost: number;
}

interface Use {
  wire: number;
  bits: number;
  end: boolean;
}

/** The bit of the side of `cell` that faces `rect`, for a cell just outside one of its borders. */
function toward(cell: Cell, rect: Rect): number {
  if (cell[1] === rect.y - 1) return S;
  if (cell[1] === rect.y + rect.h) return N;
  if (cell[0] === rect.x - 1) return E;
  if (cell[0] === rect.x + rect.w) return W;
  return 0;
}

/** The sides each cell of `path` is drawn on, the reach into the boxes at its two ends included. */
function bitsOf(path: Cell[], from: Rect, to: Rect): number[] {
  return path.map((cell, i) => {
    let bits = 0;
    for (const other of [path[i - 1], path[i + 1]]) {
      if (other === undefined) continue;
      if (other[0] > cell[0]) bits |= E;
      else if (other[0] < cell[0]) bits |= W;
      else if (other[1] > cell[1]) bits |= S;
      else if (other[1] < cell[1]) bits |= N;
    }
    if (i === 0) bits |= toward(cell, from);
    if (i === path.length - 1) bits |= toward(cell, to);
    return bits;
  });
}

/**
 * Finds a path of cells for every wire on a grid `width` cells wide with the rows `rows`, or nothing when a wire has
 * no path. A path leaves a box by its top or its bottom and enters one upright; two boxes that stand side by side in
 * one band are joined by a level line between their sides. Wires that share an end may run together and split; any
 * other two only cross, upright against level, away from bends and ends. `spend` is told what the search
 * costs as it goes, a cell it settles counting one, and answers whether it may go on: nothing comes back once it says no.
 * With `tidy` the lines of one box leave it, and enter it, by one stem on a side where they can, and a line keeps to
 * the rows other lines already run along.
 */
export function routeWires(
  rects: Rect[],
  wires: Wire[],
  width: number,
  rows: Row[],
  spend: (cost: number) => boolean = () => true,
  tidy = true,
): Cell[][] | undefined {
  const height = rows.length;
  const blocked = new Uint8Array(width * height);
  for (const r of rects) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) blocked[y * width + x] = 1;
  const uses: Array<readonly Use[] | undefined> = new Array(width * height);
  /** The rows a line already runs along. */
  const opened = new Uint8Array(height);
  const related = (a: number, b: number): boolean => wires[a]?.from === wires[b]?.from || wires[a]?.to === wires[b]?.to;
  const paths: Array<Cell[] | undefined> = wires.map(() => undefined);

  const claim = (index: number, path: Cell[]): void => {
    const wire = wires[index] as Wire;
    const bits = bitsOf(path, rects[wire.from] as Rect, rects[wire.to] as Rect);
    path.forEach((cell, i) => {
      const key = cell[1] * width + cell[0];
      if (((bits[i] as number) & LEVEL) !== 0) opened[cell[1]] = 1;
      uses[key] = [...(uses[key] ?? NONE), { wire: index, bits: bits[i] as number, end: i === 0 || i === path.length - 1 }];
    });
    paths[index] = path;
  };
  const foreign = (key: number, index: number): boolean => (uses[key] ?? NONE).some((u) => !related(u.wire, index));
  const centre = (r: Rect): number => r.x + (r.w - 1) / 2;
  const portCost = (r: Rect, x: number): number => Math.min((x - centre(r)) ** 2, PORT_CAP);

  /** The level line between the facing sides of two neighbours of one band, when nothing stands between them. */
  const beside = (a: Rect, b: Rect): Cell[] | undefined => {
    if (a.y !== b.y || a === b) return undefined;
    const [left, right] = a.x < b.x ? [a, b] : [b, a];
    const x0 = left.x + left.w;
    const x1 = right.x - 1;
    const y = a.y + Math.floor(Math.min(a.h, b.h) / 2);
    if (x1 - x0 < 1) return undefined;
    const cells: Cell[] = [];
    for (let x = x0; x <= x1; x++) {
      if (blocked[y * width + x] === 1 || uses[y * width + x] !== undefined) return undefined;
      cells.push([x, y]);
    }
    return a.x < b.x ? cells : cells.reverse();
  };

  const states = width * height * 4;
  const cost = new Float64Array(states + 1);
  const prev = new Int32Array(states + 1);
  // The search a state was last reached in and the one it was last settled in: nothing is cleared between two searches.
  const reached = new Uint32Array(states + 1);
  const settled = new Uint32Array(states + 1);
  let searches = 0;
  let stopped = false;
  interface Window {
    x0: number;
    x1: number;
    y0: number;
    y1: number;
  }
  const whole: Window = { x0: 0, x1: width - 1, y0: 0, y1: height - 1 };
  /**
   * The column the lines already drawn out of a box (or into it) take on its top (`side` 0) or its bottom, when there
   * is one: a further line of that box leaves (or enters) by the same cell, so the box has one stem on a side.
   */
  const stemOf = (index: number, end: 'from' | 'to', side: number): number | undefined => {
    const rect = rects[(wires[index] as Wire)[end]] as Rect;
    const y = side === 0 ? rect.y - 1 : rect.y + rect.h;
    for (const [i, path] of paths.entries()) {
      if (path === undefined || i === index || (wires[i] as Wire)[end] !== (wires[index] as Wire)[end]) continue;
      const cell = (end === 'from' ? path[0] : path[path.length - 1]) as Cell;
      if (cell[1] === y) return cell[0];
    }
    return undefined;
  };
  const search = (index: number, { x0, x1, y0, y1 }: Window, stems: boolean, bound: number): Found | undefined => {
    const wire = wires[index] as Wire;
    const a = rects[wire.from] as Rect;
    const b = rects[wire.to] as Rect;
    const out = stems ? [stemOf(index, 'from', 0), stemOf(index, 'from', 1)] : [];
    const into = stems ? [stemOf(index, 'to', 0), stemOf(index, 'to', 1)] : [];
    searches += 1;
    const run = searches;
    // Each search looks through the other lines for the ones that share an end with this one.
    if (!spend(Math.ceil(wires.length / SCAN))) {
      stopped = true;
      return undefined;
    }
    const heap = new Heap();
    // The least any path still costs from a cell: the cells to the nearest entry of `b`, and the bends an upright entry takes.
    const pace = wires.some((w, i) => i !== index && paths[i] !== undefined && related(i, index)) ? SHARED : STEP;
    const ahead = (state: number): number => {
      if (state === states) return 0;
      const d = state % 4;
      const key = (state - d) / 4;
      const x = key % width;
      const y = (key - x) / width;
      const dx = Math.max(b.x + 1 - x, x - (b.x + b.w - 2), 0);
      const dy = Math.min(Math.abs(y - (b.y - 1)), Math.abs(y - (b.y + b.h)));
      return pace * (dx + dy) + BEND * (d % 2 === 1 ? 1 : dx > 0 ? 2 : 0);
    };
    const reach = (state: number, c: number, from: number): void => {
      if (reached[state] === run && c >= (cost[state] as number)) return;
      const least = c + ahead(state);
      if (least > bound) return;
      reached[state] = run;
      cost[state] = c;
      prev[state] = from;
      heap.push(least, state);
    };
    for (let x = a.x + 1; x <= a.x + a.w - 2; x++) {
      for (const [y, d] of [[a.y - 1, UP], [a.y + a.h, DOWN]] as const) {
        if (y < y0 || y > y1 || x < x0 || x > x1) continue;
        if ((out[d / 2] ?? x) !== x) continue;
        const key = y * width + x;
        if (blocked[key] === 1 || foreign(key, index)) continue;
        reach(key * 4 + d, portCost(a, x), -1);
      }
    }
    while (heap.size > 0) {
      const { item: state } = heap.pop();
      if (settled[state] === run) continue;
      settled[state] = run;
      if (state === states) break;
      if (!spend(1)) {
        stopped = true;
        return undefined;
      }
      const c = cost[state] as number;
      const d = state % 4;
      const key = (state - d) / 4;
      const x = key % width;
      const y = (key - x) / width;
      const crossing = foreign(key, index);
      const enters = x > b.x && x < b.x + b.w - 1 && ((d === DOWN && y === b.y - 1) || (d === UP && y === b.y + b.h));
      if (enters && !crossing && (into[d === DOWN ? 0 : 1] ?? x) === x) reach(states, c + portCost(b, x), state);
      for (let nd = 0; nd < 4; nd++) {
        if (nd === (d + 2) % 4 || (crossing && nd !== d)) continue;
        const level = nd % 2 === 1;
        const row = rows[y] as Row;
        if (level && row.kind !== 'channel') continue;
        const nx = x + (DX[nd] as number);
        const ny = y + (DY[nd] as number);
        if (nx < x0 || nx > x1 || ny < y0 || ny > y1) continue;
        const nkey = ny * width + nx;
        if (blocked[nkey] === 1) continue;
        let shared = false;
        let crosses = false;
        let shut = false;
        for (const u of uses[nkey] ?? NONE) {
          if (related(u.wire, index)) shared ||= (u.bits & (level ? LEVEL : UPRIGHT)) !== 0;
          else if (u.end || u.bits !== (level ? UPRIGHT : LEVEL)) shut = true;
          else crosses = true;
        }
        if (shut) continue;
        let step = (shared ? SHARED : STEP) + (crosses ? CROSS : 0) + (nd === d ? 0 : BEND);
        if (level) step += row.rank + (tidy && nd !== d && opened[y] === 0 ? OPEN : 0);
        else {
          for (const side of [nx - 1, nx + 1]) {
            if (side < 0 || side >= width) continue;
            const skey = ny * width + side;
            if (blocked[skey] === 1) step += BESIDE_BOX;
            else if ((uses[skey] ?? NONE).some((u) => !related(u.wire, index) && (u.bits & UPRIGHT) !== 0)) step += BESIDE_LINE;
          }
        }
        reach(nkey * 4 + nd, c + step, state);
      }
    }
    if (reached[states] !== run) return undefined;
    const cells: Cell[] = [];
    for (let s = prev[states] as number; s >= 0; s = prev[s] as number) {
      const key = (s - (s % 4)) / 4;
      cells.push([key % width, (key - (key % width)) / width]);
    }
    return { cells: cells.reverse(), cost: cost[states] as number };
  };

  wires.forEach((wire, index) => {
    const path = beside(rects[wire.from] as Rect, rects[wire.to] as Rect);
    if (path !== undefined) claim(index, path);
  });
  const span = (w: Wire): [number, number] => {
    const a = rects[w.from] as Rect;
    const b = rects[w.to] as Rect;
    return [Math.abs(a.y - b.y), Math.abs(a.x - b.x)];
  };
  const order = wires
    .map((_, i) => i)
    .filter((i) => paths[i] === undefined)
    .sort((i, j) => {
      const [ay, ax] = span(wires[i] as Wire);
      const [by, bx] = span(wires[j] as Wire);
      return ay - by || ax - bx || i - j;
    });
  for (const index of order) {
    const wire = wires[index] as Wire;
    const a = rects[wire.from] as Rect;
    const b = rects[wire.to] as Rect;
    const near: Window = {
      x0: Math.max(0, Math.min(a.x, b.x) - WINDOW),
      x1: Math.min(width - 1, Math.max(a.x + a.w, b.x + b.w) + WINDOW),
      y0: Math.max(0, Math.min(a.y, b.y) - WINDOW),
      y1: Math.min(height - 1, Math.max(a.y + a.h, b.y + b.h) + WINDOW),
    };
    const first = (stems: boolean, bound: number): Found | undefined => search(index, near, stems, bound) ?? (stopped ? undefined : search(index, whole, stems, bound));
    const held = tidy && (['from', 'to'] as const).some((end) => [0, 1].some((side) => stemOf(index, end, side) !== undefined));
    const free = first(false, Number.POSITIVE_INFINITY);
    // A line joins the stem of its box unless that takes it far out of its way: the search for such a path goes no further.
    const found = (held && free !== undefined && !stopped ? first(true, free.cost + STEM_MOST) : undefined) ?? free;
    if (found === undefined || stopped) return undefined;
    claim(index, found.cells);
  }
  return paths as Cell[][];
}

/**
 * The channel rows that can be taken out: no line runs along them, and no line ends in them next to a cell where a
 * line bends, splits or is crossed (the end would move onto that cell).
 */
export function spareRows(rects: Rect[], wires: Wire[], paths: Cell[][], rows: Row[]): Set<number> {
  const width = paths.reduce((most, path) => path.reduce((m, c) => Math.max(m, c[0]), most), 0) + 1;
  const bits = new Map<number, number>();
  paths.forEach((path, i) => {
    const wire = wires[i] as Wire;
    bitsOf(path, rects[wire.from] as Rect, rects[wire.to] as Rect).forEach((b, k) => {
      const key = (path[k] as Cell)[1] * width + (path[k] as Cell)[0];
      bits.set(key, (bits.get(key) ?? 0) | b);
    });
  });
  const level = new Set<number>();
  for (const [key, b] of bits) if ((b & LEVEL) !== 0) level.add(Math.floor(key / width));
  const spare = new Set<number>();
  rows.forEach((row, y) => {
    if (row.kind !== 'channel' || row.keep || level.has(y)) return;
    // Rows are taken out one at a time: the row next to a spare one keeps the ends that moved onto it.
    if (spare.has(y - 1)) return;
    const moves = paths.every((path) => {
      const ends = [[path[0], path[1]], [path[path.length - 1], path[path.length - 2]]] as const;
      return ends.every(([end, next]) => {
        if (end === undefined || end[1] !== y) return true;
        if (next === undefined || next[0] !== end[0]) return false;
        return ((bits.get(next[1] * width + next[0]) ?? 0) & LEVEL) === 0;
      });
    });
    if (moves) spare.add(y);
  });
  return spare;
}
