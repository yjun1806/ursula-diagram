import { describe, expect, it } from 'vitest';
import { cellRuler, layout, layoutLayered, parse, pixelRuler, renderTextLayout, selectFrontEnd } from '../src/index.ts';
import type { Layout, LayoutEdge, Point, Ruler } from '../src/index.ts';
import { violations } from '../src/layered/choose.ts';
import { assignTracks } from '../src/layered/route.ts';
import { costsMore, textCost } from '../src/layout/text-cost.ts';
import type { TextCost } from '../src/layout/text-cost.ts';
import { parseUsecase } from '../src/usecase/parse.ts';
import { geometryViolations } from './helpers.ts';

/** Drawn with the lanes as columns, so that the lines between two lanes end on the sides of the boxes, and with shared ports whatever they cost. */
const drawn = (src: string, mode: 'svg' | 'text' = 'text'): Layout => layout(parse(src), mode === 'text' ? cellRuler() : pixelRuler(), { composition: 'stages', sharePorts: true });

const text = (src: string): string[] => renderTextLayout(drawn(src));

const edge = (l: Layout, from: string, to: string): LayoutEdge => l.edges.find((e) => e.from === from && e.to === to) as LayoutEdge;
const start = (e: LayoutEdge): Point => e.points[0] as Point;
const end = (e: LayoutEdge): Point => e.points[e.points.length - 1] as Point;
const height = (l: Layout, id: string): number => l.nodes.find((n) => n.id === id)?.h ?? 0;

const lanes = (edges: string): string => `swimlane-beta LR
  subgraph one[One]
    a[Alpha]
  end
  subgraph two[Two]
    b[Beta]
    c[Gamma]
    d[Delta]
  end
${edges}`;

