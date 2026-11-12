// Examples adapted from the Mermaid documentation (MIT).
import { describe, expect, it } from 'vitest';
import { pixelRuler } from '../src/metrics.ts';
import { render, renderText, UrsulaError } from '../src/index.ts';
import { layoutPie, RADIUS } from '../src/pie/layout.ts';
import { parsePie } from '../src/pie/parse.ts';
import type { SceneText } from '../src/types.ts';

const BASIC = `pie title Pets adopted by volunteers
    "Dogs" : 386
    "Cats" : 85
    "Rats" : 15`;

const CONFIG = `---
config:
  pie:
    textPosition: 0.5
    donutHole: 0.2
    highlightSlice: Potassium
  themeVariables:
    pieOuterStrokeWidth: "5px"
---
pie showData
    title Key elements in Product X
    "Calcium" : 42.96
    "Potassium" : 50.05
    "Magnesium" : 10.01
    "Iron" :  5`;

/** What a front-end receives: the header rows blanked. */
const BODY = CONFIG.replace(/^---[\s\S]*?\n---\n/, (m) => '\n'.repeat(m.split('\n').length - 1));
const THEMES = ['solid', 'outline', 'card'] as const;

describe('pie render', () => {
  for (const [name, src] of [['basic', BASIC], ['config + showData', CONFIG]] as const) {
    it(`draws ${name} in three themes`, () => {
      for (const theme of THEMES) {
        const svg = render(src, { theme });
        expect(svg).toContain(`data-theme="${theme}"`);
      }
      expect(render(src)).toContain('data-theme="solid"');
    });
  }
});

describe('pie parse', () => {
  it('reads title, values and labels', () => {
    const p = parsePie(BASIC);
    expect(p.title).toBe('Pets adopted by volunteers');
    expect(p.showData).toBe(false);
    expect(p.slices.map((s) => [s.label, s.value])).toEqual([['Dogs', 386], ['Cats', 85], ['Rats', 15]]);
  });

  it('reads showData and a title on its own line', () => {
    const p = parsePie(BODY);
    expect(p.showData).toBe(true);
    expect(p.title).toBe('Key elements in Product X');
    expect(p.slices.map((s) => [s.label, s.value, s.valueText])).toEqual([
      ['Calcium', 42.96, '42.96'],
      ['Potassium', 50.05, '50.05'],
      ['Magnesium', 10.01, '10.01'],
      ['Iron', 5, '5'],
    ]);
  });

  it('takes the front-matter title only when the body has none', () => {
    expect(parsePie('pie\n"A" : 1', 'From header').title).toBe('From header');
    expect(parsePie('pie title Body\n"A" : 1', 'From header').title).toBe('Body');
  });

  it('draws a front-matter title through render', () => {
    expect(render('---\ntitle: Header title\n---\npie\n"A" : 1')).toContain('Header title');
  });

  it('rejects zero and negative values with the line number', () => {
    for (const bad of ['"A" : 0', '"A" : -3']) {
      try {
        parsePie(`pie\n"B" : 1\n${bad}`);
        throw new Error('no error');
      } catch (e) {
        expect(e).toBeInstanceOf(UrsulaError);
        expect((e as UrsulaError).line).toBe(3);
        expect((e as UrsulaError).code).toBe('value');
      }
    }
  });

  it('rejects an unreadable line with its number', () => {
    expect(() => parsePie('pie\n"A" : 1\nDogs 3')).toThrow(/line 3/);
  });
});

describe('pie layout', () => {
  const layout = layoutPie(parsePie(BODY), pixelRuler());

  it('gives each slice an angle proportional to its value', () => {
    const total = 42.96 + 50.05 + 10.01 + 5;
    layout.slices.forEach((s) => {
      expect(Math.abs(RADIUS * (s.a1 - s.a0) - (s.value / total) * RADIUS * Math.PI * 2)).toBeLessThan(1);
    });
    expect(layout.slices[0]?.a0).toBe(0);
    expect(layout.slices.at(-1)?.a1).toBeCloseTo(Math.PI * 2, 9);
  });

  it('keeps label boxes apart and inside the drawing', () => {
    for (const src of [BASIC, BODY, `pie\n${Array.from({ length: 12 }, (_, i) => `"Part ${i}" : 1`).join('\n')}`]) {
      const l = layoutPie(parsePie(src), pixelRuler());
      const box = (b: (typeof l.labels)[number]) => {
        const x0 = b.anchor === 'start' ? b.x : b.anchor === 'end' ? b.x - b.w : b.x - b.w / 2;
        return { x0, x1: x0 + b.w, y0: b.y, y1: b.y + b.h };
      };
      const boxes = l.labels.map(box);
      boxes.forEach((a, i) => {
        expect(a.x0).toBeGreaterThanOrEqual(0);
        expect(a.y0).toBeGreaterThanOrEqual(0);
        expect(a.x1).toBeLessThanOrEqual(l.scene.width);
        expect(a.y1).toBeLessThanOrEqual(l.scene.height);
        boxes.slice(i + 1).forEach((b) => {
          const apart = a.x1 <= b.x0 || b.x1 <= a.x0 || a.y1 + 4 <= b.y0 + 1e-6 || b.y1 + 4 <= a.y0 + 1e-6;
          expect(apart).toBe(true);
        });
      });
      const title = l.scene.items.find((it): it is SceneText => it.kind === 'text' && it.role?.[0] === 'title');
      if (title !== undefined) expect(boxes.every((b) => b.y0 >= title.y + 9)).toBe(true);
    }
  });

  it('cuts the donut hole of the settings out of every slice', () => {
    const svg = render(CONFIG);
    const donut = layoutPie(parsePie(BODY, undefined, { pie: { donutHole: 0.2 } }), pixelRuler());
    expect(donut.hole).toBeCloseTo(0.2 * RADIUS, 6);
    const paths = donut.scene.items.filter((i) => i.kind === 'path' && i.role.some((r) => r.endsWith('--tint')));
    expect(paths).toHaveLength(4);
    // Every slice has an inner arc of the hole's radius and no point closer to the centre than the hole.
    for (const p of paths) expect(p.kind === 'path' && p.d.includes(`A${0.2 * RADIUS} ${0.2 * RADIUS} 0 0 0`)).toBe(true);
    expect(svg).toContain(`A${0.2 * RADIUS} ${0.2 * RADIUS}`);
    expect(layoutPie(parsePie(BODY), pixelRuler()).hole).toBe(0);
    expect(parsePie(BODY, undefined, { pie: { donutHole: 2 } }).donutHole).toBe(0.9);
  });

  it('writes every name and value', () => {
    const texts = layout.scene.items.filter((it): it is SceneText => it.kind === 'text').map((t) => t.text);
    for (const t of ['Calcium', '42.96', 'Potassium', '50.05', 'Magnesium', '10.01', 'Iron', '5']) expect(texts).toContain(t);
  });
});

describe('pie text', () => {
  it('lists values with shares', () => {
    const r = renderText(BASIC, 60);
    if ('error' in r) throw new Error(r.error);
    expect(r.lines).toEqual(['Pets adopted by volunteers', 'Dogs  386  79.4%', 'Cats   85  17.5%', 'Rats   15   3.1%']);
  });

  it('shortens labels to the width limit', () => {
    const r = renderText('pie\n"A very long label indeed" : 10', 14);
    if ('error' in r) throw new Error(r.error);
    expect(r.lines[0]?.length).toBeLessThanOrEqual(14);
    expect(r.lines[0]).toContain('…');
  });
});
