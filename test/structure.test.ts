import { describe, expect, it } from 'vitest';
import type { Layout } from '../src/index.ts';
import { cellRuler, layout as layoutEngine, parse, pixelRuler } from '../src/index.ts';
import { assignRanks, components } from '../src/layout/rank.ts';
import { crossingCount } from '../src/layout/check.ts';
import { geometryViolations, rectsOverlap, segmentsOf, widthForColumns } from './helpers.ts';

/** These tests exercise the slot-based placer and router. */
const layout = (graph: Parameters<typeof layoutEngine>[0], ruler: Parameters<typeof layoutEngine>[1], opts: Parameters<typeof layoutEngine>[2] = {}): ReturnType<typeof layoutEngine> => layoutEngine(graph, ruler, { engine: 'grid', ...opts });


const structure = (l: Layout): string =>
  l.nodes
    .map((n) => `${n.id}:${n.rank}:${n.row}`)
    .sort()
    .join(' ');

/** Slot structure on a canvas that holds `columns` columns, for either ruler. */
const slots = (src: string, ruler: ReturnType<typeof pixelRuler>, columns: number): string => {
  const g = parse(src);
  return structure(layout(g, ruler, { maxWidth: widthForColumns(g, ruler, columns) }));
};

const rowsPerLane = (l: Layout): number[] =>
  l.lanes.map((lane) => 1 + Math.max(...l.nodes.filter((n) => n.lane === lane.id).map((n) => n.row)));

describe('components along the flow axis', () => {
  const src = `flowchart LR
subgraph a[Orders]
o1[Receive] --> o2[Validate] --> o3[Confirm]
o4[Audit]
end
subgraph b[Warehouse]
w1[Pick] --> w2[Pack]
w3[Inventory]
end
o2 --> w1`;

  it('finds weakly connected components in source order', () => {
    const groups = components(parse(src));
    expect(groups).toEqual([['o1', 'o2', 'o3', 'w1', 'w2'], ['o4'], ['w3']]);
  });

  it('keeps unrelated nodes out of the rank columns of other components that share their lane', () => {
    const rank = assignRanks(parse(src));
    const main = ['o1', 'o2', 'o3', 'w1', 'w2'].map((id) => rank.get(id) ?? -1);
    const audit = rank.get('o4') ?? -1;
    expect(audit).toBeGreaterThan(Math.max(...main.slice(0, 3)));
    expect(rank.get('w3')).toBeGreaterThan(Math.max(rank.get('w1') ?? 0, rank.get('w2') ?? 0));
  });

  it('does not stack isolated nodes into extra rows', () => {
    const l = layout(parse('flowchart LR\nsubgraph x[Top]\nA\nB\nC\nD\nend\nsubgraph y[Bottom]\nE\nF\nend'), pixelRuler());
    expect(rowsPerLane(l)).toEqual([1, 1]);
    expect(l.width).toBeGreaterThan(l.height);
  });

  it('lets a component use ranks that an earlier component leaves free in other lanes', () => {
    const g = parse('flowchart LR\nsubgraph x[Top]\nA --> B --> C\nend\nsubgraph y[Bottom]\nD --> E\nend');
    const rank = assignRanks(g);
    expect(rank.get('D')).toBe(0);
    expect(rank.get('E')).toBe(1);
  });

  it('draws a wide picture for several unrelated chains', () => {
    const l = layout(
      parse(
        'flowchart LR\nsubgraph x[Library]\na1[Borrow] --> a2[Return]\nb1[Reserve] --> b2[Notify]\nc1[Renew]\nend\nsubgraph y[Desk]\nd1[Scan] --> d2[Shelve]\nend',
      ),
      pixelRuler(),
    );
    expect(l.width).toBeGreaterThan(l.height);
    expect(rowsPerLane(l)).toEqual([1, 1]);
  });
});

