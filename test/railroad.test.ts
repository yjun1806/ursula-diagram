// Examples adapted from the Mermaid documentation (MIT).
import { describe, expect, it } from 'vitest';
import { cellWidth, pixelRuler } from '../src/metrics.ts';
import { render, renderText, UrsulaError } from '../src/index.ts';
import { layoutRailroad } from '../src/railroad/layout.ts';
import { parseRailroad } from '../src/railroad/parse.ts';
import type { Node } from '../src/railroad/model.ts';
import { SCENE_THEME_SPECS } from '../src/render/scene-theme.ts';
import type { Scene, SceneBox, SceneText } from '../src/types.ts';
import { EXAMPLES } from './railroad-examples.ts';

const THEMES = ['solid', 'outline', 'card'] as const;
const names = Object.keys(EXAMPLES);
const sourceOf = (name: string): string => EXAMPLES[name] as string;

const T = (text: string): Node => ({ k: 'terminal', text });
const N = (name: string): Node => ({ k: 'nonterminal', name });

describe('railroad examples', () => {
  it('has the fourteen official examples', () => {
    expect(names).toHaveLength(14);
  });
  for (const name of names) {
    it(`draws ${name} in three themes and as text`, () => {
      for (const theme of THEMES) expect(render(sourceOf(name), { theme })).toContain(`data-theme="${theme}"`);
      const text = renderText(sourceOf(name), 80);
      expect('lines' in text).toBe(true);
    });
  }
});

describe('railroad reading', () => {
  it('reads the constructor form', () => {
    const m = parseRailroad(sourceOf('railroad/01-ir-primitives'));
    expect(m.notation).toBe('ir');
    expect(m.title).toBe('Expression Grammar');
    expect(m.rules.map((r) => r.name)).toEqual(['expression', 'term', 'factor', 'number', 'digit']);
    expect(m.rules[3]?.body).toEqual({ k: 'repeat', item: N('digit'), min: 1, max: null });
    const digit = m.rules[4]?.body;
    expect(digit?.k === 'choice' && digit.items.length).toBe(10);
  });

  it('reads EBNF sequence, choice, optional and repetition', () => {
    const m = parseRailroad(sourceOf('railroad-ebnf/05-optional-elements'));
    expect(m.title).toBe('Optional Sign');
    expect(m.rules[1]?.body).toEqual({
      k: 'seq',
      items: [{ k: 'optional', item: N('sign') }, { k: 'repeat', item: N('digit'), min: 1, max: null }],
    });
    const arith = parseRailroad(sourceOf('railroad-ebnf/08-ebnf-examples'));
    expect(arith.rules[0]?.body).toEqual({
      k: 'seq',
      items: [N('term'), { k: 'repeat', item: { k: 'seq', items: [{ k: 'choice', items: [T('+'), T('-')] }, N('term')] }, min: 0, max: null }],
    });
  });

  it('reads the ISO forms: commas, brackets, braces, comments, special sequences, exceptions', () => {
    const m = parseRailroad('railroad-ebnf-beta\n(* head *) a = "x" , [ b ] , { c } /* tail */ , ? any char ? ;\nd = e - f ;');
    expect(m.rules[0]?.body).toEqual({
      k: 'seq',
      items: [T('x'), { k: 'optional', item: N('b') }, { k: 'repeat', item: N('c'), min: 0, max: null }, { k: 'special', text: 'any char' }],
    });
    expect(m.rules[1]?.body).toEqual({ k: 'except', item: N('e'), except: N('f') });
  });

  it('reads ABNF repeat counts, numeric values and incremental alternatives', () => {
    const m = parseRailroad(sourceOf('railroad-abnf/01-abnf'));
    expect(m.rules[1]?.body).toEqual({ k: 'repeat', item: { k: 'choice', items: [N('ALPHA'), N('DIGIT'), T('.'), T('-')] }, min: 1, max: null });
    expect(m.rules[2]?.body).toEqual({ k: 'seq', items: [N('label'), { k: 'repeat', item: { k: 'seq', items: [T('.'), N('label')] }, min: 0, max: null }] });
    const counted = parseRailroad('railroad-abnf-beta\n; a note\na = 2*4DIGIT 3"x" *2y [ %x30-39 ] ;\na =/ "b" ;');
    expect(counted.rules[0]?.body).toEqual({
      k: 'choice',
      items: [
        {
          k: 'seq',
          items: [
            { k: 'repeat', item: N('DIGIT'), min: 2, max: 4 },
            { k: 'repeat', item: T('x'), min: 3, max: 3 },
            { k: 'repeat', item: N('y'), min: 0, max: 2 },
            { k: 'optional', item: T('%x30-39') },
          ],
        },
        T('b'),
      ],
    });
  });

  it('reads PEG ordered choice and lookahead', () => {
    const m = parseRailroad(sourceOf('railroad-peg/02-peg-2'));
    expect(m.rules[0]?.body).toEqual({
      k: 'seq',
      items: [{ k: 'predicate', op: 'not', item: N('Keyword') }, N('Letter'), { k: 'repeat', item: N('Letter'), min: 0, max: null }],
    });
    const any = parseRailroad('railroad-peg-beta\n# c\nA <- &"x" . [a-z] ;');
    expect(any.rules[0]?.body).toEqual({
      k: 'seq',
      items: [{ k: 'predicate', op: 'and', item: T('x') }, { k: 'special', text: '.' }, T('[a-z]')],
    });
  });

  it('takes the title from the heading when the body has none and from accTitle for the SVG title', () => {
    expect(parseRailroad('railroad-peg-beta\nA <- "a" ;', 'From front matter').title).toBe('From front matter');
    const svg = render('railroad-peg-beta\naccTitle: Plain\naccDescr: text\nA <- "a" ;');
    expect(svg).toContain('<title>Plain</title>');
  });
});

