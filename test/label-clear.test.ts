import { describe, expect, it } from 'vitest';
import { layout, parse, pixelRuler } from '../src/index.ts';
import { offCentreEnds } from '../src/layered/centre.ts';
import { clearLabels } from '../src/layered/label-clear.ts';
import { chipOfLabel, crossedLabels, LINE_CLEAR, segmentToRect } from '../src/layered/label-spot.ts';
import type { Layout, LayoutEdge, LayoutNode, Point } from '../src/types.ts';

const node = (id: string, x: number, y: number): LayoutNode => ({ id, lane: '', rank: 0, span: 1, row: 0, x, y, w: 100, h: 40, title: id, lines: [], shape: 'rect' });
const edge = (from: string, to: string, points: Array<[number, number]>, extra: Partial<LayoutEdge> = {}): LayoutEdge => ({ from, to, style: 'normal', points: points.map(([x, y]) => ({ x, y })), ...extra });
const drawing = (nodes: LayoutNode[], edges: LayoutEdge[]): Layout => ({ width: 400, height: 300, direction: 'LR', laneAxis: 'across', lanes: [], nodes, edges, diagnostics: [] });
const label = (x: number, y: number): NonNullable<LayoutEdge['label']> => ({ text: 'No', x, y, w: 24, h: 20 });
const none = (): [] => [];

/** Least distance from the label of edge `i` to the lines of the other edges. */
function lineGap(l: Layout, i: number): number {
  const box = l.edges[i]?.label as NonNullable<LayoutEdge['label']>;
  return Math.min(...l.edges.flatMap((e, k) => (k === i ? [] : e.points.slice(1).map((q, s) => segmentToRect([e.points[s] as Point, q], box)))));
}

/** Least distance from the chip of the label of edge `i` to the lines of the other edges, and to the boxes. */
const chipGap = (l: Layout, i: number): number => lineGap({ ...l, edges: l.edges.map((e, k) => (k === i && e.label ? { ...e, label: { ...e.label, ...chipOfLabel(e.label) } } : e)) }, i);
function boxGap(l: Layout, i: number): number {
  const c = chipOfLabel(l.edges[i]?.label as NonNullable<LayoutEdge['label']>);
  return Math.min(...l.nodes.map((n) => Math.hypot(Math.max(c.x - n.x - n.w, n.x - c.x - c.w, 0), Math.max(c.y - n.y - n.h, n.y - c.y - c.h, 0))));
}

/** Where every line end stands on the box it ends on. */
function endsOf(l: Layout): number[][] {
  return l.edges.map((e) => {
    const [from, to] = [l.nodes.find((n) => n.id === e.from), l.nodes.find((n) => n.id === e.to)];
    const [p, q] = [e.points[0] as Point, e.points[e.points.length - 1] as Point];
    return [p.x - (from?.x ?? 0), p.y - (from?.y ?? 0), q.x - (to?.x ?? 0), q.y - (to?.y ?? 0)];
  });
}

