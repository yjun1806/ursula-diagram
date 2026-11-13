import { ceilTo, roundTo } from '../chart/grid.ts';
import type { Ruler } from '../metrics.ts';
import { HEAD_BAND, headBand } from '../render/head-band.ts';
import { SCENE_THEME_SPECS } from '../render/scene-theme.ts';
import { DEFAULT_THEME } from '../render/theme.ts';
import type { Theme } from '../render/theme.ts';
import { wrapWords } from '../text/wrap.ts';
import type { Point, Scene, SceneItem } from '../types.ts';
import type { ArchEdge, ArchGroup, Architecture, PlacedEdge, PlacedGroup, PlacedNode, Side } from './model.ts';
import { ghostId, placeCells, sideVector } from './place.ts';

const MARGIN = 24;
/** Clear distance between two neighbouring service boxes. */
const GAP = 48;
/** Distance from the boxes of a group to its border on the left, right and bottom. */
const ZONE_PAD = 24;
/** Distance from the top of a group to its first row of boxes; the name and the icon name stand in it. */
const ZONE_TOP = 72;
/** Clear distance between the borders of two groups that meet. */
const ZONE_GAP = 16;
const NAME_LIMIT = 224;
const BOX_MIN_W = 152;
const TAG_TOP = 10;
const TAG_H = 20;
/** Centre of the first name line under a head band. */
const NAME_UNDER_BAND = 46;
const JUNCTION = 8;
const ARROW_GAP = 3;
const TITLE_BLOCK = 36;
const LINE_STEP = 16;
/** Straight run a line keeps where it leaves or enters a box before it may turn: half the gap between boxes. */
const STUB = GAP / 2;
/** Distance between two lines that go around the same box. */
const LANE = 16;

export interface ArchLayout {
  scene: Scene;
  nodes: PlacedNode[];
  groups: PlacedGroup[];
  edges: PlacedEdge[];
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const centre = (r: Rect): Point => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

/** The number of groups in `set` on the longest chain of nested ones, counting each group once. */
function nestedCount(set: ArchGroup[], parentOf: (id: string) => string | undefined): number {
  let best = 0;
  for (const g of set) {
    let n = 0;
    for (let p: string | undefined = g.id; p !== undefined; p = parentOf(p)) if (set.some((s) => s.id === p)) n++;
    best = Math.max(best, n);
  }
  return best;
}

/** The point on `side` of `rect` that lines up with `along` (the centre of the box the line belongs to). */
function port(rect: Rect, side: Side, along: Point): Point {
  switch (side) {
    case 'L':
      return { x: rect.x, y: along.y };
    case 'R':
      return { x: rect.x + rect.w, y: along.y };
    case 'T':
      return { x: along.x, y: rect.y };
    case 'B':
      return { x: along.x, y: rect.y + rect.h };
  }
}

/** A path of right angles from `a` out of side `sa` to `b` into side `sb`, by the shortest rule. */
function simpleRoute(a: Point, sa: Side, b: Point, sb: Side): Point[] {
  const va = sideVector(sa);
  const vb = sideVector(sb);
  const sameAxis = va.x !== 0 === (vb.x !== 0);
  if (sameAxis && va.x === -vb.x && va.y === -vb.y) {
    if (va.x !== 0) {
      if (a.y === b.y) return [a, b];
      const mid = roundTo((a.x + b.x) / 2, 2);
      return [a, { x: mid, y: a.y }, { x: mid, y: b.y }, b];
    }
    if (a.x === b.x) return [a, b];
    const mid = roundTo((a.y + b.y) / 2, 2);
    return [a, { x: a.x, y: mid }, { x: b.x, y: mid }, b];
  }
  if (!sameAxis) return va.x !== 0 ? [a, { x: b.x, y: a.y }, b] : [a, { x: a.x, y: b.y }, b];
  // Both ends on the same side: go out past both and come back.
  if (va.x !== 0) {
    const out = va.x > 0 ? Math.max(a.x, b.x) + ZONE_PAD : Math.min(a.x, b.x) - ZONE_PAD;
    return [a, { x: out, y: a.y }, { x: out, y: b.y }, b];
  }
  const out = va.y > 0 ? Math.max(a.y, b.y) + ZONE_PAD : Math.min(a.y, b.y) - ZONE_PAD;
  return [a, { x: a.x, y: out }, { x: b.x, y: out }, b];
}

/** Drops points that do not turn the path. */
function simplify(points: Point[]): Point[] {
  const out: Point[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (last !== undefined && last.x === p.x && last.y === p.y) continue;
    const prev = out[out.length - 2];
    if (last !== undefined && prev !== undefined && ((prev.x === last.x && last.x === p.x) || (prev.y === last.y && last.y === p.y))) out[out.length - 1] = p;
    else out.push(p);
  }
  return out;
}

const dir = (a: Point, b: Point): Point => ({ x: Math.sign(b.x - a.x), y: Math.sign(b.y - a.y) });

const grow = (r: Rect, by: number): Rect => ({ x: r.x - by, y: r.y - by, w: r.w + 2 * by, h: r.h + 2 * by });

const pieces = (pts: readonly Point[]): Array<[Point, Point]> => pts.slice(1).map((q, i) => [pts[i] as Point, q]);

/**
 * How badly two axis-parallel pieces of line run together: the length they share on one line, and a quarter of the
 * length they run side by side closer than a lane.
 */
function collinear(a: Point, b: Point, c: Point, d: Point): number {
  const weight = (gap: number): number => (gap === 0 ? 1 : gap < LANE ? 0.25 : 0);
  if (a.y === b.y && c.y === d.y) return weight(Math.abs(a.y - c.y)) * Math.max(0, Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x)) - Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x)));
  if (a.x === b.x && c.x === d.x) return weight(Math.abs(a.x - c.x)) * Math.max(0, Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y)) - Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y)));
  return 0;
}

