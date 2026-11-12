import { describe, expect, it } from 'vitest';
import { cellRuler, layout, parse, pixelRuler } from '../src/index.ts';
import { CANDIDATES, WEIGHTS, crossingsOf, farness, offCentre, pickBest, score, startMissed, violations } from '../src/layered/choose.ts';
import * as fixtures from './fixtures.ts';
import { assignLayers } from '../src/layered/rows.ts';
import type { Layout } from '../src/types.ts';
import { geometryViolations } from './helpers.ts';

const twoBands = `flowchart LR
  subgraph top[Top]
    t1[Intake]
    t2[Close]
    t3[Open]
  end
  subgraph low[Bottom]
    m1[List] --> m2[Detail] --> m3[History] --> m4[Start] --> m5[Finish]
  end
  t3 --> m1
  t2 --> m3
  m5 --> t1
  t1 -.-> t2`;

const idOf = (g: ReturnType<typeof parse>, ids: string[]): number[] => ids.map((id) => g.nodes.findIndex((n) => n.id === id));

describe('main flow', () => {
  it('is the longest path along edges inside one band, one for the whole drawing', () => {
    const g = parse(twoBands);
    const rows = assignLayers(g, g.nodes.map(() => 2), Infinity);
    expect(rows.main).toEqual(idOf(g, ['m1', 'm2', 'm3', 'm4', 'm5']));
  });

  it('prefers the path whose nodes are linked to more other bands when lengths are equal', () => {
    const g = parse('flowchart LR\nsubgraph a[A]\nP1 --> P2\nQ1 --> Q2\nend\nsubgraph b[B]\nR\nend\nQ1 --> R\nQ2 --> R');
    const rows = assignLayers(g, g.nodes.map(() => 2), Infinity);
    expect(rows.main).toEqual(idOf(g, ['Q1', 'Q2']));
  });

  it('falls back to the written order when everything else is equal', () => {
    const g = parse('flowchart LR\nsubgraph a[A]\nP1 --> P2\nQ1 --> Q2\nend');
    const rows = assignLayers(g, g.nodes.map(() => 2), Infinity);
    expect(rows.main).toEqual(idOf(g, ['P1', 'P2']));
  });
});

describe('candidates', () => {
  it('lists the candidates and measures finished drawings in a fixed order of qualities', () => {
    expect(CANDIDATES.map((c) => c.name)).toEqual(['forced', 'free', 'stage', 'loose', 'forced-unheld', 'free-unheld']);
    const l = layout(parse(twoBands), pixelRuler(), { composition: 'lanes' });
    const s = score(l);
    expect(s).toHaveLength(3);
    expect(s[0]).toBe(violations(l));
    expect(s[0]).toBe(0);
  });

  it('keeps the first of two equal drawings and prefers fewer bends when nothing else differs', () => {
    const a = layout(parse(twoBands), pixelRuler(), { composition: 'lanes' });
    const b: Layout = { ...a };
    expect(pickBest([a, b])).toBe(a);
    const worse: Layout = { ...a, edges: a.edges.map((e, i) => (i === 0 ? { ...e, points: [...e.points.slice(0, 1), { x: (e.points[0]?.x ?? 0) + 1, y: e.points[0]?.y ?? 0 }, { x: (e.points[0]?.x ?? 0) + 1, y: (e.points[0]?.y ?? 0) + 1 }, ...e.points.slice(1)] } : e)) };
    expect(pickBest([worse, a])).toBe(a);
  });

  it('lets an edge between two nodes outside the main flow run from right to left when that follows their partners', () => {
    const l = layout(parse(twoBands), pixelRuler(), { composition: 'lanes' });
    const edge = l.edges.find((e) => e.from === 't1' && e.to === 't2');
    const bends = l.edges.reduce((n, e) => n + Math.max(0, e.points.length - 2), 0);
    expect(edge).toBeDefined();
    expect(bends).toBe(0);
    expect(geometryViolations(l)).toEqual([]);
    expect(violations(l)).toBe(0);
  });

  it('keeps the order of the main flow from left to right', () => {
    for (const ruler of [pixelRuler(), cellRuler()]) {
      const l = layout(parse(twoBands), ruler, ruler === cellRuler() ? { composition: 'lanes', maxWidth: 200 } : { composition: 'lanes' });
      const xs = ['m1', 'm2', 'm3', 'm4', 'm5'].map((id) => l.nodes.find((n) => n.id === id)?.x ?? NaN);
      expect([...xs].sort((a, b) => a - b)).toEqual(xs);
    }
  });
});

