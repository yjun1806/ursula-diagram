// Examples adapted from the Mermaid documentation (MIT).
import { describe, expect, it } from 'vitest';
import { render, renderText, UrsulaError } from '../src/index.ts';
import { pixelRuler } from '../src/metrics.ts';
import { lensArea } from '../src/venn/layout.ts';
import { layoutVenn } from '../src/venn/layout.ts';
import { parseVenn } from '../src/venn/parse.ts';
import { blankFrontMatter, selectFrontEnd } from '../src/registry.ts';

const DEFAULTS = `venn-beta
  title What makes a good feature
  set Desirable
  set Feasible
  set Viable
  union Desirable,Feasible["Buildable"]
  union Feasible,Viable["Sustainable"]
  union Desirable,Viable["Marketable"]
  union Desirable,Feasible,Viable["Ship it"]
`;
const CLASSIC = `---
config:
  theme: default
  look: classic
---
${DEFAULTS}`;
const SYNTAX = `venn-beta
  title "Team overlap"
  set Frontend
  set Backend
  union Frontend,Backend["APIs"]
`;
const LABELS = `venn-beta
  set A["Alpha"]
  set B["Beta"]
  union A,B["AB"]
`;
const HIGHER = `venn-beta
  set Desirable
  set Feasible
  set Viable
  union Desirable,Feasible,Viable["Innovation"]
`;
const SIZES = `venn-beta
  set A["Alpha"]:20
  set B["Beta"]:12
  union A,B["AB"]:3
`;
const TEXTS = `venn-beta
  set A["Frontend"]
    text A1["React"]
    text A2["Design Systems"]
  set B["Backend"]
    text B1["API"]
  union A,B["Shared"]
    text AB1["OpenAPI"]
`;
const STYLING = `venn-beta
  set A["Alpha"]:20
    text A1["React"]
    text A2["Design Systems"]
  set B["Beta"]:12
  union A,B["AB"]:3
  style A fill:#ff6b6b
  style A,B color:#333
  style A1 color:red
`;
const EXAMPLES = { DEFAULTS, CLASSIC, SYNTAX, LABELS, HIGHER, SIZES, TEXTS, STYLING };

const ruler = pixelRuler();
const model = (src: string) => parseVenn(blankFrontMatter(src));
const laid = (src: string) => layoutVenn(model(src), ruler);

interface Box {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  text: string;
}

function textBoxes(src: string): { boxes: Box[]; width: number; height: number } {
  const { scene } = laid(src);
  const boxes = scene.items.flatMap((it): Box[] => {
    if (it.kind !== 'text' || it.anchor !== 'middle') return [];
    const font = it.role?.includes('name') ? 'title' : 'line';
    const w = ruler.textWidth(it.text, font);
    return [{ x0: it.x - w / 2, x1: it.x + w / 2, y0: it.y - 8, y1: it.y + 8, text: it.text }];
  });
  return { boxes, width: scene.width, height: scene.height };
}

describe('venn: drawing', () => {
  for (const [name, src] of Object.entries(EXAMPLES)) {
    it(`draws ${name} in the three themes`, () => {
      for (const theme of ['solid', 'outline', 'card', 'band'] as const) {
        const svg = render(src, { theme });
        expect(svg).toContain(`data-theme="${theme}"`);
        expect(svg).toContain('series-1--overlap');
      }
    });
  }

  it('uses band when no theme is given', () => {
    expect(render(DEFAULTS)).toContain('data-theme="band"');
  });

  it('shows the front-matter title when the text has none', () => {
    const svg = selectFrontEnd('---\ntitle: From the header\n---\nvenn-beta\n  set A\n').svg('---\ntitle: From the header\n---\nvenn-beta\n  set A\n', {});
    expect(svg).toContain('From the header');
  });
});

