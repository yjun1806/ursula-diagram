import { describe, expect, it } from 'vitest';
import { tightPasses } from '../src/layered/clearance.ts';
import type { LayoutEdge, LayoutNode } from '../src/types.ts';

const box = (id: string, x: number, y: number) => ({ id, x, y, w: 100, h: 60 });

describe('tightPasses', () => {
  const nodes = [box('a', 0, 200), box('b', 140, 0), box('c', 140, 200), box('d', 0, 0)];

  it('counts a line that runs along a box it does not end on, nearer than the room it keeps', () => {
    const edges = [{ from: 'a', to: 'd', points: [{ x: 120, y: 260 }, { x: 120, y: 0 }] }];
    expect(tightPasses({ nodes, edges } as never)).toBe(2);
  });

  it('does not count the boxes the line ends on, or a line that keeps its room', () => {
    const edges = [
      { from: 'a', to: 'd', points: [{ x: 50, y: 200 }, { x: 50, y: 60 }] },
      { from: 'a', to: 'd', points: [{ x: 116, y: 300 }, { x: 116, y: 280 }] },
    ];
    expect(tightPasses({ nodes: nodes.map((n) => (n.id === 'b' || n.id === 'c' ? { ...n, x: 200 } : n)), edges } as never)).toBe(0);
  });
});

describe('lines in the outer bands', () => {
  it('stand the room a passing line keeps from the boxes beside them, on both sides', async () => {
    const { layout, pixelRuler } = await import('../src/index.ts');
    const { parseState } = await import('../src/state/parse.ts');
    const l = layout(parseState('stateDiagram-v2\n  [*] --> Still\n  Still --> [*]\n  Still --> Moving\n  Moving --> Still\n  Moving --> Crash\n  Crash --> [*]').graph, pixelRuler(), { legend: false });
    expect(tightPasses(l)).toBe(0);
    const boxes = l.nodes.filter((n) => ['Still', 'Moving', 'Crash'].includes(n.id));
    const left = Math.min(...boxes.map((n) => n.x));
    const right = Math.max(...boxes.map((n) => n.x + n.w));
    const xs = l.edges.flatMap((e) => e.points.map((p) => p.x));
    expect(left - Math.min(...xs)).toBe(24);
    // The line on the right bends into a mark: it stands as far out as the straight piece before a mark is long.
    expect(Math.max(...xs) - right).toBe(32);
  });
});

describe('a line drawn again onto another face of its box', () => {
  // The end on Expired moves off the face Expired's own line leaves from; the line it then takes passed Cancelled 6px
  // and 12px away, and its label touched the box.
  const src = `stateDiagram-v2
  state "Pending" as pending
  state "Earned" as earned
  state "Used" as used
  state "Expired" as expired
  state "Reclaimed" as reclaimed
  state "Cancelled" as cancelled
  [*] --> pending: order confirmed
  pending --> earned: seven days after purchase
  pending --> cancelled: order cancelled
  earned --> used: paid with
  earned --> expired: one year later
  earned --> reclaimed: returned
  used --> [*]
  expired --> [*]
  reclaimed --> [*]
  cancelled --> [*]`;

  it('keeps the room of a passing line from the boxes it passes, and its label off them', async () => {
    const { layout, pixelRuler } = await import('../src/index.ts');
    const { parseState } = await import('../src/state/parse.ts');
    const l = layout(parseState(src).graph, pixelRuler(), { legend: false });
    const edge = l.edges.find((e) => e.from === 'earned' && e.to === 'expired');
    expect(edge).toBeDefined();
    expect(tightPasses({ nodes: l.nodes, edges: [edge as LayoutEdge] })).toBe(0);
    const label = edge?.label as NonNullable<LayoutEdge['label']>;
    const cancelled = l.nodes.find((n) => n.id === 'cancelled') as LayoutNode;
    const gap = Math.max(cancelled.x - (label.x + label.w), label.x - (cancelled.x + cancelled.w), cancelled.y - (label.y + label.h), label.y - (cancelled.y + cancelled.h));
    expect(gap).toBeGreaterThanOrEqual(8);
  });
});
