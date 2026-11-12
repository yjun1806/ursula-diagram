import type { Graph, Layout, LayoutEdge } from '../types.ts';
import type { Placed } from './model.ts';
import type { Rows } from './rows.ts';
import { offCentre, score } from './choose.ts';

const EPS = 1e-6;

/** Draws that may be spent on small changes. */
export const MAX_DRAWS = 200;

interface Seg {
  ax: number;
  ay: number;
  bx: number;
  by: number;
}

const segs = (e: LayoutEdge): Seg[] => e.points.slice(1).map((q, i) => ({ ax: (e.points[i] as { x: number }).x, ay: (e.points[i] as { y: number }).y, bx: q.x, by: q.y }));

function cross(a: Seg, b: Seg): boolean {
  const ah = Math.abs(a.ay - a.by) < EPS;
  const bh = Math.abs(b.ay - b.by) < EPS;
  if (ah === bh) return false;
  const [h, v] = ah ? [a, b] : [b, a];
  return v.ax > Math.min(h.ax, h.bx) + EPS && v.ax < Math.max(h.ax, h.bx) - EPS && h.ay > Math.min(v.ay, v.by) + EPS && h.ay < Math.max(v.ay, v.by) - EPS;
}

/** Edges that cross another edge or bend. */
function troubled(l: Layout): number[] {
  const all = l.edges.map(segs);
  const bad = new Set<number>();
  all.forEach((s, i) => {
    if (s.length > 1) bad.add(i);
    for (let j = i + 1; j < all.length; j++) {
      if (s.some((x) => (all[j] as Seg[]).some((y) => cross(x, y)))) {
        bad.add(i);
        bad.add(j);
      }
    }
  });
  return [...bad].sort((x, y) => x - y);
}

const better = (a: number[], b: number[]): boolean => {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return (a[i] as number) < (b[i] as number);
  return false;
};

export interface Refined {
  placed: Placed;
  layout: Layout;
  draws: number;
  accepted: number;
}

/**
 * Small changes to a finished placement, one at a time: two neighbours in a layer swap places, or a block of
 * one lane moves to another row of that lane. A change is kept when the redrawn picture measures better; the
 * walk starts over after every kept change and stops when nothing helps or the draws are used up.
 */
