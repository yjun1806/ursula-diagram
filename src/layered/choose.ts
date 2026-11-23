import type { Diagnostic, Layout, LayoutEdge, LayoutNode, Point } from '../types.ts';
import type { Fold } from './rows.ts';
import { unzoned } from './composition.ts';
import { directionsOf, mixedSideEnds, sideOfPoint } from './sides.ts';

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

/**
 * The segments of every edge of a drawing in one array, eight numbers each: the two ends (ax, ay, bx, by), then the
 * lowest and the highest x and y. A segment is horizontal when its two ends are within `EPS` in y; everything else
 * (diagonals too) is kept with the vertical ones and read by its first end.
 */
interface Segs {
  v: Float64Array;
  /** The segments of edge i are `at[i]` up to `at[i + 1]`. */
  at: Int32Array;
  horizontal: number[][];
  vertical: number[][];
  /** Per edge: lowest and highest x and y over its segments; an edge without segments has the empty box (Infinity, -Infinity). */
  box: Float64Array;
}

function segsOf(l: Pick<Layout, 'edges'>): Segs {
  let total = 0;
  for (const e of l.edges) total += Math.max(0, e.points.length - 1);
  const v = new Float64Array(total * 8);
  const at = new Int32Array(l.edges.length + 1);
  const box = new Float64Array(l.edges.length * 4);
  const horizontal: number[][] = [];
  const vertical: number[][] = [];
  let k = 0;
  l.edges.forEach((e, i) => {
    at[i] = k;
    const hs: number[] = [];
    const vs: number[] = [];
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    for (let q = 1; q < e.points.length; q++) {
      const a = e.points[q - 1] as { x: number; y: number };
      const b = e.points[q] as { x: number; y: number };
      const o = k * 8;
      v[o] = a.x;
      v[o + 1] = a.y;
      v[o + 2] = b.x;
      v[o + 3] = b.y;
      v[o + 4] = Math.min(a.x, b.x);
      v[o + 5] = Math.max(a.x, b.x);
      v[o + 6] = Math.min(a.y, b.y);
      v[o + 7] = Math.max(a.y, b.y);
      x0 = Math.min(x0, v[o + 4] as number);
      x1 = Math.max(x1, v[o + 5] as number);
      y0 = Math.min(y0, v[o + 6] as number);
      y1 = Math.max(y1, v[o + 7] as number);
      (Math.abs(a.y - b.y) < EPS ? hs : vs).push(k);
      k++;
    }
    box[4 * i] = x0;
    box[4 * i + 1] = x1;
    box[4 * i + 2] = y0;
    box[4 * i + 3] = y1;
    horizontal.push(hs);
    vertical.push(vs);
  });
  at[l.edges.length] = k;
  return { v, at, horizontal, vertical, box };
}

/** Things that make a drawing invalid: boxes that touch, lines through boxes, lines that share a stretch, diagonals, labels on boxes, anything outside. */
export function violations(l: Layout): number {
  return violationsOf(l, segsOf(l));
}

