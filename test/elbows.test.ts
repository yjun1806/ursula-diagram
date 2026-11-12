import { describe, expect, it } from 'vitest';
import { cellRuler, layout, parse, pixelRuler } from '../src/index.ts';
import { score } from '../src/layered/choose.ts';
import { useElbows } from '../src/layered/elbows.ts';
import type { LayoutEdge, LayoutNode } from '../src/types.ts';
import { geometryViolations } from './helpers.ts';

const node = (id: string, x: number, y: number, w = 40, h = 40): LayoutNode => ({ id, lane: 'l', rank: 0, span: 1, row: 0, x, y, w, h, title: id, lines: [], shape: 'rect' });
const jog = (): LayoutEdge => ({ from: 'u', to: 'v', style: 'normal', points: [{ x: 20, y: 40 }, { x: 20, y: 70 }, { x: 220, y: 70 }, { x: 220, y: 100 }] });
const u = node('u', 0, 0);
const v = node('v', 200, 100);

describe('one-bend edges', () => {
  it('leaves through the middle of the side of the first box when the way is free and no other edge ends there', () => {
    const edges = [jog()];
    expect(useElbows(edges, [u, v], pixelRuler(), false)).toBe(1);
    expect(edges[0]?.points).toEqual([{ x: 40, y: 20 }, { x: 220, y: 20 }, { x: 220, y: 100 }]);
    expect(edges[0]?.elbow).toBe(true);
  });

  it('enters through the side of the second box when a box stands in the way of the first shape', () => {
    const edges = [jog()];
    expect(useElbows(edges, [u, v, node('w', 100, 10)], pixelRuler(), false)).toBe(1);
    expect(edges[0]?.points).toEqual([{ x: 20, y: 40 }, { x: 20, y: 120 }, { x: 200, y: 120 }]);
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
    expect(edges[0]?.points).toEqual([{ x: 20, y: 40 }, { x: 20, y: 220 }, { x: 100, y: 220 }]);
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
    // With elbows allowed the drawing is never worse by the score (a bend may be traded for a row).
    expect(score(on)[1]).toBeLessThanOrEqual(score(off)[1] as number);
  });
});

