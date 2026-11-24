// Examples adapted from the Mermaid documentation (MIT).
import { describe, expect, it } from 'vitest';
import { pixelRuler } from '../src/metrics.ts';
import { render, renderText, selectFrontEnd } from '../src/index.ts';
import { blankFrontMatter } from '../src/registry.ts';
import { UrsulaError } from '../src/types.ts';
import type { Scene, SceneText } from '../src/types.ts';
import { layoutXychart } from '../src/xychart/layout.ts';
import { parseXychart } from '../src/xychart/parse.ts';

const MONTHS = `xychart
    title "Sales Revenue"
    x-axis [jan, feb, mar, apr, may, jun, jul, aug, sep, oct, nov, dec]
    y-axis "Revenue (in $)" 4000 --> 11000
    bar [5000, 6000, 7500, 8200, 9500, 10500, 11000, 10200, 9200, 8500, 7000, 6000]
    line [5000, 6000, 7500, 8200, 9500, 10500, 11000, 10200, 9200, 8500, 7000, 6000]`;

const LEGEND = `xychart-beta
  title "An Example Chart"
  x-axis ["90d", "60d", "30d", "7d", "1d", "Current"]
  y-axis "Seconds" 0 --> 198.2
  line "avg" [48.1, 41.5, 45.7, 72.8, 67.7, 59.9]
  line "p50" [38.2, 36.8, 39.7, 54.5, 49.0, 38.4]
  line "p95" [112.2, 75.3, 103.0, 177.0, 180.2, 109.4]`;

const COLORS = `---
config:
  themeVariables:
    xyChart:
      plotColorPalette: '#000000, #0000FF, #00FF00, #FF0000'
---
xychart
title "Different Colors in xyChart"
x-axis "categoriesX" ["Category 1", "Category 2", "Category 3", "Category 4"]
y-axis "valuesY" 0 --> 50
%% Black line
line [10,20,30,40]
%% Blue bar
bar [20,30,25,35]
%% Green bar
bar [15,25,20,30]
%% Red line
line [5,15,25,35]`;

const GENRES = `xychart
    title "Genres in top 100 book survey of 2025"
    x-axis [comedy, romance, mystery, crime, "non fiction", other]
    y-axis "Number of Books" 0 --> 30
    bar [12,2,20,25,17,24]`;

const INSIDE = `---
config:
    xyChart:
        showDataLabel: true
---
${GENRES}`;

const OUTSIDE = `---
config:
    xyChart:
        showDataLabel: true
        showDataLabelOutsideBar: true
---
${GENRES}`;

const LABELS = `xychart
    title "Smallest AI models scoring above 60% on MMLU"
    x-axis "Date" ["Apr 2022", "Feb 2023", "Jul 2023", "Sep 2023", "Apr 2024"]
    y-axis "Parameters (B)" 0 --> 600
    line [540 "PaLM", 65 "LLaMA-65B", 34 "Llama 2 34B", 7 "Mistral 7B", 3.8 "Phi-3-mini"]`;

const SOME_LABELS = `xychart
    title "Quarterly Performance"
    x-axis [Q1, Q2, Q3, Q4]
    y-axis "Revenue ($M)" 0 --> 100
    line [25 "Launch", 45, 72, 90 "Target Hit"]`;

const CONFIGURED = `---
config:
    xyChart:
        width: 900
        height: 600
        showDataLabel: true
    themeVariables:
        xyChart:
            titleColor: "#ff0000"
---
${MONTHS}`;

const EXAMPLES: Record<string, string> = {
  month: MONTHS,
  legend: LEGEND,
  colors: COLORS,
  inside: INSIDE,
  outside: OUTSIDE,
  labels: LABELS,
  someLabels: SOME_LABELS,
  configured: CONFIGURED,
};

const HORIZONTAL = `xychart horizontal
  title "Sales"
  x-axis [jan, feb, mar, "non fiction"]
  y-axis "Revenue" 0 --> 100
  bar "a" [30, 60, 90, 10]
  line "b" [25 "up", 55, 65, 15]`;

/** Scene of a source, drawn through the registered front-end. */
function sceneOf(src: string): Scene {
  const out = selectFrontEnd(src).json(src, 'svg', {}) as { layout: { scene: Scene } };
  return out.layout.scene;
}

const ruler = pixelRuler();
const SIZE: Record<string, number> = { title: 15, 'axis-name': 12, legend: 12, label: 12 };

