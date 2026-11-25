import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { cellWidth, renderText } from '../src/index.ts';

const root = new URL('..', import.meta.url).pathname;
const cli = (args: string[], input: string) => spawnSync(process.execPath, [`${root}src/cli.ts`, ...args], { input, encoding: 'utf8' });
const examples = readdirSync(`${root}examples`).filter((f) => f.endsWith('.mmd')).map((f) => readFileSync(`${root}examples/${f}`, 'utf8'));
const three = 'flowchart LR\nA[First box] --> B[Second box] --> C[Third box]\n';

describe('a drawing wider than --width', () => {
  it('is not printed; the command says the width it needs and exits 3', () => {
    const r = cli(['--format', 'text', '--width', '8'], three);
    expect(r.status).toBe(3);
    expect(r.stdout).toBe('');
    expect(r.stderr).toMatch(/^error: the drawing needs (\d+) columns; the limit is 8\nhint: run again with --width \1, or shorten the names, or split the diagram\n$/);
  });

  it('draws at the width it names, and not one column narrower', () => {
    const need = Number(/needs (\d+) columns/.exec(cli(['--format', 'text', '--width', '8'], three).stderr)?.[1]);
    const fits = cli(['--format', 'text', '--width', String(need)], three);
    expect(fits.status).toBe(0);
    expect(cli(['--format', 'text', '--width', String(need - 1)], three).status).toBe(3);
  });

  it('holds for text-svg too', () => {
    const r = cli(['--format', 'text-svg', '--width', '8'], three);
    expect(r.status).toBe(3);
    expect(r.stdout).toBe('');
  });

  it('is the same drawing as before when it fits', () => {
    const r = cli(['--format', 'text', '--width', '100'], three);
    const lib = renderText(three, 100);
    expect(r.status).toBe(0);
    expect('lines' in lib && `${lib.lines.join('\n')}\n`).toBe(r.stdout);
  });

  it('gantt and kanban say their least width with code 3', () => {
    const gantt = cli(['--format', 'text', '--width', '10'], 'gantt\ndateFormat YYYY-MM-DD\nA : 2024-01-01, 3d\n');
    expect(gantt.status).toBe(3);
    expect(gantt.stderr).toMatch(/^error: A Gantt drawing needs at least \d+ columns of width; the limit is 10\.\nhint: run again with --width \d+/);
    const kanban = cli(['--format', 'text', '--width', '6'], 'kanban\n  todo[To do]\n    t1[Write]\n');
    expect(kanban.status).toBe(3);
    expect(renderText('kanban\n  todo[To do]\n    t1[Write]\n', 6)).toMatchObject({ minWidth: expect.any(Number) });
  });

  // Every example at three widths: a named width always draws; one column less fails nine times in ten or more.
  it('names a width that draws for every example at 40, 60 and 80 columns', () => {
    let named = 0;
    let tight = 0;
    for (const src of examples) {
      for (const width of [40, 60, 80]) {
        const r = cli(['--format', 'text', '--width', String(width)], src);
        if (r.status === 0) {
          for (const line of r.stdout.split('\n')) expect(cellWidth(line)).toBeLessThanOrEqual(width);
          continue;
        }
        expect(r.status, r.stderr).toBe(3);
        const need = Number(/needs (?:at least )?(\d+) columns/.exec(r.stderr)?.[1] ?? /--width (\d+)/.exec(r.stderr)?.[1]);
        expect(need).toBeGreaterThan(width);
        expect(cli(['--format', 'text', '--width', String(need)], src).status).toBe(0);
        named++;
        if (cli(['--format', 'text', '--width', String(need - 1)], src).status === 3) tight++;
      }
    }
    if (named > 0) expect(tight / named).toBeGreaterThanOrEqual(0.9);
  }, 120000);
});
