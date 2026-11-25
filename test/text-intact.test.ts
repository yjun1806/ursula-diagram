import { describe, expect, it } from 'vitest';
import { cellRuler, layout, parse, renderText, renderTextLayout } from '../src/index.ts';
import type { Layout } from '../src/index.ts';
import { layoutRanks } from '../src/layout/text-ranks.ts';
import { breaksOf } from './text-intact.ts';

const DECISION = 'graph TD\n  A[요청] --> B{검증}\n  B -->|통과| C[저장]\n  B -->|실패| D[에러]\n  C --> E[알림]\n  D --> E';
const SERVICES = 'graph LR\n  A[Client] -->|HTTP| B[API] --> C[DB]\n  B --> D[Cache]';

const drawn = (src: string, width = 90): { laid: Layout; lines: string[]; labels: string[] } => {
  const graph = parse(src);
  const laid = layout(graph, cellRuler(), { maxWidth: width });
  return { laid, lines: renderTextLayout(laid), labels: graph.edges.flatMap((e) => (e.label === undefined ? [] : [e.label])) };
};

/** The rows with the text of one row from column `x` on written over. */
const over = (lines: readonly string[], y: number, x: number, text: string): string[] =>
  lines.map((line, k) => {
    if (k !== y) return line;
    const cells = [...line.padEnd(x + text.length)];
    return [...cells.slice(0, x), ...text, ...cells.slice(x + text.length)].join('');
  });

const clean = { brokenLines: 0, brokenBoxes: 0, tangled: 0, strayLabels: 0, crowdedLabels: 0, coveredLabels: 0, labelsAtHeads: 0, room: 0, unseen: 0, forks: 0, crossMarks: 0, mixedNets: 0, hugging: 0 };

