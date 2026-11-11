import type { Run } from './route.ts';

/** `track(before)` must be smaller than `track(after)`. */
export interface Order {
  before: number;
  after: number;
}

const lineOf = (r: Run): string => `${r.kind}${r.idx}`;

/**
 * Drops duplicate orders, then the latest orders that sit on a cycle, so the
 * remaining ones can all be satisfied at once.
 */
function withoutCycles(wanted: Order[]): Order[] {
  const seen = new Set<string>();
  const orders = wanted.filter((o) => {
    const key = `${o.before}>${o.after}`;
    if (o.before === o.after || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  for (;;) {
    const indegree = new Map<number, number>();
    for (const o of orders) {
      indegree.set(o.before, indegree.get(o.before) ?? 0);
      indegree.set(o.after, (indegree.get(o.after) ?? 0) + 1);
    }
    const queue = [...indegree].filter(([, d]) => d === 0).map(([id]) => id);
    for (let head = 0; head < queue.length; head++) {
      for (const o of orders) {
        if (o.before !== queue[head]) continue;
        const d = (indegree.get(o.after) ?? 0) - 1;
        indegree.set(o.after, d);
        if (d === 0) queue.push(o.after);
      }
    }
    const stuck = new Set([...indegree].filter(([, d]) => d > 0).map(([id]) => id));
    if (stuck.size === 0) return orders;
    let drop = -1;
    orders.forEach((o, i) => {
      if (stuck.has(o.before) && stuck.has(o.after)) drop = i;
    });
    if (drop < 0) return orders;
    orders.splice(drop, 1);
  }
}

/**
 * Gives every run a track number so that runs on the same channel line never
 * overlap. Track numbers grow with coordinate along the channel's width.
 * `orders` are honoured by raising minimum tracks and re-running the greedy pass.
 */
export function assignTracks(runs: Run[], wanted: Order[]): number[] {
  const orders = withoutCycles(wanted);
  const min = new Array<number>(runs.length).fill(0);
  for (let changed = true; changed; ) {
    changed = false;
    for (const o of orders) {
      if ((min[o.after] ?? 0) < (min[o.before] ?? 0) + 1) {
        min[o.after] = (min[o.before] ?? 0) + 1;
        changed = true;
      }
    }
  }
  const sorted = [...runs].sort(
    (a, b) => lineOf(a).localeCompare(lineOf(b)) || a.lo - b.lo || a.hi - b.hi || a.id - b.id,
  );
  let tracks = new Array<number>(runs.length).fill(0);
  for (let round = 0; round < 40; round++) {
    tracks = new Array<number>(runs.length).fill(-1);
    const placed = new Map<string, Run[]>();
    for (const run of sorted) {
      const line = lineOf(run);
      const others = placed.get(line) ?? [];
      let t = min[run.id] ?? 0;
      while (others.some((o) => tracks[o.id] === t && o.lo <= run.hi && run.lo <= o.hi)) t++;
      tracks[run.id] = t;
      others.push(run);
      placed.set(line, others);
    }
    let violated = false;
    for (const o of orders) {
      if (o.before === o.after) continue;
      const tb = tracks[o.before] ?? 0;
      if (tb >= (tracks[o.after] ?? 0)) {
        min[o.after] = Math.max(min[o.after] ?? 0, tb + 1);
        violated = true;
      }
    }
    if (!violated) break;
  }
  return tracks;
}

/** Number of tracks used per channel line, keyed like "f3" / "c0". */
export function trackCounts(runs: Run[], tracks: number[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const r of runs) {
    const line = lineOf(r);
    counts.set(line, Math.max(counts.get(line) ?? 0, (tracks[r.id] ?? 0) + 1));
  }
  return counts;
}

export interface Chain {
  runs: number[];
  /** Direction of the stub at the start of the first run. */
  start: -1 | 1;
  /** Direction of the stub at the end of the last run. */
  end: -1 | 1;
  /** Position of each stub along its run's line. */
  startPos: (run: Run) => number;
  endPos: (run: Run) => number;
}

interface End {
  /** Position along the run's line, in half-channel units. */
  pos: number;
  /** Which way the connected stub or run leaves the line: -1 toward lower coordinates, +1 higher. */
  dir: -1 | 1;
}

/** Direction in which `next` leaves the vertex it shares with a run on line `at`. */
function leaving(next: Run, at: number): -1 | 0 | 1 {
  if (next.lo < at && next.hi <= at) return -1;
  if (next.hi > at && next.lo >= at) return 1;
  return 0;
}

/**
 * Channel-router style ordering: where a run turns away from its line at a point
 * another run passes, the turning run takes the track on the side it turns toward.
 * That keeps one run's turn from cutting through the other run's line.
 */
export function turnOrders(
  runs: Run[],
  chains: Chain[],
): Order[] {
  const ends = new Map<number, End[]>();
  const add = (id: number, e: End): void => {
    ends.set(id, [...(ends.get(id) ?? []), e]);
  };
  for (const chain of chains) {
    const ids = chain.runs;
    ids.forEach((id, j) => {
      const run = runs[id];
      if (!run) return;
      if (j === 0) add(id, { pos: chain.startPos(run), dir: chain.start });
      if (j === ids.length - 1) add(id, { pos: chain.endPos(run), dir: chain.end });
      const next = runs[ids[j + 1] ?? -1];
      const prev = runs[ids[j - 1] ?? -1];
      if (next) {
        const dir = leaving(next, 2 * run.idx);
        if (dir !== 0) add(id, { pos: 2 * next.idx, dir });
      }
      if (prev) {
        const dir = leaving(prev, 2 * run.idx);
        if (dir !== 0) add(id, { pos: 2 * prev.idx, dir });
      }
    });
  }
  const orders: Order[] = [];
  for (const x of runs) {
    for (const e of ends.get(x.id) ?? []) {
      if (e.pos < 0) continue;
      for (const y of runs) {
        if (y.id === x.id || y.kind !== x.kind || y.idx !== x.idx) continue;
        if (y.lo < e.pos && e.pos < y.hi) {
          orders.push(e.dir < 0 ? { before: x.id, after: y.id } : { before: y.id, after: x.id });
        } else if (e.dir < 0 && (y.lo === e.pos || y.hi === e.pos) && (ends.get(y.id) ?? []).some((o) => o.pos === e.pos && o.dir > 0)) {
          // Two runs meet at one point and turn opposite ways: the one turning toward low coordinates takes the lower track, or their turns overlap.
          orders.push({ before: x.id, after: y.id });
        }
      }
    }
  }
  return orders;
}