describe('venn: reading', () => {
  it('reads sets, unions and the title of the default example', () => {
    const v = model(DEFAULTS);
    expect(v.title).toBe('What makes a good feature');
    expect(v.sets.map((s) => s.label)).toEqual(['Desirable', 'Feasible', 'Viable']);
    expect(v.unions.map((u) => [u.ids.join(','), u.label])).toEqual([
      ['Desirable,Feasible', 'Buildable'],
      ['Feasible,Viable', 'Sustainable'],
      ['Desirable,Viable', 'Marketable'],
      ['Desirable,Feasible,Viable', 'Ship it'],
    ]);
  });

  it('reads set labels, sizes and the quoted title', () => {
    expect(model(SYNTAX).title).toBe('Team overlap');
    const v = model(SIZES);
    expect(v.sets.map((s) => [s.id, s.label, s.size])).toEqual([
      ['A', 'Alpha', 20],
      ['B', 'Beta', 12],
    ]);
    expect(v.unions[0]?.size).toBe(3);
  });

  it('attaches text nodes to the set or union above them', () => {
    const v = model(TEXTS);
    expect(v.sets[0]?.texts.map((t) => t.label)).toEqual(['React', 'Design Systems']);
    expect(v.sets[1]?.texts.map((t) => t.label)).toEqual(['API']);
    expect(v.unions[0]?.texts.map((t) => t.label)).toEqual(['OpenAPI']);
  });

  it('reads style statements without drawing them', () => {
    expect(model(STYLING).ignored).toEqual(['style A fill:#ff6b6b', 'style A,B color:#333', 'style A1 color:red']);
  });

  it('reads a union without sizes as unsized and keeps quoted ids', () => {
    const v = model('venn-beta\n  set "Big team"\n  set B\n  union "Big team",B\n');
    expect(v.sets[0]?.id).toBe('Big team');
    expect(v.unions[0]?.ids).toEqual(['Big team', 'B']);
    expect(v.unions[0]?.label).toBeUndefined();
  });
});

describe('venn: layout', () => {
  it('draws equal circles at equal distances when no size is written', () => {
    const { circles } = laid(DEFAULTS);
    const [a, b, c] = circles;
    expect(a && b && c).toBeTruthy();
    if (a === undefined || b === undefined || c === undefined) return;
    expect(new Set(circles.map((x) => x.r)).size).toBe(1);
    const d = (p: typeof a, q: typeof a): number => Math.hypot(p.cx - q.cx, p.cy - q.cy);
    expect(d(a, b)).toBeCloseTo(224, 6);
    expect(d(a, c)).toBeCloseTo(224, 6);
    expect(d(b, c)).toBeCloseTo(224, 6);
  });

  it('makes circle areas follow the set sizes', () => {
    const [a, b] = laid(SIZES).circles;
    if (a === undefined || b === undefined) throw new Error('two circles');
    expect(Math.abs((a.r * a.r) / (b.r * b.r) - 20 / 12)).toBeLessThan(1e-9);
  });

  it('makes the overlap area follow the union size within 1 percent', () => {
    const [a, b] = laid(SIZES).circles;
    if (a === undefined || b === undefined) throw new Error('two circles');
    const unit = (Math.PI * a.r * a.r) / 20;
    const area = lensArea(a.r, b.r, Math.hypot(a.cx - b.cx, a.cy - b.cy));
    expect(Math.abs(area - 3 * unit) / (3 * unit)).toBeLessThan(0.01);
  });

  it('solves each pair of three sets from its overlap', () => {
    const src = `venn-beta
  set A:30
  set B:24
  set C:18
  union A,B:6
  union B,C:4
  union A,C:5
`;
    const { circles } = laid(src);
    const unit = (Math.PI * (circles[0]?.r ?? 0) ** 2) / 30;
    const want: Array<[number, number, number]> = [[0, 1, 6], [1, 2, 4], [0, 2, 5]];
    for (const [i, j, size] of want) {
      const p = circles[i];
      const q = circles[j];
      if (p === undefined || q === undefined) throw new Error('circle');
      const area = lensArea(p.r, q.r, Math.hypot(p.cx - q.cx, p.cy - q.cy));
      expect(Math.abs(area - size * unit) / (size * unit)).toBeLessThan(0.01);
    }
  });

  it('keeps text boxes apart and inside the drawing', () => {
    for (const src of Object.values(EXAMPLES)) {
      const { boxes, width, height } = textBoxes(src);
      for (const b of boxes) {
        expect(b.x0).toBeGreaterThanOrEqual(0);
        expect(b.y0).toBeGreaterThanOrEqual(0);
        expect(b.x1).toBeLessThanOrEqual(width);
        expect(b.y1).toBeLessThanOrEqual(height);
      }
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          const p = boxes[i] as Box;
          const q = boxes[j] as Box;
          const apart = p.x1 <= q.x0 || q.x1 <= p.x0 || p.y1 <= q.y0 || q.y1 <= p.y0;
          expect(apart, `${p.text} / ${q.text}`).toBe(true);
        }
      }
    }
  });

  it('puts a union label inside the lens of its two circles', () => {
    const l = laid(LABELS);
    const [a, b] = l.circles;
    const label = l.labels.find((x) => x.key === 'union:A,B');
    if (a === undefined || b === undefined || label === undefined) throw new Error('missing');
    for (const c of [a, b]) expect(Math.hypot(label.x - c.cx, label.y - c.cy)).toBeLessThan(c.r);
  });

  it('keeps the whole block of every union label inside its circles in every example', () => {
    for (const [name, src] of Object.entries(EXAMPLES)) {
      const l = laid(src);
      for (const label of l.labels.filter((x) => x.key.startsWith('union:'))) {
        const ids = label.key.slice('union:'.length).split(',');
        const corners = [-1, 1].flatMap((sx) => [-1, 1].map((sy) => ({ x: label.x + (sx * label.w) / 2, y: label.y + (sy * label.h) / 2 })));
        for (const c of l.circles.filter((k) => ids.includes(k.id))) {
          for (const p of corners) expect(Math.hypot(p.x - c.cx, p.y - c.cy), `${name} ${label.key}`).toBeLessThan(c.r);
        }
      }
    }
  });

  it('wraps a long union label to fit a narrow overlap', () => {
    const l = laid('venn-beta\n  set A:20\n  set B:20\n  union A,B["A rather long shared label"]:2\n');
    const label = l.labels.find((x) => x.key.startsWith('union'));
    expect(label?.lines.length).toBeGreaterThan(1);
  });

  it('places four sets approximately and says so', () => {
    const l = laid('venn-beta\n  set A\n  set B\n  set C\n  set D\n  union A,B["AB"]\n');
    expect(l.circles).toHaveLength(4);
    expect(l.approximate).toBe(true);
    expect(l.notes.join(' ')).toContain('approximate');
  });

  it('draws one set as one circle', () => {
    const l = laid('venn-beta\n  set Solo\n');
    expect(l.circles).toHaveLength(1);
    expect(l.labels[0]?.lines).toEqual(['Solo']);
  });

  it('draws the styled example in theme colours and lists what it ignored', () => {
    const svg = render(STYLING);
    expect(svg).not.toContain('ff6b6b');
    expect(svg).not.toContain('style="');
    expect(svg).not.toContain('data-style');
    const plain = render(STYLING.replace(/\n {2}style [^\n]*/gu, ''));
    expect(svg).toBe(plain);
    expect(laid(STYLING).notes).toContain('Ignored: style A fill:#ff6b6b');
  });
});

