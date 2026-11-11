import { describe, expect, it } from 'vitest';
import { cellRuler, layout, parse, pixelRuler } from '../src/index.ts';
import { CANDIDATES, pickBest, score, violations } from '../src/layered/choose.ts';
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
    expect(CANDIDATES.map((c) => c.name)).toEqual(['forced', 'free']);
    const l = layout(parse(twoBands), pixelRuler(), { composition: 'lanes' });
    const s = score(l);
    expect(s).toHaveLength(5);
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
