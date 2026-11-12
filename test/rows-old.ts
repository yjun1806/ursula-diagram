// rows.ts as it was before the rewrite on arrays; kept as it was, with `assignLayers` renamed `assignLayersOld`.
import type { Graph } from '../src/types.ts';

/**
 * How a flow inside a lane is laid over rows. 'flat': on one row, branches below. 'head': the node that takes the flow in
 * from a lane above (the entry) stands on the first row and the rest of the flow on the row below, the node after the
 * entry in the same column. 'headTail': also the last node of the flow, when it leaves for a lane below, stands under
 * the node before it.
 */
export type Fold = 'flat' | 'head' | 'headTail';

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
  /** Nodes of the main flow: the longest path along edges inside one lane, one for the whole drawing. */
  main: number[];
  /** Whether the piece the main flow belongs to was cut between ranks because it was wider than a row. */
  mainCut: boolean;
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

/** The longest path of a DAG; among equal lengths the one whose nodes have more links elsewhere, then the earliest source order. */
function longestPath(ids: number[], succ: Map<number, number[]>, weight: (v: number) => number = () => 0): number[] {
  const longest = new Map<number, number>();
  const heavy = new Map<number, number>();
  const next = new Map<number, number>();
  for (const v of [...topoOrder(ids, succ)].reverse()) {
    let best = 0;
    let bestWeight = 0;
    let via = -1;
    for (const w of succ.get(v) ?? []) {
      const len = longest.get(w) ?? 0;
      const sum = heavy.get(w) ?? 0;
      if (len > best || (len === best && sum > bestWeight) || (len === best && sum === bestWeight && via >= 0 && w < via)) {
        best = len;
        bestWeight = sum;
        via = w;
      }
    }
    longest.set(v, 1 + best);
    heavy.set(v, weight(v) + bestWeight);
    next.set(v, via);
  }
  let start = -1;
  for (const v of ids) {
    if (start < 0) start = v;
    else if ((longest.get(v) ?? 0) > (longest.get(start) ?? 0) || ((longest.get(v) ?? 0) === (longest.get(start) ?? 0) && (heavy.get(v) ?? 0) > (heavy.get(start) ?? 0))) start = v;
  }
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
  /** A block of one node that no edge touches at all. */
  single: boolean;
  /** The entry of the block stands on the first row and the rest of the flow below it (fold by the head). */
  folded: boolean;
  /** The connected piece the block was cut from (its smallest node), and the first rank of the block inside it. */
  comp: number;
  firstRank: number;
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
    if (!b) continue;
    used.add(b);
    used.add(t);
    slots.push({ width: Math.max(t.width, b.width), items: [{ block: t, offset: 0 }, { block: b, offset: rows - b.height }] });
  }
  // Anchoring is a preference: before another row is opened, blocks that lean the same way share columns too.
  const rest = blocks.filter((b) => !used.has(b)).sort((x, y) => y.width - x.width);
  for (const first of rest) {
    if (used.has(first)) continue;
    used.add(first);
    const other = rest.find((x) => !used.has(x) && x.height + first.height <= rows);
    if (!other) {
      slots.push(alone(first));
      continue;
    }
    used.add(other);
    const [upper, lower] = first.anchor === 'bottom' && other.anchor === 'top' ? [other, first] : [first, other];
    slots.push({ width: Math.max(first.width, other.width), items: [{ block: upper, offset: 0 }, { block: lower, offset: rows - lower.height }] });
  }
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
      // Blocks cut from one flow keep their order; only unrelated blocks share free cells.
      if (host === small || host.height < 2 || !out.includes(small) || host.comp === small.comp) continue;
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
      merged.comp = host.comp;
      merged.firstRank = host.firstRank;
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
 * A flow folded into several rows reads from the top row to the bottom row: of two blocks cut from one piece, the
 * earlier ranks lie higher. The block that holds the head of the lane's main flow opens the first row.
 */
