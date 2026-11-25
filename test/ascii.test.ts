import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { cellWidth, renderText, renderTextSpans, toAscii } from '../src/index.ts';

const root = new URL('..', import.meta.url).pathname;
const NOT_ASCII_DRAWING = /[\u2190-\u21ff\u2500-\u25ff]/;

describe('the ASCII character set', () => {
  it('draws light, heavy and dashed lines with different characters', () => {
    expect(toAscii(['┌──┐ ┏━━┓ ┄┄ ╌╌', '│  │ ┃  ┃ ┆  ╎', '└──┘ ┗━━┛'])).toEqual(['+--+ #==# .. ..', '|  | #  # :  :', '+--+ #==#']);
  });

  it('keeps arrowheads, dots and marks apart', () => {
    expect(toAscii(['──▶ ◀── ▲ ▼ ● ◉ ◆ ◇ ○ ⊕ █ ╭─╮ ╰─╯'])).toEqual(['--> <-- ^ v * @ @ o O @ # /-\\ \\-/']);
  });

  it('gives a hollow head a bar in the cell behind it', () => {
    expect(toAscii(['───▷│', '│◁───', '│◁┘'])).toEqual(['--|>|', '|<|--', '|<|']);
    expect(toAscii(['△', '│', '│', '▽'])).toEqual(['^', '-', '-', 'v']);
    expect(toAscii(['한│', '글▽'])).toEqual(['한-', '글v']);
  });

  it('keeps the bar of a hollow head on a crossing behind it, along the line that crosses there', () => {
    expect(toAscii(['  │', '──┼─┼──', '  ▽ │'])).toEqual(['  |', '----+--', '  v |']);
    expect(toAscii([' │', '─┼▷', ' │'])).toEqual([' |', '-|>', ' |']);
    expect(toAscii(['│◁┼┐', '  │'])).toEqual(['|<|+', '  |']);
  });

  it('draws the bar of a count on an upright line as a bar when told the rows hold such bars', () => {
    const bars = { countBars: true };
    expect(toAscii(['└─┬─┘', '  ┼', '  ┼┌─', '  ││', '  o┼', '  ^^', '┌────┐'], bars)).toEqual(['+-+-+', '  -', '  -+-', '  ||', '  o-', '  ^^', '+----+']);
    expect(toAscii(['└──┘', ' ┼┼', ' ┼┼', ' ││'], bars)).toEqual(['+--+', ' --', ' --', ' ||']);
    expect(toAscii([' │', ' ┼ a', ' ▼', '─┼─'], bars)).toEqual([' |', ' + a', ' v', '-+-']);
    expect(toAscii(['└──┘', ' ┼┼', ' ┼┼', ' ││'])).toEqual(['+--+', ' ++', ' ++', ' ||']);
  });

  it('keeps a crossing a crossing where a label, a mark or a corner stands beside it', () => {
    expect(toAscii(['│◀─ paid ┼▶│', '         └▶'])).toEqual(['|<- paid +>|', '         +>']);
    expect(toAscii(['── Shop ┼┼ «include»', '        ▼▼'])).toEqual(['-- Shop ++ «include»', '        vv']);
    expect(toAscii(['└──┘', '│◇┼1┐'])).toEqual(['+--+', '|o+1+']);
  });

  const CROSSED = [
    ['flowchart', 79, 'flowchart TD\n n0(Ingest)\n n1[Parse]\n n2[Validate order]\n n3[Charge]\n n4[재고 확인]\n n5[Ship]\n n2 --x n4\n n3 --> n4\n n2 -.->|paid| n3\n n1 <-->|paid| n5\n n1 --o|needs review| n4\n n1 --> n5\n n2 <-->|승인| n5\n n0 -.-> n5\n n0 ==> n1'],
    ['use case', 62, 'usecase-beta\ndirection LR\nactor A0("Buyer")\nactor A1("Warehouse clerk")\nactor A2("관리자")\nactor A3("Bot")\nsystemBoundary Shop\n  U0("Ingest")\nend\nU1("Parse")\nU2("Validate order")\nU3("Charge")\nA1 --> U2\nA0 -- U2\nA3 --> U2\nA3 -- U1\nU3 --> U0\nU0 ..> : include U3'],
    ['state', 76, 'stateDiagram-v2\n[*] --> S0\nS1 --> S2\nS5 --> S4 : timeout after 30s\nS5 --> S1\nS4 --> S5\nS3 --> S4\nS3 --> S4 : ok\nS4 --> S0\nS4 --> S5\nS4 --> S2\nS5 --> [*]'],
    ['class', 112, "classDiagram\ndirection LR\nnamespace N0 {\n  class C0 {\n    +field0 int\n    +run()\n  }\n}\nnamespace N1 {\n  class C1 {\n    +run()\n  }\n}\nnamespace N0 {\n  class C2 {\n    +run()\n  }\n}\nnamespace N1 {\n  class C3 {\n  }\n}\nclass C4 {\n  +run()\n}\nclass C5 {\n  +field0 int\n  +field1 int\n  +field2 int\n  +run()\n}\nclass C6 {\n}\nC0 \"1\" <--> \"*\" C3\nC4 \"1\" --|> \"*\" C5 : x\nC6 ..|> C2\nC4 \"1\" o-- \"*\" C5 : 승인\nC0 *-- C2\nC4 --|> C5 : ok\nC2 --* C1 : fail\nC1 --* C5 : 승인"],
    ['class with a hollow head', 73, "classDiagram\ndirection LR\nclass C0 {\n  +field0 int\n  +run()\n}\nclass C1 {\n}\nclass C2 {\n  +run()\n}\nclass C3 {\n  +field0 int\n  +field1 int\n  +field2 int\n  +run()\n}\nclass C4 {\n  +field0 int\n  +field1 int\n  +field2 int\n  +run()\n}\nclass C5 {\n  +field0 int\n  +field1 int\n  +run()\n}\nclass C6 {\n  +run()\n}\nC2 -- C6 : x\nC2 *-- C0 : fail\nC5 <--> C2\nC1 --* C0\nC1 \"1\" <--> \"*\" C6 : x\nC4 -- C2\nC4 <|-- C5\nC0 \"1\" --> \"*\" C6\nC4 ..|> C0\nC6 *-- C3"],
    ['swimlane', 64, "swimlane-beta LR\n  subgraph G0[Web]\n    n0[Ingest]\n    n1[Parse]\n    n2[Validate order]\n  end\n  subgraph G1[Billing]\n    n3[Charge]\n    n4[재고 확인]\n    n5[Ship]\n    n6[Notify]\n  end\n  subgraph G2[Warehouse]\n    n7[Archive]\n    n8[Refund]\n    n9[고객 응대]\n    n10[Audit]\n  end\n  n3 ==>|x| n10\n  n10 <-->|timeout after 30s| n1\n  n6 -->|needs review| n8\n  n3 --> n10\n  n2 -->|ok| n9\n  n5 --o n7\n  n10 -.- n1\n  n7 --> n9\n  n9 -->|x| n0\n  n8 --x|fail| n4\n  n3 -.->|ok| n5"],
  ] as const;
  /** The cell behind each hollow head of the rows, with the bar it gets: `|` beside a head that points sideways, `-` above or below one that points up or down. */
  const barsBehind = (lines: readonly string[]): Map<string, string> => {
    const bars = new Map<string, string>();
    lines.forEach((line, r) =>
      [...line].forEach((ch, i) => {
        if (ch === '▷') bars.set(`${r},${i - 1}`, '|');
        if (ch === '◁') bars.set(`${r},${i + 1}`, '|');
        if (ch === '▽') bars.set(`${r - 1},${i}`, '-');
        if (ch === '△') bars.set(`${r + 1},${i}`, '-');
      }),
    );
    return bars;
  };
  it.each(CROSSED)('draws every crossing of a %s drawing as a crossing, or as the bar of a hollow head along the line that crosses', (_kind, width, src) => {
    const plain = renderText(src, width);
    const ascii = renderText(src, width, { charset: 'ascii' });
    if ('error' in plain || 'error' in ascii) throw new Error('not drawn');
    const bars = barsBehind(plain.lines);
    const crossings = plain.lines.flatMap((line, r) =>
      [...line].flatMap((ch, i) => (ch === '┼' ? [{ got: [...(ascii.lines[r] ?? '')][i], want: bars.get(`${r},${i}`) ?? '+' }] : [])),
    );
    expect(crossings.length).toBeGreaterThan(0);
    expect(crossings.filter(({ got, want }) => got !== want)).toEqual([]);
  });

  const HOLLOW_ON_CROSSING = [
    ['beside', 95, 'classDiagram\nclass C0 {\n  +field0 int\n  +run()\n}\nclass C1 {\n}\nclass C2 {\n  +field0 int\n  +run()\n}\nclass C3 {\n}\nclass C4 {\n  +field0 int\n  +field1 int\n  +field2 int\n}\nclass C5 {\n  +field0 int\n  +field1 int\n  +run()\n}\nclass C6 {\n  +field0 int\n}\nC3 ..> C5\nC3 <|-- C4 : needs review\nC4 <--> C2\nC3 <|-- C4\nC5 ..> C1\nC5 --|> C6'],
    ['above and below', 74, 'classDiagram\nnamespace N0 {\n  class C0 {\n    +field0 int\n    +field1 int\n    +field2 int\n    +run()\n  }\n}\nnamespace N1 {\n  class C1 {\n    +field0 int\n    +field1 int\n    +field2 int\n  }\n}\nnamespace N0 {\n  class C2 {\n    +field0 int\n  }\n}\nnamespace N1 {\n  class C3 {\n    +field0 int\n    +field1 int\n    +field2 int\n  }\n}\nclass C4 {\n  +field0 int\n  +field1 int\n  +field2 int\n  +run()\n}\nC1 ..> C3\nC0 --* C1\nC4 "1" --|> "*" C2\nC0 --* C2\nC0 ..|> C1 : needs review'],
  ] as const;
  it.each(HOLLOW_ON_CROSSING)('keeps an inheritance head %s a crossing apart from an association head', (_where, width, src) => {
    const plain = renderText(src, width);
    const ascii = renderText(src, width, { charset: 'ascii' });
    if ('error' in plain || 'error' in ascii) throw new Error('not drawn');
    const bars = [...barsBehind(plain.lines)];
    const onCrossing = bars.filter(([at]) => {
      const [r = 0, i = 0] = at.split(',').map(Number);
      return [...(plain.lines[r] ?? '')][i] === '┼';
    });
    expect(onCrossing.length).toBeGreaterThan(0);
    const missing = bars.filter(([at, bar]) => {
      const [r = 0, i = 0] = at.split(',').map(Number);
      return [...(ascii.lines[r] ?? '')][i] !== bar;
    });
    expect(missing).toEqual([]);
  });

  it('draws the bars of the counts of an entity-relationship drawing', () => {
    const ascii = renderText('erDiagram\n  A ||--o{ B : has\n  B ||--|{ C : owns', 30, { charset: 'ascii' });
    if ('error' in ascii) throw new Error('not drawn');
    expect(ascii.lines.filter((line) => line.trim() === '-')).toHaveLength(3);
  });

  it('keeps the diamond of a composition apart from a count of many', () => {
    const ascii = renderText('classDiagram\n  Order "1" *-- "*" Line\n  Order "1" --> "*" Item', 80, { charset: 'ascii' });
    if ('error' in ascii) throw new Error('not drawn');
    const text = ascii.lines.join('\n');
    expect(text).toContain('@');
    expect(text.match(/\*/g)).toHaveLength(2);
  });

  it('leaves the text of the diagram as it is', () => {
    expect(toAscii(['│ 주문 접수 «x» │'])).toEqual(['| 주문 접수 «x» |']);
  });

  const examples = readdirSync(`${root}examples`).filter((f) => f.endsWith('.mmd'));
  it.each(examples)('draws %s with as many rows and columns as the default', (name) => {
    const src = readFileSync(`${root}examples/${name}`, 'utf8');
    const plain = renderText(src, 100);
    const ascii = renderText(src, 100, { charset: 'ascii' });
    if ('error' in plain || 'error' in ascii) throw new Error('not drawn');
    expect(ascii.lines.map(cellWidth)).toEqual(plain.lines.map(cellWidth));
    expect(ascii.lines.filter((line) => NOT_ASCII_DRAWING.test(line))).toEqual([]);
    const spans = renderTextSpans(src, 100, { charset: 'ascii' });
    if ('error' in spans) throw new Error('not drawn');
    expect(spans.lines.map((line) => line.map((s) => s.text).join(''))).toEqual(ascii.lines);
  });
});
