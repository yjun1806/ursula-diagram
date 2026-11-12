import { describe, expect, it } from 'vitest';
import { layout, parse, pixelRuler, render, THEMES } from '../src/index.ts';
import type { Theme } from '../src/index.ts';
import { roundedPolygonPath } from '../src/render/shapes.ts';
import { ARROW_TRIM } from './helpers.ts';
import type { Point } from '../src/index.ts';

const TRIM: Record<Theme, number> = { solid: ARROW_TRIM, outline: 7, card: 0.875 };

/** The tip of the arrowhead of an edge: the end of its path plus what the line stops short. */
function tipOf(d: string, theme: Theme): Point {
  const ends = (d.match(/[MLA][^MLA]*/g) ?? []).map((c) => {
    const n = c.slice(1).match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
    return { x: n[n.length - 2] ?? 0, y: n[n.length - 1] ?? 0 };
  });
  const last = ends[ends.length - 1] as Point;
  const prev = ends[ends.length - 2] as Point;
  const len = Math.hypot(last.x - prev.x, last.y - prev.y) || 1;
  return { x: last.x + ((last.x - prev.x) / len) * TRIM[theme], y: last.y + ((last.y - prev.y) / len) * TRIM[theme] };
}

const FLOW = 'flowchart TD\n a[Start] --> b{Check}\n b -->|yes| c[Done]\n b -->|no| d[Retry]';

const LANES = 'swimlane-beta LR\nsubgraph one[One]\n a[Alpha] --> b[Beta]\nend\nsubgraph two[Two]\n c[Gamma]\nend\nb --> c';

const RX: Record<Theme, number> = { solid: 18, outline: 12, card: 16 };
const LINE: Record<Theme, number> = { solid: 2.5, outline: 1.5, card: 1.75 };

const tag = (svg: string, node: string): string => new RegExp(`<g class="[^"]*" data-node="${node}"[^>]*>`).exec(svg)?.[0] ?? '';

const rectOf = (svg: string, node: string): string => new RegExp(`data-node="${node}"[^>]*><rect class="ursula-node-box"[^>]*>`).exec(svg)?.[0] ?? '';

describe('theme option', () => {
  it('draws the solid theme unless told otherwise', () => {
    expect(render(FLOW)).toBe(render(FLOW, { theme: 'solid' }));
    expect(render(FLOW)).toContain('data-theme="solid"');
  });

  it('names the themes', () => {
    expect([...THEMES]).toEqual(['solid', 'outline', 'card']);
  });

  it('refuses a theme it does not know', () => {
    expect(() => render(FLOW, { theme: 'neon' as Theme })).toThrow(/Unknown theme/);
  });

  it('leaves the layout alone', () => {
    const l = JSON.stringify(layout(parse(FLOW), pixelRuler()));
    for (const theme of THEMES) {
      render(FLOW, { theme });
      expect(JSON.stringify(layout(parse(FLOW), pixelRuler()))).toBe(l);
    }
  });
});

