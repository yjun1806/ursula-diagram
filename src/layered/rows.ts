import type { Graph } from '../types.ts';

export interface Rows {
  /** Layer of every graph node. */
  layer: number[];
  layerLane: number[];
  layerRow: number[];
  /** Per graph edge: an edge inside a lane that cycle breaking turned around. */
  reversed: boolean[];
  /** Initial-order hint: the block a node belongs to (mean source index of its cross-lane partners) and its rank in the block. */
  pathIndex: number[];
  pathPos: number[];
}

interface LaneEdge {
  edge: number;
  a: number;
  b: number;
}

/** Marks the edges that close a cycle in a depth-first walk in source order. */
function backEdges(ids: number[], out: Map<number, LaneEdge[]>): Set<number> {
  const state = new Map<number, 1 | 2>();
  const back = new Set<number>();
  const visit = (v: number): void => {
    state.set(v, 1);
    for (const e of out.get(v) ?? []) {
      const s = state.get(e.b);
      if (s === 1) back.add(e.edge);
      else if (s === undefined) visit(e.b);
    }
    state.set(v, 2);
  };
  for (const v of ids) if (!state.has(v)) visit(v);
  return back;
}

/** Topological order of a DAG (sources first). */
function topoOrder(ids: number[], succ: Map<number, number[]>): number[] {
  const post: number[] = [];
  const seen = new Set<number>();
  const visit = (v: number): void => {
    seen.add(v);
    for (const w of succ.get(v) ?? []) if (!seen.has(w) && ids.includes(w)) visit(w);
    post.push(v);
  };
  for (const v of ids) if (!seen.has(v)) visit(v);
  return post.reverse();
}

/** The longest path of a DAG; ties go to the earliest source order. */
function longestPath(ids: number[], succ: Map<number, number[]>): number[] {
  const longest = new Map<number, number>();
  const next = new Map<number, number>();
  for (const v of [...topoOrder(ids, succ)].reverse()) {
    let best = 0;
    let via = -1;
    for (const w of succ.get(v) ?? []) {
      const len = longest.get(w) ?? 0;
      if (len > best || (len === best && via >= 0 && w < via)) {
        best = len;
        via = w;
      }
    }
    longest.set(v, 1 + best);
    next.set(v, via);
  }
  let start = -1;
  for (const v of ids) if (start < 0 || (longest.get(v) ?? 0) > (longest.get(start) ?? 0)) start = v;
  const path: number[] = [];
  for (let v = start; v >= 0; v = next.get(v) ?? -1) path.push(v);
  return path;
}

interface Block {
  nodes: number[];
  rankOf: Map<number, number>;
  rowOf: Map<number, number>;
  height: number;
  width: number;
  up: number;
  down: number;
  cross: number;
  anchor: 'top' | 'bottom';
  hint: number;
}

interface Slot {
  width: number;
  items: Array<{ block: Block; offset: number }>;
}

interface Shelf {
  rows: number;
  slots: Slot[];
}

const total = (slots: Slot[]): number => slots.reduce((s, x) => s + x.width, 0);

/** Slots of one shelf when every block stands alone, or when a top-anchored block shares columns with a bottom-anchored one. */
function slotsFor(blocks: Block[], rows: number, stack: boolean): Slot[] {
  const alone = (b: Block): Slot => ({ width: b.width, items: [{ block: b, offset: b.anchor === 'top' ? 0 : rows - b.height }] });
  if (!stack) return blocks.map(alone);
  const tops = blocks.filter((b) => b.anchor === 'top').sort((x, y) => y.width - x.width);
  const bottoms = blocks.filter((b) => b.anchor === 'bottom').sort((x, y) => y.width - x.width);
  const slots: Slot[] = [];
  const used = new Set<Block>();
  for (const t of tops) {
    const b = bottoms.find((x) => !used.has(x) && x.height + t.height <= rows);
    if (b) used.add(b);
    slots.push({ width: Math.max(t.width, b?.width ?? 0), items: [{ block: t, offset: 0 }, ...(b ? [{ block: b, offset: rows - b.height }] : [])] });
  }
  for (const b of bottoms) if (!used.has(b)) slots.push(alone(b));
  return slots;
}

