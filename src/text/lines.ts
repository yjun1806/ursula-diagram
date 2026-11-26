import type { LayoutEdge, LayoutNode } from '../types.ts';

/** The ways a line runs on from a cell: north, east, south and west, as bits. */
export const N = 1;
export const E = 2;
export const S = 4;
export const W = 8;

/** Glyphs of a thick line, by the ways it runs on. */
export const HEAVY: Readonly<Record<number, string>> = {
  [E | W]: '━', [E]: '━', [W]: '━',
  [N | S]: '┃', [N]: '┃', [S]: '┃',
  [S | E]: '┏', [S | W]: '┓', [N | E]: '┗', [N | W]: '┛',
  [N | S | E]: '┣', [N | S | W]: '┫', [E | W | S]: '┳', [E | W | N]: '┻', [N | E | S | W]: '╋',
};

/** The ways the line glyph of a cell runs on: the reverse of the glyph tables, for reading a drawing back. */
export const RUNS: Readonly<Record<string, number>> = {
  '─': E | W, '━': E | W, '┄': E | W,
  '│': N | S, '┃': N | S, '┆': N | S,
  '┌': S | E, '┐': S | W, '└': N | E, '┘': N | W,
  '┏': S | E, '┓': S | W, '┗': N | E, '┛': N | W,
  '├': N | S | E, '┤': N | S | W, '┬': E | W | S, '┴': E | W | N, '┼': N | E | S | W,
  '┣': N | S | E, '┫': N | S | W, '┳': E | W | S, '┻': E | W | N, '╋': N | E | S | W,
};

/** The cell point `index` of a line is drawn in. A port on a left or top border is drawn in the cell just outside that border. */
export function lineCell(edge: LayoutEdge, nodes: ReadonlyMap<string, LayoutNode>, index: number): [number, number] {
  const p = edge.points[index];
  if (!p) return [0, 0];
  let x = Math.floor(p.x + 1e-9);
  let y = Math.floor(p.y + 1e-9);
  const isEnd = index === 0 || index === edge.points.length - 1;
  const node = nodes.get(index === 0 ? edge.from : edge.to);
  if (isEnd && node) {
    if (Math.abs(p.x - node.x) < 1e-9) x -= 1;
    if (Math.abs(p.y - node.y) < 1e-9) y -= 1;
  }
  return [x, y];
}

/**
 * Walks the pieces between the cells `corners`, telling `add` each cell and the way the line runs on from it: out along
 * the piece, and back into the next cell. A piece of no length adds nothing. A slanted piece is walked step by step on
 * the slant with `slanted` 'walk'; with 'stop' the walk ends there and gives false.
 */
export function traceCells(corners: ReadonlyArray<readonly [number, number]>, add: (x: number, y: number, bit: number) => void, slanted: 'walk' | 'stop'): boolean {
  for (let i = 0; i + 1 < corners.length; i++) {
    const [x1, y1] = corners[i] ?? [0, 0];
    const [x2, y2] = corners[i + 1] ?? [0, 0];
    const dx = Math.sign(x2 - x1);
    const dy = Math.sign(y2 - y1);
    if (dx !== 0 && dy !== 0 && slanted === 'stop') return false;
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
  return true;
}

/** The way the end `index` of a line reaches into the box `id` it sits on, so that a line that turns at once draws a corner; 0 when it is on no border. */
export function towardBox(edge: LayoutEdge, nodes: ReadonlyMap<string, LayoutNode>, index: number, id: string): number {
  const n = nodes.get(id);
  const p = edge.points[index];
  if (!n || !p) return 0;
  return Math.abs(p.x - n.x) < 1e-9 ? E : Math.abs(p.x - n.x - n.w) < 1e-9 ? W : Math.abs(p.y - n.y) < 1e-9 ? S : Math.abs(p.y - n.y - n.h) < 1e-9 ? N : 0;
}