describe('the breaks of a terminal drawing', () => {
  it('are none in a drawing that keeps every line, box and label whole', () => {
    for (const src of [DECISION, SERVICES]) {
      const { laid, lines, labels } = drawn(src);
      expect(breaksOf(laid, lines, labels)).toEqual(clean);
    }
  });

  it('count a line with a gap in it, and a box with a side written over', () => {
    const { laid, lines, labels } = drawn(DECISION);
    const stem = lines.findIndex((line) => line.trim() === '│');
    const x = (lines[stem] ?? '').indexOf('│');
    expect(breaksOf(laid, over(lines, stem, x, ' '), labels)).toMatchObject({ brokenLines: 1, brokenBoxes: 0, tangled: 0, strayLabels: 0, coveredLabels: 0 });
    const top = lines.findIndex((line) => line.includes('┌──────┐'));
    const corner = (lines[top] ?? '').indexOf('┌');
    expect(breaksOf(laid, over(lines, top, corner + 2, 'x'), labels)).toEqual({ ...clean, brokenBoxes: 1 });
  });

  it('count a label written over, and a label with no line between it and an arrowhead', () => {
    const { laid, lines, labels } = drawn(SERVICES);
    const row = lines.findIndex((line) => line.includes('HTTP'));
    const x = (lines[row] ?? '').indexOf('HTTP');
    expect(breaksOf(laid, over(lines, row, x, 'HxTP'), labels)).toMatchObject({ coveredLabels: 1, unseen: 1 });
    // The label one cell nearer the arrowhead: a blank, and no line, between them.
    const near: Layout = { ...laid, edges: laid.edges.map((e) => (e.label === undefined ? e : { ...e, label: { ...e.label, x: e.label.x + 1 } })) };
    const shifted = renderTextLayout(near);
    expect(shifted.join('\n')).toContain('HTTP ▶');
    expect(breaksOf(near, shifted, labels)).toMatchObject({ labelsAtHeads: 1, coveredLabels: 0 });
  });

  it('count labels that run together and a label beside two lines one cell apart', () => {
    const together = parse('graph TD\n  A[요청] --> B{검증}\n  B -->|통과| C[저장]\n  B -->|실패| D[에러]\n  D -->|재시도| A\n  C --> E[알림]');
    const byRanks = layoutRanks(together, cellRuler(), 100) as Layout;
    const lines = renderTextLayout(byRanks);
    expect(lines.join('\n')).toContain('│ 통과  실패 │');
    // 통과 and 실패 run together; 재시도 stands beside the two lines of 요청.
    expect(breaksOf(byRanks, lines).crowdedLabels).toBe(3);
  });

  it('count lines that run along one another and two lines that cross twice', () => {
    const box = (id: string, x: number, y: number): Layout['nodes'][number] => ({ id, lane: '', rank: 0, span: 1, row: 0, x, y, w: 5, h: 3, title: id, lines: [], shape: 'rect' });
    const along: Layout = {
      width: 30,
      height: 9,
      direction: 'LR',
      laneAxis: 'across',
      lanes: [],
      nodes: [box('a', 0, 0), box('b', 20, 0), box('c', 0, 6), box('d', 20, 6)],
      edges: [
        { from: 'a', to: 'b', style: 'normal', points: [{ x: 5, y: 1.5 }, { x: 10.5, y: 1.5 }, { x: 10.5, y: 4.5 }, { x: 15.5, y: 4.5 }, { x: 15.5, y: 1.5 }, { x: 20, y: 1.5 }] },
        { from: 'c', to: 'd', style: 'normal', points: [{ x: 5, y: 7.5 }, { x: 8.5, y: 7.5 }, { x: 8.5, y: 4.5 }, { x: 17.5, y: 4.5 }, { x: 17.5, y: 7.5 }, { x: 20, y: 7.5 }] },
      ],
      diagnostics: [],
    };
    expect(breaksOf(along, renderTextLayout(along)).tangled).toBeGreaterThan(0);
    const twice: Layout = {
      ...along,
      edges: [
        { from: 'a', to: 'd', style: 'normal', points: [{ x: 5, y: 1.5 }, { x: 12.5, y: 1.5 }, { x: 12.5, y: 7.5 }, { x: 20, y: 7.5 }] },
        { from: 'c', to: 'b', style: 'normal', points: [{ x: 5, y: 7.5 }, { x: 8.5, y: 7.5 }, { x: 8.5, y: 4.5 }, { x: 16.5, y: 4.5 }, { x: 16.5, y: 1.5 }, { x: 20, y: 1.5 }] },
      ],
    };
    expect(breaksOf(twice, renderTextLayout(twice)).tangled).toBe(0);
    const thrice: Layout = {
      ...along,
      edges: [
        { from: 'a', to: 'd', style: 'normal', points: [{ x: 5, y: 1.5 }, { x: 12.5, y: 1.5 }, { x: 12.5, y: 7.5 }, { x: 20, y: 7.5 }] },
        { from: 'c', to: 'b', style: 'normal', points: [{ x: 5, y: 7.5 }, { x: 7.5, y: 7.5 }, { x: 7.5, y: 3.5 }, { x: 14.5, y: 3.5 }, { x: 14.5, y: 5.5 }, { x: 10.5, y: 5.5 }, { x: 10.5, y: 0.5 }, { x: 17.5, y: 0.5 }, { x: 17.5, y: 1.5 }, { x: 20, y: 1.5 }] },
      ],
    };
    expect(breaksOf(thrice, renderTextLayout(thrice)).tangled).toBeGreaterThan(0);
  });

  it('leave no count at the end of a line on the label of another', () => {
    const src = [
    'classDiagram',
    'namespace N0 {',
    '  class C0 {',
    '    +run()',
    '  }',
    '}',
    'namespace N1 {',
    '  class C1 {',
    '    +field0 int',
    '    +field1 int',
    '    +run()',
    '  }',
    '}',
    'namespace N0 {',
    '  class C2 {',
    '    +run()',
    '  }',
    '}',
    'namespace N1 {',
    '  class C3 {',
    '  }',
    '}',
    'class C4 {',
    '  +field0 int',
    '  +field1 int',
    '}',
    'class C5 {',
    '}',
    'class C6 {',
    '  +field0 int',
    '}',
    'C2 o-- C6 : after 2 failed tries',
    'C5 ..> C1',
    'C6 o-- C4 : no',
    'C2 "1" <|-- "*" C6',
    'C0 --* C1',
    'C3 o-- C0',
    'C3 <--> C2',
    'C5 "1" --> "*" C6',
    'C0 --* C5',
    'C5 "1" ..> "*" C6 : done',
    ].join('\n');
    const out = renderText(src, 60);
    const lines = 'lines' in out ? out.lines : [];
    expect(lines.join('\n')).toContain('after 2 failed tries');
    expect(lines.join('\n')).not.toContain('a1ter');
  });

  it('write no count at the end of a line right against a label', () => {
    const glued = (lines: readonly string[], text: string): boolean => lines.some((line) => new RegExp(`[0-9*]${text}|${text}[0-9*]`).test(line));
    const across = [
      "classDiagram",
      "namespace N0 {",
      "  class C0 {",
      "  }",
      "}",
      "namespace N1 {",
      "  class C1 {",
      "    +field0 int",
      "  }",
      "}",
      "namespace N0 {",
      "  class C2 {",
      "    +field0 int",
      "    +field1 int",
      "    +run()",
      "  }",
      "}",
      "namespace N1 {",
      "  class C3 {",
      "    +field0 int",
      "    +field1 int",
      "  }",
      "}",
      "class C4 {",
      "  +field0 int",
      "  +field1 int",
      "  +field2 int",
      "}",
      "class C5 {",
      "  +field0 int",
      "  +run()",
      "}",
      "C2 o-- C3",
      "C5 <--> C3 : retry",
      "C4 ..> C0 : retry",
      "C3 o-- C5",
      "C3 \"1\" --o \"*\" C4",
      "C1 --* C4 : 통과",
      "C3 \"1\" o-- \"*\" C5",
      "C5 --* C0",
    ].join('\n');
    const done = [
      "classDiagram",
      "namespace N0 {",
      "  class C0 {",
      "  }",
      "}",
      "namespace N1 {",
      "  class C1 {",
      "    +field0 int",
      "    +field1 int",
      "    +field2 int",
      "  }",
      "}",
      "namespace N0 {",
      "  class C2 {",
      "    +field0 int",
      "    +field1 int",
      "  }",
      "}",
      "namespace N1 {",
      "  class C3 {",
      "  }",
      "}",
      "class C4 {",
      "  +field0 int",
      "  +field1 int",
      "}",
      "class C5 {",
      "  +field0 int",
      "  +run()",
      "}",
      "C0 \"1\" -- \"*\" C1 : done",
      "C4 <--> C2 : on hold",
      "C1 -- C4",
      "C1 *-- C2",
      "C1 \"1\" <|-- \"*\" C0",
      "C3 o-- C1",
      "C5 --|> C1 : no",
    ].join('\n');
    const no = [
      "classDiagram",
      "direction LR",
      "class C0 {",
      "  +field0 int",
      "  +field1 int",
      "  +field2 int",
      "  +run()",
      "}",
      "class C1 {",
      "}",
      "class C2 {",
      "  +field0 int",
      "  +field1 int",
      "  +field2 int",
      "}",
      "class C3 {",
      "  +field0 int",
      "  +field1 int",
      "  +run()",
      "}",
      "class C4 {",
      "  +field0 int",
      "  +field1 int",
      "}",
      "class C5 {",
      "}",
      "class C6 {",
      "}",
      "class C7 {",
      "  +field0 int",
      "  +field1 int",
      "  +run()",
      "}",
      "C1 <|-- C7 : yes",
      "C1 *-- C3",
      "C5 \"1\" <|-- \"*\" C1 : after 2 failed tries",
      "C1 \"1\" --|> \"*\" C0 : yes",
      "C0 o-- C3 : no",
      "C4 \"1\" --* \"*\" C1",
      "C3 --|> C4 : on hold",
    ].join('\n');
    for (const [src, width, text] of [[across, 80, 'retry'], [done, 100, 'done'], [no, 100, 'no']] as const) {
      const out = renderText(src, width);
      const lines = 'lines' in out ? out.lines : [];
      expect(lines.join('\n')).toContain(text);
      expect(glued(lines, text), lines.join('\n')).toBe(false);
    }
  });
});