describe('lines without a label on the side of a terminal box', () => {
  it('leave one line of the side together and split outside the box', () => {
    const l = drawn(lanes('  a --> b\n  a --> c\n  a --> d'));
    const out = ['b', 'c', 'd'].map((id) => edge(l, 'a', id));
    expect(new Set(out.map((e) => `${start(e).x},${start(e).y}`)).size).toBe(1);
    expect(new Set(out.map((e) => e.sharedPort?.id)).size).toBe(1);
    expect(out[0]?.sharedPort).toBeDefined();
    expect(height(l, 'a')).toBe(3);
    expect(geometryViolations(l)).toEqual([]);
    expect(violations(l)).toBe(0);
  });

  it('arrive on one line of the side together', () => {
    const l = drawn(lanes('  b --> a\n  c --> a\n  d --> a'));
    const into = ['b', 'c', 'd'].map((id) => edge(l, id, 'a'));
    expect(new Set(into.map((e) => `${end(e).x},${end(e).y}`)).size).toBe(1);
    expect(height(l, 'a')).toBe(3);
    expect(geometryViolations(l)).toEqual([]);
  });

  it('leave a box that stands level with one of its two partners, so that one of the two lines is straight', () => {
    const l = drawn(lanes('  a --> b\n  a --> d'));
    expect(edge(l, 'a', 'b').points).toHaveLength(2);
    expect(edge(l, 'a', 'd').points).toHaveLength(4);
    expect(text(lanes('  a --> b\n  a --> d')).some((line) => /│ Alpha │─┬▶│ Beta  │/.test(line))).toBe(true);
  });

  it('put the two lines of a port that part opposite ways there on one track', () => {
    const fork = [
      { order: 0, lo: 2, hi: 6, top: [6], bot: [2], pair: 0 },
      { order: 1, lo: 6, hi: 10, top: [6], bot: [10], pair: 0 },
    ];
    const [first, second] = assignTracks(fork);
    expect(first).toBe(second);
    const strangers = assignTracks(fork.map(({ pair: _pair, ...item }) => item));
    expect(strangers[0]).not.toBe(strangers[1]);
  });

  it('keep a line with a label on a line of its own', () => {
    const l = drawn(lanes('  a --> b\n  a -->|maybe| c\n  a --> d'));
    const [plain, labelled, other] = ['b', 'c', 'd'].map((id) => edge(l, 'a', id)) as [LayoutEdge, LayoutEdge, LayoutEdge];
    expect(labelled.sharedPort).toBeUndefined();
    expect(start(labelled).y).not.toBe(start(plain).y);
    expect(start(labelled).y).not.toBe(start(other).y);
    expect(geometryViolations(l)).toEqual([]);
  });

  it('never join a line that leaves with one that arrives', () => {
    const l = drawn(lanes('  a --> b\n  c --> a'));
    expect(start(edge(l, 'a', 'b')).y).not.toBe(end(edge(l, 'c', 'a')).y);
    expect(l.edges.every((e) => e.sharedPort === undefined)).toBe(true);
  });

  it('never join lines without a mark, lines with a mark at both ends, or lines of different styles', () => {
    for (const edges of ['  a --- b\n  a --- c', '  a <--> b\n  a <--> c', '  a --> b\n  a ==> c', '  a --> b\n  a -.-> c']) {
      const l = drawn(lanes(edges));
      expect(l.edges.every((e) => e.sharedPort === undefined)).toBe(true);
      expect(start(edge(l, 'a', 'b')).y).not.toBe(start(edge(l, 'a', 'c')).y);
    }
  });

  it('join a line at one of its ends only, so that every branch leads to one box', () => {
    const l = drawn(lanes('  a --> b\n  a --> c\n  a --> d\n  e[Epsilon] --> d'));
    const shared = edge(l, 'a', 'd');
    const lone = edge(l, 'e', 'd');
    expect(shared.sharedPort).toBeDefined();
    expect(lone.sharedPort).toBeUndefined();
    expect(end(lone).y).not.toBe(end(shared).y);
    expect(geometryViolations(l)).toEqual([]);
  });

  it('leave two lines between the same two boxes on lines of their own', () => {
    const l = drawn(lanes('  a --> b\n  a --> b\n  a --> c'));
    const twins = l.edges.filter((e) => e.from === 'a' && e.to === 'b');
    expect(twins).toHaveLength(2);
    expect(twins.every((e) => e.sharedPort === undefined)).toBe(true);
    expect(geometryViolations(l)).toEqual([]);
  });

  it('leave a pixel drawing as it was', () => {
    const l = drawn(lanes('  a --> b\n  a --> c\n  a --> d'), 'svg');
    expect(l.edges.every((e) => e.sharedPort === undefined)).toBe(true);
    expect(new Set(['b', 'c', 'd'].map((id) => `${start(edge(l, 'a', id)).x},${start(edge(l, 'a', id)).y}`)).size).toBe(3);
  });
});

/** Either drawing, and the one that is taken when nothing is asked for. The drawing by ranks is left out: it has no ports on the sides of its boxes. */
const both = (src: string, maxWidth = 80): { shared: Layout; own: Layout; taken: Layout } => ({
  shared: layout(parse(src), cellRuler(), { maxWidth, sharePorts: true, ranked: false }),
  own: layout(parse(src), cellRuler(), { maxWidth, sharePorts: false, ranked: false }),
  taken: layout(parse(src), cellRuler(), { maxWidth, ranked: false }),
});

/** One of two lines into a box is straight either way: with a shared port the box is shorter and nothing else changes. */
const KEPT = 'flowchart TD\n  a[Alpha]\n  b[Beta]\n  c[Gamma]\n  d[Delta]\n  a --> c\n  b --> c\n  c --> d\n  b --> d';

const shares = (l: Layout): boolean => l.edges.some((e) => e.sharedPort !== undefined);

