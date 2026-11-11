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

  it('keeps two boxes joined by an already straight edge at the same x while a third is pulled', () => {
    // Boxes 0 and 2 are one column apart in x and straight; box 1 is pulled toward box 3.
    const nodes = [node(0, 0, 0), node(0, 1, 140), node(1, 0, 0), node(1, 1, 300)];
    const x = alignBoxes({ ...base, nodes, edges: [[0, 2], [1, 3]] });
    expect(x[0]).toBe(0);
    expect(x[2]).toBe(0);
  });

  it('rejects a move that would straighten one edge and bend two', () => {
    // Box 2 overlaps boxes 0 and 3 by exactly the minimum; reaching the pinned box 1 would lose both.
    const pinned = (n: AlignNode): AlignNode => ({ ...n, lo: n.x0, hi: n.x0 + n.w });
    const nodes = [
      pinned(node(0, 0, -76)),
      pinned(node(0, 1, 140)),
      { ...node(1, 0, 0), lo: -200 },
      pinned(node(2, 0, -76)),
    ];
    const x = alignBoxes({ ...base, nodes, edges: [[0, 2], [2, 3], [1, 2]], min: -200 });
    expect(x).toEqual(nodes.map((n) => n.x0));
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

describe('slide gains', () => {
  const ruler = pixelRuler();
  const column = (l: Layout): Map<number, number[]> => {
    const by = new Map<number, number[]>();
    for (const n of l.nodes) by.set(n.rank, [...(by.get(n.rank) ?? []), n.x]);
    return by;
  };
  const mode = (xs: number[]): number => {
    const count = new Map<number, number>();
    for (const v of xs) count.set(v, (count.get(v) ?? 0) + 1);
    return [...count].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ?? 0;
  };
  const run = (src: string, slide: boolean): Layout => {
    const g = parse(src);
    const rank = assignRanks(g);
    return solve(g, ruler, rank, assignRows(g, rank), {}, new Map(), slide);
  };

  it('keeps boxes joined by a straight edge in their column', () => {
    const src = `flowchart LR
subgraph top[Top]
a[Alpha] --> b[Beta]
end
subgraph bottom[Bottom]
c[Gamma] --> d[Delta]
end
a --> c
`;
    const l = run(src, true);
    expect(l.nodes.find((n) => n.id === 'a')?.x).toBe(l.nodes.find((n) => n.id === 'c')?.x);
    expect(JSON.stringify(l)).toBe(JSON.stringify(run(src, false)));
  });

  it('still slides a box with two partners in adjacent columns', () => {
    const l = layout(parse(fan), ruler);
    expect(isStraight(l, 'c', 'a')).toBe(true);
    expect(isStraight(l, 'c', 'b')).toBe(true);
  });

  it('draws the same as without sliding when sliding gains nothing', () => {
    const src = `flowchart LR
subgraph top[Top]
a[Alpha] --> b[Beta] --> c[Gamma]
end
subgraph bottom[Bottom]
d[Delta] --> e[Epsilon]
end
a --> d
b --> e
`;
    expect(JSON.stringify(run(src, true))).toBe(JSON.stringify(run(src, false)));
  });

  for (const [name, src] of [['fan', fan], ['plain', plain], ['fixture-based fan', fan.replace('Gamma', 'Omega')]] as const) {
    it(`${name}: every box off its column ends a line that is straight only because of the slide`, () => {
      const on = run(src, true);
      const off = run(src, false);
      const straight = (l: Layout): Set<string> =>
        new Set(l.edges.filter((e) => e.points.length === 2).map((e) => `${e.from}>${e.to}`));
      const before = straight(off);
      const gained = [...straight(on)].filter((k) => !before.has(k));
      const ends = new Set(gained.flatMap((k) => k.split('>')));
      for (const [rank, xs] of column(on)) {
        const home = mode(xs);
        for (const n of on.nodes) if (n.rank === rank && n.x !== home) expect(ends.has(n.id)).toBe(true);
      }
    });
  }
});