/**
 * When blocks side by side would overflow a row, a one-row block moves into free cells inside the bounding
 * box of a taller block (a branch of two ranks leaves the other ranks of its row free).
 */
function fill(blocks: Block[], cap: number, make: (nodes: number[], rankOf: Map<number, number>, rowOf: Map<number, number>) => Block, units: (n: number) => number): Block[] {
  if (blocks.reduce((sum, b) => sum + b.width, 0) <= cap) return blocks;
  const out = [...blocks];
  for (const small of [...blocks].filter((b) => b.height === 1).sort((x, y) => x.width - y.width)) {
    for (const host of out) {
      if (host === small || host.height < 2 || !out.includes(small)) continue;
      const ranks = [...new Set(host.nodes.map((n) => host.rankOf.get(n) ?? 0))].sort((x, y) => x - y);
      const colWidth = new Map(ranks.map((r) => [r, Math.max(...host.nodes.filter((n) => host.rankOf.get(n) === r).map(units))] as const));
      const used = new Set(host.nodes.map((n) => `${host.rowOf.get(n)}|${host.rankOf.get(n)}`));
      const mine = [...new Set(small.nodes.map((n) => small.rankOf.get(n) ?? 0))].sort((x, y) => x - y);
      const rowsToTry = Array.from({ length: host.height }, (_, r) => r);
      if (small.anchor === 'bottom') rowsToTry.reverse();
      let placed: { row: number; first: number } | undefined;
      for (const row of rowsToTry) {
        for (let first = 0; first + mine.length <= ranks.length && !placed; first++) {
          const fits = mine.every((m, i) => {
            const col = ranks[first + i] as number;
            const need = Math.max(...small.nodes.filter((n) => small.rankOf.get(n) === m).map(units));
            return !used.has(`${row}|${col}`) && need <= (colWidth.get(col) ?? 0);
          });
          if (fits) placed = { row, first };
        }
        if (placed) break;
      }
      if (!placed) continue;
      const rankOf = new Map(host.rankOf);
      const rowOf = new Map(host.rowOf);
      for (const n of small.nodes) {
        rankOf.set(n, ranks[placed.first + mine.indexOf(small.rankOf.get(n) ?? 0)] as number);
        rowOf.set(n, placed.row);
      }
      const merged = make([...host.nodes, ...small.nodes], rankOf, rowOf);
      out.splice(out.indexOf(host), 1, merged);
      out.splice(out.indexOf(small), 1);
      break;
    }
  }
  return out;
}

/** Fewest rows first: side by side, then stacked, then further shelves. */
function pack(blocks: Block[], cap: number): Shelf[] {
  const tallest = Math.max(1, ...blocks.map((b) => b.height));
  const side = slotsFor(blocks, tallest, false);
  if (total(side) <= cap) return [{ rows: tallest, slots: side }];
  for (const rows of new Set([tallest, Math.max(tallest, 2)])) {
    const stacked = slotsFor(blocks, rows, true);
    if (total(stacked) <= cap) return [{ rows, slots: stacked }];
  }
  const shelves: Array<{ blocks: Block[]; width: number }> = [];
  for (const b of [...blocks].sort((x, y) => y.cross - x.cross)) {
    const open = shelves.find((s) => s.width + b.width <= cap);
    if (open) {
      open.blocks.push(b);
      open.width += b.width;
    } else shelves.push({ blocks: [b], width: b.width });
  }
  const made = shelves.map((s) => {
    const rows = Math.max(1, ...s.blocks.map((b) => b.height));
    return { rows, slots: slotsFor(s.blocks, rows, false), lean: s.blocks.reduce((n, b) => n + b.up - b.down, 0) };
  });
  return made.sort((x, y) => y.lean - x.lean).map(({ rows, slots }) => ({ rows, slots }));
}

/**
 * Stage 1: the layers of the graph. A layer is one row of one lane. Inside a lane every connected piece is a
 * small block (main path on its first row, branches on rows below); blocks stand side by side, anchored toward
 * the lanes they talk to, and only when a row would be too full do they stack or move to another shelf of rows.
 */
