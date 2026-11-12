import type { Ladder } from './model.ts';
import { pieces } from './model.ts';

export interface Aligned {
  /** Start of every node, in slot units. */
  start: number[];
  /** Units from the left edge to the end of the furthest node. */
  width: number;
}

/** Extra units the pair (left, right) of neighbours in a layer needs beyond the units of the left node. */
export type Extra = (left: number, right: number) => number;

/** Port geometry in slot units: ports of a box lie on a lattice of 1 / `steps` units around its centre, up to `reach(units)` from it. */
export interface PortGeometry {
  steps: number;
  reach: (units: number) => number;
  /** Two boxes count as straight only when their centres are on one line (a terminal keeps boxes of a column centred). */
  centred?: boolean;
  /** Pixels: how far from its centre a box side may hold a port that another box's centre sets (clear of the corners), in units. */
  inner?: (units: number) => number;
}

/** The pixel ruler's geometry, used when the caller gives none. */
export const DEFAULT_PORTS: PortGeometry = { steps: 4, reach: (units) => units / 2 - 0.375 };

export interface AlignOptions {
  /** Units a layer may hold; the result only exceeds it when no arrangement fits. */
  limit?: number;
  ports?: PortGeometry;
  /** Last resort: nodes that stick out of the limit give up their alignment. */
  squeeze?: boolean;
  /** Pass-through lines that may share one gap, drawn side by side (1 when the gap has no room for more). */
  lines?: number;
  /** Nodes of the main flow: when two arrangements are equally straight, the one that keeps more edges at them straight wins. */
  main?: ReadonlySet<number>;
  /** Edges in and out of a real node: of two alignments that cannot both stand, the one of the heavier node is kept. */
  degree?: (node: number) => number;
  /** Stages: a node with three or more partners in the next layer or the one before stands in the middle of them. */
  hubs?: boolean;
  /** Real nodes whose side (`down` toward the next layer, `up` toward the previous) has this one edge only: the edge is at the centre. */
  single?: (node: number, side: 'up' | 'down') => boolean;
  /** Units a dummy at the end of a layer needs beyond its own slot to stay inside the limit (0 or 1). */
  dummyShift?: number;
}

const EPS = 1e-6;

/**
 * Stage 4: integer starts on the unit grid. The best of four median alignments is kept, a straighten pass
 * moves rigid vertical groups so that more pieces run straight, and leftover gaps are closed group by group.
 *
 * The work is done on arrays indexed by node number: the neighbours, the places in a layer and the separations
 * are listed once at the start and the loops below allocate nothing.
 */
