import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cellRuler, layout as layoutEngine, parse, pixelRuler, renderSvg, renderTextLayout } from '../src/index.ts';
import type { Layout } from '../src/index.ts';
import { twoLanes } from './fixtures.ts';
import { geometryViolations } from './helpers.ts';
import { ALONG_REFINE, considerAlong } from '../src/layout/along.ts';

/** These tests exercise the slot-based placer and router. */
const layout = (graph: Parameters<typeof layoutEngine>[0], ruler: Parameters<typeof layoutEngine>[1], opts: Parameters<typeof layoutEngine>[2] = {}): ReturnType<typeof layoutEngine> => layoutEngine(graph, ruler, { engine: 'grid', ...opts });


const counter = vi.hoisted(() => ({ solves: 0 }));
vi.mock('../src/layout/solve.ts', async (original) => {
  const actual = await original<typeof import('../src/layout/solve.ts')>();
  return {
    ...actual,
    solve: (...args: Parameters<typeof actual.solve>) => {
      counter.solves++;
      return actual.solve(...args);
    },
  };
});

/** Number of `solve` calls one `layout` call makes. */
const solves = (source: string, laneAxis: 'auto' | 'across'): number => {
  counter.solves = 0;
  layout(parse(source), pixelRuler(), { laneAxis });
  return counter.solves;
};

/** Two lanes whose steps line up one to one: edges leave the lanes, but nothing is gained by placing the lanes along the flow. */
const ladder = `swimlane-beta LR
  subgraph top[Top]
    a1[First] --> a2[Second]
    a3[Third]
  end
  subgraph bottom[Bottom]
    b1[One]
    b2[Two]
    b3[Three]
  end
  a1 --> b1
  a2 --> b2
  a3 --> b3
`;

/** Two lanes, every edge between them: two producers feed six consumers. */
const fan = (dir: 'LR' | 'TD'): string => `swimlane-beta ${dir}
  subgraph prod[Producers]
    p1[Sensor feed]
    p2[Batch import]
  end
  subgraph cons[Consumers]
    c1[Dashboard]
    c2[Alerting]
    c3[Archive]
    c4[Search index]
    c5[Billing]
    c6[Audit log]
  end
  p1 --> c1
  p1 --> c2
  p1 --> c3
  p1 --> c4
  p2 --> c4
  p2 --> c5
  p2 --> c6
  p2 --> c2
`;

const bends = (l: Layout): number => l.edges.reduce((n, e) => n + Math.max(0, e.points.length - 2), 0);

