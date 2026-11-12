// Examples adapted from the Mermaid documentation (MIT).
import { describe, expect, it } from 'vitest';
import { render, renderText, UrsulaError } from '../src/index.ts';
import { layoutQuadrant } from '../src/quadrant/layout.ts';
import { parseQuadrant } from '../src/quadrant/parse.ts';
import { pixelRuler } from '../src/metrics.ts';
import type { Scene } from '../src/types.ts';

const BASIC = `quadrantChart
    title Reach and engagement of campaigns
    x-axis Low Reach --> High Reach
    y-axis Low Engagement --> High Engagement
    quadrant-1 We should expand
    quadrant-2 Need to promote
    quadrant-3 Re-evaluate
    quadrant-4 May be improved
    Campaign A: [0.3, 0.6]
    Campaign B: [0.45, 0.23]
    Campaign C: [0.57, 0.69]
    Campaign D: [0.78, 0.34]
    Campaign E: [0.40, 0.34]
    Campaign F: [0.35, 0.78]
`;

const CONFIG = `---
config:
  quadrantChart:
    chartWidth: 400
    chartHeight: 400
  themeVariables:
    quadrant1TextFill: "ff0000"
---
quadrantChart
  x-axis Urgent --> Not Urgent
  y-axis Not Important --> "Important ❤"
  quadrant-1 Plan
  quadrant-2 Do
  quadrant-3 Delegate
  quadrant-4 Delete
`;

const STYLING = `quadrantChart
  title Reach and engagement of campaigns
  x-axis Low Reach --> High Reach
  y-axis Low Engagement --> High Engagement
  quadrant-1 We should expand
  quadrant-2 Need to promote
  quadrant-3 Re-evaluate
  quadrant-4 May be improved
  Campaign A: [0.9, 0.0] radius: 12
  Campaign B:::class1: [0.8, 0.1] color: #ff3300, radius: 10
  Campaign C: [0.7, 0.2] radius: 25, color: #00ff33, stroke-color: #10f0f0
  Campaign D: [0.6, 0.3] radius: 15, stroke-color: #00ff0f, stroke-width: 5px ,color: #ff33f0
  Campaign E:::class2: [0.5, 0.4]
  Campaign F:::class3: [0.4, 0.5] color: #0000ff
  classDef class1 color: #109060
  classDef class2 color: #908342, radius : 10, stroke-color: #310085, stroke-width: 10px
  classDef class3 color: #f00fff, radius : 10
`;

const THEMES = ['solid', 'outline', 'card'] as const;
const ruler = pixelRuler();

describe('quadrant chart rendering', () => {
  for (const [name, src] of [['basic', BASIC], ['config', CONFIG], ['styling', STYLING]] as const) {
    for (const theme of THEMES) {
      it(`draws ${name} in ${theme}`, () => {
        const svg = render(src, { theme });
        expect(svg).toContain(`data-theme="${theme}"`);
      });
    }
  }
});

describe('quadrant chart reading', () => {
  it('reads title, axes, quadrant names and points', () => {
    const c = parseQuadrant(BASIC);
    expect(c.title).toBe('Reach and engagement of campaigns');
    expect(c.xAxis).toEqual({ low: 'Low Reach', high: 'High Reach' });
    expect(c.yAxis).toEqual({ low: 'Low Engagement', high: 'High Engagement' });
    expect(c.quadrants).toEqual(['We should expand', 'Need to promote', 'Re-evaluate', 'May be improved']);
    expect(c.points.map((p) => [p.name, p.x, p.y])).toEqual([
      ['Campaign A', 0.3, 0.6],
      ['Campaign B', 0.45, 0.23],
      ['Campaign C', 0.57, 0.69],
      ['Campaign D', 0.78, 0.34],
      ['Campaign E', 0.4, 0.34],
      ['Campaign F', 0.35, 0.78],
    ]);
  });

  it('reads the chart size and unquotes axis names', () => {
    const c = parseQuadrant(CONFIG.replace(/^---[\s\S]*?---\n/, ''), { config: { quadrantChart: { chartWidth: 400, chartHeight: 400 }, themeVariables: { quadrant1TextFill: 'ff0000' } } });
    expect(c.chartWidth).toBe(400);
    expect(c.chartHeight).toBe(400);
    expect(c.yAxis?.high).toBe('Important ❤');
    expect(c.points).toEqual([]);
    expect(c.ignored).toContain('config themeVariables');
  });

  it('takes the radius from the point, then from its class, and notes the colours it leaves out', () => {
    const c = parseQuadrant(STYLING);
    expect(c.points.map((p) => p.radius)).toEqual([12, 10, 25, 15, 10, 10]);
    expect(c.points[1]?.name).toBe('Campaign B');
    expect(c.ignored).toEqual(expect.arrayContaining(['point stroke-color', 'point stroke-width', 'classDef stroke-color', 'classDef stroke-width']));
    expect(c.ignored).not.toContain('point color');
    expect(c.points.map((p) => p.color)).toEqual([undefined, '#ff3300', '#00ff33', '#ff33f0', '#908342', '#0000ff']);
  });

  it('fills a styled point with the palette colour nearest to its own and never with the colour of a plain point', () => {
    const roles = layoutQuadrant(parseQuadrant(STYLING), ruler)
      .scene.items.filter((i) => i.kind === 'circle')
      .map((i) => (i.kind === 'circle' ? i.role.join(' ') : ''));
    expect(roles).toEqual(['mark-dot', 'series-6--dot', 'series-5--dot', 'series-6--dot', 'series-3--dot', 'series-4--dot']);
  });
});

