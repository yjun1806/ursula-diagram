// Examples adapted from the Mermaid documentation (MIT).
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { within } from './speed.ts';
import { layout, render } from '../src/index.ts';
import { pixelRuler } from '../src/metrics.ts';
import { c4Graph } from '../src/c4/graph.ts';
import { parseC4 } from '../src/c4/parse.ts';
import { gridRows } from '../src/c4/grid-rows.ts';
import { placeCells } from '../src/c4/grid-place.ts';
import { drawLines } from '../src/c4/grid-lines.ts';
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

  it('puts an element whose column is taken by a boundary right below the boundary in that column', () => {
    const { cell, rect } = cellsOf(head(['System(o, "o")', 'Boundary(b, "B") {', ...systems('p', 'q', 'r'), '}', 'Rel(p, o, "x")', 'Rel_R(p, q, "y")', 'Rel(q, r, "z")']));
    const q = rect.get('b') as { r1: number };
    expect(cell.get('o')).toEqual({ r: q.r1 + 1, c: cell.get('p')?.c });
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

  laid.forEach((l, i) => {
    it(`example ${i + 2}: no line bends more than twice, runs beside another closer than 16, or ends in a run shorter than 16`, () => {
      for (const e of l.edges) {
        expect(e.points.length - 2, `${e.from}->${e.to}`).toBeLessThanOrEqual(2);
        const last = segs(e.points).at(-1) as [Point, Point];
        expect(Math.abs(last[0].x - last[1].x) + Math.abs(last[0].y - last[1].y), `${e.from}->${e.to}`).toBeGreaterThanOrEqual(16);
      }
      expect(besides(l)).toEqual([]);
    });

    it(`example ${i + 2}: no label overlaps another label, a box, a border or the name of a boundary`, () => {
      expect(labelClashes(l)).toEqual([]);
    });
  });

  it('writes the name of a boundary in its top left corner, the columns inside moved right of the lines', () => {
    const l = laid[0] as Layout;
    for (const c of l.clusters ?? []) expect(c.name?.x, c.id).toBe(c.x + 16);
  });
});

/** Pairs of lines with runs side by side closer than 16 over some length, leaving out runs into one face. */
function besides(l: Layout): string[] {
  const out: string[] = [];
  l.edges.forEach((e, i) => {
    l.edges.forEach((o, j) => {
      if (j <= i) return;
      for (const [a, b] of segs(e.points)) {
        for (const [c, d] of segs(o.points)) {
          const flat = a.y === b.y;
          if (flat !== (c.y === d.y)) continue;
          const [p0, p1] = flat ? [Math.min(a.x, b.x), Math.max(a.x, b.x)] : [Math.min(a.y, b.y), Math.max(a.y, b.y)];
          const [q0, q1] = flat ? [Math.min(c.x, d.x), Math.max(c.x, d.x)] : [Math.min(c.y, d.y), Math.max(c.y, d.y)];
          const gap = Math.abs(flat ? a.y - c.y : a.x - c.x);
          if (gap < 16 && Math.min(p1, q1) - Math.max(p0, q0) > 1 && p0 !== q0 && p1 !== q1) out.push(`${e.from}->${e.to} / ${o.from}->${o.to}`);
        }
      }
    });
  });
  return out;
}

const meet = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }): boolean => a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5;

/** Labels over another label, a box, a border of a cluster or its name. */
function labelClashes(l: Layout): string[] {
  const out: string[] = [];
  l.edges.forEach((e, i) => {
    const t = e.label;
    if (t === undefined) return;
    l.edges.forEach((o, j) => {
      if (j > i && o.label !== undefined && meet(t, o.label)) out.push(`${e.from}->${e.to} / ${o.from}->${o.to}`);
    });
    for (const n of l.nodes) if (meet(t, n)) out.push(`${e.from}->${e.to} on ${n.id}`);
    for (const c of l.clusters ?? []) {
      const sides = [
        { x: c.x, y: c.y, w: c.w, h: 0.01 },
        { x: c.x, y: c.y + c.h, w: c.w, h: 0.01 },
        { x: c.x, y: c.y, w: 0.01, h: c.h },
        { x: c.x + c.w, y: c.y, w: 0.01, h: c.h },
      ];
      if (sides.some((r) => t.x < r.x + r.w && r.x < t.x + t.w && t.y < r.y + r.h && r.y < t.y + t.h)) out.push(`${e.from}->${e.to} on the border of ${c.id}`);
      if (c.name !== undefined && meet(t, c.name)) out.push(`${e.from}->${e.to} on the name of ${c.id}`);
    }
  });
  return out;
}

describe('c4 grid lines', () => {
  it('reports a line that finds no way between its places on the faces', () => {
    const graph: Graph = { direction: 'TD', lanes: [{ id: '_', label: '' }], nodes: ['a', 'b', 'w', 'l', 'r'].map((id) => ({ id, title: id, lines: [], shape: 'rect' as const, lane: '_' })), edges: [{ from: 'a', to: 'b', style: 'normal' }] };
    const node = (id: string, x: number, y: number, w = 120, h = 60): LayoutNode => ({ id, lane: '_', rank: 0, span: 1, row: 0, x, y, w, h, title: id, lines: [], shape: 'rect' });
    // A wall right under the bottom of `a` leaves no room for the line to leave it there, and walls on both sides no room to go round.
    const nodes = [node('a', 40, 40), node('b', 40, 300), node('w', 20, 104, 160, 60), node('l', 0, 0, 30, 400), node('r', 170, 0, 230, 400)];
    const { edges, diagnostics } = drawLines({ graph, nodes, clusters: [], width: 400, height: 400, holds: () => false, labelOf: () => undefined });
    expect(diagnostics.map((d) => d.kind)).toEqual(['off-centre']);
    expect(edges[0]?.points.length).toBeGreaterThan(1);
  });
});

