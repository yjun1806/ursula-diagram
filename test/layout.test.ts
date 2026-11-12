import { describe, expect, it } from 'vitest';
import { cellRuler, layout, parse, pixelRuler, render } from '../src/index.ts';
import * as fx from './fixtures.ts';
import { geometryViolations, widthForColumns } from './helpers.ts';

/** Slot structure of the drawing on a canvas that holds `columns` columns. */
const structure = (src: string, ruler: ReturnType<typeof pixelRuler>, columns = 6) => {
  const g = parse(src);
  return layout(g, ruler, { maxWidth: widthForColumns(g, ruler, columns) })
    .nodes.map((n) => `${n.id}:${n.rank}:${n.row}`)
    .sort();
};

describe('structure parity', () => {
  // Spans are left out: the two rulers round box widths differently, so a box may cover another number of units.
  for (const name of ['topDown', 'library'] as const) {
    it(`slots match between rulers on equal canvases: ${name}`, () => {
      // The two rulers may put a node of a top-down chart in another column when the drawings cost the same; its row is the same.
      const rowsOnly = (list: string[]): string[] => (name === 'topDown' ? list.map((s) => s.replace(/:\d+:/, ':')) : list);
      expect(rowsOnly(structure(fx[name], pixelRuler()))).toEqual(rowsOnly(structure(fx[name], cellRuler())));
    });
  }
});

describe('geometry invariants', () => {
  const sources = { ...fx, tdLanes: 'flowchart TD\nsubgraph x[Intake]\na1[Receive]-->a2[Validate]\nend\nsubgraph y[Office]\nb1[Approve]-->b2[Archive]\nend\na2-->|ok|b1\na1-->b2' };
  for (const [name, src] of Object.entries(sources)) {
    for (const [rn, ruler] of [['pixel', pixelRuler()], ['cell', cellRuler()]] as const) {
      it(`${name} (${rn}) is sound`, () => {
        expect(geometryViolations(layout(parse(src), ruler))).toEqual([]);
      });
    }
  }

  it('has two lanes, many nodes and cross-lane edges in the main sample', () => {
    const l = layout(parse(fx.twoLanes), pixelRuler());
    expect(l.nodes.length).toBeGreaterThanOrEqual(8);
    expect(l.lanes.filter((x) => x.label !== '')).toHaveLength(2);
  });

  it('draws a cross-lane edge between nodes sharing a rank as one straight segment', () => {
    const g = parse('flowchart LR\nsubgraph a[Top]\nX --> Y\nend\nsubgraph b[Bottom]\nZ\nend\nY --> Z');
    for (const ruler of [pixelRuler(), cellRuler()]) {
      const l = layout(g, ruler, { composition: 'lanes' });
      const y = l.nodes.find((n) => n.id === 'Y');
      const z = l.nodes.find((n) => n.id === 'Z');
      expect(y?.rank).toBe(z?.rank);
      const e = l.edges.find((x) => x.from === 'Y' && x.to === 'Z');
      expect(e?.points).toHaveLength(2);
      expect(e?.points[0]?.x).toBe(e?.points[1]?.x);
    }
  });

  it('reports overflow when the drawing is wider than maxWidth', () => {
    const l = layout(parse(fx.twoLanes), pixelRuler(), { maxWidth: 200 });
    expect(l.diagnostics.some((d) => d.kind === 'overflow')).toBe(true);
    expect(layout(parse(fx.cycle), pixelRuler(), { maxWidth: 5000 }).diagnostics.some((d) => d.kind === 'overflow')).toBe(false);
  });

  it('is deterministic', () => {
    expect(render(fx.twoLanes)).toBe(render(fx.twoLanes));
    expect(JSON.stringify(layout(parse(fx.library), cellRuler()))).toBe(JSON.stringify(layout(parse(fx.library), cellRuler())));
  });

  it('handles empty, single-node and self-loop graphs', () => {
    for (const src of ['flowchart LR', 'flowchart LR\nA', 'flowchart LR\nA --> A\nA --> B', 'flowchart LR\nA --> B\nA --> B\nB --> A']) {
      for (const ruler of [pixelRuler(), cellRuler()]) expect(geometryViolations(layout(parse(src), ruler))).toEqual([]);
    }
  });

  it('lays out and renders a 14-node, 15-edge two-lane graph in under 300 ms', () => {
    const src = `flowchart LR
subgraph a[Intake]
n1[Receive] --> n2[Validate] --> n3[Enrich] --> n4[Queue]
n5[Audit] --> n6[Notify]
n7[Archive]
end
subgraph b[Fulfilment]
m1[Pick] --> m2[Pack] --> m3[Label] --> m4[Ship]
m5[Return] --> m6[Refund]
m7[Close]
end
n4 --> m1
m4 --> n6
n2 --> n5
m2 --> m5
n6 --> n7
m6 --> m7
n3 --> m3`;
    const t = performance.now();
    const svg = render(src);
    const ms = performance.now() - t;
    expect(svg.startsWith('<svg')).toBe(true);
    expect(ms).toBeLessThan(300);
  });
});
