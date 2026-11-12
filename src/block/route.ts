import type { Point } from '../types.ts';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Segment {
  a: Point;
  b: Point;
  /** The blocks the line it belongs to joins. */
  from: string;
  to: string;
}

export interface RouteContext {
  /** Blocks a line must not cross. */
  obstacles: readonly Rect[];
  /** Lines already routed. */
  used: readonly Segment[];
  /** Coordinates of the middles of the gaps between rows and between columns. */
  channelsX: readonly number[];
  channelsY: readonly number[];
  /** Where a line may run: the drawing without its outer margin. */
  bounds: Rect;
  stub: number;
  clear: number;
  lane: number;
  around: number;
  /** How many lanes past the first one a line that goes around the blocks may move out; 2 when absent. */
  farthest?: number;
  /** Extra cost of a route, for what only the caller can judge (whether a label finds room on it). */
  score?: (pts: Point[]) => number;
  /** Unit of the medium (4 in pixels is not required; lines run on even coordinates in pixels, whole cells in text). */
  step: number;
}

interface Candidate {
  pts: Point[];
  /** An end leaves or enters a face away from its middle. */
  off: boolean;
  /** Direction the line leaves the first block in, and direction the face of the last block looks. */
  exit: Point;
  enter: Point;
}

interface Face {
  p: Point;
  /** Unit vector pointing out of the block. */
  d: Point;
}

const faces = (r: Rect): Face[] => [
  { p: { x: r.x + Math.floor(r.w / 2), y: r.y }, d: { x: 0, y: -1 } },
  { p: { x: r.x + r.w, y: r.y + Math.floor(r.h / 2) }, d: { x: 1, y: 0 } },
  { p: { x: r.x + Math.floor(r.w / 2), y: r.y + r.h }, d: { x: 0, y: 1 } },
  { p: { x: r.x, y: r.y + Math.floor(r.h / 2) }, d: { x: -1, y: 0 } },
];

/**
 * The middles of the faces, then the points of a long face that line up with a gap between other blocks, so a line
 * can reach a tall or wide block through that gap. Off-middle points come with `off` set.
 */
function facesAlong(r: Rect, ctx: RouteContext): Array<Face & { off?: boolean }> {
  const out: Array<Face & { off?: boolean }> = faces(r);
  const keep = 2 * ctx.stub;
  for (const y of ctx.channelsY) {
    if (y < r.y + keep || y > r.y + r.h - keep || y === r.y + Math.floor(r.h / 2)) continue;
    out.push({ p: { x: r.x + r.w, y }, d: { x: 1, y: 0 }, off: true }, { p: { x: r.x, y }, d: { x: -1, y: 0 }, off: true });
  }
  for (const x of ctx.channelsX) {
    if (x < r.x + keep || x > r.x + r.w - keep || x === r.x + Math.floor(r.w / 2)) continue;
    out.push({ p: { x, y: r.y }, d: { x: 0, y: -1 }, off: true }, { p: { x, y: r.y + r.h }, d: { x: 0, y: 1 }, off: true });
  }
  return out;
}

/** Cost of reaching a face away from its middle; a route there must save more than this. */
const OFF_MIDDLE = 700;
/** Cost of running on a piece of line another link already uses. */
const SHARED = 3000;

const flat = (d: Point): boolean => d.y === 0;
const near = (a: number, b: number): boolean => Math.abs(a - b) < 1e-6;

/** Distance from an axis-parallel piece of line to a rectangle; zero when they touch. */
function gap(a: Point, b: Point, r: Rect): number {
  const dx = Math.max(0, r.x - Math.max(a.x, b.x), Math.min(a.x, b.x) - (r.x + r.w));
  const dy = Math.max(0, r.y - Math.max(a.y, b.y), Math.min(a.y, b.y) - (r.y + r.h));
  return Math.hypot(dx, dy);
}

/** Whether a piece of line runs through the inside of `r`, grown by `m` on every side. */
function cuts(a: Point, b: Point, r: Rect, m: number): boolean {
  const x0 = r.x - m;
  const x1 = r.x + r.w + m;
  const y0 = r.y - m;
  const y1 = r.y + r.h + m;
  if (near(a.y, b.y)) return a.y > y0 && a.y < y1 && Math.max(a.x, b.x) > x0 && Math.min(a.x, b.x) < x1;
  return a.x > x0 && a.x < x1 && Math.max(a.y, b.y) > y0 && Math.min(a.y, b.y) < y1;
}

