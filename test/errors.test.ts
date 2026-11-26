import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { registeredFrontEnds, render, renderText, renderTextSvg, UrsulaError } from '../src/index.ts';
import { CASES, withLine } from './error-cases.ts';

const root = new URL('..', import.meta.url).pathname;
const cli = (input: string) => spawnSync(process.execPath, [`${root}src/cli.ts`, '--format', 'text'], { input, encoding: 'utf8' });

function errorOf(src: string): UrsulaError {
  try {
    render(src);
  } catch (err) {
    if (err instanceof UrsulaError) return err;
    throw err;
  }
  throw new Error(`no error for:\n${src}`);
}

const results = CASES.map((c) => ({ c, src: withLine(c.type, c.line, c.text), err: errorOf(withLine(c.type, c.line, c.text)) }));

describe('errors say how to fix the text', () => {
  it('covers three broken texts of every type', () => {
    expect(results.length).toBe(3 * registeredFrontEnds().length);
  });

  it.each(results.map((r) => [`${r.c.type}/${r.c.kind}`, r] as const))('%s: names the line and gives an example', (_, { c, err }) => {
    expect(err.line).toBe(c.line + 1);
    expect(err.example).toBeTruthy();
  });

  it('gives a column for at least nine in ten errors that name a line', () => {
    const lined = results.filter((r) => r.err.line !== undefined);
    const located = lined.filter((r) => r.err.column !== undefined);
    expect(located.length / lined.length).toBeGreaterThanOrEqual(0.9);
  });

  it.each(results.map((r) => [`${r.c.type}/${r.c.kind}`, r] as const))('%s: the column points into the line', (_, { src, err }) => {
    if (err.column === undefined || err.line === undefined) return;
    const row = src.split('\n')[err.line - 1] ?? '';
    expect(err.column).toBeGreaterThanOrEqual(1);
    expect(err.column).toBeLessThanOrEqual(row.trimEnd().length + 1);
  });

  it.each(results.filter((r) => r.c.kind === 'header').map((r) => [r.c.type, r] as const))('%s: a misspelt header suggests the header', (type, { err }) => {
    const front = registeredFrontEnds().find((f) => f.name === type);
    expect(front?.headers).toContain(err.suggestion);
  });

  it.each(results.map((r) => [`${r.c.type}/${r.c.kind}`, r] as const))('%s: the example in place of the wrong line draws', (_, { src, err }) => {
    const rows = src.split('\n');
    rows[(err.line ?? 1) - 1] = err.example ?? '';
    expect(() => render(rows.join('\n'))).not.toThrow();
  });

  it('keeps the message as it was', () => {
    expect(errorOf('flowchrt LR\nA --> B').message).toBe("line 1: expected a 'flowchart' or 'graph' header");
    expect(errorOf('flowchart LR\nA-->').message).toBe("line 2: expected a node id near ''");
  });

  it('gives the same fields through renderText and renderTextSvg', () => {
    const text = renderText('wardley-beta\ncompnent Tea [0.6, 0.8]\n', 100);
    expect(text).toMatchObject({ error: 'line 2: Unrecognised line "compnent Tea [0.6, 0.8]".', line: 2, column: 1, suggestion: 'component', example: 'component Tea [0.63, 0.81]' });
    const svg = renderTextSvg('flowchart LR\nA-->', 100);
    expect(svg).toMatchObject({ error: "line 2: expected a node id near ''", line: 2, column: 5, example: 'A --> B' });
  });
});