function boxes(scene: Scene): { t: SceneText; x0: number; x1: number; y0: number; y1: number }[] {
  const texts = scene.items.filter((i): i is SceneText => i.kind === 'text');
  return texts.map((t) => {
    const px = SIZE[t.role?.[0] ?? ''] ?? 11;
    const w = (ruler.textWidth(t.text, 'line') * px) / 12;
    const x0 = t.anchor === 'end' ? t.x - w : t.anchor === 'middle' ? t.x - w / 2 : t.x;
    return { t, x0, x1: x0 + w, y0: t.y - px / 2, y1: t.y + px / 2 };
  });
}

describe('xychart examples', () => {
  for (const [name, src] of Object.entries(EXAMPLES)) {
    it(`draws ${name}`, () => {
      const svg = render(src);
      expect(svg).toContain('data-theme="band"');
      expect(svg.startsWith('<svg')).toBe(true);
    });
  }
});

describe('xychart parse', () => {
  it('reads the months, the range and the two series', () => {
    const chart = parseXychart(MONTHS);
    expect(chart.title).toBe('Sales Revenue');
    expect(chart.categories).toHaveLength(12);
    expect(chart.categories?.[11]).toBe('dec');
    expect(chart.yTitle).toBe('Revenue (in $)');
    expect(chart.yRange).toEqual({ min: 4000, max: 11000 });
    expect(chart.series.map((s) => s.kind)).toEqual(['bar', 'line']);
    expect(chart.series[0]?.points.map((p) => p.value)).toEqual([5000, 6000, 7500, 8200, 9500, 10500, 11000, 10200, 9200, 8500, 7000, 6000]);
  });
  it('reads names, quoted categories and series order', () => {
    const chart = parseXychart(LEGEND);
    expect(chart.categories).toEqual(['90d', '60d', '30d', '7d', '1d', 'Current']);
    expect(chart.series.map((s) => s.name)).toEqual(['avg', 'p50', 'p95']);
    expect(chart.series[2]?.points[3]?.raw).toBe('177.0');
    expect(parseXychart(blankFrontMatter(COLORS)).series.map((s) => s.kind)).toEqual(['line', 'bar', 'bar', 'line']);
    expect(parseXychart(blankFrontMatter(COLORS)).xTitle).toBe('categoriesX');
  });
  it('reads point labels and keeps unlabelled points bare', () => {
    const chart = parseXychart(SOME_LABELS);
    expect(chart.series[0]?.points.map((p) => p.label)).toEqual(['Launch', undefined, undefined, 'Target Hit']);
    expect(parseXychart(LABELS).series[0]?.points[4]).toEqual({ value: 3.8, raw: '3.8', label: 'Phi-3-mini' });
  });
  it('reads the orientation, signed and bare decimals, and a list over two lines', () => {
    const chart = parseXychart('xychart horizontal\n  line [+1.3, .6,\n 2.4, -.34]');
    expect(chart.horizontal).toBe(true);
    expect(chart.series[0]?.points.map((p) => p.value)).toEqual([1.3, 0.6, 2.4, -0.34]);
  });
  it('takes the settings of a front matter from the options', () => {
    const out = selectFrontEnd(CONFIGURED).json(CONFIGURED, 'svg', {}) as { chart: { config: Record<string, unknown> } };
    expect(out.chart.config).toEqual({ width: 900, height: 600, showDataLabel: true });
  });
});

