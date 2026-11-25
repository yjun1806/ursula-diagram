import { describe, expect, it } from 'vitest';
import { renderText, renderTextLayout } from '../src/index.ts';
import type { Layout, LayoutEdge, LayoutNode } from '../src/index.ts';
import { closeSpareRows, openTextColumns, openTextRows } from '../src/layout/text-room.ts';
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
    // The label stands beside its line under the rule, where it leaves the rule to the name of the band.
    expect(lines.slice(rule, rule + 3).map((row) => row.trim())).toEqual(['────┼ Stock', '┆  uses', 'v']);
    expect(roomViolations(lines)).toEqual(none);
  });

  it('are closed again where a later row left one that only upright lines pass', () => {
    const lines = text('classDiagram\n  namespace Platform {\n    namespace Auth {\n      class UserService {\n        +login()\n        +logout()\n      }\n    }\n    namespace Data {\n      class Repository {\n        +find()\n        +save()\n      }\n    }\n    class Gateway {\n      +route()\n    }\n  }\n  Gateway --> UserService : delegates\n  Gateway --> Repository : delegates');
    const rule = lines.findIndex((line) => line.includes('Platform / Data'));
    // The arrowhead stands right under the rule its line crosses: the crossing is the cell of line behind it.
    expect(lines.slice(rule, rule + 2).map((row) => row.trim())).toEqual(['───────┼ Platform / Data ────', 'v']);
    expect(roomViolations(lines)).toEqual(none);
  });

  it('leave every mark in sight beside a label', () => {
    const marks = (lines: string[]): number => (lines.join('').match(/[▶◀▲▼▷◁▽△◆◇]/g) ?? []).length;
    // The line that came level under a box turns up into it where a label stood beside the upright line next to it.
    const flow = 'flowchart LR\n  n0{Ingest}\n  n1([Parse])\n  n2[Validate order]\n  n3(Charge)\n  n4[재고 확인]\n  n5[Ship]\n  n6{Notify}\n  n1 === n5\n  n1 --x n2\n  n0 ---|ok| n5\n  n1 === n4\n  n1 --> n4\n  n0 <--> n4\n  n4 --o|승인| n6\n  n6 ==> n6\n  n6 --x n4\n  n3 <-->|fail| n4\n  n2 -.- n4\n  n2 -->|paid| n1';
    expect(marks(text(flow, 100))).toBe(10);
    // The label of a level line stood over the mark of another line on the box below.
    const body = (n: number, run: boolean): string => `class C${n} {\n${Array.from({ length: [3, 1, 1, 3, 3, 3, 3][n] as number }, (_, k) => `  +field${k} int\n`).join('')}${run ? '  +run()\n' : ''}}`;
    const classes = `classDiagram\ndirection LR\n${[true, false, true, true, true, true, false].map((run, n) => body(n, run)).join('\n')}\nC5 ..> C3 : timeout after 30s\nC5 --* C2 : ok\nC5 --> C3 : paid\nC6 ..|> C4 : fail\nC6 --* C4\nC5 --* C4\nC4 *-- C3 : fail\nC5 --* C0\nC0 "1" *-- "*" C2\nC0 <|-- C6`;
    expect(marks(text(classes, 100))).toBe(8);
  });

  it('leave a label off the rule of a band whose name would be written over it', () => {
    const src = 'flowchart LR\n  subgraph G0[Web]\n    n0[Ingest]\n    n1[Parse]\n    n2[Validate order]\n  end\n  subgraph G1[Billing]\n    n3[Charge]\n    n4[재고 확인]\n    n5[Ship]\n    n6[Notify]\n  end\n  subgraph G2[Warehouse]\n    n7[Archive]\n  end\n  subgraph G3[고객 지원]\n    n8[Refund]\n    n9[고객 응대]\n    n10[Audit]\n  end\n  subgraph G4[Ops]\n    n11[Escalate]\n  end\n  n4 -->|ok| n5\n  n0 --> n11\n  n2 ==> n11\n  n11 --> n0\n  n7 -.- n10\n  n2 --x n10\n  n4 --- n1\n  n5 --x|paid| n7\n  n0 --x n10\n  n1 -.-> n4\n  n7 -.-|ok| n9\n  n9 --> n0\n  n2 <--> n6\n  n1 --> n10\n  n0 -.-> n10';
    const lines = text(src, 60);
    const rule = lines.findIndex((row) => row.startsWith('── Warehouse '));
    // The name has no free place on its rule and is written over the lines that cross it: the arrowhead below gets a cell of its line first.
    expect(lines.slice(rule, rule + 3).map((row) => row.slice(0, 16))).toEqual(['── Warehouse ──┼', '      │  paid  │', '      ▼        │']);
    expect(roomViolations(lines)).toEqual(none);
  });

  it('leave the width of the boxes and the bands of a flowchart as they are chosen without the rows', () => {
    const widest = (lines: string[]): number => Math.max(...lines.map((row) => [...row].length));
    const plain = 'flowchart TD\n  n0[Ingest]\n  n1(Parse)\n  n2[Validate order]\n  n3[Charge]\n  n4[Stock]\n  n5{Ship}\n  n6[Notify]\n  n7[Archive]\n  n8[Refund]\n  n9[Support]\n  n10[Audit]\n  n0 ==> n10\n  n0 ===|ok| n5\n  n3 ===|x| n6\n  n1 -.-> n2\n  n0 --o n4\n  n8 --> n5\n  n1 -.-> n5\n  n5 ===|paid| n9\n  n3 -.- n7\n  n2 -.- n5';
    expect(widest(text(plain, 120))).toBe(42);
    const nested = 'flowchart TD\n  subgraph Out[Outer]\n    n0[Parse]\n    subgraph In[Inner]\n      n1[Validate order]\n      n2[Charge]\n    end\n  end\n  subgraph Side[Side]\n    n3[Stock]\n  end\n  n4[Ship]\n  n4 --> n1\n  n1 -->|needs review| n2\n  n2 --> n4\n  n0 -->|fail| n4\n  n2 --> n1';
    const lines = text(nested, 60);
    expect(lines.filter((row) => /^[─├].*(Outer|Inner|Side)/.test(row))).toHaveLength(3);
    expect(roomViolations(lines)).toEqual(none);
  });

  it('are opened in every drawing of a few boxes', () => {
    for (let seed = 1; seed <= 40; seed++) {
      for (const bands of [false, true]) {
        const src = generate(seed, bands);
        for (const width of [80, 120]) {
          const found = roomViolations(text(src, width));
          expect(found, `${src}\n${width}`).toEqual(none);
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

describe('a row taken out of a terminal drawing again', () => {
  const box = (id: string, x: number, y: number): LayoutNode => ({ id, lane: '', rank: 0, span: 1, row: 0, x, y, w: 7, h: 3, title: id, lines: [], shape: 'rect' });
  const drawing = (gap: number): Layout => ({
    width: 7,
    height: 6 + gap,
    direction: 'TD',
    laneAxis: 'across',
    lanes: [],
    nodes: [box('a', 0, 0), box('b', 0, 3 + gap)],
    edges: [{ from: 'a', to: 'b', style: 'normal', points: [{ x: 3.5, y: 3 }, { x: 3.5, y: 3 + gap }] }],
    diagnostics: [],
  });

  it('is one that only an upright line passes, as long as the rows that are left are enough', () => {
    expect(closeSpareRows(drawing(4)).height).toBe(drawing(2).height);
    expect(renderTextLayout(closeSpareRows(drawing(4)))).toEqual(renderTextLayout(drawing(2)));
  });

  it('is never one of the two rows between two boxes a line joins', () => {
    expect(closeSpareRows(drawing(2))).toEqual(drawing(2));
  });

  it('is never a row with a label in it', () => {
    const labelled = { ...drawing(3), width: 9, edges: drawing(3).edges.map((e) => ({ ...e, label: { text: 'yes', x: 4, y: 4, w: 5, h: 1 } })) };
    expect(closeSpareRows(labelled).edges[0]?.label?.y).toBe(4);
    expect(renderTextLayout(closeSpareRows(labelled)).join('\n')).toContain('│ yes');
  });

  it('is never one that would bring a label right against a box', () => {
    const labelled = { ...drawing(3), width: 9, edges: drawing(3).edges.map((e) => ({ ...e, label: { text: 'yes', x: 4, y: 4, w: 5, h: 1 } })) };
    expect(closeSpareRows(labelled).height).toBe(labelled.height);
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

  it('stays within the width where the rules of the bands are laid out longer than the drawing is wide', () => {
    const src = 'swimlane-beta LR\n  subgraph G0[Web]\n    n0[Ingest]\n    n1[Parse]\n  end\n  subgraph G1[Billing]\n    n2[Validate order]\n    n3[Charge]\n    n4[재고 확인]\n  end\n  subgraph G2[Warehouse]\n    n5[Ship]\n    n6[Notify]\n    n7[Archive]\n  end\n  subgraph G3[고객 지원]\n    n8[Refund]\n  end\n  subgraph G4[Ops]\n    n9[고객 응대]\n    n10[Audit]\n    n11[Escalate]\n  end\n  n1 -.- n9\n  n3 --> n4\n  n2 -->|paid| n1\n  n0 ==> n5\n  n5 --x|x| n7\n  n0 -->|x| n3\n  n7 -->|x| n9\n  n10 -->|needs review| n5\n  n3 -.- n11\n  n2 --> n11\n  n0 === n10\n  n7 -.-|ok| n9\n  n1 -.-|paid| n4\n  n5 --> n6\n  n0 --> n2\n  n4 -->|ok| n10\n  n7 -->|paid| n8\n  n0 ---|needs review| n10';
    const out = renderText(src, 60);
    expect('lines' in out && out.lines.some((row) => row.includes('┌'))).toBe(true);
  });

  it('makes the drawing wider for the column only within the width it is given', () => {
    const before = turning(false);
    expect(openTextColumns(before, 13)).toEqual(before);
    const after = openTextColumns(before, 14);
    expect(after.width).toBe(14);
    expect(renderTextLayout(after)[4]).toBe('   └▶│   b   │');
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