function violationsOf(l: Layout, g: Segs): number {
  let n = 0;
  const nodes = l.nodes;
  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i] as Layout['nodes'][number];
    if (a.x < -EPS || a.y < -EPS || a.x + a.w > l.width + EPS || a.y + a.h > l.height + EPS) n++;
    for (let j = i + 1; j < nodes.length; j++) {
      const b = nodes[j] as Layout['nodes'][number];
      if (a.x < b.x + b.w - EPS && b.x < a.x + a.w - EPS && a.y < b.y + b.h - EPS && b.y < a.y + a.h - EPS) n++;
    }
  }
  for (const e of l.edges) {
    const t = e.label;
    if (!t) continue;
    if (t.x < -EPS || t.y < -EPS || t.x + t.w > l.width + EPS || t.y + t.h > l.height + EPS) n++;
    for (const b of nodes) if (t.x < b.x + b.w - EPS && b.x < t.x + t.w - EPS && t.y < b.y + b.h - EPS && b.y < t.y + t.h - EPS) n++;
  }
  const S = g.v;
  const nx0 = nodes.map((b) => b.x + EPS);
  const nx1 = nodes.map((b) => b.x + b.w - EPS);
  const ny0 = nodes.map((b) => b.y + EPS);
  const ny1 = nodes.map((b) => b.y + b.h - EPS);
  const m = l.edges.length;
  for (let i = 0; i < m; i++) {
    for (let s = g.at[i] as number; s < (g.at[i + 1] as number); s++) {
      const o = s * 8;
      if (Math.abs((S[o] as number) - (S[o + 2] as number)) > EPS && Math.abs((S[o + 1] as number) - (S[o + 3] as number)) > EPS) n++;
      for (let b = 0; b < nodes.length; b++) {
        if ((S[o + 4] as number) < (nx1[b] as number) && (S[o + 5] as number) > (nx0[b] as number) && (S[o + 6] as number) < (ny1[b] as number) && (S[o + 7] as number) > (ny0[b] as number)) n++;
      }
    }
  }
  // Two segments share a stretch when both are horizontal or both are not, they lie on one line and their spans overlap.
  const apart = 2 * EPS;
  for (let i = 0; i < m; i++) {
    for (let j = i + 1; j < m; j++) {
      if ((g.box[4 * i + 1] as number) + apart < (g.box[4 * j] as number) || (g.box[4 * j + 1] as number) + apart < (g.box[4 * i] as number)) continue;
      if ((g.box[4 * i + 3] as number) + apart < (g.box[4 * j + 2] as number) || (g.box[4 * j + 3] as number) + apart < (g.box[4 * i + 2] as number)) continue;
      for (const s of g.horizontal[i] as number[]) {
        for (const t of g.horizontal[j] as number[]) {
          if (Math.abs((S[s * 8 + 1] as number) - (S[t * 8 + 1] as number)) < EPS && Math.min(S[s * 8 + 5] as number, S[t * 8 + 5] as number) - Math.max(S[s * 8 + 4] as number, S[t * 8 + 4] as number) > EPS) n++;
        }
      }
      for (const s of g.vertical[i] as number[]) {
        for (const t of g.vertical[j] as number[]) {
          if (Math.abs((S[s * 8] as number) - (S[t * 8] as number)) < EPS && Math.min(S[s * 8 + 7] as number, S[t * 8 + 7] as number) - Math.max(S[s * 8 + 6] as number, S[t * 8 + 6] as number) > EPS) n++;
        }
      }
    }
  }
  return n;
}

/** What a drawing pays, in bends: a crossing costs several, then each extra row, each edge against the reading direction, and more for a whole chain of them. */
export const WEIGHTS = { bend: 1, bendMain: 3, crossing: 2, crossingMain: 5, extraRow: 2, back: 2, backChain: 2, far: 1, start: 2, branch: 2, upward: 100, secondRow: 1, tight: 3, labelTight: 2, offCentre: 3, mixedSide: 3, heavyBack: 1 } as const;

/** Whether horizontal segment `h` and vertical segment `v` (indices into `S`) cross inside both of them. */
const crosses = (S: Float64Array, h: number, v: number): boolean =>
  (S[v * 8] as number) > (S[h * 8 + 4] as number) + EPS && (S[v * 8] as number) < (S[h * 8 + 5] as number) - EPS && (S[h * 8 + 1] as number) > (S[v * 8 + 6] as number) + EPS && (S[h * 8 + 1] as number) < (S[v * 8 + 7] as number) - EPS;

/** Crossings between edges, counted on the finished segments: [on the main flow, elsewhere]. */
export function crossingsOf(l: Layout): [number, number] {
  return crossingsFrom(l, segsOf(l));
}

