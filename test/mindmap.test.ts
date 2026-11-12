// Examples adapted from the Mermaid documentation (MIT).
import { describe, expect, it } from 'vitest';
import { pixelRuler } from '../src/metrics.ts';
import { render, renderText, UrsulaError } from '../src/index.ts';
import { layoutMindmap } from '../src/mindmap/layout.ts';
import { parseMindmap } from '../src/mindmap/parse.ts';
import type { MindNode } from '../src/mindmap/model.ts';
import type { SceneBox, SceneText } from '../src/types.ts';

const BASIC = `mindmap
  root((mindmap))
    Origins
      Long history
      ::icon(fa fa-book)
      Popularisation
        British popular psychology author Tony Buzan
    Research
      On effectiveness<br/>and features
      On Automatic creation
        Uses
            Creative techniques
            Strategic planning
            Argument mapping
    Tools
      Pen and paper
      Mermaid
`;

const SHAPES = `mindmap
  id[I am a square]
`;

const MARKDOWN = `mindmap
    id1["\`**Root** with
a second line
Unicode works too: 🤓\`"]
      id2["\`The dog in **the** hog... a *very long text* that wraps to a new line\`"]
      id3[Regular labels still works]
`;

const DEPTH = `---
config:
  mindmap:
    colorBy: depth
---
mindmap
  root((mindmap))
    origins{{Origins}}
      history[Long history]
        Popularisation
    research{{Research}}
      uses[Uses]
`;

const OTHERS: Array<[string, string]> = [
  ['syntax', 'mindmap\nRoot\n    A\n      B\n      C\n'],
  ['square', SHAPES],
  ['rounded', 'mindmap\n    id(I am a rounded square)\n'],
  ['circle', 'mindmap\n    id((I am a circle))\n'],
  ['bang', 'mindmap\n    id))I am a bang((\n'],
  ['cloud', 'mindmap\n    id)I am a cloud(\n'],
  ['hexagon', 'mindmap\n    id{{I am a hexagon}}\n'],
  ['default', 'mindmap\n    I am the default shape\n'],
  ['icons', 'mindmap\n    Root\n        A\n        ::icon(fa fa-book)\n        B(B)\n        ::icon(mdi mdi-skull-outline)\n'],
  ['classes', 'mindmap\n    Root\n        A[A]\n        :::urgent large\n        B(B)\n        C\n'],
  ['unclear', 'mindmap\nRoot\n    A\n        B\n      C\n'],
  ['markdown', MARKDOWN],
  ['depth', DEPTH],
];
const THEMES = ['solid', 'outline', 'card'] as const;

const walk = (n: MindNode): MindNode[] => [n, ...n.children.flatMap(walk)];

describe('mindmap render', () => {
  for (const [name, src] of [['basic', BASIC], ...OTHERS] as Array<[string, string]>) {
    it(`draws ${name} in three themes`, () => {
      for (const theme of THEMES) expect(render(src, { theme })).toContain(`data-theme="${theme}"`);
      expect(render(src)).toContain('data-theme="solid"');
    });
  }
});

