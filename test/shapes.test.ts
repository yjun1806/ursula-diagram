import { describe, expect, it } from 'vitest';
import { layout, parse, pixelRuler, render } from '../src/index.ts';
import type { NodeShape } from '../src/index.ts';
import { tipOf } from './helpers.ts';

const CASES: Array<[string, NodeShape]> = [
  ['a[x]', 'rect'],
  ['a', 'rect'],
  ['a(x)', 'round'],
  ['a([x])', 'stadium'],
  ['a((x))', 'circle'],
  ['a{x}', 'diamond'],
  ['a{{x}}', 'hexagon'],
  ['a[(x)]', 'cylinder'],
  ['a[/x/]', 'parallelogram'],
  ['a[[x]]', 'subroutine'],
];

const QUOTED: Array<[string, NodeShape]> = [
  ['a["x y"]', 'rect'],
  ['a(["x y"])', 'stadium'],
  ['a(("x y"))', 'circle'],
  ['a{"x y"}', 'diamond'],
  ['a{{"x y"}}', 'hexagon'],
  ['a[("x y")]', 'cylinder'],
  ['a[/"x y"/]', 'parallelogram'],
  ['a[["x y"]]', 'subroutine'],
  ['a("x y")', 'round'],
];


describe('node shapes', () => {
  it.each(CASES)('reads %s as %s', (decl, shape) => {
    expect(parse(`flowchart LR\n${decl}`).nodes[0]?.shape).toBe(shape);
  });

  it.each(QUOTED)('reads the quoted label of %s as %s', (decl, shape) => {
    const node = parse(`flowchart LR\n${decl}`).nodes[0];
    expect(node?.shape).toBe(shape);
    expect(node?.title).toBe('x y');
  });

  it('takes the shape of the declaration that gives a label', () => {
    expect(parse('flowchart LR\na --> b\nb((x))\na').nodes.map((n) => n.shape)).toEqual(['rect', 'circle']);
    expect(parse('flowchart LR\na(x) --> b\nb --> a').nodes.map((n) => n.shape)).toEqual(['round', 'rect']);
  });

  it('carries the shape into the layout', () => {
    expect(layout(parse('flowchart LR\na((x)) --> b'), pixelRuler()).nodes.map((n) => n.shape)).toEqual(['circle', 'rect']);
  });
});

const PLAIN = 'flowchart LR\na[One] --> b[Two] --> c[Three] --> d[Four]\nb --> e[Five]\nc --> e';
const MIXED = 'flowchart LR\na([One]) --> b{{Two}} --> c[(Three)] --> d[/Four/]\nb --> e[[Five]]\nc --> e';

describe('node shapes in the drawing', () => {
  it('leave box positions and edge paths as they are', () => {
    const plain = layout(parse(PLAIN), pixelRuler());
    const mixed = layout(parse(MIXED), pixelRuler());
    const box = (l: typeof plain) => l.nodes.map(({ id, x, y, w, h }) => ({ id, x, y, w, h }));
    expect(box(mixed)).toEqual(box(plain));
    // A line meets the face of the shape it ends on, so its path may differ; the edges themselves and their count of crossings do not.
    expect(mixed.edges.map((e) => `${e.from}>${e.to}`)).toEqual(plain.edges.map((e) => `${e.from}>${e.to}`));
    expect(mixed.diagnostics.filter((d) => d.kind === 'crossing')).toEqual(plain.diagnostics.filter((d) => d.kind === 'crossing'));
  });

  it('draw each shape with its own element', () => {
    const svg = (decl: string): string => render(`flowchart LR\n${decl}`);
    const polygons = (s: string): string[] => [...s.matchAll(/<polygon[^>]*points="([^"]*)"/g)].map((m) => m[1] ?? '');
    const roundH = layout(parse('flowchart LR\na(x)'), pixelRuler()).nodes[0]?.h ?? 0;
    expect(svg('a(x)')).toContain(`rx="${Math.min(26, roundH / 2)}"`);
    expect(svg('a(x)')).not.toContain('<ellipse');
    expect(svg('a([x])')).toMatch(/<rect class="ursula-node-box"[^>]*rx="(\d+(\.\d+)?)"/);
    expect(svg('a((x))')).toContain('<ellipse');
    expect(polygons(svg('a{{x}}'))[0]?.split(' ')).toHaveLength(6);
    expect(polygons(svg('a[/x/]'))[0]?.split(' ')).toHaveLength(4);
    expect(svg('a[[x]]').match(/<line class="ursula-node-box ursula-node-box--lined"/g)).toHaveLength(2);
    expect(svg('a[(x)]')).toMatch(/<path class="ursula-node-box ursula-node-box--lined" d="M[^"]*A[^"]*A[^"]*V/);
    expect(svg('a{x}')).toMatch(/<path class="ursula-node-box" d="M[^"]*(A[^"]*){4}Z"/);
  });

  it('give a stadium a corner radius of half its height', () => {
    const l = layout(parse('flowchart LR\na([x])'), pixelRuler());
    const h = l.nodes[0]?.h ?? 0;
    expect(render('flowchart LR\na([x])')).toContain(`rx="${h / 2}"`);
  });

  it('end an edge that arrives off-centre on an ellipse, on the ellipse', () => {
    const src = 'flowchart TD\na[One] --> c((Target))\nb[Two] --> c\nd[Three] --> c';
    const l = layout(parse(src), pixelRuler());
    const c = l.nodes.find((n) => n.id === 'c');
    if (!c) throw new Error('node c missing');
    const svg = render(src);
    const cx = c.x + c.w / 2;
    const cy = c.y + c.h / 2;
    let checked = 0;
    for (const m of svg.matchAll(/data-to="c" d="([^"]*)"/g)) {
      const { x, y } = tipOf(m[1] ?? '');
      if (Math.abs(x - cx) < 1) continue;
      const v = ((x - cx) / (c.w / 2)) ** 2 + ((y - cy) / (c.h / 2)) ** 2;
      expect(Math.abs(v - 1)).toBeLessThan(0.01);
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });
});
