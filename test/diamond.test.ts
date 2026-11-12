import { describe, expect, it } from 'vitest';
import { cellRuler, layout, parse, pixelRuler, renderSvg } from '../src/index.ts';
import type { Layout, LayoutNode, Point } from '../src/index.ts';

const ruler = pixelRuler();

function drawn(src: string): { l: Layout; svg: string } {
  const l = layout(parse(src), ruler);
  return { l, svg: renderSvg(l) };
}

function node(l: Layout, id: string): LayoutNode {
  const n = l.nodes.find((q) => q.id === id);
  if (!n) throw new Error(`no node ${id}`);
  return n;
}

/** The points of the path drawn for the edge `from -> to`, as the SVG has them. */
function svgPath(svg: string, from: string, to: string): Point[] {
  const m = new RegExp(`<path class="ursula-edge[^"]*"[^>]*data-from="${from}" data-to="${to}" d="([^"]*)"`).exec(svg);
  if (!m) throw new Error(`no path ${from} -> ${to}`);
  const nums = (m[1] as string).match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  const out: Point[] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) out.push({ x: nums[i] as number, y: nums[i + 1] as number });
  return out;
}

const first = (p: Point[]): Point => p[0] as Point;
const last = (p: Point[]): Point => p[p.length - 1] as Point;

describe('diamond outline', () => {
  it('has the size of the smallest diamond that holds the text', () => {
    const { l } = drawn('flowchart LR\nd{Approved?}');
    const n = node(l, 'd');
    const textW = ruler.textWidth('Approved?', 'title');
    const textH = ruler.lineHeight('title');
    const h = 48 + 16;
    const w = Math.ceil((textW / (1 - textH / h) + 16) / 8 - 1e-9) * 8;
    expect(n.outline).toBeDefined();
    expect(n.outline?.h).toBe(64);
    expect(n.outline?.w).toBe(w);
    expect((n.outline?.x ?? 0) + w / 2).toBeCloseTo(n.x + n.w / 2, 6);
    expect((n.outline?.y ?? 0) + h / 2).toBeCloseTo(n.y + n.h / 2, 6);
    expect(n.w).toBeGreaterThanOrEqual(w);
  });

  it('is only on diamonds', () => {
    const { l } = drawn('flowchart LR\na[x] --> b(y) --> c((z)) --> d{w}');
    expect(l.nodes.filter((n) => n.outline !== undefined).map((n) => n.id)).toEqual(['d']);
  });

  it('is drawn as a polygon of four points through the middles of the outline sides', () => {
    const { l, svg } = drawn('flowchart LR\na[Start] --> d{Approved?} --> b[Done]');
    const o = node(l, 'd').outline as NonNullable<LayoutNode['outline']>;
    const poly = /<polygon class="ursula-node-box" points="([^"]*)"/.exec(svg);
    expect(poly).not.toBeNull();
    const pts = (poly?.[1] ?? '').split(' ');
    expect(pts).toHaveLength(4);
    expect(pts).toEqual([`${o.x + o.w / 2},${o.y}`, `${o.x + o.w},${o.y + o.h / 2}`, `${o.x + o.w / 2},${o.y + o.h}`, `${o.x},${o.y + o.h / 2}`]);
  });
});

describe('edge ends on a diamond', () => {
  it('meet the left and the right corner in a left-to-right drawing', () => {
    const { l, svg } = drawn('flowchart LR\na[Start] --> d{Approved?} --> b[Done]');
    const o = node(l, 'd').outline as NonNullable<LayoutNode['outline']>;
    const cy = o.y + o.h / 2;
    const into = last(svgPath(svg, 'a', 'd'));
    const out = first(svgPath(svg, 'd', 'b'));
    expect(Math.abs(into.x - o.x)).toBeLessThan(0.5);
    expect(Math.abs(into.y - cy)).toBeLessThan(0.5);
    expect(Math.abs(out.x - (o.x + o.w))).toBeLessThan(0.5);
    expect(Math.abs(out.y - cy)).toBeLessThan(0.5);
    // The layout keeps the ends on the box.
    const n = node(l, 'd');
    expect(last((l.edges.find((e) => e.to === 'd') as Layout['edges'][number]).points).x).toBe(n.x);
  });

  it('meet the top corner, drawn back from the box, in a top-to-bottom drawing', () => {
    const { l, svg } = drawn('flowchart TD\na[Start] --> d{Approved?} --> b[Done]');
    const n = node(l, 'd');
    const o = n.outline as NonNullable<LayoutNode['outline']>;
    const into = last(svgPath(svg, 'a', 'd'));
    const out = first(svgPath(svg, 'd', 'b'));
    expect(o.y).toBe(n.y - 8);
    expect(Math.abs(into.x - (o.x + o.w / 2))).toBeLessThan(0.5);
    expect(Math.abs(into.y - o.y)).toBeLessThan(0.5);
    expect(Math.abs(out.y - (o.y + o.h))).toBeLessThan(0.5);
  });

  it('share the corner and are reported when no other side has room for a second end', () => {
    const { l, svg } = drawn('flowchart TD\na[Start] --> d{Approved?}\nb[Other] --> d\nd --> c[X]\nd --> e[Y]');
    const o = node(l, 'd').outline as NonNullable<LayoutNode['outline']>;
    const corner = { x: o.x + o.w, y: o.y + o.h / 2 };
    for (const p of [last(svgPath(svg, 'b', 'd')), first(svgPath(svg, 'd', 'e'))]) {
      expect(Math.abs(p.x - corner.x)).toBeLessThan(0.5);
      expect(Math.abs(p.y - corner.y)).toBeLessThan(0.5);
    }
    const found = l.diagnostics.filter((d) => d.kind === 'shared-port');
    expect(found).toHaveLength(1);
    expect(found[0]?.nodes).toEqual(['d']);
  });

  it('leave no diagnostic when every side has one edge', () => {
    const { l } = drawn('flowchart LR\na[Start] --> d{Approved?} --> b[Done]');
    expect(l.diagnostics.filter((d) => d.kind === 'shared-port')).toEqual([]);
  });
});

describe('without a diamond', () => {
  it('a terminal drawing gives no outline', () => {
    const l = layout(parse('flowchart LR\na[Start] --> d{Approved?} --> b[Done]'), cellRuler());
    expect(l.nodes.every((n) => n.outline === undefined)).toBe(true);
  });
});