describe('a terminal drawing with shared ports against the one without', () => {
  it('is taken when it costs no more in any respect and less in one', () => {
    const { shared, own, taken } = both(KEPT);
    expect(costsMore(textCost(shared), textCost(own))).toBe(false);
    expect(textCost(shared).blank).toBeLessThan(textCost(own).blank);
    expect(taken).toEqual(shared);
    expect(shares(taken)).toBe(true);
  });

  it('is not taken when its lines bend more, though its boxes are shorter', () => {
    const { shared, own, taken } = both('flowchart TD\n  a[Alpha]\n  b[Beta]\n  c[Gamma]\n  d[Delta]\n  c --> d\n  a --> d\n  b --> d');
    expect(textCost(shared).bends).toBeGreaterThan(textCost(own).bends);
    expect(textCost(shared).blank).toBeLessThan(textCost(own).blank);
    // The drawing taken may be spaced for arrowheads side by side (see `layout`); its lines share no port, as in the one without.
    expect(shares(taken)).toBe(false);
    expect(arrangement(taken)).toEqual(arrangement(own));
    expect(shares(taken)).toBe(false);
  });

  it('is not taken when it is wider', () => {
    const { shared, own, taken } = both('flowchart TD\n  a[Alpha]\n  b[Beta]\n  c[Gamma]\n  d[Delta]\n  e[Eps]\n  f[Zeta]\n  g[Eta]\n  b --> g\n  g --> e\n  b --> f\n  d --> g\n  c --> g\n  b --> e');
    expect(shares(shared)).toBe(true);
    expect(textCost(shared).width).toBeGreaterThan(textCost(own).width);
    // The drawing taken may be spaced for arrowheads side by side (see `layout`); its lines share no port, as in the one without.
    expect(shares(taken)).toBe(false);
    expect(arrangement(taken)).toEqual(arrangement(own));
  });

  it('is not taken when the two cost the same', () => {
    const src = 'flowchart TD\n  n0[Alpha]\n  n1[Beta]\n  n2[Gamma]\n  n3[Delta]\n  n4[Eps]\n  n5[Zeta]\n  n6[Eta]\n  n7[Theta]\n  n8[Iota]\n  n1 --> n7\n  n2 --> n3\n  n0 --> n4\n  n3 --> n5\n  n0 --> n2\n  n7 --> n3\n  n4 --> n5\n  n2 --> n5\n  n2 --> n8\n  n4 --> n7';
    const { shared, own, taken } = both(src);
    expect(shares(shared)).toBe(true);
    expect(textCost(shared)).toEqual(textCost(own));
    // The drawing taken may be spaced for arrowheads side by side (see `layout`); its lines share no port, as in the one without.
    expect(shares(taken)).toBe(false);
    expect(arrangement(taken)).toEqual(arrangement(own));
  });

  it('is not taken for a drawing that is too wide without shared ports, whatever it costs', () => {
    const { shared, own, taken } = both(KEPT, 20);
    expect(own.width).toBeGreaterThan(20);
    expect(costsMore(textCost(shared), textCost(own))).toBe(false);
    expect(costsMore(textCost(own), textCost(shared))).toBe(true);
    // The drawing taken may be spaced for arrowheads side by side (see `layout`); its lines share no port, as in the one without.
    expect(shares(taken)).toBe(false);
    expect(arrangement(taken)).toEqual(arrangement(own));
  });

  it('is not taken for a quick drawing, on which a caller chooses a setting', () => {
    const quick = layout(parse(KEPT), cellRuler(), { maxWidth: 80, quick: true });
    expect(shares(quick)).toBe(false);
    expect(quick).toEqual(layout(parse(KEPT), cellRuler(), { maxWidth: 80, quick: true, sharePorts: false }));
    expect(shares(layout(parse(KEPT), cellRuler(), { maxWidth: 80, ranked: false }))).toBe(true);
  });

  it('is what the text of a diagram is drawn from only when it is taken', () => {
    const kept = KEPT;
    const left = 'flowchart TD\n  a[Alpha]\n  b[Beta]\n  c[Gamma]\n  d[Delta]\n  c --> d\n  a --> d\n  b --> d';
    const laid = (src: string): Layout => selectFrontEnd(src).json(src, 'text', { maxWidth: 80 }) as Layout;
    for (const src of [kept, left]) expect(laid(src)).toEqual(layout(parse(src), cellRuler(), { maxWidth: 80 }));
  });

  // Use cases inside boundaries whose columns fill the width to within two cells: [source, width].
  const BOUNDED: ReadonlyArray<readonly [string, number]> = [
    ['actor A0\nactor A1\nsystemBoundary B0\n  U0("Retry")\n  U2("Publish event")\n  U3("Close")\nend\nsystemBoundary B1\n  U1("Store")\n  U4("Review")\nend\nA1 --> U2\nA0 --> U0\nA1 --> U0\nA0 --> U2\nA1 --> U3\nA0 --> U1', 80],
    ['actor A0\nsystemBoundary B0\n  U4("Deploy")\nend\nsystemBoundary B1\n  U0("Bill")\n  U1("Scan")\n  U2("Merge results")\n  U3("Tag")\n  U5("Open")\nend\nA0 --> U1\nA0 --> U0\nA0 --> U4\nA0 --> U2\nA0 --> U3', 80],
    ['actor A0\nactor A1\nsystemBoundary B0\n  U1("Dispatch job")\nend\nsystemBoundary B1\n  U0("Queue")\n  U2("Retry")\n  U3("Store")\n  U4("Publish event")\n  U5("Close")\nend\nA0 --> U3\nA1 --> U3\nA1 --> U2\nA0 --> U4\nA1 --> U4\nA0 --> U5', 80],
    ['actor A0\nsystemBoundary B0\n  U1("Store")\n  U2("Publish event")\n  U4("Review")\nend\nsystemBoundary B1\n  U0("Retry")\n  U3("Close")\nend\nA0 --> U4\nA0 --> U3\nA0 --> U0\nA0 --> U2', 80],
    ['actor A0\nactor A1\nactor A2\nsystemBoundary B0\n  U0("Dispatch job")\n  U1("Retry")\n  U4("Close")\n  U5("Review")\nend\nsystemBoundary B1\n  U2("Store")\n  U3("Publish event")\n  U6("Bill")\nend\nA2 --> U1\nA0 --> U4\nA2 --> U4\nA2 --> U2\nA1 --> U5\nA0 --> U6\nA2 --> U5', 100],
    ['actor A0\nactor A1\nsystemBoundary B0\n  U0("Retry")\n  U1("Store")\n  U2("Publish event")\n  U3("Close")\n  U4("Review")\n  U5("Bill")\n  U6("Scan")\nend\nA0 --> U4\nA1 --> U2\nA0 --> U2\nA1 --> U5\nA0 --> U6\nA1 --> U4', 60],
  ];
  const bounded = (body: string, maxWidth: number, sharePorts?: boolean): Layout =>
    layout(parseUsecase(`usecase-beta\ndirection LR\n${body}`).graph, cellRuler(), { maxWidth, fold: true, legend: false, ...(sharePorts === undefined ? {} : { sharePorts }) });
  const arrangement = (l: Layout): unknown[] => [l.composition, l.laneAxis, l.lanes.map((lane) => lane.id)];

  // The two drawings are compared before their rows are opened, and stacked bands are owed more rows than columns of them.
  const compared = (l: Layout): TextCost => ({ ...textCost(l), rows: 0 });

  it.each(BOUNDED)('is not taken when no line shares a port in it, though it costs less arranged another way (%#)', (body, width) => {
    const [shared, own, taken] = [bounded(body, width, true), bounded(body, width, false), bounded(body, width)];
    // Shared ports made the columns too wide on the way, so the boundaries were stacked as bands instead.
    expect(shares(shared)).toBe(false);
    expect(arrangement(shared)).not.toEqual(arrangement(own));
    expect(costsMore(compared(shared), compared(own))).toBe(false);
    expect(costsMore(compared(own), compared(shared))).toBe(true);
    // The drawing taken may be spaced for arrowheads side by side (see `layout`); its lines share no port, as in the one without.
    expect(shares(taken)).toBe(false);
    expect(arrangement(taken)).toEqual(arrangement(own));
    expect(own.composition).toBe('stages');
  });

  it('is not taken when its lines share a port and its bands are arranged another way', () => {
    const body = 'actor A0\nactor A1\nsystemBoundary B0\n  U0("Dispatch job")\n  U1("Retry")\n  U2("Store")\n  U3("Publish event")\nend\nA1 --> U2\nA0 --> U2\nA1 --> U1\nA0 --> U1\nA1 --> U3';
    const [shared, own, taken] = [bounded(body, 60, true), bounded(body, 60, false), bounded(body, 60)];
    expect(shares(shared)).toBe(true);
    expect(arrangement(shared)).not.toEqual(arrangement(own));
    // The drawing taken may be spaced for arrowheads side by side (see `layout`); its lines share no port, as in the one without.
    expect(shares(taken)).toBe(false);
    expect(arrangement(taken)).toEqual(arrangement(own));
  });
});

