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

  it('places the mark by cells when the line holds wide characters', () => {
    const r = cli('flowchart LR\n가나 --> 다라[이름\n');
    // 가나, 다라 and 이름 take two cells each: the mark stands 18 cells in, just past the end.
    expect(r.stderr).toContain(`  2 | 가나 --> 다라[이름\n    | ${' '.repeat(18)}^\n`);
  });
});