export function assignLayers(graph: Graph, units: number[], capacity: number | number[], reduction: number | number[] = 0): Rows {
  const index = new Map(graph.nodes.map((n, i) => [n.id, i] as const));
  const laneOf = graph.nodes.map((n) => Math.max(0, graph.lanes.findIndex((l) => l.id === n.lane)));
  const layer = new Array<number>(graph.nodes.length).fill(0);
  const pathIndex = new Array<number>(graph.nodes.length).fill(0);
  const pathPos = new Array<number>(graph.nodes.length).fill(0);
  const reversed = new Array<boolean>(graph.edges.length).fill(false);
  const layerLane: number[] = [];
  const layerRow: number[] = [];
  const partners = graph.nodes.map((): number[] => []);
  graph.edges.forEach((e) => {
    const a = index.get(e.from);
    const b = index.get(e.to);
    if (a === undefined || b === undefined || laneOf[a] === laneOf[b]) return;
    partners[a]?.push(b);
    partners[b]?.push(a);
  });
  let nextLayer = 0;

  graph.lanes.forEach((_, lane) => {
    const ids = graph.nodes.map((_, i) => i).filter((i) => laneOf[i] === lane);
    if (ids.length === 0) return;
    const cap = Math.max(2, Array.isArray(capacity) ? (capacity[lane] ?? Infinity) : capacity);
    const less = Array.isArray(reduction) ? (reduction[lane] ?? 0) : reduction;
    const inLane: LaneEdge[] = [];
    graph.edges.forEach((e, edge) => {
      const a = index.get(e.from);
      const b = index.get(e.to);
      if (a !== undefined && b !== undefined && a !== b && laneOf[a] === lane && laneOf[b] === lane) inLane.push({ edge, a, b });
    });
    const out = new Map<number, LaneEdge[]>();
    for (const e of inLane) out.set(e.a, [...(out.get(e.a) ?? []), e]);
    const back = backEdges(ids, out);
    const succ = new Map<number, number[]>();
    const pred = new Map<number, number[]>();
    const parent = new Map(ids.map((i) => [i, i] as const));
    const find = (x: number): number => {
      let r = x;
      while ((parent.get(r) as number) !== r) r = parent.get(r) as number;
      return r;
    };
    for (const e of inLane) {
      const flip = back.has(e.edge);
      if (flip) reversed[e.edge] = true;
      const [from, to] = flip ? [e.b, e.a] : [e.a, e.b];
      succ.set(from, [...(succ.get(from) ?? []), to]);
      pred.set(to, [...(pred.get(to) ?? []), from]);
      parent.set(Math.max(find(from), find(to)), Math.min(find(from), find(to)));
    }
    const comps = new Map<number, number[]>();
    for (const i of ids) comps.set(find(i), [...(comps.get(find(i)) ?? []), i]);

    const edgesOut = (nodes: number[]): Array<{ node: number; other: number }> =>
      nodes.flatMap((n) => (partners[n] ?? []).map((other) => ({ node: n, other })));
    const lean = (list: Array<{ other: number }>): [number, number] => [
      list.filter((p) => (laneOf[p.other] ?? 0) < lane).length,
      list.filter((p) => (laneOf[p.other] ?? 0) > lane).length,
    ];
    const blocks: Block[] = [];
    const makeBlock = (nodes: number[], rankOf: Map<number, number>, rowOf: Map<number, number>): Block => {
      const list = edgesOut(nodes);
      const [up, down] = lean(list);
      const shared = new Map<number, number>();
      for (const p of list) shared.set(laneOf[p.other] ?? 0, (shared.get(laneOf[p.other] ?? 0) ?? 0) + 1);
      let best = -1;
      for (const [l, c] of [...shared].sort((x, y) => x[0] - y[0])) if (best < 0 || c > (shared.get(best) ?? 0)) best = l;
      const anchor = up > down ? 'top' : down > up ? 'bottom' : best >= 0 && best > lane ? 'bottom' : 'top';
      const widthAt = new Map<number, number>();
      for (const n of nodes) widthAt.set(rankOf.get(n) ?? 0, Math.max(widthAt.get(rankOf.get(n) ?? 0) ?? 0, units[n] ?? 2));
      const mean = (xs: number[]): number => xs.reduce((s, x) => s + x, 0) / xs.length;
      return {
        nodes,
        rankOf,
        rowOf,
        height: Math.max(...nodes.map((n) => (rowOf.get(n) ?? 0) + 1)),
        width: [...widthAt.values()].reduce((s, w) => s + w, 0),
        up,
        down,
        cross: list.length,
        anchor,
        hint: list.length > 0 ? mean(list.map((p) => p.other)) : mean(nodes),
      };
    };
    for (const nodes of comps.values()) {
      const topo = topoOrder(nodes, succ);
      const rankOf = new Map<number, number>();
      for (const v of topo) rankOf.set(v, Math.max(-1, ...(pred.get(v) ?? []).map((p) => rankOf.get(p) ?? -1)) + 1);
      const rowOf = new Map<number, number>();
      const taken = new Set<string>();
      const take = (v: number, r: number): void => {
        rowOf.set(v, r);
        taken.add(`${r}|${rankOf.get(v)}`);
      };
      for (const v of longestPath(nodes, succ)) take(v, 0);
      for (const v of topo) {
        if (rowOf.has(v)) continue;
        const free = (r: number): boolean => !taken.has(`${r}|${rankOf.get(v)}`);
        let row = (pred.get(v) ?? []).map((p) => rowOf.get(p) ?? 0).find(free);
        if (row === undefined) {
          row = 1;
          while (!free(row)) row++;
        }
        take(v, row);
      }
      const height = Math.max(...[...rowOf.values()]) + 1;
      if (height > 1) {
        const rowLean = (r: number): [number, number] => lean(edgesOut(nodes.filter((n) => rowOf.get(n) === r)));
        const [up0, down0] = rowLean(0);
        const [upLast, downLast] = rowLean(height - 1);
        if (down0 > up0 && upLast > downLast) for (const v of nodes) rowOf.set(v, height - 1 - (rowOf.get(v) ?? 0));
      }
      // A block wider than a row is cut between ranks.
      const widthOfRanks = (rs: number[]): number => rs.reduce((s, r) => s + Math.max(...nodes.filter((n) => rankOf.get(n) === r).map((n) => units[n] ?? 2)), 0);
      const ranks = [...new Set(nodes.map((n) => rankOf.get(n) ?? 0))].sort((x, y) => x - y);
      let group: number[] = [];
      const flush = (): void => {
        if (group.length === 0) return;
        blocks.push(makeBlock(nodes.filter((n) => group.includes(rankOf.get(n) ?? 0)), rankOf, rowOf));
        group = [];
      };
      for (const r of ranks) {
        if (group.length > 0 && widthOfRanks([...group, r]) > cap) flush();
        group.push(r);
      }
      flush();
    }

    const widest = Math.max(...blocks.map((b) => b.width));
    const shelves = pack(fill(blocks, Math.max(widest, cap - less), makeBlock, (n) => units[n] ?? 2), Math.max(widest, cap - less));
    const keys: Array<[number, number, number]> = [];
    shelves.forEach((shelf, s) => {
      for (const slot of shelf.slots) {
        for (const { block, offset } of slot.items) {
          for (const n of block.nodes) {
            const row = s * 1000 + offset + (block.rowOf.get(n) ?? 0);
            keys.push([n, row, 0]);
            pathIndex[n] = block.hint + (blocks.indexOf(block) + 1) * 1e-6;
            pathPos[n] = block.rankOf.get(n) ?? 0;
          }
        }
      }
    });
    const rowKeys = [...new Set(keys.map((k) => k[1]))].sort((x, y) => x - y);
    for (const [n, row] of keys) layer[n] = nextLayer + rowKeys.indexOf(row);
    rowKeys.forEach((_, r) => {
      layerLane.push(lane);
      layerRow.push(r);
    });
    nextLayer += rowKeys.length;
  });
  return { layer, layerLane, layerRow, reversed, pathIndex, pathPos };
}
