import { routeGlobally } from '../layout/global-route.ts';
import type { Diagnostic, Graph, LayoutCluster, LayoutEdge, LayoutNode, Point } from '../types.ts';

/** Distance between two lines on one face, and what a line keeps from a corner of the face. */
const PITCH = 64;
const CORNER = 8;
/** How many arrangements of the lines are routed at most while looking for fewer crossings. */
const BUDGET = 64;
/** What a line keeps from a box it passes, the least run out of a face before a turn, and the least distance of two lines side by side. */
const CLEAR = 8;
const RUN = 16;
const LANE = 16;
/** Distance between two places a bent line may cross over at, and how far a line going round may stand out. */
const STEP = 8;
const ROUND = 80;
/** A last run shorter than this leaves the arrowhead on the corner. */
const LAST_RUN = 24;
/** Prices, in pixels: a bend, a crossing, a crossed border, a line touching another, a line beside another, a line along a border or over a name. */
const BEND = 24;
const CROSS = 48;
const BORDER = 6;
const TOUCH = 200;
const NEAR = 100;
const ON_TOP = 1000;
const ALONG = 1000;
const HOOK = 2 * BEND;
/** What a run across rows gains in the middle of a free gap: less than a crossing, so that lines sharing a gap still nest. */
const MIDDLE = 24;
/** More bent lines than this on one face nest from the face instead of taking the middle of a gap. */
const CROWD = 2;
/** What a line keeps from a border it runs along, and the size of the self loop. */
const BORDER_NEAR = 12;
/** The room a run likes beside a box or border it runs along, what its label keeps from them, and the price of a pixel short. */
const ROOM = 32;
const LABEL_CLEAR = 8;
const ROOM_PRICE = 4;
/** What a line keeps from the edge of the canvas. */
const EDGE_ROOM = 8;
const LOOP = 24;

type Face = 0 | 1 | 2 | 3; // right, down, left, up: the direction out of the face
export type Rect = { x: number; y: number; w: number; h: number };
/** A place on a face of a box: `d` is the direction out of the face. */
interface Pin {
  x: number;
  y: number;
  d: Face;
}
type Pins = Array<{ from: Pin; to: Pin } | undefined>;

const DX = [1, 0, -1, 0] as const;
const DY = [0, 1, 0, -1] as const;

const tidy = (v: number): number => {
  const r = Math.round(v * 1e6) / 1e6;
  return r === 0 ? 0 : r;
};

export interface LineScene {
  graph: Graph;
  nodes: readonly LayoutNode[];
  clusters: readonly LayoutCluster[];
  width: number;
  height: number;
  /** True when cluster `cid` holds node or cluster `id`. */
  holds: (cid: string, id: string) => boolean;
  labelOf: (i: number) => { w: number; h: number } | undefined;
  /** Where the name of a cluster will be written: a line keeps off it. */
  nameOf?: (id: string) => Rect | undefined;
}

interface End {
  edge: number;
  face: Face;
  /** The other end's place along this face, which orders the lines on it; then how far the other end is. */
  toward: number;
  far: number;
  straight: boolean;
}

/** Offsets from the middle of a face for `m` lines: symmetric, `pitch` apart, the middle taken when `m` is odd. */
export function symmetric(m: number, pitch: number): number[] {
  const out: number[] = [];
  const half = Math.floor(m / 2);
  for (let k = -half; k <= half; k++) if (k !== 0 || m % 2 === 1) out.push(k * pitch);
  return out;
}

/** The face of `box` that looks at `other`: up or down when they stand in different rows, else left or right. */
function faceTo(box: Rect, other: Rect): Face {
  if (other.y + other.h <= box.y) return 3;
  if (other.y >= box.y + box.h) return 1;
  return other.x + other.w / 2 < box.x + box.w / 2 ? 2 : 0;
}

const pointOn = (box: Rect, face: Face, off: number): Point =>
  face === 1 || face === 3 ? { x: tidy(box.x + box.w / 2 + off), y: face === 1 ? box.y + box.h : box.y } : { x: face === 0 ? box.x + box.w : box.x, y: tidy(box.y + box.h / 2 + off) };

const segs = (pts: readonly Point[]): Array<[Point, Point]> => pts.slice(1).map((q, i) => [pts[i] as Point, q]);
const bendsOf = (pts: readonly Point[]): number => Math.max(0, pts.length - 2);
const lengthOf = (pts: readonly Point[]): number => segs(pts).reduce((m, [a, b]) => m + Math.abs(a.x - b.x) + Math.abs(a.y - b.y), 0);

/** A straight run: `h` when it runs across, `c` where it stands, `lo..hi` its extent. */
interface Run {
  h: boolean;
  c: number;
  lo: number;
  hi: number;
}
const runOf = ([a, b]: [Point, Point]): Run => (Math.abs(a.y - b.y) < 1e-6 ? { h: true, c: a.y, lo: Math.min(a.x, b.x), hi: Math.max(a.x, b.x) } : { h: false, c: a.x, lo: Math.min(a.y, b.y), hi: Math.max(a.y, b.y) });
const runsOf = (pts: readonly Point[]): Run[] => segs(pts).filter(([a, b]) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y) > 1e-6).map(runOf);