describe('a label another line runs through', () => {
  // The line from a to b is 80 long and two lines cross it 12 apart: no stretch of it holds the label with clear room.
  const crossedDrawing = (): Layout =>
    drawing(
      [node('a', 0, 100), node('b', 180, 100), node('c', 290, 0), node('d', 290, 240)],
      [edge('a', 'b', [[100, 120], [180, 120]], { label: label(130, 110) }), edge('c', 'd', [[134, 40], [134, 240]]), edge('c', 'd', [[146, 40], [146, 240]])],
    );

  // The line from a to b is 60 long, two lines cross it 12 apart, and the label of the second stands 6 right of it.
  const between = (): Layout =>
    drawing(
      [node('a', 0, 100), node('b', 160, 100), node('c', 290, 0), node('d', 290, 240)],
      [
        edge('a', 'b', [[100, 120], [160, 120]], { label: label(118, 110) }),
        edge('c', 'd', [[112, 40], [112, 240]]),
        edge('c', 'd', [[124, 40], [124, 240]], { label: { text: 'No', x: 130, y: 180, w: 24, h: 20 } }),
      ],
    );

  it('gets a clean place on its line by pulling the drawing apart across that line', () => {
    const l = crossedDrawing();
    expect(crossedLabels(l)).toBe(1);
    const out = clearLabels(l, pixelRuler(), 16, none);
    expect(crossedLabels(out)).toBe(0);
    expect(lineGap(out, 0)).toBeGreaterThanOrEqual(LINE_CLEAR);
    expect(out.width).toBeGreaterThan(l.width);
    expect(out.width).toBeLessThanOrEqual(l.width + 48);
    expect(out.height).toBe(l.height);
  });

  it('stays as it is when the drawing may not get wider, and a clean label is not touched', () => {
    const l = crossedDrawing();
    expect(clearLabels(l, pixelRuler(), 16, none, l.width)).toEqual(l);
    const clean = drawing([node('a', 0, 100), node('b', 220, 100)], [edge('a', 'b', [[100, 120], [220, 120]], { label: label(148, 110) })]);
    expect(clearLabels(clean, pixelRuler(), 16, none)).toBe(clean);
  });

  it('is not given room by a cut between another label and the line that label belongs to', () => {
    // Only a cut right of the second upright line gives a place with one step, and the label of that line stands 6 right of it.
    const l = { ...between(), width: 600 };
    expect(crossedLabels(l)).toBe(1);
    const out = clearLabels(l, pixelRuler(), 16, none);
    const [line, tag] = [out.edges[2]?.points[0] as Point, out.edges[2]?.label as NonNullable<LayoutEdge['label']>];
    expect(tag.x - line.x).toBe(6);
    expect(crossedLabels(out)).toBe(0);
  });

  it('is given a place whose chip touches no box and keeps 8 from the other lines', () => {
    // A line `long` from a to b, crossed by two free lines at `first` and 12 right of it, in a drawing wide enough to grow.
    const tight = (long: number, wide: number, first: number): Layout => ({
      ...drawing(
        [node('a', 0, 100), node('b', 100 + long, 100)],
        [edge('a', 'b', [[100, 120], [100 + long, 120]], { label: { ...label(100 + (long - wide) / 2, 110), w: wide } }), edge('x', 'y', [[first, 40], [first, 240]]), edge('x', 'y', [[first + 12, 40], [first + 12, 240]])],
      ),
      width: 600,
    });
    // With two steps the label has a place 12 from the lines, but its chip would lie against the box a.
    const byBox = clearLabels(tight(40, 28, 120), pixelRuler(), 16, none);
    expect(crossedLabels(byBox)).toBe(0);
    expect(boxGap(byBox, 0)).toBeGreaterThan(0);
    expect(chipGap(byBox, 0)).toBeGreaterThanOrEqual(8);
    // With one step the label has a place 12 from the lines, but its chip would stand 6 from one of them.
    const byLine = clearLabels(tight(64, 24, 108), pixelRuler(), 16, none);
    expect(crossedLabels(byLine)).toBe(0);
    expect(boxGap(byLine, 0)).toBeGreaterThan(0);
    expect(chipGap(byLine, 0)).toBeGreaterThanOrEqual(8);
  });

  it('stays as it is when the pull would add more than a tenth to the area, sideways or down the page', () => {
    // Three steps are needed here, 48 on a width of 400.
    const narrow = between();
    expect(clearLabels(narrow, pixelRuler(), 16, none)).toEqual(narrow);
    // The same drawing turned a quarter: one step is 16 on a height of 150, and on a height of 300 it is taken.
    const turned = (height: number): Layout => {
      const l = crossedDrawing();
      const flip = <T extends { x: number; y: number }>(b: T): T => ({ ...b, x: b.y, y: b.x });
      return { ...l, width: 400, height, direction: 'TD', nodes: l.nodes.map((n) => ({ ...flip(n), w: n.h, h: n.w })), edges: l.edges.map((e) => ({ ...e, points: e.points.map(flip), ...(e.label === undefined ? {} : { label: { ...e.label, x: 108, y: 130 } }) })) };
    };
    const low = turned(150);
    expect(crossedLabels(low)).toBe(1);
    expect(clearLabels(low, pixelRuler(), 16, none)).toEqual(low);
    const tall = clearLabels(turned(300), pixelRuler(), 16, none);
    expect(crossedLabels(tall)).toBe(0);
    expect(tall.height).toBeGreaterThan(300);
  });

  it('adds no more than a tenth to the area of a drawing with many labels that lines run through', () => {
    const lanes = [
      ['subgraph l0[Lane 0]', 'n0[Pack]', 'n1[Index]', 'n4[Receive order]', 'n5[Approve]', 'n8[Archive]', 'n9[Audit log]', 'n11[Index]', 'n13[Ship parcel]', 'end'],
      ['subgraph l1[Lane 1]', 'n2[Refund]', 'n3[Ship parcel]', 'n6[Notify]', 'n7[Check stock]', 'n10[Pack]', 'n12[Refund]', 'end'],
    ].flat();
    const lines = [
      'n9 -->|no| n10', 'n6 -->|on failure| n9', 'n9 --> n10', 'n5 --> n3', 'n13 --> n12', 'n1 --> n2', 'n2 --> n3', 'n8 --> n9', 'n6 --> n7', 'n9 -->|no| n10',
      'n11 -->|on failure| n12', 'n3 -->|retry later| n4', 'n11 -->|ok| n3', 'n3 --> n11', 'n1 --> n9', 'n3 -->|on failure| n1', 'n12 -->|retry later| n11', 'n10 -->|ok| n2', 'n5 --> n3', 'n5 --> n4',
    ];
    const l = layout(parse(['flowchart RL', ...lanes, ...lines].join('\n')), pixelRuler());
    // Before any label is given room the drawing is 1232 by 384, and three pulls down the page would make it 432 high.
    expect(l.width * l.height).toBeLessThanOrEqual(1.1 * 1232 * 384);
  });

  it('leaves every line end where it stood on its box when a box begins right at a cut', () => {
    // The first cut along the line from a to b falls at 104, where the box e begins, and a line ends on the top of e.
    const l = drawing(
      [node('a', 0, 100), node('b', 180, 100), node('c', 290, 0), node('e', 104, 200)],
      [edge('a', 'b', [[100, 120], [180, 120]], { label: label(130, 110) }), edge('x', 'y', [[134, 40], [134, 190]]), edge('x', 'y', [[146, 40], [146, 190]]), edge('c', 'e', [[154, 40], [154, 200]])],
    );
    expect(endsOf(clearLabels(l, pixelRuler(), 16, none))).toEqual(endsOf(l));
  });

  it('moves no line end off the middle of its box in a drawing whose boxes begin where a cut would fall', () => {
    const src = ['flowchart LR', 'n0[Index]', 'n2[Ship parcel]', 'n3[Receive order]', 'n4[Approve]', 'n1[Refund]', 'n5[Notify]', 'n4 -->|e0| n5', 'n0 --> n1', 'n4 -->|e2| n5', 'n0 --> n1', 'n2 --> n3', 'n0 -->|e5| n2', 'n0 -->|e6| n2', 'n0 --> n5', 'n5 --> n0', 'n5 --> n0'].join('\n');
    const l = layout(parse(src), pixelRuler());
    expect(offCentreEnds(l)).toEqual([]);
    for (const i of l.edges.keys()) if (l.edges[i]?.label) expect(boxGap(l, i)).toBeGreaterThan(0);
  });

  it('is cleared in a flow whose branches come back across the labelled lines', () => {
    const src = [
      'flowchart TD',
      '  start[Start] --> input[Enter email and password]',
      '  input --> valid{Format valid?}',
      '  valid -- No --> err1[Show format error]',
      '  err1 --> input',
      '  valid -- Yes --> auth{Credentials match?}',
      '  auth -- No --> count{Three failures?}',
      '  count -- No --> err2[Show wrong password]',
      '  err2 --> input',
      '  count -- Yes --> lock[Lock account]',
      '  lock --> mail[Send unlock email]',
      '  mail --> done[End]',
      '  auth -- Yes --> mfa{Two-factor on?}',
      '  mfa -- Yes --> code[Ask for code]',
      '  code --> check{Code correct?}',
      '  check -- No --> err2',
      '  check -- Yes --> home[Open home]',
      '  mfa -- No --> home',
      '  home --> done',
    ].join('\n');
    expect(crossedLabels(layout(parse(src), pixelRuler()))).toBe(0);
  });
});
