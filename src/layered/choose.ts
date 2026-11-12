import type { Layout, LayoutEdge } from '../types.ts';

/**
 * One way to draw the same graph. Candidates are drawn to the end and the finished drawings are measured, so a
 * new candidate only has to be added to `CANDIDATES`, and a new quality only to `score`.
 */
export interface Variant {
  name: string;
  /** Flat edges outside the main flow need not run from left to right: they follow the place of their partners. */
  free: boolean;
  /** No flat edge, not even on the main flow, is forced to run from left to right. */
  loose: boolean;
  /** Nodes are ordered by their stage in the whole flow first, and only nodes of one stage by crossings. */
  stage: boolean;
  /** The node the text starts from is held first in its layer. */
  start: boolean;
}

export const CANDIDATES: readonly Variant[] = [
  { name: 'forced', free: false, loose: false, stage: false, start: true },
  { name: 'free', free: true, loose: false, stage: false, start: true },
  { name: 'stage', free: false, loose: false, stage: true, start: true },
  { name: 'loose', free: true, loose: true, stage: false, start: true },
  { name: 'forced-unheld', free: false, loose: false, stage: false, start: false },
  { name: 'free-unheld', free: true, loose: false, stage: false, start: false },
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

/** What a drawing pays, in bends: a crossing costs several, then each extra row, each edge against the reading direction, and more for a whole chain of them. */
export const WEIGHTS = { crossing: 3, extraRow: 2, back: 1, backChain: 2, far: 1, start: 2 } as const;

/** Places an edge leaves out between its two boxes, in columns (a box and a gap) and in rows; neighbours and the same place count nothing. */
export function farness(l: Layout): number {
  if (l.composition === 'stages' || !l.pitch || l.pitch <= 0) return 0;
  const reading = l.direction === 'TD' ? 'y' : 'x';
  const across = l.direction === 'TD' ? 'x' : 'y';
  const size = l.direction === 'TD' ? 'h' : 'w';
  const other = l.direction === 'TD' ? 'w' : 'h';
  const rows = [...new Set(l.nodes.map((n) => Math.round(n[across] * 100) / 100))].sort((a, b) => a - b);
  const byId = new Map(l.nodes.map((n) => [n.id, n] as const));
  let total = 0;
  for (const e of l.edges) {
    const a = byId.get(e.from);
    const b = byId.get(e.to);
    if (!a || !b || a === b) continue;
    const gap = Math.max(0, Math.max(a[reading], b[reading]) - Math.min(a[reading] + a[size], b[reading] + b[size]));
    const between = Math.abs(rows.indexOf(Math.round(a[across] * 100) / 100) - rows.indexOf(Math.round(b[across] * 100) / 100)) - 1;
    total += Math.floor(gap / l.pitch + 1e-6) + Math.max(0, between);
  }
  void other;
  return total;
}

/** How far the first node of the text stands from where reading begins: the columns before it, and one more outside the first row of its lane. */
export function startMissed(l: Layout): number {
  const first = l.edges[0]?.from;
  const start = l.nodes.find((n) => n.id === first);
  if (!start || l.composition === 'stages') return 0;
  const axis = l.direction === 'TD' ? 'y' : 'x';
  const before = new Set(l.nodes.filter((n) => n[axis] < start[axis] - 1e-6).map((n) => Math.round(n[axis])));
  return before.size + (start.row !== 0 ? 1 : 0);
}

/** Quality of a finished drawing, from its coordinates: [invalid things, cost, edge length]; smaller is better, compared left to right. */
export function score(l: Layout): number[] {
  const axis = l.direction === 'TD' ? 'y' : 'x';
  let bends = 0;
  let length = 0;
  const against: Array<[string, string]> = [];
  for (const e of l.edges) {
    bends += Math.max(0, e.points.length - 2);
    const first = e.points[0];
    const last = e.points[e.points.length - 1];
    if (first && last && last[axis] < first[axis] - 8) against.push([e.from, e.to]);
    for (const s of segments(e)) length += Math.abs(s.bx - s.ax) + Math.abs(s.by - s.ay);
  }
  // Edges against the reading direction that touch one another form a stream running backwards.
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let r = x;
    while ((parent.get(r) ?? r) !== r) r = parent.get(r) ?? r;
    return r;
  };
  for (const [a, b] of against) parent.set(find(a), find(b));
  const size = new Map<string, number>();
  for (const [a] of against) size.set(find(a), (size.get(find(a)) ?? 0) + 1);
  const chained = against.filter(([a]) => (size.get(find(a)) ?? 0) >= 2).length;
  const rows = new Map<string, number>();
  for (const n of l.nodes) rows.set(n.lane, Math.max(rows.get(n.lane) ?? 0, n.row + 1));
  const extra = [...rows.values()].reduce((sum, r) => sum + r - 1, 0);
  const crossings = l.diagnostics.filter((d) => d.kind === 'crossing').length;
  const cost = bends + WEIGHTS.crossing * crossings + WEIGHTS.extraRow * extra + WEIGHTS.back * against.length + WEIGHTS.backChain * chained + WEIGHTS.far * farness(l) + WEIGHTS.start * startMissed(l);
  return [violations(l) + l.diagnostics.filter((d) => d.kind === 'overflow').length, cost, Math.round(length)];
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
