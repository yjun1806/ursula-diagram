// Examples adapted from the Mermaid documentation (MIT).
import { describe, expect, it } from 'vitest';
import { pixelRuler } from '../src/metrics.ts';
import { render, renderText, UrsulaError } from '../src/index.ts';
import { selectFrontEnd } from '../src/registry.ts';
import { makeFormatter } from '../src/chart/format.ts';
import { layoutTreemap } from '../src/treemap/layout.ts';
import { parseTreemap } from '../src/treemap/parse.ts';
import type { SceneBox, SceneText } from '../src/types.ts';

const EXAMPLES: Record<string, string> = {
  basic: `treemap-beta
"Category A"
    "Item A1": 10
    "Item A2": 20
"Category B"
    "Item B1": 15
    "Item B2": 25`,
  hierarchical: `treemap-beta
"Products"
    "Electronics"
        "Phones": 50
        "Computers": 30
        "Accessories": 20
    "Clothing"
        "Men's": 40
        "Women's": 40`,
  styling: `treemap-beta
"Section 1"
    "Leaf 1.1": 12
    "Section 1.2":::class1
      "Leaf 1.2.1": 12
"Section 2"
    "Leaf 2.1": 20:::class1
    "Leaf 2.2": 25
    "Leaf 2.3": 12

classDef class1 fill:red,color:blue,stroke:#FFD600;`,
  classdef: `treemap-beta
"Main"
    "A": 20
    "B":::important
        "B1": 10
        "B2": 15
    "C": 5

classDef important fill:#f96,stroke:#333,stroke-width:2px;`,
  theme: `---
config:
    theme: 'forest'
---
treemap-beta
"Category A"
    "Item A1": 10
    "Item A2": 20
"Category B"
    "Item B1": 15
    "Item B2": 25`,
  padding: `---
config:
  treemap:
    diagramPadding: 200
---
treemap-beta
"Category A"
    "Item A1": 10
    "Item A2": 20
"Category B"
    "Item B1": 15
    "Item B2": 25`,
  currency: `---
config:
  treemap:
    valueFormat: '$0,0'
---
treemap-beta
"Budget"
    "Operations"
        "Salaries": 700000
        "Equipment": 200000
        "Supplies": 100000
    "Marketing"
        "Advertising": 400000
        "Events": 100000`,
  percent: `---
config:
  treemap:
    valueFormat: '$.1%'
---
treemap-beta
"Market Share"
    "Company A": 0.35
    "Company B": 0.25
    "Company C": 0.15
    "Others": 0.25`,
};

const THEMES = ['solid', 'outline', 'card'] as const;

/** What a front-end receives: the front-matter block turned into blank lines. */
const body = (src: string): string => src.replace(/^---[\s\S]*?\n---\n/u, (m) => '\n'.repeat(m.split('\n').length - 1));

function layoutOf(src: string) {
  const front = selectFrontEnd(src).json(src, 'svg', {}) as { tiles: Array<{ w: number; h: number; value: number }>; scene: { width: number; height: number; items: unknown[] }; areaError: number };
  return front;
}

describe('treemap render', () => {
  for (const [name, src] of Object.entries(EXAMPLES)) {
    it(`draws ${name} in three themes`, () => {
      for (const theme of THEMES) expect(render(src, { theme })).toContain(`data-theme="${theme}"`);
    });
    it(`prints ${name} as a tree`, () => {
      const out = renderText(src, 80);
      expect('error' in out).toBe(false);
    });
  }
});

describe('treemap parse', () => {
  it('reads sections, leaves and classes', () => {
    const map = parseTreemap(body(EXAMPLES['styling'] ?? ''));
    expect(map.roots.map((r) => r.label)).toEqual(['Section 1', 'Section 2']);
    const s1 = map.roots[0];
    expect(s1?.children.map((c) => c.label)).toEqual(['Leaf 1.1', 'Section 1.2']);
    expect(s1?.children[1]?.cls).toBe('class1');
    expect(s1?.children[1]?.children[0]?.value).toBe(12);
    expect(map.roots[1]?.children[0]).toMatchObject({ label: 'Leaf 2.1', value: 20, cls: 'class1' });
    expect(map.classDefs['class1']).toContain('fill:red');
  });

  it('reads the three levels of the hierarchical example', () => {
    const map = parseTreemap(EXAMPLES['hierarchical'] ?? '');
    expect(map.roots).toHaveLength(1);
    expect(map.roots[0]?.children.map((c) => c.children.length)).toEqual([3, 2]);
    expect(map.roots[0]?.children[0]?.children.map((c) => c.value)).toEqual([50, 30, 20]);
  });

  it('takes the number format and padding from the config', () => {
    const map = parseTreemap(body(EXAMPLES['currency'] ?? ''), undefined, { treemap: { valueFormat: '$0,0', diagramPadding: 12 } });
    expect(map.valueFormat).toBe('$0,0');
    expect(map.diagramPadding).toBe(12);
    expect(parseTreemap(EXAMPLES['basic'] ?? '').valueFormat).toBe(',');
  });

  it('lets an init directive win over the config', () => {
    const src = `%%{init: {"treemap": {"valueFormat": ".1f"}}}%%\ntreemap-beta\n"A": 1`;
    expect(parseTreemap(src, undefined, { treemap: { valueFormat: '$0,0' } }).valueFormat).toBe('.1f');
  });

  it('reports a bad line with its number', () => {
    const src = 'treemap-beta\n"A"\n    "B": ten';
    try {
      render(src);
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(UrsulaError);
      expect((err as UrsulaError).line).toBe(3);
    }
    expect(() => render('treemap-beta\n"A"\n    "B": -3')).toThrow(UrsulaError);
    expect(() => render('treemap-beta\n"A"')).toThrow(UrsulaError);
  });
});

