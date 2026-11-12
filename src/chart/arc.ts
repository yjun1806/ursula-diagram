const TAU = Math.PI * 2;

const fmt = (v: number): string => String(Math.round(v * 100) / 100 || 0);

export interface ArcOptions {
  /** Width of the gap between this slice and its neighbours: each straight side moves inward by half of it. */
  gap?: number;
  /** Radius of the rounding of the two outer corners. */
  corner?: number;
}

/**
 * Pie slice from angle `a0` to `a1` in radians, 0 at 12 o'clock and growing clockwise, as path data.
 * A slice of the whole circle is a circle.
 */
export function arcPath(cx: number, cy: number, r: number, a0: number, a1: number, opts: ArcOptions = {}): string {
  if (a1 - a0 >= TAU - 1e-9) {
    return `M${fmt(cx)} ${fmt(cy - r)}A${fmt(r)} ${fmt(r)} 0 1 1 ${fmt(cx)} ${fmt(cy + r)}A${fmt(r)} ${fmt(r)} 0 1 1 ${fmt(cx)} ${fmt(cy - r)}Z`;
  }
  const g = (opts.gap ?? 0) / 2;
  const sweep = a1 - a0;
  const point = (x: number, y: number): string => `${fmt(x)} ${fmt(y)}`;
  const polar = (a: number, radius: number): [number, number] => [cx + radius * Math.sin(a), cy - radius * Math.cos(a)];

  // Apex: where the two moved sides meet, on the bisector.
  const mid = (a0 + a1) / 2;
  const apexDistance = g === 0 ? 0 : g / Math.sin(sweep / 2);
  const [ax, ay] = polar(mid, apexDistance);

  // The side at `a0` moved clockwise by g, the side at `a1` moved counter-clockwise by g.
  const side = (a: number, dir: 1 | -1, distance: number): [number, number] => {
    const along: [number, number] = [Math.sin(a), -Math.cos(a)];
    const across: [number, number] = [dir * Math.cos(a), dir * Math.sin(a)];
    return [cx + g * across[0] + distance * along[0], cy + g * across[1] + distance * along[1]];
  };

  const c = Math.max(0, opts.corner ?? 0);
  const reach = Math.sqrt(Math.max(0, (r - c) ** 2 - (g + c) ** 2));
  const rounded = c > 0 && r - c > g + c && Math.atan2(g + c, reach) * 2 <= sweep;
  if (!rounded) {
    const inset = Math.asin(Math.min(1, g / r));
    const [sx, sy] = side(a0, 1, Math.sqrt(Math.max(0, r * r - g * g)));
    const [ex, ey] = side(a1, -1, Math.sqrt(Math.max(0, r * r - g * g)));
    const large = sweep - 2 * inset > Math.PI ? 1 : 0;
    return `M${point(ax, ay)}L${point(sx, sy)}A${fmt(r)} ${fmt(r)} 0 ${large} 1 ${point(ex, ey)}Z`;
  }
  // Rounded corners: a circle of radius c touching the side from inside and the outer arc from inside.
  const theta = Math.atan2(g + c, reach);
  const [s1x, s1y] = side(a0, 1, reach);
  const [t1x, t1y] = polar(a0 + theta, r);
  const [t2x, t2y] = polar(a1 - theta, r);
  const [e2x, e2y] = side(a1, -1, reach);
  const large = a1 - theta - (a0 + theta) > Math.PI ? 1 : 0;
  return (
    `M${point(ax, ay)}L${point(s1x, s1y)}A${fmt(c)} ${fmt(c)} 0 0 1 ${point(t1x, t1y)}` +
    `A${fmt(r)} ${fmt(r)} 0 ${large} 1 ${point(t2x, t2y)}A${fmt(c)} ${fmt(c)} 0 0 1 ${point(e2x, e2y)}Z`
  );
}
