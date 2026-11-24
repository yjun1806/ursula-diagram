// Examples adapted from the Mermaid documentation (MIT).
import { describe, expect, it } from 'vitest';
import { pixelRuler, render, renderText, UrsulaError } from '../src/index.ts';
import { layoutRadar, radarScale, segmentHitsBox } from '../src/radar/layout.ts';
import type { RadarLayout } from '../src/radar/layout.ts';
import { parseRadar } from '../src/radar/parse.ts';

const grades = `---
title: "Grades"
---
radar-beta
  axis m["Math"], s["Science"], e["English"]
  axis h["History"], g["Geography"], a["Art"]
  curve a["Alice"]{85, 90, 80, 70, 75, 90}
  curve b["Bob"]{70, 75, 85, 80, 90, 85}

  max 100
  min 0
`;

const restaurants = `radar-beta
  title Restaurant Comparison
  axis food["Food Quality"], service["Service"], price["Price"]
  axis ambiance["Ambiance"]

  curve a["Restaurant A"]{4, 3, 2, 4}
  curve b["Restaurant B"]{3, 4, 3, 3}
  curve c["Restaurant C"]{2, 3, 4, 2}
  curve d["Restaurant D"]{2, 2, 4, 3}

  graticule polygon
  max 5
`;

const themed = `---
config:
  radar:
    axisScaleFactor: 0.25
    curveTension: 0.1
  theme: base
  themeVariables:
    cScale0: "#FF0000"
    cScale1: "#00FF00"
    cScale2: "#0000FF"
    radar:
      curveOpacity: 0
---
radar-beta
  axis A, B, C, D, E
  curve c1{1,2,3,4,5}
  curve c2{5,4,3,2,1}
  curve c3{3,3,3,3,3}
`;

const examples: Array<[string, string]> = [
  ['01', grades],
  ['02', restaurants],
  ['03', themed],
];

/** The source as a front-end receives it: the front matter block turned into blank lines. */
function body(src: string): string {
  const rows = src.split('\n');
  if (rows[0] !== '---') return src;
  const end = rows.indexOf('---', 1);
  return rows.map((r, i) => (i <= end ? '' : r)).join('\n');
}

function layoutOf(src: string): RadarLayout {
  return layoutRadar(parseRadar(body(src), 'Grades'), pixelRuler());
}

describe('radar theme variables and shared values', () => {
  it('draws the curves as outlines in the palette colours nearest to cScale when curveOpacity is 0', () => {
    const svg = render(themed);
    const roles = [...svg.matchAll(/class="(ursula-series-\d--\w+)"[^>]*data-series="(c\d)"/gu)].filter((m) => !m[1]?.endsWith('--dot')).map((m) => `${m[2]} ${m[1]}`);
    expect(roles).toEqual(['c1 ursula-series-6--line', 'c2 ursula-series-5--line', 'c3 ursula-series-1--line']);
    expect(render(grades)).toContain('ursula-series-1--overlap');
  });

  for (const [name, src] of examples) {
    it(`keeps every curve edge out of the texts in example ${name}`, () => {
      const l = layoutOf(src);
      for (const series of l.series) {
        series.points.forEach((p, i) => {
          const q = series.points[(i + 1) % series.points.length] ?? p;
          for (const b of l.textBoxes) expect(segmentHitsBox(p, q, b), `${series.id} edge ${i} crosses "${b.text}"`).toBe(false);
        });
      }
    });
  }

  it('writes one label where curves meet at the same value on an axis', () => {
    const svg = render(restaurants);
    const labels = (axis: string): string[] => [...svg.matchAll(new RegExp(`data-axis="${axis}" data-series="([^"]*)" data-value="([^"]*)"`, 'gu'))].map((m) => `${m[2]}:${m[1]}`);
    expect(labels('service')).toEqual(['4:b', '3:a c', '2:d']);
    expect(labels('food')).toEqual(['4:a', '3:b', '2:c d']);
    expect(labels('price')).toEqual(['4:c d', '3:b', '2:a']);
  });
});

describe('radar rendering', () => {
  for (const [name, src] of examples) {
    it(`draws example ${name}`, () => {
      const svg = render(src);
      expect(svg).toContain('data-theme="band"');
      expect(svg).toContain('<svg');
    });
  }

  it('reads the title of a front matter block', () => {
    expect(render(grades)).toContain('>Grades</text>');
  });

  it('hides the legend on showLegend false', () => {
    const on = render(restaurants);
    const off = render(`${restaurants}  showLegend false\n`);
    expect(on).toContain('ursula-swatch');
    expect(off).not.toContain('ursula-swatch');
  });

  it('draws circles or polygons by graticule', () => {
    expect(render(grades)).toContain('<circle class="ursula-grid"');
    expect(render(restaurants)).not.toContain('<circle class="ursula-grid"');
  });
});

