import { describe, expect, it } from 'vitest';
import { layout, parse, pixelRuler } from '../src/index.ts';
import type { Layout, LayoutNode, Point } from '../src/index.ts';
import { spreadWins } from '../src/layered/choose.ts';
import { unzoned } from '../src/layered/composition.ts';

const ruler = pixelRuler();

const fan = (dir: 'TD' | 'LR'): string => `flowchart ${dir}\n  a[Start] --> d{Decide}\n  d --> x[Alpha]\n  d --> y[Beta]\n  d --> z[Gamma]`;

const node = (l: Layout, id: string): LayoutNode => {
  const n = l.nodes.find((q) => q.id === id);
  if (!n) throw new Error(`no node ${id}`);
  return n;
};

/** The point of every edge of `d` that lies on `d`, in the order of the edges. */
const endsAt = (l: Layout, id: string): Point[] =>
  l.edges.flatMap((e) => (e.from === id ? [e.points[0] as Point] : e.to === id ? [e.points[e.points.length - 1] as Point] : []));

describe('spread: the boxes one box leads to stand side by side', () => {
  it('top down: the three stand on one level in the order of the text, the diamond over the middle one', () => {
    const l = layout(parse(fan('TD')), ruler);
    const [x, y, z, d] = ['x', 'y', 'z', 'd'].map((id) => node(l, id)) as [LayoutNode, LayoutNode, LayoutNode, LayoutNode];
    expect(y.y).toBe(x.y);
    expect(z.y).toBe(x.y);
    expect(x.x).toBeLessThan(y.x);
    expect(y.x).toBeLessThan(z.x);
    expect(Math.abs(d.x + d.w / 2 - (y.x + y.w / 2))).toBeLessThanOrEqual(1);
  });

  it('top down: the four lines at the diamond use four different corners and no port is shared', () => {
    const l = layout(parse(fan('TD')), ruler);
    const ends = endsAt(l, 'd').map((p) => `${p.x},${p.y}`);
    expect(new Set(ends).size).toBe(4);
    expect(l.diagnostics.filter((q) => q.kind === 'shared-port')).toEqual([]);
  });

  it('left to right: the three stand in one column, from top to bottom in the order of the text', () => {
    const l = layout(parse(fan('LR')), ruler);
    const [x, y, z, d] = ['x', 'y', 'z', 'd'].map((id) => node(l, id)) as [LayoutNode, LayoutNode, LayoutNode, LayoutNode];
    expect(y.x).toBe(x.x);
    expect(z.x).toBe(x.x);
    expect(x.y).toBeLessThan(y.y);
    expect(y.y).toBeLessThan(z.y);
    expect(Math.abs(d.y + d.h / 2 - (y.y + y.h / 2))).toBeLessThanOrEqual(1);
    expect(l.diagnostics.filter((q) => q.kind === 'shared-port')).toEqual([]);
  });

  it('keeps the one unnamed zone of the graph', () => {
    const l = layout(parse(fan('TD')), ruler);
    expect(l.lanes.map((q) => q.label)).toEqual(['']);
    expect(l.nodes.every((n) => n.lane === l.lanes[0]?.id)).toBe(true);
  });

  it('is not made for a drawing with a zone', () => {
    const src = 'swimlane-beta TD\n  subgraph s[Zone]\n    a[Start] --> d{Decide}\n    d --> x[Alpha]\n    d --> y[Beta]\n    d --> z[Gamma]\n  end';
    expect(unzoned(parse(src))).toBe(false);
    expect(unzoned(parse(fan('TD')))).toBe(true);
    expect(layout(parse(src), ruler).composition).toBe('lanes');
  });
});

describe('spreadWins', () => {
  const drawing = (o: { bends?: number; crossings?: number; shared?: number; width?: number; height?: number }): Layout => {
    const pts = (n: number): Point[] => Array.from({ length: n + 2 }, (_, i) => ({ x: i, y: i }));
    const diag = (kind: 'crossing' | 'shared-port', n: number): Layout['diagnostics'] => Array.from({ length: n }, () => ({ kind, nodes: [], message: '' }));
    return {
      pitch: 16,
      width: o.width ?? 400,
      height: o.height ?? 400,
      direction: 'TD',
      laneAxis: 'across',
      lanes: [],
      nodes: [],
      edges: [{ from: 'a', to: 'b', style: 'normal', points: pts(o.bends ?? 0) }],
      diagnostics: [...diag('crossing', o.crossings ?? 0), ...diag('shared-port', o.shared ?? 0)],
    };
  };
  const usual = drawing({ bends: 4, crossings: 2, shared: 1 });
  const room = { width: 500, height: 500 };

  it('wins when nothing is worse and one count is smaller', () => {
    expect(spreadWins(drawing({ bends: 4, crossings: 1, shared: 1 }), usual, room)).toBe(true);
  });

  it('loses with more bends', () => {
    expect(spreadWins(drawing({ bends: 5, crossings: 0, shared: 0 }), usual, room)).toBe(false);
  });

  it('loses with more crossings', () => {
    expect(spreadWins(drawing({ bends: 0, crossings: 3, shared: 0 }), usual, room)).toBe(false);
  });

  it('loses with more shared ports', () => {
    expect(spreadWins(drawing({ bends: 0, crossings: 0, shared: 2 }), usual, room)).toBe(false);
  });

  it('loses when all three counts are equal', () => {
    expect(spreadWins(drawing({ bends: 4, crossings: 2, shared: 1 }), usual, room)).toBe(false);
  });

  it('loses when it is wider or taller than the room', () => {
    expect(spreadWins(drawing({ bends: 0, width: 501 }), usual, room)).toBe(false);
    expect(spreadWins(drawing({ bends: 0, height: 501 }), usual, room)).toBe(false);
  });

  it('may be as large as a usual drawing that is already over the room, not larger', () => {
    const over = drawing({ bends: 4, crossings: 2, shared: 1, width: 600 });
    expect(spreadWins(drawing({ bends: 0, width: 600 }), over, room)).toBe(true);
    expect(spreadWins(drawing({ bends: 0, width: 601 }), over, room)).toBe(false);
  });
});