describe('lanes along the flow axis', () => {
  beforeEach(() => {
    counter.solves = 0;
  });

  it('makes no extra routing call when the structural estimate does not favour the arrangement', () => {
    expect(considerAlong(parse(ladder))).toBe(true);
    expect(solves(ladder, 'auto')).toBe(solves(ladder, 'across'));
    expect(layout(parse(ladder), pixelRuler()).laneAxis).toBe('across');
    expect(solves(twoLanes, 'auto')).toBe(solves(twoLanes, 'across'));
  });

  it('spends at most one construction and ALONG_REFINE refinements on routing the arrangement', () => {
    const across = solves(fan('LR'), 'across');
    const auto = solves(fan('LR'), 'auto');
    expect(auto).toBeGreaterThan(across);
    // One more solve than before: the chosen drawing is drawn again with the leftover canvas width spread.
    expect(auto).toBeLessThanOrEqual(across + 2 + ALONG_REFINE);
  });

  it('is chosen when every edge leaves its lane, and bends less than the other arrangement', () => {
    const graph = parse(fan('TD'));
    const auto = layout(graph, pixelRuler());
    const across = layout(graph, pixelRuler(), { laneAxis: 'across' });
    expect(auto.laneAxis).toBe('along');
    expect(across.laneAxis).toBe('across');
    expect(bends(auto)).toBeLessThan(bends(across));
    expect(auto.diagnostics.filter((d) => d.kind === 'crossing' || d.kind === 'detour')).toEqual([]);
  });

  it('puts the lane that sends first, each lane as a tall band with its label on top', () => {
    const l = layout(parse(fan('LR')), pixelRuler(), { laneAxis: 'along' });
    const [first, second] = l.lanes;
    expect(first?.label).toBe('Producers');
    expect(second?.label).toBe('Consumers');
    if (!first || !second) return;
    expect(first.x + first.w).toBeLessThanOrEqual(second.x);
    expect(first.y).toBe(second.y);
    expect(first.h).toBe(second.h);
    for (const lane of l.lanes) {
      expect(lane.labelBox.y).toBeLessThan(Math.min(...l.nodes.filter((n) => n.lane === lane.id).map((n) => n.y)));
      expect(lane.labelBox.x + lane.labelBox.w / 2).toBeCloseTo(lane.x + lane.w / 2, -1);
    }
    for (const n of l.nodes) {
      const lane = l.lanes.find((x) => x.id === n.lane);
      expect(lane && n.x >= lane.x && n.x + n.w <= lane.x + lane.w).toBe(true);
    }
  });

  it('keeps a pipeline with a few cross-lane edges across, with the same output as forcing it', () => {
    const graph = parse(twoLanes);
    const auto = layout(graph, pixelRuler());
    expect(auto.laneAxis).toBe('across');
    const forced = layout(graph, pixelRuler(), { laneAxis: 'across' });
    expect(JSON.stringify(auto)).toBe(JSON.stringify(forced));
    expect(renderSvg(auto)).toBe(renderSvg(forced));
  });

  it('does not consider the arrangement without two labelled lanes', () => {
    const l = layout(parse('flowchart LR\nA --> B\nA --> C\nA --> D'), pixelRuler());
    expect(l.laneAxis).toBe('across');
  });

  for (const dir of ['LR', 'TD'] as const) {
    for (const [name, ruler] of [['pixel', pixelRuler()], ['cell', cellRuler()]] as const) {
      it(`keeps the geometry sound in ${dir} with the ${name} ruler`, () => {
        const l = layout(parse(fan(dir)), ruler, { laneAxis: 'along' });
        expect(l.laneAxis).toBe('along');
        expect(geometryViolations(l)).toEqual([]);
        for (const lane of l.lanes) {
          expect(lane.x).toBeGreaterThanOrEqual(0);
          expect(lane.y).toBeGreaterThanOrEqual(0);
          expect(lane.x + lane.w).toBeLessThanOrEqual(l.width + 1e-6);
          expect(lane.y + lane.h).toBeLessThanOrEqual(l.height + 1e-6);
        }
        const [a, b] = l.lanes;
        if (a && b) {
          if (dir === 'LR') expect(a.x + a.w).toBeLessThanOrEqual(b.x);
          else expect(a.y + a.h).toBeLessThanOrEqual(b.y);
        }
        for (const lane of l.lanes) {
          for (const n of l.nodes.filter((x) => x.lane === lane.id)) {
            expect(n.x).toBeGreaterThanOrEqual(lane.x);
            expect(n.y).toBeGreaterThanOrEqual(lane.y);
            expect(n.x + n.w).toBeLessThanOrEqual(lane.x + lane.w);
            expect(n.y + n.h).toBeLessThanOrEqual(lane.y + lane.h);
          }
        }
        const grid = ruler.grid;
        for (const v of l.lanes.flatMap((x) => [x.x, x.y, x.w, x.h])) expect(v / grid).toBeCloseTo(Math.round(v / grid), 6);
      });
    }
  }

  it('picks the same arrangement for both rulers', () => {
    const graph = parse(fan('TD'));
    expect(layout(graph, cellRuler()).laneAxis).toBe('along');
    expect(layout(graph, pixelRuler()).laneAxis).toBe('along');
  });

  it('is deterministic', () => {
    const graph = parse(fan('LR'));
    expect(JSON.stringify(layout(graph, pixelRuler()))).toBe(JSON.stringify(layout(graph, pixelRuler())));
    expect(JSON.stringify(layout(graph, cellRuler()))).toBe(JSON.stringify(layout(graph, cellRuler())));
  });

  it('draws the bands in the SVG with a centred label', () => {
    const svg = renderSvg(layout(parse(fan('LR')), pixelRuler(), { laneAxis: 'along' }));
    expect(svg).toContain('data-lane="prod"');
    expect(svg).toMatch(/class="ursula-lane-label"[^>]*text-anchor="middle"/);
  });

  it('draws the bands in text', () => {
    const lines = renderTextLayout(layout(parse(fan('LR')), cellRuler(), { laneAxis: 'along', maxWidth: 120 }));
    expect(lines.join('\n')).toMatchInlineSnapshot(`
      "
        ╎                                           ╎  ╎                   ╎
        ╎                 Producers                 ╎  ╎     Consumers     ╎
        ╎                                           ╎  ╎                   ╎
        ╎                                           ╎  ╎  ┌──────────────┐ ╎
        ╎                                           ┌────▶│   Alerting   │ ╎
        ╎                                           │┌───▶│              │ ╎
        ╎                                           ││ ╎  └──────────────┘ ╎
        ╎                    ┌──────────────────────┘│ ╎                   ╎
        ╎                    │                      ╎│ ╎  ┌──────────────┐ ╎
        ╎                    │                      ╎│┌──▶│   Archive    │ ╎
        ╎                    │                      ╎││╎  └──────────────┘ ╎
        ╎                    │                      ╎││╎  ┌──────────────┐ ╎
        ╎                    │                      ╎││┌─▶│  Dashboard   │ ╎
        ╎                    │                      ╎│││  └──────────────┘ ╎
        ╎                    │    ┌──────────────┐  ╎│││                   ╎
        ╎                    │    │              │───┘││  ┌──────────────┐ ╎
        ╎                    │    │              │────┘│  │              │ ╎
        ╎                    │    │ Sensor feed  │─────┘  │ Search index │ ╎
        ╎                    │    │              │───────▶│              │ ╎
        ╎                    │    │              │  ╎  ╎┌▶│              │ ╎
        ╎                    │    │              │  ╎  ╎│ └──────────────┘ ╎
        ╎                    │    └──────────────┘  ╎  ╎│                  ╎
        ╎                    │┌─────────────────────────┘                  ╎
        ╎ ┌──────────────┐   ││                     ╎  ╎                   ╎
        ╎ │              │───┘│                     ╎  ╎                   ╎
        ╎ │              │────┘                     ╎  ╎  ┌──────────────┐ ╎
        ╎ │ Batch import │───────────────────────────────▶│   Billing    │ ╎
        ╎ │              │                          ╎  ╎  └──────────────┘ ╎
        ╎ │              │─────┐                    ╎  ╎                   ╎
        ╎ └──────────────┘     │                    ╎  ╎                   ╎
        ╎                      └────────────────────┐  ╎                   ╎
        ╎                                           │  ╎  ┌──────────────┐ ╎
        ╎                                           └────▶│  Audit log   │ ╎
        ╎                                           ╎  ╎  └──────────────┘ ╎
        ╎                                           ╎  ╎                   ╎
        ╎                                           ╎  ╎                   ╎"
    `);
  });
});