describe('radar parsing', () => {
  it('reads axes, curves and settings of example 1', () => {
    const m = parseRadar(body(grades), 'Grades');
    expect(m.title).toBe('Grades');
    expect(m.axes.map((a) => a.label)).toEqual(['Math', 'Science', 'English', 'History', 'Geography', 'Art']);
    expect(m.curves.map((c) => c.label)).toEqual(['Alice', 'Bob']);
    expect(m.curves[0]?.values).toEqual([85, 90, 80, 70, 75, 90]);
    expect(m.max).toBe(100);
    expect(m.min).toBe(0);
    expect(m.graticule).toBe('circle');
  });

  it('reads example 2 and 3', () => {
    const m = parseRadar(restaurants);
    expect(m.title).toBe('Restaurant Comparison');
    expect(m.graticule).toBe('polygon');
    expect(m.axes.map((a) => a.id)).toEqual(['food', 'service', 'price', 'ambiance']);
    const t = parseRadar(body(themed));
    expect(t.axes.map((a) => a.label)).toEqual(['A', 'B', 'C', 'D', 'E']);
    expect(t.curves.map((c) => c.id)).toEqual(['c1', 'c2', 'c3']);
  });

  it('reads key-value curves in any order', () => {
    const m = parseRadar('radar-beta\naxis a, b, c\ncurve x{c: 3, a: 1, b: 2}');
    expect(m.curves[0]?.values).toEqual([1, 2, 3]);
  });

  it('reports the line of a broken statement', () => {
    const run = (): unknown => parseRadar('radar-beta\naxis a, b, c\ncurve x{1, 2}');
    expect(run).toThrow(UrsulaError);
    try {
      run();
    } catch (e) {
      expect((e as UrsulaError).line).toBe(3);
    }
    expect(() => parseRadar('radar-beta\nbogus 1')).toThrow(/line 2/);
  });
});

describe('radar layout', () => {
  it('puts every vertex at a distance proportional to its value, first axis at 12 o clock', () => {
    const lay = layoutOf(grades);
    const alice = [85, 90, 80, 70, 75, 90];
    lay.series[0]?.points.forEach((p, i) => {
      const r = Math.hypot(p.x - lay.center.x, p.y - lay.center.y);
      expect(Math.abs(r - ((alice[i] ?? 0) / 100) * lay.radius)).toBeLessThan(1);
    });
    const first = lay.series[0]?.points[0];
    expect(first?.x).toBeCloseTo(lay.center.x, 1);
    expect(first?.y).toBeLessThan(lay.center.y);
    const second = lay.series[0]?.points[1];
    expect(second?.x).toBeGreaterThan(lay.center.x);
  });

  it('takes rings from the scale', () => {
    expect(radarScale(parseRadar(body(grades))).rings).toEqual([20, 40, 60, 80, 100]);
    expect(radarScale(parseRadar(restaurants)).rings).toEqual([1, 2, 3, 4, 5]);
    expect(radarScale(parseRadar('radar-beta\naxis a, b, c\ncurve x{1,2,3}\nmax 90\nticks 3')).rings).toEqual([30, 60, 90]);
  });

  for (const [name, src] of examples) {
    it(`keeps texts apart and inside the drawing in example ${name}`, () => {
      const lay = layoutOf(src);
      const boxes = lay.textBoxes;
      for (const b of boxes) {
        expect(b.x0).toBeGreaterThanOrEqual(0);
        expect(b.y0).toBeGreaterThanOrEqual(0);
        expect(b.x1).toBeLessThanOrEqual(lay.width);
        expect(b.y1).toBeLessThanOrEqual(lay.height);
      }
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i];
          const b = boxes[j];
          if (a === undefined || b === undefined) continue;
          const apart = a.x1 <= b.x0 || b.x1 <= a.x0 || a.y1 <= b.y0 || b.y1 <= a.y0;
          expect(apart, `${a.text} / ${b.text}`).toBe(true);
        }
      }
    });
  }
});

describe('radar text', () => {
  it('writes a table of axes by curves', () => {
    const r = renderText(grades, 60);
    if ('error' in r) throw new Error(r.error);
    expect(r.lines[0]).toBe('Grades');
    expect(r.lines[1]).toMatch(/Alice\s+Bob/u);
    expect(r.lines.find((l) => l.startsWith('Math'))).toMatch(/85\s+70$/u);
  });

  it('shortens labels to the width limit', () => {
    const r = renderText(restaurants, 40);
    if ('error' in r) throw new Error(r.error);
    expect(Math.max(...r.lines.map((l) => l.length))).toBeLessThanOrEqual(40);
  });
});
