import type { LayoutNode, Point } from '../types.ts';

type Box = Pick<LayoutNode, 'x' | 'y' | 'w' | 'h' | 'shape'>;

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

export function parallelogramPoints(b: Box): Point[] {
  return [
    { x: b.x + SLANT, y: b.y },
    { x: b.x + b.w, y: b.y },
    { x: b.x + b.w - SLANT, y: b.y + b.h },
    { x: b.x, y: b.y + b.h },
  ];
}

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
      return enterEllipse(cx, cy, b.w / 2, b.h / 2, p, d);
    case 'hexagon':
      return enterPolygon(hexagonPoints(b), p, d);
    case 'parallelogram':
      return enterPolygon(parallelogramPoints(b), p, d);
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
  const t = entry(node, end, d);
  if (t === undefined || t < EPS || t > len / 2) return end;
  return { x: end.x + d.x * t, y: end.y + d.y * t };
}
