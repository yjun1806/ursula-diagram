import { describe, expect, it } from 'vitest';
import { cellRuler, layout, parse, pixelRuler, render } from '../src/index.ts';
import type { Layout, LayoutCluster, Point } from '../src/index.ts';
import { crossesInterior, rectsOverlap, segmentsOf } from './helpers.ts';

const DEEP = `flowchart LR
  Client --> Gateway
  subgraph Platform
    subgraph Edge
      Gateway --> Auth
    end
    subgraph Core
      direction TB
      subgraph Orders
        Create --> Validate --> Persist
      end
      subgraph Billing
        Charge --> Invoice
      end
      Persist --> Charge
    end
    Auth --> Create
    Auth --> Charge
    Invoice --> Audit
    Invoice -->|refund| Auth
  end
  Audit --> Report
  Invoice --> Report
  Client --> Orders
  Persist -.-> Cache`;

const FLOW = `flowchart TB
  c1-->a2
  subgraph one
  a1-->a2
  end
  subgraph two
  b1-->b2
  end
  subgraph three
  c1-->c2
  end
  one --> two
  three --> two
  two --> c2`;

const DIRECTIONS = `flowchart LR
  subgraph TOP
    direction TB
    subgraph B1
      direction RL
      i1 --> f1
    end
    subgraph B2
      direction BT
      i2 --> f2
    end
  end
  A --> TOP --> B
  B1 --> B2`;

const drawn = (src: string): Layout => layout(parse(src), pixelRuler(), { legend: false });
const within = (outer: { x: number; y: number; w: number; h: number }, inner: { x: number; y: number; w: number; h: number }, gap: number): boolean =>
  inner.x >= outer.x + gap - 1e-6 && inner.y >= outer.y + gap - 1e-6 && inner.x + inner.w <= outer.x + outer.w - gap + 1e-6 && inner.y + inner.h <= outer.y + outer.h - gap + 1e-6;

const SOURCES = [['nested with many crossings', DEEP], ['siblings with edges between boxes', FLOW], ['directions inside boxes', DIRECTIONS]] as const;

describe.each(SOURCES)('clusters: %s', (_name, src) => {
  const l = drawn(src);
  const g = parse(src);
  const chainOf = (id: string): string[] => {
    const out: string[] = [];
    for (let c: string | undefined = id; c !== undefined; c = g.clusters?.find((k) => k.id === c)?.parent) out.unshift(c);
    return out;
  };
  const nodeChain = (id: string): string[] => {
    const n = g.nodes.find((v) => v.id === id);
    return n?.cluster === undefined ? [] : chainOf(n.cluster);
  };

  it('holds every node and inner box with at least 24 to spare', () => {
    const byId = new Map((l.clusters ?? []).map((c) => [c.id, c] as const));
    for (const n of l.nodes) for (const id of nodeChain(n.id)) expect(within(byId.get(id) as LayoutCluster, n, 24), `${n.id} in ${id}`).toBe(true);
    for (const c of g.clusters ?? []) if (c.parent !== undefined) expect(within(byId.get(c.parent) as LayoutCluster, byId.get(c.id) as LayoutCluster, 24), `${c.id} in ${c.parent}`).toBe(true);
  });

  it('never lets two boxes overlap unless one holds the other', () => {
    const boxes = l.clusters ?? [];
    for (const a of boxes) {
      for (const b of boxes) {
        if (a.id >= b.id || chainOf(a.id).includes(b.id) || chainOf(b.id).includes(a.id)) continue;
        expect(rectsOverlap(a, b), `${a.id} and ${b.id}`).toBe(false);
      }
    }
  });

  it('keeps every line out of the other nodes and the other boxes', () => {
    const boxes = l.clusters ?? [];
    for (const e of l.edges) {
      const ends = new Set([e.from, e.to]);
      const held = new Set([...nodeChain(e.from), ...nodeChain(e.to), ...(ends.has(e.from) && boxes.some((b) => b.id === e.from) ? chainOf(e.from) : []), ...(boxes.some((b) => b.id === e.to) ? chainOf(e.to) : [])]);
      for (const s of segmentsOf(e)) {
        for (const n of l.nodes) if (!ends.has(n.id)) expect(crossesInterior(s, n), `${e.from}->${e.to} through ${n.id}`).toBe(false);
        for (const b of boxes) {
          if (held.has(b.id) || ends.has(b.id)) continue;
          expect(crossesInterior(s, b), `${e.from}->${e.to} through box ${b.id}`).toBe(false);
        }
      }
    }
  });

  it('ends a line that points at a box on its border', () => {
    for (const c of l.clusters ?? []) {
      const to = l.edges.filter((e) => e.to === c.id);
      const from = l.edges.filter((e) => e.from === c.id);
      const onBorder = (p: Point): boolean => {
        const inX = p.x >= c.x - 1e-6 && p.x <= c.x + c.w + 1e-6;
        const inY = p.y >= c.y - 1e-6 && p.y <= c.y + c.h + 1e-6;
        return (inX && (Math.abs(p.y - c.y) < 1e-6 || Math.abs(p.y - (c.y + c.h)) < 1e-6)) || (inY && (Math.abs(p.x - c.x) < 1e-6 || Math.abs(p.x - (c.x + c.w)) < 1e-6));
      };
      for (const e of to) expect(onBorder(e.points.at(-1) as Point), `${e.from}->${e.to}`).toBe(true);
      for (const e of from) expect(onBorder(e.points[0] as Point), `${e.from}->${e.to}`).toBe(true);
    }
  });

  it('draws every edge once and never more than the source says', () => {
    expect(l.edges.length).toBeLessThanOrEqual(g.edges.length);
    expect(l.nodes.map((n) => n.id).sort()).toEqual(g.nodes.map((n) => n.id).sort());
    expect(render(src)).toContain('data-cluster=');
  });
});

