import { describe, expect, it } from 'vitest';
import { pixelRuler } from '../src/index.ts';
import { refineLabels, segmentToRect } from '../src/layered/label-spot.ts';
import type { Layout, LayoutEdge, Point } from '../src/types.ts';

const ruler = pixelRuler();
const box = { w: 40, h: 20 };

const vertical = (x: number, from: number, to: number): Point[] => [
  { x, y: from },
  { x, y: to },
];

const edge = (name: string, points: Point[], label?: { x: number; y: number }): LayoutEdge => ({
  from: `${name}1`,
  to: `${name}2`,
  style: 'normal',
  points,
  ...(label ? { label: { text: name, x: label.x, y: label.y, ...box } } : {}),
});

const layoutOf = (edges: LayoutEdge[]): Layout => ({ width: 600, height: 400, direction: 'TD', laneAxis: 'across', lanes: [], nodes: [], edges, diagnostics: [] });

/** Least distance from a label box to the lines of the other edges. */
const clearance = (layout: Layout, index: number): number => {
  const label = layout.edges[index]?.label;
  if (!label) return Infinity;
  const lines = layout.edges.flatMap((e, k) => (k === index ? [] : e.points.slice(1).map((q, i) => [e.points[i] as Point, q] as const)));
  return Math.min(...lines.map((s) => segmentToRect(s, label)));
};

describe('refineLabels', () => {
  it('moves a label that stands within 12px of the line of another edge', () => {
    // The label of `a` sits to the right of its line; the line of `b` runs 6px from its right side.
    const before = layoutOf([edge('a', vertical(100, 0, 200), { x: 104, y: 90 }), edge('b', vertical(150, 0, 200))]);
    expect(clearance(before, 0)).toBeLessThan(12);
    const after = refineLabels(before, ruler);
    expect(clearance(after, 0)).toBeGreaterThanOrEqual(12);
    expect(after.edges[0]?.points).toEqual(before.edges[0]?.points);
    expect(after.edges[1]).toBe(before.edges[1]);
    expect(after.nodes).toBe(before.nodes);
    expect(after.edges[0]?.label?.text).toBe('a');
  });

  it('stands on its line, in the middle of the stretch the arrowhead leaves', () => {
    const before = layoutOf([edge('a', vertical(100, 0, 200), { x: 104, y: 90 }), edge('b', vertical(150, 0, 200))]);
    const label = refineLabels(before, ruler).edges[0]?.label;
    // The stretch for the label ends 16px + the 8px arrowhead before the end, so its middle is 4px above the middle of the line.
    expect(label?.y).toBe(86);
    expect((label?.x ?? 0) + box.w / 2).toBe(100);
  });

  it('leaves a label that is already clean exactly where it was', () => {
    const before = layoutOf([edge('a', vertical(100, 0, 200), { x: 104, y: 90 }), edge('b', vertical(400, 0, 200))]);
    const after = refineLabels(before, ruler);
    expect(after).toBe(before);
    expect(after.edges[0]?.label).toEqual({ text: 'a', x: 104, y: 90, ...box });
  });

  it('moves a label that stands within 8px of a label placed before it', () => {
    const before = layoutOf([edge('a', vertical(100, 0, 200), { x: 104, y: 90 }), edge('b', vertical(260, 0, 200), { x: 144, y: 94 })]);
    const after = refineLabels(before, ruler);
    expect(after.edges[0]?.label).toEqual(before.edges[0]?.label);
    const [first, second] = [after.edges[0]?.label, after.edges[1]?.label];
    const gap = Math.hypot(Math.max((first?.x ?? 0) - ((second?.x ?? 0) + box.w), (second?.x ?? 0) - ((first?.x ?? 0) + box.w), 0), Math.max((first?.y ?? 0) - ((second?.y ?? 0) + box.h), (second?.y ?? 0) - ((first?.y ?? 0) + box.h), 0));
    expect(gap).toBeGreaterThanOrEqual(8);
  });

  it('keeps the place when the segment is too short for any candidate', () => {
    // 40px of line cannot keep 16px visible on both sides of a 20px label.
    const before = layoutOf([edge('a', vertical(100, 0, 40), { x: 104, y: 10 }), edge('b', vertical(150, 0, 200))]);
    expect(refineLabels(before, ruler)).toBe(before);
  });

  it('takes the place farthest from other lines when no candidate is clean', () => {
    // Lines of other edges close in on both sides of the one segment: every place is within 12px of one of them.
    const before = layoutOf([
      edge('a', vertical(100, 0, 200), { x: 104, y: 90 }),
      edge('b', vertical(150, 0, 200)),
      edge('c', vertical(46, 0, 200)),
    ]);
    const after = refineLabels(before, ruler);
    expect(clearance(after, 0)).toBeGreaterThanOrEqual(clearance(before, 0));
  });
});
