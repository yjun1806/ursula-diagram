import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { runCommand } from '../src/command/run.ts';
import { renderText, renderTextSpans } from '../src/index.ts';

const root = new URL('../site/examples/official/', import.meta.url).pathname;
/** The types drawn as boxes and lines, whose terminal drawing comes from one layout. */
const TYPES = ['flowchart', 'class', 'state', 'er', 'requirement', 'c4', 'usecase', 'architecture'];
const ESC = '\u001b[';

describe('terminal tones of box-and-line drawings', () => {
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