describe('treemap value format', () => {
  it('follows the specifiers of the examples', () => {
    expect(makeFormatter(',')(1234.5)).toBe('1,234.5');
    expect(makeFormatter('$0,0')(700000)).toBe('$700,000');
    expect(makeFormatter('$.1%')(0.35)).toBe('35.0%');
    expect(makeFormatter('$,.2f')(1400)).toBe('$1,400.00');
    expect(makeFormatter('.1f')(2)).toBe('2.0');
  });
});

describe('treemap layout', () => {
  for (const [name, src] of Object.entries(EXAMPLES)) {
    it(`keeps tile areas proportional to the values in ${name}`, () => {
      const { tiles } = layoutOf(src);
      const unit = tiles.reduce((a, t) => a + t.w * t.h, 0) / tiles.reduce((a, t) => a + t.value, 0);
      for (const t of tiles) expect(Math.abs((t.w * t.h) / (unit * t.value) - 1)).toBeLessThan(0.01);
    });
  }

  it('keeps text apart and inside the drawing', () => {
    const ruler = pixelRuler();
    for (const src of Object.values(EXAMPLES)) {
      const { scene } = layoutTreemap(parseTreemap(body(src)), ruler);
      const texts = scene.items.filter((i): i is SceneText => i.kind === 'text');
      const boxes = texts.map((t) => {
        const w = ruler.textWidth(t.text, t.role?.includes('value') ? 'line' : 'title') * (t.role?.includes('title') ? 15 / 13 : 1);
        return { x: t.x, y: t.y - 8, w, h: 16, text: t.text };
      });
      for (const b of boxes) {
        expect(b.x).toBeGreaterThanOrEqual(0);
        expect(b.x + b.w).toBeLessThanOrEqual(scene.width);
        expect(b.y).toBeGreaterThanOrEqual(0);
        expect(b.y + b.h).toBeLessThanOrEqual(scene.height);
      }
      boxes.forEach((a, i) => {
        boxes.slice(i + 1).forEach((b) => {
          const apart = a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
          expect(apart).toBe(true);
        });
      });
    }
  });

  it('keeps every text inside its own tile', () => {
    const ruler = pixelRuler();
    const { scene } = layoutTreemap(parseTreemap(body(EXAMPLES['currency'] ?? '')), ruler);
    const tiles = scene.items.filter((i): i is SceneBox => i.kind === 'box' && (i.role ?? []).includes('tile'));
    for (const t of scene.items.filter((i): i is SceneText => i.kind === 'text' && ((i.role ?? []).includes('name') || (i.role ?? []).includes('value')))) {
      const owner = tiles.find((b) => t.x >= b.x && t.x <= b.x + b.w && t.y >= b.y && t.y <= b.y + b.h);
      expect(owner).toBeDefined();
      if (owner === undefined) continue;
      expect(t.x + ruler.textWidth(t.text, 'title')).toBeLessThanOrEqual(owner.x + owner.w);
    }
  });

  it('drops the value, then cuts the name, then the text, and keeps the label as data', () => {
    const src = `treemap-beta
"Root"
    "A rather long leaf name": 1000
    "Tiny": 1
    "Small": 3
    "Name that cannot fit": 2`;
    const map = parseTreemap(src);
    const { tiles, scene } = layoutTreemap(map, pixelRuler());
    const tiny = tiles.find((t) => t.label === 'Tiny');
    expect(tiny?.valueShown).toBeUndefined();
    const big = tiles.find((t) => t.label === 'A rather long leaf name');
    expect(big?.nameShown).toBe('A rather long leaf name');
    expect(big?.valueShown).toBe('1,000');
    const cutOnes = tiles.filter((t) => t.nameShown !== undefined && t.nameShown !== t.label);
    for (const t of cutOnes) expect(t.nameShown?.endsWith('…')).toBe(true);
    const hidden = tiles.filter((t) => t.nameShown === undefined);
    expect(hidden.length + cutOnes.length).toBeGreaterThan(0);
    for (const t of hidden) {
      const box = scene.items.find((i): i is SceneBox => i.kind === 'box' && i.data?.['label'] === t.label);
      expect(box?.data?.['label']).toBe(t.label);
    }
  });

  const BUDGET = `treemap-beta
"Monthly Budget"
    "Housing"
        "Rent": 1400
        "Utilities": 220
        "Internet": 60
    "Food"
        "Groceries": 480
        "Dining out": 180
    "Transport"
        "Car payment": 320
        "Fuel": 140
    "Savings"
        "Emergency fund": 300
        "Retirement": 400`;

  it('places columns left to right and tiles top to bottom in input order, the first at the top left', () => {
    const { tiles, groups } = layoutTreemap(parseTreemap(BUDGET), pixelRuler());
    const tile = (label: string) => tiles.find((t) => t.label === label);
    const group = (label: string) => groups.find((g) => g.label === label);
    const names = ['Housing', 'Food', 'Transport', 'Savings'];
    expect(group('Housing')?.x).toBe(40);
    names.slice(1).forEach((n, i) => {
      expect(group(n)?.x).toBeGreaterThan(group(names[i] ?? '')?.x ?? Infinity);
      expect(group(n)?.y).toBe(group('Housing')?.y);
    });
    expect(tile('Rent')).toMatchObject({ x: 40, y: 100 });
    expect(tile('Groceries')?.y).toBeLessThan(tile('Dining out')?.y ?? 0);
    expect(tile('Emergency fund')?.y).toBeLessThan(tile('Retirement')?.y ?? 0);
  });

  it('gives every column the same height and fills the content width', () => {
    const { tiles } = layoutTreemap(parseTreemap(BUDGET), pixelRuler());
    const bottoms = ['Internet', 'Dining out', 'Fuel', 'Retirement'].map((l) => tiles.find((t) => t.label === l)).map((t) => (t?.y ?? 0) + (t?.h ?? 0));
    for (const b of bottoms) expect(b).toBeCloseTo(500, 6);
    const right = Math.max(...tiles.map((t) => t.x + t.w));
    expect(right).toBeCloseTo(976, 6);
  });

  it('moves low tiles into one row at the foot of the column', () => {
    const { tiles } = layoutTreemap(parseTreemap(BUDGET), pixelRuler());
    const rent = tiles.find((t) => t.label === 'Rent');
    const utilities = tiles.find((t) => t.label === 'Utilities');
    const internet = tiles.find((t) => t.label === 'Internet');
    expect(utilities?.y).toBeCloseTo(internet?.y ?? 0, 6);
    expect(utilities?.h).toBeCloseTo(internet?.h ?? 0, 6);
    expect((utilities?.y ?? 0) - ((rent?.y ?? 0) + (rent?.h ?? 0))).toBeCloseTo(4, 6);
    // Their widths follow the values (220 : 60) and the gap between them is 4.
    expect((utilities?.w ?? 0) / (internet?.w ?? 1)).toBeCloseTo(220 / 60, 6);
    expect((internet?.x ?? 0) - ((utilities?.x ?? 0) + (utilities?.w ?? 0))).toBeCloseTo(4, 6);
  });

  it('keeps a foot row lower than a label exact in area and sheds its text', () => {
    const { tiles } = layoutTreemap(parseTreemap(body(EXAMPLES['currency'] ?? '')), pixelRuler());
    const supplies = tiles.find((t) => t.label === 'Supplies');
    expect(supplies?.h).toBeLessThan(56);
    const unit = tiles.reduce((a, t) => a + t.w * t.h, 0) / tiles.reduce((a, t) => a + t.value, 0);
    expect(Math.abs(((supplies?.w ?? 0) * (supplies?.h ?? 0)) / (unit * 100000) - 1)).toBeLessThan(0.001);
    expect(supplies?.valueShown).toBeUndefined();
    expect(supplies?.nameShown).toBeUndefined();
    expect(supplies?.label).toBe('Supplies');
  });

  it('stacks nested groups with their names above their tiles', () => {
    const { tiles, groups } = layoutTreemap(parseTreemap(body(EXAMPLES['styling'] ?? '')), pixelRuler());
    const sub = groups.find((g) => g.label === 'Section 1.2');
    const leaf = tiles.find((t) => t.label === 'Leaf 1.2.1');
    const first = tiles.find((t) => t.label === 'Leaf 1.1');
    expect(sub).toBeDefined();
    expect((leaf?.y ?? 0) - (sub?.y ?? 0)).toBe(12);
    expect((sub?.y ?? 0)).toBeGreaterThan((first?.y ?? 0) + (first?.h ?? 0));
  });

  it('gives a lone column the whole width', () => {
    const { tiles } = layoutTreemap(parseTreemap('treemap-beta\n"Only"\n    "A": 3\n    "B": 1'), pixelRuler());
    expect(Math.max(...tiles.map((t) => t.x + t.w))).toBeCloseTo(976, 6);
  });

  it('prints groups with their totals', () => {
    const out = renderText(EXAMPLES['currency'] ?? '', 80);
    if ('error' in out) throw new Error(out.error);
    expect(out.lines[0]).toMatch(/^Budget\s+\$1,500,000$/u);
    expect(out.lines.some((l) => /^├── Operations\s+\$1,000,000$/u.test(l))).toBe(true);
    expect(out.lines.some((l) => /^│   └── Supplies\s+\$100,000$/u.test(l))).toBe(true);
  });
});
