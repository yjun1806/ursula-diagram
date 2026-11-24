import { ACTOR_NAME_GAP, ACTOR_NAME_H } from '../layout/records.ts';
import type { Layout, Point } from '../types.ts';

/** Two runs side by side closer than this read as one, and at this or closer they touch. */
const NEAR = 12;
const TOUCHING = 6;
/** Runs that pass each other for less than this are not side by side. */
const BESIDE = 8;
/** Pieces of two lines as drawn are side by side when they pass each other for more than this. */
const ALONG = 24;
/** Two marks on one box closer than this lie on each other. */
const MARK = 12;
/** A bend is drawn rounded by this much, or by half of a run shorter than twice this. */
const BEND = 8;

type Run = readonly [Point, Point];

const flat = ([p, q]: Run): boolean => Math.abs(p.y - q.y) < 0.5;
const upright = ([p, q]: Run): boolean => Math.abs(p.x - q.x) < 0.5;
const runsOf = (pts: readonly Point[]): Run[] => pts.slice(1).map((q, i) => [pts[i] as Point, q] as const);

/** The turns of a line: the places where a run across meets a run down. */
function turns(pts: readonly Point[]): number {
  const down = runsOf(pts).map(([p, q]) => p.x === q.x);
  return down.slice(1).filter((d, i) => d !== down[i]).length;
}

/** The pieces of a line as it is drawn: its runs, each shortened where a bend is rounded, and a piece across each bend. */
function drawnPieces(pts: readonly Point[]): Run[] {
  const runs = runsOf(pts);
  const length = ([p, q]: Run): number => Math.hypot(q.x - p.x, q.y - p.y);
  const from = (p: Point, q: Point, by: number): Point => ({ x: p.x + ((q.x - p.x) * by) / (length([p, q]) || 1), y: p.y + ((q.y - p.y) * by) / (length([p, q]) || 1) });
  const round = runs.map((run, i) => (i === 0 ? 0 : Math.min(BEND, length(runs[i - 1] as Run) / 2, length(run) / 2)));
  return runs.flatMap(([p, q], i): Run[] => {
    const [a, b] = [from(p, q, round[i] ?? 0), from(q, p, round[i + 1] ?? 0)];
    return i === 0 ? [[a, b]] : [[from(p, (runs[i - 1] as Run)[0], round[i] ?? 0), a], [a, b]];
  });
}

/**
 * What makes a drawing with actors harder to read, counted: the turns of its lines, the crossings, the pairs of runs
 * side by side closer than `NEAR` and those at `TOUCHING` or closer, the pairs of runs one on the other that share no
 * trunk, the runs over the name under an actor, the lines that leave an actor away from what they join, the pairs of
 * pieces of two lines drawn side by side closer than `NEAR` for more than `ALONG`, the pairs of marks closer than
 * `MARK` at the ends of two lines on one box, whichever faces they end on, the pieces of a line drawn over or along
 * the edge of the label of another, and last the area of the canvas. `nameWidth` measures a name as it is written.
 */
