import { describe, expect, it } from 'vitest';
import { renderHtml } from '../src/html.ts';
import { layout, parse, pixelRuler, renderSvg } from '../src/index.ts';
import { BAKE_SOURCE, decodeSource, encodeSource, fileBase } from '../src/render/html.ts';

const SRC = `swimlane-beta LR
  subgraph a[Alpha]
    n1[First<br>line] --> n2[Second]
  end
  subgraph b[Beta]
    n3[Third]
  end
  n2 ==>|go| n3
  n3 -.-> n1
  n1 --> n1`;

/** Attribute values of every tag that carries `name`. */
function values(html: string, name: string): string[] {
  return [...html.matchAll(new RegExp(`\\s${name}="([^"]*)"`, 'g'))].map((m) => m[1] ?? '');
}

describe('renderHtml', () => {
  const html = renderHtml(SRC, { title: 'Order flow' });

  it('is a complete document with the drawing inline', () => {
    expect(html.startsWith('<!doctype html>\n<html')).toBe(true);
    expect(html).toContain('<meta charset="utf-8">');
    expect(html).toContain('name="viewport"');
    expect(html).toContain('<title>Order flow</title>');
    expect(html).toContain('<svg ');
    for (const label of ['Theme', 'PNG', 'SVG', 'Copy source']) expect(html).toContain(`>${label}</button>`);
  });

  it('refers to nothing outside the file', () => {
    const refs = [...values(html, 'src'), ...values(html, 'href')];
    expect(refs.filter((r) => /^(https?:)?\/\//.test(r))).toEqual([]);
    const withoutNamespace = html.replace(/xmlns="[^"]*"/g, '');
    expect(withoutNamespace).not.toMatch(/https?:\/\//);
    expect(withoutNamespace).not.toMatch(/url\(\s*['"]?(https?:)?\/\//);
  });

  it('is the same bytes for the same input', () => {
    expect(renderHtml(SRC, { title: 'Order flow' })).toBe(html);
  });

  it('marks every node and every edge so that pressing can follow them', () => {
    const g = parse(SRC);
    const l = layout(g, pixelRuler());
    const nodeIds = values(html, 'data-node');
    expect(nodeIds.sort()).toEqual(l.nodes.map((n) => n.id).sort());
    const pairs = [...html.matchAll(/<path class="ursula-edge[^"]*"[^>]*data-from="([^"]*)" data-to="([^"]*)"/g)].map((m) => `${m[1]}>${m[2]}`);
    expect(pairs.sort()).toEqual(l.edges.map((e) => `${e.from}>${e.to}`).sort());
    expect(html.match(/tabindex="0" role="button" data-node=/g)?.length).toBe(l.nodes.length);
    expect(html).toContain('svg[data-focus] [data-node]:not([data-on])');
  });

  it('carries the source and gives it back', () => {
    const tricky = 'flowchart LR\n  A["x </script> y <!-- z \\ w"] --> B';
    const page = renderHtml(tricky);
    const body = /<script type="text\/plain" id="ursula-source">([\s\S]*?)<\/script>/.exec(page)?.[1] ?? '';
    expect(body).not.toContain('</script');
    expect(decodeSource(body)).toBe(tricky);
    expect(decodeSource(encodeSource(SRC))).toBe(SRC);
  });

  it('starts in the theme asked for', () => {
    expect(renderHtml(SRC, { theme: 'dark' })).toContain('<html lang="en" data-theme="dark">');
    expect(renderHtml(SRC, { theme: 'light' })).toContain('data-theme="light"');
    expect(renderHtml(SRC)).not.toContain('data-theme="dark">');
    expect(html).toContain('@media (prefers-color-scheme:dark){:root:not([data-theme="light"])');
    expect(html).toContain(':root[data-theme="dark"]{');
    expect(html).toContain('@media print');
  });

  it('escapes the title', () => {
    const page = renderHtml(SRC, { title: '<b>"A" & B</b>' });
    expect(page).toContain('<title>&lt;b&gt;&quot;A&quot; &amp; B&lt;/b&gt;</title>');
    expect(page).not.toContain('<b>"A"');
    expect(page).toContain('<h1>&lt;b&gt;');
  });

  it('names saved files after the title', () => {
    expect(fileBase('Order Flow: v2')).toBe('order-flow-v2');
    expect(fileBase(undefined)).toBe('diagram');
    expect(html).toContain('data-file="order-flow"');
  });

  it('draws sequence diagrams too, without the pressing', () => {
    const page = renderHtml('sequenceDiagram\n  A->>B: hi');
    expect(page).toContain('<svg ');
    expect(page).not.toContain('data-node=');
  });

  it('stays under 100 KB', () => {
    expect(html.length).toBeLessThan(100_000);
  });
});

describe('saving with baked colours', () => {
  const bake = new Function(`return ${BAKE_SOURCE}`)() as (text: string, get: (name: string) => string) => string;

  it('leaves no variable in the SVG it saves', () => {
    const svg = renderSvg(layout(parse(SRC), pixelRuler()));
    expect(svg).toContain('var(--ursula-');
    const baked = bake(svg, (name) => `#${name.length}${name.length}${name.length}`);
    expect(baked).not.toContain('var(');
    expect(baked).toContain('#222');
  });

  it('is the same SVG as the page draws, apart from colours', () => {
    const svg = renderSvg(layout(parse(SRC), pixelRuler()));
    const baked = bake(svg, () => '#000000');
    expect(baked.replace(/#000000/g, '')).toBe(svg.replace(/var\(--ursula-[a-z-]+,[^)]*\)/g, ''));
  });
});
