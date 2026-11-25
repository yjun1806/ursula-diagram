import { describe, expect, it } from 'vitest';
import { renderText, renderTextLayout } from '../src/index.ts';
import type { Layout, LayoutEdge, LayoutNode } from '../src/index.ts';
import { openTextColumns, openTextRows } from '../src/layout/text-room.ts';
import { roomViolations } from './text-room.ts';

const text = (src: string, width = 80): string[] => {
  const out = renderText(src, width);
  return 'lines' in out ? out.lines : [];
};

const none = { headless: [], underName: [], onRule: [], tight: [], close: [] };

/** Small deterministic generator (mulberry32). */
function prng(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NAMES = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Eps', 'Zeta', 'Eta', 'Theta', 'Iota'];

/** A flowchart of a few boxes, in bands when `bands` is set. */
function generate(seed: number, bands: boolean): string {
  const rnd = prng(seed);
  const pick = (n: number): number => Math.floor(rnd() * n);
  const count = 3 + pick(6);
  const lines = [`${bands ? 'swimlane-beta' : 'flowchart'} ${rnd() < 0.5 ? 'LR' : 'TD'}`];
  if (bands) {
    const groups = 2 + pick(2);
    for (let g = 0; g < groups; g++) {
      lines.push(`  subgraph g${g}[Band ${g}]`);
      for (let i = g; i < count; i += groups) lines.push(`    n${i}[${NAMES[i]}]`);
      lines.push('  end');
    }
  } else {
    for (let i = 0; i < count; i++) lines.push(`  n${i}[${NAMES[i]}]`);
  }
  for (let e = 0, edges = count - 1 + pick(count); e < edges; e++) {
    const a = pick(count);
    const b = pick(count);
    if (a !== b) lines.push(`  n${Math.min(a, b)} -->${rnd() < 0.2 ? '|yes|' : ''} n${Math.max(a, b)}`);
  }
  return lines.join('\n');
}

describe('the rows a terminal drawing opens for its bands and arrowheads', () => {
  it('keep a box a row off the rule of a band, and an arrowhead off the rule with its line behind it', () => {
    const src = 'flowchart TD\n  subgraph Storefront\n    A[Take order] --> B[Check payment]\n  end\n  subgraph Warehouse\n    C[Pack] --> D[Restock]\n  end\n  B -->|paid| C';
    expect(text(src)).toEqual([
      '── Storefront ───────────────────────────────────────────',
      '',
      '┌───────────────┐   ┌───────────────┐',
      '│  Take order   │──▶│ Check payment │',
      '└───────────────┘   └───────────────┘',
      '                            │',
      '── Warehouse ───────────────┼─ paid ─────────────────────',
      '                            ▼',
      '                    ┌───────────────┐   ┌───────────────┐',
      '                    │     Pack      │──▶│    Restock    │',
      '                    └───────────────┘   └───────────────┘',
    ]);
  });

  it('leave two rows between two boxes one above the other: a cell of line, then the arrowhead', () => {
    expect(text('flowchart TD\n  a[Pack] --> b[Restock]')).toEqual(['┌─────────┐', '│  Pack   │', '└─────────┘', '     │', '     ▼', '┌─────────┐', '│ Restock │', '└─────────┘']);
  });

  it('leave two rows for a line without an arrowhead as well', () => {
    expect(text('flowchart TD\n  a[Pack] --- b[Restock]').slice(3, 5)).toEqual(['     │', '     │']);
  });

  it('turn a line that came along the row under a box, so that its arrowhead points into the box', () => {
    const src = 'flowchart LR\n  n0[Alpha]\n  n1[Beta]\n  n2[Gamma]\n  n3[Delta]\n  n3 --> n1\n  n0 --> n3\n  n1 --> n3\n  n1 --> n3\n  n2 --> n1\n  n0 --> n3';
    expect(text(src)).toEqual([
      '┌───────┐   ┌───────┐   ┌───────┐',
      '│ Alpha │──▶│ Delta │──▶│ Beta  │',
      '└───────┘   └───────┘   └───────┘',
      '    │          ▲▲▲        ││▲',
      '    └──────────┘└┼────────┘││',
      '                 └─────────┘│',
      '                        ┌───────┐',
      '                        │ Gamma │',
      '                        └───────┘',
    ]);
  });

  it('keep the marks of a relation off the rule of a band', () => {
    const lines = text('classDiagram\n  namespace Shop {\n    class Order\n  }\n  namespace Stock {\n    class Item\n  }\n  Order ..> Item : uses');
    const rule = lines.findIndex((line) => line.includes('Stock'));
    expect(lines[rule]).not.toMatch(/[v^<>]/);
    expect(lines[rule + 1]?.trim()).toBe('v');
    expect(roomViolations(lines)).toEqual(none);
  });

  it('are opened in every drawing of a few boxes', () => {
    for (let seed = 1; seed <= 40; seed++) {
      for (const bands of [false, true]) {
        const src = generate(seed, bands);
        for (const width of [80, 120]) {
          const found = roomViolations(text(src, width));
          // Left as they are: a line under the name of a band on a rule too short for the name, and an arrowhead on
          // the side of a box whose line turns in the cell beside the box where a column for it would make the drawing wider.
          expect({ ...found, underName: [], headless: found.headless.filter((row) => !/[▶◀]/.test(row)) }, `${src}\n${width}`).toEqual(none);
        }
      }
    }
  });

  it('leave a label beside an upright line a row where no other line runs under it', () => {
    const src = 'stateDiagram-v2\ndirection LR\n[*] --> S0\nS0 --> S2 : retry later\nS3 --> S6 : yes\nS1 --> S5\nS1 --> S5\nS5 --> S6\nS0 --> S1\nS6 --> [*]';
    expect(text(src, 100).slice(3, 6)).toEqual([
      '          │         │         ▲         ▲',
      '          │         └─────────┘         │  yes',
      '          ▼  retry later                │',
    ]);
  });

  it('leave the choice between shared ports and ports of their own as it was', () => {
    // With shared ports this drawing is owed one row more than without: the choice is made before the rows are opened.
    const src = 'swimlane-beta LR\n  subgraph c[Customer]\n    browse[Browse catalogue]\n    pay[Pay]\n  end\n  subgraph w[Warehouse]\n    pick[Pick items]\n    ship[Ship order]\n  end\n  subgraph f[Finance]\n    invoice[Raise invoice]\n  end\n  browse --> pay\n  pay --> pick\n  pick --> ship\n  pay --> invoice';
    const lines = text(src, 100);
    expect(lines.join('\n')).toContain('│       Pay        │─┬▶│    Pick items    │');
    expect(roomViolations(lines)).toEqual(none);
  });
});

const box = (id: string, x: number, y: number, w: number, h: number): LayoutNode => ({ id, lane: '', rank: 0, span: 1, row: 0, x, y, w, h, title: id, lines: [], shape: 'rect' });
const line = (from: string, to: string, points: Array<[number, number]>): LayoutEdge => ({ from, to, style: 'normal', points: points.map(([x, y]) => ({ x, y })) });
const sheet = (width: number, height: number, nodes: LayoutNode[], edges: LayoutEdge[]): Layout => ({ width, height, direction: 'TD', laneAxis: 'across', lanes: [], nodes, edges, diagnostics: [] });
const node = (l: Layout, id: string): LayoutNode => l.nodes.find((n) => n.id === id) as LayoutNode;

describe('a row that goes into a terminal drawing', () => {
  // `a` over `b` with one cell between them, and `t` beside the two, as tall as both.
  const pair = [box('a', 0, 0, 9, 3), box('b', 0, 4, 9, 3)];
  const down = line('a', 'b', [[4.5, 3], [4.5, 4]]);

  it('goes around a box beside it that no line ties to the rows on either side', () => {
    const l = openTextRows(sheet(22, 7, [...pair, box('t', 12, 0, 9, 7)], [down]));
    expect(node(l, 'b').y).toBe(5);
    expect([node(l, 't').y, node(l, 't').h]).toEqual([0, 7]);
    expect(renderTextLayout(l).slice(3, 5)).toEqual(['    │       │   t   │', '    ▼       │       │']);
  });

  it('makes a box taller only when lines end on its side above the row and below it', () => {
    const tied = [line('a', 't', [[9, 1.5], [12, 1.5]]), line('b', 't', [[9, 5.5], [12, 5.5]])];
    const l = openTextRows(sheet(22, 7, [...pair, box('t', 12, 0, 9, 7)], [down, ...tied]));
    expect(node(l, 'b').y).toBe(5);
    expect([node(l, 't').y, node(l, 't').h]).toEqual([0, 8]);
    expect(roomViolations(renderTextLayout(l))).toEqual(none);
  });
});

describe('a column that goes into a terminal drawing', () => {
  // A line comes down beside `b` and turns into its left side in the cell it ends in; `c`, when it is there, reaches further right than `b`.
  const turning = (wide: boolean): Layout =>
    sheet(wide ? 20 : 13, 6, [box('a', 0, 0, 5, 3), box('b', 4, 3, 9, 3), ...(wide ? [box('c', 14, 0, 6, 3)] : [])], [line('a', 'b', [[3.5, 3], [3.5, 4.5], [4, 4.5]])]);

  it('gives the arrowhead on the side of a box its cell of line where the drawing gets no wider for it', () => {
    const before = turning(true);
    expect(roomViolations(renderTextLayout(before)).headless).toHaveLength(1);
    const after = openTextColumns(before);
    expect(after.width).toBe(20);
    expect(node(after, 'b').x).toBe(5);
    expect(renderTextLayout(after)[4]).toBe('   └▶│   b   │');
    expect(roomViolations(renderTextLayout(after))).toEqual(none);
  });

  it('leaves the drawing as it is where the column would make it wider', () => {
    const before = turning(false);
    expect(openTextColumns(before)).toEqual(before);
  });
});

describe('the check of the rows of a terminal drawing', () => {
  it('finds an arrowhead with no line behind it and two boxes a row apart', () => {
    const found = roomViolations(['┌───┐', '│ a │', '└───┘', '  ▼', '┌───┐', '│ b │', '└───┘']);
    expect(found.headless).toHaveLength(1);
    expect(found.close).toHaveLength(1);
  });

  it('finds an arrowhead on the rule of a band and a box next to the rule', () => {
    const found = roomViolations(['── One ──', '┌───┐', '│ a │', '└───┘', '── Two ▼─', '┌───┐', '│ b │', '└───┘']);
    expect(found.onRule).toHaveLength(1);
    expect(found.tight).toHaveLength(2);
  });

  it('finds nothing in a drawing that keeps the rows', () => {
    expect(roomViolations(['── One ──', '', '┌───┐', '│ a │', '└───┘', '  │', '──┼ Two ─', '  ▼', '┌───┐', '│ b │', '└───┘', '', '── Flow   ┄┄ Pending'])).toEqual(none);
  });
});
