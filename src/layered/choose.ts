import type { Layout, LayoutEdge } from '../types.ts';

/**
 * One way to draw the same graph. Candidates are drawn to the end and the finished drawings are measured, so a
 * new candidate only has to be added to `CANDIDATES`, and a new quality only to `score`.
 */
export interface Variant {
  name: string;
  /** Flat edges outside the main flow need not run from left to right: they follow the place of their partners. */
  free: boolean;
  /** Nodes are ordered by their stage in the whole flow first, and only nodes of one stage by crossings. */
  stage: boolean;
}

export const CANDIDATES: readonly Variant[] = [
  { name: 'forced', free: false, stage: false },
  { name: 'free', free: true, stage: false },
  { name: 'stage', free: false, stage: true },
];

const EPS = 1e-6;

interface Seg {
  ax: number;
  ay: number;
  bx: number;
  by: number;
}

const segments = (e: LayoutEdge): Seg[] => e.points.slice(1).map((q, i) => ({ ax: (e.points[i] as { x: number }).x, ay: (e.points[i] as { y: number }).y, bx: q.x, by: q.y }));

const inside = (s: Seg, r: { x: number; y: number; w: number; h: number }): boolean =>
  Math.min(s.ax, s.bx) < r.x + r.w - EPS && Math.max(s.ax, s.bx) > r.x + EPS && Math.min(s.ay, s.by) < r.y + r.h - EPS && Math.max(s.ay, s.by) > r.y + EPS;

function overlap(s: Seg, t: Seg): boolean {
  const sh = Math.abs(s.ay - s.by) < EPS;
  const th = Math.abs(t.ay - t.by) < EPS;
  if (sh !== th) return false;
  if (sh) return Math.abs(s.ay - t.ay) < EPS && Math.min(Math.max(s.ax, s.bx), Math.max(t.ax, t.bx)) - Math.max(Math.min(s.ax, s.bx), Math.min(t.ax, t.bx)) > EPS;
  return Math.abs(s.ax - t.ax) < EPS && Math.min(Math.max(s.ay, s.by), Math.max(t.ay, t.by)) - Math.max(Math.min(s.ay, s.by), Math.min(t.ay, t.by)) > EPS;
}

/** Things that make a drawing invalid: boxes that touch, lines through boxes, lines that share a stretch, diagonals, labels on boxes, anything outside. */
export function violations(l: Layout): number {
  let n = 0;
  l.nodes.forEach((a, i) => {
    if (a.x < -EPS || a.y < -EPS || a.x + a.w > l.width + EPS || a.y + a.h > l.height + EPS) n++;
    for (const b of l.nodes.slice(i + 1)) if (a.x < b.x + b.w - EPS && b.x < a.x + a.w - EPS && a.y < b.y + b.h - EPS && b.y < a.y + a.h - EPS) n++;
  });
  for (const e of l.edges) {
    const t = e.label;
    if (!t) continue;
    if (t.x < -EPS || t.y < -EPS || t.x + t.w > l.width + EPS || t.y + t.h > l.height + EPS) n++;
    for (const b of l.nodes) if (t.x < b.x + b.w - EPS && b.x < t.x + t.w - EPS && t.y < b.y + b.h - EPS && b.y < t.y + t.h - EPS) n++;
  }
  const all = l.edges.map(segments);
  all.forEach((segs, i) => {
    for (const s of segs) {
      if (Math.abs(s.ax - s.bx) > EPS && Math.abs(s.ay - s.by) > EPS) n++;
      for (const b of l.nodes) if (inside(s, b)) n++;
      for (const other of all.slice(i + 1)) for (const t of other) if (overlap(s, t)) n++;
    }
  });
  return n;
}

/** Quality of a finished drawing, from its coordinates: smaller is better, compared left to right. */
export function score(l: Layout): number[] {
  const axis = l.direction === 'TD' ? 'y' : 'x';
  let bends = 0;
  let back = 0;
  let length = 0;
  for (const e of l.edges) {
    bends += Math.max(0, e.points.length - 2);
    const first = e.points[0];
    const last = e.points[e.points.length - 1];
    if (first && last && last[axis] < first[axis] - 8) back++;
    for (const s of segments(e)) length += Math.abs(s.bx - s.ax) + Math.abs(s.by - s.ay);
  }
  return [violations(l) + l.diagnostics.filter((d) => d.kind === 'overflow').length, l.diagnostics.filter((d) => d.kind === 'crossing').length, bends, back, Math.round(length)];
}

/** The best drawing; the earliest wins a tie, so the first candidate is the default. */
export function pickBest(drawings: Layout[]): Layout {
  let best = drawings[0] as Layout;
  let bestScore = score(best);
  for (const d of drawings.slice(1)) {
    const s = score(d);
    for (let i = 0; i < s.length; i++) {
      if (s[i] === bestScore[i]) continue;
      if ((s[i] as number) < (bestScore[i] as number)) {
        best = d;
        bestScore = s;
      }
      break;
    }
  }
  return best;
}