describe('score', () => {
  const box = (id: string, lane: string, row: number, x: number, y = row * 100) => ({ id, lane, rank: 0, span: 1, row, x, y, w: 40, h: 20, title: id, lines: [] as string[], shape: 'rect' as const });
  const edge = (from: string, to: string, points: Array<[number, number]>, main = false) => ({ from, to, style: 'normal' as const, points: points.map(([x, y]) => ({ x, y })), ...(main ? { main: true as const } : {}) });
  const drawing = (nodes: ReturnType<typeof box>[], edges: ReturnType<typeof edge>[], pitch?: number): Layout => ({
    width: 1000,
    height: 1000,
    direction: 'LR',
    laneAxis: 'across',
    lanes: [],
    nodes,
    edges,
    diagnostics: [],
    ...(pitch === undefined ? {} : { pitch }),
  });
  const cost = (l: Layout): number => score(l)[1] as number;
  const line = (id: string, x: number, y = 0) => box(id, 'l', 0, x, y);
  // Four nodes in a row; the first edge starts at the leftmost one, so nothing but the part under test costs anything.
  const row = [line('a', 0), line('b', 100), line('c', 200), line('d', 300)];
  const first = edge('a', 'b', [[40, 10], [100, 10]]);
  const cd = edge('c', 'd', [[240, 10], [300, 10]]);

  it('prices a bend at one, and three on the main flow', () => {
    const bent = (main: boolean) => edge('c', 'd', [[240, 10], [260, 10], [260, 20], [300, 20]], main);
    expect(cost(drawing(row, [first, bent(false)])) - cost(drawing(row, [first, cd]))).toBe(2 * WEIGHTS.bend);
    expect(cost(drawing(row, [first, bent(true)])) - cost(drawing(row, [first, cd]))).toBe(2 * WEIGHTS.bendMain);
    expect([WEIGHTS.bend, WEIGHTS.bendMain]).toEqual([1, 3]);
  });

  it('prices a crossing at two, and five when one of the edges is on the main flow', () => {
    const across = (main: boolean) => [edge('a', 'b', [[40, 10], [100, 10]], main), edge('c', 'd', [[70, 0], [70, 20]])];
    const apart = [edge('a', 'b', [[40, 10], [100, 10]]), edge('c', 'd', [[150, 0], [150, 20]])];
    expect(cost(drawing(row, across(false))) - cost(drawing(row, apart))).toBe(WEIGHTS.crossing);
    expect(cost(drawing(row, across(true))) - cost(drawing(row, apart))).toBe(WEIGHTS.crossingMain);
    expect([WEIGHTS.crossing, WEIGHTS.crossingMain]).toEqual([2, 5]);
  });

  it('prices an edge against the reading direction at two, and two more for each one in a chain of them', () => {
    const one = [first, edge('d', 'c', [[300, 10], [240, 10]])];
    expect(cost(drawing(row, one)) - cost(drawing(row, [first, cd]))).toBe(WEIGHTS.back);
    const chain = [first, edge('d', 'c', [[300, 10], [240, 10]]), edge('c', 'b', [[200, 10], [140, 10]])];
    const forward = [first, cd, edge('b', 'c', [[140, 10], [200, 10]])];
    // The edge c -> b enters b, which takes in two more edges than it sends out: it counts once more.
    expect(cost(drawing(row, chain)) - cost(drawing(row, forward))).toBe(2 * (WEIGHTS.back + WEIGHTS.backChain) + WEIGHTS.heavyBack);
    expect([WEIGHTS.back, WEIGHTS.backChain]).toEqual([2, 2]);
  });

  it('prices each row beyond the first of a lane at two', () => {
    const lower = [line('a', 0), box('b', 'l', 1, 100), line('c', 200), line('d', 300)];
    expect(cost(drawing(lower, [first])) - cost(drawing(row, [first]))).toBe(WEIGHTS.extraRow);
    expect(WEIGHTS.extraRow).toBe(2);
  });

  it('prices each place an edge leaves out at one', () => {
    const wide = [line('a', 0), line('b', 400), line('c', 200), line('d', 300)];
    expect(cost(drawing(wide, [edge('a', 'b', [[40, 10], [400, 10]])], 100)) - cost(drawing(row, [first], 100))).toBe(WEIGHTS.far * 3);
    expect(WEIGHTS.far).toBe(1);
  });

  it('prices each place before the start node at the start weight', () => {
    expect(cost(drawing(row, [cd])) - cost(drawing(row, [first]))).toBe(2 * WEIGHTS.start);
    expect(WEIGHTS.start).toBe(2);
  });

  it('prices a fan-out node that is not in the middle of its partners at two', () => {
    const at = (x: number) => [line('s', 0, -100), line('u', 50, -100), line('p', x, 0), line('q1', 50, 100), line('q2', 150, 100)];
    const edges = [edge('s', 'u', [[40, -90], [50, -90]]), edge('p', 'q1', [[0, 20], [70, 100]]), edge('p', 'q2', [[0, 20], [170, 100]])];
    expect(cost(drawing(at(400), edges, 1000)) - cost(drawing(at(100), edges, 1000))).toBe(WEIGHTS.branch);
    expect(WEIGHTS.branch).toBe(2);
  });

  it('puts invalid things before the cost', () => {
    const overlap = drawing([line('a', 0), line('b', 20)], [edge('a', 'b', [[40, 10], [100, 10]])]);
    expect(score(overlap)[0]).toBeGreaterThan(0);
    expect(score(drawing(row, [first]))[0]).toBe(0);
  });

  it('prices the start node by the columns before it and by a later row', () => {
    const nodes = [box('a', 'l', 0, 100), box('b', 'l', 0, 0)];
    expect(startMissed(drawing(nodes, [edge('a', 'b', [[100, 10], [40, 10]])]))).toBe(1);
    expect(startMissed(drawing(nodes, [edge('b', 'a', [[40, 10], [100, 10]])]))).toBe(0);
    const later = [box('a', 'l', 1, 0), box('b', 'l', 0, 0)];
    expect(startMissed(drawing(later, [edge('a', 'b', [[20, 20], [20, 10]])]))).toBe(1);
  });

  it('counts the places an edge leaves out in columns and rows, and nothing for neighbours', () => {
    const near = [box('a', 'l', 0, 0), box('b', 'l', 0, 100)];
    const far = [box('a', 'l', 0, 0), box('b', 'l', 0, 400), box('d', 'l', 1, 0), box('e', 'l', 2, 0), box('c', 'l', 3, 0)];
    const at = (nodes: ReturnType<typeof box>[], from: string, to: string): number =>
      farness({ ...drawing(nodes, [edge(from, to, [[0, 0], [1, 0]])]), pitch: 100 });
    expect(at(near, 'a', 'b')).toBe(0);
    expect(at(far, 'a', 'b')).toBe(3);
    expect(at(far, 'a', 'c')).toBe(2);
    expect(score({ ...drawing(far, [edge('a', 'b', [[40, 10], [400, 10]])]), pitch: 100 })[1]).toBe(WEIGHTS.far * 3 + WEIGHTS.extraRow * 3);
  });
});