describe('the example fits the wrong line', () => {
  // A right line of the same kind, or the wrong line put right; never an unrelated line such as the title.
  it.each([
    ['a date that is not a date', 'gantt\n  dateFormat YYYY-MM-DD\n  section s\n  task1 : 2024-13-45, 3d', 'Design : a1, 2024-01-01, 5d', undefined],
    ['a score that is not a number', 'journey\n  section a\n  task: x: me', 'Search events: 4: Me', undefined],
    ['a point outside the chart', 'quadrantChart\n  A: [1.5, 0.2]', 'Campaign A: [0.3, 0.6]', undefined],
    ['a rule without its semicolon', 'railroad-ebnf-beta\n  a = "x" ', 'a = "x" ;', undefined],
    ['a loop never closed', 'sequenceDiagram\n  A->>B: hi\n  loop x\n  A->>B: y', 'end', "close the block with a line 'end' after its last message"],
  ] as const)('%s', (_, src, example, hint) => {
    const err = errorOf(src);
    expect(err.example).toBe(example);
    if (hint !== undefined) expect(err.hint).toBe(hint);
  });

  it("gives no example for an 'end' that closes nothing, and says to delete it", () => {
    for (const src of ['sequenceDiagram\n  A->>B: hi\n  end', 'flowchart LR\n  A --> B\n  end']) {
      const err = errorOf(src);
      expect(err.example).toBeUndefined();
      expect(err.hint).toMatch(/delete it/);
    }
  });
});

describe('the command writes the error with the line, a mark and the advice', () => {
  it('a misspelt header', () => {
    const r = cli('flowchrt LR\nA --> B\n');
    expect(r.status).toBe(1);
    expect(r.stderr).toBe("error: line 1: expected a 'flowchart' or 'graph' header\n  1 | flowchrt LR\n    | ^^^^^^^^\ndid you mean: flowchart\nexample: flowchart LR\n");
  });

  it('a line cut short', () => {
    expect(cli('flowchart LR\nA-->\n').stderr).toBe("error: line 2: expected a node id near ''\n  2 | A-->\n    |     ^\nhint: an arrow needs a node on both ends\nexample: A --> B\n");
  });

  it('a misspelt keyword', () => {
    const r = cli('wardley-beta\ncompnent Tea [0.6, 0.8]\n');
    expect(r.stderr).toContain('  2 | compnent Tea [0.6, 0.8]\n    | ^^^^^^^^\ndid you mean: component\n');
    expect(r.stderr).toContain('example: component Tea [0.63, 0.81]\n');
  });

  it('names the line of a state block left open, with the line, a mark and how to close it', () => {
    expect(cli('stateDiagram-v2\n  [*] --> A\n  state A {\n    B --> C\n').stderr).toBe(
      'error: line 3: "{" is never closed\n  3 |   state A {\n    |           ^\nhint: close the block of this state with a line \'}\' after its last line\nexample: }\n',
    );
    // The '}' closes the inner block; the outer one is the one left open.
    expect(cli('stateDiagram-v2\n  state A {\n    state B {\n      x --> y\n    }\n').stderr).toMatch(/^error: line 2: /);
  });

  it('places the mark by cells when the line holds wide characters', () => {
    const r = cli('flowchart LR\n가나 --> 다라[이름\n');
    // 가나, 다라 and 이름 take two cells each: the open bracket stands 13 cells in, and the mark covers '[이름'.
    expect(r.stderr).toContain(`  2 | 가나 --> 다라[이름\n    | ${' '.repeat(13)}^^^^^\n`);
  });

  it('marks the bracket that is never closed, not one closed earlier on the line', () => {
    expect(cli('flowchart LR\n  ab[start] --> cd[end\n').stderr).toContain(`  2 |   ab[start] --> cd[end\n    | ${' '.repeat(18)}^^^^\n`);
    // 가, 나 take two cells and 시작 four: the open bracket after 나 stands 17 cells in.
    expect(cli('flowchart LR\n  가[시작] --> 나[끝\n').stderr).toContain(`  2 |   가[시작] --> 나[끝\n    | ${' '.repeat(17)}^^^\n`);
    // A bracket inside quotes closes nothing.
    expect(cli('flowchart LR\n  ab("a ) b") --> cd(end\n').stderr).toContain(`    | ${' '.repeat(20)}^^^^\n`);
  });
});
