import type { Pin } from '../layout/global-route.ts';
import { routeGlobally } from '../layout/global-route.ts';
import type { Diagnostic, Graph, LayoutCluster, LayoutEdge, LayoutNode, Point } from '../types.ts';

/** Distance between two lines on one face, and what a line keeps from a corner of the face. */
const PITCH = 64;
const CORNER = 8;
/** How many arrangements of the lines are routed at most while looking for fewer crossings. */
const BUDGET = 64;

type Face = 0 | 1 | 2 | 3; // right, down, left, up: the direction out of the face
export type Rect = { x: number; y: number; w: number; h: number };
type Pins = Array<{ from: Pin; to: Pin } | undefined>;

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

function crossesAt(a: [Point, Point], b: [Point, Point]): boolean {
  const [p, q] = a;
  const [r, s] = b;
  const d = (q.x - p.x) * (s.y - r.y) - (q.y - p.y) * (s.x - r.x);
  if (Math.abs(d) < 1e-9) return false;
  const t = ((r.x - p.x) * (s.y - r.y) - (r.y - p.y) * (s.x - r.x)) / d;
  const v = ((r.x - p.x) * (q.y - p.y) - (r.y - p.y) * (q.x - p.x)) / d;
  return t > 0.01 && t < 0.99 && v > 0.01 && v < 0.99;
}

/** Crossings of two lines inside their segments, bends, and length, in the order they decide between two drawings. */
function priceOf(lines: ReadonlyArray<readonly Point[]>): number[] {
  let cross = 0;
  for (let i = 0; i < lines.length; i++) for (let j = i + 1; j < lines.length; j++) for (const a of segs(lines[i] as Point[])) for (const b of segs(lines[j] as Point[])) if (crossesAt(a, b)) cross++;
  const bends = lines.reduce((n, l) => n + Math.max(0, l.length - 2), 0);
  const length = lines.reduce((n, l) => n + segs(l).reduce((m, [a, b]) => m + Math.abs(a.x - b.x) + Math.abs(a.y - b.y), 0), 0);
  return [cross, bends, length];
}

const better = (x: number[], y: number[]): boolean => {
  for (let i = 0; i < x.length; i++) if (Math.abs((x[i] as number) - (y[i] as number)) > 1e-6) return (x[i] as number) < (y[i] as number);
  return false;
};

/**
 * The lines of a grid drawing. A line between two elements of one column or one row with nothing between them runs
 * straight from middle to middle. A bent line leaves by the face toward the other end and enters by the face toward
 * it, or by a side with one bend when that end has no other line in that direction and the bend is clear. The lines on
 * one face stand 64 apart (closer on a short face): beside the straight line that holds the middle, or symmetric about
 * the middle. Of the arrangements that keep to this, the one with the fewest crossings, then bends, then length is kept.
 */