describe('the cost of a terminal drawing', () => {
  const node = (id: string, x: number, y: number): Layout['nodes'][number] => ({ id, lane: '', title: id, lines: [], shape: 'rect', rank: 0, span: 1, row: 0, x, y, w: 5, h: 3 }) as Layout['nodes'][number];
  const base = (edges: LayoutEdge[], nodes = [node('a', 0, 0), node('b', 20, 0), node('c', 20, 10)]): Layout => ({ width: 30, height: 14, nodes, lanes: [], edges, diagnostics: [] }) as unknown as Layout;
  const line = (from: string, to: string, points: Array<[number, number]>, more: Partial<LayoutEdge> = {}): LayoutEdge => ({ from, to, style: 'normal', points: points.map(([x, y]) => ({ x, y })), ...more });

  it('counts the corners of lines, their crossings, and a corner that stands on another line', () => {
    const level = line('a', 'b', [[5, 1.5], [20, 1.5]]);
    const bent = line('a', 'c', [[5, 2.5], [10, 2.5], [10, 11.5], [20, 11.5]]);
    const across = line('b', 'c', [[8, 0], [8, 13]]);
    expect(textCost(base([level, bent])).bends).toBe(2);
    expect(textCost(base([level, bent])).crossings).toBe(0);
    expect(textCost(base([level, bent, across])).crossings).toBe(2);
    const onto = line('a', 'c', [[5, 2.5], [10, 2.5], [10, 1.5], [12, 1.5]]);
    expect(textCost(base([level, line('a', 'c', [[5, 2.5], [10, 2.5], [10, 11.5], [20, 11.5]]), onto])).touches).toBeGreaterThan(0);
  });

  it('counts a cut label, a label with less room than its text, and the rows of a box without text', () => {
    const label = (text: string, w: number): Partial<LayoutEdge> => ({ label: { text, x: 8, y: 1, w, h: 1 } });
    const cost = (more: Partial<LayoutEdge>): number => textCost(base([line('a', 'b', [[5, 1.5], [20, 1.5]], more)])).cut;
    expect(cost(label(' yes ', 5))).toBe(0);
    expect(cost(label(' y… ', 4))).toBe(1);
    expect(cost(label('yes', 2))).toBe(1);
    expect(textCost(base([], [{ ...node('a', 0, 0), h: 7 }])).blank).toBe(4);
    expect(textCost(base([], [node('a', 0, 0)])).blank).toBe(0);
  });
});

