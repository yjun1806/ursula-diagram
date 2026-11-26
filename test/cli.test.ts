import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { OPTIONS } from '../src/command/args.ts';
import { runCommand } from '../src/command/run.ts';
import { registerFrontEnd } from '../src/index.ts';
import { VERSION } from '../src/version.ts';

const root = new URL('..', import.meta.url).pathname;
const cli = (args: string[], input = ''): { stdout: string; stderr: string; status: number | null } => {
  const r = spawnSync(process.execPath, [`${root}src/cli.ts`, ...args], { input, encoding: 'utf8' });
  return { stdout: r.stdout, stderr: r.stderr, status: r.status };
};

describe('--help', () => {
  it('prints the guide to standard output and exits 0', () => {
    for (const flag of ['--help', '-h']) {
      const r = cli([flag]);
      expect(r.status).toBe(0);
      expect(r.stderr).toBe('');
      expect(r.stdout).toMatch(/^ursula-diagram/);
      expect(r.stdout.split('\n').length).toBeLessThanOrEqual(60);
    }
  });

  it('names every option the command takes', () => {
    const text = cli(['--help']).stdout;
    for (const o of OPTIONS) expect(text).toContain(o.name);
  });

  it('names the commands, the formats and the exit codes', () => {
    const text = cli(['--help']).stdout;
    for (const word of ['syntax', 'mcp', 'update', '--yes', 'text-svg', 'html', 'png', 'json', 'check', 'Exit codes']) expect(text).toContain(word);
    for (const code of ['0 ', '1 ', '2 ', '3 ', '4 ', '5 ']) expect(text).toContain(code);
    expect(text).toContain("Only 'update' uses the network");
  });
});

describe('--version', () => {
  it('prints the version to standard output and exits 0', () => {
    for (const flag of ['--version', '-v']) {
      const r = cli([flag]);
      expect(r.status).toBe(0);
      expect(r.stderr).toBe('');
      expect(r.stdout).toBe(`${VERSION}\n`);
    }
  });

  it('is named in --help', () => {
    expect(cli(['--help']).stdout).toMatch(/-v, --version\s+\S/);
  });
});

describe('exit codes', () => {
  it('2 for an option it does not know, with a pointer to --help', () => {
    const r = cli(['--zzz']);
    expect(r.status).toBe(2);
    expect(r.stdout).toBe('');
    expect(r.stderr).toMatch(/^error: unknown option --zzz\nusage: ursula-diagram/);
    expect(r.stderr).toContain("Run 'ursula-diagram --help' for more.");
  });

  it('2 for a misspelt option, naming the option it is near', () => {
    for (const [typed, meant] of [['--colour', '--color'], ['--widht', '--width'], ['--no-legnd', '--no-legend'], ['--hepl', '--help']]) {
      const r = runCommand([typed as string], () => '');
      expect(r.code).toBe(2);
      expect(r.stderr).toMatch(new RegExp(`^error: unknown option ${typed}\\ndid you mean: ${meant}\\nusage: ursula-diagram`));
    }
  });

  it('2 for an option removed in 0.2.2, saying why it went', () => {
    const cases = [
      ['--engine', 'error: --engine was removed in 0.2.2 (the default layout is the only one now)'],
      ['--no-questions', 'error: --no-questions was removed in 0.2.2 (it never changed the output)'],
      ['--no-elbows', 'error: --no-elbows was removed in 0.2.2 (the check now always matches the drawing)'],
    ];
    for (const [option, line] of cases) {
      const r = runCommand(['--format', 'text', option as string, 'grid'], () => 'flowchart LR\nA --> B\n');
      expect(r.code).toBe(2);
      expect(r.stdout).toBe('');
      expect(r.stderr.split('\n')[0]).toBe(line);
      expect(r.stderr).toContain('usage: ursula-diagram');
    }
  });

  it('the usage line alone for a second file', () => {
    const r = runCommand(['a.mmd', 'b.mmd'], () => '');
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(/^usage: ursula-diagram/);
  });

  it('2 for a width that is not a number, and for a missing value', () => {
    expect(cli(['--width', 'wide']).status).toBe(2);
    expect(cli(['--format']).status).toBe(2);
    expect(cli(['--format', 'gif']).status).toBe(2);
  });

  it('2 for a file that cannot be read', () => {
    const r = cli([`${root}no-such-file.mmd`]);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/^error: cannot read /);
  });

  it('1 for an error in the text', () => {
    const r = cli(['--format', 'text'], 'flowchart LR\nA-->\n');
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/^error: line 2: expected a node id near ''/);
  });

  it('0 for a drawing', () => {
    const r = cli(['--format', 'text', '--width', '80'], 'flowchart LR\nA --> B\n');
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('A');
  });

  it('4 for a failure inside the engine', () => {
    registerFrontEnd({
      name: 'boom',
      headers: ['boom-test'],
      svg: () => {
        throw new TypeError('x is undefined');
      },
      textLines: () => [],
      json: () => ({}),
    });
    const r = runCommand(['--format', 'svg'], () => 'boom-test\n');
    expect(r.code).toBe(4);
    expect(r.stdout).toBe('');
    expect(r.stderr).toMatch(/^error: internal: x is undefined\n/);
    expect(r.stderr).toContain('issues');
  });
});

describe('terminal drawings without --width', () => {
  const src = 'flowchart LR\n  A[Start] --> B{Ok?}\n  B -->|yes| C[Done]';
  const run = (...args: string[]) => runCommand(args, () => src);

  it('prints plain rows, coloured rows or an SVG of the cells as asked', () => {
    const plain = run('--format', 'text');
    expect(plain.code).toBe(0);
    expect(plain.stdout).toContain('Start');
    expect(plain.stdout).not.toContain('\u001b[');
    const colour = run('--format', 'text', '--color');
    expect(colour.code).toBe(0);
    expect(colour.stdout).toContain('\u001b[');
    expect(colour.stdout.replace(/\u001b\[[0-9;]*m/gu, '')).toBe(plain.stdout);
    const svg = run('--format', 'text-svg');
    expect(svg.code).toBe(0);
    expect(svg.stdout.startsWith('<svg')).toBe(true);
    expect(svg.stdout).toContain('Start');
  });
});
