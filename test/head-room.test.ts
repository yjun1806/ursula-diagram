import { describe, expect, it } from 'vitest';
import { layout, parse, pixelRuler } from '../src/index.ts';
import { HEAD_LEG, headRoom } from '../src/layered/head-room.ts';
import { crossedLabels } from '../src/layered/label-spot.ts';
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

  it('moves the bend away from the mark where a box lies across every cut and the way is free', () => {
    const l = drawing([node('a', 200, 0), node('b', 0, 100), node('c', 60, 160)], [edge('a', 'b', [[200, 20], [112, 20], [112, 120], [100, 120]])]);
    const out = headRoom(l, 12);
    expect(out.edges[0]?.points).toEqual([{ x: 200, y: 20 }, { x: 132, y: 20 }, { x: 132, y: 120 }, { x: 100, y: 120 }]);
    expect(out.nodes).toEqual(l.nodes);
    expect(out.width).toBe(l.width);
  });

  it('leaves the bend where another line or a box stands in its way, or the piece before it would get too short', () => {
    const boxes = [node('a', 200, 0), node('b', 0, 100), node('c', 60, 160)];
    const bent = edge('a', 'b', [[200, 20], [112, 20], [112, 120], [100, 120]]);
    const lined = drawing([...boxes, node('d', 300, 160)], [bent, edge('c', 'd', [[140, 160], [140, 60], [350, 60], [350, 160]])]);
    expect(headRoom(lined, 12)).toEqual(lined);
    const boxed = drawing([...boxes, { ...node('d', 120, 50), w: 30 }], [bent]);
    expect(headRoom(boxed, 12)).toEqual(boxed);
    const tight = drawing([node('a', 140, 0), node('b', 0, 100), node('c', 60, 160)], [edge('a', 'b', [[140, 20], [112, 20], [112, 120], [100, 120]])]);
    expect(headRoom(tight, 12)).toEqual(tight);
  });

  it('leaves the bend where it would come closer than 12 to the chip of another label, and moves it where 12 stay', () => {
    const boxes = [node('a', 200, 0), node('b', 0, 100), node('c', 60, 160)];
    const bent = edge('a', 'b', [[200, 20], [112, 20], [112, 120], [100, 120]]);
    // The text of the label starts 6 inside its chip: the chip is 10 from the moved bend in the first drawing and 12 in the second.
    const labelled = (x: number): LayoutEdge => edge('c', 'd', [[x + 12, 45], [x + 12, 160]], { label: { text: 'No', x, y: 60, w: 24, h: 20 } });
    const near = drawing([...boxes, node('d', 300, 160)], [bent, labelled(148)]);
    expect(headRoom(near, 12)).toEqual(near);
    const far = drawing([...boxes, node('d', 300, 160)], [bent, labelled(150)]);
    expect(headRoom(far, 12).edges[0]?.points).toEqual([{ x: 200, y: 20 }, { x: 132, y: 20 }, { x: 132, y: 120 }, { x: 100, y: 120 }]);
  });

  it('leaves the bend where the label of the line itself stands beside it', () => {
    const boxes = [node('a', 200, 0), node('b', 0, 100), node('c', 60, 160)];
    // The label stands 4 left of the upright piece, which would move right: the label would be left 24 from its line.
    const own = drawing(boxes, [edge('a', 'b', [[200, 20], [112, 20], [112, 120], [100, 120]], { label: { text: 'No', x: 84, y: 60, w: 24, h: 20 } })]);
    expect(headRoom(own, 12)).toEqual(own);
  });

  it('leaves the bend where the longer piece would run beside another line for longer', () => {
    const boxes = [node('a', 200, 0), node('b', 0, 100), node('c', 60, 160), node('d', 300, 108)];
    const bent = edge('a', 'b', [[200, 20], [112, 20], [112, 120], [100, 120]]);
    const beside = drawing(boxes, [bent, edge('b', 'd', [[104, 128], [300, 128]])]);
    expect(headRoom(beside, 12)).toEqual(beside);
    const apart = drawing(boxes, [bent, edge('b', 'd', [[104, 132], [300, 132]])]);
    expect(headRoom(apart, 12).edges[0]?.points[1]).toEqual({ x: 132, y: 20 });
  });

  it('runs no line through a label in a dense drawing where a bend has a label beside it', () => {
    const boxes = ['n4[Index]', 'n7[Receive order]', 'n10[Check stock]', 'n13[Pack]', 'n2[Audit log]', 'n3[Pack]', 'n5[Refund]', 'n8[Approve]', 'n11[Archive]', 'n0[Check stock]', 'n1[Archive]', 'n6[Ship parcel]', 'n9[Notify]', 'n12[Audit log]'];
    const lines = [
      'n11 --> n12', 'n0 --> n1', 'n7 -->|e2| n8', 'n4 -->|e3| n5', 'n6 -->|e4| n7', 'n7 --> n8', 'n10 --> n11', 'n1 -->|e7| n2', 'n10 --> n13', 'n10 --> n2', 'n1 --> n2', 'n12 --> n13',
      'n1 --> n12', 'n0 -->|e13| n1', 'n1 -->|e14| n6', 'n2 -->|e15| n5', 'n0 -->|e16| n3', 'n6 -->|e17| n3', 'n0 --> n8', 'n9 -->|e19| n10', 'n12 --> n3', 'n9 -->|e21| n6', 'n5 --> n1', 'n3 --> n7',
    ];
    const l = layout(parse(['flowchart LR', ...boxes, ...lines].join('\n')), pixelRuler());
    // The line from n9 to n6 bends beside the label of the line from n1 to n6: no bend is moved onto that label.
    expect(crossedLabels(l)).toBe(0);
  });

  it('pulls a drawing apart sideways under its legend, which stays where it is', () => {
    const l = layout(parse('flowchart LR\n  A ==> B\n  A --> C'), pixelRuler());
    for (const e of l.edges) if (e.points.length > 2) expect(lastLeg(e)).toBeGreaterThanOrEqual(HEAD_LEG);
    expect(l.legend?.x).toBe(0);
    expect(l.legend?.w).toBe(l.width);
  });
});