function readDownward(shelves: Shelf[], head: number | undefined): Shelf[] {
  const out = shelves.map((sh) => ({ ...sh, slots: sh.slots.map((sl) => ({ ...sl, items: sl.items.map((it) => ({ ...it })) })) }));
  const place = (b: Block): { shelf: number; slot: number; item: number } | undefined => {
    for (const [s, sh] of out.entries()) for (const [k, sl] of sh.slots.entries()) for (const [i, it] of sl.items.entries()) if (it.block === b) return { shelf: s, slot: k, item: i };
    return undefined;
  };
  const all = out.flatMap((sh) => sh.slots.flatMap((sl) => sl.items.map((it) => it.block)));
  const rowKey = (b: Block): number => {
    const at = place(b);
    if (!at) return 0;
    return at.shelf * 1000 + (out[at.shelf]?.slots[at.slot]?.items[at.item]?.offset ?? 0);
  };
  for (let round = 0; round < 40; round++) {
    let moved = false;
    for (const x of all) {
      for (const y of all) {
        if (x === y || x.comp !== y.comp || x.firstRank >= y.firstRank || rowKey(x) <= rowKey(y)) continue;
        const a = place(x);
        const b = place(y);
        if (!a || !b) continue;
        if (a.shelf !== b.shelf) {
          const [first, second] = [Math.min(a.shelf, b.shelf), Math.max(a.shelf, b.shelf)];
          [out[first], out[second]] = [out[second] as Shelf, out[first] as Shelf];
          moved = true;
        } else if (a.slot === b.slot) {
          const slot = out[a.shelf]?.slots[a.slot];
          const rows = out[a.shelf]?.rows ?? 1;
          if (!slot) continue;
          const [ia, ib] = [slot.items[a.item], slot.items[b.item]];
          if (!ia || !ib) continue;
          [ia.block, ib.block] = [ib.block, ia.block];
          slot.items.forEach((it, i) => {
            it.offset = i === 0 ? 0 : rows - it.block.height;
          });
          moved = true;
        }
        if (moved) break;
      }
      if (moved) break;
    }
    if (!moved) break;
  }
  const headBlock = head === undefined ? undefined : all.find((b) => b.nodes.includes(head));
  const at = headBlock ? place(headBlock) : undefined;
  if (headBlock && at) {
    const [shelf] = out.splice(at.shelf, 1);
    if (shelf) {
      const [slot] = shelf.slots.splice(at.slot, 1);
      if (slot) {
        const [item] = slot.items.splice(at.item, 1);
        if (item) {
          slot.items.unshift({ block: item.block, offset: 0 });
          slot.items.forEach((it, i) => {
            it.offset = i === 0 ? 0 : shelf.rows - it.block.height;
          });
          shelf.slots.unshift(slot);
        }
      }
      out.unshift(shelf);
    }
  }
  return out;
}

/**
 * Stage 1: the layers of the graph. A layer is one row of one lane. Inside a lane every connected piece is a
 * small block (main path on its first row, branches on rows below); blocks stand side by side, anchored toward
 * the lanes they talk to, and only when a row would be too full do they stack or move to another shelf of rows.
 */