/** Whether an axis-parallel piece of line runs through the inside of `r`. */
function cuts(a: Point, b: Point, r: Rect): boolean {
  return Math.min(a.x, b.x) < r.x + r.w && Math.max(a.x, b.x) > r.x && Math.min(a.y, b.y) < r.y + r.h && Math.max(a.y, b.y) > r.y;
}

/**
 * A path that leaves side `sa` of the box at `a` straight out and enters side `sb` of the box at `b` straight in,
 * through no box on the way. The shortest rule comes first; when it doubles back or runs through a box, the line
 * goes out a stub from each side and joins the stubs with the fewest turns that pass every box.
 */
function route(a: Point, sa: Side, b: Point, sb: Side, ends: Rect[], others: Rect[], used: readonly Point[][]): Point[] {
  const va = sideVector(sa);
  const vb = sideVector(sb);
  const ok = (path: Point[]): boolean => {
    const pts = simplify(path);
    if (pts.length < 2) return false;
    const first = dir(pts[0] as Point, pts[1] as Point);
    const last = dir(pts[pts.length - 2] as Point, pts[pts.length - 1] as Point);
    if (first.x !== va.x || first.y !== va.y || last.x !== -vb.x || last.y !== -vb.y) return false;
    for (let i = 0; i + 2 < pts.length; i++) {
      const d0 = dir(pts[i] as Point, pts[i + 1] as Point);
      const d1 = dir(pts[i + 1] as Point, pts[i + 2] as Point);
      if (d0.x === -d1.x && d0.y === -d1.y) return false;
    }
    return pts.slice(1).every((q, i) => {
      const p = pts[i] as Point;
      const inner = i > 0 && i < pts.length - 2;
      return !others.some((r) => cuts(p, q, grow(r, inner ? LANE : 0))) && !(inner && ends.some((r) => cuts(p, q, grow(r, LANE))));
    });
  };
  const plain = simpleRoute(a, sa, b, sb);
  const overlap = (path: Point[]): number => {
    let n = 0;
    for (const [p, q] of pieces(path)) for (const line of used) for (const [r, t] of pieces(line)) n += collinear(p, q, r, t);
    return n;
  };
  if (ok(plain) && overlap(plain) === 0) return simplify(plain);
  const boxes = [...ends, ...others];
  const lanes = [0, LANE, 2 * LANE];
  const tries: Point[][] = [];
  // A stub a little shorter or longer than half the gap lets a second line pass the gap beside the first.
  for (const sa1 of [STUB, STUB - LANE / 2, STUB + LANE / 2]) {
    for (const sb1 of [STUB, STUB - LANE / 2, STUB + LANE / 2]) {
      const a1 = { x: a.x + va.x * sa1, y: a.y + va.y * sa1 };
      const b1 = { x: b.x + vb.x * sb1, y: b.y + vb.y * sb1 };
      const xs = [roundTo((a1.x + b1.x) / 2, 2), a1.x, b1.x, ...boxes.flatMap((r) => lanes.flatMap((k) => [r.x - STUB - k, r.x + r.w + STUB + k]))];
      const ys = [roundTo((a1.y + b1.y) / 2, 2), a1.y, b1.y, ...boxes.flatMap((r) => lanes.flatMap((k) => [r.y - STUB - k, r.y + r.h + STUB + k]))];
      tries.push(
        [a, a1, { x: a1.x, y: b1.y }, b1, b],
        [a, a1, { x: b1.x, y: a1.y }, b1, b],
        ...xs.map((x) => [a, a1, { x, y: a1.y }, { x, y: b1.y }, b1, b]),
        ...ys.map((y) => [a, a1, { x: a1.x, y }, { x: b1.x, y }, b1, b]),
      );
    }
  }
  const turns = (pts: Point[]): number => simplify(pts).length - 2;
  const length = (pts: Point[]): number => pts.slice(1).reduce((n, q, i) => n + Math.abs(q.x - (pts[i] as Point).x) + Math.abs(q.y - (pts[i] as Point).y), 0);
  const cost = (pts: Point[]): number => turns(pts) * 100 + length(pts) + overlap(pts) * 20;
  const best = [plain, ...tries].filter(ok).sort((p, q) => cost(p) - cost(q))[0];
  return simplify(best ?? plain);
}

