import { describe, expect, it } from 'vitest';
import { cellRuler, layout, parse, pixelRuler, renderSvg } from '../src/index.ts';
import type { Layout, LayoutNode, Point } from '../src/index.ts';
import { tipOf } from './helpers.ts';

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

/** The points of the path drawn for the edge `from -> to`, as the SVG has them, with the end moved to the tip of the arrowhead. */
function svgPath(svg: string, from: string, to: string): Point[] {
  const m = new RegExp(`<path class="ursula-edge[^"]*"[^>]*data-from="${from}" data-to="${to}" d="([^"]*)"`).exec(svg);
  if (!m) throw new Error(`no path ${from} -> ${to}`);
  const nums = (m[1] as string).match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  const out: Point[] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) out.push({ x: nums[i] as number, y: nums[i + 1] as number });
  out[out.length - 1] = tipOf(m[1] as string);
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

  it('is drawn as a path with four rounded corners inside the outline, every end of it on a side of the diamond', () => {
    const { l, svg } = drawn('flowchart LR\na[Start] --> d{Approved?} --> b[Done]');
    const o = node(l, 'd').outline as NonNullable<LayoutNode['outline']>;
    const d = /<path class="ursula-node-box" d="([^"]*)"/.exec(svg)?.[1] ?? '';
    expect(d.match(/A/g)).toHaveLength(4);
    expect(d.endsWith('Z')).toBe(true);
    const cx = o.x + o.w / 2;
    const cy = o.y + o.h / 2;
    for (const cmd of d.match(/[ML][^MLAZ]*/g) ?? []) {
      const [x, y] = (cmd.slice(1).match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number) as [number, number];
      expect(Math.abs(x - cx) / (o.w / 2) + Math.abs(y - cy) / (o.h / 2)).toBeCloseTo(1, 1);
    }
    for (const arc of d.matchAll(/A(\d+(?:\.\d+)?) /g)) expect(Number(arc[1])).toBeLessThanOrEqual(12);
  });
});

/** The ends of the lines stop at the rounded corners, at most this far in from the corner. */
const MOST_IN = 8.5;

describe('edge ends on a diamond', () => {
  it('meet the left and the right corner in a left-to-right drawing', () => {
    const { l, svg } = drawn('flowchart LR\na[Start] --> d{Approved?} --> b[Done]');
    const o = node(l, 'd').outline as NonNullable<LayoutNode['outline']>;
    const cy = o.y + o.h / 2;
    const into = last(svgPath(svg, 'a', 'd'));
    const out = first(svgPath(svg, 'd', 'b'));
    expect(Math.abs(into.x - o.x)).toBeLessThanOrEqual(MOST_IN);
    expect(Math.abs(into.y - cy)).toBeLessThanOrEqual(MOST_IN);
    expect(Math.abs(out.x - (o.x + o.w))).toBeLessThanOrEqual(MOST_IN);
    expect(Math.abs(out.y - cy)).toBeLessThanOrEqual(MOST_IN);
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
    expect(Math.abs(into.x - (o.x + o.w / 2))).toBeLessThanOrEqual(MOST_IN);
    expect(Math.abs(into.y - o.y)).toBeLessThanOrEqual(MOST_IN);
    expect(Math.abs(out.y - (o.y + o.h))).toBeLessThanOrEqual(MOST_IN);
  });

  it('share the corner and are reported when no other side has room for a second end', () => {
    const { l, svg } = drawn('flowchart TD\na[Start] --> d{Approved?}\nb[Other] --> d\nd --> c[X]\nd --> e[Y]');
    const o = node(l, 'd').outline as NonNullable<LayoutNode['outline']>;
    const corner = { x: o.x + o.w, y: o.y + o.h / 2 };
    for (const p of [last(svgPath(svg, 'b', 'd')), first(svgPath(svg, 'd', 'e'))]) {
      expect(Math.abs(p.x - corner.x)).toBeLessThanOrEqual(MOST_IN);
      expect(Math.abs(p.y - corner.y)).toBeLessThanOrEqual(MOST_IN);
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