export function assignLayersOld(graph: Graph, units: number[], capacity: number | number[], reduction: number | number[] = 0, apart = false, fold: Fold = 'flat'): Rows {
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
  let main: number[] = [];
  const cutPieces: number[][] = [];
  const foldedComps = new Set<number>();
  const shorter = (a: number[], b: number[]): boolean => {
    if (a.length !== b.length) return a.length < b.length;
    const pa = a.reduce((n, v) => n + (partners[v]?.length ?? 0), 0);
    const pb = b.reduce((n, v) => n + (partners[v]?.length ?? 0), 0);
    if (pa !== pb) return pa < pb;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return (a[i] as number) > (b[i] as number);
    return false;
  };

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
    const flow = longestPath(ids, succ, (v) => partners[v]?.length ?? 0);
    if (flow.length > 1 && shorter(main, flow)) main = flow;
    const comps = new Map<number, number[]>();
    for (const i of ids) comps.set(find(i), [...(comps.get(find(i)) ?? []), i]);

    const edgesOut = (nodes: number[]): Array<{ node: number; other: number }> =>
      nodes.flatMap((n) => (partners[n] ?? []).map((other) => ({ node: n, other })));
    const lean = (list: Array<{ other: number }>): [number, number] => [
      list.filter((p) => (laneOf[p.other] ?? 0) < lane).length,
      list.filter((p) => (laneOf[p.other] ?? 0) > lane).length,
    ];
    const blocks: Block[] = [];
    const makeBlock = (nodes: number[], rankOf: Map<number, number>, rowOf: Map<number, number>, comp: number[] = nodes): Block => {
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
        single: nodes.length === 1 && comp.length === 1 && list.length === 0,
        folded: false,
        comp: Math.min(...comp),
        firstRank: Math.min(...nodes.map((n) => rankOf.get(n) ?? 0)),
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
      let foldedBlock = false;
      if (fold !== 'flat') {
        // The entry: it takes edges from another lane, none from its own, and sends exactly one into its own lane.
        const crossIn = (n: number): number[] => (partners[n] ?? []).filter((o) => graph.edges.some((e) => e.to === graph.nodes[n]?.id && index.get(e.from) === o));
        const entry = nodes.find((n) => (pred.get(n) ?? []).length === 0 && (succ.get(n) ?? []).length === 1 && crossIn(n).length > 0);
        if (entry !== undefined && nodes.length > 1 && crossIn(entry).every((o) => (laneOf[o] ?? 0) < lane) && nodes.every((n) => n === entry || (rankOf.get(n) ?? 0) >= 1)) {
          // The rest of the flow moves a row down and a column back, so that its first node stands under the entry.
          for (const v of nodes) {
            if (v === entry) continue;
            rowOf.set(v, (rowOf.get(v) ?? 0) + 1);
            rankOf.set(v, (rankOf.get(v) ?? 0) - 1);
          }
          foldedBlock = true;
        }
        if (fold === 'headTail') {
          for (const t of nodes) {
            if ((succ.get(t) ?? []).length > 0 || (pred.get(t) ?? []).length !== 1) continue;
            const goesDown = graph.edges.some((e) => index.get(e.from) === t && (laneOf[index.get(e.to) ?? 0] ?? 0) > lane);
            const before = (pred.get(t) ?? [])[0] as number;
            const row = (rowOf.get(before) ?? 0) + 1;
            const column = rankOf.get(before) ?? 0;
            if (!goesDown || nodes.some((n) => n !== t && rowOf.get(n) === row && rankOf.get(n) === column)) continue;
            rowOf.set(t, row);
            rankOf.set(t, column);
          }
        }
      }
      const height = Math.max(...[...rowOf.values()]) + 1;
      if (foldedBlock) foldedComps.add(Math.min(...nodes));
      if (height > 1) {
        const rowLean = (r: number): [number, number] => lean(edgesOut(nodes.filter((n) => rowOf.get(n) === r)));
        const [up0, down0] = rowLean(0);
        const [upLast, downLast] = rowLean(height - 1);
        // Branches stay below the flow they leave: an edge inside a lane never runs up.
        void up0; void down0; void upLast; void downLast;
      }
      // A block wider than a row is cut between ranks.
      const widthOfRanks = (rs: number[]): number => rs.reduce((s, r) => s + Math.max(...nodes.filter((n) => rankOf.get(n) === r).map((n) => units[n] ?? 2)), 0);
      const ranks = [...new Set(nodes.map((n) => rankOf.get(n) ?? 0))].sort((x, y) => x - y);
      let group: number[] = [];
      const flush = (): void => {
        if (group.length === 0) return;
        blocks.push(makeBlock(nodes.filter((n) => group.includes(rankOf.get(n) ?? 0)), rankOf, rowOf, nodes));
        group = [];
      };
      let groups = 0;
      const flushCounted = (): void => {
        if (group.length > 0) groups++;
        flush();
      };
      for (const r of ranks) {
        if (group.length > 0 && widthOfRanks([...group, r]) > cap) flushCounted();
        group.push(r);
      }
      flushCounted();
      if (groups > 1) cutPieces.push(nodes);
    }

    // Folded by the head: the lane has a first row beside the lane the flow comes from, and the rest of its flows stand on the row inside;
    // nodes without edges inside the lane stay on the first row.
    for (const b of blocks) b.folded = foldedComps.has(b.comp);
    if (blocks.some((b) => b.folded)) for (const b of blocks) b.anchor = b.folded || b.single || b.cross === 0 ? 'top' : 'bottom';
    const widest = Math.max(...blocks.map((b) => b.width));
    const room = Math.max(widest, cap - less);
    const lone = apart ? blocks.filter((b) => b.single) : [];
    // Nodes without edges in their lane may wait one place further along the band instead of filling the same row.
    const packed = lone.length > 0 && lone.length < blocks.length
      ? [...pack(fill(blocks.filter((b) => !b.single), room, makeBlock, (n) => units[n] ?? 2), room), ...pack(lone, room)]
      : pack(fill(blocks, room, makeBlock, (n) => units[n] ?? 2), room);
    const textStart = index.get(graph.edges[0]?.from ?? '');
    const head = textStart !== undefined && laneOf[textStart] === lane ? textStart : flow.length > 1 ? flow[0] : undefined;
    const shelves = readDownward(packed, head);
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
  return { layer, layerLane, layerRow, reversed, pathIndex, pathPos, main, mainCut: main.some((n) => cutPieces.some((piece) => piece.includes(n))) };
}