/** Length two collinear pieces of line share; zero when they are not on one line. */
function shared(a: Point, b: Point, c: Point, d: Point): number {
  if (near(a.y, b.y) && near(c.y, d.y) && near(a.y, c.y)) return Math.max(0, Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x)) - Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x)));
  if (near(a.x, b.x) && near(c.x, d.x) && near(a.x, c.x)) return Math.max(0, Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y)) - Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y)));
  return 0;
}

/** Whether two pieces of line cross at a point inside both. */
function crosses(a: Point, b: Point, c: Point, d: Point): boolean {
  const aFlat = near(a.y, b.y);
  if (aFlat === near(c.y, d.y)) return false;
  const [h0, h1, v0, v1] = aFlat ? [a, b, c, d] : [c, d, a, b];
  return v0.x > Math.min(h0.x, h1.x) && v0.x < Math.max(h0.x, h1.x) && h0.y > Math.min(v0.y, v1.y) && h0.y < Math.max(v0.y, v1.y);
}

function dedupe(values: number[]): number[] {
  return [...new Set(values)];
}

/** Coordinates between `a` and `b`, leaving `stub` at both ends, that a bend may take. */
function middles(a: number, b: number, ctx: RouteContext, channels: readonly number[]): number[] {
  const lo = Math.min(a, b) + ctx.stub;
  const hi = Math.max(a, b) - ctx.stub;
  if (lo > hi) return [];
  const mid = Math.floor((a + b) / 2 / ctx.step) * ctx.step;
  const wanted = [mid, ...[1, 2, 3].flatMap((k) => [mid + k * ctx.lane, mid - k * ctx.lane]), ...channels.flatMap((c) => [c, c + ctx.lane, c - ctx.lane])];
  return dedupe(wanted.filter((v) => v >= lo && v <= hi));
}

const same = (a: Point, b: Point): boolean => a.x === b.x && a.y === b.y;

/**
 * The way a line is read from `from` to `to`: down when the target stands in a later row, up when in an earlier one,
 * otherwise across. Undefined when the blocks overlap, as a block does with the group around it.
 */
function reading(from: Rect, to: Rect): Point | undefined {
  if (to.y >= from.y + from.h) return { x: 0, y: 1 };
  if (to.y + to.h <= from.y) return { x: 0, y: -1 };
  if (to.x >= from.x + from.w) return { x: 1, y: 0 };
  if (to.x + to.w <= from.x) return { x: -1, y: 0 };
  return undefined;
}

/** Every route of at most two bends between a face of `from` and a face of `to`. */
function candidates(from: Rect, to: Rect, ctx: RouteContext): Candidate[] {
  const out: Candidate[] = [];
  const bounds = ctx.bounds;
  for (const fa of facesAlong(from, ctx)) {
    for (const fb of facesAlong(to, ctx)) {
      const pa = fa.p;
      const pb = fb.p;
      const push = (pts: Point[]): number => out.push({ pts, exit: fa.d, enter: fb.d, off: fa.off === true || fb.off === true });
      if (flat(fa.d) && flat(fb.d)) {
        if (fa.d.x === -fb.d.x) {
          if ((pb.x - pa.x) * fa.d.x < 2 * ctx.stub) continue;
          if (near(pa.y, pb.y)) push([pa, pb]);
          else for (const m of middles(pa.x, pb.x, ctx, ctx.channelsX)) push([pa, { x: m, y: pa.y }, { x: m, y: pb.y }, pb]);
        } else {
          const beyond = fa.d.x > 0 ? Math.max(pa.x, pb.x) : Math.min(pa.x, pb.x);
          for (let k = 0; k <= (ctx.farthest ?? 2); k++) {
            const m = beyond + fa.d.x * (ctx.stub + ctx.around + k * ctx.lane);
            if (m >= bounds.x && m <= bounds.x + bounds.w) push([pa, { x: m, y: pa.y }, { x: m, y: pb.y }, pb]);
          }
        }
      } else if (!flat(fa.d) && !flat(fb.d)) {
        if (fa.d.y === -fb.d.y) {
          if ((pb.y - pa.y) * fa.d.y < 2 * ctx.stub) continue;
          if (near(pa.x, pb.x)) push([pa, pb]);
          else for (const m of middles(pa.y, pb.y, ctx, ctx.channelsY)) push([pa, { x: pa.x, y: m }, { x: pb.x, y: m }, pb]);
        } else {
          const beyond = fa.d.y > 0 ? Math.max(pa.y, pb.y) : Math.min(pa.y, pb.y);
          for (let k = 0; k <= (ctx.farthest ?? 2); k++) {
            const m = beyond + fa.d.y * (ctx.stub + ctx.around + k * ctx.lane);
            if (m >= bounds.y && m <= bounds.y + bounds.h) push([pa, { x: pa.x, y: m }, { x: pb.x, y: m }, pb]);
          }
        }
      } else if (flat(fa.d)) {
        const corner = { x: pb.x, y: pa.y };
        if ((corner.x - pa.x) * fa.d.x >= ctx.stub && (corner.y - pb.y) * fb.d.y >= ctx.stub) push([pa, corner, pb]);
      } else {
        const corner = { x: pa.x, y: pb.y };
        if ((corner.y - pa.y) * fa.d.y >= ctx.stub && (corner.x - pb.x) * fb.d.x >= ctx.stub) push([pa, corner, pb]);
      }
    }
  }
  return out;
}

