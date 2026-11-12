import type { Layout } from '../types.ts';

/** Room a line keeps from a box it passes without ending on it (pixels). */
export const PASS_CLEAR = 24;

/**
 * Pieces of edges that run along a side of a box they do not end on, nearer than the room a passing line keeps:
 * the number of such piece-and-box pairs.
 */
export function tightPasses(l: Pick<Layout, 'nodes' | 'edges'>): number {
  let count = 0;
  for (const e of l.edges) {
    for (let i = 0; i + 1 < e.points.length; i++) {
      const a = e.points[i] as { x: number; y: number };
      const b = e.points[i + 1] as { x: number; y: number };
      const vertical = Math.abs(a.x - b.x) < 0.5;
      if (!vertical && Math.abs(a.y - b.y) >= 0.5) continue;
      for (const n of l.nodes) {
        if (n.id === e.from || n.id === e.to) continue;
        if (vertical) {
          const along = Math.min(Math.max(a.y, b.y), n.y + n.h) - Math.max(Math.min(a.y, b.y), n.y);
          const away = Math.max(n.x - a.x, a.x - (n.x + n.w));
          if (along > 0 && away >= 0 && away < PASS_CLEAR - 0.5) count++;
        } else {
          const along = Math.min(Math.max(a.x, b.x), n.x + n.w) - Math.max(Math.min(a.x, b.x), n.x);
          const away = Math.max(n.y - a.y, a.y - (n.y + n.h));
          if (along > 0 && away >= 0 && away < PASS_CLEAR - 0.5) count++;
        }
      }
    }
  }
  return count;
}
