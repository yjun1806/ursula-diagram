// Examples adapted from the Mermaid documentation (MIT).
import { describe, expect, it } from 'vitest';
import { pixelRuler, render, renderText, UrsulaError } from '../src/index.ts';
import { layoutJourney } from '../src/journey/layout.ts';
import { parseJourney } from '../src/journey/parse.ts';
import { THEMES } from '../src/render/theme.ts';
import type { SceneItem, SceneText } from '../src/types.ts';

const OFFICIAL = 'journey\n    title My working day\n    section Go to work\n      Make tea: 5: Me\n      Go upstairs: 3: Me\n      Do work: 1: Me, Cat\n    section Go home\n      Go downstairs: 5: Me\n      Sit down: 5: Me';
const ONE_SECTION = 'journey\n  title One\n  section Only\n    Wake up: 4: Me';
const TWELVE = `journey\n  title Twelve\n${['A', 'B', 'C', 'D'].map((s, i) => `  section ${s} part\n${[0, 1, 2].map((j) => `    Task ${s}${j} here: ${((i + j) % 5) + 1}: Me`).join('\n')}`).join('\n')}`;
const FIVE_ACTORS = 'journey\n  section Meeting\n    Review the long agenda: 3: Alice, Bob, Carol, Dave, Eve, Frank, Grace, Heidi\n    Decide: 4.5: Alice';
const SAMPLES: Record<string, string> = { official: OFFICIAL, one: ONE_SECTION, twelve: TWELVE, actors: FIVE_ACTORS };

const ruler = pixelRuler();
const texts = (items: SceneItem[]): SceneText[] => items.filter((i): i is SceneText => i.kind === 'text');

function textBox(t: SceneText): { l: number; r: number; top: number; bottom: number } {
  const roles = t.role ?? [];
  const size = roles.includes('title') ? 15 : roles.includes('name') || roles.includes('zone-name') ? 13 : 11;
  const w = (ruler.textWidth(t.text, 'line') * size) / 12;
  const l = t.anchor === 'middle' ? t.x - w / 2 : t.anchor === 'end' ? t.x - w : t.x;
  return { l, r: l + w, top: t.y - size / 2, bottom: t.y + size / 2 };
}

describe('journey render', () => {
  for (const [name, src] of Object.entries(SAMPLES)) {
    it(`draws ${name} in every theme`, () => {
      for (const theme of THEMES) expect(render(src, { theme })).toContain(`data-theme="${theme}"`);
      expect(render(src)).toContain('data-theme="solid"');
    });
  }
  it('ignores a configuration block and an init directive', () => {
    const svg = render(`---\nconfig:\n  theme: base\n---\n%%{init: {"theme": "dark"}}%%\n${OFFICIAL}`);
    expect(svg).toContain('My working day');
  });
  it('writes accTitle as the title and accDescr as the description', () => {
    const svg = render('journey\n  accTitle: Day\n  accDescr: A day\n  section S\n    A: 3: Me');
    expect(svg).toContain('<title>Day</title>');
    expect(svg).toContain('<desc>A day</desc>');
  });
});

describe('journey parse', () => {
  it('reads sections, scores and actors of the official example', () => {
    const j = parseJourney(OFFICIAL);
    expect(j.title).toBe('My working day');
    expect(j.sections.map((s) => s.name)).toEqual(['Go to work', 'Go home']);
    expect(j.sections[0]?.tasks.map((t) => [t.name, t.score, t.actors])).toEqual([
      ['Make tea', 5, ['Me']],
      ['Go upstairs', 3, ['Me']],
      ['Do work', 1, ['Me', 'Cat']],
    ]);
    expect(j.sections[1]?.tasks.map((t) => t.score)).toEqual([5, 5]);
  });
  it('reads a task without actors and a decimal score', () => {
    const j = parseJourney('journey\n section S\n  A: 2.5\n  B: 3:');
    expect(j.sections[0]?.tasks.map((t) => [t.score, t.actors])).toEqual([[2.5, []], [3, []]]);
  });
  it('uses the front-matter heading when the text has no title', () => {
    expect(parseJourney(OFFICIAL.replace('    title My working day\n', ''), 'From heading').title).toBe('From heading');
  });
  it('reports a score outside 1 to 5 with its line', () => {
    for (const bad of ['6', '0', 'x']) {
      let err: unknown;
      try {
        parseJourney(`journey\n  section S\n    A: 3: Me\n    B: ${bad}: Me`);
      } catch (e) {
        err = e;
      }
      expect(err).toBeInstanceOf(UrsulaError);
      expect((err as UrsulaError).line).toBe(4);
    }
  });
  it('reports a task without a score with its line', () => {
    expect(() => parseJourney('journey\n  section S\n    Only a name')).toThrow(/line 3/);
  });
  it('reports through renderText as an error value', () => {
    expect('error' in renderText('journey\n  A: 9: Me', 80)).toBe(true);
  });
});