describe('the direction of a box', () => {
  const l = drawn(DIRECTIONS);
  const at = (id: string): { x: number; y: number } => l.nodes.find((n) => n.id === id) as { x: number; y: number };

  it('reads right to left inside a box that says RL, while the picture reads left to right', () => {
    expect(at('i1').x).toBeGreaterThan(at('f1').x);
    expect(at('A').x).toBeLessThan(at('B').x);
  });

  it('reads bottom to top inside a box that says BT', () => {
    expect(at('i2').y).toBeGreaterThan(at('f2').y);
  });

  it('draws the inner box of one that says TB as boxes one above the other', () => {
    const [b1, b2] = ['B1', 'B2'].map((id) => (l.clusters ?? []).find((c) => c.id === id) as LayoutCluster);
    expect((b1 as LayoutCluster).y + (b1 as LayoutCluster).h).toBeLessThanOrEqual((b2 as LayoutCluster).y);
  });
});

describe('boxes in text', () => {
  const l = layout(parse(FLOW), cellRuler());

  it('draws no boxes and says so', () => {
    expect(l.clusters).toBeUndefined();
    expect(l.diagnostics.map((d) => d.kind)).toContain('clusters-flattened-in-text');
  });

  it('draws every outermost box as a band with its name', () => {
    expect(l.lanes.map((lane) => lane.label)).toEqual(['one', 'two', 'three']);
  });

  it('draws an inner box as a band of its own, named by its path', () => {
    const deep = layout(parse(DEEP), cellRuler());
    const names = deep.lanes.map((lane) => lane.label);
    expect(names).toContain('Platform / Edge');
    expect(names).toContain('Platform / Core / Orders');
  });

  it('keeps the name of the box itself when the path is longer than 40 cells', () => {
    const src = 'flowchart TB\n  subgraph Outer[A very long name of the outermost box]\n    subgraph Inner[Another long inner name]\n      a --> b\n    end\n  end';
    expect(layout(parse(src), cellRuler()).lanes.map((lane) => lane.label)).toEqual(['… / Another long inner name']);
  });

  it('ends a line to a box at a node in it, and keeps every line', () => {
    expect(l.edges).toHaveLength(parse(FLOW).edges.length);
    const ends = l.edges.map((e) => `${e.from}>${e.to}`);
    // `one --> two`: out of the last node of `one` that leads nowhere in it, into the first node of `two` nothing leads to.
    expect(ends).toContain('a2>b1');
    expect(ends).toContain('c2>b1');
    expect(ends).toContain('b2>c2');
  });
});

