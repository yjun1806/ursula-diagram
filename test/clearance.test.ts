import { describe, expect, it } from 'vitest';
import { tightPasses } from '../src/layered/clearance.ts';

const box = (id: string, x: number, y: number) => ({ id, x, y, w: 100, h: 60 });

describe('tightPasses', () => {
  const nodes = [box('a', 0, 200), box('b', 140, 0), box('c', 140, 200), box('d', 0, 0)];

  it('counts a line that runs along a box it does not end on, nearer than the room it keeps', () => {
    const edges = [{ from: 'a', to: 'd', points: [{ x: 120, y: 260 }, { x: 120, y: 0 }] }];
    expect(tightPasses({ nodes, edges } as never)).toBe(2);
  });

  it('does not count the boxes the line ends on, or a line that keeps its room', () => {
    const edges = [
      { from: 'a', to: 'd', points: [{ x: 50, y: 200 }, { x: 50, y: 60 }] },
      { from: 'a', to: 'd', points: [{ x: 116, y: 300 }, { x: 116, y: 280 }] },
    ];
    expect(tightPasses({ nodes: nodes.map((n) => (n.id === 'b' || n.id === 'c' ? { ...n, x: 200 } : n)), edges } as never)).toBe(0);
  });
});