describe('venn: text output', () => {
  it('prints the sets and unions as a table with sizes', () => {
    const out = renderText(SIZES, 60);
    if ('error' in out) throw new Error(out.error);
    expect(out.lines).toHaveLength(3);
    expect(out.lines[0]).toMatch(/^Alpha\s+20$/u);
    expect(out.lines[2]).toMatch(/^Alpha ∩ Beta : AB\s+3$/u);
    expect(new Set(out.lines.map((l) => l.length)).size).toBe(1);
  });

  it('starts with the title and leaves out the size column when no size is written', () => {
    const out = renderText(DEFAULTS, 60);
    if ('error' in out) throw new Error(out.error);
    expect(out.lines[0]).toBe('What makes a good feature');
    expect(out.lines).toContain('Desirable ∩ Feasible : Buildable');
  });

  it('cuts labels to the width', () => {
    const out = renderText(DEFAULTS, 20);
    if ('error' in out) throw new Error(out.error);
    for (const l of out.lines) expect([...l].length).toBeLessThanOrEqual(20);
  });
});

describe('venn: errors', () => {
  it('reports a line that is no statement', () => {
    try {
      render('venn-beta\n  set A\n  circle B\n');
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(UrsulaError);
      expect((err as UrsulaError).line).toBe(3);
    }
  });

  it('reports a union of an undefined set with its line', () => {
    try {
      render('venn-beta\n  set A\n  union A,B["x"]\n');
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(UrsulaError);
      expect((err as UrsulaError).line).toBe(3);
    }
  });

  it('reports a size that is not a number', () => {
    expect(() => render('venn-beta\n  set A:many\n')).toThrow(UrsulaError);
  });
});