describe('mindmap parse', () => {
  it('reads the outline of the basic example', () => {
    const m = parseMindmap(BASIC);
    expect(m.root.paragraphs).toEqual(['mindmap']);
    expect(m.root.shape).toBe('circle');
    expect(m.root.children.map((c) => c.paragraphs[0])).toEqual(['Origins', 'Research', 'Tools']);
    const origins = m.root.children[0] as MindNode;
    expect(origins.children.map((c) => c.paragraphs[0])).toEqual(['Long history', 'Popularisation']);
    expect(origins.children[1]?.children[0]?.paragraphs).toEqual(['British popular psychology author Tony Buzan']);
    const research = m.root.children[1] as MindNode;
    expect(research.children[0]?.paragraphs).toEqual(['On effectiveness', 'and features']);
    expect(walk(m.root)).toHaveLength(15);
  });

  it('reads every shape delimiter', () => {
    const shapes = ['square', 'rounded', 'circle', 'bang', 'cloud', 'hexagon', 'default'].map((k) => {
      const src = OTHERS.find(([n]) => n === k)?.[1] ?? '';
      const r = parseMindmap(src).root;
      return [r.shape, r.paragraphs[0]];
    });
    expect(shapes).toEqual([
      ['square', 'I am a square'],
      ['round', 'I am a rounded square'],
      ['circle', 'I am a circle'],
      ['bang', 'I am a bang'],
      ['cloud', 'I am a cloud'],
      ['hexagon', 'I am a hexagon'],
      ['default', 'I am the default shape'],
    ]);
  });

  it('puts an under-indented node under the nearest shallower parent', () => {
    const m = parseMindmap('mindmap\nRoot\n    A\n        B\n      C\n');
    expect((m.root.children[0] as MindNode).children.map((c) => c.paragraphs[0])).toEqual(['B', 'C']);
  });

  it('reads markdown strings over several lines', () => {
    const m = parseMindmap(MARKDOWN);
    expect(m.root.paragraphs).toEqual(['Root with', 'a second line', 'Unicode works too: 🤓']);
    expect(m.root.children[0]?.paragraphs).toEqual(['The dog in the hog... a very long text that wraps to a new line']);
    expect(m.root.children[1]?.paragraphs).toEqual(['Regular labels still works']);
  });

  it('keeps bold and italic of a markdown string as runs of the plain paragraph', () => {
    const m = parseMindmap(MARKDOWN);
    expect(m.root.runs?.[0]).toEqual([{ text: 'Root', bold: true }, { text: ' with' }]);
    expect(m.root.runs?.[1]).toEqual([{ text: 'a second line' }]);
    expect(m.root.children[0]?.runs?.[0]).toEqual([
      { text: 'The dog in ' },
      { text: 'the', bold: true },
      { text: ' hog... a ' },
      { text: 'very long text', italic: true },
      { text: ' that wraps to a new line' },
    ]);
    expect(m.root.children[1]?.runs).toBeUndefined();
    const under = parseMindmap('mindmap\n  a["`an _odd_ snake_case_name`"]');
    expect(under.root.paragraphs).toEqual(['an odd snake_case_name']);
    expect(under.root.runs?.[0]).toEqual([{ text: 'an ' }, { text: 'odd', italic: true }, { text: ' snake_case_name' }]);
  });

  it('draws the runs of a markdown string as spans of each wrapped line', () => {
    const lay = layoutMindmap(parseMindmap(MARKDOWN), pixelRuler());
    const texts = lay.scene.items.filter((i): i is SceneText => i.kind === 'text');
    const root = texts.find((t) => t.text === 'Root with');
    expect(root?.spans).toEqual([{ text: 'Root', weight: 'bold' }, { text: ' with' }]);
    const dog = texts.filter((t) => t.spans?.some((s) => s.text.includes('dog') || s.italic === true));
    expect(dog.length).toBeGreaterThan(1);
    for (const t of dog) expect(t.spans?.map((s) => s.text).join('')).toBe(t.text);
    expect(dog.flatMap((t) => t.spans ?? []).filter((s) => s.italic === true).map((s) => s.text).join(' ')).toBe('very long text');
    expect(texts.find((t) => t.text === 'Regular labels still works')?.spans).toBeUndefined();
    const svg = render(MARKDOWN);
    expect(svg).toContain('<tspan font-weight="bold">Root</tspan><tspan> with</tspan>');
  });

  it('ignores icon and class lines', () => {
    const m = parseMindmap(OTHERS.find(([n]) => n === 'classes')?.[1] ?? '');
    expect(m.root.children.map((c) => c.paragraphs[0])).toEqual(['A', 'B', 'C']);
  });
});

