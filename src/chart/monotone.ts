import type { Point } from '../types.ts';

const fmt = (v: number): string => String(Math.round(v * 100) / 100 || 0);

const sign = (v: number): number => (v < 0 ? -1 : 1);

/** Tangent at the middle of three points, limited so the curve does not overshoot its neighbours. */
function slope3(p0: Point, p1: Point, p2: Point): number {
  const h0 = p1.x - p0.x;
  const h1 = p2.x - p1.x;
  const s0 = (p1.y - p0.y) / (h0 || (h1 < 0 ? -0 : 0));
  const s1 = (p2.y - p1.y) / (h1 || (h0 < 0 ? -0 : 0));
  const p = (s0 * h1 + s1 * h0) / (h0 + h1);
  return (sign(s0) + sign(s1)) * Math.min(Math.abs(s0), Math.abs(s1), 0.5 * Math.abs(p)) || 0;
}

/** Tangent at an end point, from its single neighbour and the tangent there. */
function slope2(p0: Point, p1: Point, t: number): number {
  const h = p1.x - p0.x;
  return h ? ((3 * (p1.y - p0.y)) / h - t) / 2 : t;
}

function segment(p0: Point, p1: Point, t0: number, t1: number): string {
  const dx = (p1.x - p0.x) / 3;
  return ` C${fmt(p0.x + dx)} ${fmt(p0.y + dx * t0)} ${fmt(p1.x - dx)} ${fmt(p1.y - dx * t1)} ${fmt(p1.x)} ${fmt(p1.y)}`;
}

/**
 * Path through `points` (x ascending) as the monotone cubic of d3's `curveMonotoneX`: it passes every point and
 * stays within the y range of each pair of neighbours. One point gives an empty string, two give a straight line.
 */
export function monotonePath(points: readonly Point[]): string {
  const first = points[0];
  if (first === undefined) return '';
  if (points.length === 1) return '';
  let d = `M${fmt(first.x)} ${fmt(first.y)}`;
  if (points.length === 2) {
    const second = points[1];
    return second === undefined ? d : `${d} L${fmt(second.x)} ${fmt(second.y)}`;
  }
  const tangents = points.map((p, i): number => {
    const prev = points[i - 1];
    const next = points[i + 1];
    return prev !== undefined && next !== undefined ? slope3(prev, p, next) : 0;
  });
  const lastIndex = points.length - 1;
  const [p0, p1] = [points[0], points[1]];
  const [pn1, pn] = [points[lastIndex - 1], points[lastIndex]];
  if (p0 === undefined || p1 === undefined || pn1 === undefined || pn === undefined) return d;
  tangents[0] = slope2(p0, p1, tangents[1] ?? 0);
  tangents[lastIndex] = slope2(pn1, pn, tangents[lastIndex - 1] ?? 0);
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (a !== undefined && b !== undefined) d += segment(a, b, tangents[i - 1] ?? 0, tangents[i] ?? 0);
  }
  return d;
}
