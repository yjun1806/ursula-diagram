import { describe, expect, it } from 'vitest';
import { themeValues } from '../src/render/theme.ts';
import { render } from '../src/index.ts';

function luminance(hex: string): number {
  const channel = (i: number): number => {
    const c = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const values = themeValues();
const of = (name: string, mode: 0 | 1): string => {
  const pair = values[name];
  if (pair === undefined) throw new Error(`no token ${name}`);
  const v = pair[mode];
  if (v === 'transparent') return of('surface', mode);
  return v;
};

describe.each([
  ['light', 0],
  ['dark', 1],
] as const)('contrast (%s)', (_name, mode) => {
  it.each([
    ['fg', 'surface', 4.5],
    ['muted', 'surface', 4.5],
    ['fg', 'chip-fill', 4.5],
    ['on-accent', 'start-fill', 4.5],
    ['line', 'surface', 3],
    ['border', 'surface', 3],
  ] as const)('%s on %s is at least %d', (fg, bg, min) => {
    expect(contrast(of(fg, mode), of(bg, mode))).toBeGreaterThanOrEqual(min);
  });
});

const C4 = 'C4Context\n  Person(a, "Customer", "Buys things")\n  System(b, "Shop", "Sells things")\n  Rel(a, b, "Uses")';
const CLASS = 'classDiagram\n  class Animal {\n    +name\n    +eat()\n  }\n  class Dog\n  Animal <|-- Dog';

describe('head band', () => {
  it('draws a C4 kind on a band instead of a pill', () => {
    const svg = render(C4);
    expect(svg).toContain('ursula-head-band');
    expect(svg).not.toContain('ursula-cell-pill');
  });

  it('draws the title compartment of a class box on a band', () => {
    expect(render(CLASS)).toContain('ursula-head-band');
  });
});

const ports = (svg: string): number => (svg.match(/<circle class="ursula-port"/g) ?? []).length;

describe('port ring', () => {
  it('rings the start of each line that ends in an arrowhead', () => {
    const svg = render('flowchart TD\n a-->b\n a-->c');
    // Both lines leave a at different points, so there are two rings.
    expect(ports(svg)).toBe(2);
    expect(svg).toContain('.ursula-port{');
  });

  it('draws no ring on a line without an arrowhead', () => {
    expect(ports(render('flowchart TD\n a---b'))).toBe(0);
  });

  it('shows the ring at the start of a sequence message, sized by the renderer', () => {
    const svg = render('sequenceDiagram\n  A->>B: hi');
    expect(svg).toContain('.ursula-port{display:inline;');
    expect(svg).toMatch(/<circle class="ursula-port ursula-port--msg"[^>]* r="4"/);
  });
});

describe('chart emphasis', () => {
  const src = 'xychart-beta\n  x-axis [a, b, c, d]\n  bar [3, 9, 5, 7]';
  const marks = (svg: string): string[] => svg.match(/<path class="ursula-mark[^"]*"/g) ?? [];

  it('paints only the highest bar of a single bar series in the accent', () => {
    const bars = marks(render(src));
    expect(bars).toHaveLength(4);
    expect(bars.filter((b) => b.includes('ursula-mark--peak'))).toHaveLength(1);
    // The second bar holds the highest value, 9.
    expect(bars[1]).toContain('ursula-mark--peak');
  });

  it('gives each of several series its own colour with no emphasis', () => {
    const svg = render('xychart-beta\n  x-axis [a, b, c]\n  bar [3, 9, 5]\n  bar [4, 2, 8]');
    expect(svg).not.toContain('class="ursula-mark ursula-mark--peak"');
    expect(svg).toContain('class="ursula-series-1"');
    expect(svg).toContain('ursula-series-2');
  });

  it('draws the line in ink with a dot of the background', () => {
    const svg = render('xychart-beta\n  x-axis [a, b, c]\n  bar [3, 9, 5]\n  line [4, 6, 5]');
    expect(svg).toContain('<path class="ursula-mark-line--ink"');
    expect(svg).toContain('<circle class="ursula-mark-dot--ink"');
  });
});

describe('rings on lines drawn against their meaning and on trunks', () => {
  const rings = (svg: string): string[] => svg.match(/<circle class="ursula-port"[^>]*>/g) ?? [];

  it('puts the ring on the bare end of a C4 relation laid out from its target', () => {
    const src = 'C4Context\n  Person(a, "Customer")\n  System(s, "Mail")\n  Rel(s, a, "Sends e-mails to")';
    expect(rings(render(src))).toHaveLength(1);
  });

  it('gives every child of an inheritance trunk its own ring', () => {
    const src = 'classDiagram\n  Animal <|-- Duck\n  Animal <|-- Fish\n  Animal <|-- Zebra';
    expect(rings(render(src))).toHaveLength(3);
  });
});

describe('C4 head bands', () => {
  it('draws one band height in every element, whatever the number of lines under the kind', () => {
    const src = 'C4Context\n  System(a, "Short")\n  System(b, "Long", "A system of the bank, with personal bank accounts and a long description that wraps")\n  Rel(a, b, "Uses")';
    const heights = [...render(src).matchAll(/<rect class="ursula-head-band"[^>]* height="([\d.]+)"/g)].map((m) => m[1]);
    expect(heights).toHaveLength(2);
    expect(new Set(heights).size).toBe(1);
  });
});