/** Moves the end of a path `by` back along its last piece, so an arrowhead stops short of the box it points at. */
function pullBack(points: Point[], by: number, atEnd: boolean): Point[] {
  const out = [...points];
  const i = atEnd ? out.length - 1 : 0;
  const j = atEnd ? i - 1 : 1;
  const p = out[i];
  const q = out[j];
  if (p === undefined || q === undefined) return out;
  const len = Math.hypot(q.x - p.x, q.y - p.y);
  if (len === 0) return out;
  out[i] = { x: p.x + ((q.x - p.x) / len) * by, y: p.y + ((q.y - p.y) / len) * by };
  return out;
}

/** Places services and junctions on a grid of cells, wraps groups around their cells and draws the lines. */
export function layoutArchitecture(model: Architecture, ruler: Ruler, theme?: Theme): ArchLayout {
  const cells = placeCells(model);
  const groupById = new Map(model.groups.map((g) => [g.id, g]));
  const nodeById = new Map(model.nodes.map((n) => [n.id, n]));
  const parentOfGroup = (id: string): string | undefined => groupById.get(id)?.parent;
  const depthOf = (id: string): number => {
    let d = 1;
    for (let p = parentOfGroup(id); p !== undefined; p = parentOfGroup(p)) d++;
    return d;
  };

  // Close the holes a push can leave in the grid.
  const rank = (values: number[]): Map<number, number> => new Map([...new Set(values)].sort((a, b) => a - b).map((v, i) => [v, i]));
  const colRank = rank([...cells.values()].map((c) => c.col));
  const rowRank = rank([...cells.values()].map((c) => c.row));
  const cell = new Map([...cells].map(([id, c]) => [id, { col: colRank.get(c.col) ?? 0, row: rowRank.get(c.row) ?? 0 }]));
  const nCols = colRank.size;
  const nRows = rowRank.size;

  // Service box size: the same for every service, wide enough for the longest name and icon name.
  const services = model.nodes.filter((n) => n.kind === 'service');
  const nameLines = new Map(services.map((n) => [n.id, wrapWords(n.label, NAME_LIMIT, (s) => ruler.textWidth(s, 'title'), { longWord: 'break', blank: true })]));
  const tagWidth = (icon: string): number => ceilTo(ruler.textWidth(icon, 'line') + 16, 8);
  const widest = Math.max(
    BOX_MIN_W,
    ...services.flatMap((n) => [
      ...(nameLines.get(n.id) ?? []).map((l) => ceilTo(ruler.textWidth(l, 'title') + 32, 8)),
      ...(n.icon === undefined ? [] : [tagWidth(n.icon) + 16]),
    ]),
  );
  const boxW = ceilTo(widest, 8);
  const tagged = services.some((n) => n.icon !== undefined) || services.length === 0;
  const lines = Math.max(1, ...[...nameLines.values()].map((l) => l.length));
  const boxH = (tagged ? 68 : 48) + LINE_STEP * (lines - 1);

  // Which cells each group covers.
  const parentOfId = (id: string): string | undefined => {
    if (id.startsWith('ghost:')) return id.slice('ghost:'.length);
    return nodeById.get(id)?.parent;
  };
  const inside = (id: string, group: string): boolean => {
    for (let p = parentOfId(id); p !== undefined; p = parentOfGroup(p)) if (p === group) return true;
    return false;
  };
  const extent = new Map<string, { c0: number; c1: number; r0: number; r1: number }>();
  for (const g of model.groups) {
    const mine = [...cell].filter(([id]) => inside(id, g.id)).map(([, c]) => c);
    if (mine.length === 0) continue;
    extent.set(g.id, {
      c0: Math.min(...mine.map((c) => c.col)),
      c1: Math.max(...mine.map((c) => c.col)),
      r0: Math.min(...mine.map((c) => c.row)),
      r1: Math.max(...mine.map((c) => c.row)),
    });
  }
  const groupsWhere = (pick: (e: { c0: number; c1: number; r0: number; r1: number }) => boolean): ArchGroup[] =>
    model.groups.filter((g) => {
      const e = extent.get(g.id);
      return e !== undefined && pick(e);
    });

  // Column and row sizes; a column of only junctions is as narrow as the dot.
  const colW = Array.from({ length: nCols }, () => JUNCTION);
  const rowH = Array.from({ length: nRows }, () => JUNCTION);
  for (const [id, c] of cell) {
    const isJunction = nodeById.get(id)?.kind === 'junction';
    colW[c.col] = Math.max(colW[c.col] ?? 0, isJunction ? JUNCTION : boxW);
    rowH[c.row] = Math.max(rowH[c.row] ?? 0, isJunction ? JUNCTION : boxH);
  }
  // Space between neighbouring columns and rows: the gap, or more where group borders and names must pass.
  const colGap = (c: number): number => {
    const left = nestedCount(groupsWhere((e) => e.c1 === c), parentOfGroup) * ZONE_PAD;
    const right = nestedCount(groupsWhere((e) => e.c0 === c + 1), parentOfGroup) * ZONE_PAD;
    return Math.max(GAP, left + right + (left > 0 && right > 0 ? ZONE_GAP : ZONE_GAP / 2));
  };
  const rowGap = (r: number): number => {
    const bottom = nestedCount(groupsWhere((e) => e.r1 === r), parentOfGroup) * ZONE_PAD;
    const top = nestedCount(groupsWhere((e) => e.r0 === r + 1), parentOfGroup) * ZONE_TOP;
    return Math.max(GAP, bottom + top + (bottom > 0 && top > 0 ? ZONE_GAP : ZONE_GAP / 2));
  };
  const colX: number[] = [];
  const rowY: number[] = [];
  for (let c = 0, x = 0; c < nCols; c++) {
    colX.push(x);
    x += (colW[c] ?? 0) + colGap(c);
  }
  for (let r = 0, y = 0; r < nRows; r++) {
    rowY.push(y);
    y += (rowH[r] ?? 0) + rowGap(r);
  }

  const rects = new Map<string, Rect>();
  const placedNodes: PlacedNode[] = [];
  for (const [id, c] of cell) {
    const n = nodeById.get(id);
    const isJunction = n?.kind === 'junction';
    const w = isJunction ? JUNCTION : boxW;
    const h = isJunction ? JUNCTION : boxH;
    const x = (colX[c.col] ?? 0) + ((colW[c.col] ?? 0) - w) / 2;
    const y = (rowY[c.row] ?? 0) + ((rowH[c.row] ?? 0) - h) / 2;
    rects.set(id, { x, y, w, h });
    if (n !== undefined) placedNodes.push({ id, kind: n.kind, col: c.col, row: c.row, x, y, w, h });
  }

  // Group boxes, innermost first so an outer group wraps the inner ones.
  const groupRects = new Map<string, Rect>();
  const nameFont = (s: string): number => ruler.textWidth(s, 'title');
  for (const g of [...model.groups].sort((a, b) => depthOf(b.id) - depthOf(a.id))) {
    const kids: Rect[] = [
      ...model.nodes.filter((n) => n.parent === g.id).flatMap((n) => rects.get(n.id) ?? []),
      ...model.groups.filter((s) => s.parent === g.id).flatMap((s) => groupRects.get(s.id) ?? []),
      ...[rects.get(ghostId(g.id))].flatMap((r) => r ?? []),
    ];
    if (kids.length === 0) continue;
    const x0 = Math.min(...kids.map((r) => r.x)) - ZONE_PAD;
    const y0 = Math.min(...kids.map((r) => r.y)) - ZONE_TOP;
    const x1 = Math.max(...kids.map((r) => r.x + r.w)) + ZONE_PAD;
    const y1 = Math.max(...kids.map((r) => r.y + r.h)) + ZONE_PAD;
    const headW = ceilTo(Math.max(nameFont(g.label), g.icon === undefined ? 0 : ruler.textWidth(g.icon, 'line')) + 40, 4);
    groupRects.set(g.id, { x: x0, y: y0, w: Math.max(x1 - x0, headW), h: y1 - y0 });
  }

  // Lines.
  const endpoint = (id: string, asGroup: boolean): Rect => {
    const own = rects.get(id) ?? { x: 0, y: 0, w: 0, h: 0 };
    const parent = asGroup ? nodeById.get(id)?.parent : undefined;
    return (parent === undefined ? undefined : groupRects.get(parent)) ?? own;
  };
  const drawn: Point[][] = [];
  const placedEdges: PlacedEdge[] = model.edges.map((e: ArchEdge) => {
    const ra = rects.get(e.from) ?? { x: 0, y: 0, w: 0, h: 0 };
    const rb = rects.get(e.to) ?? { x: 0, y: 0, w: 0, h: 0 };
    const a = port(endpoint(e.from, e.fromGroup), e.fromSide, centre(ra));
    const b = port(endpoint(e.to, e.toGroup), e.toSide, centre(rb));
    const ends = [endpoint(e.from, e.fromGroup), endpoint(e.to, e.toGroup)];
    const others = [...rects].filter(([id]) => id !== e.from && id !== e.to && !id.startsWith('ghost:')).map(([, r]) => r);
    // Lines that meet at one port of one box may share their last piece; any other overlap is avoided.
    const meets = (line: Point[]): boolean => [line[0], line[line.length - 1]].some((p) => p !== undefined && ((p.x === a.x && p.y === a.y) || (p.x === b.x && p.y === b.y)));
    let points = route(a, e.fromSide, b, e.toSide, ends, others, drawn.filter((l) => !meets(l)));
    drawn.push(points);
    if (e.endArrow) points = pullBack(points, ARROW_GAP, true);
    if (e.startArrow) points = pullBack(points, ARROW_GAP, false);
    return { from: e.from, to: e.to, points };
  });

  // Shift everything so the drawing starts at the margin, below the title when there is one.
  const everyRect = [...rects.values(), ...groupRects.values()];
  const everyPoint = placedEdges.flatMap((e) => e.points);
  const minX = Math.min(...everyRect.map((r) => r.x), ...everyPoint.map((p) => p.x));
  const minY = Math.min(...everyRect.map((r) => r.y), ...everyPoint.map((p) => p.y));
  const maxX = Math.max(...everyRect.map((r) => r.x + r.w), ...everyPoint.map((p) => p.x));
  const maxY = Math.max(...everyRect.map((r) => r.y + r.h), ...everyPoint.map((p) => p.y));
  const titleW = model.title === undefined ? 0 : (ruler.textWidth(model.title, 'title') * 15) / 13;
  const dx = MARGIN - minX;
  const dy = MARGIN + (model.title === undefined ? 0 : TITLE_BLOCK) - minY;
  const width = ceilTo(Math.max(maxX - minX, titleW) + 2 * MARGIN, 4);
  const height = ceilTo(maxY - minY + 2 * MARGIN + (model.title === undefined ? 0 : TITLE_BLOCK), 4);
  const move = (r: Rect): Rect => ({ x: r.x + dx, y: r.y + dy, w: r.w, h: r.h });
  const movePoint = (p: Point): Point => ({ x: p.x + dx, y: p.y + dy });
  for (const n of placedNodes) {
    n.x += dx;
    n.y += dy;
  }
  for (const e of placedEdges) e.points = e.points.map(movePoint);

  const placedGroups: PlacedGroup[] = [];
  const spec = SCENE_THEME_SPECS[theme ?? DEFAULT_THEME];
  const items: SceneItem[] = [];
  if (model.title !== undefined) items.push({ kind: 'text', x: MARGIN, y: MARGIN + TITLE_BLOCK / 2 - 4, text: model.title, anchor: 'start', role: ['title'] });
  for (const g of [...model.groups].sort((a, b) => depthOf(a.id) - depthOf(b.id))) {
    const raw = groupRects.get(g.id);
    if (raw === undefined) continue;
    const r = move(raw);
    const depth = depthOf(g.id);
    placedGroups.push({ id: g.id, label: g.label, ...(g.icon === undefined ? {} : { icon: g.icon }), depth, ...r });
    items.push({ kind: 'box', style: 'frame', ...r, role: depth % 2 === 1 ? ['zone'] : ['zone', 'zone--plain'], data: { group: g.id } });
    items.push({ kind: 'text', x: r.x + 20, y: r.y + 28, text: g.label, role: ['zone-name'], data: { group: g.id } });
    if (g.icon !== undefined) items.push({ kind: 'text', x: r.x + 20, y: r.y + 46, text: g.icon, role: ['zone-sub'], data: { group: g.id } });
  }
  placedEdges.forEach((e, i) => {
    const src = model.edges[i];
    if (src === undefined) return;
    const roles = ['edge', ...(src.endArrow ? ['edge--arrow'] : []), ...(src.startArrow ? ['edge--arrow-start'] : [])];
    items.push({ kind: 'line', points: e.points, role: roles, data: { from: e.from, to: e.to } });
  });
  for (const n of placedNodes) {
    const def = nodeById.get(n.id);
    if (def === undefined) continue;
    if (def.kind === 'junction') {
      items.push({ kind: 'circle', cx: n.x + n.w / 2, cy: n.y + n.h / 2, r: JUNCTION / 2, role: ['dot'], data: { junction: n.id } });
      continue;
    }
    const inFilled = def.parent !== undefined && depthOf(def.parent) % 2 === 1;
    const data = { service: n.id };
    items.push({ kind: 'box', style: 'box', x: n.x, y: n.y, w: n.w, h: n.h, role: inFilled ? ['box', 'box--in-zone'] : ['box'], data });
    const names = nameLines.get(n.id) ?? [];
    const cx = n.x + n.w / 2;
    let firstLine = n.y + n.h / 2 - (LINE_STEP * (names.length - 1)) / 2;
    if (def.icon !== undefined && spec.headBand) {
      items.push(headBand(n.x, n.y, n.w, spec, data));
      items.push({ kind: 'text', x: cx, y: n.y + HEAD_BAND / 2, text: def.icon, role: ['tag-text'], data });
      firstLine = n.y + NAME_UNDER_BAND;
    } else if (def.icon !== undefined) {
      const tw = tagWidth(def.icon);
      items.push({ kind: 'box', style: 'label', x: cx - tw / 2, y: n.y + TAG_TOP, w: tw, h: TAG_H, role: ['tag'], data });
      items.push({ kind: 'text', x: cx, y: n.y + TAG_TOP + TAG_H / 2, text: def.icon, role: ['tag-text'], data });
      firstLine = n.y + 48;
    }
    names.forEach((line, i) => items.push({ kind: 'text', x: cx, y: firstLine + LINE_STEP * i, text: line, role: ['name'], data }));
  }

  const name = model.accTitle ?? model.title ?? `Architecture: ${services.length} ${services.length === 1 ? 'service' : 'services'}`;
  const scene: Scene = { width, height, title: name, items, ...(theme === undefined ? {} : { theme }) };
  return { scene, nodes: placedNodes, groups: placedGroups, edges: placedEdges };
}
