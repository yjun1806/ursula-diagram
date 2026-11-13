// Examples adapted from the Mermaid documentation (MIT).
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { layout } from '../src/index.ts';
import { pixelRuler } from '../src/metrics.ts';
import { c4Graph } from '../src/c4/graph.ts';
import { parseC4 } from '../src/c4/parse.ts';
import { gridRows } from '../src/c4/grid-rows.ts';
import { placeCells } from '../src/c4/grid-place.ts';
import { drawLines } from '../src/c4/grid-lines.ts';
import { routeGlobally } from '../src/layout/global-route.ts';
import type { Graph, Layout, LayoutEdge, LayoutNode, Point } from '../src/types.ts';

const graphOf = (src: string): Graph => c4Graph(parseC4(src), pixelRuler());
const rowsOf = (src: string): Map<string, number> => {
  const g = graphOf(src);
  return gridRows(g, g.grid as NonNullable<Graph['grid']>).row;
};
const cellsOf = (src: string) => {
  const g = graphOf(src);
  const spec = g.grid as NonNullable<Graph['grid']>;
  return placeCells(g, spec, gridRows(g, spec));
};
const head = (lines: string[]): string => ['C4Context', ...lines].join('\n  ');
const systems = (...ids: string[]): string[] => ids.map((id) => `System(${id}, "${id}")`);

describe('c4 grid rows', () => {
  it('puts a person above what it uses and above what sends it something', () => {
    const rows = rowsOf(head(['Person(p, "P")', ...systems('a', 'b'), 'Rel(a, p, "mails")', 'Rel(p, b, "uses")']));
    expect(rows.get('p')).toBe(0);
    expect(rows.get('a')).toBe(1);
    expect(rows.get('b')).toBe(1);
  });

  it('reads the line that closes a cycle the other way: the latest one written', () => {
    const rows = rowsOf(head([...systems('a', 'b', 'c'), 'Rel(a, b, "x")', 'Rel(b, c, "x")', 'Rel(c, a, "x")']));
    expect([rows.get('a'), rows.get('b'), rows.get('c')]).toEqual([0, 1, 2]);
  });

  it('puts the first-written end of BiRel and Rel_Back above, whatever the arrowheads say', () => {
    const rows = rowsOf(head([...systems('a', 'b', 'c', 'd'), 'BiRel(b, a, "x")', 'Rel_Back(c, d, "x")']));
    expect(rows.get('b')).toBeLessThan(rows.get('a') as number);
    expect(rows.get('c')).toBeLessThan(rows.get('d') as number);
  });

  it('follows the direction hints before a person and before the order of writing', () => {
    const rows = rowsOf(head(['Person(p, "P")', ...systems('a', 'b', 'c'), 'Rel_U(p, a, "x")', 'Rel_R(a, b, "x")', 'Lay_D(b, c)']));
    expect(rows.get('a')).toBeLessThan(rows.get('p') as number);
    expect(rows.get('b')).toBe(rows.get('a'));
    expect(rows.get('c')).toBeGreaterThan(rows.get('b') as number);
  });

  it('follows the steps of a dynamic diagram before the order of writing', () => {
    const src = ['C4Dynamic', ...systems('a', 'b'), 'RelIndex(2, b, a, "x")', 'RelIndex(1, a, b, "x")'].join('\n  ');
    const rows = rowsOf(src);
    expect(rows.get('a')).toBeLessThan(rows.get('b') as number);
  });

  it('puts a node that only starts lines right above the first node it reaches', () => {
    const rows = rowsOf(head([...systems('a', 'b', 'c', 'd'), 'Rel(a, b, "x")', 'Rel(b, c, "x")', 'Rel(d, c, "x")']));
    expect(rows.get('d')).toBe((rows.get('c') as number) - 1);
  });
});