describe.each(THEMES)('%s theme', (theme) => {
  const svg = render(FLOW, { theme });

  it('writes its name on the root element', () => {
    expect(svg).toMatch(new RegExp(`^<svg [^>]*class="ursula" data-theme="${theme}"`));
  });

  it('rounds the corners of a box and of a lane', () => {
    expect(rectOf(svg, 'a')).toContain(`rx="${RX[theme]}"`);
    expect(render(LANES, { theme })).toMatch(new RegExp(`<rect class="ursula-lane[^"]*"[^>]*rx="${RX[theme] + 4}"`));
  });

  it('draws a rounded box with the radius of a box plus 8, at most half its height', () => {
    const h = layout(parse('flowchart LR\na(x)'), pixelRuler()).nodes[0]?.h ?? 0;
    expect(render('flowchart LR\na(x)', { theme })).toContain(`rx="${Math.min(RX[theme] + 8, h / 2)}"`);
  });

  it('sets the width of an edge', () => {
    expect(svg).toContain(`.ursula-edge{fill:none;stroke:var(--ursula-line,`);
    expect(svg).toMatch(new RegExp(`\\.ursula-edge\\{[^}]*stroke-width:${LINE[theme]};stroke-linecap:round;stroke-linejoin:round\\}`));
  });

  it('draws the arrowhead as a marker with a class for each colour', () => {
    expect(svg).toMatch(/<marker id="ursula-arrow" [^>]*>(<path class="ursula-arrow"[^>]*>)<\/marker>/);
    expect(svg).toMatch(/<marker id="ursula-arrow-accent" [^>]*><path class="ursula-arrow ursula-arrow--accent"/);
    const rule = /\.ursula-arrow\{([^}]*)\}/.exec(svg)?.[1] ?? '';
    if (theme === 'card') {
      expect(rule).toMatch(/^fill:none;stroke:var\(--ursula-line,/);
      expect(svg).not.toMatch(/<marker[^>]*><path[^>]*z"\/>/);
    } else {
      expect(rule).toMatch(/^fill:var\(--ursula-line,/);
      expect(svg).toMatch(/<marker[^>]*><path[^>]*z"\/>/);
    }
  });

  it('has a shadow filter only in the card theme', () => {
    expect(svg.includes('<filter')).toBe(theme === 'card');
    expect(svg.includes('filter="url(#ursula-shadow)"')).toBe(theme === 'card');
  });

  it('gives both a light and a dark value for a colour', () => {
    expect(svg).toContain('@media (prefers-color-scheme: dark)');
    const light = svg.slice(svg.indexOf('<style>'), svg.indexOf('@media'));
    const dark = svg.slice(svg.indexOf('@media'), svg.indexOf('</style>'));
    expect(light).toMatch(/var\(--ursula-fg,#1c1a24\)/);
    expect(dark).toMatch(/var\(--ursula-fg,#ecebf2\)/);
  });

  it('stops the line of an edge short of the tip so that it stays inside the arrowhead', () => {
    const l = layout(parse('flowchart LR\na --> b'), pixelRuler());
    const b = l.nodes.find((n) => n.id === 'b');
    const d = /data-from="a" data-to="b" d="([^"]*)"/.exec(render('flowchart LR\na --> b', { theme }))?.[1] ?? '';
    const end = Number((d.match(/-?\d+(?:\.\d+)?/g) ?? []).slice(-2)[0]);
    const trim = theme === 'card' ? LINE.card / 2 : theme === 'solid' ? 9 : 7;
    expect(end).toBeCloseTo((b?.x ?? 0) - trim, 1);
  });
});

describe('dotted lines', () => {
  it('use the dash of the theme', () => {
    expect(render('flowchart LR\na -.-> b', { theme: 'solid' })).toContain('.ursula-edge--dotted{stroke-dasharray:2 7}');
    expect(render('flowchart LR\na -.-> b', { theme: 'outline' })).toContain('.ursula-edge--dotted{stroke-dasharray:5 4}');
    expect(render('flowchart LR\na -.-> b', { theme: 'card' })).toContain('.ursula-edge--dotted{stroke-dasharray:4 5}');
  });
});

describe('roles', () => {
  const svg = render(FLOW);

  it('mark a node nothing leads to as the start and a diamond as a decision', () => {
    expect(tag(svg, 'a')).toContain('data-role="start"');
    expect(tag(svg, 'b')).toContain('data-role="decision"');
    expect(tag(svg, 'c')).not.toContain('data-role');
    expect(tag(svg, 'd')).not.toContain('data-role');
  });

  it('take the first node as the start when every node has an edge leading to it', () => {
    const loop = render('flowchart TD\n x[One] --> y[Two]\n y --> z[Three]\n z --> x');
    expect(tag(loop, 'x')).toContain('data-role="start"');
    expect(tag(loop, 'y')).not.toContain('data-role');
    expect(tag(loop, 'z')).not.toContain('data-role');
  });

  it('never paint a diamond as the start', () => {
    const first = render('flowchart TD\n x{One} --> y[Two]\n y --> x');
    expect(tag(first, 'x')).toContain('data-role="decision"');
    expect(first).not.toMatch(/<g [^>]*data-role="start"/);
  });

  it('draw the edges and labels that leave a decision in the accent colour', () => {
    expect(svg).toMatch(/class="ursula-edge ursula-edge--normal ursula-edge--branch"[^>]*data-from="b" data-to="c"[^>]*marker-end="url\(#ursula-arrow-accent\)"/);
    expect(svg).toMatch(/class="ursula-edge ursula-edge--normal ursula-edge--branch"[^>]*data-from="b" data-to="d"/);
    expect(svg).toMatch(/class="ursula-edge ursula-edge--normal"[^>]*data-from="a" data-to="b"[^>]*marker-end="url\(#ursula-arrow\)"/);
    expect(svg).toMatch(/class="ursula-edge-label ursula-edge-label--branch"[^>]*>yes</);
  });

  it('mark a box in a tinted lane, unless it has a role', () => {
    const lanes = render(LANES);
    expect(tag(lanes, 'a')).toContain('data-role="start"');
    expect(tag(lanes, 'a')).not.toContain('on-lane');
    expect(tag(lanes, 'b')).toContain('ursula-node--on-lane');
    expect(tag(lanes, 'c')).not.toContain('on-lane');
  });

  it('give the start and the decision the colours of the theme', () => {
    expect(render(FLOW, { theme: 'solid' })).toContain('[data-role="start"] .ursula-node-box{fill:var(--ursula-start-fill,#7447c8)}');
    expect(render(FLOW, { theme: 'outline' })).toContain('[data-role="start"] .ursula-node-box{fill:var(--ursula-surface,#ffffff);stroke:var(--ursula-accent,#7447c8);stroke-width:1.5}');
    expect(render(FLOW, { theme: 'card' })).toContain('[data-role="decision"] .ursula-node-box{fill:var(--ursula-decision-fill,#7447c8);stroke:var(--ursula-accent,#7447c8);stroke-width:1.5}');
    expect(render(FLOW, { theme: 'card' })).toContain('[data-role="decision"] .ursula-node-title{fill:var(--ursula-on-accent,#ffffff)}');
  });
});

describe('edge labels', () => {
  it('sit on a pill of 24 high with 10 either side of the text', () => {
    const svg = render('flowchart LR\na -->|go| b', { theme: 'outline' });
    const chip = /<rect class="ursula-edge-label-bg" x="([^"]*)" y="[^"]*" width="([^"]*)" height="([^"]*)" rx="([^"]*)"/.exec(svg);
    expect(Number(chip?.[3])).toBe(24);
    expect(Number(chip?.[4])).toBe(12);
    expect(Number(chip?.[2])).toBeCloseTo(pixelRuler().textWidth('go', 'edge') + 20, 5);
  });

  it('keep the centre of the label of the layout', () => {
    const l = layout(parse('flowchart LR\na -->|go| b'), pixelRuler());
    const label = l.edges[0]?.label;
    const svg = render('flowchart LR\na -->|go| b');
    const m = /<rect class="ursula-edge-label-bg" x="([^"]*)" y="([^"]*)" width="([^"]*)" height="([^"]*)"/.exec(svg);
    expect(Number(m?.[1]) + Number(m?.[3]) / 2).toBeCloseTo((label?.x ?? 0) + (label?.w ?? 0) / 2, 1);
    expect(Number(m?.[2]) + Number(m?.[4]) / 2).toBeCloseTo((label?.y ?? 0) + (label?.h ?? 0) / 2, 1);
  });

  it('have a rim of the background colour in the solid theme only', () => {
    expect(render('flowchart LR\na -->|go| b', { theme: 'solid' })).toContain('class="ursula-edge-label-halo"');
    expect(render('flowchart LR\na -->|go| b', { theme: 'outline' })).not.toContain('ursula-edge-label-halo');
    expect(render('flowchart LR\na -->|go| b', { theme: 'card' })).not.toContain('ursula-edge-label-halo');
  });

  it('have an outline in the outline theme and a shadow in the card theme', () => {
    expect(render('flowchart LR\na -->|go| b', { theme: 'outline' })).toContain('.ursula-edge-label-bg{fill:var(--ursula-chip-fill,#ffffff);stroke:var(--ursula-border,#d3d1dc);stroke-width:1}');
    expect(render('flowchart LR\na -->|go| b', { theme: 'card' })).toMatch(/<rect class="ursula-edge-label-bg"[^>]*filter="url\(#ursula-shadow\)"/);
  });
});

describe('rounded corners of a diamond', () => {
  const diamond = [
    { x: 50, y: 0 },
    { x: 100, y: 30 },
    { x: 50, y: 60 },
    { x: 0, y: 30 },
  ];

  it('are drawn with an arc at each corner', () => {
    const d = roundedPolygonPath(diamond, 12);
    expect(d.match(/A/g)).toHaveLength(4);
    expect(d.endsWith('Z')).toBe(true);
  });

  it('use the radius where the arc starts within a third of the sides', () => {
    const wide = roundedPolygonPath([{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 200 }, { x: 0, y: 200 }], 12);
    expect(wide).toContain('A12 12 0 0 1');
  });

  it('shrink the radius where the sides are short', () => {
    const small = roundedPolygonPath([{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 30 }, { x: 0, y: 30 }], 12);
    expect(small).toContain('A10 10 0 0 1');
  });
});

describe('ends on the rounded corners of a flat diamond', () => {
  const src = 'flowchart LR\n a[Start] --> d{Is the request approved here?}\n d --> b[Done]';

  it('reach the rounded end, which is at most 8 in from the corner', () => {
    const l = layout(parse(src), pixelRuler());
    const o = l.nodes.find((n) => n.id === 'd')?.outline;
    if (!o) throw new Error('no outline');
    expect(o.w / o.h).toBeGreaterThanOrEqual(2.5);
    const half = Math.atan(o.h / o.w);
    const r = Math.min(12, 8 / (1 / Math.sin(half) - 1));
    const retreat = r * (1 / Math.sin(half) - 1);
    expect(retreat).toBeLessThanOrEqual(8 + 1e-9);
    for (const theme of THEMES) {
      const svg = render(src, { theme });
      const into = tipOf(/data-from="a" data-to="d" d="([^"]*)"/.exec(svg)?.[1] ?? '', theme);
      const out = /data-from="d" data-to="b" d="M([-\d.]+) ([-\d.]+)/.exec(svg);
      expect(Math.abs(into.x - (o.x + retreat))).toBeLessThanOrEqual(1);
      expect(Math.abs(Number(out?.[1]) - (o.x + o.w - retreat))).toBeLessThanOrEqual(1);
    }
  });
});

describe('html page', () => {
  it('declares the colours of the theme of the drawing', async () => {
    const { renderHtml } = await import('../src/html.ts');
    expect(renderHtml(FLOW, {})).toContain('--ursula-start-fill:#7447c8');
    expect(renderHtml(FLOW, {})).toContain('--ursula-line:#c4c1d0');
    expect(renderHtml('sequenceDiagram\nA->>B: hi', {})).toContain('--ursula-line:#c4c1d0');
  });
});
