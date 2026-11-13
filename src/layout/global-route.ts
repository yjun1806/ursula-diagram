import type { Point } from '../types.ts';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface RouteInput {
  /** The canvas the lines stay in. */
  width: number;
  height: number;
  nodes: Array<Box & { id: string }>;
  /** `name` is the box of the written name: no line passes through it. */
  clusters: Array<{ id: string; box: Box; name?: Box }>;
  /** `current` is the line as it is drawn; it stays when the edge cannot be routed here or when `keep` is set. */
  edges: Array<{ from: string; to: string; current: Point[]; keep?: boolean }>;
}

const EPS = 1e-6;
/** Prices, in pixels: a bend, crossing a line already drawn, and crossing the border of a cluster box. */
const BEND = 24;
const CROSS = 2 * BEND;
const BORDER = BEND / 4;
/** What a line keeps from the nodes it passes, from its own end nodes, and from the name of a cluster. */
const NODE_CLEAR = 12;
const OWN_CLEAR = 8;
const NAME_CLEAR = 4;
/** The straight run out of a face, the distance between two lines that run side by side, and the distance of a port from a corner. */
const STUB = 12;
const PITCH = 8;
const CORNER_CLEAR = 12;
const BORDER_NEAR = 16;
const EDGE_ROOM = 8;
/** Price of breaking a spacing rule when no line can be found without breaking one. */
const RELAXED = 400;

// 0 right, 1 down, 2 left, 3 up; the face a direction leaves through has the same number.
const DX = [1, 0, -1, 0] as const;
const DY = [0, 1, 0, -1] as const;

interface Port {
  /** On the face. */
  px: number;
  py: number;
  /** One stub out from the face. */
  sx: number;
  sy: number;
  /** The direction out of the face. */
  d: number;
  /** The face points at the other end. */
  preferred: boolean;
  /** Distance of the port from the middle of its face: a hair of a price, so that equal lines stand at the middle. */
  off: number;
}

interface Wall {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  own: boolean;
}

/** A segment: `c` is the coordinate it stands at, `lo..hi` its extent along the other axis. */
interface Line {
  c: number;
  lo: number;
  hi: number;
}

interface Walls {
  walls: Wall[];
  /** Lines already drawn. */
  h: Line[];
  v: Line[];
}

interface Found {
  points: Point[];
  /** Price of the faces the line uses. */
  faces: number;
}

const near = (a: number, b: number): boolean => Math.abs(a - b) < EPS;

function inflate(b: Box, by: number, own: boolean): Wall {
  return { x0: b.x - by, y0: b.y - by, x1: b.x + b.w + by, y1: b.y + b.h + by, own };
}

function linesOf(points: Point[], h: Line[], v: Line[]): void {
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i] as Point;
    const b = points[i + 1] as Point;
    if (near(a.y, b.y)) h.push({ c: a.y, lo: Math.min(a.x, b.x), hi: Math.max(a.x, b.x) });
    else if (near(a.x, b.x)) v.push({ c: a.x, lo: Math.min(a.y, b.y), hi: Math.max(a.y, b.y) });
  }
}

/** The points without the ones that lie on a straight stretch between their neighbours. */
function straighten(points: Point[]): Point[] {
  const out: Point[] = [];
  for (const p of points) {
    const last = out.at(-1);
    if (last !== undefined && near(last.x, p.x) && near(last.y, p.y)) continue;
    out.push(p);
    while (out.length >= 3) {
      const [a, b, c] = out.slice(-3) as [Point, Point, Point];
      if ((near(a.x, b.x) && near(b.x, c.x)) || (near(a.y, b.y) && near(b.y, c.y))) out.splice(out.length - 2, 1);
      else break;
    }
  }
  return out;
}

/** Sorted values with the ones within a hair of each other merged. */
function merged(values: number[]): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  const out: number[] = [];
  for (const v of sorted) if (out.length === 0 || v - (out.at(-1) as number) > 0.01) out.push(v);
  return out;
}

function indexOf(values: number[], v: number): number {
  let lo = 0;
  let hi = values.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((values[mid] as number) < v) lo = mid + 1;
    else hi = mid;
  }
  return lo < values.length && Math.abs((values[lo] as number) - v) < 0.02 ? lo : -1;
}