describe('structure search', () => {
  // One node of the top lane talks to three nodes of the bottom lane.
  const fanOut = `flowchart LR
subgraph a[Intake]
n1[Receive] --> n2[Triage] --> n3[Assign] --> n4[Close]
end
subgraph b[Hospital]
m1[Register]
m2[Examine]
m3[Prescribe]
m1 --> m2 --> m3
end
n2 --> m1
n2 --> m2
n2 --> m3
m3 --> n4`;

  it('removes crossings and detours that the first assignment would leave', () => {
    const l = layout(parse(fanOut), pixelRuler());
    expect(crossingCount(l.edges)).toBe(0);
    expect(l.diagnostics.filter((d) => d.kind === 'detour')).toEqual([]);
    expect(geometryViolations(l)).toEqual([]);
  });

  it('spreads the partners of a busy node over neighbouring ranks', () => {
    const l = layout(parse(fanOut), pixelRuler());
    const ranks = ['m1', 'm2', 'm3'].map((id) => l.nodes.find((n) => n.id === id)?.rank);
    expect(new Set(ranks).size).toBe(3);
  });

  it('keeps forward in-lane edges forward', () => {
    const l = layout(parse(fanOut), pixelRuler());
    const rank = (id: string): number => l.nodes.find((n) => n.id === id)?.rank ?? -1;
    for (const [a, b] of [['n1', 'n2'], ['n2', 'n3'], ['n3', 'n4'], ['m1', 'm2'], ['m2', 'm3']] as const) {
      expect(rank(b)).toBeGreaterThan(rank(a));
    }
  });

  it('picks the same ranks and rows for the pixel ruler and the cell ruler', () => {
    expect(slots(fanOut, pixelRuler(), 6)).toBe(slots(fanOut, cellRuler(), 6));
  });

  it('uses at most two rows per lane for a pipeline with side branches', () => {
    const src = `flowchart LR
subgraph ci[Pipeline]
c1[Checkout] --> c2[Build] --> c3[Test] --> c4[Package]
c2 --> c5[Lint] --> c3
end
subgraph rel[Release]
r1[Stage] --> r2[Approve] --> r3[Deploy]
end
c3 --> r1
c4 --> r3
c5 --> r2`;
    const l = layout(parse(src), pixelRuler());
    expect(Math.max(...rowsPerLane(l))).toBeLessThanOrEqual(2);
    expect(crossingCount(l.edges)).toBeLessThanOrEqual(1);
  });

  it('draws a cross-lane edge between facing nodes of one rank as a short vertical line', () => {
    const l = layout(
      parse('flowchart LR\nsubgraph a[Front]\nx1[Receive] --> x2[Confirm]\nend\nsubgraph b[Kitchen]\ny1[Prepare] --> y2[Deliver]\nend\nx1 --> y1\nx2 --> y2'),
      pixelRuler(),
    );
    for (const [from, to] of [['x1', 'y1'], ['x2', 'y2']] as const) {
      const e = l.edges.find((x) => x.from === from && x.to === to);
      expect(e?.points).toHaveLength(2);
      expect(e?.points[0]?.x).toBe(e?.points[1]?.x);
    }
  });

  it('is deterministic', () => {
    const g = parse(fanOut);
    expect(JSON.stringify(layout(g, pixelRuler()))).toBe(JSON.stringify(layout(g, pixelRuler())));
  });

  it('handles a graph without edges and a graph with one node', () => {
    for (const src of ['flowchart LR\nA\nB', 'flowchart LR\nA']) {
      expect(geometryViolations(layout(parse(src), pixelRuler()))).toEqual([]);
    }
  });
});

describe('edge labels', () => {
  const src = `flowchart LR
subgraph a[Intake]
n1[Receive] -->|accepted| n2[Triage]
end
subgraph b[Ward]
m1[Admit] --> m2[Treat]
end
n1 -->|refer| m1
n2 -->|transfer| m2`;

  it('puts the label of a straight vertical cross-lane edge beside the line', () => {
    for (const ruler of [pixelRuler(), cellRuler()]) {
      const l = layout(parse(src), ruler);
      const e = l.edges.find((x) => x.from === 'n1' && x.to === 'm1');
      const label = e?.label;
      expect(e?.points).toHaveLength(2);
      expect(label).toBeDefined();
      if (!e || !label) continue;
      const x = e.points[0]?.x ?? 0;
      expect(label.x >= x || label.x + label.w <= x).toBe(true);
      expect(l.diagnostics.filter((d) => d.kind === 'label-overlap')).toEqual([]);
    }
  });

  it('never covers a segment of another edge', () => {
    for (const ruler of [pixelRuler(), cellRuler()]) {
      const l = layout(parse(src), ruler);
      l.edges.forEach((e, i) => {
        const label = e.label;
        if (!label) return;
        l.edges.forEach((other, j) => {
          if (i === j) return;
          for (const s of segmentsOf(other)) {
            const r = { x: Math.min(s.a.x, s.b.x), y: Math.min(s.a.y, s.b.y), w: Math.abs(s.a.x - s.b.x), h: Math.abs(s.a.y - s.b.y) };
            const wide = { x: r.x - 0.01, y: r.y - 0.01, w: r.w + 0.02, h: r.h + 0.02 };
            expect(rectsOverlap(label, wide)).toBe(false);
          }
        });
      });
    }
  });
});

