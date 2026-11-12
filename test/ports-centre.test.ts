import { describe, expect, it } from 'vitest';
import { cellRuler, layout, parse, pixelRuler } from '../src/index.ts';
import { offCentreEnds } from '../src/layered/centre.ts';
import * as fixtures from './fixtures.ts';

const wide = 'flowchart LR\n  subgraph top[Top]\n    a[One] --> b[Two] --> c[Three]\n  end\n  subgraph bottom[Bottom]\n    x[Lone]\n  end\n  c --> x';

describe('an edge alone on the side of a box ends at the middle of that side', () => {
  it('holds in pixels, and says so when it does not', () => {
    for (const src of [wide, fixtures.twoLanes, fixtures.library]) {
      const l = layout(parse(src), pixelRuler());
      expect(offCentreEnds(l)).toEqual([]);
      expect(l.diagnostics.filter((d) => d.kind === 'off-centre')).toEqual([]);
    }
  });

  it('reports an edge end that stands off the middle', () => {
    const l = layout(parse(wide), pixelRuler());
    const moved = { ...l, edges: l.edges.map((e) => (e.from === 'c' ? { ...e, points: e.points.map((p, i) => (i === 0 ? { ...p, x: p.x + 20 } : p)) } : e)) };
    const found = offCentreEnds(moved);
    expect(found).toHaveLength(1);
    expect(found[0]?.kind).toBe('off-centre');
  });

  it('centres a narrow box under the middle of a wide one it is joined to alone', () => {
    const l = layout(parse(wide), pixelRuler());
    const c = l.nodes.find((n) => n.id === 'c');
    const x = l.nodes.find((n) => n.id === 'x');
    const e = l.edges.find((edge) => edge.from === 'c' && edge.to === 'x');
    expect(e?.points).toHaveLength(2);
    expect((c?.x ?? 0) + (c?.w ?? 0) / 2).toBeCloseTo((x?.x ?? 0) + (x?.w ?? 0) / 2);
  });

  it('holds in cells, on the upper cell where two share the middle', () => {
    const l = layout(parse(wide), cellRuler());
    const by = new Map(l.nodes.map((n) => [n.id, n]));
    const sides = new Map<string, number[]>();
    for (const e of l.edges) {
      for (const [id, p] of [[e.from, e.points[0]], [e.to, e.points[e.points.length - 1]]] as const) {
        const n = by.get(id);
        if (!n || !p) continue;
        const side = p.y === n.y ? 'top' : p.y === n.y + n.h ? 'bottom' : p.x === n.x ? 'left' : 'right';
        const cell = side === 'top' || side === 'bottom' ? Math.floor(p.x) - (n.x + Math.floor((n.w - 1) / 2)) : Math.floor(p.y) - (n.y + Math.floor((n.h - 1) / 2));
        sides.set(`${id}|${side}`, [...(sides.get(`${id}|${side}`) ?? []), cell]);
      }
    }
    for (const [key, cells] of sides) if (cells.length === 1) expect([key, cells[0]]).toEqual([key, 0]);
  });
});
