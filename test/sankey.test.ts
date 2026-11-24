// Examples adapted from the Mermaid documentation (MIT).
import { describe, expect, it } from 'vitest';
import { anchoredBox, boxesOverlap } from '../src/chart/label-place.ts';
import type { Box } from '../src/chart/label-place.ts';
import { render, renderText, UrsulaError } from '../src/index.ts';
import { pixelRuler } from '../src/metrics.ts';
import { selectFrontEnd } from '../src/registry.ts';
import { crossingWeight, layoutSankey } from '../src/sankey/layout.ts';
import { parseSankey } from '../src/sankey/parse.ts';
import type { SceneBox, SceneText } from '../src/types.ts';

const EXAMPLES: Record<string, string> = {
  'example': `---
config:
  sankey:
    showValues: false
---
sankey

Agricultural 'waste',Bio-conversion,124.729
Bio-conversion,Liquid,0.597
Bio-conversion,Losses,26.862
Bio-conversion,Solid,280.322
Bio-conversion,Gas,81.144
Biofuel imports,Liquid,35
Biomass imports,Solid,35
Coal imports,Coal,11.606
Coal reserves,Coal,63.965
Coal,Solid,75.571
District heating,Industry,10.639
District heating,Heating and cooling - commercial,22.505
District heating,Heating and cooling - homes,46.184
Electricity grid,Over generation / exports,104.453
Electricity grid,Heating and cooling - homes,113.726
Electricity grid,H2 conversion,27.14
Electricity grid,Industry,342.165
Electricity grid,Road transport,37.797
Electricity grid,Agriculture,4.412
Electricity grid,Heating and cooling - commercial,40.858
Electricity grid,Losses,56.691
Electricity grid,Rail transport,7.863
Electricity grid,Lighting & appliances - commercial,90.008
Electricity grid,Lighting & appliances - homes,93.494
Gas imports,Ngas,40.719
Gas reserves,Ngas,82.233
Gas,Heating and cooling - commercial,0.129
Gas,Losses,1.401
Gas,Thermal generation,151.891
Gas,Agriculture,2.096
Gas,Industry,48.58
Geothermal,Electricity grid,7.013
H2 conversion,H2,20.897
H2 conversion,Losses,6.242
H2,Road transport,20.897
Hydro,Electricity grid,6.995
Liquid,Industry,121.066
Liquid,International shipping,128.69
Liquid,Road transport,135.835
Liquid,Domestic aviation,14.458
Liquid,International aviation,206.267
Liquid,Agriculture,3.64
Liquid,National navigation,33.218
Liquid,Rail transport,4.413
Marine algae,Bio-conversion,4.375
Ngas,Gas,122.952
Nuclear,Thermal generation,839.978
Oil imports,Oil,504.287
Oil reserves,Oil,107.703
Oil,Liquid,611.99
Other waste,Solid,56.587
Other waste,Bio-conversion,77.81
Pumped heat,Heating and cooling - homes,193.026
Pumped heat,Heating and cooling - commercial,70.672
Solar PV,Electricity grid,59.901
Solar Thermal,Heating and cooling - homes,19.263
Solar,Solar Thermal,19.263
Solar,Solar PV,59.901
Solid,Agriculture,0.882
Solid,Thermal generation,400.12
Solid,Industry,46.477
Thermal generation,Electricity grid,525.531
Thermal generation,Losses,787.129
Thermal generation,District heating,79.329
Tidal,Electricity grid,9.452
UK land based bioenergy,Bio-conversion,182.01
Wave,Electricity grid,19.013
Wind,Electricity grid,289.366`,
  'basic': `sankey

%% source,target,value
Electricity grid,Over generation / exports,104.453
Electricity grid,Heating and cooling - homes,113.726
Electricity grid,H2 conversion,27.14`,
  'empty-lines': `sankey

Bio-conversion,Losses,26.862

Bio-conversion,Solid,280.322

Bio-conversion,Gas,81.144`,
  'commas': `sankey

Pumped heat,"Heating and cooling, homes",193.026
Pumped heat,"Heating and cooling, commercial",70.672`,
  'double-quotes': `sankey

Pumped heat,"Heating and cooling, ""homes""",193.026
Pumped heat,"Heating and cooling, ""commercial""",70.672`,
  'label-style': `---
config:
  sankey:
    showValues: false
    labelStyle: outlined
---
sankey

Electricity grid,Heating and cooling - homes,113.726
Electricity grid,Industry,342.165
Electricity grid,Losses,56.691`,
  'node-width-and-padding': `---
config:
  sankey:
    showValues: false
    nodeWidth: 15
    nodePadding: 20
---
sankey

Electricity grid,Heating and cooling - homes,113.726
Electricity grid,Industry,342.165
Electricity grid,Losses,56.691`,
  'custom-node-colors': `---
config:
  sankey:
    showValues: false
    nodeColors:
      Electricity grid: "#4e79a7"
      Industry: "#e15759"
      Losses: "#bab0ab"
---
sankey

Electricity grid,Heating and cooling - homes,113.726
Electricity grid,Industry,342.165
Electricity grid,Losses,56.691`,
};