describe('main flow in the drawing', () => {
  it('marks the edges that join two main-flow nodes in turn, and no others', () => {
    const l = layout(parse(twoBands), pixelRuler(), { composition: 'lanes', questions: false });
    const marked = l.edges.filter((e) => e.main).map((e) => `${e.from}>${e.to}`).sort();
    expect(marked).toEqual(['m1>m2', 'm2>m3', 'm3>m4', 'm4>m5']);
    const staged = layout(parse('flowchart LR\nsubgraph a[A]\nP --> Q\nend\nsubgraph b[B]\nR\nend\nQ --> R'), pixelRuler(), { composition: 'stages', questions: false });
    expect(staged.edges.some((e) => e.main)).toBe(false);
  });

  it('counts crossings on the segments as the crossing diagnostics do', () => {
    for (const src of [...Object.values(fixtures), twoBands]) {
      for (const ruler of [pixelRuler(), cellRuler()]) {
        const l = layout(parse(src), ruler, ruler === cellRuler() ? { maxWidth: 160, questions: false } : { questions: false });
        const [onMain, other] = crossingsOf(l);
        expect(onMain + other).toBe(l.diagnostics.filter((d) => d.kind === 'crossing').length);
      }
    }
  });

  it('finds the fan-out nodes that are off the middle of their partners', () => {
    const l = layout(parse('flowchart LR\nsubgraph a[A]\nP\nend\nsubgraph b[B]\nX\nY\nZ\nend\nP --> X\nP --> Y\nP --> Z'), pixelRuler(), { composition: 'lanes', questions: false });
    expect(Array.isArray(offCentre(l))).toBe(true);
    expect(offCentre({ ...l, pitch: undefined } as Layout)).toEqual([]);
  });
});