describe('quadrant chart layout', () => {
  for (const theme of THEMES) {
    it(`puts every point at its value in ${theme}`, () => {
      const l = layoutQuadrant(parseQuadrant(BASIC), ruler, theme);
      for (const p of l.points) {
        expect(Math.abs(p.cx - (l.plot.x + p.x * l.plot.w))).toBeLessThanOrEqual(1);
        expect(Math.abs(p.cy - (l.plot.y + l.plot.h - p.y * l.plot.h))).toBeLessThanOrEqual(1);
      }
    });
  }

  it('uses the chart size for the plot', () => {
    expect(render(CONFIG)).toContain('viewBox="0 0 ');
    const m = /viewBox="0 0 (\d+) (\d+)"/.exec(render(CONFIG));
    const big = /viewBox="0 0 (\d+) (\d+)"/.exec(render(CONFIG.replace(/chartWidth: 400/, 'chartWidth: 448').replace(/chartHeight: 400/, 'chartHeight: 448')));
    expect(Number(big?.[1]) - Number(m?.[1])).toBe(48);
    expect(Number(big?.[2]) - Number(m?.[2])).toBe(48);
  });

  it('follows the radius of the style and the default radius of the theme', () => {
    const l = layoutQuadrant(parseQuadrant(STYLING), ruler, 'card');
    expect(l.points.map((p) => p.r)).toEqual([12, 10, 25, 15, 10, 10]);
    const plain = layoutQuadrant(parseQuadrant(BASIC), ruler, 'outline');
    expect(new Set(plain.points.map((p) => p.r))).toEqual(new Set([4]));
  });

  for (const [name, src] of [['basic', BASIC], ['styling', STYLING]] as const) {
    it(`keeps point names clear of each other and inside the picture (${name})`, () => {
      const l = layoutQuadrant(parseQuadrant(src), ruler);
      const boxes = l.points.map((p) => p.label);
      boxes.forEach((a, i) => {
        expect(a.x).toBeGreaterThanOrEqual(0);
        expect(a.x + a.w).toBeLessThanOrEqual(l.scene.width);
        expect(a.y + a.h).toBeLessThanOrEqual(l.scene.height);
        boxes.slice(i + 1).forEach((b) => {
          const apart = a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
          expect(apart).toBe(true);
        });
      });
    });
  }

  it('keeps all texts of the scene inside it', () => {
    const l = layoutQuadrant(parseQuadrant(BASIC), ruler);
    const scene: Scene = l.scene;
    for (const it of scene.items) {
      if (it.kind !== 'text') continue;
      const w = ruler.textWidth(it.text, 'line');
      const left = it.anchor === 'end' ? it.x - w : it.anchor === 'middle' ? it.x - w / 2 : it.x;
      expect(left).toBeGreaterThanOrEqual(0);
      expect(left + w).toBeLessThanOrEqual(scene.width);
    }
  });

  it('moves a name that would cross a zone boundary to the left', () => {
    const l = layoutQuadrant(parseQuadrant('quadrantChart\n  quadrant-1 a\n  Long point name here: [0.45, 0.8]\n'), ruler);
    expect(l.points[0]?.label.side).not.toBe('right');
  });
});

describe('quadrant chart accessibility and crowded names', () => {
  it('writes accTitle and both accDescr forms into title and desc', () => {
    const one = render('quadrantChart\n  accTitle: My title\n  accDescr: One <line>\n  A: [0.5, 0.5]\n');
    expect(one).toContain('<title>My title</title><desc>One &lt;line&gt;</desc>');
    const many = render('quadrantChart\n  accDescr {\n    first\n    second\n  }\n  A: [0.5, 0.5]\n');
    expect(many).toContain('<desc>first second</desc>');
  });

  it('keeps a name that has no free side inside the plot width', () => {
    const l = layoutQuadrant(parseQuadrant('quadrantChart\n  Campaign A: [1, 0] radius: 12\n  Blocker: [0.9, 0.08] radius: 40\n'), ruler);
    const a = l.points[0];
    expect(a?.crowded).toBe(true);
    expect((a?.label.x ?? 0) + (a?.label.w ?? 0)).toBeLessThanOrEqual(l.plot.x + l.plot.w);
  });
});

describe('quadrant chart text', () => {
  it('lists title and one row per point with its quadrant', () => {
    const r = renderText(BASIC, 80);
    if ('error' in r) throw new Error(r.error);
    expect(r.lines[0]).toBe('Reach and engagement of campaigns');
    expect(r.lines[1]).toBe('Campaign A   0.3   0.6  Need to promote');
    expect(r.lines).toHaveLength(7);
  });

  it('shortens names to fit the width', () => {
    const r = renderText(BASIC, 28);
    if ('error' in r) throw new Error(r.error);
    expect(r.lines.every((l) => l.length <= 28)).toBe(true);
  });
});

describe('quadrant chart errors', () => {
  it('reports an unknown line with its number', () => {
    try {
      render('quadrantChart\n  title T\n  what is this\n');
      throw new Error('no error');
    } catch (e) {
      expect(e).toBeInstanceOf(UrsulaError);
      expect((e as UrsulaError).line).toBe(3);
    }
  });

  it('rejects a coordinate outside 0 to 1', () => {
    expect(() => parseQuadrant('quadrantChart\n  A: [1.5, 0.2]\n')).toThrow(/between 0 and 1/);
  });
});