export function refine(graph: Graph, first: Placed, draw: (p: Placed) => Layout, options: { maxDraws?: number; tight?: ((rows: Rows) => Placed) | undefined; crossingsFirst?: boolean; memo?: Map<string, Layout | null>; tag?: string } = {}): Refined {
  const maxDraws = options.maxDraws ?? MAX_DRAWS;
  // The climb can weigh crossings inside the cost or put them first; the two reach different drawings.
  const measure = (l: Layout): number[] => {
    const sc = score(l);
    return options.crossingsFirst ? [sc[0] as number, l.diagnostics.filter((d) => d.kind === 'crossing').length, ...sc.slice(1)] : sc;
  };
  const index = new Map(graph.nodes.map((n, i) => [n.id, i] as const));
  const laneOf = graph.nodes.map((n) => n.lane);
  const inLane = graph.nodes.map((): number[] => []);
  for (const e of graph.edges) {
    const a = index.get(e.from);
    const b = index.get(e.to);
    if (a === undefined || b === undefined || a === b || laneOf[a] !== laneOf[b]) continue;
    inLane[a]?.push(b);
    inLane[b]?.push(a);
  }
  // Targets are looked at heaviest node first: the one with the most edges in and out (the earlier one when equal).
  const degree = graph.nodes.map(() => 0);
  for (const e of graph.edges) {
    const a = index.get(e.from);
    const b = index.get(e.to);
    if (a === undefined || b === undefined || a === b) continue;
    degree[a] = (degree[a] ?? 0) + 1;
    degree[b] = (degree[b] ?? 0) + 1;
  }
  const heavier = (x: number, y: number): number => (degree[y] ?? 0) - (degree[x] ?? 0) || x - y;
  const component = (start: number): number[] => {
    const seen = new Set([start]);
    const queue = [start];
    for (let q = 0; q < queue.length; q++) for (const w of inLane[queue[q] as number] ?? []) if (!seen.has(w)) {
      seen.add(w);
      queue.push(w);
    }
    return [...seen].sort((x, y) => x - y);
  };

  let current = first;
  let layout = draw(current);
  let mine = measure(layout);
  let draws = 1;
  let accepted = 0;
  const attempt = (trial: () => Placed | undefined): boolean => {
    if (draws >= maxDraws) return false;
    const next = trial();
    if (!next || next.width > Math.max(next.capacity, current.width)) return false;
    // A placement drawn before (same rows, same order in every layer, same starts) is not drawn again.
    const key = `${options.tag ?? ''}|${next.rows.layer.join(',')}|${next.rows.layerLane.join(',')}|${next.layers.map((r) => r.join('.')).join('/')}|${next.start.join(',')}`;
    const known = options.memo?.get(key);
    const l = known ?? draw(next);
    if (known === undefined) options.memo?.set(key, l);
    draws++;
    const s = measure(l);
    if (!better(s, mine)) return false;
    current = next;
    layout = l;
    mine = s;
    accepted++;
    return true;
  };

  // A node slides together with the pass-through lines that run straight on from it, when the cells beside it are free.
  const slideNode = (n: number, to: number): boolean => {
    if (to === current.start[n] || to < 0) return false;
    const members = new Set([n]);
    const queue = [n];
    for (let q = 0; q < queue.length; q++) {
      const v = queue[q] as number;
      for (const c of current.ladder.chains) {
        const i = c.nodes.indexOf(v);
        if (c.kind !== 'span' || i < 0) continue;
        for (const w of [c.nodes[i - 1], c.nodes[i + 1]]) {
          if (w !== undefined && w >= current.ladder.realCount && !members.has(w) && current.start[w] === current.start[n]) {
            members.add(w);
            queue.push(w);
          }
        }
      }
    }
    const width = (v: number): number => (v < current.ladder.realCount ? (current.ladder.nodes[v]?.units ?? 2) : 1);
    for (const v of members) {
      const lay = current.layers[current.ladder.nodes[v]?.layer ?? 0] ?? [];
      const i = lay.indexOf(v);
      const before = lay[i - 1];
      const after = lay[i + 1];
      if (before !== undefined && !members.has(before) && to < (current.start[before] ?? 0) + width(before)) return false;
      if (after !== undefined && !members.has(after) && to + width(v) > (current.start[after] ?? 0)) return false;
    }
    return attempt(() => {
      const start = [...current.start];
      for (const v of members) start[v] = to;
      const end = Math.max(...current.ladder.nodes.map((v) => (start[v.idx] ?? 0) + (v.idx < current.ladder.realCount ? v.units : 2)));
      return { ...current, start, width: end };
    });
  };

  for (;;) {
    if (draws >= maxDraws || mine.slice(1, -1).every((v) => v === 0)) break;
    // First, lanes with several rows try to give up their last row: its nodes go up to a row with room, at a tighter gap if need be.
    let reduced = false;
    for (let lane = 0; lane < graph.lanes.length && !reduced; lane++) {
      const rows = current.rows;
      const own = rows.layerLane.map((x, i) => (x === lane ? i : -1)).filter((i) => i >= 0);
      if (own.length < 2) continue;
      const last = own[own.length - 1] as number;
      for (const target of own.slice(0, -1)) {
        const layerOf = rows.layer.map((x) => (x === last ? target : x > last ? x - 1 : x));
        const next: Rows = { ...rows, layer: layerOf, layerLane: rows.layerLane.filter((_, i) => i !== last), layerRow: rows.layerRow.filter((_, i) => i !== last) };
        if (attempt(() => current.rebuild(next)) || (options.tight !== undefined && attempt(() => (options.tight as (r: Rows) => Placed)(next)))) {
          reduced = true;
          break;
        }
      }
    }
    if (reduced) continue;
    const main = new Set(current.rows.main);
    const targets = new Set<number>();
    for (const i of troubled(layout)) {
      for (const n of current.ladder.chains[i]?.nodes ?? []) {
        const row = current.layers[current.ladder.nodes[n]?.layer ?? 0] ?? [];
        const k = row.indexOf(n);
        for (const m of [row[k - 1], n, row[k + 1]]) if (m !== undefined) targets.add(m);
      }
    }
    // Fan-out and fan-in nodes that are not in the middle of their partners are looked at too.
    const wanted = new Map<number, number>();
    for (const o of offCentre(layout)) {
      const i = index.get(o.id);
      if (i === undefined) continue;
      targets.add(i);
      wanted.set(i, o.mid);
    }
    let changed = false;
    const tried = new Set<string>();
    for (const n of [...targets].sort(heavier)) {
      const layer = current.ladder.nodes[n]?.layer ?? 0;
      const row = current.layers[layer] ?? [];
      const k = row.indexOf(n);
      for (const j of [k + 1, k - 1]) {
        const m = row[j];
        if (m === undefined) continue;
        const key = `${Math.min(n, m)}|${Math.max(n, m)}`;
        if (tried.has(key)) continue;
        tried.add(key);
        if (n < current.ladder.realCount && m < current.ladder.realCount && main.has(n) && main.has(m) && !current.loose) continue;
        const swapped = current.layers.map((r) => [...r]);
        const copy = swapped[layer] as number[];
        [copy[k], copy[j]] = [copy[j] as number, copy[k] as number];
        if (attempt(() => current.reorder(swapped))) {
          changed = true;
          break;
        }
      }
      if (changed) break;
      // The node goes to the free place nearest the middle of its partners, inside its layer and in its order.
      const middle = wanted.get(n);
      const shape = layout.nodes.find((v) => v.id === graph.nodes[n]?.id);
      if (middle !== undefined && shape && layout.pitch) {
        const reading = layout.direction === 'TD' ? 'y' : 'x';
        const size = layout.direction === 'TD' ? shape.h : shape.w;
        const shift = Math.round((middle - (shape[reading] + size / 2)) / (layout.pitch / 2));
        if (shift !== 0 && slideNode(n, (current.start[n] ?? 0) + shift)) changed = true;
        if (changed) break;
      }
      if (n >= current.ladder.realCount) continue;
      const comp = component(n);
      const rows = current.rows;
      const from = new Set(comp.map((v) => rows.layer[v] ?? 0));
      if (from.size !== 1) continue;
      const home = [...from][0] as number;
      const lane = rows.layerLane[home] ?? 0;
      if (!graph.nodes.some((_, v) => !comp.includes(v) && rows.layer[v] === home)) continue;
      for (let target = 0; target < rows.layerLane.length; target++) {
        if (target === home || rows.layerLane[target] !== lane) continue;
        const layerOf = [...rows.layer];
        for (const v of comp) layerOf[v] = target;
        if (attempt(() => current.rebuild({ ...rows, layer: layerOf }))) {
          changed = true;
          break;
        }
      }
      if (changed) break;
      if (changed) break;
    }
    // Then a node may slide to the start of a node it is joined to, when the cells between its neighbours are free.
    if (!changed) {
      for (const n of [...targets].sort(heavier)) {
        const layer = current.ladder.nodes[n]?.layer ?? 0;
        const row = current.layers[layer] ?? [];
        const k = row.indexOf(n);
        const prev = row[k - 1];
        const next = row[k + 1];
        const width = (v: number): number => (v < current.ladder.realCount ? (current.ladder.nodes[v]?.units ?? 2) : 1);
        const partners = new Set<number>();
        for (const c of current.ladder.chains) {
          const at = c.nodes.indexOf(n);
          if (c.kind !== 'span' || at < 0) continue;
          for (const m of [c.nodes[at - 1], c.nodes[at + 1]]) if (m !== undefined) partners.add(m);
        }
        for (const m of [...partners].sort((x, y) => x - y)) {
          const to = current.start[m] ?? 0;
          if (to === current.start[n]) continue;
          if (prev !== undefined && to < (current.start[prev] ?? 0) + width(prev)) continue;
          if (next !== undefined && to + width(n) > (current.start[next] ?? 0)) continue;
          if (attempt(() => {
            const start = [...current.start];
            start[n] = to;
            const end = Math.max(...current.ladder.nodes.map((v) => (start[v.idx] ?? 0) + (v.idx < current.ladder.realCount ? v.units : 2)));
            return { ...current, start, width: end };
          })) {
            changed = true;
            break;
          }
        }
        if (changed) break;
      }
    }
    // Only when no swap or move helps may a lane open one more row (up to two rows).
    if (!changed) {
      for (const n of [...targets].sort(heavier)) {
        if (n >= current.ladder.realCount) continue;
        const comp = component(n);
        const rows = current.rows;
        const from = new Set(comp.map((v) => rows.layer[v] ?? 0));
        if (from.size !== 1) continue;
        const home = [...from][0] as number;
        const lane = rows.layerLane[home] ?? 0;
        if (!graph.nodes.some((_, v) => !comp.includes(v) && rows.layer[v] === home)) continue;
        const own = rows.layerLane.filter((x) => x === lane).length;
        if (own >= 2) continue;
        const at = rows.layerLane.lastIndexOf(lane) + 1;
        const layerOf = rows.layer.map((x) => (x >= at ? x + 1 : x));
        for (const v of comp) layerOf[v] = at;
        const layerLane = [...rows.layerLane];
        const layerRow = [...rows.layerRow];
        layerLane.splice(at, 0, lane);
        layerRow.splice(at, 0, own);
        if (attempt(() => current.rebuild({ ...rows, layer: layerOf, layerLane, layerRow }))) {
          changed = true;
          break;
        }
      }
    }
    if (!changed) break;
  }
  return { placed: current, layout, draws, accepted };
}
