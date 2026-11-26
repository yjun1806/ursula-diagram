import { describe, expect, it } from 'vitest';
import { runCommand } from '../src/command/run.ts';
import { callTool } from '../src/mcp/tools.ts';
import { fixSource, render, UrsulaError } from '../src/index.ts';
import { CASES, withLine } from './error-cases.ts';

/** The text of a tool result's content, or undefined for an image. */
const textOf = (c: ReturnType<typeof callTool>['content'][number] | undefined): string | undefined => (c?.type === 'text' ? c.text : undefined);

const draws = (src: string): boolean => {
  try {
    render(src);
    return true;
  } catch (err) {
    if (err instanceof UrsulaError) return false;
    throw err;
  }
};

const run = (args: string[], src: string) => runCommand(args, () => src);

describe('fixSource fixes a misspelt header', () => {
  it.each([
    ['flowchrt LR\n  A --> B', 'flowchart LR\n  A --> B'],
    ['Flowchart LR\n  A --> B', 'flowchart LR\n  A --> B'],
    ['seuenceDiagram\n  Alice->>Bob: Hi', 'sequenceDiagram\n  Alice->>Bob: Hi'],
    ['stteDiagram-v2\n  [*] --> Idle', 'stateDiagram-v2\n  [*] --> Idle'],
    ['pi title Pets\n  "Dogs" : 3', 'pie title Pets\n  "Dogs" : 3'],
    ['---\ntitle: Shop\n---\nflowchrt TD\n  A --> B', '---\ntitle: Shop\n---\nflowchart TD\n  A --> B'],
  ])('%j', (src, fixed) => {
    const out = fixSource(src);
    expect(out.source).toBe(fixed);
    expect(out.fixes).toHaveLength(1);
    expect(out.fixes[0]?.reason).toMatch(/diagram type/);
    expect(draws(out.source)).toBe(true);
  });

  it('names the line, the column and the two words', () => {
    expect(fixSource('%% a comment\n  flowchrt LR\n  A --> B').fixes).toEqual([
      { line: 2, column: 3, from: 'flowchrt', to: 'flowchart', reason: "'flowchrt' is no diagram type; 'flowchart' is the only one this close" },
    ]);
  });

  it('keeps Windows line ends', () => {
    expect(fixSource('flowchrt LR\r\n  A --> B\r\n').source).toBe('flowchart LR\r\n  A --> B\r\n');
  });
});

describe('fixSource fixes a misspelt keyword with one suggestion', () => {
  it.each([
    ['flowchart LR\n  A --> B\n  subgrap s[Shop]\n    C\n  end', 'subgrap', 'subgraph'],
    ['flowchart LR\n  A --> B\n  styl A fill:#f00', 'styl', 'style'],
    ['sequenceDiagram\n  participnt A as App\n  A->>A: Hi', 'participnt', 'participant'],
    ['sequenceDiagram\n  Alice ->> Bob: hi\n  lop every\n  Bob ->> Alice: x\n  end', 'lop', 'loop'],
    ['gitGraph\n  commit\n  branch feature\n  chekout feature\n  commit', 'chekout', 'checkout'],
    ['pie titel Pets\n  "Dogs" : 3', 'titel', 'title'],
    ['wardley-beta\ncompnent Tea [0.63, 0.81]', 'compnent', 'component'],
  ])('%j', (src, from, to) => {
    const out = fixSource(src);
    expect(out.fixes.map((f) => [f.from, f.to])).toEqual([[from, to]]);
    expect(out.source).toBe(src.replace(from, to));
    expect(draws(out.source)).toBe(true);
  });
});

describe('fixSource fixes -> in a flowchart', () => {
  it.each([
    ['flowchart LR\n  A -> B', 'flowchart LR\n  A --> B'],
    ['flowchart LR\n  A[Start] -> B[End]', 'flowchart LR\n  A[Start] --> B[End]'],
    ['graph TD\n  A --> B\n  B -> C -> D', 'graph TD\n  A --> B\n  B --> C --> D'],
  ])('%j', (src, fixed) => {
    const out = fixSource(src);
    expect(out.source).toBe(fixed);
    expect(out.fixes.every((f) => f.from === '->' && f.to === '-->')).toBe(true);
    expect(draws(out.source)).toBe(true);
  });

  it('points at the arrow it changed', () => {
    expect(fixSource('flowchart LR\n  A[Start] -> B').fixes).toEqual([{ line: 2, column: 12, from: '->', to: '-->', reason: 'a flowchart arrow is -->; -> is not one' }]);
  });
});

