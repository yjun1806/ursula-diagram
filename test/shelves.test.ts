import { describe, expect, it } from 'vitest';
import type { Layout } from '../src/index.ts';
import { layout, parse, pixelRuler, render, selectFrontEnd } from '../src/index.ts';

const ruler = pixelRuler();
const drawn = (src: string) => layout(parse(src), ruler);

describe('children of one parent stand on one line', () => {
  it('puts the three children of a top-down parent on one row under it', () => {
    const l = drawn('flowchart TD\n A-->B\n A-->C\n A-->D');
    const at = new Map(l.nodes.map((n) => [n.id, n] as const));
    const ys = ['B', 'C', 'D'].map((id) => at.get(id)?.y);
    expect(new Set(ys).size).toBe(1);
    expect(at.get('A')?.y).toBeLessThan(ys[0] as number);
    const [a, c] = [at.get('A'), at.get('C')];
    expect((a?.x ?? 0) + (a?.w ?? 0) / 2).toBe((c?.x ?? 0) + (c?.w ?? 0) / 2);
  });

  it('keeps the lane model inside a named lane', () => {
    const l = drawn('swimlane-beta LR\nsubgraph x[Lane]\n A-->B\n A-->C\n A-->D\nend');
    expect(l.composition).toBe('lanes');
  });
});

describe('pieces that no edge joins', () => {
  const pairs = (n: number): string => `classDiagram\n${Array.from({ length: n }, (_, i) => `  C${2 * i} <|-- C${2 * i + 1}`).join('\n')}`;
  const svgSize = (src: string): { w: number; h: number } => {
    const m = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(render(src));
    return { w: Number(m?.[1]), h: Number(m?.[2]) };
  };

  it('stand side by side across the flow instead of in one tall column', () => {
    const { w, h } = svgSize(pairs(4));
    expect(h).toBeLessThan(w);
  });

  it('start a second shelf when one shelf would pass the width limit', () => {
    const { w, h } = svgSize(pairs(12));
    expect(w).toBeLessThanOrEqual(1280 * 1.15);
    const one = svgSize(pairs(1)).h;
    expect(h).toBeGreaterThan(one + 48);
  });

  it('keep a gap of 48 between neighbouring pieces and the order of the text', () => {
    const l = drawn('flowchart TD\n a-->b\n c-->d');
    const at = new Map(l.nodes.map((n) => [n.id, n] as const));
    expect(l.nodes.map((n) => n.id)).toEqual(['a', 'b', 'c', 'd']);
    const left = at.get('a');
    const right = at.get('c');
    expect((right?.x ?? 0) - ((left?.x ?? 0) + (left?.w ?? 0))).toBe(48);
    expect(l.edges.map((e) => `${e.from}>${e.to}`)).toEqual(['a>b', 'c>d']);
  });
});

describe('boxes with compartments keep their own height', () => {
  it('does not stretch the shorter box of a row to the taller one', () => {
    const src = 'classDiagram\n P <|-- A\n P <|-- B\n class A{\n +x\n +y\n +z\n }\n class B{\n +x\n }';
    const l = selectFrontEnd(src).json(src, 'svg', {}) as Layout;
    const at = new Map(l.nodes.map((n) => [n.id, n] as const));
    expect(at.get('A')?.y).toBe(at.get('B')?.y);
    expect(at.get('A')?.h).toBeGreaterThan(at.get('B')?.h ?? Infinity);
  });
});
