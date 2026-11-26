import { describe, expect, it } from 'vitest';
import { cellRuler, layout as layoutEngine, parse, pixelRuler, renderText } from '../src/index.ts';
import type { Ruler } from '../src/metrics.ts';
import type { Layout, LayoutNode } from '../src/index.ts';
import { crossingCount } from '../src/layout/check.ts';
import { measureNodes } from '../src/layout/place.ts';
import { fractionPorts, latticePorts, portStep } from '../src/layout/ports.ts';
import { solve } from '../src/layout/solve.ts';
import * as fx from './fixtures.ts';
import { geometryViolations } from './helpers.ts';

/** These tests exercise the slot-based placer and router. */
const layout = (graph: Parameters<typeof layoutEngine>[0], ruler: Parameters<typeof layoutEngine>[1], opts: Parameters<typeof layoutEngine>[2] = {}): ReturnType<typeof layoutEngine> => layoutEngine(graph, ruler, { engine: 'grid', ...opts });


const node = (l: Layout, id: string): LayoutNode => {
  const n = l.nodes.find((x) => x.id === id);
  if (!n) throw new Error(`no node ${id}`);
  return n;
};

const on = (v: number, step: number): boolean => Math.abs(v / step - Math.round(v / step)) < 1e-6;

/** Two lanes of one box each, drawn with the given slot units. */
const placed = (src: string, rank: Record<string, number>, row: Record<string, number> = {}, span: Record<string, number> = {}): Layout =>
  solve(
    parse(src),
    pixelRuler(),
    new Map(Object.entries(rank)),
    new Map(Object.keys(rank).map((id) => [id, row[id] ?? 0] as const)),
    {},
    new Map(Object.entries(span)),
  );

const lanes2 = 'swimlane-beta LR\nsubgraph a[Top]\nP[Receive order]\nQ[Check stock]\nend\nsubgraph b[Bottom]\nM[Pack items]\nend\nP --> M\nQ --> M';

describe('slot units', () => {
  it('draws a cross-lane edge between boxes whose unit ranges overlap as one straight segment', () => {
    const l = placed('swimlane-beta LR\nsubgraph a[Top]\nX[Receive order]\nend\nsubgraph b[Bottom]\nY[Check stock]\nend\nX --> Y', { X: 0, Y: 1 });
    const [x, y, e] = [node(l, 'X'), node(l, 'Y'), l.edges[0]];
    expect(e?.points).toHaveLength(2);
    expect(e?.points[0]?.x).toBe(e?.points[1]?.x);
    expect(e?.points[0]?.x ?? 0).toBeGreaterThan(y.x);
    expect(e?.points[0]?.x ?? 0).toBeLessThan(x.x + x.w);
  });

  it('puts a box that has two partners on the neighbouring columns half a step off, with both edges straight', () => {
    const l = layout(parse(lanes2), pixelRuler());
    expect(node(l, 'M').rank % 2).toBe(1);
    expect(l.edges.every((e) => e.points.length === 2)).toBe(true);
  });

  it('keeps every box on an even unit when no box needs the half step', () => {
    for (const src of ['flowchart LR\nA --> B --> C --> D', 'swimlane-beta LR\nsubgraph a[T]\na1 --> a2\nend\nsubgraph b[B]\nb1 --> b2\nend\na1 --> b1\na2 --> b2']) {
      expect(layout(parse(src), pixelRuler()).nodes.map((n) => n.rank % 2)).toEqual(new Array(layout(parse(src), pixelRuler()).nodes.length).fill(0));
    }
  });

  it('gives connected boxes of the same column identical attachment coordinates and a one-segment edge', () => {
    const l = layout(parse('swimlane-beta LR\nsubgraph a[Top]\nu1 --> u2\nend\nsubgraph b[Bottom]\nd1 --> d2\nend\nu1 --> d1\nu2 --> d2'), pixelRuler());
    for (const [from, to] of [['u1', 'd1'], ['u2', 'd2']] as const) {
      const e = l.edges.find((x) => x.from === from && x.to === to);
      expect(e?.points).toHaveLength(2);
      expect(e?.points[0]?.x).toBe(e?.points[1]?.x);
      expect(e?.points[0]?.x).toBe(node(l, from).x + node(l, from).w / 2);
      expect(node(l, from).x).toBe(node(l, to).x);
      expect(node(l, from).w).toBe(node(l, to).w);
    }
  });

  it('spaces the boxes of a chain with equal gaps', () => {
    for (const max of [Infinity, 1280, 900]) {
      const l = layout(parse('flowchart LR\nA --> B --> C --> D --> E'), pixelRuler(), { maxWidth: max });
      expect(new Set(gapsOf(l)).size).toBe(1);
    }
  });
});

const gapsOf = (l: Layout): number[] => {
  const sorted = [...l.nodes].sort((p, q) => p.x - q.x);
  return sorted.slice(1).map((n, i) => n.x - ((sorted[i]?.x ?? 0) + (sorted[i]?.w ?? 0)));
};