/** The middles of the free corridors between the stretches `spans` cover, and two lanes beside the middle of a wide one. */
function corridors(spans: Array<[number, number]>, lo: number, hi: number): number[] {
  const sorted = [...spans].sort((a, b) => a[0] - b[0]);
  const out: number[] = [];
  let at = lo;
  const gap = (from: number, to: number): void => {
    if (to - from < PITCH) return;
    const mid = (from + to) / 2;
    out.push(mid);
    if (to - from >= 5 * PITCH) out.push(mid - PITCH, mid + PITCH);
  };
  for (const [a, b] of sorted) {
    if (a > at) gap(at, a);
    at = Math.max(at, b);
  }
  if (hi > at) gap(at, hi);
  return out;
}

/** The ports on the four faces of `box`: the centre and every pitch from it, and the places level with `other`. */
function portsOf(box: Box, other: Box, degree: number): Port[] {
  const ox = other.x + other.w / 2;
  const oy = other.y + other.h / 2;
  const beyond = [ox >= box.x + box.w, oy >= box.y + box.h, ox <= box.x, oy <= box.y];
  const anyBeyond = beyond.some(Boolean);
  const out: Port[] = [];
  for (let d = 0; d < 4; d++) {
    const flat = d === 1 || d === 3;
    const start = flat ? box.x : box.y;
    const len = flat ? box.w : box.h;
    const mid = start + len / 2;
    const reach = len / 2 - CORNER_CLEAR;
    const count = reach < 0 ? 0 : Math.min(degree, Math.floor(reach / PITCH));
    const preferred = !anyBeyond || (beyond[d] as boolean);
    const at: number[] = [];
    for (let k = -count; k <= count; k++) at.push(mid + k * PITCH);
    if (preferred && reach >= 0) {
      const clamp = (v: number): number => Math.min(start + len - CORNER_CLEAR, Math.max(start + CORNER_CLEAR, v));
      const o0 = flat ? other.x : other.y;
      const o1 = o0 + (flat ? other.w : other.h);
      at.push(clamp(flat ? ox : oy));
      const [lo, hi] = [Math.max(start, o0), Math.min(start + len, o1)];
      if (hi - lo > 2 * CORNER_CLEAR) at.push(clamp((lo + hi) / 2));
    }
    for (const v of merged(at)) {
      const px = flat ? v : d === 0 ? box.x + box.w : box.x;
      const py = flat ? (d === 1 ? box.y + box.h : box.y) : v;
      out.push({ px, py, sx: px + (DX[d] as number) * STUB, sy: py + (DY[d] as number) * STUB, d, preferred, off: Math.abs(v - mid) });
    }
  }
  return out;
}

const enters = (box: Box, other: Box): boolean => other.x >= box.x - EPS && other.y >= box.y - EPS && other.x + other.w <= box.x + box.w + EPS && other.y + other.h <= box.y + box.h + EPS;

/**
 * Routes every line of a finished drawing in one pass over the whole of it: on a grid of the places a line can turn
 * at, with a search that prices length, bends, and crossings with the lines drawn before it, and then once more with
 * each line taken out and drawn again against all the others. A line leaves its node and enters the other through a
 * face, a stub straight out of it; the face pointing at the other end costs nothing and any other costs a bend.
 * Returns one entry per edge: the new points, or `undefined` where the edge keeps the line it has.
 */
