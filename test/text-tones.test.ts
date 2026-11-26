import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { runCommand } from '../src/command/run.ts';
import { renderText, renderTextSpans } from '../src/index.ts';

const root = new URL('../site/examples/official/', import.meta.url).pathname;
/** Every folder of official examples, one per type (railroad has one per grammar). */
const TYPES = readdirSync(root, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();
const ESC = '\u001b[';

describe('terminal tones', () => {
  it('give the same text as the plain drawing for every official example', () => {
    for (const type of TYPES) {
      for (const file of readdirSync(`${root}${type}`).filter((f) => f.endsWith('.mmd'))) {
        const src = readFileSync(`${root}${type}/${file}`, 'utf8');
        for (const width of [80, 120]) {
          const plain = renderText(src, width);
          const toned = renderTextSpans(src, width);
          if ('error' in plain || 'error' in toned) {
            expect('error' in toned, `${type}/${file} ${width}`).toBe('error' in plain);
            continue;
          }
          expect(toned.lines.map((l) => l.map((s) => s.text).join('')), `${type}/${file} ${width}`).toEqual(plain.lines);
        }
      }
    }
  });

  it('mark something in every type: each type has an official example with a tone other than normal', () => {
    const plain = TYPES.filter((type) =>
      readdirSync(`${root}${type}`)
        .filter((f) => f.endsWith('.mmd'))
        .every((file) => {
          const toned = renderTextSpans(readFileSync(`${root}${type}/${file}`, 'utf8'), 120);
          return 'error' in toned || toned.lines.every((l) => l.every((s) => s.tone === 'normal'));
        }),
    );
    expect(plain).toEqual([]);
  });

  it('write node names in bold and dotted lines dim', () => {
    const drawn = renderTextSpans('flowchart LR\nA[Start] -.-> B[Done]', 80);
    if ('error' in drawn) throw new Error(drawn.error);
    const spans = drawn.lines.flat();
    expect(spans).toContainEqual({ text: 'Start', tone: 'bold' });
    expect(spans).toContainEqual({ text: 'Done', tone: 'bold' });
    expect(spans.some((s) => s.tone === 'dim' && s.text.includes('┄'))).toBe(true);
  });

  it('colour a flowchart, a class and a C4 drawing with --color', () => {
    for (const src of ['flowchart LR\nA --> B', 'classDiagram\nclass Animal', 'C4Context\nPerson(p, "P")']) {
      const plain = runCommand(['--format', 'text'], () => src);
      const colour = runCommand(['--format', 'text', '--color'], () => src);
      expect(plain.stdout, src).not.toContain(ESC);
      expect(colour.stdout, src).toContain(`${ESC}1m`);
      expect(colour.stdout.replace(/\u001b\[\d+m/g, ''), src).toBe(plain.stdout);
    }
  });
});
