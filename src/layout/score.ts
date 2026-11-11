import type { Layout } from '../types.ts';
import { crossingCount } from './check.ts';

/** Weights of the score that picks between the two lane arrangements; lower is better. */
const WEIGHT = { crossing: 1000, detour: 200, labelOverlap: 100, bend: 10, nonStraight: 1, length: 0.001, overflow: 50 };

export function arrangementScore(layout: Layout, maxWidth: number | undefined): number {
  const count = (kind: string): number => layout.diagnostics.filter((d) => d.kind === kind).length;
  let bends = 0;
  let bent = 0;
  let length = 0;
  for (const e of layout.edges) {
    const corners = Math.max(0, e.points.length - 2);
    bends += corners;
    if (corners > 0) bent++;
    for (let i = 0; i + 1 < e.points.length; i++) {
      const p = e.points[i];
      const q = e.points[i + 1];
      if (p && q) length += Math.abs(p.x - q.x) + Math.abs(p.y - q.y);
    }
  }
  const wide = maxWidth !== undefined && Number.isFinite(maxWidth) && layout.width > maxWidth ? 1 : 0;
  return (
    WEIGHT.crossing * crossingCount(layout.edges) +
    WEIGHT.detour * count('detour') +
    WEIGHT.labelOverlap * count('label-overlap') +
    WEIGHT.bend * bends +
    WEIGHT.nonStraight * bent +
    WEIGHT.length * length +
    WEIGHT.overflow * wide
  );
}
