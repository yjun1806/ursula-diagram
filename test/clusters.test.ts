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
  it('draws flat with a note and no boxes', () => {
    const l = layout(parse(FLOW), cellRuler());
    expect(l.clusters).toBeUndefined();
    expect(l.diagnostics.map((d) => d.kind)).toContain('clusters-flattened-in-text');
    expect(l.edges).toHaveLength(parse(FLOW).edges.filter((e) => !['one', 'two', 'three'].some((c) => e.from === c || e.to === c)).length);
  });
});

describe('a subgraph of a flowchart', () => {
  const body = '\n  subgraph one [First]\n    a[Start] --> b[Check]\n  end\n  subgraph two [Second]\n    c[Finish]\n  end\n  b --> c';

  it('is a box in a flowchart and in a graph, however plain', () => {
    for (const header of ['flowchart LR', 'flowchart TD', 'graph LR', 'graph']) {
      const g = parse(`${header}${body}`);
      expect(g.clusters?.map((c) => c.id), header).toEqual(['one', 'two']);
      expect(g.lanes).toHaveLength(1);
    }
  });

  it('is a band only under swimlane-beta', () => {
    const g = parse(`swimlane-beta LR${body}`);
    expect(g.clusters).toBeUndefined();
    expect(g.lanes.map((l) => l.id)).toEqual(['one', 'two']);
  });

  it('keeps a left to right flow left to right', () => {
    const l = drawn('flowchart LR\n  subgraph one\n    a --> b\n  end\n  subgraph two\n    c --> d\n  end\n  b --> c');
    const box = (id: string): LayoutCluster => (l.clusters ?? []).find((c) => c.id === id) as LayoutCluster;
    expect(box('one').x + box('one').w).toBeLessThanOrEqual(box('two').x);
  });
});

describe('a line that goes into a box', () => {
  const src = 'flowchart LR\n  Client --> Create\n  subgraph Core\n    Create --> Read\n    Create --> Update\n    Create --> Delete\n  end';
  const l = drawn(src);
  const node = (id: string): { x: number; y: number; w: number; h: number } => l.nodes.find((n) => n.id === id) as { x: number; y: number; w: number; h: number };

  it('runs level with its node from the border on, as one straight stretch', () => {
    const e = l.edges.find((v) => v.from === 'Client' && v.to === 'Create') as Layout['edges'][number];
    const core = (l.clusters ?? []).find((c) => c.id === 'Core') as LayoutCluster;
    const y = node('Create').y + node('Create').h / 2;
    const crossing = segmentsOf(e).find((s) => Math.min(s.a.x, s.b.x) <= core.x + 1e-6 && Math.max(s.a.x, s.b.x) >= core.x + 1e-6) as { a: Point; b: Point };
    expect(crossing.a.y).toBeCloseTo(y, 4);
    expect(crossing.b.y).toBeCloseTo(y, 4);
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