describe('pixel ruler character widths', () => {
  it('measures Korean and Latin text in the calibrated ranges', () => {
    const ruler = pixelRuler();
    // 6 Hangul syllables at 0.89 em, 12 px line text.
    expect(ruler.textWidth('주문접수확인', 'line')).toBeCloseTo(6 * 0.89 * 12, 5);
    // O 0.71, r d e r d 0.57 each (5), spaces 0.29 (2), i 0.33, digit 0.65.
    expect(ruler.textWidth('Order id 7', 'line')).toBeCloseTo((0.71 + 5 * 0.57 + 2 * 0.29 + 0.33 + 0.65) * 12, 5);
    expect(ruler.textWidth('Wi', 'title')).toBeCloseTo((0.89 + 0.33) * 13, 5);
  });
});

describe('uniform node width', () => {
  it('shares the width that fits 75 % of the boxes and lets the long one grow', () => {
    const l = layout(
      parse('flowchart LR\nA[One] --> B[Two]\nB --> C[Six]\nC --> D[A considerably longer title than the rest]'),
      pixelRuler(),
    );
    const long = l.nodes.find((n) => n.id === 'D');
    const rest = l.nodes.filter((n) => n.id !== 'D');
    expect(new Set(rest.map((n) => n.w)).size).toBe(1);
    expect(long?.w ?? 0).toBeGreaterThan(rest[0]?.w ?? 0);
  });

  it('gives every box the widest width', () => {
    const l = layout(parse('flowchart LR\nA[Ok] --> B[Validate order]\nB --> C[Ship it]'), pixelRuler());
    expect(new Set(l.nodes.map((n) => n.w)).size).toBe(1);
  });

  it('lets a box much wider than the median keep its own width', () => {
    const l = layout(
      parse('flowchart LR\nA[Ok] --> B[Go]\nB --> C[Up]\nC --> D[A very very very very very long title that is far wider than the rest]'),
      pixelRuler(),
    );
    const widths = l.nodes.map((n) => n.w).sort((a, b) => a - b);
    expect(widths[0]).toBe(widths[2]);
    expect(widths[3]).toBeGreaterThan((widths[0] ?? 0) * 1.6);
  });

  it('grows only the box that needs room for many edges on one side', () => {
    const l = layout(
      parse(
        'flowchart LR\nsubgraph a[Top]\nhub[Hub]\nend\nsubgraph b[Bottom]\np1[P1]\np2[P2]\np3[P3]\np4[P4]\np5[P5]\nend\nhub --> p1\nhub --> p2\nhub --> p3\nhub --> p4\nhub --> p5',
      ),
      pixelRuler(),
    );
    const hub = l.nodes.find((n) => n.id === 'hub');
    const others = l.nodes.filter((n) => n.id !== 'hub');
    expect(new Set(others.map((n) => n.w)).size).toBe(1);
    expect(hub?.w ?? 0).toBeGreaterThan(others[0]?.w ?? 0);
  });
});

