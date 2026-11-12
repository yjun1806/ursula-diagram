// Examples adapted from the Mermaid documentation (MIT).
import { describe, expect, it } from 'vitest';
import { render, renderText, selectFrontEnd, UrsulaError } from '../src/index.ts';
import { layoutIshikawa } from '../src/ishikawa/layout.ts';
import { parseIshikawa } from '../src/ishikawa/parse.ts';
import { pixelRuler } from '../src/metrics.ts';
import type { SceneBox, SceneItem, SceneLine, SceneText } from '../src/types.ts';

const syntax = `ishikawa-beta
    Blurry Photo
    Process
        Out of focus
        Shutter speed too slow
        Protective film not removed
        Beautification filter applied
    User
        Shaky hands
    Equipment
        LENS
            Inappropriate lens
            Damaged lens
            Dirty lens
        SENSOR
            Damaged sensor
            Dirty sensor
    Environment
        Subject moved too quickly
        Too dark`;

const headOnly = `ishikawa-beta
    Server down`;

const wide = `ishikawa
  Customers leave after the very first week of using the product
  People
    Support answers arrive after more than two business days
    Training material is out of date and no one owns it
  Product
    Onboarding asks for too much
      Seven screens before the first result
      Required fields that could wait
        Phone number
    Search is slow
  Price
  Process
    Billing errors
    Refunds take a month
  Market
    A cheaper competitor
  Tools
    Dashboards are late
    Alerts are noisy
  Place
    No local office
  Promotion
    Unclear message`;

const examples = { syntax, headOnly, wide };
const themes = ['solid', 'outline', 'card'] as const;
const ruler = pixelRuler();

const texts = (items: SceneItem[]): SceneText[] => items.filter((i): i is SceneText => i.kind === 'text');
const boxes = (items: SceneItem[]): SceneBox[] => items.filter((i): i is SceneBox => i.kind === 'box');
const lines = (items: SceneItem[]): SceneLine[] => items.filter((i): i is SceneLine => i.kind === 'line');

interface Rect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

function textRect(t: SceneText): Rect {
  const role = t.role ?? [];
  const w = ruler.textWidth(t.text, role.includes('name') || role.includes('title') ? 'title' : 'line');
  const x1 = role.includes('end') ? t.x - w : role.includes('start') ? t.x : t.x - w / 2;
  return { x1, y1: t.y - 8, x2: x1 + w, y2: t.y + 8 };
}

const overlap = (a: Rect, b: Rect): boolean => a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2;

describe('ishikawa svg', () => {
  for (const [name, src] of Object.entries(examples)) {
    for (const theme of themes) {
      it(`${name} draws in ${theme}`, () => {
        const svg = render(src, { theme });
        expect(svg).toContain(`data-theme="${theme}"`);
        expect(svg).toContain('ursula-edge');
      });
    }
  }

  it('is picked by the ishikawa and ishikawa-beta headers', () => {
    expect(selectFrontEnd(syntax).name).toBe('ishikawa');
    expect(selectFrontEnd(wide).name).toBe('ishikawa');
  });

  it('draws every text of the source', () => {
    const svg = render(syntax);
    for (const text of ['Blurry Photo', 'Process', 'Out of focus', 'Inappropriate lens', 'Dirty sensor', 'Too dark']) expect(svg).toContain(`>${text}<`);
  });

  it('reads a settings block, comments and accessibility lines without complaint', () => {
    const src = `---\ntitle: Why blurry\nconfig:\n  theme: forest\n---\n%%{init: {"theme":"dark"}}%%\nishikawa-beta\n  accTitle: Blurry photo causes\n  accDescr: a fishbone\n  accDescr {\n    many\n    lines\n  }\n  Blurry Photo\n  %% a comment\n  Process\n    Out of focus`;
    const svg = render(src);
    expect(svg).toContain('<title>Blurry photo causes</title>');
    expect(svg).toContain('Out of focus');
    expect(render(src.replace('  accTitle: Blurry photo causes\n', ''))).toContain('<title>Why blurry</title>');
  });

  it('draws the heading when the source gives its own title only through the settings block', () => {
    const svg = render(`---\ntitle: Why blurry\n---\nishikawa-beta\n  Blurry Photo\n  Process\n    Out of focus`);
    expect(svg).toContain('>Why blurry<');
  });
});

