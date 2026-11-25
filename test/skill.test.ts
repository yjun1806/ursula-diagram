import { execFileSync } from 'node:child_process';
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

  it('names itself and says when to use it', () => {
    const text = readFileSync(`${root}skills/ursula/SKILL.md`, 'utf8');
    const head = /^---\n([\s\S]*?)\n---\n/.exec(text)?.[1] ?? '';
    expect(head).toMatch(/^name: ursula$/m);
    const description = /^description: (.+)$/m.exec(head)?.[1] ?? '';
    expect(description.length).toBeGreaterThan(80);
    expect(description.length).toBeLessThanOrEqual(1024);
  });
});