/** What two lines cost together: crossings, and the price of touching or running beside each other. */
function between(a: readonly Run[], b: readonly Run[]): { cross: number; penalty: number } {
  let cross = 0;
  let penalty = 0;
  for (const s of a) {
    for (const t of b) {
      if (s.h === t.h) {
        const over = Math.min(s.hi, t.hi) - Math.max(s.lo, t.lo);
        const d = Math.abs(s.c - t.c);
        // Two runs into one crowded face stand as close as their places on it.
        const oneFace = Math.abs(s.lo - t.lo) < 0.5 || Math.abs(s.hi - t.hi) < 0.5;
        if (over > 0.5 && d < LANE - 1e-6 && (d < 1 || !oneFace)) penalty += (d < 1 ? ON_TOP : NEAR) + 2 * over;
        continue;
      }
      // `t` across `s`: crossing inside both, or one ending on or right by the other.
      if (t.c > s.lo + 1 && t.c < s.hi - 1 && s.c > t.lo + 1 && s.c < t.hi - 1) cross++;
      else if (t.c > s.lo - 4 && t.c < s.hi + 4 && s.c > t.lo - 4 && s.c < t.hi + 4) penalty += TOUCH;
    }
  }
  return { cross, penalty };
}

/** True when the inside of the box, shrunk by `by` (grown when negative), meets the run. */
const hits = (r: Run, box: Rect, by: number): boolean =>
  r.h
    ? r.c > box.y + by && r.c < box.y + box.h - by && r.hi > box.x + by && r.lo < box.x + box.w - by
    : r.c > box.x + by && r.c < box.x + box.w - by && r.hi > box.y + by && r.lo < box.y + box.h - by;

/**
 * The shapes a line may take between two places on faces with no more than two bends: straight, one bend, or two bends
 * with the middle run at one of the places between the ends (or round beyond both, when the faces look the same way).
 * `prefer` is a small price that keeps the turn of a line across rows near its start, or near its end when `atEnd`.
 */
function shapes(p: Pin, q: Pin, atEnd = false, gapMids: (x0: number, x1: number) => number[] = () => []): Array<{ pts: Point[]; prefer: number }> {
  const vp = p.d % 2 === 1;
  const vq = q.d % 2 === 1;
  if (vp !== vq) {
    const corner = vp ? { x: p.x, y: q.y } : { x: q.x, y: p.y };
    const run1 = vp ? (corner.y - p.y) * DY[p.d] : (corner.x - p.x) * DX[p.d];
    const run2 = vq ? (corner.y - q.y) * DY[q.d] : (corner.x - q.x) * DX[q.d];
    return run1 >= RUN - 1e-6 && run2 >= RUN - 1e-6 ? [{ pts: [p, corner, q], prefer: 0 }] : [];
  }
  const along = (t: Pin): number => (vp ? t.y : t.x);
  const across = (t: Pin): number => (vp ? t.x : t.y);
  const sp = vp ? DY[p.d] : DX[p.d];
  const sq = vq ? DY[q.d] : DX[q.d];
  const make = (m: number): Point[] => (vp ? [p, { x: p.x, y: m }, { x: q.x, y: m }, q] : [p, { x: m, y: p.y }, { x: m, y: q.y }, q]);
  const out: Array<{ pts: Point[]; prefer: number }> = [];
  if (sp === -sq) {
    const gap = (along(q) - along(p)) * sp;
    if (gap <= 0) return out;
    if (Math.abs(across(p) - across(q)) < 0.5) return [{ pts: [p, q], prefer: 0 }];
    if (gap < 2 * RUN - 1e-6) return out;
    const from = along(p) + sp * RUN;
    const to = along(q) - sp * RUN;
    // A line across rows turns near the end whose face is more crowded, so that the farther lines turn nearer it and
    // pass round the nearer ones, and best in the middle of a free gap between rows; across columns, half way.
    const wish = vp ? (atEnd ? to : from) : (along(p) + along(q)) / 2;
    const mids = vp ? gapMids(Math.min(p.x, q.x), Math.max(p.x, q.x)).filter((m) => (m - from) * sp >= -1e-6 && (m - to) * sp <= 1e-6) : [];
    const ms = new Set<number>();
    for (let m = from; (m - to) * sp <= 1e-6; m += sp * STEP) ms.add(tidy(m));
    ms.add(tidy(to));
    ms.add(tidy(wish));
    for (const m of mids) ms.add(tidy(m));
    const atMiddle = (m: number): boolean => mids.some((c) => Math.abs(m - c) < 0.5);
    for (const m of ms) out.push({ pts: make(m), prefer: 0.5 * Math.abs(m - wish) - (atMiddle(m) ? MIDDLE : 0) });
    return out;
  }
  const base = sp > 0 ? Math.max(along(p), along(q)) + RUN : Math.min(along(p), along(q)) - RUN;
  for (let k = 0; k <= ROUND; k++) out.push({ pts: make(tidy(base + sp * k * STEP)), prefer: 0 });
  return out;
}

