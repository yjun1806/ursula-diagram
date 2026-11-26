import { describe, expect, it } from 'vitest';
import { E, lineCell, N, S, towardBox, traceCells, W } from '../src/text/lines.ts';
import type { LayoutEdge, LayoutNode } from '../src/types.ts';

const traced = (corners: Array<[number, number]>, slanted: 'walk' | 'stop'): { done: boolean; cells: string[] } => {
  const cells: string[] = [];
  const done = traceCells(corners, (x, y, bit) => cells.push(`${x},${y}:${bit}`), slanted);
  return { done, cells };
};

describe('tracing a line through terminal cells', () => {
  it('marks each cell with the way the line leaves it and the way it comes into the next', () => {
    expect(traced([[0, 0], [2, 0], [2, 1]], 'stop')).toEqual({ done: true, cells: [`0,0:${E}`, `1,0:${W}`, `1,0:${E}`, `2,0:${W}`, `2,0:${S}`, `2,1:${N}`] });
  });

  it('adds nothing for a piece of no length and does not seed the first cell', () => {
    expect(traced([[3, 3], [3, 3]], 'walk')).toEqual({ done: true, cells: [] });
  });

  it('walks a slanted piece on the slant, or stops at it', () => {
    expect(traced([[0, 0], [1, 1]], 'walk')).toEqual({ done: true, cells: [`0,0:${E}`, `1,1:${W}`] });
    expect(traced([[0, 0], [1, 0], [2, 1], [3, 1]], 'stop')).toEqual({ done: false, cells: [`0,0:${E}`, `1,0:${W}`] });
  });
});

describe('the cells of the ends of a line', () => {
  const box: LayoutNode = { id: 'a', lane: '', rank: 0, span: 1, row: 0, title: 'a', lines: [], shape: 'rect', x: 4, y: 2, w: 6, h: 3 };
  const other: LayoutNode = { ...box, id: 'b', x: 20 };
  const nodes = new Map([['a', box], ['b', other]]);
  const edge = (points: Array<{ x: number; y: number }>): LayoutEdge => ({ from: 'a', to: 'b', points, style: 'normal' }) as LayoutEdge;

  it('puts a port on a left or top border in the cell outside it', () => {
    const e = edge([{ x: 10, y: 3 }, { x: 20, y: 3 }]);
    expect(lineCell(e, nodes, 0)).toEqual([10, 3]);
    expect(lineCell(e, nodes, 1)).toEqual([19, 3]);
  });

  it('reaches into the box the end sits on', () => {
    const e = edge([{ x: 10, y: 3 }, { x: 20, y: 3 }]);
    expect(towardBox(e, nodes, 0, 'a')).toBe(W);
    expect(towardBox(e, nodes, 1, 'b')).toBe(E);
    expect(towardBox(edge([{ x: 6, y: 5 }, { x: 6, y: 9 }]), nodes, 0, 'a')).toBe(N);
    expect(towardBox(edge([{ x: 6, y: 1 }, { x: 6, y: 9 }]), nodes, 0, 'a')).toBe(0);
    expect(towardBox(edge([{ x: 6, y: 2 }, { x: 6, y: 0 }]), nodes, 0, 'a')).toBe(S);
  });
});