describe('c4 grid columns', () => {
  it('puts a node, its partner above and its partner below in one column', () => {
    const { cell } = cellsOf(head([...systems('a', 'b', 'c'), 'Rel(a, b, "x")', 'Rel(b, c, "x")']));
    expect(new Set(['a', 'b', 'c'].map((id) => cell.get(id)?.c)).size).toBe(1);
  });

  it('keeps one partner above in the column, the one with no other line first, and puts the other beside it', () => {
    const { cell } = cellsOf(head([...systems('hub', 'busy', 'leaf', 'far'), 'Rel(busy, hub, "x")', 'Rel(leaf, hub, "x")', 'Rel(far, busy, "x")', 'Rel(far, hub, "x")']));
    expect(cell.get('leaf')?.c).toBe(cell.get('hub')?.c);
    expect(Math.abs((cell.get('busy')?.c as number) - (cell.get('hub')?.c as number))).toBe(1);
  });

  it('puts an element asked to the right right beside it in its row', () => {
    const { cell } = cellsOf(head([...systems('a', 'b'), 'Rel_L(a, b, "x")']));
    expect(cell.get('b')?.r).toBe(cell.get('a')?.r);
    expect(cell.get('b')?.c).toBe((cell.get('a')?.c as number) - 1);
  });

  it('fills a boundary with its elements without lines, c4ShapeInRow to a row', () => {
    const { cell } = cellsOf(head(['Boundary(b, "B") {', ...systems('a1', 'a2', 'a3', 'a4', 'a5'), '}', 'UpdateLayoutConfig($c4ShapeInRow="2")']));
    const rows = ['a1', 'a2', 'a3', 'a4', 'a5'].map((id) => cell.get(id)?.r);
    expect(rows).toEqual([0, 0, 1, 1, 2]);
  });

  it('keeps a boundary with nothing in it as one empty cell', () => {
    const laid = layout(graphOf(head([...systems('a'), 'Boundary(e, "Empty") {', '}'])), pixelRuler());
    const box = laid.clusters?.find((c) => c.id === 'e');
    expect(box).toBeDefined();
    expect(box?.w).toBeGreaterThan(laid.nodes[0]?.w as number);
  });

  it('puts a boundary on a range of cells that holds only what stands in it', () => {
    const { cell, rect } = cellsOf(head(['Person(p, "P")', 'System_Boundary(s, "S") {', ...systems('a', 'b'), '}', ...systems('c'), 'Rel(p, a, "x")', 'Rel(a, b, "x")', 'Rel(p, c, "x")', 'Rel(c, b, "x")']));
    const q = rect.get('s') as { r0: number; r1: number; c0: number; c1: number };
    for (const [id, p] of cell) {
      const inside = p.r >= q.r0 && p.r <= q.r1 && p.c >= q.c0 && p.c <= q.c1;
      expect(inside, id).toBe(id === 'a' || id === 'b');
    }
  });
});

// The examples of the Mermaid documentation, 02 to 06 (01 is the same drawing as 02).
const FIXTURES = join(import.meta.dirname, 'fixtures-c4');
const EXAMPLES = readdirSync(FIXTURES).filter((f) => f.endsWith('.mmd')).sort().map((f) => readFileSync(join(FIXTURES, f), 'utf8'));

const segs = (pts: readonly Point[]): Array<[Point, Point]> => pts.slice(1).map((q, i) => [pts[i] as Point, q]);
function crossesAt([p, q]: [Point, Point], [r, s]: [Point, Point]): boolean {
  const d = (q.x - p.x) * (s.y - r.y) - (q.y - p.y) * (s.x - r.x);
  if (Math.abs(d) < 1e-9) return false;
  const t = ((r.x - p.x) * (s.y - r.y) - (r.y - p.y) * (s.x - r.x)) / d;
  const v = ((r.x - p.x) * (q.y - p.y) - (r.y - p.y) * (q.x - p.x)) / d;
  return t > 0.01 && t < 0.99 && v > 0.01 && v < 0.99;
}

/** Line ends that stand neither on a straight line between aligned boxes nor a whole number of pitches from the middle of their face. */
function offRule(l: Layout): number {
  const by = new Map(l.nodes.map((n) => [n.id, n] as const));
  const cx = (n: LayoutNode): number => n.x + n.w / 2;
  const cy = (n: LayoutNode): number => n.y + n.h / 2;
  const aligned = (e: LayoutEdge): boolean => {
    const [a, b] = [by.get(e.from), by.get(e.to)];
    return a !== undefined && b !== undefined && e.points.length === 2 && (Math.abs(cx(a) - cx(b)) <= 2 || Math.abs(cy(a) - cy(b)) <= 2);
  };
  const faceOf = (n: LayoutNode, p: Point): string => (Math.abs(p.y - n.y) < 1 ? 'T' : Math.abs(p.y - (n.y + n.h)) < 1 ? 'B' : Math.abs(p.x - n.x) < 1 ? 'L' : 'R');
  const faces = new Map<string, Array<{ n: LayoutNode; p: Point; face: string; straight: boolean }>>();
  for (const e of l.edges) {
    for (const [id, p] of [[e.from, e.points[0]], [e.to, e.points.at(-1)]] as const) {
      const n = by.get(id);
      if (n === undefined || p === undefined) continue;
      const k = id + faceOf(n, p);
      faces.set(k, [...(faces.get(k) ?? []), { n, p, face: faceOf(n, p), straight: aligned(e) }]);
    }
  }
  let off = 0;
  for (const list of faces.values()) {
    for (const { n, p, face, straight } of list) {
      if (straight) continue;
      const flat = face === 'T' || face === 'B';
      const along = flat ? p.x - cx(n) : p.y - cy(n);
      const pitch = Math.min(64, (flat ? n.w : n.h) / (list.length + 1));
      if (Math.abs(along) > 2 && Math.abs(along / pitch - Math.round(along / pitch)) * pitch > 2) off++;
    }
  }
  return off;
}