/**
 * The lines of a grid drawing. A line between two elements of one column or one row with nothing between them runs
 * straight from middle to middle. A bent line leaves by the face toward the other end and enters by the face toward
 * it, or by a side, with one bend where it can and two where it cannot. The lines on one face stand 64 apart (closer on
 * a short face): beside the straight line that holds the middle, or symmetric about the middle. Of the arrangements
 * that keep to this, the one where lines touch or run beside each other least, then cross least, then bend least and
 * then are shortest, is kept.
 */
export function drawLines(scene: LineScene): { edges: LayoutEdge[]; diagnostics: Diagnostic[] } {
  const { graph, nodes, clusters, holds } = scene;
  const boxOf = new Map<string, Rect>();
  for (const n of nodes) boxOf.set(n.id, { x: n.x, y: n.y, w: n.w, h: n.h });
  for (const c of clusters) boxOf.set(c.id, { x: c.x, y: c.y, w: c.w, h: c.h });
  const nodeIds = new Set(nodes.map((n) => n.id));
  const clusterIds = new Set(clusters.map((c) => c.id));
  const boxes = [...nodes.map((n) => ({ id: n.id, box: boxOf.get(n.id) as Rect, cluster: false })), ...clusters.map((c) => ({ id: c.id, box: boxOf.get(c.id) as Rect, cluster: true }))];
  const names = clusters.flatMap((c) => {
    const r = scene.nameOf?.(c.id);
    return r === undefined ? [] : [r];
  });
  // The rows under a run across them are cut by the tops and bottoms of the boxes, the borders and the names of the
  // clusters that stand over the run; it stands best in the middle between two of these lines next to each other.
  const rowCuts = [...boxes.map(({ box }) => box), ...names];
  const gapMids = (x0: number, x1: number): number[] => {
    const ys = [...new Set(rowCuts.filter((r) => r.x < x1 + 0.5 && r.x + r.w > x0 - 0.5).flatMap((r) => [tidy(r.y), tidy(r.y + r.h)]))].sort((a, b) => a - b);
    return ys.slice(1).map((y, k) => ((ys[k] as number) + y) / 2);
  };
  /** True when a straight run touches no box but its ends' and goes through no cluster that holds neither end. */
  const runClear = (a: Point, b: Point, ends: [string, string]): boolean => {
    const [x0, x1] = [Math.min(a.x, b.x), Math.max(a.x, b.x)];
    const [y0, y1] = [Math.min(a.y, b.y), Math.max(a.y, b.y)];
    for (const { id, box, cluster } of boxes) {
      if (ends.includes(id)) continue;
      if (cluster && (holds(id, ends[0]) || holds(id, ends[1]))) continue;
      if (x1 > box.x + 0.5 && x0 < box.x + box.w - 0.5 && y1 > box.y + 0.5 && y0 < box.y + box.h - 0.5) return false;
    }
    return true;
  };

  // Lines drawn as they are: a loop for a relation of a box with itself, and a straight run out to the border of the
  // cluster that holds the other end.
  const fixed = new Map<number, Point[]>();
  const usedFace = new Set<string>();
  graph.edges.forEach((e, i) => {
    const a = boxOf.get(e.from);
    const b = boxOf.get(e.to);
    if (a === undefined || b === undefined) return;
    if (e.from === e.to) {
      const [x, y] = [a.x + a.w, a.y + a.h / 2];
      fixed.set(i, [{ x, y: y - LOOP / 2 }, { x: x + LOOP, y: y - LOOP / 2 }, { x: x + LOOP, y: y + LOOP / 2 }, { x, y: y + LOOP / 2 }]);
      return;
    }
    const outer = clusterIds.has(e.to) && holds(e.to, e.from) ? 'to' : clusterIds.has(e.from) && holds(e.from, e.to) ? 'from' : undefined;
    if (outer === undefined) return;
    const [inner, wall] = outer === 'to' ? [a, b] : [b, a];
    const ends: [string, string] = [e.from, e.to];
    const innerId = outer === 'to' ? e.from : e.to;
    // Right, left, down, up: the first face no other such line of this box uses and whose run is clear.
    const tries = ([0, 2, 1, 3] as const).map((f) => {
      const p = pointOn(inner, f, 0);
      const q = f === 0 ? { x: wall.x + wall.w, y: p.y } : f === 2 ? { x: wall.x, y: p.y } : f === 1 ? { x: p.x, y: wall.y + wall.h } : { x: p.x, y: wall.y };
      return { f, pts: outer === 'to' ? [p, q] : [q, p] };
    });
    const pick = tries.find((t) => !usedFace.has(`${innerId}:${t.f}`) && runClear(t.pts[0] as Point, t.pts[1] as Point, ends)) ?? tries.find((t) => !usedFace.has(`${innerId}:${t.f}`)) ?? (tries[0] as (typeof tries)[number]);
    usedFace.add(`${innerId}:${pick.f}`);
    fixed.set(i, pick.pts);
  });

  // The faces each line may use: the straight pair, or the bent ones in the order they are tried. A line to a cluster
  // runs straight to its border where the other end stands level with it.
  const straight = new Set<number>();
  const heldOff = new Map<string, number>();
  const natural: Array<[Face, Face] | undefined> = graph.edges.map((e, i) => {
    const a = boxOf.get(e.from);
    const b = boxOf.get(e.to);
    if (a === undefined || b === undefined || fixed.has(i)) return undefined;
    const fa = faceTo(a, b);
    const fb = faceTo(b, a);
    if (nodeIds.has(e.from) && nodeIds.has(e.to)) {
      const level = Math.abs(a.x + a.w / 2 - (b.x + b.w / 2)) < 0.5 || Math.abs(a.y + a.h / 2 - (b.y + b.h / 2)) < 0.5;
      if (level && runClear(pointOn(a, fa, 0), pointOn(b, fb, 0), [e.from, e.to])) straight.add(i);
      return [fa, fb];
    }
    // The middle of the smaller end stands across from the border of the other: a straight run at that middle.
    const flat = fa % 2 === 1;
    const [small, big] = (flat ? a.w <= b.w : a.h <= b.h) ? [a, b] : [b, a];
    const mid = flat ? small.x + small.w / 2 : small.y + small.h / 2;
    const [lo, hi] = flat ? [big.x + CORNER, big.x + big.w - CORNER] : [big.y + CORNER, big.y + big.h - CORNER];
    if (mid >= lo && mid <= hi) {
      const offA = mid - (flat ? a.x + a.w / 2 : a.y + a.h / 2);
      const offB = mid - (flat ? b.x + b.w / 2 : b.y + b.h / 2);
      if (runClear(pointOn(a, fa, offA), pointOn(b, fb, offB), [e.from, e.to])) {
        straight.add(i);
        heldOff.set(`${i}:${e.from}:${fa}`, offA);
        heldOff.set(`${i}:${e.to}:${fb}`, offB);
      }
    }
    return [fa, fb];
  });
  /**
   * What a line costs on its own: undefined when it goes through a box or a cluster it may not; else the price of what it
   * runs along or over, or of an arrowhead right on a corner, and the small price of the borders it crosses.
   */
  const ownCost = (pts: readonly Point[], i: number): { penalty: number; soft: number } | undefined => {
    const e = graph.edges[i] as { from: string; to: string };
    const size = scene.labelOf(i);
    let cost = 0;
    let soft = 0;
    for (const r of runsOf(pts)) {
      for (const { id, box, cluster } of boxes) {
        const end = id === e.from || id === e.to;
        if (!cluster) {
          if (hits(r, box, end ? 0.5 : -CLEAR)) return undefined;
          continue;
        }
        const holdsEnd = holds(id, e.from) || holds(id, e.to);
        if (!holdsEnd && hits(r, box, 0.5)) return undefined;
        // Along a border, close by; across one.
        const sides: Run[] = [
          { h: true, c: box.y, lo: box.x, hi: box.x + box.w },
          { h: true, c: box.y + box.h, lo: box.x, hi: box.x + box.w },
          { h: false, c: box.x, lo: box.y, hi: box.y + box.h },
          { h: false, c: box.x + box.w, lo: box.y, hi: box.y + box.h },
        ];
        for (const s of sides) {
          if (s.h === r.h) {
            if (Math.abs(s.c - r.c) < BORDER_NEAR - 1e-6 && Math.min(s.hi, r.hi) - Math.max(s.lo, r.lo) > 0.5) cost += ALONG;
          } else if (s.c > r.lo + 0.5 && s.c < r.hi - 0.5 && r.c > s.lo && r.c < s.hi) soft += BORDER;
        }
      }
      for (const n of names) if (hits(r, n, -4)) cost += ALONG;
      // Room beside a box or a border it runs along: a lane's worth, or half its label and a gap when it is wider.
      const want = Math.max(ROOM, r.h ? 0 : (size?.w ?? 0) / 2 + LABEL_CLEAR);
      for (const { box } of boxes) {
        const sides = r.h ? [box.y, box.y + box.h] : [box.x, box.x + box.w];
        const [lo, hi] = r.h ? [box.x, box.x + box.w] : [box.y, box.y + box.h];
        if (Math.min(hi, r.hi) - Math.max(lo, r.lo) <= 0.5) continue;
        for (const c of sides) {
          const d = Math.abs(c - r.c);
          if (d > 0.5 && d < want) soft += (want - d) * ROOM_PRICE;
        }
      }
    }
    const last = segs(pts).at(-1);
    if (pts.length > 2 && last !== undefined && Math.abs(last[0].x - last[1].x) + Math.abs(last[0].y - last[1].y) < LAST_RUN) cost += HOOK;
    return { penalty: cost, soft };
  };

  const count = new Map<string, number>();
  natural.forEach((f, i) => {
    const e = graph.edges[i];
    if (f === undefined || e === undefined) return;
    count.set(`${e.from}:${f[0]}`, (count.get(`${e.from}:${f[0]}`) ?? 0) + 1);
    count.set(`${e.to}:${f[1]}`, (count.get(`${e.to}:${f[1]}`) ?? 0) + 1);
  });
  // The lines on each face as the lines are given their faces in turn: a line moved off a face frees it for the next.
  const taken = new Map(count);
  const optionsOf = (e: (typeof graph.edges)[number], i: number, give: boolean): Array<[Face, Face]> => {
    const f = natural[i];
    if (f === undefined) return [];
    if (straight.has(i) || !nodeIds.has(e.from) || !nodeIds.has(e.to)) return [f];
    // Two boxes of one row with something between them: round it, below or above.
    if (f[0] % 2 === 0) return [f, [1, 1], [3, 3]];
    const [a, b] = [boxOf.get(e.from) as Rect, boxOf.get(e.to) as Rect];
    const side = (box: Rect, other: Rect): Face => (other.x + other.w / 2 < box.x + box.w / 2 ? 2 : 0);
    const out: Array<[Face, Face]> = [];
    const add = (o: [Face, Face]): void => {
      if (!out.some((x) => x[0] === o[0] && x[1] === o[1])) out.push(o);
    };
    // One bend by a side that has no line of its own yet, the end whose face toward the other is shared moving first, so
    // that a face carries one line to another box where the box has a face to spare; then the faces toward each other,
    // the sides toward each other through the gap between the columns, and round on either side.
    const freeFrom = (taken.get(`${e.from}:${side(a, b)}`) ?? 0) === 0;
    const freeTo = (taken.get(`${e.to}:${side(b, a)}`) ?? 0) === 0;
    const sharedFrom = (taken.get(`${e.from}:${f[0]}`) ?? 0) > 1;
    const sharedTo = (taken.get(`${e.to}:${f[1]}`) ?? 0) > 1;
    const byFrom = freeFrom && (sharedFrom || !sharedTo);
    const byTo = freeTo && (sharedTo || !sharedFrom);
    if (byFrom && (sharedFrom || !byTo)) add([side(a, b), f[1]]);
    if (byTo) add([f[0], side(b, a)]);
    if (byFrom) add([side(a, b), f[1]]);
    // Any other face with no line of its own, at the end whose face toward the other is shared.
    const faces: Face[] = [0, 1, 2, 3];
    if (sharedFrom) for (const d of faces) if ((taken.get(`${e.from}:${d}`) ?? 0) === 0) add([d, f[1]]);
    if (sharedTo) for (const d of faces) if ((taken.get(`${e.to}:${d}`) ?? 0) === 0) add([f[0], d]);
    add(f);
    add([f[0], side(b, a)]);
    add([side(a, b), f[1]]);
    add([side(a, b), side(b, a)]);
    add([0, 0]);
    add([2, 2]);
    // The pairs of faces with a clear shape between their middles, in that order; all of them when none has one.
    const clear = out.filter(([fa, fb]) => shapes({ ...pointOn(a, fa, 0), d: fa }, { ...pointOn(b, fb, 0), d: fb }).some((sh) => ownCost(sh.pts, i) !== undefined));
    const list = clear.length > 0 ? clear : out;
    if (!give) return list;
    const first = list[0] as [Face, Face];
    for (const [id, was, now] of [[e.from, f[0], first[0]], [e.to, f[1], first[1]]] as const) {
      if (was === now) continue;
      taken.set(`${id}:${was}`, (taken.get(`${id}:${was}`) ?? 1) - 1);
      taken.set(`${id}:${now}`, (taken.get(`${id}:${now}`) ?? 0) + 1);
    }
    return list;
  };
  // The lines with fewer faces they may use choose first.
  const options: Array<Array<[Face, Face]>> = graph.edges.map(() => []);
  const turn = graph.edges.map((e, i) => ({ i, n: optionsOf(e, i, false).length })).sort((x, y) => x.n - y.n || x.i - y.i);
  for (const { i } of turn) options[i] = optionsOf(graph.edges[i] as (typeof graph.edges)[number], i, true);

  const pinsOf = (choice: readonly number[], orders: ReadonlyMap<string, number[]>, flips: ReadonlySet<string>): Pins => {
    const faces = options.map((o, i) => o[choice[i] as number]);
    const ends = new Map<string, End[]>();
    faces.forEach((f, i) => {
      const e = graph.edges[i];
      if (f === undefined || e === undefined) return;
      const [a, b] = [boxOf.get(e.from) as Rect, boxOf.get(e.to) as Rect];
      for (const [id, face, own, other] of [[e.from, f[0], a, b], [e.to, f[1], b, a]] as const) {
        const toward = face % 2 === 1 ? other.x + other.w / 2 : other.y + other.h / 2;
        const far = face % 2 === 1 ? Math.abs(other.y - own.y) : Math.abs(other.x - own.x);
        const k = `${id}:${face}`;
        ends.set(k, [...(ends.get(k) ?? []), { edge: i, face, toward, far, straight: straight.has(i) }]);
      }
    });
    const pitchOf = (id: string, face: Face): number => {
      const box = boxOf.get(id) as Rect;
      return Math.min(PITCH, (face % 2 === 1 ? box.w : box.h) / ((ends.get(`${id}:${face}`)?.length ?? 1) + 1));
    };
    // Straight lines of one pair of nodes share their offsets at both ends.
    const pairs = new Map<string, number[]>();
    for (const i of straight) {
      const e = graph.edges[i] as { from: string; to: string };
      if (!nodeIds.has(e.from) || !nodeIds.has(e.to)) continue;
      const k = [e.from, e.to].sort().join('\u0000');
      pairs.set(k, [...(pairs.get(k) ?? []), i]);
    }
    const fixedOf = new Map<string, number>(heldOff);
    for (const list of pairs.values()) {
      const e = graph.edges[list[0] as number] as { from: string; to: string };
      const f = faces[list[0] as number] as [Face, Face];
      const pitch = Math.min(pitchOf(e.from, f[0]), pitchOf(e.to, f[1]));
      symmetric(list.length, pitch).forEach((off, k) => {
        const i = list[k] as number;
        const g = graph.edges[i] as { from: string; to: string };
        const h = faces[i] as [Face, Face];
        fixedOf.set(`${i}:${g.from}:${h[0]}`, off);
        fixedOf.set(`${i}:${g.to}:${h[1]}`, off);
      });
    }
    const offset = new Map<string, number>();
    for (const [k, list] of ends) {
      const id = k.slice(0, k.lastIndexOf(':'));
      const face = Number(k.slice(k.lastIndexOf(':') + 1)) as Face;
      const box = boxOf.get(id) as Rect;
      const mid = face % 2 === 1 ? box.x + box.w / 2 : box.y + box.h / 2;
      const pitch = pitchOf(id, face);
      // A crowded face keeps less from its corners, so that every line has a place of its own on it.
      const half = (face % 2 === 1 ? box.w : box.h) / 2 - Math.min(CORNER, pitch / 2);
      const held = list.filter((x) => x.straight);
      for (const x of held) offset.set(`${x.edge}:${k}`, fixedOf.get(`${x.edge}:${k}`) ?? 0);
      // Left to right (top to bottom on a side): by where the other end is; of two toward one place, the nearer one outside.
      const asked = orders.get(k);
      const rest = list
        .filter((x) => !x.straight)
        .sort((x, y) => (asked === undefined ? x.toward - y.toward || (x.toward < mid ? x.far - y.far : y.far - x.far) || x.edge - y.edge : asked.indexOf(x.edge) - asked.indexOf(y.edge)));
      let offs: number[];
      if (held.length === 0) offs = symmetric(rest.length, pitch);
      else {
        // Beside the straight lines: as many on the low side as look to it, nearest the middle first; a full side sends the rest over.
        const used = held.map((x) => fixedOf.get(`${x.edge}:${k}`) ?? 0);
        const slots = (sign: number): number[] => {
          const out: number[] = [];
          for (let n = 1; n * pitch <= half + 1e-6; n++) if (used.every((u) => Math.abs(u - sign * n * pitch) > 1)) out.push(sign * n * pitch);
          return out;
        };
        const lows = rest.filter((x) => (x.toward < mid) !== flips.has(`${x.edge}:${k}`)).length;
        const [neg, pos] = [slots(-1), slots(1)];
        const nLow = Math.min(neg.length, Math.max(lows, rest.length - pos.length));
        offs = [...neg.slice(0, nLow).reverse(), ...pos.slice(0, rest.length - nLow)];
      }
      rest.forEach((x, n) => offset.set(`${x.edge}:${k}`, offs[n] ?? 0));
    }
    return graph.edges.map((e, i) => {
      const f = faces[i];
      if (f === undefined) return undefined;
      const p = pointOn(boxOf.get(e.from) as Rect, f[0], offset.get(`${i}:${e.from}:${f[0]}`) ?? 0);
      const q = pointOn(boxOf.get(e.to) as Rect, f[1], offset.get(`${i}:${e.to}:${f[1]}`) ?? 0);
      return { from: { ...p, d: f[0] }, to: { ...q, d: f[1] } };
    });
  };

  /** The lines routed between their pins; `failed` are the edges that found no shape between them. */
  const route = (pins: Pins): { lines: Point[][]; failed: number[] } => {
    const lines: Array<Point[] | undefined> = graph.edges.map((_, i) => {
      const pin = pins[i];
      if (fixed.has(i)) return fixed.get(i) as Point[];
      if (pin === undefined) return [];
      return straight.has(i) ? [{ x: pin.from.x, y: pin.from.y }, { x: pin.to.x, y: pin.to.y }] : undefined;
    });
    const runs: Array<Run[] | undefined> = lines.map((l) => (l === undefined ? undefined : runsOf(l)));
    const todo = graph.edges.flatMap((_, i) => (lines[i] === undefined ? [i] : []));
    const span = (i: number): number => {
      const pin = pins[i] as { from: Pin; to: Pin };
      return Math.abs(pin.from.x - pin.to.x) + Math.abs(pin.from.y - pin.to.y);
    };
    // The longest first: it takes the lane nearest the crowded face, and the shorter ones turn inside it.
    todo.sort((x, y) => span(y) - span(x) || x - y);
    const load = new Map<string, number>();
    const faceKey = (i: number, end: 'from' | 'to'): string => {
      const e = graph.edges[i] as { from: string; to: string };
      return `${e[end]}:${(pins[i] as { from: Pin; to: Pin })[end].d}`;
    };
    for (const i of todo) for (const end of ['from', 'to'] as const) load.set(faceKey(i, end), (load.get(faceKey(i, end)) ?? 0) + 1);
    const best = (i: number): { pts: Point[]; cost: number } | undefined => {
      const pin = pins[i] as { from: Pin; to: Pin };
      let out: { pts: Point[]; cost: number } | undefined;
      const [loadFrom, loadTo] = [load.get(faceKey(i, 'from')) ?? 0, load.get(faceKey(i, 'to')) ?? 0];
      // Lines that crowd a face nest round each other from that face; the middle of a gap is for the few.
      for (const s of shapes(pin.from, pin.to, loadTo > loadFrom, Math.max(loadFrom, loadTo) <= CROWD ? gapMids : undefined)) {
        const pts = s.pts.map((p) => ({ x: tidy(p.x), y: tidy(p.y) }));
        const own = ownCost(pts, i);
        if (own === undefined) continue;
        let cost = own.penalty + own.soft + s.prefer + BEND * bendsOf(pts) + lengthOf(pts);
        const mine = runsOf(pts);
        runs.forEach((o, j) => {
          if (j === i || o === undefined) return;
          const t = between(mine, o);
          cost += t.penalty + CROSS * t.cross;
        });
        if (out === undefined || cost < out.cost - 1e-6) out = { pts, cost };
      }
      return out;
    };
    const failed: number[] = [];
    for (const i of todo) {
      const got = best(i);
      if (got === undefined) failed.push(i);
      else {
        lines[i] = got.pts;
        runs[i] = runsOf(got.pts);
      }
    }
    // Each line taken out and drawn again against all the others.
    for (const i of todo) {
      if (failed.includes(i)) continue;
      const keep = runs[i];
      runs[i] = undefined;
      const got = best(i);
      if (got !== undefined) {
        lines[i] = got.pts;
        runs[i] = runsOf(got.pts);
      } else runs[i] = keep;
    }
    return { lines: lines.map((l, i) => l ?? [{ x: (pins[i] as { from: Pin }).from.x, y: (pins[i] as { from: Pin }).from.y }, { x: (pins[i] as { to: Pin }).to.x, y: (pins[i] as { to: Pin }).to.y }]), failed };
  };

  /** Lines that fail, then what lines cost together and alone, crossings, bends and length, in the order they decide between two drawings. */
  const priceOf = (got: { lines: Point[][]; failed: number[] }): number[] => {
    const runs = got.lines.map((l) => runsOf(l));
    let penalty = 0;
    let soft = 0;
    let cross = 0;
    for (let i = 0; i < runs.length; i++) {
      const own = got.failed.includes(i) ? undefined : ownCost(got.lines[i] as Point[], i);
      penalty += own?.penalty ?? 0;
      soft += own?.soft ?? 0;
      for (let j = i + 1; j < runs.length; j++) {
        const t = between(runs[i] as Run[], runs[j] as Run[]);
        penalty += t.penalty;
        cross += t.cross;
      }
    }
    return [got.failed.length, penalty, cross, got.lines.reduce((n, l) => n + bendsOf(l), 0), soft + got.lines.reduce((n, l) => n + lengthOf(l), 0)];
  };
  const better = (x: number[], y: number[]): boolean => {
    for (let i = 0; i < x.length; i++) if (Math.abs((x[i] as number) - (y[i] as number)) > 1e-6) return (x[i] as number) < (y[i] as number);
    return false;
  };

  // Look for a better drawing: another allowed pair of faces for one line, or two neighbours on one face swapped.
  let choice = options.map(() => 0);
  let orders = new Map<string, number[]>();
  let flips = new Set<string>();
  let pins = pinsOf(choice, orders, flips);
  let best = route(pins);
  let price = priceOf(best);
  let spent = 1;
  const faceLists = (): Array<[string, number[]]> => {
    const lists = new Map<string, number[]>();
    graph.edges.forEach((e, i) => {
      const f = options[i]?.[choice[i] as number];
      if (f === undefined || straight.has(i)) return;
      for (const k of [`${e.from}:${f[0]}`, `${e.to}:${f[1]}`]) lists.set(k, [...(lists.get(k) ?? []), i]);
    });
    return [...lists].filter(([, l]) => l.length > 1);
  };
  for (let round = 0; round < 3 && (price[0] as number) + (price[1] as number) + (price[2] as number) > 0; round++) {
    let improved = false;
    const tries: Array<() => { choice: number[]; orders: Map<string, number[]>; flips: Set<string> }> = [];
    // The lines that fail first: every other pair of faces they may use.
    const order = graph.edges.map((_, i) => i).sort((x, y) => Number(best.failed.includes(y)) - Number(best.failed.includes(x)) || x - y);
    for (const i of order) {
      const o = options[i] as Array<[Face, Face]>;
      for (let k = 0; k < o.length; k++) if (k !== choice[i]) tries.push(() => ({ choice: choice.map((c, j) => (j === i ? k : c)), orders, flips }));
    }
    // A bent line beside a straight one may stand on the other side of it.
    graph.edges.forEach((e, i) => {
      const f = options[i]?.[choice[i] as number];
      if (f === undefined || straight.has(i)) return;
      for (const k of [`${e.from}:${f[0]}`, `${e.to}:${f[1]}`]) {
        const held = graph.edges.some((o, j) => straight.has(j) && [`${o.from}:${options[j]?.[0]?.[0]}`, `${o.to}:${options[j]?.[0]?.[1]}`].includes(k));
        if (!held) continue;
        const flag = `${i}:${k}`;
        tries.push(() => {
          const next = new Set(flips);
          if (next.has(flag)) next.delete(flag);
          else next.add(flag);
          return { choice, orders, flips: next };
        });
      }
    });
    for (const [k] of faceLists()) {
      const current = (): number[] => {
        // The order the lines stand in now on this face: by their pins.
        const [id, face] = [k.slice(0, k.lastIndexOf(':')), Number(k.slice(k.lastIndexOf(':') + 1))];
        const along = (i: number): number => {
          const e = graph.edges[i] as { from: string };
          const p = (pins[i] as { from: Pin; to: Pin })[e.from === id && (pins[i] as { from: Pin }).from.d === face ? 'from' : 'to'];
          return face % 2 === 1 ? p.x : p.y;
        };
        return (faceLists().find(([q]) => q === k)?.[1] ?? []).sort((a, b) => along(a) - along(b));
      };
      const n = current().length;
      for (let s = 0; s + 1 < n; s++) {
        tries.push(() => {
          const now = current();
          const swapped = [...now];
          [swapped[s], swapped[s + 1]] = [now[s + 1] as number, now[s] as number];
          return { choice, orders: new Map([...orders, [k, swapped]]), flips };
        });
      }
    }
    for (const make of tries) {
      if (spent >= BUDGET) break;
      const next = make();
      const nextPins = pinsOf(next.choice, next.orders, next.flips);
      const got = route(nextPins);
      spent++;
      const p = priceOf(got);
      if (better(p, price)) {
        choice = next.choice;
        orders = next.orders;
        flips = next.flips;
        pins = nextPins;
        best = got;
        price = p;
        improved = true;
      }
    }
    if (!improved || spent >= BUDGET) break;
  }

  // A line with no shape between its places is routed freely, and reported.
  const diagnostics: Diagnostic[] = [];
  let lines = best.lines;
  if (best.failed.length > 0) {
    const again = routeGlobally({
      width: scene.width,
      height: scene.height,
      nodes: nodes.map((n) => ({ id: n.id, x: n.x, y: n.y, w: n.w, h: n.h })),
      clusters: clusters.map((c) => ({ id: c.id, box: { x: c.x, y: c.y, w: c.w, h: c.h } })),
      edges: graph.edges.map((e, i) => (best.failed.includes(i) ? { from: e.from, to: e.to, current: lines[i] as Point[] } : { from: e.from, to: e.to, current: lines[i] as Point[], keep: true })),
    });
    lines = lines.map((l, i) => again[i] ?? l);
    for (const i of best.failed) {
      const e = graph.edges[i] as { from: string; to: string };
      diagnostics.push({ kind: 'off-centre', nodes: [e.from, e.to], message: `The line from ${e.from} to ${e.to} found no way between its places on the faces and leaves or enters elsewhere.` });
    }
  }
  const edges = graph.edges.map((e, i): LayoutEdge => {
    const size = scene.labelOf(i);
    return {
      from: e.from,
      to: e.to,
      style: e.style,
      ...(e.id === undefined ? {} : { id: e.id }),
      ...(e.startEnd === undefined ? {} : { startEnd: e.startEnd }),
      ...(e.end === undefined ? {} : { end: e.end }),
      ...(e.invisible === true ? { invisible: true as const } : {}),
      points: (lines[i] as Point[]).map((p) => ({ x: tidy(p.x), y: tidy(p.y) })),
      ...(size === undefined ? {} : { label: { text: e.label as string, x: 0, y: 0, w: size.w, h: size.h } }),
    };
  });
  return { edges, diagnostics };
}