export function drawLines(scene: LineScene): { edges: LayoutEdge[]; diagnostics: Diagnostic[] } {
  const { graph, nodes, clusters, holds } = scene;
  const boxOf = new Map<string, Rect>();
  for (const n of nodes) boxOf.set(n.id, { x: n.x, y: n.y, w: n.w, h: n.h });
  for (const c of clusters) boxOf.set(c.id, { x: c.x, y: c.y, w: c.w, h: c.h });
  const nodeIds = new Set(nodes.map((n) => n.id));
  const boxes = [...nodes.map((n) => ({ id: n.id, box: boxOf.get(n.id) as Rect, cluster: false })), ...clusters.map((c) => ({ id: c.id, box: boxOf.get(c.id) as Rect, cluster: true }))];
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

  // The faces each line may use: the straight pair, or the bent ones in the order they are tried.
  const straight = new Set<number>();
  const natural: Array<[Face, Face] | undefined> = graph.edges.map((e, i) => {
    const a = boxOf.get(e.from);
    const b = boxOf.get(e.to);
    if (a === undefined || b === undefined || e.from === e.to) return undefined;
    const fa = faceTo(a, b);
    const fb = faceTo(b, a);
    if (nodeIds.has(e.from) && nodeIds.has(e.to)) {
      const level = Math.abs(a.x + a.w / 2 - (b.x + b.w / 2)) < 0.5 || Math.abs(a.y + a.h / 2 - (b.y + b.h / 2)) < 0.5;
      if (level && runClear(pointOn(a, fa, 0), pointOn(b, fb, 0), [e.from, e.to])) straight.add(i);
    }
    return [fa, fb];
  });
  const count = new Map<string, number>();
  natural.forEach((f, i) => {
    const e = graph.edges[i];
    if (f === undefined || e === undefined) return;
    count.set(`${e.from}:${f[0]}`, (count.get(`${e.from}:${f[0]}`) ?? 0) + 1);
    count.set(`${e.to}:${f[1]}`, (count.get(`${e.to}:${f[1]}`) ?? 0) + 1);
  });
  const options: Array<Array<[Face, Face]>> = graph.edges.map((e, i) => {
    const f = natural[i];
    if (f === undefined) return [];
    if (straight.has(i) || !nodeIds.has(e.from) || !nodeIds.has(e.to) || f[0] % 2 !== 1) return [f];
    const [a, b] = [boxOf.get(e.from) as Rect, boxOf.get(e.to) as Rect];
    const side = (box: Rect, other: Rect): Face => (other.x + other.w / 2 < box.x + box.w / 2 ? 2 : 0);
    const clear = (fa: Face, fb: Face): boolean => {
      const p = pointOn(a, fa, 0);
      const q = pointOn(b, fb, 0);
      const corner = fa % 2 === 1 ? { x: p.x, y: q.y } : { x: q.x, y: p.y };
      return runClear(p, corner, [e.from, e.to]) && runClear(corner, q, [e.from, e.to]);
    };
    const out: Array<[Face, Face]> = [];
    if ((count.get(`${e.to}:${f[1]}`) ?? 0) === 1 && clear(f[0], side(b, a))) out.push([f[0], side(b, a)]);
    if ((count.get(`${e.from}:${f[0]}`) ?? 0) === 1 && clear(side(a, b), f[1])) out.push([side(a, b), f[1]]);
    return [...out, f];
  });

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
    // Straight lines of one pair share their offsets at both ends.
    const pairs = new Map<string, number[]>();
    for (const i of straight) {
      const e = graph.edges[i] as { from: string; to: string };
      const k = [e.from, e.to].sort().join('\u0000');
      pairs.set(k, [...(pairs.get(k) ?? []), i]);
    }
    const fixedOf = new Map<number, number>();
    for (const list of pairs.values()) {
      const e = graph.edges[list[0] as number] as { from: string; to: string };
      const f = faces[list[0] as number] as [Face, Face];
      const pitch = Math.min(pitchOf(e.from, f[0]), pitchOf(e.to, f[1]));
      symmetric(list.length, pitch).forEach((off, k) => fixedOf.set(list[k] as number, off));
    }
    const offset = new Map<string, number>();
    for (const [k, list] of ends) {
      const id = k.slice(0, k.lastIndexOf(':'));
      const face = Number(k.slice(k.lastIndexOf(':') + 1)) as Face;
      const box = boxOf.get(id) as Rect;
      const mid = face % 2 === 1 ? box.x + box.w / 2 : box.y + box.h / 2;
      const half = (face % 2 === 1 ? box.w : box.h) / 2 - CORNER;
      const pitch = pitchOf(id, face);
      const held = list.filter((x) => x.straight);
      for (const x of held) offset.set(`${x.edge}:${k}`, fixedOf.get(x.edge) ?? 0);
      // Left to right (top to bottom on a side): by where the other end is; of two toward one place, the nearer one outside.
      const asked = orders.get(k);
      const rest = list
        .filter((x) => !x.straight)
        .sort((x, y) => (asked === undefined ? x.toward - y.toward || (x.toward < mid ? x.far - y.far : y.far - x.far) || x.edge - y.edge : asked.indexOf(x.edge) - asked.indexOf(y.edge)));
      let offs: number[];
      if (held.length === 0) offs = symmetric(rest.length, pitch);
      else {
        // Beside the straight lines: as many on the low side as look to it, nearest the middle first; a full side sends the rest over.
        const used = held.map((x) => fixedOf.get(x.edge) ?? 0);
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

  const placeholder = (pin: { from: Pin; to: Pin } | undefined): Point[] =>
    pin === undefined ? [] : (pin.from.x === pin.to.x || pin.from.y === pin.to.y ? [pin.from, pin.to] : [pin.from, { x: pin.from.x, y: pin.to.y }, pin.to]).map((p) => ({ x: p.x, y: p.y }));
  const base = {
    width: scene.width,
    height: scene.height,
    nodes: nodes.map((n) => ({ id: n.id, x: n.x, y: n.y, w: n.w, h: n.h })),
    clusters: clusters.map((c) => ({ id: c.id, box: { x: c.x, y: c.y, w: c.w, h: c.h } })),
  };
  /** The lines routed between their pins; `failed` are the edges that found no way between them. */
  const route = (pins: Pins): { lines: Point[][]; failed: number[] } => {
    const found = routeGlobally({
      ...base,
      edges: graph.edges.map((e, i) => {
        const pin = pins[i];
        const current = placeholder(pin);
        return straight.has(i) || pin === undefined ? { from: e.from, to: e.to, current, keep: true } : { from: e.from, to: e.to, current, pin };
      }),
    });
    const failed = graph.edges.flatMap((_, i) => (pins[i] !== undefined && !straight.has(i) && found[i] === undefined ? [i] : []));
    return { lines: graph.edges.map((_, i) => found[i] ?? placeholder(pins[i])), failed };
  };

  // Look for fewer crossings: another allowed pair of faces for one line, or two neighbours on one face swapped.
  let choice = options.map(() => 0);
  let orders = new Map<string, number[]>();
  let flips = new Set<string>();
  let pins = pinsOf(choice, orders, flips);
  let best = route(pins);
  let price = [best.failed.length, ...priceOf(best.lines)];
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
  for (let round = 0; round < 3 && (price[1] as number) > 0; round++) {
    let improved = false;
    const tries: Array<() => { choice: number[]; orders: Map<string, number[]>; flips: Set<string> }> = [];
    options.forEach((o, i) => {
      for (let k = 0; k < o.length; k++) if (k !== choice[i]) tries.push(() => ({ choice: choice.map((c, j) => (j === i ? k : c)), orders, flips }));
    });
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
      const p = [got.failed.length, ...priceOf(got.lines)];
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

  // A line with no way between its pins is routed freely, and reported.
  const diagnostics: Diagnostic[] = [];
  let lines = best.lines;
  if (best.failed.length > 0) {
    const again = routeGlobally({
      ...base,
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