describe('fixSource leaves alone what it cannot fix for sure', () => {
  it.each([
    ['a header two types are as near to', 'railroad-bnf-beta\nnumber = digit ;'],
    ['a line cut short', 'flowchart LR\n  A -->'],
    ['a bracket never closed', 'flowchart LR\n  A[Start --> B'],
    ['a subgraph never closed', 'flowchart LR\n  subgraph s\n  A --> B'],
    ['an end too many', 'flowchart LR\n  A --> B\n  end'],
    ['an indent', 'mindmap\n  root((Launch))\n  Product'],
    ['a suggestion for a name used on other lines', 'stateDiagram-v2\n  [*] --> Idle\n  Idle --> Done\n  Idle --> Done :: finish'],
    ['a value that is not a number', 'sankey-beta\nBudget,Rent,lots'],
    ['a header no type is near', 'drawing LR\n  A --> B'],
  ])('%s', (_, src) => {
    expect(draws(src)).toBe(false);
    expect(fixSource(src)).toEqual({ source: src, fixes: [] });
  });

  it('changes nothing in a text that draws', () => {
    const src = 'flowchart LR\n  A[Order] --> B{Paid?}\n  B -->|yes| C[Ship]';
    expect(fixSource(src)).toEqual({ source: src, fixes: [] });
  });

  it('keeps the fixes before an error it cannot fix', () => {
    const out = fixSource('flowchrt LR\n  A -->');
    expect(out.source).toBe('flowchart LR\n  A -->');
    expect(out.fixes).toHaveLength(1);
  });

  it('never changes the number of lines', () => {
    for (const c of CASES) {
      const src = withLine(c.type, c.line, c.text);
      expect(fixSource(src).source.split('\n').length).toBe(src.split('\n').length);
    }
  });
});

describe('fixSource repeats and stops', () => {
  it('fixes a header and a keyword in one call', () => {
    const out = fixSource('flowchrt LR\n  A --> B\n  subgrap s\n    C\n  end');
    expect(out.fixes.map((f) => f.to)).toEqual(['flowchart', 'subgraph']);
    expect(draws(out.source)).toBe(true);
  });

  it('makes five fixes at most', () => {
    const src = `flowchart LR\n${Array.from({ length: 7 }, (_, i) => `  N${i} -> M${i}`).join('\n')}`;
    const out = fixSource(src);
    expect(out.fixes).toHaveLength(5);
    expect(out.source.split('\n').filter((l) => l.includes(' --> '))).toHaveLength(5);
    expect(draws(out.source)).toBe(false);
  });

  it('gives the same answer every time', () => {
    for (const c of CASES) {
      const src = withLine(c.type, c.line, c.text);
      expect(fixSource(src)).toEqual(fixSource(src));
    }
  });
});

describe('ursula-diagram --fix', () => {
  const broken = 'flowchrt LR\n  A --> B\n';

  it('draws the fixed text and names each fix on standard error', () => {
    const r = run(['--fix', '--format', 'svg'], broken);
    expect(r.code).toBe(0);
    expect(r.stdout).toBe(run(['--format', 'svg'], 'flowchart LR\n  A --> B\n').stdout);
    expect(r.stderr).toBe('fixed: line 1: flowchrt → flowchart\n');
  });

  it('puts the fixes before the check report', () => {
    const r = run(['--fix', '--format', 'text', '--width', '80', '--check'], broken);
    expect(r.code).toBe(0);
    expect(r.stderr.startsWith('fixed: line 1: flowchrt → flowchart\n')).toBe(true);
    expect(r.stderr.slice('fixed: line 1: flowchrt → flowchart\n'.length)).toBe(run(['--format', 'text', '--width', '80', '--check'], 'flowchart LR\n  A --> B\n').stderr);
  });

  it('works with --format check', () => {
    const r = run(['--fix', '--format', 'check'], broken);
    expect(r.code).toBe(0);
    expect(r.stdout).toBe(run(['--format', 'check'], 'flowchart LR\n  A --> B\n').stdout);
    expect(r.stderr).toBe('fixed: line 1: flowchrt → flowchart\n');
  });

  it('puts the fixes before an error it cannot fix, and exits 1', () => {
    const r = run(['--fix', '--format', 'text'], 'flowchrt LR\n  A -->\n');
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/^fixed: line 1: flowchrt → flowchart\nerror: line 2: /);
  });

  it('prints the same as without --fix when there is nothing to fix', () => {
    for (const src of ['flowchart LR\n  A --> B\n', 'flowchart LR\n  A -->\n']) {
      for (const format of ['svg', 'text', 'check']) expect(run(['--fix', '--format', format], src)).toEqual(run(['--format', format], src));
    }
  });

  it('does not fix without --fix', () => {
    expect(run(['--format', 'svg'], broken).code).toBe(1);
  });
});