describe('canvas columns', () => {
  const long = `flowchart LR
subgraph a[Intake]
i1[Register] --> i2[Triage] --> i3[Assess] --> i4[Admit] --> i5[Treat] --> i6[Review] --> i7[Discharge] --> i8[Follow up] --> i9[Close]
end
subgraph b[Billing]
b1[Open account] --> b2[Charge] --> b3[Invoice] --> b4[Settle]
end
i1 --> b1
i7 --> b3`;
  const widthFor = (k: number, ruler = pixelRuler()): number => widthForColumns(parse(long), ruler, k);

  it('derives the number of columns from the canvas width', () => {
    for (const k of [3, 4, 6]) {
      const l = layout(parse(long), pixelRuler(), { maxWidth: widthFor(k) });
      expect(Math.max(...l.nodes.map((n) => n.rank + n.span))).toBeLessThanOrEqual(2 * k);
    }
  });

  it('keeps every box inside the canvas width', () => {
    const l = layout(parse(long), pixelRuler(), { maxWidth: widthFor(4) });
    expect(l.width).toBeLessThanOrEqual(widthFor(4));
    expect(l.diagnostics.filter((d) => d.kind === 'overflow')).toEqual([]);
  });

  it('continues a chain longer than the canvas on further rows', () => {
    const l = layout(parse(long), pixelRuler(), { maxWidth: widthFor(4) });
    const intake = l.nodes.filter((n) => n.lane === 'a');
    expect(new Set(intake.map((n) => n.row)).size).toBeGreaterThanOrEqual(2);
    expect(intake.length).toBe(9);
    expect(geometryViolations(l)).toEqual([]);
  });

  it('leaves a flow that fits the canvas on one row', () => {
    const l = layout(parse('flowchart LR\nA[Start] --> B[Work] --> C[Done]'), pixelRuler());
    expect(rowsPerLane(l)).toEqual([1]);
  });

  it('uses one column per rank when the canvas width is unbounded', () => {
    const g = parse(long);
    const l = layout(g, pixelRuler(), { maxWidth: Infinity });
    expect(new Set(l.nodes.map((n) => n.rank)).size).toBeLessThanOrEqual(9);
    expect(structure(l)).toBe(structure(layout(g, pixelRuler(), { maxWidth: Infinity })));
  });
});

describe('wide nodes', () => {
  const src = `flowchart LR
subgraph a[Top]
p1[One] --> p2[Two] --> p3[Three]
end
subgraph b[Bottom]
q1[Ok] --> q2[A rather long title that needs several columns to read well] --> q3[Done]
end
p1 --> q1
p3 --> q3`;

  it('covers as many columns as its content needs and is drawn as one box', () => {
    const l = layout(parse(src), pixelRuler(), { maxWidth: Infinity });
    const wide = l.nodes.find((n) => n.id === 'q2');
    const narrow = l.nodes.find((n) => n.id === 'q1');
    expect(wide?.span ?? 0).toBeGreaterThan(2);
    expect(narrow?.span).toBe(2);
    expect(wide?.w ?? 0).toBeGreaterThan(narrow?.w ?? 0);
    expect(geometryViolations(l)).toEqual([]);
  });

  it('never lets two boxes of one lane share a column', () => {
    const l = layout(parse(src), pixelRuler(), { maxWidth: Infinity });
    for (const lane of l.lanes) {
      const members = l.nodes.filter((n) => n.lane === lane.id);
      members.forEach((a, i) => {
        for (const b of members.slice(i + 1)) {
          if (a.row !== b.row) continue;
          expect(a.rank + a.span <= b.rank || b.rank + b.span <= a.rank).toBe(true);
        }
      });
    }
  });
});

describe('facing rows', () => {
  it('puts the node that talks across the lanes on the row next to the other lane', () => {
    const src = `flowchart LR
subgraph a[Top]
t1[Intake] --> t2[Review] --> t3[Decide]
t4[Archive]
end
subgraph b[Bottom]
b1[Notify]
end
t3 --> b1
t3 --> t4`;
    const l = layout(parse(src), pixelRuler());
    const top = l.nodes.filter((n) => n.lane === 'a');
    const rows = 1 + Math.max(...top.map((n) => n.row));
    const decide = l.nodes.find((n) => n.id === 't3');
    expect(decide?.row).toBe(rows - 1);
  });
});

describe('fine grid', () => {
  it('puts every node, lane and gap on a multiple of the grid', () => {
    const ruler = pixelRuler();
    const l = layout(
      parse(`flowchart LR
subgraph a[Intake]
n1[Receive order] --> n2[Validate] --> n3[Enrich]
end
subgraph b[Fulfilment]
m1[Pick] --> m2[Pack items] --> m3[Ship]
end
n3 --> m1
m3 -->|late| n2`),
      ruler,
    );
    const onGrid = (v: number): boolean => Math.abs(v / ruler.grid - Math.round(v / ruler.grid)) < 1e-9;
    for (const n of l.nodes) for (const v of [n.x, n.y, n.w, n.h]) expect(onGrid(v)).toBe(true);
    for (const lane of l.lanes) for (const v of [lane.x, lane.y, lane.w, lane.h]) expect(onGrid(v)).toBe(true);
    expect(onGrid(l.width)).toBe(true);
    expect(onGrid(l.height)).toBe(true);
  });
});
