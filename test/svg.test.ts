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
});
