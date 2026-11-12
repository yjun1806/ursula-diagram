import { describe, expect, it } from 'vitest';
import { layout, parse, pixelRuler } from '../src/index.ts';
import { mirroredEdges, score } from '../src/layered/choose.ts';
import type { Layout } from '../src/types.ts';

const mid = (l: Layout, id: string, axis: 'x' | 'y'): number => {
  const n = l.nodes.find((node) => node.id === id);
  return axis === 'x' ? (n?.x ?? 0) + (n?.w ?? 0) / 2 : (n?.y ?? 0) + (n?.h ?? 0) / 2;
};
const edgeOf = (l: Layout, from: string, to: string) => l.edges.find((e) => e.from === from && e.to === to);

describe('pieces between the same two boxes', () => {
  const title = 'A box whose title is much longer than the shared width of one column of boxes';
  const narrowUnder = `flowchart LR\nsubgraph one[One]\n  p[P] --> a[${title}]\nend\nsubgraph two[Two]\n  x[X] --> b[B]\nend\na --> b\nb --> a`;

  it('stand a step apart, symmetric about the middle of the narrower box', () => {
    const l = layout(parse(narrowUnder), pixelRuler());
    const ab = edgeOf(l, 'a', 'b')?.points ?? [];
    const ba = edgeOf(l, 'b', 'a')?.points ?? [];
    expect(ab).toHaveLength(2);
    expect(ba).toHaveLength(2);
    expect(ab[0]?.x).toBeCloseTo(ab[1]?.x ?? NaN);
    expect(ba[0]?.x).toBeCloseTo(ba[1]?.x ?? NaN);
    expect(((ab[0]?.x ?? 0) + (ba[0]?.x ?? 0)) / 2).toBeCloseTo(mid(l, 'b', 'x'), 0);
    expect(Math.abs((ab[0]?.x ?? 0) - (ba[0]?.x ?? 0))).toBeCloseTo(pixelRuler().portPitch, 5);
  });

  it('keep that place when another box sends an edge to the same side of the wide box', () => {
    const src = `flowchart LR\nsubgraph one[One]\n  p[P] --> a[${title}]\nend\nsubgraph two[Two]\n  x[X] --> b[B]\n  b --> q[Q]\nend\nsubgraph three[Three]\n  y[Y]\nend\na --> b\nb --> a\ny --> a`;
    const l = layout(parse(src), pixelRuler());
    const ab = edgeOf(l, 'a', 'b')?.points ?? [];
    const ba = edgeOf(l, 'b', 'a')?.points ?? [];
    const ya = edgeOf(l, 'y', 'a')?.points ?? [];
    expect(ya).toHaveLength(2);
    expect(ab).toHaveLength(2);
    expect(ba).toHaveLength(2);
    expect(((ab[0]?.x ?? 0) + (ba[0]?.x ?? 0)) / 2).toBeCloseTo(mid(l, 'b', 'x'), 0);
    expect(Math.abs((ab[0]?.x ?? 0) - (ba[0]?.x ?? 0))).toBeCloseTo(pixelRuler().portPitch, 5);
  });
});

describe('a box with two partners in the next zone', () => {
  const src = 'flowchart LR\nsubgraph z0[Z0]\n  a[a]\nend\nsubgraph z1[Z1]\n  b[b]\n  c[c]\n  d[d]\nend\nsubgraph z2[Z2]\n  e[e]\n  f[f]\nend\na --> c\na --> b\nb --> e\nc --> f\nd --> f\nd --> e';

  it('stands level with the middle of the two, and its two edges mirror each other', () => {
    const l = layout(parse(src), pixelRuler(), { composition: 'stages' });
    expect(l.composition).toBe('stages');
    expect(mid(l, 'a', 'y')).toBeCloseTo((mid(l, 'b', 'y') + mid(l, 'c', 'y')) / 2, 0);
    const ab = edgeOf(l, 'a', 'b')?.points ?? [];
    const ac = edgeOf(l, 'a', 'c')?.points ?? [];
    expect(ab.length).toBeGreaterThanOrEqual(3);
    expect(ab).toHaveLength(ac.length);
    const centre = mid(l, 'a', 'y');
    ab.forEach((p, i) => {
      expect(Math.abs(p.y + (ac[i]?.y ?? NaN) - 2 * centre)).toBeLessThanOrEqual(1);
      expect(Math.abs(p.x - (ac[i]?.x ?? NaN))).toBeLessThanOrEqual(1);
    });
    const dropped = mirroredEdges(l, () => 1);
    expect([...dropped].map((i) => l.edges[i]?.from)).toContain('a');
  });
});

describe('the bends of a mirror pair', () => {
  const box = (id: string, x: number, y: number, h: number) => ({ id, lane: 'l', rank: 0, span: 1, row: 0, x, y, w: 40, h, title: id, lines: [] as string[], shape: 'rect' as const });
  const edge = (from: string, to: string, points: Array<[number, number]>, main = false) => ({ from, to, style: 'normal' as const, points: points.map(([x, y]) => ({ x, y })), ...(main ? { main: true as const } : {}) });
  const nodes = [box('s', 0, 100, 40), box('t', 100, 0, 20), box('u', 100, 200, 20)];
  const drawing = (edges: ReturnType<typeof edge>[]): Layout => ({ width: 1000, height: 1000, direction: 'LR', laneAxis: 'across', lanes: [], nodes, edges, diagnostics: [] });
  const cost = (l: Layout): number => score(l)[1] as number;
  const up = (main = false) => edge('s', 't', [[40, 110], [70, 110], [70, 10], [100, 10]], main);
  const down = (shift = 0, main = false) => edge('s', 'u', [[40, 130], [70, 130 + shift], [70, 230], [100, 230]], main);

  it('costs what one of the two edges costs', () => {
    expect(cost(drawing([up(), down()]))).toBe(cost(drawing([up()])));
    expect(mirroredEdges(drawing([up(), down()]), () => 1).size).toBe(1);
  });

  it('is charged for the dearer edge when one is on the main flow', () => {
    expect(cost(drawing([up(true), down()]))).toBe(cost(drawing([up(true)])));
  });

  it('costs both edges once their points no longer mirror within a pixel', () => {
    expect(cost(drawing([up(), down(1.5)]))).toBeGreaterThan(cost(drawing([up()])));
    expect(mirroredEdges(drawing([up(), down(1.5)]), () => 1).size).toBe(0);
  });
});
