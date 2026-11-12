// choose.ts as it was before the segments were built once per drawing; kept as it was.
import type { Layout, LayoutEdge } from '../src/types.ts';
import type { Fold } from '../src/layered/rows.ts';
import { directionsOf, mixedSideEnds } from './sides-old.ts';
import { mirroredEdges } from '../src/layered/choose.ts';
import { unzoned } from '../src/layered/composition.ts';

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
  /** How flows inside a lane are laid over rows. */
  fold: Fold;
}

export const CANDIDATES: readonly Variant[] = [
  { name: 'forced', free: false, loose: false, stage: false, start: true, fold: 'flat' },
  { name: 'free', free: true, loose: false, stage: false, start: true, fold: 'flat' },
  { name: 'stage', free: false, loose: false, stage: true, start: true, fold: 'flat' },
  { name: 'loose', free: true, loose: true, stage: false, start: true, fold: 'flat' },
  { name: 'forced-unheld', free: false, loose: false, stage: false, start: false, fold: 'flat' },
  { name: 'free-unheld', free: true, loose: false, stage: false, start: false, fold: 'flat' },
];

/** The two candidates drawn again with the flow of a lane folded by its head, and by its head and tail. */
export const FOLDED: readonly Variant[] = [
  { name: 'forced-head', free: false, loose: false, stage: false, start: true, fold: 'head' },
  { name: 'forced-head-tail', free: false, loose: false, stage: false, start: true, fold: 'headTail' },
  { name: 'free-head', free: true, loose: false, stage: false, start: true, fold: 'head' },
  { name: 'free-head-tail', free: true, loose: false, stage: false, start: true, fold: 'headTail' },
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
export const WEIGHTS = { bend: 1, bendMain: 3, crossing: 2, crossingMain: 5, extraRow: 2, back: 2, backChain: 2, far: 1, start: 2, branch: 2, upward: 100, secondRow: 1, tight: 3, labelTight: 2, offCentre: 3, mixedSide: 3, heavyBack: 1 } as const;

const properCross = (a: Seg, b: Seg): boolean => {
  const ah = Math.abs(a.ay - a.by) < EPS;
  const bh = Math.abs(b.ay - b.by) < EPS;
  if (ah === bh) return false;
  const [h, v] = ah ? [a, b] : [b, a];
  return v.ax > Math.min(h.ax, h.bx) + EPS && v.ax < Math.max(h.ax, h.bx) - EPS && h.ay > Math.min(v.ay, v.by) + EPS && h.ay < Math.max(v.ay, v.by) - EPS;
};

/** Crossings between edges, counted on the finished segments: [on the main flow, elsewhere]. */
export function crossingsOf(l: Layout): [number, number] {
  const all = l.edges.map(segments);
  const box = all.map((segs) => ({ x0: Math.min(...segs.map((s) => Math.min(s.ax, s.bx))), x1: Math.max(...segs.map((s) => Math.max(s.ax, s.bx))), y0: Math.min(...segs.map((s) => Math.min(s.ay, s.by))), y1: Math.max(...segs.map((s) => Math.max(s.ay, s.by))) }));
  let onMain = 0;
  let other = 0;
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const a = box[i];
      const b = box[j];
      if (a && b && (a.x1 < b.x0 || b.x1 < a.x0 || a.y1 < b.y0 || b.y1 < a.y0)) continue;
      let n = 0;
      for (const s of all[i] as Seg[]) for (const t of all[j] as Seg[]) if (properCross(s, t)) n++;
      if (l.edges[i]?.main || l.edges[j]?.main) onMain += n;
      else other += n;
    }
  }
  return [onMain, other];
}

/**
 * Nodes with two or more partners in one neighbouring layer (going out or coming in, counted apart) that do not
 * stand in the middle of them: within half a slot unit of the midpoint of the first and last partner, or exactly
 * in line with the middle partner when the partners are odd in number. Gives the node and the midpoint wanted.
 */