describe('where the lines that share a port are decided and marked', () => {
  const src = lanes('  a --> b\n  a --> c\n  a --> d');
  const ports = (l: Layout): number => new Set(['b', 'c', 'd'].map((id) => start(edge(l, 'a', id)).y)).size;

  it('is the placement alone: the box is as tall as its ports need, with shared ports and without', () => {
    const shared = layoutLayered(parse(src), cellRuler(), { composition: 'stages', sharePorts: true });
    const own = layoutLayered(parse(src), cellRuler(), { composition: 'stages' });
    expect([ports(shared), height(shared, 'a')]).toEqual([1, 3]);
    expect([ports(own), height(own, 'a')]).toEqual([3, 7]);
    expect(shares(own)).toBe(false);
  });

  it('is an option of the layout, not a field of the ruler', () => {
    const marked = { ...cellRuler(), ownPorts: true } as Ruler;
    expect(shares(layout(parse(src), marked, { composition: 'stages', sharePorts: true }))).toBe(true);
    expect(shares(layout(parse(src), cellRuler(), { composition: 'stages', sharePorts: false }))).toBe(false);
  });

  it('marks them with the shared port and the end they share it at, and never as a trunk', () => {
    const out = drawn(src);
    const into = drawn(lanes('  b --> a\n  c --> a\n  d --> a'));
    expect(out.edges.map((e) => e.sharedPort?.at)).toEqual(['start', 'start', 'start']);
    expect(into.edges.map((e) => e.sharedPort?.at)).toEqual(['end', 'end', 'end']);
    expect([...out.edges, ...into.edges].every((e) => e.trunk === undefined)).toBe(true);
  });
});

