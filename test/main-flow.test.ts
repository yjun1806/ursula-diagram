import { describe, expect, it } from 'vitest';
import { cellRuler, layout, parse, pixelRuler } from '../src/index.ts';
import { CANDIDATES, WEIGHTS, farness, pickBest, score, startMissed, violations } from '../src/layered/choose.ts';
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
  const box = (id: string, lane: string, row: number, x: number) => ({ id, lane, rank: 0, span: 1, row, x, y: row * 100, w: 40, h: 20, title: id, lines: [] as string[] });
  const edge = (from: string, to: string, points: Array<[number, number]>) => ({ from, to, style: 'normal' as const, points: points.map(([x, y]) => ({ x, y })) });
  const drawing = (nodes: ReturnType<typeof box>[], edges: ReturnType<typeof edge>[]): Layout => ({
    width: 1000,
    height: 1000,
    direction: 'LR',
    laneAxis: 'across',
    lanes: [],
    nodes,
    edges,
    diagnostics: [],
  });

  it('adds bends, each row beyond the first of a lane, each edge against the reading direction, and more for a chain of them', () => {
    const nodes = [box('a', 'l', 0, 0), box('b', 'l', 1, 200), box('c', 'l', 2, 400), box('d', 'm', 0, 600)];
    const bent = edge('a', 'd', [[40, 10], [50, 10], [50, 20], [600, 20]]);
    expect(score(drawing(nodes, [bent]))[1]).toBe(2 + WEIGHTS.extraRow * 2);
    const single = edge('d', 'a', [[600, 10], [40, 10]]);
    expect(score(drawing(nodes, [single]))[1]).toBe(WEIGHTS.extraRow * 2 + WEIGHTS.back + WEIGHTS.start * 3);
    const chain = [edge('d', 'a', [[600, 10], [40, 10]]), edge('a', 'b', [[40, 10], [-20, 10]])];
    expect(score(drawing(nodes, chain))[1]).toBe(WEIGHTS.extraRow * 2 + 2 * (WEIGHTS.back + WEIGHTS.backChain) + WEIGHTS.start * 3);
  });

  it('puts invalid things first and prices a crossing inside the cost', () => {
    const nodes = [box('a', 'l', 0, 0), box('b', 'l', 0, 100)];
    const crossing = drawing(nodes, [edge('a', 'b', [[40, 10], [100, 10]])]);
    const s = score({ ...crossing, diagnostics: [{ kind: 'crossing', nodes: [], message: '' }] });
    expect(s[0]).toBe(0);
    expect(s[1]).toBe(WEIGHTS.crossing);
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
