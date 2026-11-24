import { pathData } from '../src/render/svg.ts';
import { describe, expect, it } from 'vitest';
import { layout, parse, pixelRuler, render, renderSvg } from '../src/index.ts';
import { twoLanes } from './fixtures.ts';

describe('svg', () => {
  it('draws lanes, nodes, edges and labels', () => {
    const svg = render(twoLanes);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('data-node="A"');
    expect(svg).toContain('ursula-edge--thick');
    expect(svg).toContain('ursula-edge--dotted');
    expect(svg).toContain('prefers-color-scheme: dark');
    expect(svg).toContain('--ursula-line');
    expect(svg).toContain('>paid<');
  });

  it('escapes text', () => {
    const svg = render('flowchart LR\nA["<b>&\'x\'</b>"] --> B');
    expect(svg).not.toContain('<b>');
    expect(svg).toContain('&lt;b&gt;&amp;&#39;x&#39;&lt;/b&gt;');
  });

  it('applies the node hook', () => {
    const l = layout(parse('flowchart LR\nA --> B'), pixelRuler());
    const svg = renderSvg(l, {
      node: (n) => (n.id === 'A' ? { attrs: { 'data-state': 'done' }, className: 'is-done', extra: '<title>a</title>' } : undefined),
    });
    expect(svg).toContain('class="ursula-node is-done" data-node="A" data-state="done"');
    expect(svg).toContain('<title>a</title></g>');
  });

  it('tints only the first lane band when there are two or more labelled lanes', () => {
    const svg = render(twoLanes);
    const lanes = svg.match(/<rect class="ursula-lane[^"]*"/g) ?? [];
    expect(lanes).toEqual(['<rect class="ursula-lane ursula-lane--tint"', '<rect class="ursula-lane"']);
    expect(render('swimlane-beta LR\nsubgraph s[Solo]\nA --> B\nend')).toContain('ursula-lane ursula-lane--tint');
  });

  it('marks thick edges and their labels with a class and a marker of their own, in the colour of every line', () => {
    const svg = render('flowchart LR\nA ==>|go| B\nA -->|plain| C');
    expect(svg).not.toContain('.ursula-edge--thick{');
    expect(svg).not.toContain('.ursula-edge-label--thick{');
    expect(svg).toContain('.ursula-arrow--accent{fill:var(--ursula-line,#565554)}');
    expect(svg).toMatch(/<path class="ursula-edge ursula-edge--thick" data-style="thick"[^>]*marker-end="url\(#ursula-arrow-accent\)"/);
    expect(svg).toMatch(/<text class="ursula-edge-label ursula-edge-label--thick"[^>]*>go</);
    expect(svg).toMatch(/<text class="ursula-edge-label" [^>]*>plain</);
  });

  it('adds data attributes, role and a title', () => {
    const svg = render(twoLanes);
    expect(svg).toContain('data-lane="customer"');
    expect(svg).toContain('data-style="dotted"');
    expect(svg).toContain('role="img"');
    expect(svg).toMatch(/<title>Flowchart: \d+ nodes, \d+ edges<\/title>/);
    expect(render('flowchart LR\nA --> B', { title: 'My <flow>' })).toContain('<title>My &lt;flow&gt;</title>');
  });
});

describe('svg legend', () => {
  const three = 'flowchart LR\nA ==> B\nA -.-> C\nB --> D\nC --> D';

  it('is drawn when two or more edge styles are used', () => {
    const svg = render(three);
    expect(svg).toContain('class="ursula-legend"');
    for (const c of ['>Flow<', '>Request<', '>Pending<']) expect(svg).toContain(c);
  });

  it('is absent with one style and when disabled', () => {
    expect(render('flowchart LR\nA --> B')).not.toContain('ursula-legend"');
    expect(render(three, { legend: false })).not.toContain('ursula-legend"');
  });

  it('takes captions from the option', () => {
    const svg = render(three, { legend: { thick: 'Call' } });
    expect(svg).toContain('>Call<');
    expect(svg).toContain('>Flow<');
    expect(svg).not.toContain('>Request<');
  });

  it('adds its height below the drawing without overlapping it', () => {
    const bare = layout(parse(three), pixelRuler(), { legend: false });
    const full = layout(parse(three), pixelRuler());
    expect(full.height).toBe(bare.height + 32);
    expect(full.legend?.y).toBe(bare.height);
    expect(Math.max(...full.edges.flatMap((e) => e.points.map((p) => p.y)))).toBeLessThanOrEqual(bare.height);
    expect(render(three)).toContain(`height="${full.height}"`);
  });

  it('can be re-captioned or removed by renderSvg', () => {
    const l = layout(parse(three), pixelRuler());
    expect(renderSvg(l, { legend: false })).toContain(`height="${l.height - 32}"`);
    expect(renderSvg(l, { legend: { normal: 'Step' } })).toContain('>Step<');
  });
});

describe('line jumps', () => {
  it('jumps a level run over an upright run it crosses, by a half circle above, and only there', () => {
    expect(pathData([{ x: 0, y: 50 }, { x: 100, y: 50 }], 8, 0, [{ x: 40, y: 50 }])).toBe('M0 50 L34 50 A6 6 0 0 1 46 50 L100 50');
    expect(pathData([{ x: 100, y: 50 }, { x: 0, y: 50 }], 8, 0, [{ x: 40, y: 50 }])).toBe('M100 50 L46 50 A6 6 0 0 0 34 50 L0 50');
    // A crossing too near the end of the run, or on another level, is no jump.
    expect(pathData([{ x: 0, y: 50 }, { x: 100, y: 50 }], 8, 0, [{ x: 4, y: 50 }, { x: 40, y: 20 }])).toBe('M0 50 L100 50');
  });
});
