import { describe, expect, it } from 'vitest';
import { cellRuler, layout, parse, pixelRuler } from '../src/index.ts';
import type { Graph, Layout } from '../src/index.ts';
import { alignBoxes, projectChain } from '../src/layout/align.ts';
import type { AlignNode } from '../src/layout/align.ts';
import { assignRanks } from '../src/layout/rank.ts';
import { assignRows } from '../src/layout/rows.ts';
import { solve } from '../src/layout/solve.ts';
import { geometryViolations, segmentsOf } from './helpers.ts';
import * as fixtures from './fixtures.ts';

describe('projectChain', () => {
  const w = [10, 10, 10, 10];
  const gap = [2, 2, 2, 0];
  const lo = [0, 0, 0, 0];
  const hi = [100, 100, 100, 100];

  it('pushes a pile of boxes against the lower bound and keeps the gaps', () => {
    expect(projectChain([0, 0, 0, 0], w, gap, lo, hi)).toEqual([0, 12, 24, 36]);
  });

  it('centres a pile on its common target with minimal total displacement', () => {
    // Offsets are 0, 12, 24, 36, so the shifted targets are 50, 38, 26, 14 with mean 32.
    expect(projectChain([50, 50, 50, 50], w, gap, lo, hi)).toEqual([32, 44, 56, 68]);
  });

  it('leaves boxes that already respect the order where they are', () => {
    expect(projectChain([5, 30, 60, 80], w, gap, lo, hi)).toEqual([5, 30, 60, 80]);
  });

  it('pools only the violating neighbours', () => {
    // 40 and 44 collide (44 < 40 + 10 + 2); the other two stay.
    expect(projectChain([0, 40, 44, 90], w, gap, lo, hi)).toEqual([0, 36, 48, 90]);
  });

  it('respects the upper bound', () => {
    expect(projectChain([200, 200, 200, 200], w, gap, lo, [60, 60, 60, 60])).toEqual([14, 26, 38, 50]);
  });
});

describe('alignBoxes', () => {
  const node = (line: number, col: number, x0: number, w = 100): AlignNode => ({
    line,
    col,
    span: 1,
    w,
    x0,
    lo: 0,
    hi: 1000,
  });
  const base = { grid: 4, overlap: 24, min: 0, max: 1000, gap: () => 28 };

  it('moves a node under two partners of adjacent columns until both overlap it', () => {
    const nodes = [node(0, 0, 0), node(0, 1, 140), node(1, 0, 0)];
    const x = alignBoxes({ ...base, nodes, edges: [[0, 2], [1, 2]] });
    const lower = x[2] ?? 0;
    for (const upper of [0, 1]) {
      const overlap = Math.min((x[upper] ?? 0) + 100, lower + 100) - Math.max(x[upper] ?? 0, lower);
      expect(overlap).toBeGreaterThanOrEqual(24);
    }
  });

  it('keeps order, the gap and the grid', () => {
    const nodes = [node(0, 0, 0), node(0, 1, 140), node(0, 2, 280), node(1, 1, 140)];
    const x = alignBoxes({ ...base, nodes, edges: [[0, 3], [2, 3]] });
    for (let i = 0; i < 2; i++) expect((x[i + 1] ?? 0) - (x[i] ?? 0) - 100).toBeGreaterThanOrEqual(28);
    for (const v of x) expect(v % 4).toBe(0);
  });

  it('keeps nodes without a perpendicular partner where they are', () => {
    const nodes = [node(0, 0, 0), node(0, 1, 140), node(1, 3, 420)];
    expect(alignBoxes({ ...base, nodes, edges: [[0, 1]] })).toEqual([0, 140, 420]);
  });

  it('is deterministic', () => {
    const nodes = [node(0, 0, 0), node(0, 1, 140), node(1, 0, 0), node(1, 1, 140)];
    const edges = [[0, 3], [1, 2], [0, 2]] as const;
    expect(alignBoxes({ ...base, nodes, edges })).toEqual(alignBoxes({ ...base, nodes, edges }));
  });
});