const IDEAL = `sankey-beta

Salary,Budget,3000
Freelance work,Budget,1200
Budget,Rent,1300
Budget,Groceries,600
Budget,Transport,250
Budget,Fun,350
Budget,Savings,1700`;

/** Examples start with a front matter that the front-end receives already blanked; the tests parse past it the same way. */
const body = (src: string): string => src.replace(/^---\n[\s\S]*?\n---\n/u, (m) => m.replace(/[^\n]/gu, ''));
const layoutOf = (src: string) => layoutSankey(parseSankey(body(src)), pixelRuler());
const ruler = pixelRuler();

function textBoxes(items: readonly (SceneText | SceneBox | { kind: string })[]): Array<{ text: string; box: Box }> {
  return items.flatMap((it) => {
    if (it.kind !== 'text') return [];
    const t = it as SceneText;
    const w =
      t.spans === undefined
        ? ruler.textWidth(t.text, 'title')
        : t.spans.reduce((a, sp) => a + (sp.dx ?? 0) + ruler.textWidth(sp.text, sp.role?.includes('value') === true ? 'line' : 'title'), 0);
    return [{ text: t.text, box: anchoredBox(t.x, t.y, w, t.anchor ?? 'start', 16) }];
  });
}

describe('sankey: official examples', () => {
  for (const [name, src] of Object.entries(EXAMPLES)) {
    it(`draws ${name} in three themes`, () => {
      expect(selectFrontEnd(src).name).toBe('sankey');
      for (const theme of ['solid', 'outline', 'card'] as const) {
        const svg = render(src, { theme });
        expect(svg).toContain(`data-theme="${theme}"`);
        expect(svg).toMatch(/ class="ursula-series-\d/);
      }
    });
  }

  it('gives the same shapes in all three themes', () => {
    const shapes = (svg: string): string[] => svg.match(/<(?:path|rect|text)\b[^>]*?(?:d|x|y)="[^"]*"/gu)?.map((m) => m.replace(/class="[^"]*"\s*/u, '')) ?? [];
    const solid = shapes(render(EXAMPLES['basic'] ?? '', { theme: 'solid' }));
    expect(shapes(render(EXAMPLES['basic'] ?? '', { theme: 'outline' }))).toEqual(solid);
    expect(shapes(render(EXAMPLES['basic'] ?? '', { theme: 'card' }))).toEqual(solid);
  });
});