describe('ursula-diagram --format fixed', () => {
  it('prints the fixed text to standard output', () => {
    const r = run(['--format', 'fixed'], 'flowchrt LR\n  A -> B\n');
    expect(r).toEqual({ stdout: 'flowchart LR\n  A --> B\n', stderr: 'fixed: line 1: flowchrt → flowchart\nfixed: line 2: -> → -->\n', code: 0 });
  });

  it('prints a text that draws unchanged', () => {
    expect(run(['--format', 'fixed'], 'flowchart LR\n  A --> B\n')).toEqual({ stdout: 'flowchart LR\n  A --> B\n', stderr: '', code: 0 });
  });

  it('prints what it could fix and the error that is left, and exits 1', () => {
    const r = run(['--format', 'fixed'], 'flowchrt LR\n  A -->\n');
    expect(r.code).toBe(1);
    expect(r.stdout).toBe('flowchart LR\n  A -->\n');
    expect(r.stderr).toMatch(/^fixed: line 1: flowchrt → flowchart\nerror: line 2: expected a node id/);
  });
});

describe('MCP fix', () => {
  it('render draws the fixed text and returns the fixes and the fixed text', () => {
    const out = callTool('render', { source: 'flowchrt LR\n  A --> B', fix: true });
    expect(out.isError).toBe(false);
    expect(textOf(out.content[0])).toBe(textOf(callTool('render', { source: 'flowchart LR\n  A --> B' }).content[0]));
    expect(textOf(out.content.at(-1))).toBe('fixed: line 1: flowchrt → flowchart\n\nfixed source:\nflowchart LR\n  A --> B');
  });

  it('check reports on the fixed text', () => {
    const out = callTool('check', { source: 'flowchrt LR\n  A --> B', fix: true });
    expect(out.isError).toBe(false);
    expect(textOf(out.content[0])).toBe(textOf(callTool('check', { source: 'flowchart LR\n  A --> B' }).content[0]));
    expect(out.content).toHaveLength(2);
  });

  it('returns the error that is left with the fixes', () => {
    const out = callTool('render', { source: 'flowchrt LR\n  A -->', fix: true });
    expect(out.isError).toBe(true);
    expect(textOf(out.content[0])).toMatch(/^error: line 2: /);
    expect(textOf(out.content.at(-1))).toContain('fixed source:\nflowchart LR\n  A -->');
  });

  it('returns the same as without fix when there is nothing to fix', () => {
    for (const source of ['flowchart LR\n  A --> B', 'flowchart LR\n  A -->']) {
      expect(callTool('render', { source, fix: true })).toEqual(callTool('render', { source }));
      expect(callTool('check', { source, fix: true })).toEqual(callTool('check', { source }));
    }
  });

  it('does not fix without fix, and refuses a fix that is not true or false', () => {
    expect(callTool('render', { source: 'flowchrt LR\n  A --> B' }).isError).toBe(true);
    expect(() => callTool('render', { source: 'flowchart LR\n  A --> B', fix: 'yes' })).toThrow(/"fix" must be true or false/);
  });
});

describe('the error for -> in a flowchart', () => {
  it('says the arrow is --> and gives the line put right', () => {
    try {
      render('flowchart LR\n  remind -> pay');
      throw new Error('drew');
    } catch (err) {
      expect(err).toBeInstanceOf(UrsulaError);
      expect((err as UrsulaError).hint).toBe('a flowchart arrow is -->; -> is not one');
      expect((err as UrsulaError).example).toBe('remind --> pay');
    }
  });
});

describe('the broken texts of the error tests', () => {
  it('draws 50 of the 93 with fixSource: every misspelt header and the misspelt keywords', () => {
    const drawn = CASES.filter((c) => draws(fixSource(withLine(c.type, c.line, c.text)).source));
    expect(CASES).toHaveLength(93);
    expect(drawn.filter((c) => c.kind === 'header')).toHaveLength(31);
    expect(drawn.filter((c) => c.kind === 'cut')).toHaveLength(0);
    expect(drawn).toHaveLength(50);
  });
});