describe('lines that share a port, as the score of a drawing sees them', () => {
  const l = drawn(lanes('  a --> b\n  a --> d'));
  const [up, down] = [edge(l, 'a', 'b'), edge(l, 'a', 'd')];
  /** The line that bends, with its first corner and the one after it. */
  const [, corner, next] = down.points as [Point, Point, Point];
  const withEdges = (edges: LayoutEdge[]): Layout => ({ ...l, edges });

  it('may run along one another from the port to where they split', () => {
    expect(start(up)).toEqual(start(down));
    expect(violations(l)).toBe(0);
    expect(geometryViolations(l)).toEqual([]);
  });

  it('may not without the mark, or with the marks of two different ports', () => {
    const bare = ({ sharedPort: _gone, ...e }: LayoutEdge): LayoutEdge => e;
    expect(violations(withEdges([bare(up), bare(down)]))).toBeGreaterThan(0);
    expect(violations(withEdges([up, { ...down, sharedPort: { id: 'other', at: 'start' } }]))).toBeGreaterThan(0);
  });

  it('may not run along one another anywhere else', () => {
    // The straight line follows the other one round its corner: the stretch after the corner is shared too.
    const along: LayoutEdge = { ...up, points: [start(up), corner, { x: corner.x, y: (corner.y + next.y) / 2 }] };
    expect(violations(withEdges([down, along]))).toBeGreaterThan(violations(l));
    expect(geometryViolations(withEdges([down, along])).some((v) => v.includes('share a segment'))).toBe(true);
    expect(geometryViolations(l).some((v) => v.includes('share a segment'))).toBe(false);
  });

  it('may not where a later stretch of one of them comes back through the port', () => {
    // The line leaves the port downwards, goes round and comes back along the straight line: only its first stretch starts at the port.
    const p = start(up);
    const back: LayoutEdge = { ...down, points: [p, { x: p.x, y: p.y + 2 }, { x: p.x - 2, y: p.y + 2 }, { x: p.x - 2, y: p.y }, end(up)] };
    expect(violations(withEdges([up, back]))).toBeGreaterThan(0);
    expect(geometryViolations(withEdges([up, back])).some((v) => v.includes('share a segment'))).toBe(true);
  });

  it('may not when the mark names the other end of a line', () => {
    expect(violations(withEdges([up, { ...down, sharedPort: { id: down.sharedPort?.id ?? '', at: 'end' } }]))).toBeGreaterThan(0);
  });
});
