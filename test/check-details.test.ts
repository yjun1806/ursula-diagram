import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkDetails, checkLines, selectFrontEnd } from '../src/index.ts';
import type { Layout } from '../src/index.ts';
import * as fixtures from './fixtures.ts';

const root = new URL('..', import.meta.url).pathname;
const run = (args: string[], input?: string) => spawnSync(process.execPath, [`${root}src/cli.ts`, ...args], { encoding: 'utf8', ...(input === undefined ? {} : { input }) });
const examples = readdirSync(`${root}examples`).filter((f) => f.endsWith('.mmd'));

const crossed = `flowchart LR
  A --> C
  B --> D
  A --> D
  B --> C
  C --> E
  D --> E
`;

const sources: Array<[string, string]> = [
  ['crossed', crossed],
  ...(Object.entries(fixtures) as Array<[string, unknown]>).filter((e): e is [string, string] => typeof e[1] === 'string' && /^(flowchart|graph|swimlane-beta)/.test(e[1])),
  ...examples.map((f): [string, string] => [f, readFileSync(`${root}examples/${f}`, 'utf8')]),
];
const layouts = sources
  .map(([name, src]) => [name, src, selectFrontEnd(src).json(src, 'svg', {})] as const)
  .filter((x): x is readonly [string, string, Layout] => typeof x[2] === 'object' && x[2] !== null && 'edges' in x[2] && 'diagnostics' in x[2]);

describe('checkDetails', () => {
  it('has inputs with crossings to look at', () => {
    expect(layouts.filter(([, , l]) => l.diagnostics.some((d) => d.kind === 'crossing')).length).toBeGreaterThan(0);
  });

  it.each(layouts.map(([name, src, l]) => [name, src, l] as const))('%s: names as many crossing pairs as the summary counts', (_, src, l) => {
    const summary = Number(/crossings (\d+)/.exec(checkLines(l)[0] ?? '')?.[1]);
    const lines = checkDetails(l, src).filter((x) => x.startsWith('crossing: '));
    const more = Number(/and (\d+) more/.exec(lines.at(-1) ?? '')?.[1] ?? 0);
    expect(lines.filter((x) => !x.includes(' more')).length + more).toBe(summary);
  });

  it.each(layouts.filter(([, src]) => /^(flowchart|graph|swimlane-beta)/m.test(src)).map(([name, src, l]) => [name, src, l] as const))(
    '%s: every line number it gives is a line that writes that edge',
    (_, src, l) => {
      const rows = src.split('\n');
      for (const text of checkDetails(l, src)) {
        for (const m of text.matchAll(/(\S+) --> (\S+) \(line (\d+)\)/g)) {
          const row = rows[Number(m[3]) - 1] ?? '';
          expect(row, text).toContain(m[1]);
          expect(row, text).toContain(m[2]);
        }
      }
    },
  );

  it('writes the pairs, then the most bent lines', () => {
    const l = selectFrontEnd(crossed).json(crossed, 'svg', {}) as Layout;
    const details = checkDetails(l, crossed);
    expect(details[0]).toMatch(/^crossing: \S+ --> \S+ \(line \d\) crosses \S+ --> \S+ \(line \d\)$/);
  });
});

describe('--format check', () => {
  it.each(examples)('%s: starts with the lines it printed before', (name) => {
    const src = readFileSync(`${root}examples/${name}`, 'utf8');
    const laid = selectFrontEnd(src).json(src, 'svg', {});
    const out = run([`${root}examples/${name}`, '--format', 'check']).stdout;
    if (typeof laid === 'object' && laid !== null && 'edges' in laid && 'diagnostics' in laid) expect(out.startsWith(`${checkLines(laid as Layout).join('\n')}\n`)).toBe(true);
  });
});

describe('--check', () => {
  it.each(examples)('%s: the drawing on stdout, the check report on stderr, code 0', (name) => {
    const file = `${root}examples/${name}`;
    const report = run([file, '--format', 'check']).stdout;
    for (const args of [['--format', 'text', '--width', '100'], ['--format', 'svg'], ['--format', 'text-svg', '--width', '100']]) {
      const both = run([file, ...args, '--check']);
      expect(both.status).toBe(0);
      expect(both.stdout).toBe(run([file, ...args]).stdout);
      expect(both.stderr).toBe(report);
    }
  });

  it('prints no report when the drawing fails', () => {
    const r = run(['--format', 'text', '--width', '8', '--check'], 'flowchart LR\nA[First box] --> B[Second box]\n');
    expect(r.status).toBe(3);
    expect(r.stderr).not.toMatch(/composition/);
  });
});