describe('mindmap layout', () => {
  const lay = layoutMindmap(parseMindmap(BASIC), pixelRuler());
  const boxes = lay.scene.items.filter((i): i is SceneBox => i.kind === 'box');
  const texts = lay.scene.items.filter((i): i is SceneText => i.kind === 'text');

  it('puts the root in the middle with children split over both sides', () => {
    const root = lay.nodes[0];
    expect(root?.side).toBe(0);
    expect(new Set(lay.nodes.filter((n) => n.depth === 1).map((n) => n.side))).toEqual(new Set([1, -1]));
    for (const n of lay.nodes.filter((x) => x.side === 1)) expect(n.x).toBeGreaterThan((root?.x ?? 0) + (root?.w ?? 0) - 1);
  });

  it('keeps 32 between columns and gives a column one width', () => {
    const right = lay.nodes.filter((n) => n.side === 1);
    const col1 = right.filter((n) => n.depth === 1);
    expect(new Set(col1.map((n) => n.w)).size).toBe(1);
    const root = lay.nodes[0];
    expect((col1[0]?.x ?? 0) - ((root?.x ?? 0) + (root?.w ?? 0))).toBe(32);
    const col2 = right.filter((n) => n.depth === 2);
    expect((col2[0]?.x ?? 0) - ((col1[0]?.x ?? 0) + (col1[0]?.w ?? 0))).toBe(32);
  });

  it('centres each parent between its first and last child', () => {
    for (const [i, n] of lay.nodes.entries()) {
      const kids = lay.nodes.filter((k) => k.parent === i);
      if (kids.length === 0 || i === 0) continue;
      const mid = ((kids[0]?.y ?? 0) + (kids[0]?.h ?? 0) / 2 + (kids[kids.length - 1]?.y ?? 0) + (kids[kids.length - 1]?.h ?? 0) / 2) / 2;
      expect(Math.abs(n.y + n.h / 2 - mid)).toBeLessThanOrEqual(4);
    }
  });

  it('sizes boxes by line count: 48, 68, 84', () => {
    const byText = (t: string) => lay.nodes.find((n) => n.lines.join(' ') === t);
    expect(byText('Origins')?.h).toBe(48);
    expect(byText('On effectiveness and features')?.h).toBe(68);
    expect(lay.nodes.every((n) => [48, 68, 84].includes(n.h) || n.node.shape === 'circle')).toBe(true);
    const long = lay.nodes.find((n) => n.node.paragraphs[0]?.startsWith('British'));
    expect(long?.lines).toEqual(['British popular', 'psychology author', 'Tony Buzan']);
    expect(long?.h).toBe(84);
    expect(byText('On Automatic creation')?.lines).toEqual(['On Automatic', 'creation']);
  });

  it('puts the first big branch top left, then the right half, then the rest of the left half going up', () => {
    const top = lay.nodes.filter((n) => n.depth === 1);
    const left = top.filter((n) => n.side === -1).sort((a, b) => a.y - b.y).map((n) => n.lines.join(' '));
    const right = top.filter((n) => n.side === 1).map((n) => n.lines.join(' '));
    expect(left).toEqual(['Origins', 'Tools']);
    expect(right).toEqual(['Research']);
    const five = layoutMindmap(parseMindmap('mindmap\n  R\n    A\n    B\n    C\n    D\n    E\n'), pixelRuler());
    const l5 = five.nodes.filter((n) => n.side === -1).sort((a, b) => a.y - b.y).map((n) => n.lines[0]);
    const r5 = five.nodes.filter((n) => n.side === 1).sort((a, b) => a.y - b.y).map((n) => n.lines[0]);
    expect(r5).toEqual(['B', 'C', 'D']);
    expect(l5).toEqual(['A', 'E']);
  });

  it('keeps a single big branch on the right', () => {
    const one = layoutMindmap(parseMindmap('mindmap\nRoot\n    A\n      B\n'), pixelRuler());
    expect(one.nodes[1]?.side).toBe(1);
  });

  it('draws a root without delimiters as the default box, and a root in (( )) as a circle', () => {
    const plain = layoutMindmap(parseMindmap('mindmap\n    I am the default shape\n'), pixelRuler());
    expect(plain.scene.items.some((i) => i.kind === 'circle')).toBe(false);
    expect(plain.scene.items.some((i) => i.kind === 'box')).toBe(true);
    const round = layoutMindmap(parseMindmap('mindmap\n    id((I am a circle))\n'), pixelRuler());
    expect(round.scene.items.some((i) => i.kind === 'circle')).toBe(true);
  });

  it('overlaps no two boxes and no two texts', () => {
    for (const a of boxes) {
      for (const b of boxes) {
        if (a === b) continue;
        expect(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y).toBe(true);
      }
    }
    const ruler = pixelRuler();
    const rects = texts.map((t) => ({ x: t.x - ruler.textWidth(t.text, 'title') / 2, w: ruler.textWidth(t.text, 'title'), y: t.y - 8, h: 16 }));
    rects.forEach((a, i) =>
      rects.forEach((b, j) => {
        if (i >= j) return;
        expect(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y).toBe(true);
      }),
    );
  });

  it('keeps every text inside its box and inside the drawing', () => {
    const ruler = pixelRuler();
    for (const t of texts) {
      const w = ruler.textWidth(t.text, 'title');
      expect(t.x - w / 2).toBeGreaterThanOrEqual(0);
      expect(t.x + w / 2).toBeLessThanOrEqual(lay.scene.width);
      expect(t.y).toBeGreaterThan(0);
      expect(t.y).toBeLessThan(lay.scene.height);
    }
    for (const n of lay.nodes) {
      const own = texts.filter((t) => Math.abs(t.x - (n.x + n.w / 2)) < 1e-6 && t.y > n.y && t.y < n.y + n.h);
      expect(own.map((t) => t.text)).toEqual(n.lines);
      for (const t of own) expect(ruler.textWidth(t.text, 'title')).toBeLessThanOrEqual(n.w);
    }
  });

  it('breaks a long label at words, never longer than 20 characters', () => {
    const ruler = pixelRuler();
    const l = layoutMindmap(parseMindmap('mindmap\n  R\n    ' + 'word '.repeat(30).trim() + '\n'), ruler);
    const node = l.nodes[1];
    expect((node?.lines.length ?? 0) > 1).toBe(true);
    for (const line of node?.lines ?? []) expect([...line].length).toBeLessThanOrEqual(20);
  });

  it('draws the front-matter title above the map and colours by depth when asked', () => {
    const titled = layoutMindmap(parseMindmap(SHAPES), pixelRuler(), { heading: 'Ideas' });
    expect(titled.scene.items.some((i) => i.kind === 'text' && i.text === 'Ideas')).toBe(true);
    const svg = render(DEPTH);
    expect(svg).toContain('ursula-series-1');
    expect(svg).toContain('ursula-series-2');
    expect(render(BASIC)).not.toContain('class="ursula-series');
  });
});

describe('mindmap text', () => {
  it('draws a tree', () => {
    const r = renderText(BASIC, 80);
    if ('error' in r) throw new Error(r.error);
    expect(r.lines.slice(0, 5)).toEqual(['mindmap', '├── Origins', '│   ├── Long history', '│   └── Popularisation', '│       └── British popular psychology author Tony Buzan']);
    expect(r.lines.at(-1)).toBe('    └── Mermaid');
  });
});

describe('mindmap errors', () => {
  it('rejects a second root with its line number', () => {
    try {
      render('mindmap\n  Root\n    A\n  Another\n');
      throw new Error('no error');
    } catch (e) {
      expect(e).toBeInstanceOf(UrsulaError);
      expect((e as UrsulaError).line).toBe(4);
    }
  });

  it('rejects an empty node with its line number', () => {
    try {
      render('mindmap\n  Root\n    A[]\n');
      throw new Error('no error');
    } catch (e) {
      expect(e).toBeInstanceOf(UrsulaError);
      expect((e as UrsulaError).line).toBe(3);
    }
  });
});