function crossingsFrom(l: Layout, g: Segs): [number, number] {
  const S = g.v;
  let onMain = 0;
  let other = 0;
  const m = l.edges.length;
  for (let i = 0; i < m; i++) {
    for (let j = i + 1; j < m; j++) {
      if ((g.box[4 * i + 1] as number) < (g.box[4 * j] as number) || (g.box[4 * j + 1] as number) < (g.box[4 * i] as number) || (g.box[4 * i + 3] as number) < (g.box[4 * j + 2] as number) || (g.box[4 * j + 3] as number) < (g.box[4 * i + 2] as number)) continue;
      let n = 0;
      for (const h of g.horizontal[i] as number[]) for (const v of g.vertical[j] as number[]) if (crosses(S, h, v)) n++;
      for (const v of g.vertical[i] as number[]) for (const h of g.horizontal[j] as number[]) if (crosses(S, h, v)) n++;
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
  const layers: number[] = [];
  for (const n of l.nodes) {
    const k = key(n);
    if (!layers.includes(k)) layers.push(k);
  }
  layers.sort((a, b) => a - b);
  const nodeAt = new Map(l.nodes.map((n, i) => [n.id, i] as const));
  const layerOf = l.nodes.map((n) => layers.indexOf(key(n)));
  const byId = new Map(l.nodes.map((n) => [n.id, n] as const));
  const centre = (n: Layout['nodes'][number]): number => n[spreadAxis] + sizeOf(n, spreadAxis) / 2;
  // Groups in the order they are first met: a node, a way (out or in) and the layer the partner stands in.
  const groupAt = new Int32Array(l.nodes.length * 2 * layers.length).fill(-1);
  const groups: Array<{ id: string; partners: string[] }> = [];
  for (const e of l.edges) {
    const a = nodeAt.get(e.from);
    const b = nodeAt.get(e.to);
    if (a === undefined || b === undefined || a === b) continue;
    if (Math.abs((layerOf[b] as number) - (layerOf[a] as number)) !== 1) continue;
    for (const [node, other, out] of [[a, b, 0], [b, a, 1]] as const) {
      const k = (node * 2 + out) * layers.length + (layerOf[other] as number);
      let at = groupAt[k] as number;
      if (at < 0) {
        at = groupAt[k] = groups.length;
        groups.push({ id: (l.nodes[node] as Layout['nodes'][number]).id, partners: [] });
      }
      (groups[at] as { partners: string[] }).partners.push((l.nodes[other] as Layout['nodes'][number]).id);
    }
  }
  const found: Array<{ id: string; mid: number }> = [];
  for (const g of groups) {
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

/** Pixels: how far a point of one edge may be from the reflection of the matching point of its mirror edge. */
const MIRROR_TOL = 1;

/**
 * Mirror pairs: two bent edges that both leave (or both enter) the same side of a box, are the only two ends on that
 * side, and are reflections of each other across the line through the box centre along the reading direction. Per
 * pair the cheaper edge is returned (each edge at most once), so the pair is charged for one edge.
 */
export function mirroredEdges(l: Pick<Layout, 'nodes' | 'edges' | 'direction'>, cost: (e: LayoutEdge) => number): Set<number> {
  const nodeAt = new Map(l.nodes.map((n) => [n.id, n] as const));
  const ends = new Map<string, Array<{ edge: number; out: boolean }>>();
  l.edges.forEach((e, i) => {
    const first = e.points[0];
    const last = e.points[e.points.length - 1];
    const a = nodeAt.get(e.from);
    const b = nodeAt.get(e.to);
    if (!first || !last || !a || !b || e.points.length < 2) return;
    for (const [node, p, out] of [[a, first, true], [b, last, false]] as const) {
      const k = `${node.id}|${sideOfPoint(node, p)}`;
      const list = ends.get(k) ?? [];
      list.push({ edge: i, out });
      ends.set(k, list);
    }
  });
  const dropped = new Set<number>();
  for (const [k, list] of ends) {
    const [x, y] = list;
    if (list.length !== 2 || !x || !y || x.out !== y.out || x.edge === y.edge) continue;
    const e = l.edges[x.edge] as LayoutEdge;
    const f = l.edges[y.edge] as LayoutEdge;
    if (e.points.length !== f.points.length || e.points.length < 3) continue;
    const node = nodeAt.get(k.slice(0, k.lastIndexOf('|'))) as LayoutNode;
    const axis = l.direction === 'TD' ? 'x' : 'y';
    const mid = axis === 'x' ? node.x + node.w / 2 : node.y + node.h / 2;
    const alike = e.points.every((p, q) => {
      const r = f.points[q] as Point;
      return Math.abs(p[axis] + r[axis] - 2 * mid) <= MIRROR_TOL && Math.abs(p[axis === 'x' ? 'y' : 'x'] - r[axis === 'x' ? 'y' : 'x']) <= MIRROR_TOL;
    });
    if (!alike || dropped.has(x.edge) || dropped.has(y.edge)) continue;
    dropped.add(cost(e) > cost(f) ? y.edge : x.edge);
  }
  return dropped;
}

/** Quality of a finished drawing, from its coordinates: [invalid things, cost, edge length]; smaller is better, compared left to right. */
export function score(l: Layout): number[] {
  // One drawing is measured many times while candidates are compared and changes are tried.
  const known = scores.get(l);
  if (known !== undefined) return known.slice();
  const made = scoreOnce(l);
  scores.set(l, made);
  return made.slice();
}

const scores = new WeakMap<Layout, number[]>();

function scoreOnce(l: Layout): number[] {
  const g = segsOf(l);
  const axis = l.direction === 'TD' ? 'y' : 'x';
  const across = l.direction === 'TD' ? 'x' : 'y';
  const byId = new Map(l.nodes.map((n) => [n.id, n] as const));
  let bends = 0;
  let folded = 0;
  let length = 0;
  const against: Array<[string, string]> = [];
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
  }
  for (let s = 0; s < (g.at[l.edges.length] as number); s++) length += Math.abs((g.v[s * 8 + 2] as number) - (g.v[s * 8] as number)) + Math.abs((g.v[s * 8 + 3] as number) - (g.v[s * 8 + 1] as number));
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
  const [crossMain, crossOther] = crossingsFrom(l, g);
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
  return [violationsOf(l, g) + l.diagnostics.filter((d) => d.kind === 'overflow').length, cost, Math.round(length)];
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

const bendsOf = (l: Layout): number => l.edges.reduce((n, e) => n + Math.max(0, e.points.length - 2), 0);
const crossingsRecorded = (l: Layout): number => l.diagnostics.filter((d) => d.kind === 'crossing').length;
const sharedPorts = (l: Layout): number => l.diagnostics.filter((d) => d.kind === 'shared-port').length;

/**
 * Whether the `spread` drawing replaces the usual one. It does when the usual drawing folds the flow onto further rows
 * (a branch below its parent) though the spread one, which stands every box in its stage, needs no fold and fits
 * `room` without more violations. Otherwise it needs no more bends, no more crossings and no more shared ports, at
 * least one of the three fewer, and it fits `room` (width and height); when the usual drawing is already wider or
 * taller than `room`, the spread one is no wider and no taller than it. `unfolding` false leaves out the first way.
 */
export function spreadWins(spread: Layout, usual: Layout, room: { width: number; height: number } = { width: Infinity, height: Infinity }, unfolding = true): boolean {
  const fits = (axis: 'width' | 'height'): boolean => spread[axis] <= Math.max(room[axis], usual[axis] > room[axis] ? usual[axis] : 0);
  const folded = (l: Layout): number => l.nodes.filter((n) => n.row > 0).length;
  const folds = (l: Layout): boolean => folded(l) > 0;
  // Every box the usual drawing pushes to a further row is worth `extraRow` of cost to the spread drawing.
  const affordable = (score(spread)[1] ?? 0) <= (score(usual)[1] ?? 0) + WEIGHTS.extraRow * folded(usual);
  // The spread drawing is laid out turned a quarter, so a shape whose body depends on the reading direction would stand the wrong way.
  const turns = spread.nodes.some((n) => n.shape === 'bar' || n.shape === 'ellipse');
  const noted = (l: Layout, kind: Diagnostic['kind']): number => l.diagnostics.filter((d) => d.kind === kind).length;
  // The lines of the spread drawing run no further against the reading direction than the ones of the usual drawing.
  const backRun = (l: Layout): number => {
    const axis = l.direction === 'TD' ? 'y' : 'x';
    let run = 0;
    for (const e of l.edges) {
      if (e.invisible) continue;
      for (let i = 1; i < e.points.length; i++) run += Math.max(0, (e.points[i - 1] as Point)[axis] - (e.points[i] as Point)[axis]);
    }
    return run;
  };
  const cleaner = backRun(spread) <= backRun(usual) + EPS && (['crossing', 'mixed-side', 'shared-port', 'label-overlap'] as const).every((k) => noted(spread, k) <= noted(usual, k));
  if (unfolding && folds(usual) && !folds(spread) && !turns && cleaner && affordable && spread.width <= room.width && spread.height <= room.height && violations(spread) <= violations(usual)) return true;
  const [b, c, s] = [bendsOf(spread) - bendsOf(usual), crossingsRecorded(spread) - crossingsRecorded(usual), sharedPorts(spread) - sharedPorts(usual)];
  if (b > 0 || c > 0 || s > 0 || (b === 0 && c === 0 && s === 0)) return false;
  return fits('width') && fits('height');
}
