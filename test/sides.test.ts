import { describe, expect, it } from 'vitest';
import { layout, parse, pixelRuler, cellRuler } from '../src/index.ts';
import { designatedSide, directionsOf, mixedSideEnds } from '../src/layered/sides.ts';
import type { LayoutNode } from '../src/types.ts';

const box = (id: string, lane: string, x: number, y: number): LayoutNode => ({ id, lane, rank: 0, span: 1, row: 0, x, y, w: 40, h: 40, title: id, lines: [], shape: 'rect' });
const order = new Map([['a', 0], ['b', 1]]);

describe('the side an edge is meant to use', () => {
  it('is up or down for another row, ahead or behind in the same row (lanes)', () => {
    const d = { stages: false, td: false, order };
    expect(designatedSide(box('p', 'a', 0, 100), box('q', 'a', 200, 100), d)).toBe('right');
    expect(designatedSide(box('q', 'a', 200, 100), box('p', 'a', 0, 100), d)).toBe('left');
    expect(designatedSide(box('p', 'a', 0, 100), box('r', 'b', 0, 200), d)).toBe('bottom');
    expect(designatedSide(box('r', 'b', 0, 200), box('p', 'a', 0, 100), d)).toBe('top');
  });

  it('is ahead or behind for another band, up or down inside a band (stages)', () => {
    const d = { stages: true, td: true, order };
    expect(designatedSide(box('p', 'a', 0, 0), box('q', 'b', 100, 90), d)).toBe('right');
    expect(designatedSide(box('q', 'b', 100, 90), box('p', 'a', 0, 0), d)).toBe('left');
    expect(designatedSide(box('p', 'a', 0, 0), box('s', 'a', 0, 90), d)).toBe('bottom');
  });
});

describe('edges that look the same way at a node use the same side of it', () => {
  const stages = 'flowchart LR\n  subgraph one[One]\n    a[A]\n    b[B]\n  end\n  subgraph two[Two]\n    c[C]\n    d[D]\n    e[E]\n  end\n  a --> c\n  a --> d\n  b --> e\n  a --> e';

  it('holds in every drawing the engine makes of a few graphs, in pixels and cells', () => {
    for (const ruler of [pixelRuler(), cellRuler()]) {
      const l = layout(parse(stages), ruler);
      expect(mixedSideEnds(l, directionsOf(l))).toEqual([]);
      expect(l.diagnostics.filter((x) => x.kind === 'mixed-side')).toEqual([]);
    }
  });

  it('is reported for an end on another side', () => {
    const nodes = [box('n', 'a', 0, 0), box('o1', 'a', 200, 0), box('o2', 'a', 400, 0)];
    const edge = (to: string, points: Array<{ x: number; y: number }>) => ({ from: 'n', to, style: 'normal' as const, points });
    const edges = [edge('o1', [{ x: 40, y: 20 }, { x: 200, y: 20 }]), edge('o2', [{ x: 20, y: 40 }, { x: 20, y: 60 }, { x: 420, y: 60 }, { x: 420, y: 40 }])];
    const found = mixedSideEnds({ nodes, edges }, { stages: false, td: false, order });
    expect(found).toHaveLength(1);
    expect(found[0]?.kind).toBe('mixed-side');
    expect(found[0]?.nodes).toEqual(['n']);
  });
});