const fan = `flowchart LR
subgraph top[Top]
a[Alpha service node] --> b[Beta service node]
end
subgraph bottom[Bottom]
c[Gamma service node]
end
c --> a
c --> b
`;

const plain = `flowchart LR
subgraph top[Top]
a[Alpha] --> b[Beta]
end
subgraph bottom[Bottom]
c[Gamma] --> d[Delta]
end
a --> c
b --> d
a --> d
`;

const sources: Array<[string, string]> = [
  ['fan', fan],
  ['plain', plain],
  ...Object.entries(fixtures).flatMap(([k, v]): Array<[string, string]> => (typeof v === 'string' ? [[k, v]] : [])),
];

const isStraight = (l: Layout, from: string, to: string): boolean =>
  l.edges.find((e) => e.from === from && e.to === to)?.points.length === 2;

describe('sliding boxes', () => {
  it('draws both edges of a node with two partners in adjacent columns as one segment', () => {
    const l = layout(parse(fan), pixelRuler());
    expect(isStraight(l, 'c', 'a')).toBe(true);
    expect(isStraight(l, 'c', 'b')).toBe(true);
    expect(geometryViolations(l)).toEqual([]);
  });

  it('lands a straight perpendicular line inside both boxes', () => {
    const l = layout(parse(fan), pixelRuler());
    for (const e of l.edges) {
      if (e.points.length !== 2) continue;
      const [p, q] = e.points;
      if (!p || !q || p.x !== q.x) continue;
      for (const id of [e.from, e.to]) {
        const n = l.nodes.find((v) => v.id === id);
        expect(p.x).toBeGreaterThan(n?.x ?? Infinity);
        expect(p.x).toBeLessThan((n?.x ?? 0) + (n?.w ?? 0));
      }
    }
  });

  for (const [name, src] of sources) {
    for (const [ruler, label] of [[pixelRuler(), 'pixel'], [cellRuler(), 'cell']] as const) {
      it(`${name} (${label}): boxes stay clear, on the canvas and on the grid`, () => {
        const l = layout(parse(src), ruler);
        expect(geometryViolations(l)).toEqual([]);
        for (const n of l.nodes) {
          for (const v of [n.x, n.y, n.w, n.h]) expect(v % ruler.grid).toBe(0);
        }
        for (const e of l.edges) for (const s of segmentsOf(e)) expect(Number.isFinite(s.a.x + s.b.y)).toBe(true);
      });

      it(`${name} (${label}): lane, row, column and span are those of the slots`, () => {
        const g: Graph = parse(src);
        const rank = assignRanks(g);
        const row = assignRows(g, rank);
        const key = (l: Layout): string =>
          l.nodes
            .map((n) => `${n.id}:${n.lane}:${n.rank}:${n.row}:${n.span}`)
            .sort()
            .join(' ');
        const off = solve(g, ruler, rank, row, {}, new Map(), false);
        const on = solve(g, ruler, rank, row, {}, new Map(), true);
        expect(key(on)).toBe(key(off));
        expect(on.width).toBe(off.width);
        expect(on.height).toBe(off.height);
        expect(JSON.stringify(layout(g, ruler))).toBe(JSON.stringify(layout(g, ruler)));
      });
    }
  }

  it('never adds bends over the unslid drawing of the fan', () => {
    const g = parse(fan);
    const rank = assignRanks(g);
    const row = assignRows(g, rank);
    const bends = (l: Layout): number => l.edges.reduce((s, e) => s + Math.max(0, e.points.length - 2), 0);
    expect(bends(solve(g, pixelRuler(), rank, row, {}, new Map(), true))).toBeLessThanOrEqual(
      bends(solve(g, pixelRuler(), rank, row, {}, new Map(), false)),
    );
  });
});
