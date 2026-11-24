import { describe, expect, it } from 'vitest';
import { layout, parse, pixelRuler, render } from '../src/index.ts';
import { roundedPolygonPath } from '../src/render/shapes.ts';
import type { Point } from '../src/index.ts';

/** How far the line of an edge stops short of the tip of its arrowhead. */
const TRIM = 8;

/** The tip of the arrowhead of an edge: the end of its path plus what the line stops short. */
function tipOf(d: string): Point {
  const ends = (d.match(/[MLA][^MLA]*/g) ?? []).map((c) => {
    const n = c.slice(1).match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
    return { x: n[n.length - 2] ?? 0, y: n[n.length - 1] ?? 0 };
  });
  const last = ends[ends.length - 1] as Point;
  const prev = ends[ends.length - 2] as Point;
  const len = Math.hypot(last.x - prev.x, last.y - prev.y) || 1;
  return { x: last.x + ((last.x - prev.x) / len) * TRIM, y: last.y + ((last.y - prev.y) / len) * TRIM };
}

const FLOW = 'flowchart TD\n a[Start] --> b{Check}\n b -->|yes| c[Done]\n b -->|no| d[Retry]';

const LANES = 'swimlane-beta LR\nsubgraph one[One]\n a[Alpha] --> b[Beta]\nend\nsubgraph two[Two]\n c[Gamma]\nend\nb --> c';

const RX = 10;
const LINE = 1.5;

const tag = (svg: string, node: string): string => new RegExp(`<g class="[^"]*" data-node="${node}"[^>]*>`).exec(svg)?.[0] ?? '';

const rectOf = (svg: string, node: string): string => new RegExp(`data-node="${node}"[^>]*><rect class="ursula-node-box"[^>]*>`).exec(svg)?.[0] ?? '';

describe('the look of a drawing', () => {
  const svg = render(FLOW);

  it('is the same for every call, and the layout does not depend on it', () => {
    const l = JSON.stringify(layout(parse(FLOW), pixelRuler()));
    expect(render(FLOW)).toBe(svg);
    expect(JSON.stringify(layout(parse(FLOW), pixelRuler()))).toBe(l);
  });

  it('writes its name on the root element', () => {
    expect(svg).toMatch(/^<svg [^>]*class="ursula" data-theme="band"/);
  });

  it('rounds the corners of a box and of a lane', () => {
    expect(rectOf(svg, 'a')).toContain(`rx="${RX}"`);
    expect(render(LANES)).toMatch(new RegExp(`<rect class="ursula-lane[^"]*"[^>]*rx="${RX + 4}"`));
  });

  it('draws a rounded box with the radius of a box plus 8, at most half its height', () => {
    const h = layout(parse('flowchart LR\na(x)'), pixelRuler()).nodes[0]?.h ?? 0;
    expect(render('flowchart LR\na(x)')).toContain(`rx="${Math.min(RX + 8, h / 2)}"`);
  });

  it('sets the width of an edge', () => {
    expect(svg).toContain(`.ursula-edge{fill:none;stroke:var(--ursula-line,`);
    expect(svg).toMatch(new RegExp(`\\.ursula-edge\\{[^}]*stroke-width:${LINE};stroke-linecap:round;stroke-linejoin:round\\}`));
  });

  it('draws the arrowhead as a filled marker with a class for each colour', () => {
    expect(svg).toMatch(/<marker id="ursula-arrow" [^>]*>(<path class="ursula-arrow"[^>]*>)<\/marker>/);
    expect(svg).toMatch(/<marker id="ursula-arrow-accent" [^>]*><path class="ursula-arrow ursula-arrow--accent"/);
    expect(/\.ursula-arrow\{([^}]*)\}/.exec(svg)?.[1] ?? '').toMatch(/^fill:var\(--ursula-line,/);
    expect(svg).toMatch(/<marker[^>]*><path[^>]*z"\/>/);
  });

  it('casts no shadow', () => {
    expect(svg).not.toContain('<filter');
    expect(svg).not.toContain('filter="url(');
  });

  it('gives both a light and a dark value for a colour', () => {
    expect(svg).toContain('@media (prefers-color-scheme: dark)');
    const light = svg.slice(svg.indexOf('<style>'), svg.indexOf('@media'));
    const dark = svg.slice(svg.indexOf('@media'), svg.indexOf('</style>'));
    expect(light).toContain('var(--ursula-fg,#201f1e)');
    expect(dark).toContain('var(--ursula-fg,#efeeec)');
  });

  it('stops the line of an edge short of the tip so that it stays inside the arrowhead', () => {
    const l = layout(parse('flowchart LR\na --> b'), pixelRuler());
    const b = l.nodes.find((n) => n.id === 'b');
    const d = /data-from="a" data-to="b" d="([^"]*)"/.exec(render('flowchart LR\na --> b'))?.[1] ?? '';
    const end = Number((d.match(/-?\d+(?:\.\d+)?/g) ?? []).slice(-2)[0]);
    expect(end).toBeCloseTo((b?.x ?? 0) - TRIM, 1);
  });

  it('dashes a dotted line', () => {
    expect(render('flowchart LR\na -.-> b')).toContain('.ursula-edge--dotted{stroke-dasharray:5 4}');
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

  it('give the start a fill of its own and the decision the face of a box', () => {
    const svg = render(FLOW);
    expect(svg).toContain('[data-role="start"] .ursula-node-box{fill:var(--ursula-start-fill,#e5c37a)}');
    expect(svg).toContain('[data-role="decision"] .ursula-node-box{fill:var(--ursula-surface,#fcfcfa)}');
    expect(svg).toContain('[data-role="decision"] .ursula-node-title{fill:var(--ursula-fg,#201f1e)}');
  });
});

describe('edge labels', () => {
  it('sit on a pill of 24 high with 10 either side of the text', () => {
    const svg = render('flowchart LR\na -->|go| b');
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

  it('have a fill and neither a rim, an outline nor a shadow', () => {
    const svg = render('flowchart LR\na -->|go| b');
    expect(svg).toContain('.ursula-edge-label-bg{fill:var(--ursula-chip-fill,#f1f0ef)}');
    expect(svg).not.toContain('ursula-edge-label-halo');
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
    const svg = render(src);
    const into = tipOf(/data-from="a" data-to="d" d="([^"]*)"/.exec(svg)?.[1] ?? '');
    const out = /data-from="d" data-to="b" d="M([-\d.]+) ([-\d.]+)/.exec(svg);
    expect(Math.abs(into.x - (o.x + retreat))).toBeLessThanOrEqual(1);
    expect(Math.abs(Number(out?.[1]) - (o.x + o.w - retreat))).toBeLessThanOrEqual(1);
  });
});

describe('html page', () => {
  it('declares the colours of the drawing', async () => {
    const { renderHtml } = await import('../src/html.ts');
    expect(renderHtml(FLOW, {})).toContain('--ursula-start-fill:#e5c37a');
    expect(renderHtml(FLOW, {})).toContain('--ursula-line:#565554');
    expect(renderHtml('sequenceDiagram\nA->>B: hi', {})).toContain('--ursula-line:#a5a4a2');
  });
});