describe('one-bend edges leaving through the side of a box that the other end has moved clear of', () => {
  const dirs = { stages: false, td: false, order: new Map([['l', 0]]) };
  const a = node('a', 0, 200);
  const b = node('b', 0, 100);
  const c = node('c', 200, 100);
  const straight = (): LayoutEdge => ({ from: 'a', to: 'b', style: 'normal', points: [{ x: 30, y: 200 }, { x: 30, y: 140 }] });
  const toC = (): LayoutEdge => ({ from: 'a', to: 'c', style: 'normal', points: [{ x: 10, y: 200 }, { x: 10, y: 170 }, { x: 220, y: 170 }, { x: 220, y: 140 }] });

  it('turns an edge to a box beside the face of its neighbour above while a straight edge shares that face', () => {
    const edges = [straight(), toC()];
    expect(useElbows(edges, [a, b, c], pixelRuler(), false, dirs)).toBe(1);
    expect(edges[0]?.points).toEqual([{ x: 30, y: 200 }, { x: 30, y: 140 }]);
    expect(edges[1]?.points).toEqual([{ x: 40, y: 220 }, { x: 220, y: 220 }, { x: 220, y: 140 }]);
  });

  it('keeps the old rule when the other box overlaps the range of the first', () => {
    const near = node('c', 30, 100);
    const edges = [straight(), { from: 'a', to: 'c', style: 'normal' as const, points: [{ x: 10, y: 200 }, { x: 10, y: 170 }, { x: 60, y: 170 }, { x: 60, y: 140 }] }];
    expect(useElbows(edges, [a, b, near], pixelRuler(), false, dirs)).toBe(0);
    expect(edges[1]?.points).toHaveLength(4);
  });

  it('keeps the jog when an edge ends on that side of the box, and when the side already holds two ends', () => {
    const into = (y: number): LayoutEdge => ({ from: 'd', to: 'a', style: 'normal', points: [{ x: 120, y }, { x: 40, y }] });
    const d = node('d', 120, 200, 40, 40);
    const arriving = [straight(), toC(), into(220)];
    expect(useElbows(arriving, [a, b, c, d], pixelRuler(), false, dirs)).toBe(0);
    expect(arriving[1]?.points).toHaveLength(4);
    const leaving = (y: number): LayoutEdge => ({ from: 'a', to: 'd', style: 'normal', points: [{ x: 40, y }, { x: 120, y }] });
    const crowded = [straight(), toC(), leaving(205), leaving(235)];
    expect(useElbows(crowded, [a, b, c, d], pixelRuler(), false, dirs)).toBe(0);
    expect(crowded[1]?.points).toHaveLength(4);
  });

  it('changes edges that leave one face toward the same side all together or none', () => {
    const e = node('e', 300, 100);
    const toE = (): LayoutEdge => ({ from: 'a', to: 'e', style: 'normal', points: [{ x: 20, y: 200 }, { x: 20, y: 170 }, { x: 320, y: 170 }, { x: 320, y: 140 }] });
    const pair = [toC(), toE()];
    const alone = [toC()];
    expect(useElbows(alone, [a, c, e], pixelRuler(), false, dirs)).toBe(1);
    // Two share the right face of the box, which offers one slot, so the first keeps off it and enters its target's side.
    expect(useElbows(pair, [a, c, e], pixelRuler(), false, dirs)).toBe(2);
    expect(pair.map((x) => x.points.length)).toEqual([3, 3]);
    // A box stands in the way of every shape of the second edge: the first stays a jog too, though it alone could turn.
    const wall = node('w', 120, 190);
    expect(useElbows([toC()], [a, c, e, wall], pixelRuler(), false, dirs)).toBe(1);
    const blocked = [toC(), toE()];
    expect(useElbows(blocked, [a, c, e, wall], pixelRuler(), false, dirs)).toBe(0);
    expect(blocked.map((x) => x.points.length)).toEqual([4, 4]);
  });

  it('turns every edge of such a set when each finds a free shape', () => {
    const near = node('c', 200, 100);
    const far = node('e', 300, 20);
    const d = node('d', 200, 200);
    const toNear: LayoutEdge = { from: 'a', to: 'c', style: 'normal', points: [{ x: 30, y: 200 }, { x: 30, y: 170 }, { x: 220, y: 170 }, { x: 220, y: 140 }] };
    const toFar: LayoutEdge = { from: 'a', to: 'e', style: 'normal', points: [{ x: 10, y: 200 }, { x: 10, y: 100 }, { x: 320, y: 100 }, { x: 320, y: 60 }] };
    const into: LayoutEdge = { from: 'd', to: 'a', style: 'normal', points: [{ x: 200, y: 220 }, { x: 40, y: 220 }] };
    const edges = [toNear, toFar, into];
    expect(useElbows(edges, [a, near, far, d], pixelRuler(), false, dirs)).toBe(2);
    expect(edges[0]?.points).toEqual([{ x: 30, y: 200 }, { x: 30, y: 120 }, { x: 200, y: 120 }]);
    expect(edges[1]?.points).toEqual([{ x: 10, y: 200 }, { x: 10, y: 40 }, { x: 300, y: 40 }]);
  });
});

describe('start node', () => {
  it('stands in the first place of the reading direction and the first row of its lane', () => {
    const src = 'flowchart LR\nsubgraph a[A]\nS[Start] --> M[Middle]\nX[Other] --> M\nY[Side] --> X\nend\nsubgraph b[B]\nZ[Far]\nend\nM --> Z';
    const g = parse(src);
    for (const ruler of [pixelRuler(), cellRuler()]) {
      const l = layout(g, ruler, ruler.terminal === true ? { quality: 'best' } : {});
      const s = l.nodes.find((n) => n.id === 'S');
      expect(s?.x).toBe(Math.min(...l.nodes.map((n) => n.x)));
      expect(s?.row).toBe(0);
    }
  });
});