describe('railroad layout', () => {
  const ruler = pixelRuler();
  const boxes = (src: string): { boxes: SceneBox[]; texts: SceneText[]; width: number; height: number } => {
    const { scene } = layoutRailroad(parseRailroad(src), ruler);
    return {
      boxes: scene.items.filter((i): i is SceneBox => i.kind === 'box'),
      texts: scene.items.filter((i): i is SceneText => i.kind === 'text'),
      width: scene.width,
      height: scene.height,
    };
  };

  it('makes a token as wide as its text (8 a letter at least) plus 32 on the 8 grid, 48 at least, 32 high', () => {
    const { boxes: b } = boxes('railroad-ebnf-beta\nr = "+" expression ;');
    const tokens = b.filter((x) => x.role?.includes('token'));
    expect(tokens).toHaveLength(2);
    for (const t of tokens) {
      expect(t.h).toBe(32);
      expect(t.w % 8).toBe(0);
      expect(t.w).toBeGreaterThanOrEqual(48);
    }
    expect(tokens[0]?.w).toBe(48);
    const wide = tokens[1] as SceneBox;
    const textW = Math.max(ruler.textWidth('expression', 'line'), 8 * 'expression'.length);
    expect(wide.w).toBeGreaterThanOrEqual(textW + 32);
    expect(wide.w).toBeLessThan(textW + 32 + 8);
  });

  it('puts a ring where a repeat loop leaves the line', () => {
    const { scene } = layoutRailroad(parseRailroad('railroad-ebnf-beta\nr = a* ;'), ruler);
    const rings = scene.items.filter((i) => i.kind === 'circle' && i.role.includes('port'));
    const arrow = scene.items.find((i) => i.kind === 'line' && Array.isArray(i.role) && i.role.includes('edge--arrow'));
    expect(rings).toHaveLength(1);
    expect(arrow?.kind === 'line' ? arrow.points[0] : undefined).toEqual({ x: rings[0]?.kind === 'circle' ? rings[0].cx : NaN, y: rings[0]?.kind === 'circle' ? rings[0].cy : NaN });
  });

  it('puts the tokens of a sequence 24 apart', () => {
    const t = boxes('railroad-ebnf-beta\nr = a b c ;').boxes.filter((x) => x.role?.includes('token'));
    expect(t).toHaveLength(3);
    for (let i = 1; i < 3; i++) expect((t[i] as SceneBox).x - ((t[i - 1] as SceneBox).x + (t[i - 1] as SceneBox).w)).toBe(24);
  });

  it('stacks the branches of a choice 8 apart and centres them', () => {
    const t = boxes('railroad-ebnf-beta\nr = a | "long text here" | b ;').boxes.filter((x) => x.role?.includes('token'));
    expect(t).toHaveLength(3);
    for (let i = 1; i < 3; i++) expect((t[i] as SceneBox).y - ((t[i - 1] as SceneBox).y + 32)).toBe(8);
    const centre = (b: SceneBox): number => b.x + b.w / 2;
    expect(Math.abs(centre(t[0] as SceneBox) - centre(t[1] as SceneBox))).toBeLessThanOrEqual(2);
  });

  it('draws a loop 24 under the token with one arrow and a skip 24 over it for zero or more', () => {
    const { scene } = layoutRailroad(parseRailroad('railroad-ebnf-beta\nr = a* ;'), ruler);
    const token = scene.items.find((i): i is SceneBox => i.kind === 'box') as SceneBox;
    const lines = scene.items.filter((i) => i.kind === 'line');
    const ys = lines.flatMap((l) => (l.kind === 'line' ? l.points.map((p) => p.y) : []));
    expect(Math.min(...ys)).toBe(token.y - 24);
    expect(Math.max(...ys)).toBe(token.y + 32 + 24);
    const arrows = lines.filter((l) => l.kind === 'line' && Array.isArray(l.role) && l.role.includes('edge--arrow'));
    expect(arrows).toHaveLength(1);
    const once = layoutRailroad(parseRailroad('railroad-ebnf-beta\nr = a+ ;'), ruler).scene;
    const onceYs = once.items.flatMap((i) => (i.kind === 'line' ? i.points.map((p) => p.y) : []));
    expect(Math.min(...onceYs)).toBe((once.items.find((i): i is SceneBox => i.kind === 'box') as SceneBox).y + 16);
  });

  type Seg = { line: number; x0: number; y0: number; x1: number; y1: number; arrow: boolean };
  const segments = (scene: Scene): Seg[] =>
    scene.items.flatMap((item, line) => {
      if (item.kind !== 'line') return [];
      const arrow = Array.isArray(item.role) && item.role.includes('edge--arrow');
      return item.points.slice(1).map((p, i) => {
        const q = item.points[i] as { x: number; y: number };
        return { line, x0: Math.min(p.x, q.x), y0: Math.min(p.y, q.y), x1: Math.max(p.x, q.x), y1: Math.max(p.y, q.y), arrow };
      });
    });

  it('never continues one rail straight through the axis into another', () => {
    for (const name of [...names, 'skip-loop']) {
      const src = name === 'skip-loop' ? 'railroad-ebnf-beta\nr = ( a | b )* c* ;' : sourceOf(name);
      const vs = segments(layoutRailroad(parseRailroad(src), ruler).scene).filter((s) => s.x0 === s.x1 && s.y1 > s.y0);
      for (const a of vs) {
        for (const b of vs) {
          if (a.line === b.line || a.x0 !== b.x0) continue;
          expect(a.y1 === b.y0, `${name}: rails meet end to end at x ${a.x0}, y ${a.y1}`).toBe(false);
        }
      }
    }
  });

  it('keeps every rail and arrowhead out of the tokens and every arrowhead clear of other rails', () => {
    for (const theme of THEMES) {
      for (const name of names) {
        const { scene } = layoutRailroad(parseRailroad(sourceOf(name)), ruler, theme);
        const boxesIn = scene.items.filter((i): i is SceneBox => i.kind === 'box');
        const segs = segments(scene);
        const len = SCENE_THEME_SPECS[theme].arrow.length;
        for (const s of segs) {
          for (const b of boxesIn) {
            const inside = s.x0 < b.x + b.w - 1 && s.x1 > b.x + 1 && s.y0 < b.y + b.h - 1 && s.y1 > b.y + 1;
            expect(inside, `${theme} ${name}: a rail passes through a box at ${b.x},${b.y}`).toBe(false);
          }
        }
        for (const item of scene.items) {
          if (item.kind !== 'line' || !Array.isArray(item.role) || !item.role.includes('edge--arrow')) continue;
          const tip = item.points[item.points.length - 1] as { x: number; y: number };
          const head = { x0: tip.x, x1: tip.x + len, y0: tip.y - len / 2, y1: tip.y + len / 2 };
          for (const b of boxesIn) expect(head.x0 < b.x + b.w && head.x1 > b.x && head.y0 < b.y + b.h && head.y1 > b.y, `${theme} ${name}: arrowhead on a box`).toBe(false);
          for (const s of segs) {
            if (s.y0 === s.y1) continue;
            expect(s.x0 > head.x0 && s.x0 < head.x1 && s.y0 < head.y1 && s.y1 > head.y0, `${theme} ${name}: a rail crosses an arrowhead`).toBe(false);
          }
        }
      }
    }
  });

  it('numbers the branches of an ordered choice from the top, left of each token and over its rail', () => {
    const { boxes: b, texts } = boxes('railroad-peg-beta\nr <- "a" / "bb" / c ;');
    const tokens = b.filter((x) => x.role?.includes('token'));
    const numbers = texts.filter((t) => /^\d+$/u.test(t.text));
    expect(numbers.map((t) => t.text)).toEqual(['1', '2', '3']);
    numbers.forEach((n, i) => {
      const token = tokens[i] as SceneBox;
      expect(n.x).toBeLessThan(token.x);
      expect(n.y).toBeLessThan(token.y + token.h / 2);
      expect(n.y).toBeGreaterThan(token.y);
    });
    expect(new Set(numbers.map((n) => n.x)).size).toBe(1);
    expect(boxes('railroad-ebnf-beta\nr = "a" | "b" ;').texts.some((t) => /^\d+$/u.test(t.text))).toBe(false);
    expect(boxes('railroad-abnf-beta\nr = "a" / "b" ;').texts.some((t) => /^\d+$/u.test(t.text))).toBe(false);
  });

  it('writes a count chip on a counted repeat and none on a plain loop', () => {
    const counted = boxes('railroad-abnf-beta\nr = 2*4a ;').texts.map((t) => t.text);
    expect(counted).toContain('2*4');
    expect(boxes('railroad-abnf-beta\nr = 1*a ;').texts.map((t) => t.text)).not.toContain('1*');
  });

  it('shows a lookahead mark and tells terminals, non-terminals and special sequences apart', () => {
    const b = boxes('railroad-peg-beta\nr <- !a "b" . ;');
    expect(b.texts.map((t) => t.text)).toContain('!');
    const roles = b.boxes.map((x) => (x.role ?? []).join(' '));
    expect(roles).toContain('token');
    expect(roles).toContain('token token--terminal');
    expect(roles).toContain('token box--pending');
    expect(roles).toContain('tag');
  });

  it('keeps boxes on the 4 grid', () => {
    for (const name of names) {
      for (const b of boxes(sourceOf(name)).boxes) {
        for (const v of [b.x, b.y, b.w, b.h]) expect(v % 2).toBe(0);
        if (b.role?.includes('token')) for (const v of [b.x, b.y, b.w, b.h]) expect(v % 4).toBe(0);
      }
    }
  });

  it('puts every text inside the drawing, inside its token, and clear of other texts', () => {
    for (const name of names) {
      const { boxes: bs, texts, width, height } = boxes(sourceOf(name));
      const rects = texts.map((t) => {
        const mono = t.role?.includes('mono') === true || t.role?.includes('tag-text') === true;
        const bold = t.role?.includes('zone-name') === true || t.role?.includes('title') === true;
        const size = t.role?.includes('title') === true ? 15 : t.role?.includes('tag-text') === true ? 11 : t.role?.includes('zone-name') === true ? 13 : 12;
        const w = Math.max(ruler.textWidth(t.text, 'line') * (size / 12), mono ? cellWidth(t.text) * 0.6 * size : 0) * (bold ? 1.06 : 1);
        const x0 = t.anchor === 'middle' ? t.x - w / 2 : t.x;
        return { t, x0, x1: x0 + w, y0: t.y - size / 2, y1: t.y + size / 2 };
      });
      for (const r of rects) {
        expect(r.x0).toBeGreaterThanOrEqual(0);
        expect(r.x1).toBeLessThanOrEqual(width);
        expect(r.y0).toBeGreaterThanOrEqual(0);
        expect(r.y1).toBeLessThanOrEqual(height);
      }
      for (let i = 0; i < rects.length; i++) {
        for (let j = i + 1; j < rects.length; j++) {
          const a = rects[i];
          const b = rects[j];
          if (a === undefined || b === undefined) continue;
          expect(a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1, `${name}: "${a.t.text}" overlaps "${b.t.text}"`).toBe(false);
        }
      }
      for (const r of rects) {
        const owner = bs.find((b) => (b.role?.includes('token') === true || b.role?.includes('tag') === true) && r.t.x > b.x && r.t.x < b.x + b.w && Math.abs(r.t.y - (b.y + b.h / 2)) < 1);
        if (owner !== undefined) {
          expect(r.x0, `${name}: "${r.t.text}"`).toBeGreaterThanOrEqual(owner.x);
          expect(r.x1, `${name}: "${r.t.text}"`).toBeLessThanOrEqual(owner.x + owner.w);
        }
      }
    }
  });

  it('draws the same boxes in the three themes', () => {
    const shape = (theme: 'solid' | 'outline' | 'card'): string[] =>
      layoutRailroad(parseRailroad(sourceOf('railroad-ebnf/08-ebnf-examples')), ruler, theme).scene.items.filter((i) => i.kind === 'box').map((i) => JSON.stringify(i));
    expect(shape('outline')).toEqual(shape('solid'));
    expect(shape('card')).toEqual(shape('solid'));
  });

  it('rounds the bends by the theme', () => {
    const radius = (theme: 'solid' | 'outline' | 'card'): number | undefined => {
      const l = layoutRailroad(parseRailroad('railroad-ebnf-beta\nr = a | b ;'), ruler, theme).scene.items.find((i) => i.kind === 'line' && i.points.length > 2);
      return l?.kind === 'line' ? l.radius : undefined;
    };
    expect([radius('outline'), radius('solid'), radius('card')]).toEqual([12, 16, 14]);
  });
});