describe('c4 grid lines that are no plain pair', () => {
  const draw = (lines: string[]): Layout => layout(graphOf(head(lines)), pixelRuler());

  it('draws a relation of an element or a boundary with itself as a loop with its label beside it', () => {
    for (const lines of [
      [...systems('a', 'b'), 'Rel(a, a, "self")', 'Rel(a, b, "x")'],
      [...systems('a', 'b'), 'Rel_R(a, a, "r")', 'Rel(a, b, "x")'],
      ['Boundary(b, "B") {', ...systems('a'), '}', 'Rel(b, b, "self")'],
      [...systems('a'), 'Rel(a, a, "")'],
    ]) {
      expect(() => render(head(lines))).not.toThrow();
      const l = draw(lines);
      const loop = l.edges.find((e) => e.from === e.to) as LayoutEdge;
      expect(loop.points).toHaveLength(4);
      expect(labelClashes(l)).toEqual([]);
    }
  });

  it('runs a line between an element and the boundary that holds it straight out to the border, each on a face of its own', () => {
    const l = draw(['Boundary(o, "Outer") {', 'Boundary(i, "Inner") {', ...systems('a'), '}', '}', 'Rel(a, o, "to own parent")', 'Rel(i, a, "inner to a")']);
    expect(l.diagnostics).toEqual([]);
    for (const e of l.edges) expect(e.points).toHaveLength(2);
    expect(besides(l)).toEqual([]);
    expect(labelClashes(l)).toEqual([]);
  });

  it('runs a line to an empty boundary straight when the element stands level with it, and keeps its label clear', () => {
    const l = draw([...systems('a'), 'Boundary(e, "Empty") {', '}', 'Rel(a, e, "to empty")']);
    expect(l.edges[0]?.points).toHaveLength(2);
    expect(labelClashes(l)).toEqual([]);
  });

  it('stands the labels of several lines between one pair one after the other', () => {
    for (const lines of [
      [...systems('a', 'b'), 'Rel(a, b, "first")', 'Rel(a, b, "second")', 'Rel(b, a, "third")'],
      [...systems('a', 'b'), ...[1, 2, 3, 4, 5, 6].map((k) => `Rel_R(a, b, "r${k}")`)],
      [...systems('a', 'b'), ...[1, 2, 3, 4, 5, 6].map((k) => `Rel(a, b, "r${k}")`)],
    ]) {
      expect(labelClashes(draw(lines))).toEqual([]);
    }
  });

  it('keeps the label of a straight line into a boundary off its border and name', () => {
    const l = draw(['Container_Boundary(b0, "b0") {', 'Container_Boundary(b1, "b1") {', 'Person(e2, "e2")', 'Boundary(b2, "b2") {', '}', 'System_Boundary(b3, "b3") {', 'System_Ext(e5, "e5", "tech", "a description of e5 that is long")', '}', 'System_Ext(e6, "e6")', 'System_Boundary(b4, "b4") {', 'System_Ext(e8, "e8")', '}', '}', '}', 'Rel(e2, e6, "uses")', 'Rel(e8, e2, "reads from")', 'Rel_D(e2, e5, "reads from")']);
    expect(labelClashes(l)).toEqual([]);
  });

  it('puts two lines of one pair that are not aligned on their slots', () => {
    const l = draw(['ContainerDb(e0, "e0")', 'Container_Boundary(b0, "b0") {', 'System_Ext(e1, "e1")', 'Boundary(b1, "b1") {', 'ContainerDb(e3, "e3")', 'Person(e4, "e4", "a person description")', '}', '}', 'System_Ext(e8, "e8")', 'Rel(e1, e0, "r1")', 'BiRel(e3, e1, "r2")', 'Rel_R(e8, e1, "r3")', 'Rel(e3, e1, "r4")', 'Rel_R(e1, e4, "r5")', 'Rel(e3, e4, "r6")']);
    expect(offRule(l)).toBe(0);
    expect(l.diagnostics).toEqual([]);
    expect(besides(l)).toEqual([]);
    expect(labelClashes(l)).toEqual([]);
  });

  it('gives twenty lines into one face places of their own, with at most two bends, no crossing, and fast', () => {
    const n = 20;
    const src = head(['System(db, "db")', ...Array.from({ length: n }, (_, k) => `System(s${k}, "s${k}")`), ...Array.from({ length: n }, (_, k) => `Rel(s${k}, db, "")`)]);
    const t0 = performance.now();
    const l = layout(graphOf(src), pixelRuler());
    expect(performance.now() - t0).toBeLessThan(within(2000));
    const ends = l.edges.map((e) => JSON.stringify(e.points.at(-1)));
    expect(new Set(ends).size).toBe(n);
    for (const e of l.edges) expect(e.points.length - 2).toBeLessThanOrEqual(2);
    let crossings = 0;
    for (let i = 0; i < l.edges.length; i++) for (let j = i + 1; j < l.edges.length; j++) for (const s of segs((l.edges[i] as LayoutEdge).points)) for (const t of segs((l.edges[j] as LayoutEdge).points)) if (crossesAt(s, t)) crossings++;
    expect(crossings).toBe(0);
    expect(l.diagnostics).toEqual([]);
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