describe('journey layout', () => {
  for (const [name, src] of Object.entries(SAMPLES)) {
    for (const theme of THEMES) {
      it(`${name} (${theme}): heights follow the scores, texts stay apart and inside`, () => {
        const layout = layoutJourney(parseJourney(src), ruler, theme);
        const ys = layout.tasks.map((t) => t.dot.y);
        const scores = layout.tasks.map((t) => t.score);
        for (let i = 1; i < ys.length; i++) {
          const dy = (ys[i - 1] ?? 0) - (ys[i] ?? 0);
          const ds = (scores[i] ?? 0) - (scores[i - 1] ?? 0);
          expect(Math.abs(dy - ds * 32)).toBeLessThanOrEqual(1);
        }
        const boxes = texts(layout.scene.items).map(textBox);
        boxes.forEach((a, i) => {
          expect(a.l).toBeGreaterThanOrEqual(0);
          expect(a.r).toBeLessThanOrEqual(layout.width);
          expect(a.top).toBeGreaterThanOrEqual(0);
          expect(a.bottom).toBeLessThanOrEqual(layout.height);
          for (const b of boxes.slice(i + 1)) {
            expect(a.l < b.r - 0.5 && a.r > b.l + 0.5 && a.top < b.bottom - 0.5 && a.bottom > b.top + 0.5).toBe(false);
          }
        });
      });
    }
  }
  it('gives the official example the ideal size and equal boxes', () => {
    const layout = layoutJourney(parseJourney(OFFICIAL), ruler, 'solid');
    expect([layout.width, layout.height]).toEqual([1016, 420]);
    expect(new Set(layout.tasks.map((t) => `${t.w}x${t.h}`))).toEqual(new Set(['152x68']));
    expect(layout.tasks.map((t) => t.dot.x)).toEqual([156, 332, 508, 716, 892]);
    expect(layout.tasks.map((t) => t.dot.y)).toEqual([240, 304, 368, 240, 240]);
  });
  it('draws straight lines in outline and a curve in solid', () => {
    const d = (theme: 'solid' | 'outline'): string => {
      const item = layoutJourney(parseJourney(OFFICIAL), ruler, theme).scene.items.find((i) => i.kind === 'path');
      return item?.kind === 'path' ? item.d : '';
    };
    expect(d('outline')).not.toContain('C');
    expect(d('solid')).toContain('C');
  });
  it('wraps actor tags that do not fit the box onto another row', () => {
    const layout = layoutJourney(parseJourney(FIVE_ACTORS), ruler, 'solid');
    const first = layout.tasks[0];
    expect(new Set(first?.tags.map((t) => t.y)).size).toBeGreaterThan(1);
    for (const tag of first?.tags ?? []) {
      expect(tag.x).toBeGreaterThanOrEqual((first?.x ?? 0) + 8);
      expect(tag.x + tag.w).toBeLessThanOrEqual((first?.x ?? 0) + (first?.w ?? 0) - 8);
    }
  });
  it('narrows the boxes to keep many sections within the limit, and reports an overflow it cannot fix', () => {
    const wide = (n: number): string => `journey\n${Array.from({ length: n }, (_, i) => `  section S${i}\n    Visit the market place: 3: Me\n    Go: 2: Me`).join('\n')}`;
    const fits = layoutJourney(parseJourney(wide(4)), ruler, 'solid');
    expect(fits.width).toBeLessThanOrEqual(1280);
    expect(fits.tasks[0]?.w).toBeLessThan(152);
    const over = layoutJourney(parseJourney(wide(12)), ruler, 'solid');
    expect(over.overflow).toBe(true);
  });
});

describe('journey text', () => {
  it('prints a table of sections, tasks, scores and actors', () => {
    const out = renderText(OFFICIAL, 80);
    expect('lines' in out && out.lines).toEqual([
      'My working day',
      'Go to work  Make tea       5  Me',
      '            Go upstairs    3  Me',
      '            Do work        1  Me, Cat',
      'Go home     Go downstairs  5  Me',
      '            Sit down       5  Me',
    ]);
  });
  it('stays within a narrow width', () => {
    const out = renderText(OFFICIAL, 30);
    expect('lines' in out && Math.max(...out.lines.map((l) => l.length))).toBeLessThanOrEqual(30);
  });
});