describe('a subgraph of a flowchart', () => {
  const body = '\n  subgraph one [First]\n    a[Start] --> b[Check]\n  end\n  subgraph two [Second]\n    c[Finish]\n  end\n  b --> c';

  it('is a band of one layout in a flowchart and in a graph when it is plain, marked as a part of the flow', () => {
    for (const header of ['flowchart LR', 'flowchart TD', 'graph LR', 'graph']) {
      const g = parse(`${header}${body}`);
      expect(g.clusters, header).toBeUndefined();
      expect(g.lanes.map((l) => l.id), header).toEqual(['one', 'two']);
      expect(g.zones, header).toBe('groups');
    }
  });

  it('is a band of an owner under swimlane-beta', () => {
    const g = parse(`swimlane-beta LR${body}`);
    expect(g.clusters).toBeUndefined();
    expect(g.lanes.map((l) => l.id)).toEqual(['one', 'two']);
    expect(g.zones).toBeUndefined();
  });

  it('keeps a left to right flow left to right', () => {
    const l = drawn('flowchart LR\n  subgraph one\n    a --> b\n  end\n  subgraph two\n    c --> d\n  end\n  b --> c');
    const band = (id: string): { x: number; w: number } => l.lanes.find((c) => c.id === id) as { x: number; w: number };
    expect(l.composition).toBe('stages');
    expect(band('one').x + band('one').w).toBeLessThanOrEqual(band('two').x);
  });
});

describe('a line that goes into a box', () => {
  const src = 'flowchart LR\n  Client --> Create\n  subgraph Core\n    direction LR\n    Create --> Read\n    Create --> Update\n    Create --> Delete\n  end';
  const l = drawn(src);
  const node = (id: string): { x: number; y: number; w: number; h: number } => l.nodes.find((n) => n.id === id) as { x: number; y: number; w: number; h: number };

  it('runs level with its node from the border on, as one straight stretch', () => {
    const e = l.edges.find((v) => v.from === 'Client' && v.to === 'Create') as Layout['edges'][number];
    const core = (l.clusters ?? []).find((c) => c.id === 'Core') as LayoutCluster;
    const y = node('Create').y + node('Create').h / 2;
    const crossing = segmentsOf(e).find((s) => Math.min(s.a.x, s.b.x) <= core.x + 1e-6 && Math.max(s.a.x, s.b.x) >= core.x + 1e-6) as { a: Point; b: Point };
    // One straight stretch, level with a part of the node's face.
    expect(crossing.a.y).toBeCloseTo(crossing.b.y, 4);
    expect(Math.abs(crossing.a.y - y)).toBeLessThan(node('Create').h / 2);
    expect(crossing.b.x).toBeCloseTo(node('Create').x, 4);
    expect(e.points.at(-1)?.x).toBeCloseTo(node('Create').x, 4);
  });

  it('keeps the lines that cross one face of a box 8 apart', () => {
    for (const [name, text] of SOURCES) {
      const d = drawn(text);
      for (const c of d.clusters ?? []) {
        const meets: Array<{ face: string; at: number; edge: number }> = [];
        d.edges.forEach((e, edge) => {
          for (const s of segmentsOf(e)) {
            const horizontal = Math.abs(s.a.y - s.b.y) < 1e-6;
            for (const [face, line] of horizontal ? ([['left', c.x], ['right', c.x + c.w]] as const) : ([['top', c.y], ['bottom', c.y + c.h]] as const)) {
              const [p, q] = horizontal ? [s.a.x, s.b.x] : [s.a.y, s.b.y];
              const at = horizontal ? s.a.y : s.a.x;
              const [lo, hi] = horizontal ? [c.y, c.y + c.h] : [c.x, c.x + c.w];
              if (Math.min(p, q) < line - 1e-6 && Math.max(p, q) > line + 1e-6 && at > lo && at < hi) meets.push({ face, at, edge });
            }
          }
        });
        for (const m of meets) for (const o of meets) if (m.face === o.face && m.edge < o.edge) expect(Math.abs(m.at - o.at), `${name}: ${c.id} ${m.face}`).toBeGreaterThanOrEqual(8 - 1e-6);
      }
    }
  });

  it('puts a label where no other line runs', () => {
    const labelled = drawn('flowchart LR\n  Client -->|calls| Create\n  Client --> Other\n  subgraph Core\n    Create --> Read\n  end\n  subgraph Other\n    x\n  end');
    for (const e of labelled.edges) {
      if (e.label === undefined) continue;
      const box = { x: e.label.x, y: e.label.y, w: e.label.w, h: e.label.h };
      for (const f of labelled.edges) if (f !== e) for (const s of segmentsOf(f)) expect(crossesInterior(s, box), `${e.from}->${e.to} label on ${f.from}->${f.to}`).toBe(false);
    }
  });
});

