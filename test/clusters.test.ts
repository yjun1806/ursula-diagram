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
