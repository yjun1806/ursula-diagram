import { execFileSync, spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const root = new URL('..', import.meta.url).pathname;
const run = (entry: string, args: string[]): string => execFileSync(process.execPath, [`${root}${entry}`, ...args], { encoding: 'utf8' });

describe('the agent skill', () => {
  const examples = readdirSync(`${root}examples`).filter((f) => f.endsWith('.mmd'));

  // The skill carries the command as one built file. Rebuild it (`bun scripts/build.ts`) when a drawing changes.
  it.each(examples)('draws %s as the sources do', (name) => {
    for (const args of [['--format', 'svg'], ['--format', 'text', '--width', '100'], ['--format', 'text', '--width', '100', '--charset', 'ascii'], ['--format', 'text-svg', '--width', '100'], ['--format', 'check']]) {
      expect(run('skills/ursula/scripts/ursula.mjs', [`${root}examples/${name}`, ...args])).toBe(run('src/cli.ts', [`${root}examples/${name}`, ...args]));
    }
  });

  // The commands the skill document names, with what they write to standard error and their exit codes.
  it('answers --check, syntax, --help, a text error and a narrow width as the sources do', () => {
    const both = (entry: string, args: string[], input?: string) => {
      const r = spawnSync(process.execPath, [`${root}${entry}`, ...args], { encoding: 'utf8', ...(input === undefined ? {} : { input }) });
      return { stdout: r.stdout, stderr: r.stderr, status: r.status };
    };
    const order = `${root}examples/order-flow.mmd`;
    const cases: Array<[string[], string?]> = [
      [[order, '--format', 'text', '--width', '100', '--check']],
      [['syntax']],
      [['syntax', 'wardley']],
      [['syntax', 'wardly']],
      [['--help']],
      [['--format', 'text'], 'wardley-beta\ncompnent Tea [0.6, 0.8]\n'],
      [[order, '--format', 'text', '--width', '30']],
    ];
    for (const [args, input] of cases) expect(both('skills/ursula/scripts/ursula.mjs', args, input)).toEqual(both('src/cli.ts', args, input));
  });

  // A command kept in a shell variable fails in zsh, which does not split it into words, and costs the agent a retry.
  it('tells the agent to write the full command, never a shell variable', () => {
    const text = readFileSync(`${root}skills/ursula/SKILL.md`, 'utf8');
    expect(text).toContain('`node <the folder of this file>/scripts/ursula.mjs`');
    expect(text).toMatch(/never put it in a shell variable or alias/);
  });

  it('names itself and says when to use it', () => {
    const text = readFileSync(`${root}skills/ursula/SKILL.md`, 'utf8');
    const head = /^---\n([\s\S]*?)\n---\n/.exec(text)?.[1] ?? '';
    expect(head).toMatch(/^name: ursula$/m);
    const description = /^description: (.+)$/m.exec(head)?.[1] ?? '';
    expect(description.length).toBeGreaterThan(80);
    expect(description.length).toBeLessThanOrEqual(1024);
  });
});