describe('ishikawa parse', () => {
  it('reads the problem, categories, causes and deeper causes of the syntax example', () => {
    const model = parseIshikawa(syntax);
    expect(model.head).toBe('Blurry Photo');
    expect(model.categories.map((c) => c.name)).toEqual(['Process', 'User', 'Equipment', 'Environment']);
    expect(model.categories[0]?.causes.map((c) => c.text)).toEqual(['Out of focus', 'Shutter speed too slow', 'Protective film not removed', 'Beautification filter applied']);
    expect(model.categories[2]?.causes.map((c) => [c.text, c.depth])).toEqual([
      ['LENS', 1],
      ['Inappropriate lens', 2],
      ['Damaged lens', 2],
      ['Dirty lens', 2],
      ['SENSOR', 1],
      ['Damaged sensor', 2],
      ['Dirty sensor', 2],
    ]);
  });

  it('keeps the depth of causes below the second level', () => {
    const phone = parseIshikawa(wide).categories[1]?.causes.find((c) => c.text === 'Phone number');
    expect(phone?.depth).toBe(3);
  });

  it('accepts a problem with no category', () => {
    const model = parseIshikawa(headOnly);
    expect(model.head).toBe('Server down');
    expect(model.categories).toEqual([]);
    expect(render(headOnly)).toContain('Server down');
  });

  it('accepts categories indented below the problem', () => {
    const model = parseIshikawa('ishikawa-beta\nProblem\n  A\n    a1\n  B');
    expect(model.categories.map((c) => c.name)).toEqual(['A', 'B']);
    expect(model.categories[0]?.causes[0]?.text).toBe('a1');
  });

  it('reports the line of a text indented less than the categories', () => {
    let error: unknown;
    try {
      parseIshikawa('ishikawa-beta\n    Problem\n        Category\n    Stray');
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(UrsulaError);
    expect((error as UrsulaError).line).toBe(4);
    expect((error as UrsulaError).message).toContain('line 4');
  });

  it('rejects a wrong header and a missing problem', () => {
    expect(() => parseIshikawa('pie\n  A')).toThrow(UrsulaError);
    expect(() => parseIshikawa('ishikawa-beta\n\n')).toThrow(UrsulaError);
  });
});

describe('ishikawa layout', () => {
  for (const [name, src] of Object.entries(examples)) {
    for (const assign of ['alternate', 'balanced'] as const) {
      describe(`${name} (${assign})`, () => {
        const layout = layoutIshikawa(parseIshikawa(src), ruler, undefined, undefined, { assign });
        const items = layout.scene.items;

        it('has no two texts overlapping', () => {
          const rects = texts(items).map((t) => ({ t, r: textRect(t) }));
          for (let i = 0; i < rects.length; i += 1) {
            for (let j = i + 1; j < rects.length; j += 1) {
              const a = rects[i];
              const b = rects[j];
              if (a && b) expect(overlap(a.r, b.r), `${a.t.text} / ${b.t.text}`).toBe(false);
            }
          }
        });

        it('keeps every text and box inside the drawing', () => {
          for (const t of texts(items)) {
            const r = textRect(t);
            expect(r.x1, t.text).toBeGreaterThanOrEqual(0);
            expect(r.y1, t.text).toBeGreaterThanOrEqual(0);
            expect(r.x2, t.text).toBeLessThanOrEqual(layout.scene.width);
            expect(r.y2, t.text).toBeLessThanOrEqual(layout.scene.height);
          }
          for (const b of boxes(items)) {
            expect(b.x).toBeGreaterThanOrEqual(0);
            expect(b.y).toBeGreaterThanOrEqual(0);
            expect(b.x + b.w).toBeLessThanOrEqual(layout.scene.width);
            expect(b.y + b.h).toBeLessThanOrEqual(layout.scene.height);
          }
        });

        it('keeps a name inside its box', () => {
          for (const b of boxes(items)) {
            const label = texts(items).find((t) => t.data?.['bone'] === b.data?.['bone'] && (t.role ?? []).includes('name') && b.data?.['part'] === undefined);
            if (label === undefined) continue;
            const r = textRect(label);
            expect(r.x1).toBeGreaterThanOrEqual(b.x);
            expect(r.x2).toBeLessThanOrEqual(b.x + b.w);
          }
        });

        it('keeps texts clear of every bone', () => {
          const bones = lines(items).filter((l) => l.data?.['part'] === 'bone');
          for (const t of texts(items)) {
            const r = textRect(t);
            for (const bone of bones) {
              const [a, b] = bone.points;
              if (a === undefined || b === undefined) continue;
              for (let k = 0; k <= 200; k += 1) {
                const x = a.x + ((b.x - a.x) * k) / 200;
                const y = a.y + ((b.y - a.y) * k) / 200;
                expect(x > r.x1 && x < r.x2 && y > r.y1 && y < r.y2, `${t.text} on a bone`).toBe(false);
              }
            }
          }
        });

        it('leans every bone two high to one across and ends it on the spine', () => {
          for (const bone of lines(items).filter((l) => l.data?.['part'] === 'bone')) {
            const [a, b] = bone.points;
            if (a === undefined || b === undefined) throw new Error('bone without points');
            expect(Math.abs(b.y - a.y)).toBeCloseTo(2 * (b.x - a.x), 6);
            expect(b.y).toBe(layout.spine.y);
          }
        });

        it('puts every coordinate on the 4 grid', () => {
          for (const l of lines(items)) for (const p of l.points) expect([p.x % 4, p.y % 4]).toEqual([0, 0]);
          for (const b of boxes(items)) expect([b.x % 4, b.y % 4, b.w % 4, b.h % 4]).toEqual([0, 0, 0, 0]);
          expect(layout.scene.width % 4).toBe(0);
          expect(layout.scene.height % 4).toBe(0);
        });
      });
    }
  }

  it('puts the categories above and below the spine in turn, in input order, and the head at the right end', () => {
    const layout = layoutIshikawa(parseIshikawa(syntax), ruler);
    expect(layout.bones.map((b) => b.side)).toEqual(['top', 'bottom', 'top', 'bottom']);
    const [process, user, equipment, environment] = layout.bones;
    expect(process?.join.x).toBe(user?.join.x);
    expect(equipment?.join.x).toBe(environment?.join.x);
    expect(equipment?.join.x ?? 0).toBeGreaterThan(process?.join.x ?? 0);
    expect(layout.head.x).toBeGreaterThan(equipment?.join.x ?? Number.POSITIVE_INFINITY);
    expect(layout.head.x + layout.head.w).toBeLessThanOrEqual(layout.scene.width);
  });

  it('lists the causes of a bone from the top down, with deeper ones set apart by a shorter tick', () => {
    const layout = layoutIshikawa(parseIshikawa(syntax), ruler);
    const equipment = layout.bones[2];
    const ys = equipment?.causes.map((c) => c.y) ?? [];
    expect(ys).toEqual([...ys].sort((a, b) => a - b));
    expect(equipment?.causes[1]?.tick).toBeLessThan(equipment?.causes[0]?.tick ?? 0);
  });

  it('balanced puts each category on the side with fewer causes so far', () => {
    const layout = layoutIshikawa(parseIshikawa(syntax), ruler, undefined, undefined, { assign: 'balanced' });
    expect(layout.bones.map((b) => b.side)).toEqual(['top', 'bottom', 'bottom', 'top']);
  });

  it('draws a title above the drawing when a heading is given', () => {
    const plain = layoutIshikawa(parseIshikawa(syntax), ruler);
    const titled = layoutIshikawa(parseIshikawa(syntax), ruler, undefined, 'Why blurry');
    expect(titled.scene.height).toBe(plain.scene.height + 40);
    expect(texts(titled.scene.items).some((t) => t.text === 'Why blurry')).toBe(true);
  });

  it('draws the same coordinates in the three themes', () => {
    const a = JSON.stringify(layoutIshikawa(parseIshikawa(syntax), ruler, 'solid').scene.items);
    expect(JSON.stringify(layoutIshikawa(parseIshikawa(syntax), ruler, 'outline').scene.items)).toBe(a);
    expect(JSON.stringify(layoutIshikawa(parseIshikawa(syntax), ruler, 'card').scene.items)).toBe(a);
  });
});

describe('ishikawa text', () => {
  it('draws the problem, its categories and their causes as a tree', () => {
    const out = renderText(syntax, 80);
    if ('error' in out) throw new Error(out.error);
    expect(out.lines.slice(0, 8)).toEqual([
      'Blurry Photo',
      '├─ Process',
      '│  ├─ Out of focus',
      '│  ├─ Shutter speed too slow',
      '│  ├─ Protective film not removed',
      '│  └─ Beautification filter applied',
      '├─ User',
      '│  └─ Shaky hands',
    ]);
    expect(out.lines).toContain('│  │  ├─ Inappropriate lens');
    expect(out.lines).toContain('│     └─ Dirty sensor');
    expect(out.lines[out.lines.length - 1]).toBe('   └─ Too dark');
  });

  it('cuts a line to the width limit', () => {
    const out = renderText(syntax, 20);
    if ('error' in out) throw new Error(out.error);
    expect(out.lines.every((l) => [...l].length <= 20)).toBe(true);
    expect(out.lines.some((l) => l.endsWith('…'))).toBe(true);
  });

  it('draws a problem with no category as one line', () => {
    expect(renderText(headOnly, 40)).toEqual({ lines: ['Server down'] });
  });

  it('returns an error for a wrong input', () => {
    const out = renderText('ishikawa-beta\n    P\n        C\n    S', 40);
    expect('error' in out && out.error).toContain('line 4');
  });
});