export function faults(l: Layout, nameWidth: (name: string) => number): number[] {
  const lines = l.edges.map((e) => runsOf(e.points));
  let [crossings, near, touching, covered, named, away] = [0, 0, 0, 0, 0, 0];
  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      for (const a of lines[i] as Run[]) {
        for (const b of lines[j] as Run[]) {
          for (const [same, at, along] of [[flat(a) && flat(b), (p: Point) => p.y, (p: Point) => p.x], [upright(a) && upright(b), (p: Point) => p.x, (p: Point) => p.y]] as const) {
            const d = Math.abs(at(a[0]) - at(b[0]));
            if (!same || d >= NEAR) continue;
            const shared = Math.min(Math.max(along(a[0]), along(a[1])), Math.max(along(b[0]), along(b[1]))) - Math.max(Math.min(along(a[0]), along(a[1])), Math.min(along(b[0]), along(b[1])));
            if (shared <= BESIDE) continue;
            if (d <= 0.5) covered += l.edges[i]?.trunk !== undefined && l.edges[i]?.trunk?.id === l.edges[j]?.trunk?.id ? 0 : 1;
            else near++;
            if (d > 0.5 && d <= TOUCHING) touching++;
          }
          if ((flat(a) && upright(b)) || (upright(a) && flat(b))) {
            const [h, v] = flat(a) ? [a, b] : [b, a];
            const [x, y] = [v[0].x, h[0].y];
            if (x > Math.min(h[0].x, h[1].x) + 1 && x < Math.max(h[0].x, h[1].x) - 1 && y > Math.min(v[0].y, v[1].y) + 1 && y < Math.max(v[0].y, v[1].y) - 1) crossings++;
          }
        }
      }
    }
  }
  const middle = new Map(l.nodes.map((n) => [n.id, n.x + n.w / 2]));
  for (const n of l.nodes) {
    if (n.shape !== 'actor') continue;
    const w = nameWidth(n.title);
    const name = { x: n.x + n.w / 2 - w / 2, y: n.y + n.h, w, h: ACTOR_NAME_GAP + ACTOR_NAME_H };
    for (const line of lines) for (const [p, q] of line) if (Math.max(p.x, q.x) > name.x + 1 && Math.min(p.x, q.x) < name.x + name.w - 1 && Math.max(p.y, q.y) > name.y + 1 && Math.min(p.y, q.y) < name.y + name.h - 1) named++;
    for (const e of l.edges) {
      const [first, next, other] = e.from === n.id ? [e.points[0], e.points[1], e.to] : e.to === n.id ? [e.points[e.points.length - 1], e.points[e.points.length - 2], e.from] : [];
      if (first === undefined || next === undefined || other === undefined) continue;
      if (Math.sign(next.x - first.x) === -Math.sign((middle.get(other) ?? 0) - (middle.get(n.id) ?? 0))) away++;
    }
  }
  const marks = l.edges.flatMap((e) => [
    ...((e.startEnd ?? 'none') === 'none' ? [] : [{ e, on: e.from, at: e.points[0] }]),
    ...((e.end ?? 'arrow') === 'none' ? [] : [{ e, on: e.to, at: e.points[e.points.length - 1] }]),
  ]);
  const crowded = marks.flatMap((a, i) => marks.slice(i + 1).filter((b) => a.e !== b.e && a.on === b.on && !(a.e.trunk !== undefined && a.e.trunk.id === b.e.trunk?.id) && a.at !== undefined && b.at !== undefined && Math.hypot(a.at.x - b.at.x, a.at.y - b.at.y) < MARK)).length;
  const pieces = l.edges.map((e) => drawnPieces(e.points));
  let [beside, labelled] = [0, 0];
  l.edges.forEach((e, i) => {
    l.edges.slice(0, i).forEach((o, j) => {
      if (e.from === o.from && e.to === o.to) return;
      for (const a of pieces[i] as Run[]) {
        for (const b of pieces[j] as Run[]) {
          for (const [same, at, along] of [[flat(a) && flat(b), (p: Point) => p.y, (p: Point) => p.x], [upright(a) && upright(b), (p: Point) => p.x, (p: Point) => p.y]] as const) {
            const d = Math.abs(at(a[0]) - at(b[0]));
            if (same && d > 0.5 && d < NEAR && Math.min(Math.max(along(a[0]), along(a[1])), Math.max(along(b[0]), along(b[1]))) - Math.max(Math.min(along(a[0]), along(a[1])), Math.min(along(b[0]), along(b[1]))) > ALONG) beside++;
          }
        }
      }
    });
  });
  for (const { label, from, to, invisible } of l.edges) {
    if (label === undefined || invisible) continue;
    l.edges.forEach((e, i) => {
      if (!(e.from === from && e.to === to)) labelled += (pieces[i] as Run[]).filter(([p, q]) => Math.max(p.x, q.x) > label.x + 1 && Math.min(p.x, q.x) < label.x + label.w - 1 && Math.max(p.y, q.y) > label.y + 1 && Math.min(p.y, q.y) < label.y + label.h - 1).length;
    });
  }
  return [l.edges.reduce((sum, e) => sum + turns(e.points), 0), crossings, near, touching, covered, named, away, beside, crowded, labelled, l.width * l.height];
}

/** True when the first drawing has more of any fault than the second. */
export const worse = (a: readonly number[], b: readonly number[]): boolean => a.some((v, i) => v > (b[i] ?? 0));