const LIMITATION = `flowchart LR
  subgraph subgraph1
    direction TB
    top1[top] --> bottom1[bottom]
  end
  subgraph subgraph2
    direction TB
    top2[top] --> bottom2[bottom]
  end
  outside --> subgraph1
  outside ---> top2`;

describe('clusters: subgraph direction, block ranks and sibling size', () => {
  it('drops the direction of a subgraph whose node has an edge to a node outside it', () => {
    const l = drawn(LIMITATION);
    const node = (id: string) => l.nodes.find((n) => n.id === id) as Layout['nodes'][number];
    // subgraph1 is only the end of `outside --> subgraph1`: it keeps TB.
    expect(node('top1').x).toBeCloseTo(node('bottom1').x, 6);
    expect(node('bottom1').y).toBeGreaterThan(node('top1').y);
    // subgraph2 has `outside ---> top2`: it reads left to right like its parent.
    expect(node('top2').y).toBeCloseTo(node('bottom2').y, 6);
    expect(node('bottom2').x).toBeGreaterThan(node('top2').x);
  });

  it('lets lines written to subgraphs, not the lines of their nodes, decide the ranks of the boxes', () => {
    const l = drawn(FLOW);
    const box = (id: string) => (l.clusters ?? []).find((c) => c.id === id) as LayoutCluster;
    expect(box('one').y).toBeCloseTo(box('three').y, 6);
    expect(box('two').y).toBeGreaterThan(box('one').y + box('one').h - 1e-6);
  });

  it('keeps the ranks the node lines give when no line is written to a subgraph', () => {
    const l = drawn('flowchart TB\n  c1-->a2\n  subgraph one\n  subgraph inner\n  a1-->a2\n  end\n  end\n  subgraph three\n  c1-->c2\n  end');
    const box = (id: string) => (l.clusters ?? []).find((c) => c.id === id) as LayoutCluster;
    expect(box('three').y).toBeLessThan(box('one').y);
  });

  it('gives boxes in one column the same width and boxes in one row the same height', () => {
    const l = drawn(DIRECTIONS);
    const box = (id: string) => (l.clusters ?? []).find((c) => c.id === id) as LayoutCluster;
    expect(box('B1').w).toBe(box('B2').w);
    const wide = drawn(LIMITATION);
    const side = (id: string) => (wide.clusters ?? []).find((c) => c.id === id) as LayoutCluster;
    // Boxes that do not share a centre keep their own size.
    expect(side('subgraph1').w).not.toBe(side('subgraph2').w);
    const flow = drawn(FLOW);
    const part = (id: string) => (flow.clusters ?? []).find((c) => c.id === id) as LayoutCluster;
    expect(part('one').h).toBe(part('three').h);
    expect(part('two').w).toBe(part('three').w);
  });
});

describe('levels with lines inside keep the layered engine', () => {
  it('draws a nested subgraph with lines inside it as it did before grids were used for levels without lines', () => {
    const l = layout(parse('flowchart TB\n  subgraph outer\n    subgraph inner\n      a-->b\n      b-->c\n    end\n    d-->a\n  end\n  e-->d'), pixelRuler());
    const at = (id: string) => l.nodes.find((n) => n.id === id) as Layout['nodes'][number];
    const box = (id: string) => (l.clusters ?? []).find((c) => c.id === id) as LayoutCluster;
    expect([at('a'), at('b'), at('c'), at('d'), at('e')].map((n) => [n.x, n.y, n.w, n.h])).toEqual([[100, 372, 40, 48], [100, 468, 40, 48], [100, 564, 40, 48], [96, 212, 40, 48], [96, 48, 40, 48]]);
    expect([box('outer'), box('inner')].map((c) => [c.x, c.y, c.w, c.h])).toEqual([[48, 152, 144, 512], [72, 316, 96, 320]]);
  });
});
