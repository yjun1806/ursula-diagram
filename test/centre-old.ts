// centre.ts as it was before the rewrite on indexes; kept as it was.
import type { Diagnostic, Layout } from '../src/types.ts';

const EPS = 1;

/**
 * Edge ends that stand alone on a side of their box but not at the centre of that side (pixels): one diagnostic
 * for each. A side that several edges end on is spread, and is not looked at.
 */
export function offCentreEnds(l: Pick<Layout, 'nodes' | 'edges'>): Diagnostic[] {
  const byId = new Map(l.nodes.map((n) => [n.id, n] as const));
  const sides = new Map<string, Array<{ off: number; edge: string }>>();
  l.edges.forEach((e, i) => {
    for (const [id, p] of [[e.from, e.points[0]], [e.to, e.points[e.points.length - 1]]] as const) {
      const n = byId.get(id);
      if (!n || !p) continue;
      const side = Math.abs(p.y - n.y) < EPS ? 'top' : Math.abs(p.y - n.y - n.h) < EPS ? 'bottom' : Math.abs(p.x - n.x) < EPS ? 'left' : 'right';
      const off = side === 'top' || side === 'bottom' ? Math.abs(p.x - (n.x + n.w / 2)) : Math.abs(p.y - (n.y + n.h / 2));
      const key = `${id}|${side}`;
      sides.set(key, [...(sides.get(key) ?? []), { off, edge: `${e.from} -> ${e.to}#${i}` }]);
    }
  });
  const out: Diagnostic[] = [];
  for (const [key, ends] of sides) {
    const only = ends.length === 1 ? ends[0] : undefined;
    if (!only || only.off <= EPS) continue;
    const [id, side] = key.split('|') as [string, string];
    out.push({ kind: 'off-centre', nodes: [id], message: `The only edge on the ${side} of ${id} (${only.edge.replace(/#\d+$/, '')}) ends ${Math.round(only.off)}px from the centre.` });
  }
  return out;
}