describe('sankey: reading', () => {
  it('reads the rows in order with the names and values as written', () => {
    const m = parseSankey(body(EXAMPLES['basic'] ?? ''));
    expect(m.nodes.map((n) => n.name)).toEqual(['Electricity grid', 'Over generation / exports', 'Heating and cooling - homes', 'H2 conversion']);
    expect(m.links.map((l) => l.value)).toEqual([104.453, 113.726, 27.14]);
    expect(m.links.every((l) => l.source === 0)).toBe(true);
  });

  it('reads a quoted name with a comma and a doubled quote', () => {
    expect(parseSankey(body(EXAMPLES['commas'] ?? '')).nodes.map((n) => n.name)).toEqual(['Pumped heat', 'Heating and cooling, homes', 'Heating and cooling, commercial']);
    expect(parseSankey(body(EXAMPLES['double-quotes'] ?? '')).nodes.map((n) => n.name)).toEqual(['Pumped heat', 'Heating and cooling, "homes"', 'Heating and cooling, "commercial"']);
  });

  it('skips blank lines and keeps the line number of every row', () => {
    const m = parseSankey(EXAMPLES['empty-lines'] ?? '');
    expect(m.links.map((l) => l.line)).toEqual([3, 5, 7]);
  });

  it('reads the whole large example', () => {
    const m = parseSankey(body(EXAMPLES['example'] ?? ''));
    expect(m.links).toHaveLength(68);
    expect(m.nodes[0]?.name).toBe("Agricultural 'waste'");
    expect(m.showValues).toBe(true);
    expect(render(EXAMPLES['example'] ?? '')).not.toMatch(/class="ursula-value/u);
    expect(render(EXAMPLES['basic'] ?? '')).toMatch(/<tspan class="ursula-value/u);
  });

  it('reads the settings of the front matter', () => {
    const m = parseSankey('sankey\nA,B,1', undefined, { sankey: { showValues: false, nodeWidth: 15, nodePadding: 20, labelStyle: 'outlined' } });
    expect([m.showValues, m.nodeWidth, m.nodePadding, m.outlined]).toEqual([false, 15, 20, true]);
  });

  it('lets an init directive win over the front matter', () => {
    const m = parseSankey('%%{init: {"sankey": {"showValues": false}}}%%\nsankey\nA,B,1', undefined, { sankey: { showValues: true } });
    expect(m.showValues).toBe(false);
  });

  it('accepts the beta header and the accessibility lines', () => {
    const m = parseSankey('sankey-beta\naccTitle: Money\naccDescr: where it goes\nA,B,1');
    expect(m.accTitle).toBe('Money');
    expect(m.links).toHaveLength(1);
  });
});

describe('sankey: errors', () => {
  const lineOf = (src: string): number | undefined => {
    try {
      parseSankey(src);
    } catch (e) {
      expect(e).toBeInstanceOf(UrsulaError);
      return (e as UrsulaError).line;
    }
    return undefined;
  };

  it('names the line of a row with two fields', () => {
    expect(lineOf('sankey\nA,B,1\nC,D')).toBe(3);
  });

  it('names the line of a value that is not a number', () => {
    expect(lineOf('sankey\nA,B,many')).toBe(2);
  });

  it('names the line of a quote that is never closed', () => {
    expect(lineOf('sankey\nA,"B,1')).toBe(2);
  });

  it('names the line of a row that closes a circle', () => {
    expect(lineOf('sankey\nA,B,1\nB,C,1\nC,A,1')).toBe(4);
  });

  it('rejects a wrong header with the line', () => {
    expect(lineOf('graph\nA,B,1')).toBe(1);
  });

  it('shows the error through render', () => {
    expect(() => render('sankey\nA,B,x')).toThrow(UrsulaError);
  });
});

describe('sankey: layout', () => {
  it('puts a source-only node in the first column and the others one past their longest incoming chain', () => {
    const l = layoutOf('sankey\nA,B,2\nB,C,2\nA,C,1\nD,C,1');
    const col = Object.fromEntries(l.nodes.map((n) => [n.name, n.column]));
    expect(col).toEqual({ A: 0, B: 1, C: 2, D: 0 });
  });

  it('reads the ideal as three columns', () => {
    const l = layoutOf(IDEAL);
    expect(l.columns).toBe(3);
    expect(l.nodes.map((n) => n.column)).toEqual([0, 1, 0, 2, 2, 2, 2, 2]);
  });

  for (const [name, src] of Object.entries({ ideal: IDEAL, ...EXAMPLES })) {
    it(`keeps band thickness and node height proportional to the value in ${name}`, () => {
      const m = parseSankey(body(src));
      const l = layoutSankey(m, ruler);
      m.links.forEach((link, k) => {
        const band = l.bands[k];
        const nums = /^M[\d.]+ ([\d.]+) C[\d. ]+ ([\d.]+) ([\d.]+) V([\d.]+)/u.exec(band?.d ?? '');
        expect(nums).not.toBeNull();
        const thickness = Number(nums?.[4]) - Number(nums?.[3]);
        expect(Math.abs(thickness - link.value * l.scale)).toBeLessThanOrEqual(1);
      });
      m.nodes.forEach((_, i) => {
        const inSum = m.links.filter((x) => x.target === i).reduce((a, x) => a + x.value, 0);
        const outSum = m.links.filter((x) => x.source === i).reduce((a, x) => a + x.value, 0);
        expect(Math.abs((l.nodes[i]?.h ?? 0) - Math.max(inSum, outSum) * l.scale)).toBeLessThanOrEqual(1);
      });
    });

    it(`leaves no text over text or a node and none outside the picture in ${name}`, () => {
      const l = layoutSankey(parseSankey(body(src)), ruler);
      const texts = textBoxes(l.scene.items);
      for (const t of texts) {
        expect(t.box.x0).toBeGreaterThanOrEqual(0);
        expect(t.box.x1).toBeLessThanOrEqual(l.scene.width);
        expect(t.box.y0).toBeGreaterThanOrEqual(0);
        expect(t.box.y1).toBeLessThanOrEqual(l.scene.height);
      }
      for (let i = 0; i < texts.length; i++) {
        for (let k = i + 1; k < texts.length; k++) {
          expect(boxesOverlap(texts[i]?.box as Box, texts[k]?.box as Box, -0.01), `${texts[i]?.text} / ${texts[k]?.text}`).toBe(false);
        }
        for (const n of l.nodes) {
          expect(boxesOverlap(texts[i]?.box as Box, { x0: n.x, x1: n.x + n.w, y0: n.y, y1: n.y + n.h }, -0.01), `${texts[i]?.text} / node ${n.name}`).toBe(false);
        }
      }
    });
  }

  it('draws a node in the palette colour nearest to the one the settings ask for', () => {
    const svg = render(EXAMPLES['custom-node-colors'] ?? '');
    const seriesOf = (name: string): string | undefined => new RegExp(`class="[^"]*ursula-(series-\\d)[^"]*"[^>]*data-name="${name}"`, 'u').exec(svg)?.[1];
    expect(seriesOf('Electricity grid')).toBe('series-4');
    expect(seriesOf('Industry')).toBe('series-6');
    expect(seriesOf('Losses')).toBe('series-8');
    expect(seriesOf('Heating and cooling - homes')).toBe('series-2');
  });

  it('orders the columns of the large example so that the bands cross little', () => {
    const l = layoutOf(EXAMPLES['example'] ?? '');
    const at = new Map(l.nodes.map((n) => [n.name, n]));
    const lines = l.bands.map((b) => {
      const from = at.get(b.source) as { x: number; w: number };
      const to = at.get(b.target) as { x: number };
      return { x0: from.x + from.w, x1: to.x, y0: b.fromY + b.thickness / 2, y1: b.toY + b.thickness / 2, weight: b.thickness };
    });
    expect(crossingWeight(lines)).toBeLessThan(270);
  });

  it('stacks the bands leaving a node in the vertical order of their targets', () => {
    const l = layoutOf(IDEAL);
    const out = l.bands.filter((b) => b.source === 'Budget');
    const byTargetY = [...out].sort((a, b) => (l.nodes.find((n) => n.name === a.target)?.y ?? 0) - (l.nodes.find((n) => n.name === b.target)?.y ?? 0));
    expect(byTargetY.map((b) => b.fromY)).toEqual([...byTargetY.map((b) => b.fromY)].sort((a, b) => a - b));
    expect(out.map((b) => b.target)).toEqual(['Rent', 'Groceries', 'Transport', 'Fun', 'Savings']);
  });

  it('keeps the order of the ideal: input order wherever the neighbours tie', () => {
    const l = layoutOf(IDEAL);
    const y = (name: string): number => l.nodes.find((n) => n.name === name)?.y ?? 0;
    expect(y('Salary')).toBeLessThan(y('Freelance work'));
    expect(y('Rent')).toBeLessThan(y('Groceries'));
    expect(y('Groceries')).toBeLessThan(y('Savings'));
  });

  it('puts the node that sits higher in the next column higher too', () => {
    const l = layoutOf('sankey\nA,X,1\nB,Y,1\nA,Z,1\nC,Y,1\nX,Q,1\nY,Q,1');
    const y = (name: string): number => l.nodes.find((n) => n.name === name)?.y ?? 0;
    expect(y('A')).toBeLessThan(y('B'));
  });

  it('keeps the gap between nodes of a column and colours bands by the end with fewer links', () => {
    const l = layoutOf(IDEAL);
    const col2 = l.nodes.filter((n) => n.column === 2).sort((a, b) => a.y - b.y);
    for (let i = 1; i < col2.length; i++) expect((col2[i]?.y ?? 0) - ((col2[i - 1]?.y ?? 0) + (col2[i - 1]?.h ?? 0))).toBeCloseTo(24, 5);
    expect(l.bands[0]?.series).toBe(l.nodes[0]?.series);
    expect(l.bands[2]?.series).toBe(l.nodes.find((n) => n.name === 'Rent')?.series);
  });

  it('writes the first column to the left, the last to the right and the others above', () => {
    const l = layoutOf(IDEAL);
    const side = Object.fromEntries(l.nodes.map((n) => [n.name, n.label.side]));
    expect(side).toMatchObject({ Salary: 'left', Budget: 'above', Rent: 'right' });
  });

  it('leaves out the values when the settings say so', () => {
    const m = parseSankey('sankey\nA,B,12', undefined, { sankey: { showValues: false } });
    const texts = layoutSankey(m, ruler).scene.items.filter((i) => i.kind === 'text');
    expect(texts.map((t) => (t as SceneText).text)).toEqual(['A', 'B']);
  });

  it('takes the node width and padding from the settings', () => {
    const m = parseSankey('sankey\nA,B,1\nA,C,1', undefined, { sankey: { nodeWidth: 20, nodePadding: 24 } });
    const l = layoutSankey(m, ruler);
    expect(l.nodes[0]?.w).toBe(20);
    const [b, c] = [l.nodes[1], l.nodes[2]];
    expect(Math.abs((c?.y ?? 0) - ((b?.y ?? 0) + (b?.h ?? 0)))).toBeCloseTo(24, 5);
  });
});

describe('sankey: text', () => {
  it('lists source, target and value in aligned columns', () => {
    const r = renderText('sankey\nTitleless,B,12.5\nLonger name,C,3', 80);
    expect(r).toEqual({ lines: ['Titleless    B  12.5', 'Longer name  C     3'] });
  });

  it('cuts the names to the width', () => {
    const r = renderText('sankey\nA very long source name,An even longer target name,1', 24);
    if ('error' in r) throw new Error(r.error);
    expect(r.lines.every((l) => l.length <= 24)).toBe(true);
  });
});

describe('sankey: node label', () => {
  it('writes name and value as two spans of one text, 6px apart, and sizes the label box by their widths', () => {
    const lay = layoutOf(EXAMPLES['basic'] ?? '');
    const texts = lay.scene.items.filter((i): i is SceneText => i.kind === 'text' && i.data?.['node'] !== undefined);
    expect(texts).toHaveLength(lay.nodes.length);
    for (const n of lay.nodes) {
      const t = texts.find((x) => x.data?.['node'] === n.name);
      expect(t?.text).toBe(`${n.name} ${n.valueText}`);
      expect(t?.spans?.[0]?.text).toBe(n.name);
      expect(t?.spans?.[1]?.text).toBe(n.valueText);
      expect(t?.spans?.[1]?.dx).toBe(6);
      expect(t?.spans?.[1]?.role).toContain('value');
      const w = ruler.textWidth(n.name, 'title') + 6 + ruler.textWidth(n.valueText, 'line');
      expect(n.label.box.x1 - n.label.box.x0).toBeCloseTo(w, 6);
    }
    expect(render(EXAMPLES['basic'] ?? '')).toMatch(/<text class="ursula-name ursula-(start|end|middle)"[^>]*><tspan>[^<]+<\/tspan><tspan class="ursula-value ursula-value--plain" dx="6">[0-9]/u);
  });
});
