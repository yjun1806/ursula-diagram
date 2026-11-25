import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { OPTIONS } from '../src/command/args.ts';
import { runCommand } from '../src/command/run.ts';
import { registerFrontEnd } from '../src/index.ts';

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
    for (const word of ['syntax', 'mcp', 'text-svg', 'html', 'json', 'check', 'Exit codes']) expect(text).toContain(word);
    for (const code of ['0 ', '1 ', '2 ', '3 ', '4 ']) expect(text).toContain(code);
  });
});

describe('exit codes', () => {
  it('2 for an option it does not know, with a pointer to --help', () => {
    const r = cli(['--colour']);
    expect(r.status).toBe(2);
    expect(r.stdout).toBe('');
    expect(r.stderr).toMatch(/^usage: ursula-diagram/);
    expect(r.stderr).toContain("Run 'ursula-diagram --help' for more.");
  });

  it('2 for a width that is not a number, and for a missing value', () => {
    expect(cli(['--width', 'wide']).status).toBe(2);
    expect(cli(['--format']).status).toBe(2);
    expect(cli(['--format', 'png']).status).toBe(2);
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
