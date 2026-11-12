import { describe, expect, it } from 'vitest';
import { cellRuler, layout, parse, pixelRuler } from '../src/index.ts';
import type { Layout, LayoutEdge, LayoutNode, Point } from '../src/index.ts';
import { settleMixedSides } from '../src/layered/vertex.ts';

const ruler = pixelRuler();
const ON = 0.5;

type Face = 'top' | 'bottom' | 'left' | 'right';

const faceAt = (n: LayoutNode, p: Point): Face | undefined => {
  const inX = p.x > n.x - ON && p.x < n.x + n.w + ON;
  const inY = p.y > n.y - ON && p.y < n.y + n.h + ON;
  if (inX && Math.abs(p.y - n.y) < ON) return 'top';
  if (inX && Math.abs(p.y - n.y - n.h) < ON) return 'bottom';
  if (inY && Math.abs(p.x - n.x) < ON) return 'left';
  if (inY && Math.abs(p.x - n.x - n.w) < ON) return 'right';
  return undefined;
};

/** Per node and face: how many edges start there and how many end there (an edge from a node to itself is left out). */
function ends(l: Pick<Layout, 'nodes' | 'edges'>): Map<string, { out: number; into: number }> {
  const out = new Map<string, { out: number; into: number }>();
  const bump = (n: LayoutNode | undefined, p: Point | undefined, key: 'out' | 'into'): void => {
    const face = n && p ? faceAt(n, p) : undefined;
    if (!n || !face) return;
    const at = `${n.id}|${face}`;
    const v = out.get(at) ?? { out: 0, into: 0 };
    v[key]++;
    out.set(at, v);
  };
  for (const e of l.edges) {
    if (e.from === e.to) continue;
    bump(l.nodes.find((n) => n.id === e.from), e.points[0], 'out');
    bump(l.nodes.find((n) => n.id === e.to), e.points[e.points.length - 1], 'into');
  }
  return out;
}

const mixed = (l: Pick<Layout, 'nodes' | 'edges'>): string[] => [...ends(l)].filter(([, v]) => v.out > 0 && v.into > 0).map(([k]) => k);

const swimlane = [
  'swimlane-beta LR',
  '  subgraph Applicant',
  '    apply[Submit application]',
  '    sign[Sign agreement]',
  '  end',
  '  subgraph Reviewer',
  '    screen[Screen application]',
  '    decide{Approved?}',
  '  end',
  '  subgraph System',
  '    create[Create account]',
  '    notify[Send welcome email]',
  '  end',
  '  apply -->|Application received| screen',
  '  screen --> decide',
  '  decide -->|Approved| create --> notify --> sign',
  '  decide -->|Needs changes| apply',
].join('\n');

const box = (id: string, x: number, y: number, w = 160, h = 48, shape: LayoutNode['shape'] = 'rect'): LayoutNode => ({ id, lane: 'l', rank: 0, span: 1, row: 0, x, y, w, h, title: id, lines: [id], shape });
const edge = (from: string, to: string, ...pts: Array<[number, number]>): LayoutEdge => ({ from, to, style: 'normal', points: pts.map(([x, y]) => ({ x, y })) });

describe('an edge end on a face that edges leave', () => {
  it('moves to a free face of the node', () => {
    const l = layout(parse(swimlane), ruler);
    expect(mixed(l)).toEqual([]);
    const back = l.edges.find((e) => e.from === 'decide' && e.to === 'apply') as LayoutEdge;
    const apply = l.nodes.find((n) => n.id === 'apply') as LayoutNode;
    expect(faceAt(apply, back.points[back.points.length - 1] as Point)).toBe('right');
  });

  it('stays when the other three faces all have edges leaving', () => {
    const nodes = [box('b', 200, 200), box('t', 200, 40), box('l', 0, 200), box('r', 400, 200), box('u', 200, 360), box('z', 400, 400)];
    const edges = [
      edge('b', 't', [280, 200], [280, 88]),
      edge('b', 'l', [200, 224], [160, 224]),
      edge('b', 'r', [360, 224], [400, 224]),
      edge('b', 'u', [240, 248], [240, 360]),
      edge('z', 'b', [480, 400], [480, 330], [320, 330], [320, 248]),
    ];
    const before = JSON.stringify(edges);
    const done = settleMixedSides(edges, nodes, ruler, 16);
    expect(done.moved).toBe(0);
    expect(JSON.stringify(edges)).toBe(before);
  });

  it('keeps the one port of a diamond face', () => {
    const d = box('d', 200, 200, 160, 64, 'diamond');
    const nodes = [d, box('a', 200, 40), box('r', 400, 200), box('u', 200, 360), box('z', 0, 360)];
    const edges = [
      edge('a', 'd', [280, 88], [280, 200]),
      edge('r', 'd', [400, 232], [360, 232]),
      edge('d', 'u', [280, 264], [280, 360]),
      edge('z', 'd', [80, 360], [80, 300], [280, 300], [280, 264]),
    ];
    settleMixedSides(edges, nodes, ruler, 16);
    const into = edges[3] as LayoutEdge;
    expect(faceAt(d, into.points[into.points.length - 1] as Point)).toBe('left');
    expect(mixed({ nodes, edges })).toEqual([]);
    for (const [key, v] of ends({ nodes, edges })) if (key.startsWith('d|')) expect(v.out + v.into).toBe(1);
  });

  it('does not put a second end on a diamond face that has one', () => {
    const d = box('d', 200, 200, 160, 64, 'diamond');
    const nodes = [d, box('a', 200, 40), box('l', 0, 200), box('r', 400, 200), box('u', 200, 360), box('z', 400, 400)];
    const edges = [
      edge('a', 'd', [280, 88], [280, 200]),
      edge('l', 'd', [160, 232], [200, 232]),
      edge('r', 'd', [400, 232], [360, 232]),
      edge('d', 'u', [280, 264], [280, 360]),
      edge('z', 'd', [480, 400], [480, 330], [280, 330], [280, 264]),
    ];
    const before = JSON.stringify(edges);
    expect(settleMixedSides(edges, nodes, ruler, 16).moved).toBe(0);
    expect(JSON.stringify(edges)).toBe(before);
  });

  it('is left alone in a terminal drawing', () => {
    const nodes = [box('b', 200, 200), box('t', 200, 40), box('z', 400, 400)];
    const edges = [edge('b', 't', [280, 200], [280, 88]), edge('z', 'b', [480, 400], [480, 330], [320, 330], [320, 248]), edge('b', 'z', [240, 248], [240, 300], [440, 300], [440, 400])];
    const before = JSON.stringify(edges);
    expect(settleMixedSides(edges, nodes, { ...cellRuler(), uniform: true }, 1).moved).toBe(0);
    expect(JSON.stringify(edges)).toBe(before);
  });
});