describe('xychart layout', () => {
  it('puts every point of the line at a height proportional to its value', () => {
    const scene = sceneOf(MONTHS);
    const dots = scene.items.filter((i) => i.kind === 'circle');
    expect(dots).toHaveLength(12);
    const values = [5000, 6000, 7500, 8200, 9500, 10500, 11000, 10200, 9200, 8500, 7000, 6000];
    const base = (dots[0]?.kind === 'circle' ? dots[0].cy : 0) + ((5000 - 4000) / 7000) * 280;
    dots.forEach((d, i) => {
      if (d.kind !== 'circle') return;
      expect(Math.abs(base - d.cy - (((values[i] ?? 0) - 4000) / 7000) * 280)).toBeLessThanOrEqual(1);
    });
  });
  it('gives every bar a length proportional to its value above the axis start', () => {
    const scene = sceneOf(MONTHS);
    const bars = scene.items.filter((i) => i.kind === 'path' && i.role.includes('mark'));
    expect(bars).toHaveLength(12);
    const values = [5000, 6000, 7500, 8200, 9500, 10500, 11000, 10200, 9200, 8500, 7000, 6000];
    bars.forEach((b, i) => {
      if (b.kind !== 'path') return;
      const m = /^M[\d.]+ ([\d.]+)V[\d.]+Q[\d.]+ ([\d.]+) /.exec(b.d);
      const length = Number(m?.[1]) - Number(m?.[2]);
      expect(Math.abs(length - (((values[i] ?? 0) - 4000) / 7000) * 280)).toBeLessThanOrEqual(1);
    });
  });
  it('keeps both ends of a given range as ticks and steps by 1000 between', () => {
    const out = selectFrontEnd(MONTHS).json(MONTHS, 'svg', {}) as { layout: { ticks: number[] } };
    expect(out.layout.ticks).toEqual([4000, 5000, 6000, 7000, 8000, 9000, 10000, 11000]);
    const second = selectFrontEnd(LEGEND).json(LEGEND, 'svg', {}) as { layout: { ticks: number[] } };
    expect(second.layout.ticks[0]).toBe(0);
    expect(second.layout.ticks[second.layout.ticks.length - 1]).toBe(198.2);
  });
  it('colours several different series apart and a repeated series once', () => {
    const body = (svg: string): string => svg.split('</style>')[1] ?? '';
    const colored = body(render(LEGEND));
    expect(colored).toContain('ursula-series-1--line');
    expect(colored).toContain('ursula-series-3--line');
    const one = body(render(MONTHS));
    expect(one).toContain('ursula-mark-line');
    expect(one).not.toContain('series-1');
  });
  it('sets bars of one category side by side inside the category width', () => {
    const scene = sceneOf(COLORS);
    const bars = scene.items.filter((i) => i.kind === 'path' && i.role.some((r) => /^series-\d$/.test(r)));
    expect(bars).toHaveLength(8);
    const firstTwo = bars.slice(0, 2).map((b) => (b.kind === 'path' ? /^M([\d.]+) /.exec(b.d)?.[1] : undefined));
    expect(Number(firstTwo[1])).toBeGreaterThan(Number(firstTwo[0]));
  });
  it('writes a title, an axis name under it and a legend only for named different series', () => {
    const scene = sceneOf(LEGEND);
    const names = scene.items.filter((i): i is SceneText => i.kind === 'text').map((t) => t.text);
    expect(names).toContain('An Example Chart');
    expect(names).toContain('Seconds');
    expect(names).toEqual(expect.arrayContaining(['avg', 'p50', 'p95']));
    expect(sceneOf(MONTHS).items.some((i) => i.kind === 'text' && i.role?.includes('legend'))).toBe(false);
  });
  it('writes every value and every point label', () => {
    const names = sceneOf(LABELS).items.filter((i): i is SceneText => i.kind === 'text').map((t) => t.text);
    for (const t of ['540', '65', '34', '7', '3.8', 'PaLM', 'LLaMA-65B', 'Llama 2 34B', 'Mistral 7B', 'Phi-3-mini']) expect(names).toContain(t);
  });
  it('leaves the values of several different series out unless the settings ask for them', () => {
    for (const src of [LEGEND, COLORS]) {
      expect(sceneOf(src).items.some((i) => i.kind === 'text' && i.role?.[0] === 'value')).toBe(false);
    }
  });
  it('still writes the point labels of a chart with several series', () => {
    expect(sceneOf(HORIZONTAL).items.some((i) => i.kind === 'text' && i.text === 'up')).toBe(true);
  });
  it('gives a bar and a line point of the same value in one category a value each when they are different series', () => {
    const asked = COLORS.replace('config:\n', 'config:\n  xyChart:\n    showDataLabel: true\n');
    const values = sceneOf(asked).items.filter((i): i is SceneText => i.kind === 'text' && i.role?.[0] === 'value').map((t) => t.text);
    // 25 is the blue bar of Category 3 and the red line of Category 3; 30 the black line, a bar and a bar
    expect(values.filter((v) => v === '25')).toHaveLength(3);
    expect(values).toHaveLength(16);
  });
  it('puts the label of a bar inside it in solid and above it when asked for outside', () => {
    const find = (src: string): SceneText | undefined => sceneOf(src).items.find((i): i is SceneText => i.kind === 'text' && i.text === '25' && i.role?.[0] === 'value');
    const dots = (src: string): number => Number(/^M[\d.]+ [\d.]+V[\d.]+Q[\d.]+ ([\d.]+)/.exec((sceneOf(src).items.find((i) => i.kind === 'path' && i.d.includes('H')) as { d: string }).d)?.[1]);
    void dots;
    const inside = find(INSIDE);
    const outside = find(OUTSIDE);
    expect(inside?.role).toContain('value--plain');
    expect(outside?.role).not.toContain('value--plain');
    expect((outside?.y ?? 0) < (inside?.y ?? 0)).toBe(true);
  });
  it('turns the axes for a horizontal chart', () => {
    const scene = sceneOf(HORIZONTAL);
    const bars = scene.items.filter((i) => i.kind === 'path' && i.role.some((r) => /^(mark|series-\d)$/.test(r)));
    expect(bars).toHaveLength(4);
    const ends = bars.map((b) => (b.kind === 'path' ? Number(/H([\d.]+)Q/.exec(b.d)?.[1]) : 0));
    const left = Number(bars[0]?.kind === 'path' ? /^M([\d.]+) /.exec(bars[0].d)?.[1] : 0);
    const scale = ((ends[1] ?? 0) - (ends[0] ?? 0) + 0) / 30;
    expect(scale).toBeGreaterThan(0);
    // 30, 60, 90 are equally far apart
    expect(Math.abs((ends[2] ?? 0) - (ends[1] ?? 0) - ((ends[1] ?? 0) - (ends[0] ?? 0)))).toBeLessThanOrEqual(1.5);
    expect(left).toBeLessThan(ends[0] ?? 0);
  });
  it('follows a width and height from the settings', () => {
    const scene = sceneOf(CONFIGURED);
    expect(scene.width).toBe(900);
    expect(scene.height).toBe(600);
  });
  for (const [name, src] of Object.entries({ ...EXAMPLES, horizontal: HORIZONTAL })) {
    it(`keeps the texts of ${name} apart and inside the drawing`, () => {
      const scene = sceneOf(src);
      const list = boxes(scene);
      for (const b of list) {
        expect(b.x0, b.t.text).toBeGreaterThanOrEqual(0);
        expect(b.x1, b.t.text).toBeLessThanOrEqual(scene.width);
        expect(b.y0, b.t.text).toBeGreaterThanOrEqual(0);
        expect(b.y1, b.t.text).toBeLessThanOrEqual(scene.height);
      }
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const a = list[i];
          const b = list[j];
          if (a === undefined || b === undefined) continue;
          const hit = a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
          expect(hit, `${a.t.text} / ${b.t.text}`).toBe(false);
        }
      }
    });
  }
});