/**
 * Rows by stage: inside a lane, nodes are taken in the order of their stage; the main flow stays on the first
 * row, and a node takes the row of the node that leads to it when that cell is free, else the first free row
 * (leaning toward the lanes it talks to), else the lane opens one more row. Two nodes never share row and stage.
 */
export function assignByStage(graph: Graph, base: Rows, stage: number[]): Rows {
  const index = new Map(graph.nodes.map((n, i) => [n.id, i] as const));
  const laneOf = graph.nodes.map((n) => Math.max(0, graph.lanes.findIndex((l) => l.id === n.lane)));
  const layer = new Array<number>(graph.nodes.length).fill(0);
  const layerLane: number[] = [];
  const layerRow: number[] = [];
  const main = new Set(base.main);
  const leads = graph.nodes.map((): number[] => []);
  const lean = new Array<number>(graph.nodes.length).fill(0);
  graph.edges.forEach((e, edge) => {
    const a = index.get(e.from);
    const b = index.get(e.to);
    if (a === undefined || b === undefined || a === b) return;
    if (laneOf[a] === laneOf[b]) {
      const [from, to] = base.reversed[edge] ? [b, a] : [a, b];
      leads[to]?.push(from);
    } else {
      lean[a] = (lean[a] ?? 0) + (laneOf[b] ?? 0) - (laneOf[a] ?? 0) > 0 ? (lean[a] ?? 0) + 1 : (lean[a] ?? 0) - 1;
      lean[b] = (lean[b] ?? 0) + (laneOf[a] ?? 0) - (laneOf[b] ?? 0) > 0 ? (lean[b] ?? 0) + 1 : (lean[b] ?? 0) - 1;
    }
  });
  let next = 0;
  graph.lanes.forEach((_, lane) => {
    const ids = graph.nodes.map((_, i) => i).filter((i) => laneOf[i] === lane);
    if (ids.length === 0) return;
    ids.sort((x, y) => (stage[x] ?? 0) - (stage[y] ?? 0) || Number(main.has(y)) - Number(main.has(x)) || x - y);
    const taken = new Set<string>();
    const rowOf = new Map<number, number>();
    let count = 1;
    for (const v of ids) {
      const s = stage[v] ?? 0;
      const free = (r: number): boolean => !taken.has(`${r}|${s}`);
      const lead = [...(leads[v] ?? [])].sort((x, y) => (stage[y] ?? 0) - (stage[x] ?? 0) || x - y)[0];
      // An edge inside a lane never runs up: a node stands on or below every node that leads to it.
      const lowest = Math.max(0, ...(leads[v] ?? []).map((p) => rowOf.get(p) ?? 0));
      const order = Array.from({ length: count }, (_, r) => r).filter((r) => r >= lowest);
      if ((lean[v] ?? 0) > 0) order.reverse();
      const wanted = main.has(v) ? [0] : [...(lead === undefined ? [] : [rowOf.get(lead) ?? 0]), ...order];
      let row = wanted.find(free);
      if (row === undefined) row = count++;
      rowOf.set(v, row);
      taken.add(`${row}|${s}`);
    }
    for (let r = 0; r < count; r++) {
      layerLane.push(lane);
      layerRow.push(r);
    }
    for (const v of ids) layer[v] = next + (rowOf.get(v) ?? 0);
    next += count;
  });
  return { ...base, layer, layerLane, layerRow, pathIndex: stage.map((s) => s), pathPos: graph.nodes.map((_, i) => i) };
}