describe('c4 grid on the documented examples', () => {
  const laid = EXAMPLES.map((src) => layout(graphOf(src), pixelRuler()));

  it('has the five examples', () => expect(EXAMPLES).toHaveLength(5));

  laid.forEach((l, i) => {
    it(`example ${i + 2}: every line end stands at the middle of its face or on its slot, and nothing is reported off the middle`, () => {
      expect(offRule(l)).toBe(0);
      expect(l.diagnostics.filter((d) => d.kind === 'off-centre')).toEqual([]);
    });
  });

  it('draws more relations as straight lines between aligned elements than the cluster layout did (9 of 31), with no more crossings (2)', () => {
    let straight = 0;
    let crossings = 0;
    for (const l of laid) {
      const by = new Map(l.nodes.map((n) => [n.id, n] as const));
      for (const e of l.edges) {
        const [a, b] = [by.get(e.from), by.get(e.to)];
        if (a && b && e.points.length === 2 && (Math.abs(a.x - b.x) < 2 || Math.abs(a.y - b.y) < 2)) straight++;
      }
      for (let i = 0; i < l.edges.length; i++) for (let j = i + 1; j < l.edges.length; j++) for (const s of segs((l.edges[i] as LayoutEdge).points)) for (const t of segs((l.edges[j] as LayoutEdge).points)) if (crossesAt(s, t)) crossings++;
    }
    expect(straight).toBeGreaterThan(9);
    expect(crossings).toBeLessThanOrEqual(2);
  });

  it('draws example 2 within a tenth of the size of the hand-drawn one (1256 by 1088)', () => {
    const l = laid[0] as Layout;
    expect(Math.abs(l.width / 1256 - 1)).toBeLessThanOrEqual(0.1);
    expect(Math.abs(l.height / 1088 - 1)).toBeLessThanOrEqual(0.1);
  });
});

describe('c4 grid lines', () => {
  it('routes a pinned line between its pins only', () => {
    const [p] = routeGlobally({
      width: 400,
      height: 400,
      nodes: [
        { id: 'a', x: 40, y: 40, w: 120, h: 60 },
        { id: 'b', x: 240, y: 260, w: 120, h: 60 },
      ],
      clusters: [],
      edges: [{ from: 'a', to: 'b', current: [], pin: { from: { x: 130, y: 100, d: 1 }, to: { x: 270, y: 260, d: 3 } } }],
    });
    expect(p?.[0]).toEqual({ x: 130, y: 100 });
    expect(p?.at(-1)).toEqual({ x: 270, y: 260 });
  });

  it('reports a line that finds no way between its places on the faces', () => {
    const graph: Graph = { direction: 'TD', lanes: [{ id: '_', label: '' }], nodes: ['a', 'b', 'w'].map((id) => ({ id, title: id, lines: [], shape: 'rect' as const, lane: '_' })), edges: [{ from: 'a', to: 'b', style: 'normal' }] };
    const node = (id: string, x: number, y: number, w = 120, h = 60): LayoutNode => ({ id, lane: '_', rank: 0, span: 1, row: 0, x, y, w, h, title: id, lines: [], shape: 'rect' });
    // A wall right under the bottom of `a` leaves no room for the line to leave it there.
    const nodes = [node('a', 40, 40), node('b', 40, 300), node('w', 20, 104, 160, 60)];
    const { edges, diagnostics } = drawLines({ graph, nodes, clusters: [], width: 400, height: 400, holds: () => false, labelOf: () => undefined });
    expect(diagnostics.map((d) => d.kind)).toEqual(['off-centre']);
    expect(edges[0]?.points.length).toBeGreaterThan(1);
  });
});

describe('c4 grid lines to a boundary', () => {
  it('stands the other end above the boundary and ends the line at the middle of its border', () => {
    const laid = layout(graphOf(head(['Person(p, "P")', 'System_Boundary(s, "S") {', ...systems('a', 'b'), '}', 'Rel(p, s, "uses")', 'Rel(a, b, "x")'])), pixelRuler());
    const s = laid.clusters?.find((c) => c.id === 's') as NonNullable<Layout['clusters']>[number];
    const p = laid.nodes.find((n) => n.id === 'p') as LayoutNode;
    expect(p.y + p.h).toBeLessThan(s.y);
    const line = laid.edges.find((e) => e.to === 's') as LayoutEdge;
    expect(line.points.at(-1)).toEqual({ x: s.x + s.w / 2, y: s.y });
  });
});
