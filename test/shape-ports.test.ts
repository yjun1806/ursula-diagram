import { describe, expect, it } from 'vitest';
import { layout, parse, pixelRuler, renderSvg } from '../src/index.ts';
import type { Layout, LayoutNode, Point } from '../src/index.ts';
import { faceOffsets, portOffsets, sideCapacity } from '../src/layered/ports.ts';
import type { Face } from '../src/layered/ports.ts';
import { tipOf } from './helpers.ts';
import type { NodeShape } from '../src/types.ts';
import { geometryViolations } from './helpers.ts';

const LENGTH = 144;
const STEP = 24;
const FACES: Face[] = ['top', 'bottom', 'left', 'right'];
const lattice = portOffsets(LENGTH, STEP);

const offsets = (shape: NodeShape, face: Face, across = 48, count = 1): number[] => faceOffsets(shape, face, LENGTH, across, STEP, count, false);

describe('ports of a face by shape', () => {
  it('keep the whole lattice on a rectangle, a round box, a subroutine and a cylinder', () => {
    expect(lattice).toEqual([24, 48, 72, 96, 120]);
    for (const shape of ['rect', 'round', 'subroutine', 'cylinder'] as const) {
      for (const face of FACES) {
        expect(offsets(shape, face)).toEqual(lattice);
        // The dense lattice (steps of 12) holds 11 where the whole steps hold 5.
        expect(sideCapacity(shape, face, LENGTH, STEP, 48, false)).toBe(11);
      }
    }
  });

  it('give a diamond its middle on every face, however many ports are wanted', () => {
    for (const face of FACES) {
      expect(offsets('diamond', face)).toEqual([72]);
      expect(offsets('diamond', face, 48, 4)).toEqual([72]);
      expect(sideCapacity('diamond', face, LENGTH, STEP, 48, false)).toBe(1);
    }
  });

  it('give a circle the lattice within the middle 70% of every face', () => {
    for (const face of FACES) {
      expect(offsets('circle', face)).toEqual([24, 48, 72, 96, 120]);
      expect(sideCapacity('circle', face, LENGTH, STEP, 48, false)).toBe(9);
    }
    // 21.6 to 122.4: the dense lattice holds the ports 24 to 120 in steps of 12.
    expect(offsets('circle', 'top', 48, 6)).toEqual([24, 36, 48, 60, 72, 84, 96, 108, 120]);
  });

  it('give a stadium its middle on the left and right and the straight stretch on the top and bottom', () => {
    for (const face of ['left', 'right'] as const) expect(offsets('stadium', face)).toEqual([72]);
    // The stretch is the length less the height: 144 - 96 = 48, so 48 to 96.
    for (const face of ['top', 'bottom'] as const) {
      expect(offsets('stadium', face, 96)).toEqual([48, 72, 96]);
      expect(sideCapacity('stadium', face, LENGTH, STEP, 96, false)).toBe(5);
      expect(offsets('stadium', face, 48)).toEqual(lattice);
    }
  });

  it('give a hexagon and a parallelogram their middle on the left and right and the stretch less 24 on the top and bottom', () => {
    for (const shape of ['hexagon', 'parallelogram'] as const) {
      for (const face of ['left', 'right'] as const) expect(offsets(shape, face)).toEqual([72]);
      for (const face of ['top', 'bottom'] as const) {
        expect(offsets(shape, face)).toEqual(lattice);
        // 48 - 24 = 24: the stretch reaches 12 either side of the middle.
        expect(faceOffsets(shape, face, 48, 48, STEP, 1, false)).toEqual([24]);
        expect(sideCapacity(shape, face, 48, STEP, 48, false)).toBe(3);
      }
    }
  });

  it('treat every shape as a box in a terminal', () => {
    for (const shape of ['diamond', 'circle', 'stadium', 'hexagon', 'parallelogram'] as const) {
      expect(faceOffsets(shape, 'left', LENGTH, 48, STEP, 1, true)).toEqual(lattice);
    }
  });
});

const ruler = pixelRuler();

function node(l: Layout, id: string): LayoutNode {
  const n = l.nodes.find((q) => q.id === id);
  if (!n) throw new Error(`no node ${id}`);
  return n;
}

function svgPath(svg: string, from: string, to: string): Point[] {
  const m = new RegExp(`<path class="ursula-edge[^"]*"[^>]*data-from="${from}" data-to="${to}" d="([^"]*)"`).exec(svg);
  if (!m) throw new Error(`no path ${from} -> ${to}`);
  const nums = (m[1] as string).match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  const out: Point[] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) out.push({ x: nums[i] as number, y: nums[i + 1] as number });
  out[out.length - 1] = tipOf(m[1] as string);
  return out;
}

/** The line ends stop at the rounded corners, at most 8 in from the corner. */
const near = (p: Point, q: Point): boolean => Math.hypot(p.x - q.x, p.y - q.y) <= 8.5;

describe('edge ends on a diamond with four edges', () => {
  const src = 'flowchart TD\nsubgraph s0\nt[Top] --> d{Check}\nend\nsubgraph s1\na[Alpha]\nend\nsubgraph s2\nb[Beta]\nend\nsubgraph s3\nc[Gamma]\nend\nd --> a\nd --> b\nd --> c';

  it('meet four different corners and leave no shared port', () => {
    const l = layout(parse(src), ruler);
    const svg = renderSvg(l);
    const o = node(l, 'd').outline as NonNullable<LayoutNode['outline']>;
    const corners: Point[] = [
      { x: o.x + o.w / 2, y: o.y },
      { x: o.x + o.w, y: o.y + o.h / 2 },
      { x: o.x + o.w / 2, y: o.y + o.h },
      { x: o.x, y: o.y + o.h / 2 },
    ];
    const ends = [
      (p: Point[]) => p[p.length - 1] as Point,
      (p: Point[]) => p[0] as Point,
      (p: Point[]) => p[0] as Point,
      (p: Point[]) => p[0] as Point,
    ];
    const taken = [svgPath(svg, 't', 'd'), svgPath(svg, 'd', 'a'), svgPath(svg, 'd', 'b'), svgPath(svg, 'd', 'c')].map((p, i) => corners.findIndex((c) => near((ends[i] as (q: Point[]) => Point)(p), c)));
    expect(taken.every((k) => k >= 0)).toBe(true);
    expect(new Set(taken).size).toBe(4);
    expect(l.diagnostics.filter((d) => d.kind === 'shared-port')).toEqual([]);
    expect(geometryViolations(l)).toEqual([]);
  });
});

describe('edge ends on a diamond with five edges', () => {
  it('report a shared port and do not fail', () => {
    const l = layout(parse('flowchart TD\na[One] --> d{Check}\nb[Two] --> d\nd --> c[Three]\nd --> e[Four]\nd --> f[Five]'), ruler);
    const shared = l.diagnostics.filter((d) => d.kind === 'shared-port');
    expect(shared.length).toBeGreaterThanOrEqual(1);
    expect(shared[0]?.nodes).toEqual(['d']);
  });
});

describe('boxes', () => {
  it('draw the same lines as before when every node is a rectangle', () => {
    const l = layout(parse('flowchart LR\na[A] --> b[B]\nb --> c[C]\nb --> d[D]\nd --> a'), ruler);
    expect(l.diagnostics.filter((d) => d.kind === 'shared-port')).toEqual([]);
    expect(geometryViolations(l)).toEqual([]);
  });
});
