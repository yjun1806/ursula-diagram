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

const values = themeValues('band');
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
] as const)('band theme contrast (%s)', (_name, mode) => {
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

describe('band head band', () => {
  it('draws a C4 kind on a band instead of a pill', () => {
    const svg = render(C4, { theme: 'band' });
    expect(svg).toContain('ursula-head-band');
    expect(svg).not.toContain('ursula-cell-pill');
  });

  it('draws the title compartment of a class box on a band', () => {
    expect(render(CLASS, { theme: 'band' })).toContain('ursula-head-band');
  });

  it('draws no band in solid', () => {
    expect(render(C4, { theme: 'solid' })).not.toContain('ursula-head-band');
    expect(render(C4, { theme: 'solid' })).toContain('ursula-cell-pill');
    expect(render(CLASS, { theme: 'solid' })).not.toContain('ursula-head-band');
  });
});

const ports = (svg: string): number => (svg.match(/<circle class="ursula-port"/g) ?? []).length;

describe('band port ring', () => {
  it('rings the start of each line that ends in an arrowhead', () => {
    const svg = render('flowchart TD\n a-->b\n a-->c', { theme: 'band' });
    // Both lines leave a at different points, so there are two rings.
    expect(ports(svg)).toBe(2);
    expect(svg).toContain('.ursula-port{');
  });

  it('draws no ring on a line without an arrowhead', () => {
    expect(ports(render('flowchart TD\n a---b', { theme: 'band' }))).toBe(0);
  });

  it('draws no ring in solid', () => {
    expect(ports(render('flowchart TD\n a-->b\n a-->c', { theme: 'solid' }))).toBe(0);
  });

  it('shows the ring at the start of a sequence message in band, sized by the theme', () => {
    const src = 'sequenceDiagram\n  A->>B: hi';
    const band = render(src, { theme: 'band' });
    expect(band).toContain('.ursula-port{display:inline;');
    expect(band).toMatch(/<circle class="ursula-port ursula-port--msg"[^>]* r="4"/);
    expect(render(src, { theme: 'solid' })).toContain('.ursula-port{display:none;');
  });
});

describe('band chart emphasis', () => {
  const src = 'xychart-beta\n  x-axis [a, b, c, d]\n  bar [3, 9, 5, 7]';
  const marks = (svg: string): string[] => svg.match(/<path class="ursula-mark[^"]*"/g) ?? [];

  it('paints only the highest bar of a single bar series in the accent', () => {
    const bars = marks(render(src, { theme: 'band' }));
    expect(bars).toHaveLength(4);
    expect(bars.filter((b) => b.includes('ursula-mark--peak'))).toHaveLength(1);
    // The second bar holds the highest value, 9.
    expect(bars[1]).toContain('ursula-mark--peak');
  });

  it('gives each of several series its own colour with no emphasis', () => {
    const svg = render('xychart-beta\n  x-axis [a, b, c]\n  bar [3, 9, 5]\n  bar [4, 2, 8]', { theme: 'band' });
    expect(svg).not.toContain('class="ursula-mark ursula-mark--peak"');
    expect(svg).toContain('class="ursula-series-1"');
    expect(svg).toContain('ursula-series-2');
  });

  it('draws the line in ink with a dot of the background', () => {
    const svg = render('xychart-beta\n  x-axis [a, b, c]\n  bar [3, 9, 5]\n  line [4, 6, 5]', { theme: 'band' });
    expect(svg).toContain('<path class="ursula-mark-line--ink"');
    expect(svg).toContain('<circle class="ursula-mark-dot--ink"');
  });

  it('leaves solid unchanged', () => {
    const svg = render(src, { theme: 'solid' });
    expect(svg).not.toContain('ursula-mark--peak');
    expect(marks(svg)).toHaveLength(4);
  });
});

describe('band theme: rings on lines drawn against their meaning and on trunks', () => {
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