describe('justify', () => {
  const chain = 'flowchart LR\nA[Receive order] --> B[Check stock] --> C[Pack items] --> D[Ship parcel]';
  it('spreads the leftover width evenly until the canvas edge is within one step, or the gap is capped', () => {
    const ruler = pixelRuler();
    const step = 2 * ruler.nodeGrid;
    for (const max of [900, 1000, 1280]) {
      const l = layout(parse(chain), ruler, { maxWidth: max });
      const gaps = new Set(gapsOf(l));
      expect(l.width).toBeLessThanOrEqual(max);
      expect(gaps.size).toBe(1);
      const gap = [...gaps][0] ?? 0;
      expect(gap).toBeLessThanOrEqual(2 * ruler.rankGap);
      const boxes = l.nodes.length;
      const capped = gap + step > 2 * ruler.rankGap || gap + step > (l.nodes[0]?.w ?? 0) - 2 * ruler.nodeGrid;
      if (!capped) expect(max - l.width).toBeLessThan((boxes - 1) * step);
    }
  });

  it('leaves a drawing without a known canvas at its natural width', () => {
    const natural = layout(parse(chain), pixelRuler(), { maxWidth: Infinity });
    expect(new Set(gapsOf(natural))).toEqual(new Set([pixelRuler().rankGap]));
  });
});

describe('grids', () => {
  const variants: Array<[number, number, Partial<Ruler>]> = [
    [8, 1, {}],
    [12, 2, { lanePad: 36, laneGap: 12 }],
    [16, 2, {}],
    [16, 4, {}],
    [24, 1, { lanePad: 48, laneGap: 24, rowGap: 48 }],
  ];
  for (const [nodeGrid, edgeGrid, over] of variants) {
    it(`keeps boxes on nodeGrid ${nodeGrid} and track coordinates on edgeGrid ${edgeGrid}`, () => {
      const ruler: Ruler = { ...pixelRuler(), nodeGrid, edgeGrid, ...over };
      for (const src of [fx.library, fx.twoLanes]) {
        const l = layout(parse(src), ruler);
        for (const n of l.nodes) for (const v of [n.x, n.y, n.w, n.h]) expect(on(v, nodeGrid)).toBe(true);
        for (const lane of l.lanes) for (const v of [lane.x, lane.y, lane.w, lane.h]) expect(on(v, nodeGrid)).toBe(true);
        for (const e of l.edges) {
          const first = e.points[0];
          const last = e.points[e.points.length - 1];
          const ports = new Set([first?.x, first?.y, last?.x, last?.y]);
          for (const p of e.points.slice(1, -1)) for (const v of [p.x, p.y]) expect(ports.has(v) || on(v, edgeGrid)).toBe(true);
        }
        expect(geometryViolations(l)).toEqual([]);
      }
    });
  }
});

describe('text ruler', () => {
  it('draws at width 120 with the box borders on the cell grid', () => {
    const r = renderText(fx.library, 120);
    expect('error' in r).toBe(false);
    const l = layout(parse(fx.library), cellRuler(), { maxWidth: 120 });
    // A terminal drawing is laid out on whole cells.
    for (const n of l.nodes) for (const v of [n.x, n.y, n.w, n.h]) expect(on(v, 1)).toBe(true);
  });
});

