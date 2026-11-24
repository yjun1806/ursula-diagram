import { describe, expect, it } from 'vitest';
import { renderHtml } from '../src/html.ts';
import { render } from '../src/index.ts';
import { COLORS, fillColors } from '../src/render/colors.ts';
import { BAKE_SOURCE } from '../src/render/html.ts';
import { sceneStyleSheet } from '../src/render/scene-svg.ts';

const FLOW = 'flowchart LR\n  a([Start]) --> b{Choose}\n  b -->|yes| c[Done]\n  b -.-> d[(Store)]';
const CLASS = 'classDiagram\n  class Animal {\n    +name\n    +eat()\n  }\n  class Dog\n  Animal <|-- Dog\n  Animal o-- Dog\n  note for Dog "barks"';
const C4 = `C4Container
  Person(u, "User")
  Enterprise_Boundary(e, "Company") {
    System_Boundary(s, "Shop") {
      Container_Boundary(c, "Core") {
        Container(api, "API", "Node")
        Container(db, "Store", "Postgres")
      }
    }
  }
  Rel(u, api, "Uses", "HTTPS")
  Rel(api, db, "Reads")`;
const SEQUENCE = 'sequenceDiagram\n  actor A\n  A->>+B: hi\n  Note over A,B: both\n  loop again\n    B-->>-A: yo\n  end';
const CHART = 'xychart-beta\n  x-axis [a, b, c]\n  line [1, 2, 3]\n  line [3, 2, 1]\n  bar [2, 2, 2]';
const PIE = 'pie\n  "a" : 1\n  "b" : 2\n  "c" : 3\n  "d" : 4\n  "e" : 5\n  "f" : 6\n  "g" : 7\n  "h" : 8';

const DRAWINGS = { FLOW, CLASS, C4, SEQUENCE, CHART, PIE };

/** Names of the variables a text reads. */
function read(text: string): string[] {
  return [...new Set([...text.matchAll(/var\(--ursula-([^,)\s]+)/g)].map((m) => m[1] ?? ''))];
}

/** Declarations of the block of a page's style sheet that starts with `selector`. */
function declared(page: string, selector: string): Map<string, string> {
  const at = page.indexOf(`${selector}{`);
  const block = page.slice(at + selector.length + 1, page.indexOf('}', at));
  return new Map([...block.matchAll(/--ursula-([a-z0-9-]+):([^;]+)/g)].map((m) => [m[1] ?? '', m[2] ?? '']));
}

describe('colour variables', () => {
  it('names every colour in lower case letters, digits and hyphens', () => {
    for (const name of Object.keys(COLORS)) expect(name).toMatch(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/);
  });

  it('fills a placeholder with the variable and the value of its scheme', () => {
    expect(fillColors('a{fill:$fg;stroke:$s2-tint}', 0)).toBe('a{fill:var(--ursula-fg,#201f1e);stroke:var(--ursula-s2-tint,#d2eef1)}');
    expect(fillColors('a{fill:$fg}', 1)).toBe('a{fill:var(--ursula-fg,#efeeec)}');
  });

  it.each(Object.entries(DRAWINGS))('reads only colours of the table in %s', (_name, src) => {
    const svg = render(src);
    for (const name of read(svg)) expect(Object.keys(COLORS)).toContain(name);
    expect(svg).not.toContain(',inherit)');
  });

  it('reads only colours of the table in the whole scene sheet', () => {
    const sheet = sceneStyleSheet();
    for (const name of read(sheet)) expect(Object.keys(COLORS)).toContain(name);
    expect(sheet).not.toContain('inherit');
  });

  it('has no colour that no drawing reads', () => {
    const all = new Set([...read(sceneStyleSheet()), ...Object.values(DRAWINGS).flatMap((src) => read(render(src)))]);
    expect(Object.keys(COLORS).filter((name) => !all.has(name))).toEqual([]);
  });

  it('strokes a line between boxes with the same variable in both kinds of drawing', () => {
    const edge = /\.ursula-edge\{fill:none;stroke:var\(--ursula-line,#565554\)/;
    expect(render(FLOW)).toMatch(edge);
    expect(render(SEQUENCE)).toMatch(edge);
    expect(render(SEQUENCE)).toMatch(/\.ursula-box\{fill:var\(--ursula-surface,#fcfcfa\);stroke:var\(--ursula-border,#484846\)/);
  });
});

describe('colours of an exported page', () => {
  it.each(Object.entries(DRAWINGS))('declares every colour %s reads, in both schemes', (_name, src) => {
    const page = renderHtml(src);
    const svg = page.slice(page.indexOf('<svg '), page.indexOf('</svg>'));
    const light = declared(page, ':root');
    const dark = declared(page, ':root[data-theme="dark"]');
    const names = read(svg).filter((name) => name !== 'bg');
    expect(names.length).toBeGreaterThan(3);
    for (const name of names) {
      expect(light.get(name), name).toBe(COLORS[name]?.[0]);
      expect(dark.get(name), name).toBe(COLORS[name]?.[1]);
    }
  });

  it('declares the dark values for a viewer whose system is dark, and the light ones in print', () => {
    const page = renderHtml(SEQUENCE);
    expect(declared(page, ':root:not([data-theme="light"])').get('surface')).toBe('#171614');
    expect(declared(page, ':root,:root:not([data-theme="light"]),:root[data-theme="dark"]').get('surface')).toBe('#fcfcfa');
  });

  it('leaves the background of a drawing to the page', () => {
    expect(declared(renderHtml(FLOW), ':root').has('bg')).toBe(false);
  });

  it('saves a variable with a digit in its name as its value', () => {
    const bake = new Function(`return ${BAKE_SOURCE}`)() as (text: string, get: (name: string) => string) => string;
    const svg = render(CHART);
    expect(read(svg)).toContain('s2');
    const baked = bake(svg, (name) => COLORS[name]?.[1] ?? 'transparent');
    expect(baked).not.toContain('var(');
    expect(baked).toContain(`stroke:${COLORS['s2']?.[1]}`);
  });
});