export function offCentre(l: Layout): Array<{ id: string; mid: number }> {
  if (!l.pitch || l.pitch <= 0) return [];
  const reading = l.direction === 'TD' ? 'y' : 'x';
  const across = l.direction === 'TD' ? 'x' : 'y';
  const sizeOf = (n: Layout['nodes'][number], axis: 'x' | 'y'): number => (axis === 'x' ? n.w : n.h);
  // Layers run along the axis across the reading direction for lanes, and along the reading direction for stages.
  const layerAxis = l.composition === 'stages' ? reading : across;
  const spreadAxis = layerAxis === 'x' ? 'y' : 'x';
  const key = (n: Layout['nodes'][number]): number => Math.round(n[layerAxis] * 100) / 100;
  const layers = [...new Set(l.nodes.map(key))].sort((a, b) => a - b);
  const byId = new Map(l.nodes.map((n) => [n.id, n] as const));
  const centre = (n: Layout['nodes'][number]): number => n[spreadAxis] + sizeOf(n, spreadAxis) / 2;
  const groups = new Map<string, { id: string; partners: string[] }>();
  for (const e of l.edges) {
    const a = byId.get(e.from);
    const b = byId.get(e.to);
    if (!a || !b || a === b) continue;
    const gap = layers.indexOf(key(b)) - layers.indexOf(key(a));
    if (Math.abs(gap) !== 1) continue;
    for (const [node, other, out] of [[a, b, true], [b, a, false]] as const) {
      const k = `${node.id}|${out}|${layers.indexOf(key(other))}`;
      const g = groups.get(k) ?? { id: node.id, partners: [] };
      g.partners.push(other.id);
      groups.set(k, g);
    }
  }
  const found: Array<{ id: string; mid: number }> = [];
  for (const g of groups.values()) {
    const partners = [...new Set(g.partners)].map((id) => byId.get(id)).filter((n): n is Layout['nodes'][number] => n !== undefined);
    if (partners.length < 2) continue;
    const mine = byId.get(g.id);
    if (!mine) continue;
    const cs = partners.map(centre).sort((x, y) => x - y);
    const mid = ((cs[0] as number) + (cs[cs.length - 1] as number)) / 2;
    const odd = cs.length % 2 === 1 && Math.abs(centre(mine) - (cs[(cs.length - 1) / 2] as number)) < 0.5;
    if (!odd && Math.abs(centre(mine) - mid) > l.pitch / 4 + EPS) found.push({ id: g.id, mid });
  }
  return found;
}

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
  const across = l.direction === 'TD' ? 'x' : 'y';
  const byId = new Map(l.nodes.map((n) => [n.id, n] as const));
  let bends = 0;
  let folded = 0;
  let length = 0;
  const against: Array<[string, string]> = [];
  // Mirror pairs are charged for one edge (`mirroredEdges`, new since the rewrite and shared with choose.ts).
  const bendCost = (e: LayoutEdge): number => (e.main ? WEIGHTS.bendMain : WEIGHTS.bend) * Math.max(0, e.points.length - 2);
  const mirrored = mirroredEdges(l, bendCost);
  for (const [i, e] of l.edges.entries()) {
    if (!mirrored.has(i)) bends += bendCost(e);
    const first = e.points[0];
    const last = e.points[e.points.length - 1];
    // Against the reading direction along the axis, or, inside one lane, from a lower row up to a higher one.
    const from = byId.get(e.from);
    const to = byId.get(e.to);
    const upward = l.composition !== 'stages' && l.direction !== 'TD' && from !== undefined && to !== undefined && from !== to && from.lane === to.lane && to[across] < from[across] - 0.5;
    if (first && last && last[axis] < first[axis] - 8) against.push([e.from, e.to]);
    if (upward) folded++;
    for (const s of segments(e)) length += Math.abs(s.bx - s.ax) + Math.abs(s.by - s.ay);
  }
  // An edge against the reading direction that leaves a node that sends out two more edges than it takes in, or enters
  // one that takes in two more than it sends out, counts once more.
  const balance = new Map<string, number>();
  for (const e of l.edges) {
    balance.set(e.from, (balance.get(e.from) ?? 0) + 1);
    balance.set(e.to, (balance.get(e.to) ?? 0) - 1);
  }
  const heavyAgainst = against.filter(([from, to]) => (balance.get(from) ?? 0) >= 2 || (balance.get(to) ?? 0) <= -2).length;
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
  // Pixels: the second row of a lane is cheap, the third and further ones cost as before; a gap closed below the default and a label that shows too little line cost as well.
  const pixels = l.gapDefault !== undefined;
  // Without zones the rows of the one implicit zone are the places side by side of a stage: they cost nothing.
  const rowCost = pixels && unzoned(l) ? 0 : pixels ? [...rows.values()].reduce((sum, r) => sum + WEIGHTS.secondRow * (r >= 2 ? 1 : 0) + WEIGHTS.extraRow * Math.max(0, r - 2), 0) : WEIGHTS.extraRow * extra;
  const tightCost = pixels ? WEIGHTS.tight * (l.gap !== undefined && l.gap < (l.gapDefault ?? 0) ? 1 : 0) + WEIGHTS.labelTight * l.diagnostics.filter((d) => d.kind === 'label-tight').length + WEIGHTS.offCentre * l.diagnostics.filter((d) => d.kind === 'off-centre').length : 0;
  const [crossMain, crossOther] = crossingsOf(l);
  const cost =
    bends +
    WEIGHTS.crossingMain * crossMain +
    WEIGHTS.crossing * crossOther +
    rowCost +
    tightCost +
    WEIGHTS.upward * folded +
    WEIGHTS.back * against.length +
    WEIGHTS.heavyBack * heavyAgainst +
    WEIGHTS.backChain * chained +
    WEIGHTS.far * farness(l) +
    WEIGHTS.start * startMissed(l) +
    WEIGHTS.mixedSide * mixedSideEnds(l, directionsOf(l)).length +
    WEIGHTS.branch * offCentre(l).length;
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