export function align(l: Ladder, layers: number[][], extra: Extra = () => 0, opts: AlignOptions = {}): Aligned {
  const limit = opts.limit ?? Infinity;
  const geom = opts.ports ?? DEFAULT_PORTS;
  const N = l.nodes.length;
  const realCount = l.realCount;
  const all = pieces(l);
  const P = all.length;

  // Per node: real or not, units, where its centre lies from its start, how far a port reaches, where a layer ends.
  const real = new Uint8Array(N);
  const unitsOf = new Float64Array(N);
  const wide = new Float64Array(N);
  const centreOff = new Float64Array(N);
  const reachOf = new Float64Array(N);
  const portReach = new Float64Array(N);
  const portInner = new Float64Array(N);
  const layerOf = new Int32Array(N);
  const singleDown = new Uint8Array(N);
  const singleUp = new Uint8Array(N);
  const degree = new Float64Array(N);
  for (let n = 0; n < N; n++) {
    real[n] = n < realCount ? 1 : 0;
    unitsOf[n] = l.nodes[n]?.units ?? 1;
    wide[n] = n < realCount ? (l.nodes[n]?.units ?? 2) : 2;
    centreOff[n] = n < realCount ? (unitsOf[n] as number) / 2 : 1;
    reachOf[n] = n < realCount ? (unitsOf[n] as number) : 1 + (opts.dummyShift ?? 1);
    portReach[n] = geom.reach(unitsOf[n] as number);
    portInner[n] = geom.inner?.(unitsOf[n] as number) ?? (portReach[n] as number);
    layerOf[n] = l.nodes[n]?.layer ?? 0;
    singleDown[n] = opts.single?.(n, 'down') === true ? 1 : 0;
    singleUp[n] = opts.single?.(n, 'up') === true ? 1 : 0;
    degree[n] = opts.degree?.(n) ?? 0;
  }

  // Places in a layer: the node before and after, the place, and the separation from the node before.
  const lines = Math.max(1, opts.lines ?? 1);
  const before = new Int32Array(N).fill(-1);
  const after = new Int32Array(N).fill(-1);
  const place = new Int32Array(N);
  const runIndex = new Int32Array(N);
  const sepLeft = new Float64Array(N);
  for (const row of layers) {
    for (let k = 0; k < row.length; k++) {
      const n = row[k] as number;
      place[n] = k;
      if (k === 0) continue;
      const p = row[k - 1] as number;
      before[n] = p;
      after[p] = n;
      if (!real[n] && !real[p]) runIndex[n] = (runIndex[p] as number) + 1;
    }
  }
  const sep = (a: number, b: number): number => {
    if (real[a]) return (unitsOf[a] as number) + extra(a, b) - (real[b] ? 0 : 1);
    if (real[b]) return 1;
    return (runIndex[b] as number) % lines === 0 ? 1 : 0;
  };
  for (const row of layers) for (let k = 1; k < row.length; k++) sepLeft[row[k] as number] = sep(row[k - 1] as number, row[k] as number);

  // Pieces and neighbours in lists made once: pieces by upper node (down) and by lower node (up), the other end and the piece.
  const pa = new Int32Array(P);
  const pb = new Int32Array(P);
  const pc = new Int32Array(P);
  const downStart = new Int32Array(N + 1);
  const upStart = new Int32Array(N + 1);
  const incStart = new Int32Array(N + 1);
  for (let k = 0; k < P; k++) {
    const [a, b, ci] = all[k] as [number, number, number];
    pa[k] = a;
    pb[k] = b;
    pc[k] = ci;
    downStart[a + 1] = (downStart[a + 1] as number) + 1;
    upStart[b + 1] = (upStart[b + 1] as number) + 1;
    incStart[a + 1] = (incStart[a + 1] as number) + 1;
    incStart[b + 1] = (incStart[b + 1] as number) + 1;
  }
  for (let n = 0; n < N; n++) {
    downStart[n + 1] = (downStart[n + 1] as number) + (downStart[n] as number);
    upStart[n + 1] = (upStart[n + 1] as number) + (upStart[n] as number);
    incStart[n + 1] = (incStart[n + 1] as number) + (incStart[n] as number);
  }
  const downItem = new Int32Array(P);
  const downPiece = new Int32Array(P);
  const upItem = new Int32Array(P);
  const upPiece = new Int32Array(P);
  const incItem = new Int32Array(2 * P);
  const fillDown = Int32Array.from(downStart);
  const fillUp = Int32Array.from(upStart);
  const fillInc = Int32Array.from(incStart);
  for (let k = 0; k < P; k++) {
    const a = pa[k] as number;
    const b = pb[k] as number;
    downItem[fillDown[a] as number] = b;
    downPiece[fillDown[a] as number] = k;
    fillDown[a] = (fillDown[a] as number) + 1;
    upItem[fillUp[b] as number] = a;
    upPiece[fillUp[b] as number] = k;
    fillUp[b] = (fillUp[b] as number) + 1;
    incItem[fillInc[a] as number] = b;
    fillInc[a] = (fillInc[a] as number) + 1;
    incItem[fillInc[b] as number] = a;
    fillInc[b] = (fillInc[b] as number) + 1;
  }

  // The weight of every piece: 3 when a box holds it alone on its side, else 1, and 2 more on the main flow.
  const mainFlow = opts.main ?? new Set<number>();
  const onMain = (ci: number): boolean => {
    const nodes = l.chains[ci]?.nodes ?? [];
    return mainFlow.has(nodes[0] ?? -1) || mainFlow.has(nodes[nodes.length - 1] ?? -1);
  };
  const weightOfPiece = new Float64Array(P);
  for (let k = 0; k < P; k++) weightOfPiece[k] = (singleDown[pa[k] as number] || singleUp[pb[k] as number] ? 3 : 1) + (onMain(pc[k] as number) ? 2 : 0);
  /** The weight of the piece from `upper` to `lower`: the heaviest of the pieces between them, 1 when there is none. */
  const pieceWeight = (upper: number, lower: number): number => {
    let found = 0;
    let any = false;
    for (let e = downStart[upper] as number, end = downStart[upper + 1] as number; e < end; e++) {
      if (downItem[e] !== lower) continue;
      const w = weightOfPiece[downPiece[e] as number] as number;
      if (!any || w > found) found = w;
      any = true;
    }
    return any ? found : 1;
  };

  // Pieces that cross an inner segment (dummy to dummy) and are not inner themselves: they lose to it.
  const markedPiece = new Uint8Array(P);
  {
    const inner: number[] = [];
    for (let k = 0; k < P; k++) if ((pa[k] as number) >= realCount && (pb[k] as number) >= realCount) inner.push(k);
    for (let k = 0; k < P; k++) {
      const a = pa[k] as number;
      const b = pb[k] as number;
      if (a >= realCount && b >= realCount) continue;
      const la = layerOf[a] as number;
      for (let m = 0; m < inner.length; m++) {
        const i = inner[m] as number;
        const c = pa[i] as number;
        const d = pb[i] as number;
        if (layerOf[c] !== la) continue;
        if ((((place[a] as number) - (place[c] as number)) * ((place[b] as number) - (place[d] as number))) < 0) markedPiece[k] = 1;
      }
    }
  }
  const isMarked = (upper: number, lower: number): boolean => {
    for (let e = downStart[upper] as number, end = downStart[upper + 1] as number; e < end; e++) if (downItem[e] === lower && markedPiece[downPiece[e] as number]) return true;
    return false;
  };

  /** A piece is straight when one port x is shared by both ends. */
  const straightAt = (a: number, sa: number, b: number, sb: number): boolean => {
    const ca = sa + (centreOff[a] as number);
    const cb = sb + (centreOff[b] as number);
    const ra = real[a] === 1;
    const rb = real[b] === 1;
    if (!ra && !rb) return Math.abs(ca - cb) < EPS;
    if (!ra || !rb) {
      const r = ra ? a : b;
      const d = ra ? cb : ca;
      const reach = (ra ? singleDown[r] : singleUp[r]) ? 0 : (portReach[r] as number);
      return Math.abs(d - ((ra ? sa : sb) + (centreOff[r] as number))) <= reach + EPS;
    }
    if (geom.centred) return Math.abs(ca - cb) < EPS;
    // A box whose side holds this edge only has it at the centre: both only, the centres agree; one only, its centre is clear of the other's corners.
    const oneA = singleDown[a] === 1;
    const oneB = singleUp[b] === 1;
    if (oneA && oneB) return Math.abs(ca - cb) < EPS;
    if (oneA || oneB) return Math.abs(ca - cb) <= (portInner[oneA ? b : a] as number) + EPS;
    const lo = Math.max(ca - (portReach[a] as number), cb - (portReach[b] as number));
    const hi = Math.min(ca + (portReach[a] as number), cb + (portReach[b] as number));
    return Math.ceil(lo * geom.steps - EPS) <= Math.floor(hi * geom.steps + EPS);
  };
  const countStraight = (st: Float64Array): number => {
    let n = 0;
    for (let k = 0; k < P; k++) if (straightAt(pa[k] as number, st[pa[k] as number] as number, pb[k] as number, st[pb[k] as number] as number)) n++;
    return n;
  };
  const endOf = (st: Float64Array): number => {
    let end = 0;
    for (let n = 0; n < N; n++) {
      const v = (st[n] as number) + (reachOf[n] as number);
      if (v > end) end = v;
    }
    return end;
  };

  // 1. The best of the four directions.
  const rowStart = new Int32Array(layers.length + 1);
  for (let i = 0; i < layers.length; i++) rowStart[i + 1] = (rowStart[i] as number) + (layers[i]?.length ?? 0);
  const rowItems = new Int32Array(rowStart[layers.length] as number);
  const posT = new Int32Array(N);
  const root = new Int32Array(N);
  const aligned = new Int32Array(N);
  const pred = new Int32Array(N);
  const rel = new Float64Array(N);
  const ns = new Int32Array(Math.max(1, P));
  const nw = new Float64Array(Math.max(1, P));
  const heavy = new Int32Array(Math.max(1, P));
  const membersStart = new Int32Array(N + 1);
  const membersItem = new Int32Array(N);
  const rawOffA = new Float64Array(N);
  const rawDone = new Uint8Array(N);
  const least = new Float64Array(N);
  const placedAt = new Float64Array(N);
  const placedDone = new Uint8Array(N);
  const activeFlag = new Uint8Array(N);
  const centredLink = (upper: number, lower: number): boolean => singleDown[upper] === 1 || singleUp[lower] === 1;

  /** One of the four directions: vertical alignment into blocks, then compaction. Writes starts from the left edge into `out`. */
  const direction = (downward: boolean, leftward: boolean, out: Float64Array): void => {
    const count = layers.length;
    for (let i = 0; i < count; i++) {
      const row = layers[i] as number[];
      const at = rowStart[i] as number;
      for (let k = 0; k < row.length; k++) {
        const n = leftward ? (row[k] as number) : (row[row.length - 1 - k] as number);
        rowItems[at + k] = n;
        posT[n] = k;
      }
    }
    for (let n = 0; n < N; n++) {
      root[n] = n;
      aligned[n] = n;
      pred[n] = -1;
      rel[n] = 0;
    }
    for (let s = 1; s < count; s++) {
      const layerAt = downward ? s : count - 1 - s;
      let reach = -1;
      let lastU = -1;
      let lastV = -1;
      let lastTail = 0;
      let lastReach = 0;
      for (let k = rowStart[layerAt] as number, end = rowStart[layerAt + 1] as number; k < end; k++) {
        const v = rowItems[k] as number;
        const from = downward ? (upStart[v] as number) : (downStart[v] as number);
        const to = downward ? (upStart[v + 1] as number) : (downStart[v + 1] as number);
        const d = to - from;
        if (d === 0) continue;
        // The neighbours in the order of their places (a stable insertion sort), each with the weight of its piece.
        for (let e = 0; e < d; e++) {
          const u = (downward ? upItem[from + e] : downItem[from + e]) as number;
          let at = e;
          while (at > 0 && (posT[ns[at - 1] as number] as number) > (posT[u] as number)) {
            ns[at] = ns[at - 1] as number;
            at--;
          }
          ns[at] = u;
        }
        let top = -Infinity;
        let mixed = false;
        for (let e = 0; e < d; e++) {
          const u = ns[e] as number;
          const w = downward ? pieceWeight(u, v) : pieceWeight(v, u);
          nw[e] = w;
          if (w > top) top = w;
        }
        for (let e = 0; e < d; e++) if ((nw[e] as number) !== top) mixed = true;
        let m0: number;
        let m1: number;
        if (mixed) {
          let h = 0;
          for (let e = 0; e < d; e++) if (nw[e] === top) heavy[h++] = e;
          // The heaviest edge nearest the middle (the earlier when equally near).
          let bestI = heavy[0] as number;
          for (let e = 1; e < h; e++) {
            const x = heavy[e] as number;
            const dx = Math.abs(x - (d - 1) / 2);
            const db = Math.abs(bestI - (d - 1) / 2);
            if (dx - db < 0 || (dx - db === 0 && x - bestI < 0)) bestI = x;
          }
          m0 = bestI;
          m1 = -1;
        } else if (d % 2 === 1) {
          m0 = (d - 1) / 2;
          m1 = -1;
        } else {
          m0 = d / 2 - 1;
          m1 = d / 2;
        }
        for (let t = 0; t < 2; t++) {
          const m = t === 0 ? m0 : m1;
          if (m < 0) break;
          if (aligned[v] !== v) break;
          const u = ns[m] as number;
          if (isMarked(downward ? u : v, downward ? v : u)) continue;
          if (reach >= (posT[u] as number)) {
            // Two alignments cross: the one of the heavier nodes stays.
            if (lastU < 0 || (degree[u] as number) + (degree[v] as number) <= (degree[lastU] as number) + (degree[lastV] as number)) continue;
            aligned[lastU] = lastTail;
            root[lastV] = lastV;
            aligned[lastV] = lastV;
            pred[lastV] = -1;
            rel[lastV] = 0;
            reach = lastReach;
            lastU = -1;
            if (reach >= (posT[u] as number)) continue;
          }
          lastU = u;
          lastV = v;
          lastTail = aligned[u] as number;
          lastReach = reach;
          aligned[u] = v;
          pred[v] = u;
          const upper = downward ? u : v;
          const lower = downward ? v : u;
          if (centredLink(upper, lower)) rel[v] = ((wide[u] as number) - (wide[v] as number)) / 2;
          root[v] = root[u] as number;
          aligned[v] = root[v] as number;
          reach = posT[u] as number;
        }
      }
    }
    // Block positions: the smallest start that keeps every layer's separation.
    membersStart.fill(0);
    for (let n = 0; n < N; n++) membersStart[(root[n] as number) + 1] = (membersStart[(root[n] as number) + 1] as number) + 1;
    for (let n = 0; n < N; n++) membersStart[n + 1] = (membersStart[n + 1] as number) + (membersStart[n] as number);
    const fill = least; // reused as the fill pointers before it holds the least offsets
    for (let n = 0; n < N; n++) fill[n] = membersStart[n] as number;
    for (let n = 0; n < N; n++) {
      const r = root[n] as number;
      membersItem[fill[r] as number] = n;
      fill[r] = (fill[r] as number) + 1;
    }
    // Offset of a member from the start of its block: through the chain of links, then shifted so the least is zero.
    rawDone.fill(0);
    const rawOff = (v: number): number => {
      if (rawDone[v]) return rawOffA[v] as number;
      const u = pred[v] as number;
      const o = u < 0 || root[u] !== root[v] ? 0 : rawOff(u) + (rel[v] as number);
      rawOffA[v] = o;
      rawDone[v] = 1;
      return o;
    };
    for (let r = 0; r < N; r++) {
      const a = membersStart[r] as number;
      const b = membersStart[r + 1] as number;
      if (a === b) continue;
      let low = Infinity;
      for (let e = a; e < b; e++) {
        const o = rawOff(membersItem[e] as number);
        if (o < low) low = o;
      }
      least[r] = low;
    }
    const off = (v: number): number => rawOff(v) - (least[root[v] as number] as number);
    placedDone.fill(0);
    activeFlag.fill(0);
    const placeBlock = (r: number): number => {
      if (placedDone[r]) return placedAt[r] as number;
      if (activeFlag[r]) return 0;
      activeFlag[r] = 1;
      let at = 0;
      for (let e = membersStart[r] as number, end = membersStart[r + 1] as number; e < end; e++) {
        const v = membersItem[e] as number;
        const k = posT[v] as number;
        if (k === 0) continue;
        const rowAt = rowStart[layerOf[v] as number] as number;
        const p = rowItems[rowAt + k - 1] as number;
        const separation = leftward ? (sepLeft[v] as number) : (unitsOf[p] as number) - (unitsOf[v] as number) + (sepLeft[p] as number);
        const need = placeBlock(root[p] as number) + off(p) + separation - off(v);
        if (need > at) at = need;
      }
      activeFlag[r] = 0;
      placedAt[r] = at;
      placedDone[r] = 1;
      return at;
    };
    let width = 0;
    for (let n = 0; n < N; n++) {
      const o = placeBlock(root[n] as number) + off(n);
      out[n] = o;
      const e = o + (unitsOf[n] as number);
      if (e > width) width = e;
    }
    if (leftward) return;
    for (let n = 0; n < N; n++) out[n] = width - ((out[n] as number) + (unitsOf[n] as number));
  };

  const cand0 = new Float64Array(N);
  const cand1 = new Float64Array(N);
  const cand2 = new Float64Array(N);
  const cand3 = new Float64Array(N);
  const candidates = [cand0, cand1, cand2, cand3];
  let which = 0;
  for (const downward of [true, false]) {
    for (const leftward of [true, false]) {
      const raw = candidates[which++] as Float64Array;
      direction(downward, leftward, raw);
      let low = Infinity;
      for (let n = 0; n < N; n++) if ((raw[n] as number) < low) low = raw[n] as number;
      for (let n = 0; n < N; n++) raw[n] = (raw[n] as number) - low;
    }
  }
  const scoreStraight = (st: Float64Array): number => {
    let sum = 0;
    for (let k = 0; k < P; k++) if (straightAt(pa[k] as number, st[pa[k] as number] as number, pb[k] as number, st[pb[k] as number] as number)) sum += pieceWeight(pa[k] as number, pb[k] as number);
    return sum;
  };
  const scoreOff = (st: Float64Array): number => {
    let sum = 0;
    for (let k = 0; k < P; k++) {
      const a = pa[k] as number;
      const b = pb[k] as number;
      if (!straightAt(a, st[a] as number, b, st[b] as number)) sum += Math.abs((st[a] as number) + (centreOff[a] as number) - ((st[b] as number) + (centreOff[b] as number)));
    }
    return sum;
  };
  const score = (st: Float64Array, into: Float64Array): void => {
    into[0] = -scoreStraight(st);
    into[1] = Math.max(0, endOf(st) - limit);
    into[2] = scoreOff(st);
  };
  let start = new Float64Array(N);
  start.set(cand0);
  const best = new Float64Array(3);
  score(start, best);
  const sc = new Float64Array(3);
  for (let c = 1; c < 4; c++) {
    const cand = candidates[c] as Float64Array;
    score(cand, sc);
    for (let i = 0; i < 3; i++) {
      if (sc[i] === best[i]) continue;
      if ((sc[i] as number) < (best[i] as number)) {
        start.set(cand);
        best.set(sc);
      }
      break;
    }
  }

  // Rigid groups: nodes joined by straight pieces. The groups are listed by their first (lowest numbered) member.
  const parent = new Int32Array(N);
  const groupOf = new Int32Array(N);
  const groupStart = new Int32Array(N + 1);
  const groupItem = new Int32Array(N);
  const groupFill = new Int32Array(N);
  const groupLabel = new Int32Array(N);
  let groupCount = 0;
  const findRoot = (x: number): number => {
    let r = x;
    while ((parent[r] as number) !== r) r = parent[r] as number;
    return r;
  };
  const groupsOf = (st: Float64Array): void => {
    for (let n = 0; n < N; n++) parent[n] = n;
    for (let k = 0; k < P; k++) {
      const a = pa[k] as number;
      const b = pb[k] as number;
      if (straightAt(a, st[a] as number, b, st[b] as number)) parent[findRoot(a)] = findRoot(b);
    }
    groupLabel.fill(-1);
    groupCount = 0;
    for (let n = 0; n < N; n++) {
      const r = findRoot(n);
      if (groupLabel[r] === -1) groupLabel[r] = groupCount++;
      groupOf[n] = groupLabel[r] as number;
    }
    groupStart.fill(0);
    for (let n = 0; n < N; n++) groupStart[(groupOf[n] as number) + 1] = (groupStart[(groupOf[n] as number) + 1] as number) + 1;
    for (let g = 0; g < groupCount; g++) groupStart[g + 1] = (groupStart[g + 1] as number) + (groupStart[g] as number);
    for (let g = 0; g < groupCount; g++) groupFill[g] = groupStart[g] as number;
    for (let n = 0; n < N; n++) {
      const g = groupOf[n] as number;
      groupItem[groupFill[g] as number] = n;
      groupFill[g] = (groupFill[g] as number) + 1;
    }
  };
  const hasStraight = (st: Float64Array, n: number): boolean => {
    for (let e = incStart[n] as number, end = incStart[n + 1] as number; e < end; e++) {
      const o = incItem[e] as number;
      if (straightAt(n, st[n] as number, o, st[o] as number)) return true;
    }
    return false;
  };

  const moved = new Uint8Array(N);
  const seenLayer = new Uint8Array(layers.length);
  const layerList = new Int32Array(layers.length);
  /** Moves a group by `delta`, pushing free neighbours along, into `next`; false when that would break anything. */
  const move = (st: Float64Array, g: number, delta: number, cap: number, next: Float64Array): boolean => {
    next.set(st);
    moved.fill(0);
    seenLayer.fill(0);
    let layerCountHere = 0;
    for (let e = groupStart[g] as number, end = groupStart[g + 1] as number; e < end; e++) {
      const n = groupItem[e] as number;
      moved[n] = 1;
      next[n] = (st[n] as number) + delta;
      const layer = layerOf[n] as number;
      if (!seenLayer[layer]) {
        seenLayer[layer] = 1;
        layerList[layerCountHere++] = layer;
      }
    }
    for (let li = 0; li < layerCountHere; li++) {
      const row = layers[layerList[li] as number] ?? [];
      if (delta > 0) {
        for (let k = 1; k < row.length; k++) {
          const p = row[k - 1] as number;
          const n = row[k] as number;
          const need = (next[p] as number) + (sepLeft[n] as number);
          if ((next[n] as number) >= need) continue;
          if (moved[n] || hasStraight(st, n)) return false;
          next[n] = need;
          moved[n] = 1;
        }
      } else {
        for (let k = row.length - 2; k >= 0; k--) {
          const q = row[k + 1] as number;
          const n = row[k] as number;
          const most = (next[q] as number) - (sepLeft[q] as number);
          if ((next[n] as number) <= most) continue;
          if (moved[n] || hasStraight(st, n)) return false;
          next[n] = most;
          moved[n] = 1;
        }
      }
    }
    for (let n = 0; n < N; n++) if ((next[n] as number) < 0) return false;
    return endOf(next) <= cap;
  };

  // 2. Straighten pass: the simple pieces first (a real box to a real box on a chain of two), then by chain.
  const orderIdx = Array.from({ length: P }, (_, k) => k);
  const simple = (k: number): number => Number(real[pa[k] as number] === 1 && real[pb[k] as number] === 1 && (l.chains[pc[k] as number]?.nodes.length ?? 0) === 2);
  orderIdx.sort((x, y) => simple(y) - simple(x) || (pc[x] as number) - (pc[y] as number));
  const pick = new Float64Array(N);
  const trial = new Float64Array(N);
  for (let sweep = 0; sweep < 4; sweep++) {
    let changed = false;
    for (let oi = 0; oi < P; oi++) {
      const k = orderIdx[oi] as number;
      const a = pa[k] as number;
      const b = pb[k] as number;
      if (straightAt(a, start[a] as number, b, start[b] as number)) continue;
      groupsOf(start);
      const base = countStraight(start);
      const cap = Math.max(limit, endOf(start));
      let havePick = false;
      let gain = 0;
      for (let side = 0; side < 2; side++) {
        const n = side === 0 ? a : b;
        const o = side === 0 ? b : a;
        const d1 = (start[o] as number) - (start[n] as number);
        const d2 = (start[o] as number) + (unitsOf[o] as number) - ((start[n] as number) + (unitsOf[n] as number));
        for (let di = 0; di < 2; di++) {
          const d = di === 0 ? d1 : d2;
          if (di === 1 && d2 === d1) continue;
          if (d === 0) continue;
          if (!move(start, groupOf[n] as number, d, cap, trial)) continue;
          const g = countStraight(trial) - base;
          if (g > gain) {
            gain = g;
            pick.set(trial);
            havePick = true;
          }
        }
      }
      if (havePick) {
        start.set(pick);
        changed = true;
      }
    }
    if (!changed) break;
  }

  // 3. Chain rhythm: flat neighbours sit one box apart when no straight piece holds them.
  for (let round = 0; round < 3; round++) {
    for (const f of l.flat) {
      const next = after[f.lo];
      if (next !== f.hi) continue;
      const target = (start[f.lo] as number) + (sepLeft[f.hi] as number);
      if ((start[f.hi] as number) <= target || hasStraight(start, f.hi)) continue;
      start[f.hi] = target;
    }
  }

  // 4. Close gaps: whole rigid groups move left as far as the separations allow.
  const groupLow = new Float64Array(N);
  const groupOrder = new Int32Array(N);
  for (let round = 0; round < 12; round++) {
    groupsOf(start);
    for (let g = 0; g < groupCount; g++) {
      let low = Infinity;
      for (let e = groupStart[g] as number, end = groupStart[g + 1] as number; e < end; e++) {
        const v = start[groupItem[e] as number] as number;
        if (v < low) low = v;
      }
      groupLow[g] = low;
      groupOrder[g] = g;
    }
    // The groups by their lowest start (the earlier group when equal).
    const sorted = Array.from(groupOrder.subarray(0, groupCount)).sort((x, y) => (groupLow[x] as number) - (groupLow[y] as number));
    let didMove = false;
    for (const g of sorted) {
      let shift = Infinity;
      for (let e = groupStart[g] as number, end = groupStart[g + 1] as number; e < end; e++) {
        const n = groupItem[e] as number;
        const lowest = before[n] === -1 ? 0 : (start[before[n] as number] as number) + (sepLeft[n] as number);
        const here = (start[n] as number) - lowest;
        if (here < shift) shift = here;
      }
      if (shift > 0 && Number.isFinite(shift)) {
        for (let e = groupStart[g] as number, end = groupStart[g + 1] as number; e < end; e++) {
          const n = groupItem[e] as number;
          start[n] = (start[n] as number) - shift;
        }
        didMove = true;
      }
    }
    if (!didMove) break;
  }

  // Last resort once rows and shelves are used up: nodes that stick out give up their alignment.
  if (opts.squeeze && endOf(start) > limit) {
    for (const row of layers) {
      for (let k = row.length - 1; k >= 0; k--) {
        const n = row[k] as number;
        const q = row[k + 1];
        const most = q === undefined ? limit - (reachOf[n] as number) : (start[q] as number) - (sepLeft[q] as number);
        if ((start[n] as number) > most) start[n] = most;
      }
    }
    for (const row of layers) {
      for (let k = 1; k < row.length; k++) {
        const p = row[k - 1] as number;
        const n = row[k] as number;
        start[n] = Math.max(start[n] as number, (start[p] as number) + (sepLeft[n] as number));
      }
    }
    let lowest = Infinity;
    for (let n = 0; n < N; n++) if ((start[n] as number) < lowest) lowest = start[n] as number;
    if (lowest < 0) for (let n = 0; n < N; n++) start[n] = (start[n] as number) - lowest;
  }
  // Stages: a node with three or more partners in one adjacent layer stands in the middle of them: level with the middle
  // partner when there is an odd number, between the two middle ones when even.
  if (opts.hubs) {
    const centres = new Float64Array(Math.max(1, P));
    for (let n = 0; n < realCount; n++) {
      const downCount = (downStart[n + 1] as number) - (downStart[n] as number);
      const upCount = (upStart[n + 1] as number) - (upStart[n] as number);
      let from: number;
      let items: Int32Array;
      let d: number;
      if (downCount >= 3) {
        from = downStart[n] as number;
        items = downItem;
        d = downCount;
      } else if (upCount >= 3) {
        from = upStart[n] as number;
        items = upItem;
        d = upCount;
      } else continue;
      for (let e = 0; e < d; e++) {
        const m = items[from + e] as number;
        centres[e] = (start[m] as number) + (centreOff[m] as number);
      }
      const used = centres.subarray(0, d);
      used.sort();
      const target = d % 2 === 1 ? (used[(d - 1) / 2] as number) : ((used[d / 2 - 1] as number) + (used[d / 2] as number)) / 2;
      const b = before[n] as number;
      const a = after[n] as number;
      const low = b === -1 ? 0 : (start[b] as number) + (sepLeft[n] as number);
      const high = a === -1 ? Infinity : (start[a] as number) - (sepLeft[a] as number);
      const wanted = Math.round(target - (unitsOf[n] as number) / 2);
      const at = Math.min(Math.max(wanted, low), high);
      if (low <= high && at !== start[n]) start[n] = at;
    }
  }
  // Moves may leave the whole drawing a unit or more from the edge.
  let low = Infinity;
  for (let n = 0; n < N; n++) if ((start[n] as number) < low) low = start[n] as number;
  if (low > 0) for (let n = 0; n < N; n++) start[n] = (start[n] as number) - low;
  return { start: Array.from(start), width: endOf(start) };
}