export function routeGlobally(input: RouteInput): Array<Point[] | undefined> {
  const { width, height } = input;
  const boxOf = new Map<string, { box: Box; cluster: boolean }>();
  for (const n of input.nodes) boxOf.set(n.id, { box: n, cluster: false });
  for (const c of input.clusters) boxOf.set(c.id, { box: c.box, cluster: true });

  interface Job {
    index: number;
    from: Port[];
    to: Port[];
    fromBox: Box;
    toBox: Box;
    fromId: string;
    toId: string;
    distance: number;
  }
  const degree = new Map<string, number>();
  for (const e of input.edges) for (const id of [e.from, e.to]) degree.set(id, (degree.get(id) ?? 0) + 1);

  const jobs: Job[] = [];
  const paths: Array<Point[] | undefined> = input.edges.map((e) => (e.keep === true ? e.current : undefined));
  input.edges.forEach((e, index) => {
    const a = boxOf.get(e.from);
    const b = boxOf.get(e.to);
    if (e.keep === true || a === undefined || b === undefined || e.from === e.to || enters(a.box, b.box) || enters(b.box, a.box)) {
      paths[index] = e.current;
      return;
    }
    const distance = Math.abs(a.box.x + a.box.w / 2 - (b.box.x + b.box.w / 2)) + Math.abs(a.box.y + a.box.h / 2 - (b.box.y + b.box.h / 2));
    jobs.push({ index, fromId: e.from, toId: e.to, fromBox: a.box, toBox: b.box, from: portsOf(a.box, b.box, degree.get(e.from) ?? 1), to: portsOf(b.box, a.box, degree.get(e.to) ?? 1), distance });
  });
  const fixed = new Set(paths.flatMap((p, i) => (p === undefined ? [] : [i])));
  const results: Array<Point[] | undefined> = input.edges.map(() => undefined);
  if (jobs.length === 0) return results;

  // The grid: the places a line can run along.
  const xs: number[] = [];
  const ys: number[] = [];
  const spanX: Array<[number, number]> = [];
  const spanY: Array<[number, number]> = [];
  for (const n of input.nodes) {
    const w = inflate(n, NODE_CLEAR, false);
    spanX.push([w.x0, w.x1]);
    spanY.push([w.y0, w.y1]);
    xs.push(n.x - NODE_CLEAR, n.x - NODE_CLEAR - PITCH, n.x + n.w + NODE_CLEAR, n.x + n.w + NODE_CLEAR + PITCH, n.x + n.w / 2);
    ys.push(n.y - NODE_CLEAR, n.y - NODE_CLEAR - PITCH, n.y + n.h + NODE_CLEAR, n.y + n.h + NODE_CLEAR + PITCH, n.y + n.h / 2);
  }
  for (const c of input.clusters) {
    if (c.name === undefined) continue;
    const w = inflate(c.name, NAME_CLEAR, false);
    spanX.push([w.x0, w.x1]);
    spanY.push([w.y0, w.y1]);
    xs.push(w.x0, w.x1);
    ys.push(w.y0, w.y1);
  }
  // A lane as near a border as a line may run along it.
  for (const c of input.clusters) {
    xs.push(c.box.x - BORDER_NEAR, c.box.x + BORDER_NEAR, c.box.x + c.box.w - BORDER_NEAR, c.box.x + c.box.w + BORDER_NEAR);
    ys.push(c.box.y - BORDER_NEAR, c.box.y + BORDER_NEAR, c.box.y + c.box.h - BORDER_NEAR, c.box.y + c.box.h + BORDER_NEAR);
  }
  for (const job of jobs) {
    for (const p of [...job.from, ...job.to]) {
      xs.push(p.sx);
      ys.push(p.sy);
    }
  }
  for (const id of new Set(jobs.flatMap((j) => [j.fromId, j.toId]))) {
    const e = boxOf.get(id);
    if (e?.cluster !== true) continue;
    xs.push(e.box.x - NODE_CLEAR, e.box.x + e.box.w + NODE_CLEAR);
    ys.push(e.box.y - NODE_CLEAR, e.box.y + e.box.h + NODE_CLEAR);
  }
  xs.push(...corridors(spanX, EDGE_ROOM, width - EDGE_ROOM));
  ys.push(...corridors(spanY, EDGE_ROOM, height - EDGE_ROOM));
  xs.push(...corridors(input.clusters.map((c): [number, number] => [c.box.x, c.box.x + c.box.w]), EDGE_ROOM, width - EDGE_ROOM));
  ys.push(...corridors(input.clusters.map((c): [number, number] => [c.box.y, c.box.y + c.box.h]), EDGE_ROOM, height - EDGE_ROOM));
  const gx = merged(xs.filter((v) => v >= EDGE_ROOM - EPS && v <= width - EDGE_ROOM + EPS));
  const gy = merged(ys.filter((v) => v >= EDGE_ROOM - EPS && v <= height - EDGE_ROOM + EPS));
  // A face pointing at the other end can also be left or entered level with any line of the grid, so that a line can run straight down the side of a box.
  for (const job of jobs) {
    for (const [ports, box] of [[job.from, job.fromBox], [job.to, job.toBox]] as const) {
      const extra: Port[] = [];
      for (const d of [0, 1, 2, 3]) {
        if (!ports.some((q) => q.d === d && q.preferred)) continue;
        const flat = d === 1 || d === 3;
        const start = flat ? box.x : box.y;
        const len = flat ? box.w : box.h;
        if (len < 2 * CORNER_CLEAR) continue;
        for (const v of flat ? gx : gy) {
          if (v < start + CORNER_CLEAR - EPS || v > start + len - CORNER_CLEAR + EPS) continue;
          const px = flat ? v : d === 0 ? box.x + box.w : box.x;
          const py = flat ? (d === 1 ? box.y + box.h : box.y) : v;
          if (ports.some((q) => near(q.px, px) && near(q.py, py))) continue;
          extra.push({ px, py, sx: px + (DX[d] as number) * STUB, sy: py + (DY[d] as number) * STUB, d, preferred: true, off: Math.abs((flat ? v - (box.x + box.w / 2) : v - (box.y + box.h / 2))) });
        }
      }
      ports.push(...extra);
    }
  }
  const nx = gx.length;
  const ny = gy.length;

  // The borders of the cluster boxes: crossing one costs a little, running along one close by is not allowed.
  const borderH: Line[] = [];
  const borderV: Line[] = [];
  for (const c of input.clusters) {
    const { x, y, w, h } = c.box;
    borderH.push({ c: y, lo: x, hi: x + w }, { c: y + h, lo: x, hi: x + w });
    borderV.push({ c: x, lo: y, hi: y + h }, { c: x + w, lo: y, hi: y + h });
  }

  /** What a segment costs beyond its length: `Infinity` where it may not stand. */
  const segCost = (w: Walls, x0: number, y0: number, x1: number, y1: number, skipOwn: boolean, relaxed: boolean): number => {
    const horizontal = near(y0, y1);
    const c = horizontal ? y0 : x0;
    const lo = horizontal ? Math.min(x0, x1) : Math.min(y0, y1);
    const hi = horizontal ? Math.max(x0, x1) : Math.max(y0, y1);
    const endAlong = horizontal ? x1 : y1;
    for (const o of w.walls) {
      if (skipOwn && o.own) continue;
      const [a0, a1, b0, b1] = horizontal ? [o.y0, o.y1, o.x0, o.x1] : [o.x0, o.x1, o.y0, o.y1];
      if (a0 + EPS < c && c < a1 - EPS && lo < b1 - EPS && hi > b0 + EPS) return Infinity;
    }
    let cost = 0;
    const parallel = horizontal ? w.h : w.v;
    const across = horizontal ? w.v : w.h;
    for (const s of parallel) {
      if (Math.abs(s.c - c) < PITCH - EPS && Math.min(hi, s.hi) - Math.max(lo, s.lo) > EPS) {
        if (!relaxed) return Infinity;
        cost += RELAXED;
      }
    }
    for (const s of across) {
      if (c > s.lo + EPS && c < s.hi - EPS) {
        if (s.c > lo + EPS && s.c < hi - EPS) cost += CROSS;
        else if (near(s.c, endAlong)) cost += CROSS;
      }
    }
    for (const s of horizontal ? borderH : borderV) {
      if (Math.abs(s.c - c) < BORDER_NEAR - EPS && Math.min(hi, s.hi) - Math.max(lo, s.lo) > EPS) {
        if (!relaxed) return Infinity;
        cost += RELAXED;
      }
    }
    for (const s of horizontal ? borderV : borderH) if (c > s.lo + EPS && c < s.hi - EPS && s.c > lo + EPS && s.c < hi - EPS) cost += BORDER;
    return cost;
  };

  const wallsFor = (job: Job, skip: number): Walls => {
    const walls: Wall[] = [];
    for (const n of input.nodes) {
      const own = n.id === job.fromId || n.id === job.toId;
      walls.push(inflate(n, own ? OWN_CLEAR : NODE_CLEAR, own));
    }
    for (const c of input.clusters) {
      if (c.id === job.fromId || c.id === job.toId) walls.push(inflate(c.box, OWN_CLEAR, true));
      // A box that holds neither end is not gone through: the line would read as joining what stands in it.
      else if (!enters(c.box, job.fromBox) && !enters(c.box, job.toBox)) walls.push(inflate(c.box, 0, false));
      if (c.name !== undefined) walls.push(inflate(c.name, NAME_CLEAR, false));
    }
    const h: Line[] = [];
    const v: Line[] = [];
    paths.forEach((p, i) => {
      if (i !== skip && p !== undefined) linesOf(p, h, v);
    });
    return { walls, h, v };
  };

  /** The price of a drawn line, ends included: length, bends, crossings. */
  const priceOf = (w: Walls, points: Point[]): number => {
    let cost = 0;
    let turns = 0;
    let before: number | undefined;
    for (let i = 0; i + 1 < points.length; i++) {
      const a = points[i] as Point;
      const b = points[i + 1] as Point;
      const len = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
      if (len < EPS) continue;
      cost += len + segCost(w, a.x, a.y, b.x, b.y, i === 0 || i === points.length - 2, true);
      const dir = near(a.y, b.y) ? 0 : 1;
      if (before !== undefined && before !== dir) turns++;
      before = dir;
    }
    return cost + BEND * turns;
  };

  const search = (job: Job, w: Walls, relaxed: boolean): Found | undefined => {
    const total = nx * ny * 4;
    const dist = new Float64Array(total).fill(Infinity);
    const parent = new Int32Array(total).fill(-1);
    const memo = new Float64Array(total).fill(Number.NaN);
    const stateOf = (i: number, j: number, d: number): number => (i * ny + j) * 4 + d;

    const targets = new Map<number, Array<{ port: Port; extra: number }>>();
    let tx0 = Infinity;
    let tx1 = -Infinity;
    let ty0 = Infinity;
    let ty1 = -Infinity;
    for (const p of job.to) {
      const i = indexOf(gx, p.sx);
      const j = indexOf(gy, p.sy);
      if (i < 0 || j < 0) continue;
      const stub = segCost(w, p.sx, p.sy, p.px, p.py, true, relaxed);
      if (!Number.isFinite(stub)) continue;
      const key = i * ny + j;
      const list = targets.get(key) ?? [];
      list.push({ port: p, extra: STUB + stub + (p.preferred ? 0 : BEND) + p.off * 0.01 });
      targets.set(key, list);
      tx0 = Math.min(tx0, p.sx);
      tx1 = Math.max(tx1, p.sx);
      ty0 = Math.min(ty0, p.sy);
      ty1 = Math.max(ty1, p.sy);
    }
    if (targets.size === 0) return undefined;
    const heuristic = (i: number, j: number): number => {
      const x = gx[i] as number;
      const y = gy[j] as number;
      return Math.max(0, tx0 - x, x - tx1) + Math.max(0, ty0 - y, y - ty1);
    };

    const heapF: number[] = [];
    const heapS: number[] = [];
    const push = (f: number, s: number): void => {
      let k = heapF.length;
      heapF.push(f);
      heapS.push(s);
      while (k > 0) {
        const up = (k - 1) >> 1;
        if ((heapF[up] as number) <= f) break;
        heapF[k] = heapF[up] as number;
        heapS[k] = heapS[up] as number;
        k = up;
      }
      heapF[k] = f;
      heapS[k] = s;
    };
    const pop = (): [number, number] => {
      const f = heapF[0] as number;
      const s = heapS[0] as number;
      const lf = heapF.pop() as number;
      const ls = heapS.pop() as number;
      const n = heapF.length;
      if (n > 0) {
        let k = 0;
        for (;;) {
          let c = 2 * k + 1;
          if (c >= n) break;
          if (c + 1 < n && (heapF[c + 1] as number) < (heapF[c] as number)) c++;
          if ((heapF[c] as number) >= lf) break;
          heapF[k] = heapF[c] as number;
          heapS[k] = heapS[c] as number;
          k = c;
        }
        heapF[k] = lf;
        heapS[k] = ls;
      }
      return [f, s];
    };

    const startOf = new Map<number, Port>();
    for (const p of job.from) {
      const i = indexOf(gx, p.sx);
      const j = indexOf(gy, p.sy);
      if (i < 0 || j < 0) continue;
      const stub = segCost(w, p.px, p.py, p.sx, p.sy, true, relaxed);
      if (!Number.isFinite(stub)) continue;
      const s = stateOf(i, j, p.d);
      const g = STUB + stub + (p.preferred ? 0 : BEND) + p.off * 0.01;
      if (g < (dist[s] as number)) {
        dist[s] = g;
        startOf.set(s, p);
        push(g + heuristic(i, j), s);
      }
    }
    if (startOf.size === 0) return undefined;

    let best = Infinity;
    let bestState = -1;
    let bestPort: Port | undefined;
    while (heapF.length > 0) {
      const [f, s] = pop();
      if (f >= best - EPS) break;
      const d = s & 3;
      const cell = s >> 2;
      const i = Math.floor(cell / ny);
      const j = cell - i * ny;
      const g = dist[s] as number;
      if (f > g + heuristic(i, j) + EPS) continue;
      const hit = targets.get(cell);
      if (hit !== undefined) {
        for (const t of hit) {
          const total2 = g + t.extra + (d === (t.port.d + 2) % 4 ? 0 : BEND);
          if (total2 < best) {
            best = total2;
            bestState = s;
            bestPort = t.port;
          }
        }
      }
      for (const nd of [d, (d + 1) % 4, (d + 3) % 4]) {
        const ni = i + (DX[nd] as number);
        const nj = j + (DY[nd] as number);
        if (ni < 0 || nj < 0 || ni >= nx || nj >= ny) continue;
        let step = memo[(cell << 2) + nd] as number;
        if (Number.isNaN(step)) {
          const [x0, y0, x1, y1] = [gx[i] as number, gy[j] as number, gx[ni] as number, gy[nj] as number];
          step = segCost(w, x0, y0, x1, y1, false, relaxed);
          if (Number.isFinite(step)) step += Math.abs(x1 - x0) + Math.abs(y1 - y0);
          memo[(cell << 2) + nd] = step;
        }
        if (!Number.isFinite(step)) continue;
        const ns = stateOf(ni, nj, nd);
        const cost = g + step + (nd === d ? 0 : BEND);
        if (cost < (dist[ns] as number) - EPS) {
          dist[ns] = cost;
          parent[ns] = s;
          push(cost + heuristic(ni, nj), ns);
        }
      }
    }
    if (bestPort === undefined) return undefined;

    const chain: Point[] = [];
    for (let s = bestState; s >= 0; s = parent[s] as number) {
      const cell = s >> 2;
      const i = Math.floor(cell / ny);
      chain.push({ x: gx[i] as number, y: gy[cell - i * ny] as number });
    }
    chain.reverse();
    let start: Port | undefined;
    let root = bestState;
    while ((parent[root] as number) >= 0) root = parent[root] as number;
    start = startOf.get(root);
    if (start === undefined) return undefined;
    const points = [{ x: start.px, y: start.py }, ...chain, { x: bestPort.px, y: bestPort.py }];
    return { points, faces: (start.preferred ? 0 : BEND) + (bestPort.preferred ? 0 : BEND) };
  };

  const route = (job: Job): Found | undefined => {
    const w = wallsFor(job, job.index);
    return search(job, w, false) ?? search(job, w, true);
  };

  const order = [...jobs].sort((a, b) => a.distance - b.distance);
  for (const job of order) {
    const found = route(job);
    paths[job.index] = found === undefined ? (input.edges[job.index] as { current: Point[] }).current : straighten(found.points);
    if (found === undefined) fixed.add(job.index);
    else results[job.index] = paths[job.index];
  }
  // Each line taken out and drawn again against all the others; it changes only when that is cheaper.
  for (const job of order) {
    if (fixed.has(job.index)) continue;
    const old = paths[job.index] as Point[];
    const w = wallsFor(job, job.index);
    const found = search(job, w, false) ?? search(job, w, true);
    if (found === undefined) continue;
    const faces = (p: Point[]): number => {
      const first = p[0] as Point;
      const last = p.at(-1) as Point;
      const pref = (pt: Point, ports: Port[]): number => (ports.some((q) => near(q.px, pt.x) && near(q.py, pt.y) && q.preferred) ? 0 : BEND);
      return pref(first, job.from) + pref(last, job.to);
    };
    const fresh = straighten(found.points);
    // A line is priced with its stubs as vertices, so that the ends are treated alike.
    const withStubs = (p: Point[]): Point[] => {
      const first = p[0] as Point;
      const last = p.at(-1) as Point;
      const a = job.from.find((q) => near(q.px, first.x) && near(q.py, first.y));
      const b = job.to.find((q) => near(q.px, last.x) && near(q.py, last.y));
      return [first, ...(a === undefined ? [] : [{ x: a.sx, y: a.sy }]), ...p.slice(1, -1), ...(b === undefined ? [] : [{ x: b.sx, y: b.sy }]), last];
    };
    const [before, after] = [priceOf(w, withStubs(old)) + faces(old), priceOf(w, withStubs(fresh)) + faces(fresh)];
    if (after < before - EPS) {
      paths[job.index] = fresh;
      results[job.index] = fresh;
    }
  }
  return results;
}
