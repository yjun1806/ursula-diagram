import { describe, expect, it } from 'vitest';
import { cellRuler, layout, parse, pixelRuler } from '../src/index.ts';
import { useElbows } from '../src/layered/elbows.ts';
import type { LayoutEdge, LayoutNode } from '../src/types.ts';
import { geometryViolations } from './helpers.ts';

const node = (id: string, x: number, y: number, w = 40, h = 40): LayoutNode => ({ id, lane: 'l', rank: 0, span: 1, row: 0, x, y, w, h, title: id, lines: [] });
const jog = (): LayoutEdge => ({ from: 'u', to: 'v', style: 'normal', points: [{ x: 20, y: 40 }, { x: 20, y: 70 }, { x: 220, y: 70 }, { x: 220, y: 100 }] });
const u = node('u', 0, 0);
const v = node('v', 200, 100);

describe('one-bend edges', () => {
  it('leaves through the side of the first box when the way is free', () => {
    const edges = [jog()];
    expect(useElbows(edges, [u, v], pixelRuler(), false)).toBe(1);
    expect(edges[0]?.points).toEqual([{ x: 40, y: 30 }, { x: 220, y: 30 }, { x: 220, y: 100 }]);
    expect(edges[0]?.elbow).toBe(true);
  });

  it('enters through the side of the second box when a box stands in the way of the first shape', () => {
    const edges = [jog()];
    expect(useElbows(edges, [u, v, node('w', 100, 10)], pixelRuler(), false)).toBe(1);
    expect(edges[0]?.points).toEqual([{ x: 20, y: 40 }, { x: 20, y: 110 }, { x: 200, y: 110 }]);
  });

  it('keeps the jog when both shapes are blocked, a port is shared, or the ruler has one side port', () => {
    const boxes = [u, v, node('w', 100, 10), node('x', 100, 100)];
    const blocked = [jog()];
    expect(useElbows(blocked, boxes, pixelRuler(), false)).toBe(0);
    expect(blocked[0]?.points).toHaveLength(4);
    const shared = [jog(), { from: 'u', to: 'z', style: 'normal' as const, points: [{ x: 40, y: 30 }, { x: 60, y: 30 }] }];
    expect(useElbows(shared, [u, v, node('z', 60, 10), node('x', 100, 100)], pixelRuler(), false)).toBe(0);
    const cell = [jog()];
    expect(useElbows(cell, [u, v], cellRuler(), false)).toBe(0);
  });

  it('works along the transposed axes', () => {
    const edge: LayoutEdge = { from: 'u', to: 'v', style: 'normal', points: [{ x: 40, y: 20 }, { x: 70, y: 20 }, { x: 70, y: 220 }, { x: 100, y: 220 }] };
    const edges = [edge];
    expect(useElbows(edges, [node('u', 0, 0), node('v', 100, 200)], pixelRuler(), true)).toBe(1);
    expect(edges[0]?.points).toEqual([{ x: 30, y: 40 }, { x: 30, y: 220 }, { x: 100, y: 220 }]);
  });

  it('can be switched off and keeps every drawing valid', () => {
    const src = `flowchart LR
  subgraph a[A]
    p1[One] --> p2[Two] --> p3[Three]
  end
  subgraph b[B]
    q1[Four]
    q2[Five]
  end
  p1 --> q2
  p3 --> q1
  q1 --> p2`;
    const g = parse(src);
    const on = layout(g, pixelRuler(), { composition: 'lanes' });
    const off = layout(g, pixelRuler(), { composition: 'lanes', elbows: false });
    expect(off.edges.some((e) => e.elbow)).toBe(false);
    expect(geometryViolations(on)).toEqual([]);
    const bends = (l: typeof on): number => l.edges.reduce((n, e) => n + Math.max(0, e.points.length - 2), 0);
    expect(bends(on)).toBeLessThanOrEqual(bends(off));
  });
});

describe('start node', () => {
  it('stands in the first place of the reading direction and the first row of its lane', () => {
    const src = 'flowchart LR\nsubgraph a[A]\nS[Start] --> M[Middle]\nX[Other] --> M\nY[Side] --> X\nend\nsubgraph b[B]\nZ[Far]\nend\nM --> Z';
    const g = parse(src);
    for (const ruler of [pixelRuler(), cellRuler()]) {
      const l = layout(g, ruler, ruler === cellRuler() ? { maxWidth: 160 } : {});
      const s = l.nodes.find((n) => n.id === 'S');
      expect(s?.x).toBe(Math.min(...l.nodes.map((n) => n.x)));
      expect(s?.row).toBe(0);
    }
  });
});
