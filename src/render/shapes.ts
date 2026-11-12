import type { LayoutNode, Point } from '../types.ts';

type Box = Pick<LayoutNode, 'x' | 'y' | 'w' | 'h' | 'shape' | 'outline'>;

/** How far the slanted sides of a hexagon and a parallelogram reach into the box. */
export const SLANT = 12;

const EPS = 1e-6;

export function hexagonPoints(b: Box): Point[] {
  const cy = b.y + b.h / 2;
  return [
    { x: b.x + SLANT, y: b.y },
    { x: b.x + b.w - SLANT, y: b.y },
    { x: b.x + b.w, y: cy },
    { x: b.x + b.w - SLANT, y: b.y + b.h },
    { x: b.x + SLANT, y: b.y + b.h },
    { x: b.x, y: cy },
  ];
}

/** The corners of a diamond outline: the middles of the four sides of its rectangle. */
export function diamondPoints(o: NonNullable<LayoutNode['outline']>): Point[] {
  const cx = o.x + o.w / 2;
  const cy = o.y + o.h / 2;
  return [
    { x: cx, y: o.y },
    { x: o.x + o.w, y: cy },
    { x: cx, y: o.y + o.h },
    { x: o.x, y: cy },
  ];
}

/** Length of an arrowhead: an end is not moved when the segment would be left shorter than that. */
const ARROW = 8;

export function parallelogramPoints(b: Box): Point[] {
  return [
    { x: b.x + SLANT, y: b.y },
    { x: b.x + b.w, y: b.y },
    { x: b.x + b.w - SLANT, y: b.y + b.h },
    { x: b.x, y: b.y + b.h },
  ];
}

/** A parallelogram leaning the other way: the top is shifted left. */
export function leanLeftPoints(b: Box): Point[] {
  return [
    { x: b.x, y: b.y },
    { x: b.x + b.w - SLANT, y: b.y },
    { x: b.x + b.w, y: b.y + b.h },
    { x: b.x + SLANT, y: b.y + b.h },
  ];
}

/** A trapezoid that is wider at the bottom. */
export function trapBottomPoints(b: Box): Point[] {
  return [
    { x: b.x + SLANT, y: b.y },
    { x: b.x + b.w - SLANT, y: b.y },
    { x: b.x + b.w, y: b.y + b.h },
    { x: b.x, y: b.y + b.h },
  ];
}

/** A trapezoid that is wider at the top. */
export function trapTopPoints(b: Box): Point[] {
  return [
    { x: b.x, y: b.y },
    { x: b.x + b.w, y: b.y },
    { x: b.x + b.w - SLANT, y: b.y + b.h },
    { x: b.x + SLANT, y: b.y + b.h },
  ];
}

/** A rectangle whose left side has a V-shaped notch reaching a quarter of the height in. */
export function asymPoints(b: Box): Point[] {
  return [
    { x: b.x, y: b.y },
    { x: b.x + b.w, y: b.y },
    { x: b.x + b.w, y: b.y + b.h },
    { x: b.x, y: b.y + b.h },
    { x: b.x + b.h / 4, y: b.y + b.h / 2 },
  ];
}

/** Gap between the two circles of a double circle. */
export const RING_GAP = 4;

/** Parameter `t` where the ray `p + t*d` enters the convex polygon, or undefined when it misses it. */
function enterPolygon(poly: Point[], p: Point, d: Point): number | undefined {
  const mx = poly.reduce((s, q) => s + q.x, 0) / poly.length;
  const my = poly.reduce((s, q) => s + q.y, 0) / poly.length;
  let tin = -Infinity;
  let tout = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i] as Point;
    const b = poly[(i + 1) % poly.length] as Point;
    let nx = b.y - a.y;
    let ny = a.x - b.x;
    if (nx * (mx - a.x) + ny * (my - a.y) > 0) {
      nx = -nx;
      ny = -ny;
    }
    const side = nx * (p.x - a.x) + ny * (p.y - a.y);
    const along = nx * d.x + ny * d.y;
    if (Math.abs(along) < EPS) {
      if (side > EPS) return undefined;
    } else if (along > 0) {
      tout = Math.min(tout, -side / along);
    } else {
      tin = Math.max(tin, -side / along);
    }
  }
  return tin <= tout && tout >= 0 ? tin : undefined;
}

