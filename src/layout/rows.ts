import type { Graph } from '../types.ts';

/** Row of every node inside its lane (0-based, dense). */
export function assignRows(graph: Graph, rank: Map<string, number>): Map<string, number> {
  const laneOf = new Map(graph.nodes.map((n) => [n.id, n.lane] as const));
  const order = new Map(graph.nodes.map((n, i) => [n.id, i] as const));
  const rankOf = (id: string): number => rank.get(id) ?? 0;
  const rows = new Map<string, number>();

  for (const lane of graph.lanes) {
    const ids = graph.nodes.filter((n) => n.lane === lane.id).map((n) => n.id);
    const sorted = [...ids].sort((a, b) => rankOf(a) - rankOf(b) || (order.get(a) ?? 0) - (order.get(b) ?? 0));
    const preds = new Map<string, string[]>(ids.map((id) => [id, []]));
    const succs = new Map<string, string[]>(ids.map((id) => [id, []]));
    for (const e of graph.edges) {
      if (laneOf.get(e.from) !== lane.id || laneOf.get(e.to) !== lane.id || e.from === e.to) continue;
      const [lo, hi] = rankOf(e.from) < rankOf(e.to) ? [e.from, e.to] : [e.to, e.from];
      if (rankOf(lo) === rankOf(hi)) continue;
      preds.get(hi)?.push(lo);
      succs.get(lo)?.push(hi);
    }

    // Longest in-lane path (by node count) is the lane's main flow.
    const best = new Map<string, number>();
    const via = new Map<string, string>();
    for (const id of sorted) {
      let len = 1;
      for (const p of preds.get(id) ?? []) {
        const cand = (best.get(p) ?? 1) + 1;
        if (cand > len) {
          len = cand;
          via.set(id, p);
        }
      }
      best.set(id, len);
    }
    let tail: string | undefined;
    for (const id of sorted) if (tail === undefined || (best.get(id) ?? 0) > (best.get(tail) ?? 0)) tail = id;

    const laneRows = new Map<string, number>();
    for (let cur = tail; cur !== undefined; cur = via.get(cur)) laneRows.set(cur, 0);

    const taken = (r: number, row: number): boolean =>
      [...laneRows].some(([id, v]) => v === row && rankOf(id) === r);
    for (const id of sorted) {
      if (laneRows.has(id)) continue;
      const placedPred = (preds.get(id) ?? []).find((p) => laneRows.has(p));
      const placedSucc = (succs.get(id) ?? []).find((s) => laneRows.has(s));
      const anchor = placedPred ?? placedSucc;
      const want = anchor === undefined ? 0 : (laneRows.get(anchor) ?? 0);
      let chosen = want;
      for (let d = 0; ; d++) {
        if (!taken(rankOf(id), want + d)) {
          chosen = want + d;
          break;
        }
        if (want - d >= 0 && !taken(rankOf(id), want - d)) {
          chosen = want - d;
          break;
        }
      }
      laneRows.set(id, chosen);
    }

    // Compact to dense row numbers.
    const used = [...new Set(laneRows.values())].sort((a, b) => a - b);
    const dense = new Map(used.map((r, i) => [r, i] as const));
    const compact = new Map([...laneRows].map(([id, r]) => [id, dense.get(r) ?? 0] as const));
    const maxRow = Math.max(0, used.length - 1);

    // Flip when that puts cross-lane neighbours on the side facing their lane.
    const laneIndex = new Map(graph.lanes.map((l, i) => [l.id, i] as const));
    const here = laneIndex.get(lane.id) ?? 0;
    let cost = 0;
    let flipped = 0;
    for (const e of graph.edges) {
      for (const [mine, other] of [[e.from, e.to], [e.to, e.from]] as const) {
        if (laneOf.get(mine) !== lane.id || laneOf.get(other) === lane.id) continue;
        const r = compact.get(mine) ?? 0;
        const toward = (laneIndex.get(laneOf.get(other) ?? '') ?? here) > here;
        cost += toward ? maxRow - r : r;
        flipped += toward ? r : maxRow - r;
      }
    }
    const flip = flipped < cost;
    for (const [id, r] of compact) rows.set(id, flip ? maxRow - r : r);
  }
  return rows;
}