const length = (pts: readonly Point[]): number => pts.reduce((s, p, i) => (i === 0 ? 0 : s + Math.abs(p.x - (pts[i - 1] as Point).x) + Math.abs(p.y - (pts[i - 1] as Point).y)), 0);

/**
 * The route of the line from the block `from` to the block `to`: the candidate with the fewest bends that crosses no
 * block, then the shortest one that keeps its distance from the blocks it passes, stays off lines other links use
 * and crosses as few of them as it can. A line goes through the middle of the gap it passes, and a second line in
 * that gap moves over by `lane`.
 */
export function route(from: Rect, to: Rect, ids: { from: string; to: string }, ctx: RouteContext): Point[] {
  let best: { pts: Point[]; cost: number } | undefined;
  const wanted = reading(from, to);
  for (const { pts, exit, enter, off } of candidates(from, to, ctx)) {
    let cost = (pts.length - 2) * 200 + length(pts) + (off ? OFF_MIDDLE : 0) + (ctx.score?.(pts) ?? 0);
    if (wanted !== undefined) cost += (same(exit, wanted) ? 0 : 300) + (same(enter, { x: -wanted.x, y: -wanted.y }) ? 0 : 300);
    // A line that leaves a face and comes back to a face that looks the same way doubles back around the blocks.
    const first = pts[1] as Point;
    const last = pts[pts.length - 2] as Point;
    if (pts.length === 4 && Math.sign(first.x - (pts[0] as Point).x) + Math.sign(first.y - (pts[0] as Point).y) === -(Math.sign((pts[3] as Point).x - last.x) + Math.sign((pts[3] as Point).y - last.y))) cost += 300;
    let blocked = false;
    for (let i = 0; i + 1 < pts.length && !blocked; i++) {
      const a = pts[i] as Point;
      const b = pts[i + 1] as Point;
      for (const o of ctx.obstacles) {
        if (cuts(a, b, o, ctx.clear)) {
          blocked = true;
          break;
        }
        const g = gap(a, b, o);
        if (g < 2 * ctx.lane) cost += (2 * ctx.lane - g) * 2;
      }
      if (blocked) break;
      for (const u of ctx.used) {
        if (u.from === ids.from || u.to === ids.to) continue;
        cost += shared(a, b, u.a, u.b) > 0 ? SHARED : 0;
        if (crosses(a, b, u.a, u.b)) cost += 40;
      }
    }
    if (!blocked && (best === undefined || cost < best.cost)) best = { pts, cost };
  }
  if (best !== undefined) return best.pts;
  const f = faces(from)[1] as Face;
  const t = faces(to)[3] as Face;
  return [f.p, t.p];
}

/** The pieces of a route, tagged with the blocks they join. */
export function segmentsOf(pts: readonly Point[], ids: { from: string; to: string }): Segment[] {
  return pts.slice(1).map((b, i) => ({ a: pts[i] as Point, b, from: ids.from, to: ids.to }));
}
