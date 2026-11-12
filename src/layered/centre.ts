import type { Diagnostic, Layout } from '../types.ts';

const EPS = 1;

const SIDES = ['top', 'bottom', 'left', 'right'] as const;

/**
 * Edge ends that stand alone on a side of their box but not at the centre of that side (pixels): one diagnostic
 * for each. A side that several edges end on is spread, and is not looked at.
 */
export function offCentreEnds(l: Pick<Layout, 'nodes' | 'edges'>): Diagnostic[] {
  const nodeAt = new Map(l.nodes.map((n, i) => [n.id, i] as const));
  // Per side of a node (in the order first met): how many edge ends stand on it, and the first one's distance from the centre.
  const groupAt = new Int32Array(l.nodes.length * SIDES.length).fill(-1);
  const sides: Array<{ node: number; side: string; count: number; off: number; edge: number }> = [];
  l.edges.forEach((e, i) => {
    for (const [id, p] of [[e.from, e.points[0]], [e.to, e.points[e.points.length - 1]]] as const) {
      const at = nodeAt.get(id);
      if (at === undefined || !p) continue;
      const n = l.nodes[at] as Layout['nodes'][number];
      const side = Math.abs(p.y - n.y) < EPS ? 'top' : Math.abs(p.y - n.y - n.h) < EPS ? 'bottom' : Math.abs(p.x - n.x) < EPS ? 'left' : 'right';
      const off = side === 'top' || side === 'bottom' ? Math.abs(p.x - (n.x + n.w / 2)) : Math.abs(p.y - (n.y + n.h / 2));
      const k = at * SIDES.length + SIDES.indexOf(side);
      const g = groupAt[k] as number;
      if (g < 0) {
        groupAt[k] = sides.length;
        sides.push({ node: at, side, count: 1, off, edge: i });
      } else (sides[g] as { count: number }).count++;
    }
  });
  const out: Diagnostic[] = [];
  for (const { node, side, count, off, edge } of sides) {
    if (count !== 1 || off <= EPS) continue;
    const id = (l.nodes[node] as Layout['nodes'][number]).id;
    const e = l.edges[edge] as Layout['edges'][number];
    out.push({ kind: 'off-centre', nodes: [id], message: `The only edge on the ${side} of ${id} (${e.from} -> ${e.to}) ends ${Math.round(off)}px from the centre.` });
  }
  return out;
}
