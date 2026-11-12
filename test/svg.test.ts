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
    expect(svg).toContain('--ursula-accent');
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

  it('marks accent colour on thick edges and their labels', () => {
    const svg = render('flowchart LR\nA ==>|go| B\nA -->|plain| C');
    expect(svg).toContain('.ursula-edge--thick{stroke:var(--ursula-accent,#7447c8)}');
    expect(svg).toContain('.ursula-edge-label--thick{fill:var(--ursula-accent,#7447c8)}');
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
