import { describe, expect, it } from 'vitest';
import { layout, parse, pixelRuler } from '../src/index.ts';
import { HEAD_LEG, headRoom } from '../src/layered/head-room.ts';
import type { Layout, LayoutEdge, LayoutNode } from '../src/types.ts';

const node = (id: string, x: number, y: number): LayoutNode => ({ id, lane: '', rank: 0, span: 1, row: 0, x, y, w: 100, h: 40, title: id, lines: [], shape: 'rect' });
const edge = (from: string, to: string, points: Array<[number, number]>, extra: Partial<LayoutEdge> = {}): LayoutEdge => ({ from, to, style: 'normal', points: points.map(([x, y]) => ({ x, y })), ...extra });
const drawing = (nodes: LayoutNode[], edges: LayoutEdge[]): Layout => ({ width: 400, height: 200, direction: 'LR', laneAxis: 'across', lanes: [], nodes, edges, diagnostics: [] });
const lastLeg = (e: LayoutEdge): number => {
  const [a, b] = e.points.slice(-2) as [{ x: number; y: number }, { x: number; y: number }];
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
};

describe('the straight piece before a mark', () => {
  it('is made as long as HEAD_LEG by pulling the drawing apart, and everything past the cut moves along', () => {
    const l = drawing([node('a', 0, 0), node('b', 124, 100)], [edge('a', 'b', [[100, 20], [112, 20], [112, 120], [124, 120]])]);
    const out = headRoom(l, 12);
    expect(lastLeg(out.edges[0] as LayoutEdge)).toBe(36);
    expect(out.nodes[1]?.x).toBe(148);
    expect(out.nodes[0]?.x).toBe(0);
    expect(out.width).toBe(424);
  });

  it('stays as it is when a box lies across every cut, when the line does not bend, and when the end has no mark', () => {
    const across = drawing([node('a', 0, 0), node('b', 124, 100), node('c', 60, 160)], [edge('a', 'b', [[100, 20], [112, 20], [112, 120], [124, 120]])]);
    expect(headRoom(across, 12)).toEqual(across);
    const straight = drawing([node('a', 0, 0), node('b', 110, 0)], [edge('a', 'b', [[100, 20], [110, 20]])]);
    expect(headRoom(straight, 12)).toEqual(straight);
    const bare = drawing([node('a', 0, 0), node('b', 124, 100)], [edge('a', 'b', [[100, 20], [112, 20], [112, 120], [124, 120]], { end: 'none' })]);
    expect(headRoom(bare, 12)).toEqual(bare);
  });

  it('does not widen a drawing past the given width', () => {
    const l = drawing([node('a', 0, 0), node('b', 124, 100)], [edge('a', 'b', [[100, 20], [112, 20], [112, 120], [124, 120]])]);
    expect(headRoom(l, 12, 410)).toEqual(l);
  });

  it('holds in a drawing with tight columns', () => {
    const l = layout(parse('flowchart LR\n  a[Ingest] --> b{Valid?}\n  b -- no --> c[Quarantine]\n  b -- yes --> d[Dedupe]\n  d --> e[Enrich]\n  e --> f[Lake]\n  e --> g[Stream]'), pixelRuler());
    for (const e of l.edges) if (e.points.length > 2) expect(lastLeg(e)).toBeGreaterThanOrEqual(HEAD_LEG);
  });
});