describe('railroad text', () => {
  it('writes one EBNF line per rule under the title', () => {
    const t = renderText(sourceOf('railroad-ebnf/09-ebnf-examples-2'), 100);
    expect('lines' in t && t.lines).toEqual([
      'JSON Grammar',
      'json = element ;',
      'element = object | array | string | number | "true" | "false" | "null" ;',
      'object = "{" [ member ( "," member )* ] "}" ;',
      'array = "[" [ element ( "," element )* ] "]" ;',
      'member = string ":" element ;',
    ]);
  });

  it('writes counts and lookahead, and breaks a long choice at the bars', () => {
    const t = renderText('railroad-abnf-beta\nr = 2*4a ;', 80);
    expect('lines' in t && t.lines).toEqual(['r = a{2,4} ;']);
    const p = renderText('railroad-peg-beta\nr <- !a &b . ;', 80);
    expect('lines' in p && p.lines).toEqual(['r = !a &b . ;']);
    const wrapped = renderText(sourceOf('railroad-ebnf/09-ebnf-examples-2'), 40);
    expect('lines' in wrapped).toBe(true);
    if ('lines' in wrapped) expect(Math.max(...wrapped.lines.map(cellWidth))).toBeLessThanOrEqual(40);
  });
});

describe('railroad errors', () => {
  it('names the line of a rule that does not end with ;', () => {
    const run = (): string => render('railroad-ebnf-beta\n\na = "x" ;\nb = "y"');
    expect(run).toThrow(UrsulaError);
    try {
      run();
    } catch (e) {
      expect((e as UrsulaError).line).toBe(4);
    }
  });

  it('names the line of an unclosed group and of an unknown constructor', () => {
    try {
      render('railroad-ebnf-beta\na = "x" ;\nb = ( "y" ;');
      throw new Error('no error');
    } catch (e) {
      expect(e).toBeInstanceOf(UrsulaError);
      expect((e as UrsulaError).line).toBe(3);
    }
    try {
      render('railroad-beta\na = loop(terminal("x")) ;');
      throw new Error('no error');
    } catch (e) {
      expect(e).toBeInstanceOf(UrsulaError);
      expect((e as UrsulaError).line).toBe(2);
    }
  });
});