describe('ports', () => {
  const ruler = pixelRuler();

  it('attaches a single edge at the middle of both sides', () => {
    const l = layout(parse('flowchart LR\nA --> B'), ruler);
    const [a, b, e] = [node(l, 'A'), node(l, 'B'), l.edges[0]];
    expect(e?.points[0]).toEqual({ x: a.x + a.w, y: a.y + a.h / 2 });
    expect(e?.points[1]).toEqual({ x: b.x, y: b.y + b.h / 2 });
  });

  it('lets a half-step pair meet at a port both boxes have, as one segment', () => {
    const l = placed('swimlane-beta LR\nsubgraph a[Top]\nX[Receive order]\nend\nsubgraph b[Bottom]\nY[Check stock]\nend\nX --> Y', { X: 0, Y: 1 });
    const [x, y, e] = [node(l, 'X'), node(l, 'Y'), l.edges[0]];
    const at = e?.points[0]?.x ?? 0;
    const graph = parse('swimlane-beta LR\nsubgraph a[Top]\nX[Receive order]\nend\nsubgraph b[Bottom]\nY[Check stock]\nend\nX --> Y');
    const pitch = portStep(measureNodes(graph.nodes, graph.lanes, ruler, false).unit, ruler);
    expect(e?.points).toHaveLength(2);
    expect(on(at - x.x - x.w / 2, pitch)).toBe(true);
    expect(on(at - y.x - y.w / 2, pitch)).toBe(true);
  });

  const hub = (targets: number): Layout => {
    const names = Array.from({ length: targets }, (_, i) => `T${i + 1}`);
    const src = `swimlane-beta LR\nsubgraph a[Top]\nH\nend\nsubgraph b[Bottom]\n${names.join('\n')}\nend\n${names.map((t) => `H --> ${t}`).join('\n')}`;
    const rank: Record<string, number> = { H: 0 };
    const row: Record<string, number> = {};
    names.forEach((t, i) => {
      rank[t] = 2 * (i + 1);
      row[t] = 0;
    });
    return placed(src, rank, row);
  };

  it('puts 2 routed edges on one side on ports symmetric about the centre without crossings', () => {
    const l = hub(2);
    const h = node(l, 'H');
    const ys = l.edges.map((e) => (e.points[0]?.y ?? 0) - h.y).sort((p, q) => p - q);
    expect(new Set(ys).size).toBe(2);
    expect((ys[0] ?? 0) + (ys[1] ?? 0)).toBeCloseTo(h.h, 6);
    expect(crossingCount(l.edges)).toBe(0);
  });

  it('puts 3 straight edges on one side on distinct ports symmetric about the centre', () => {
    const l = placed(
      'swimlane-beta LR\nsubgraph a[Top]\nH[A hub that covers three columns]\nend\nsubgraph b[Bottom]\nT1[First]\nT2[Second]\nT3[Third]\nend\nH --> T1\nH --> T2\nH --> T3',
      { H: 0, T1: 0, T2: 2, T3: 4 },
      {},
      { H: 6 },
    );
    const h = node(l, 'H');
    const xs = l.edges.map((e) => (e.points[0]?.x ?? 0) - h.x).sort((p, q) => p - q);
    expect(l.edges.every((e) => e.points.length === 2)).toBe(true);
    expect(new Set(xs).size).toBe(3);
    expect((xs[0] ?? 0) + (xs[2] ?? 0)).toBeCloseTo(h.w, 6);
    expect(xs[1]).toBeCloseTo(h.w / 2, 6);
    expect(crossingCount(l.edges)).toBe(0);
  });

  it('adds ports as a box covers more units', () => {
    const pitch = portStep(96, ruler);
    expect(latticePorts(144, pitch)).toHaveLength(5);
    expect(latticePorts(144 + 192, pitch).length).toBeGreaterThan(latticePorts(144, pitch).length);
    expect(latticePorts(144, pitch)).toEqual([24, 48, 72, 96, 120]);
    expect(fractionPorts(80, 3)).toEqual([20, 40, 60]);
  });

  for (const [nodeGrid, portPitch] of [[16, 24], [16, 16], [24, 24], [8, 12]] as const) {
    it(`ends every edge on a port of its box with nodeGrid ${nodeGrid} and portPitch ${portPitch}`, () => {
      const r: Ruler = { ...ruler, nodeGrid, portPitch, lanePad: 48, laneGap: 24, rowGap: 48 };
      const l = layout(parse(fx.library), r, { maxWidth: Infinity });
      const unit = measureNodes(parse(fx.library).nodes, parse(fx.library).lanes, r, false).unit;
      const pitch = portStep(unit, r);
      for (const e of l.edges) {
        for (const [p, id] of [[e.points[0], e.from], [e.points[e.points.length - 1], e.to]] as const) {
          const n = node(l, id);
          if (!p) continue;
          const side = [p.x === n.x, p.x === n.x + n.w, p.y === n.y, p.y === n.y + n.h];
          expect(side.some(Boolean)).toBe(true);
          const alongFlow = p.y === n.y || p.y === n.y + n.h;
          const off = alongFlow ? p.x - n.x : p.y - n.y;
          const len = alongFlow ? n.w : n.h;
          const allowed = [...latticePorts(len, pitch), ...fractionPorts(len, r.sidePorts)];
          expect(allowed.some((v) => Math.abs(v - off) < 1e-6)).toBe(true);
        }
      }
    });
  }
});

describe('measuring nodes', () => {
  it('measures the same nodes with the same ruler once, and again for another ruler, direction or lanes', () => {
    const graph = parse(fx.library);
    const ruler = pixelRuler();
    const first = measureNodes(graph.nodes, graph.lanes, ruler, false);
    expect(measureNodes(graph.nodes, graph.lanes, ruler, false)).toBe(first);
    const wider: Ruler = { ...ruler, rankGap: ruler.rankGap * 2 };
    expect(measureNodes(graph.nodes, graph.lanes, wider, false)).not.toBe(first);
    expect(measureNodes(graph.nodes, graph.lanes, wider, false)).toEqual(measureNodes([...graph.nodes], graph.lanes, wider, false));
    expect(measureNodes(graph.nodes, graph.lanes, ruler, true)).toEqual(measureNodes([...graph.nodes], graph.lanes, ruler, true));
    const labelled = [{ label: 'a lane with a long label' }];
    expect(measureNodes(graph.nodes, labelled, ruler, false)).toEqual(measureNodes([...graph.nodes], labelled, ruler, false));
    expect(measureNodes(graph.nodes, graph.lanes, ruler, false)).toEqual(first);
  });
});