/** Parameter `t` where the ray `p + t*d` first enters a polygon that need not be convex, or undefined when it never does. */
function enterSimplePolygon(poly: Point[], p: Point, d: Point): number | undefined {
  let area = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i] as Point;
    const b = poly[(i + 1) % poly.length] as Point;
    area += a.x * b.y - b.x * a.y;
  }
  let best: number | undefined;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i] as Point;
    const b = poly[(i + 1) % poly.length] as Point;
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const [nx, ny] = area > 0 ? [ey, -ex] : [-ey, ex];
    if (nx * d.x + ny * d.y >= -EPS) continue;
    const denom = d.x * ey - d.y * ex;
    if (Math.abs(denom) < EPS) continue;
    const t = ((a.x - p.x) * ey - (a.y - p.y) * ex) / denom;
    const u = ((a.x - p.x) * d.y - (a.y - p.y) * d.x) / denom;
    if (u < -EPS || u > 1 + EPS || t < -EPS) continue;
    if (best === undefined || t < best) best = t;
  }
  return best;
}

/** Parameter `t` where the ray enters the axis-aligned ellipse, or undefined when it misses it. */
function enterEllipse(cx: number, cy: number, rx: number, ry: number, p: Point, d: Point): number | undefined {
  const px = (p.x - cx) / rx;
  const py = (p.y - cy) / ry;
  const dx = d.x / rx;
  const dy = d.y / ry;
  const a = dx * dx + dy * dy;
  const b = 2 * (px * dx + py * dy);
  const c = px * px + py * py - 1;
  const disc = b * b - 4 * a * c;
  if (a < EPS || disc < 0) return undefined;
  const root = Math.sqrt(disc);
  const t1 = (-b - root) / (2 * a);
  const t2 = (-b + root) / (2 * a);
  return t2 < 0 ? undefined : t1;
}

/** The smallest of the entry parameters of the pieces a shape is made of. */
function earliest(ts: Array<number | undefined>): number | undefined {
  const found = ts.filter((t): t is number => t !== undefined);
  return found.length === 0 ? undefined : Math.min(...found);
}

function entry(b: Box, p: Point, d: Point): number | undefined {
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  switch (b.shape) {
    case 'circle':
    case 'dbl-circle':
      return enterEllipse(cx, cy, b.w / 2, b.h / 2, p, d);
    case 'hexagon':
      return enterPolygon(hexagonPoints(b), p, d);
    case 'parallelogram':
      return enterPolygon(parallelogramPoints(b), p, d);
    case 'lean-l':
      return enterPolygon(leanLeftPoints(b), p, d);
    case 'trap-b':
      return enterPolygon(trapBottomPoints(b), p, d);
    case 'trap-t':
      return enterPolygon(trapTopPoints(b), p, d);
    case 'asym':
      return enterSimplePolygon(asymPoints(b), p, d);
    case 'stadium': {
      const r = b.h / 2;
      const middle = [
        { x: b.x + r, y: b.y },
        { x: b.x + b.w - r, y: b.y },
        { x: b.x + b.w - r, y: b.y + b.h },
        { x: b.x + r, y: b.y + b.h },
      ];
      return earliest([
        enterPolygon(middle, p, d),
        enterEllipse(b.x + r, cy, r, r, p, d),
        enterEllipse(b.x + b.w - r, cy, r, r, p, d),
      ]);
    }
    default:
      return undefined;
  }
}

/**
 * Moves the end `end` of an edge, whose neighbouring point is `next`, along the edge's line into the node
 * until it touches the outline. Stays where it is when the shape is not trimmed, the line misses the outline,
 * or the move would exceed half the length of the segment.
 */
export function trimToOutline(node: Box, end: Point, next: Point): Point {
  const len = Math.hypot(next.x - end.x, next.y - end.y);
  if (len < EPS) return end;
  const d = { x: (end.x - next.x) / len, y: (end.y - next.y) / len };
  if (node.shape === 'diamond' && node.outline) return fitToDiamond(node.outline, end, next, len, d);
  const t = entry(node, end, d);
  if (t === undefined || t < EPS || t > len / 2) return end;
  return { x: end.x + d.x * t, y: end.y + d.y * t };
}

/**
 * Moves the end of an edge along the line of its last segment to where that line meets the diamond outline nearest
 * to `next`, inwards or back out. Stays where it is when the line misses the outline or the segment would be left
 * shorter than an arrowhead.
 */