describe('xychart text', () => {
  it('writes the values as a table with a column per series', () => {
    const out = renderText(LEGEND, 80);
    expect('lines' in out).toBe(true);
    if (!('lines' in out)) return;
    expect(out.lines[0]).toBe('An Example Chart');
    expect(out.lines[1]).toMatch(/avg\s+p50\s+p95$/);
    expect(out.lines[2]).toMatch(/^90d\s+48\.1\s+38\.2\s+112\.2$/);
    expect(out.lines).toHaveLength(8);
  });
  it('writes one value column right-aligned and shortens labels to the width', () => {
    const out = renderText(GENRES, 14);
    if (!('lines' in out)) throw new Error('expected lines');
    expect(out.lines[0]?.endsWith('…')).toBe(true);
    for (const l of out.lines) expect([...l].length).toBeLessThanOrEqual(14);
    expect(out.lines.some((l) => l.endsWith(' 12'))).toBe(true);
    expect(out.lines.some((l) => l.includes('…'))).toBe(true);
  });
  it('writes point labels next to their value', () => {
    const out = renderText(SOME_LABELS, 60);
    if (!('lines' in out)) throw new Error('expected lines');
    expect(out.lines.some((l) => l.includes('25 Launch'))).toBe(true);
  });
});

describe('xychart errors', () => {
  const failure = (src: string): UrsulaError => {
    try {
      render(src);
    } catch (err) {
      if (err instanceof UrsulaError) return err;
      throw err;
    }
    throw new Error('expected an error');
  };
  it('names the line of a value that is not a number', () => {
    const err = failure('xychart\n  title "x"\n  x-axis [a, b]\n  bar [1, two]');
    expect(err.line).toBe(4);
    expect(err.message).toContain('line 4');
  });
  it('rejects an unknown statement, a missing series and too many values', () => {
    expect(failure('xychart\n  colour red\n  bar [1]').line).toBe(2);
    expect(failure('xychart\n  title "t"').message).toContain('at least one');
    expect(failure('xychart\n  x-axis [a, b]\n  bar [1, 2, 3]').line).toBe(3);
  });
  it('rejects a list that is never closed', () => {
    expect(failure('xychart\n  bar [1, 2').line).toBe(2);
  });
});

describe('xychart layout API', () => {
  it('lays out with the ruler it is given', () => {
    const layout = layoutXychart(parseXychart(GENRES), pixelRuler());
    expect(layout.range).toEqual({ min: 0, max: 30 });
  });
});