function fitToDiamond(outline: NonNullable<LayoutNode['outline']>, end: Point, next: Point, len: number, d: Point): Point {
  const t = enterPolygon(diamondPoints(outline), end, d);
  if (t === undefined || len + t < ARROW - EPS) return end;
  return { x: end.x + d.x * t, y: end.y + d.y * t };
}

const tidy = (v: number): string => String(Math.round(v * 100) / 100 || 0);

/** How far the rounded end of a corner is from the corner: the most a corner may be pulled in by its rounding. */
const MOST_PULLED_IN = 8;

interface Corner {
  from: Point;
  to: Point;
  r: number;
  sweep: 0 | 1;
  /** Distance from the corner of the polygon to the nearest point of the arc. */
  retreat: number;
  /** Unit vector from the corner into the polygon, along the bisector. */
  inward: Point;
}

/**
 * The rounding of every corner of a convex polygon. The radius is `radius` at most, and small enough that the arc
 * ends no more than 8 from its corner. An arc never starts farther from its corner than a third of the shorter of
 * the two sides that meet there; where that would be exceeded the radius is made smaller.
 */
function roundCorners(points: Point[], radius: number): Corner[] {
  const n = points.length;
  return points.map((c, i) => {
    const p = points[(i + n - 1) % n] as Point;
    const q = points[(i + 1) % n] as Point;
    const lenIn = Math.hypot(c.x - p.x, c.y - p.y);
    const lenOut = Math.hypot(q.x - c.x, q.y - c.y);
    const u = { x: (p.x - c.x) / lenIn, y: (p.y - c.y) / lenIn };
    const v = { x: (q.x - c.x) / lenOut, y: (q.y - c.y) / lenOut };
    const half = Math.acos(Math.max(-1, Math.min(1, u.x * v.x + u.y * v.y))) / 2;
    const pull = 1 / Math.sin(half) - 1;
    const wanted = pull <= 0 ? radius : Math.min(radius, MOST_PULLED_IN / pull);
    const reach = Math.min(wanted / Math.tan(half), Math.min(lenIn, lenOut) / 3);
    const r = reach * Math.tan(half);
    const cross = -u.x * v.y + u.y * v.x;
    const bx = u.x + v.x;
    const by = u.y + v.y;
    const bl = Math.hypot(bx, by) || 1;
    return {
      from: { x: c.x + u.x * reach, y: c.y + u.y * reach },
      to: { x: c.x + v.x * reach, y: c.y + v.y * reach },
      r,
      sweep: cross > 0 ? 1 : 0,
      retreat: r * pull,
      inward: { x: bx / bl, y: by / bl },
    };
  });
}

/** The closed path of a convex polygon with rounded corners; see `roundCorners` for the radii. */
export function roundedPolygonPath(points: Point[], radius: number): string {
  if (points.length < 3) return '';
  const corners = roundCorners(points, radius);
  const at = (q: Point): string => `${tidy(q.x)} ${tidy(q.y)}`;
  const arc = (k: Corner): string => `A${tidy(k.r)} ${tidy(k.r)} 0 0 ${k.sweep} ${at(k.to)}`;
  const first = corners[0] as Corner;
  return `M${at(first.to)}${corners.slice(1).map((k) => ` L${at(k.from)} ${arc(k)}`).join('')} L${at(first.from)} ${arc(first)}Z`;
}

/**
 * Moves a line end that sits on a corner of the polygon in to the rounded end of that corner, along the way the line
 * runs. Ends that are not on a corner stay where they are.
 */
export function reachRoundedCorner(points: Point[], radius: number, end: Point, next: Point): Point {
  const corners = roundCorners(points, radius);
  const i = points.findIndex((c) => Math.hypot(c.x - end.x, c.y - end.y) < 1);
  const corner = corners[i];
  if (!corner || corner.retreat <= 0) return end;
  const len = Math.hypot(end.x - next.x, end.y - next.y);
  if (len < EPS) return end;
  const d = { x: (end.x - next.x) / len, y: (end.y - next.y) / len };
  const along = d.x * corner.inward.x + d.y * corner.inward.y;
  if (along < EPS) return end;
  const t = corner.retreat / along;
  return { x: end.x + d.x * t, y: end.y + d.y * t };
}
