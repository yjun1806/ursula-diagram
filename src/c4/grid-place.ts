import type { Graph, GridSpec } from '../types.ts';
import type { GridRows } from './grid-rows.ts';

export interface Cell {
  r: number;
  c: number;
}

/** A range of cells: rows `r0..r1`, columns `c0..c1`, both ends in. */
export interface CellRect {
  r0: number;
  r1: number;
  c0: number;
  c1: number;
}

export interface GridCells {
  cell: Map<string, Cell>;
  /** The cells every cluster covers. */
  rect: Map<string, CellRect>;
  rows: number;
  columns: number;
}

/** A node or a cluster laid out on its own: what it holds, rows absolute when `anchored`, else counted from its top. */
interface Block {
  id: string;
  anchored: boolean;
  cells: Map<string, Cell>;
  rects: Map<string, CellRect>;
  box: CellRect;
  /** A cluster with nothing in it holds one cell of its own. */
  empty: boolean;
}

const key = (r: number, c: number): string => `${r},${c}`;
const inRect = (q: CellRect, r: number, c: number): boolean => r >= q.r0 && r <= q.r1 && c >= q.c0 && c <= q.c1;
const meets = (a: CellRect, b: CellRect): boolean => a.r0 <= b.r1 && b.r0 <= a.r1 && a.c0 <= b.c1 && b.c0 <= a.c1;
const moved = (q: CellRect, dr: number, dc: number): CellRect => ({ r0: q.r0 + dr, r1: q.r1 + dr, c0: q.c0 + dc, c1: q.c1 + dc });

function shift(b: Block, dr: number, dc: number): Block {
  return {
    ...b,
    cells: new Map([...b.cells].map(([id, p]) => [id, { r: p.r + dr, c: p.c + dc }])),
    rects: new Map([...b.rects].map(([id, q]) => [id, moved(q, dr, dc)])),
    box: moved(b.box, dr, dc),
  };
}

function boundOf(blocks: readonly Block[]): CellRect | undefined {
  if (blocks.length === 0) return undefined;
  return {
    r0: Math.min(...blocks.map((b) => b.box.r0)),
    r1: Math.max(...blocks.map((b) => b.box.r1)),
    c0: Math.min(...blocks.map((b) => b.box.c0)),
    c1: Math.max(...blocks.map((b) => b.box.c1)),
  };
}

/**
 * Places every node on one grid of rows and columns, and every cluster on a range of its cells. A cluster is laid out
 * first, with what stands in it, and then stands as one fixed block in the level above. In a level, blocks go before
 * nodes, the ones with more lines first; each takes the column where most of its lines run straight up, down or across
 * to what stands already, a node keeping one straight partner above, one below, one left and one right. The nodes
 * without lines and the clusters that hold none fill the free cells of their level row by row, `shapeInRow` to a row.
 */
export function placeCells(graph: Graph, spec: GridSpec, rows: GridRows): GridCells {
  const order = new Map(spec.order.map((id, i) => [id, i] as const));
  const rank = (id: string): number => order.get(id) ?? Infinity;
  const nodeIds = new Set(graph.nodes.map((n) => n.id));
  const parentOf = new Map((graph.clusters ?? []).map((c) => [c.id, c.parent]));
  const children = new Map<string, string[]>();
  const add = (parent: string | undefined, id: string): void => {
    const p = parent !== undefined && parentOf.has(parent) ? parent : '';
    children.set(p, [...(children.get(p) ?? []), id]);
  };
  for (const n of graph.nodes) add(n.cluster, n.id);
  for (const c of graph.clusters ?? []) add(c.parent, c.id);
  for (const list of children.values()) list.sort((a, b) => rank(a) - rank(b));

  // Lines between nodes, as counts per pair.
  const mult = new Map<string, Map<string, number>>();
  const bump = (a: string, b: string): void => {
    const m = mult.get(a) ?? new Map<string, number>();
    m.set(b, (m.get(b) ?? 0) + 1);
    mult.set(a, m);
  };
  for (const e of graph.edges) {
    if (!nodeIds.has(e.from) || !nodeIds.has(e.to) || e.from === e.to) continue;
    bump(e.from, e.to);
    bump(e.to, e.from);
  }
  for (const l of spec.lays) {
    if (!nodeIds.has(l.from) || !nodeIds.has(l.to) || l.from === l.to) continue;
    bump(l.from, l.to);
    bump(l.to, l.from);
  }
  const degree = (id: string): number => [...(mult.get(id)?.values() ?? [])].reduce((s, v) => s + v, 0);
  const leftOf = new Map<string, string>();
  for (const [a, b] of rows.beside) leftOf.set(`${a}>${b}`, 'left');

  // Straight partners: one per direction for every node.
  const partner = { up: new Map<string, string>(), down: new Map<string, string>(), left: new Map<string, string>(), right: new Map<string, string>() };

  const descendants = (id: string): Set<string> => {
    const out = new Set<string>();
    const walk = (at: string): void => {
      for (const k of children.get(at) ?? []) {
        if (nodeIds.has(k)) out.add(k);
        else walk(k);
      }
    };
    walk(id);
    return out;
  };

  const layLevel = (id: string): Block => {
    const kids = (children.get(id) ?? []).map((k): Block => {
      if (!nodeIds.has(k)) return layLevel(k);
      const row = rows.row.get(k);
      const at = { r: row ?? 0, c: 0 };
      return { id: k, anchored: row !== undefined, cells: new Map([[k, at]]), rects: new Map(), box: { r0: at.r, r1: at.r, c0: 0, c1: 0 }, empty: false };
    });
    const external = (b: Block): number => {
      let n = 0;
      for (const e of b.cells.keys()) for (const [o, m] of mult.get(e) ?? []) if (!b.cells.has(o)) n += m;
      return n;
    };
    const anchored = kids.filter((b) => b.anchored).sort((a, b) => {
      const ca = nodeIds.has(a.id) ? 1 : 0;
      const cb = nodeIds.has(b.id) ? 1 : 0;
      return ca - cb || external(b) - external(a) || rank(a.id) - rank(b.id);
    });
    const placed: Block[] = [];
    const reserved = new Set<string>();
    const colOf = new Map<string, Cell>();

    /** True when nothing stands in the cell but what may: no node, no cluster that holds neither end, no straight line already there. */
    const clear = (r: number, c: number, x: Block, dc: number, ends: [string, string], dr = 0): boolean => {
      if (reserved.has(key(r, c))) return false;
      for (const b of [...placed, shift(x, dr, dc)]) {
        for (const [, p] of b.cells) if (p.r === r && p.c === c) return false;
        for (const [cid, q] of b.rects) {
          if (!inRect(q, r, c)) continue;
          const inner = descendants(cid);
          if (!inner.has(ends[0]) && !inner.has(ends[1])) return false;
        }
        if (b.empty && inRect(b.box, r, c)) return false;
      }
      return true;
    };
    const fits = (x: Block, dc: number, dr = 0): boolean => {
      const box = moved(x.box, dr, dc);
      if (placed.some((b) => meets(b.box, box))) return false;
      for (const k of reserved) {
        const [r, c] = k.split(',').map(Number) as [number, number];
        if (x.rects.size > 0 || x.empty ? inRect(box, r, c) : [...x.cells.values()].some((p) => p.r + dr === r && p.c + dc === c)) return false;
      }
      return true;
    };
    /** The straight lines `x` would get at column offset `dc`, best pairs first, each node keeping one partner a side. */
    const straight = (x: Block, dc: number, pairs: Array<[string, string]>, dr = 0): Array<{ e: string; p: string; dir: 'up' | 'down' | 'left' | 'right'; between: string[] }> => {
      const out: Array<{ e: string; p: string; dir: 'up' | 'down' | 'left' | 'right'; between: string[] }> = [];
      const taken = new Set<string>();
      for (const [e, p] of pairs) {
        const pe = x.cells.get(e) as Cell;
        const pp = colOf.get(p) as Cell;
        const at = { r: pe.r + dr, c: pe.c + dc };
        let dir: 'up' | 'down' | 'left' | 'right';
        const between: string[] = [];
        if (at.c === pp.c && at.r !== pp.r) {
          dir = pp.r < at.r ? 'up' : 'down';
          for (let r = Math.min(at.r, pp.r) + 1; r < Math.max(at.r, pp.r); r++) between.push(key(r, at.c));
        } else if (at.r === pp.r && at.c !== pp.c) {
          dir = pp.c < at.c ? 'left' : 'right';
          if (leftOf.has(`${e}>${p}`) && dir === 'left') continue;
          if (leftOf.has(`${p}>${e}`) && dir === 'right') continue;
          for (let c = Math.min(at.c, pp.c) + 1; c < Math.max(at.c, pp.c); c++) between.push(key(at.r, c));
        } else continue;
        const back = dir === 'up' ? 'down' : dir === 'down' ? 'up' : dir === 'left' ? 'right' : 'left';
        if (partner[dir].has(e) || partner[back].has(p) || taken.has(`${e}:${dir}`) || taken.has(`${p}:${back}`)) continue;
        if (!between.every((k) => {
          const [r, c] = k.split(',').map(Number) as [number, number];
          return clear(r, c, x, dc, [e, p], dr);
        })) continue;
        taken.add(`${e}:${dir}`);
        taken.add(`${p}:${back}`);
        out.push({ e, p, dir, between });
      }
      return out;
    };

    const pairsOf = (x: Block): Array<[string, string]> => {
      const pairs: Array<[string, string]> = [];
      const own = [...x.cells.keys()].sort((a, b) => degree(b) - degree(a) || rank(a) - rank(b));
      for (const e of own) {
        const others = [...(mult.get(e) ?? new Map<string, number>())].filter(([p]) => colOf.has(p));
        others.sort(([p, m], [q, n]) => n - m || degree(p) - m - (degree(q) - n) || rank(p) - rank(q));
        for (const [p] of others) pairs.push([e, p]);
      }
      return pairs;
    };
    /** For a node a cluster stands in the way of at column offset `dc`: the row offsets right above and right below that cluster where it fits, nearest first. */
    const around = (x: Block, dc: number): number[] => {
      if (!nodeIds.has(x.id)) return [];
      const box = moved(x.box, 0, dc);
      const blocks = placed.filter((b) => !nodeIds.has(b.id) && meets(b.box, box));
      const b = blocks[0];
      if (blocks.length !== 1 || b === undefined) return [];
      return [b.box.r0 - 1 - x.box.r0, b.box.r1 + 1 - x.box.r0].filter((dr) => fits(x, dc, dr)).sort((p, q) => Math.abs(p) - Math.abs(q));
    };
    const done = new Set<Block>();
    const commit = (x: Block, dc: number, dr = 0): void => {
      for (const s of straight(x, dc, pairsOf(x), dr)) {
        const back = s.dir === 'up' ? 'down' : s.dir === 'down' ? 'up' : s.dir === 'left' ? 'right' : 'left';
        partner[s.dir].set(s.e, s.p);
        partner[back].set(s.p, s.e);
        for (const k of s.between) reserved.add(k);
      }
      const at = shift(x, dr, dc);
      placed.push(at);
      done.add(x);
      for (const [e, p] of at.cells) colOf.set(e, p);
    };
    /** Where an item goes that no placed element chose: the column of most straight lines to what stands, else beside its best partner, else the first column from the left where it fits. */
    const settle = (x: Block): number => {
      if (placed.length === 0) return -x.box.c0;
      const pairs = pairsOf(x);
      let dc: number | undefined;
      let best = 0;
      for (const [e, p] of pairs) {
        const pe = x.cells.get(e) as Cell;
        const pp = colOf.get(p) as Cell;
        for (const t of pe.r !== pp.r ? [pp.c - pe.c] : [pp.c + 1 - pe.c, pp.c - 1 - pe.c]) {
          if (!fits(x, t)) continue;
          const n = straight(x, t, pairs).length;
          if (n > best) {
            best = n;
            dc = t;
          }
        }
      }
      if (dc !== undefined) return dc;
      const all = boundOf(placed) as CellRect;
      let t = all.c0 - x.box.c0;
      while (!fits(x, t)) t += 1;
      return t;
    };
    const itemOf = new Map<string, Block>();
    for (const b of anchored) for (const e of b.cells.keys()) itemOf.set(e, b);
    // The blocks stand first; then every element, the ones with more lines first, takes its partners.
    for (const x of anchored) if (!nodeIds.has(x.id)) commit(x, settle(x));
    // Only the lines inside this level order its elements: a line out of it says nothing about the columns in it.
    const inside = (id: string): number => [...(mult.get(id) ?? [])].reduce((sum, [o, m]) => sum + (itemOf.has(o) ? m : 0), 0);
    const elements = [...itemOf.keys()].sort((a, b) => inside(b) - inside(a) || (inside(a) > 0 ? degree(b) - degree(a) : 0) || rank(a) - rank(b));
    {
      for (const e of elements) {
        const x = itemOf.get(e) as Block;
        if (!done.has(x)) commit(x, settle(x));
        const pe = colOf.get(e) as Cell;
        // Its partners not placed yet, best first: more lines with it, fewer lines of their own, written earlier.
        const open = [...(mult.get(e) ?? new Map<string, number>())].filter(([p]) => itemOf.has(p) && !done.has(itemOf.get(p) as Block));
        open.sort(([p, m], [q, n]) => n - m || degree(p) - m - (degree(q) - n) || rank(p) - rank(q));
        // Of three or more partners that stand in one row, the middle one written stands right under or over it.
        const sameRow = new Map<number, string[]>();
        for (const [p] of open) {
          const r = rows.row.get(p);
          if (r !== undefined) sameRow.set(r, [...(sameRow.get(r) ?? []), p]);
        }
        for (const list of sameRow.values()) {
          if (list.length < 3) continue;
          const middle = [...list].sort((a, b) => rank(a) - rank(b))[Math.floor((list.length - 1) / 2)] as string;
          const at = open.findIndex(([p]) => p === middle);
          const first = open.findIndex(([p]) => list.includes(p));
          if (at > first) open.splice(first, 0, ...open.splice(at, 1));
        }
        // One partner above and one below in its own column.
        for (const dir of ['up', 'down'] as const) {
          if (partner[dir].has(e)) continue;
          for (const [p] of open) {
            const y = itemOf.get(p) as Block;
            if (done.has(y)) continue;
            const pp = y.cells.get(p) as Cell;
            if (dir === 'up' ? pp.r >= pe.r : pp.r <= pe.r) continue;
            const dc = pe.c - pp.c;
            // A cluster in the way: the row above it or below it in the same column, still on this side of the element.
            const dr = fits(y, dc) ? 0 : around(y, dc).find((d) => (dir === 'up' ? pp.r + d < pe.r : pp.r + d > pe.r));
            if (dr === undefined || !straight(y, dc, pairsOf(y), dr).some((s) => s.e === p && s.p === e)) continue;
            commit(y, dc, dr);
            break;
          }
        }
        // The others in the neighbouring column: the side where their other partners stand, else the right; one asked beside it, on that side.
        for (const [p] of open) {
          const y = itemOf.get(p) as Block;
          if (done.has(y)) continue;
          const pp = y.cells.get(p) as Cell;
          const forced = leftOf.has(`${e}>${p}`) ? 1 : leftOf.has(`${p}>${e}`) ? -1 : 0;
          const rest = [...(mult.get(p)?.keys() ?? [])].filter((o) => o !== e && colOf.has(o)).map((o) => (colOf.get(o) as Cell).c - pe.c);
          // With no other partner placed, the side that has fewer of this element's lines toward the same rows; a tie goes right.
          const toward = (sign: number): number => [...(mult.get(e)?.keys() ?? [])].filter((o) => o !== p && colOf.has(o) && Math.sign((colOf.get(o) as Cell).c - pe.c) === sign && Math.sign((colOf.get(o) as Cell).r - pe.r) === Math.sign(pp.r - pe.r)).length;
          const step = forced !== 0 ? forced : rest.length > 0 && rest.reduce((sum, v) => sum + v, 0) !== 0 ? Math.sign(rest.reduce((sum, v) => sum + v, 0)) : toward(1) > toward(-1) ? -1 : 1;
          let dc = pe.c + step - pp.c;
          const dr = fits(y, dc) ? 0 : around(y, dc)[0];
          if (dr !== undefined) {
            commit(y, dc, dr);
            continue;
          }
          while (!fits(y, dc)) dc += step;
          commit(y, dc);
        }
      }
    }

    // Cells a bent line runs through: the column of the lower end, between the rows.
    for (const a of colOf.keys()) {
      for (const b of mult.get(a)?.keys() ?? []) {
        const [pa, pb] = [colOf.get(a) as Cell, colOf.get(b)];
        if (pb === undefined || pa.c === pb.c || pa.r === pb.r) continue;
        const [hi, lo] = pa.r < pb.r ? [pa, pb] : [pb, pa];
        for (let r = hi.r + 1; r < lo.r; r++) reserved.add(key(r, lo.c));
      }
    }

    // What has no line fills the free cells, in the order of writing: a node row by row, at most `shapeInRow` of them to
    // a row; a cluster under or beside a sibling cluster, else right of what stands, at most `boundaryInRow` side by side.
    const loose = kids.filter((b) => !b.anchored).sort((a, b) => rank(a.id) - rank(b.id));
    const start = boundOf(placed);
    const top = start?.r0 ?? 0;
    const left = start?.c0 ?? 0;
    const looseIn = new Map<number, number>();
    const blocksIn: CellRect[] = [];
    const free = (box: CellRect, block: boolean): boolean => {
      if (placed.some((b) => meets(b.box, box))) return false;
      for (let r = box.r0; r <= box.r1; r++) for (let c = box.c0; c <= box.c1; c++) if (reserved.has(key(r, c))) return false;
      if (block && blocksIn.filter((q) => q.r0 <= box.r1 && box.r0 <= q.r1).length >= spec.boundaryInRow) return false;
      return true;
    };
    for (const x of loose) {
      const h = x.box.r1 - x.box.r0 + 1;
      const w = x.box.c1 - x.box.c0 + 1;
      const block = !nodeIds.has(x.id);
      const at = (r: number, c: number): CellRect => ({ r0: r, r1: r + h - 1, c0: c, c1: c + w - 1 });
      const bound = boundOf(placed);
      let pick: CellRect | undefined;
      if (block) {
        const tries = blocksIn.flatMap((q) => [at(q.r1 + 1, q.c0), at(q.r0, q.c1 + 1)]);
        if (bound !== undefined) tries.push(at(top, bound.c1 + 1));
        pick = tries.find((q) => free(q, true));
        for (let r = top; pick === undefined; r++) if (free(at(r, left), true)) pick = at(r, left);
      } else {
        const width = Math.max(bound === undefined ? 0 : bound.c1 - bound.c0 + 1, spec.shapeInRow);
        for (let r = top; pick === undefined; r++) {
          if ((looseIn.get(r) ?? 0) >= spec.shapeInRow) continue;
          for (let c = left; c < left + width && pick === undefined; c++) if (free(at(r, c), false)) pick = at(r, c);
        }
        looseIn.set(pick.r0, (looseIn.get(pick.r0) ?? 0) + 1);
      }
      const moved = shift(x, pick.r0 - x.box.r0, pick.c0 - x.box.c0);
      placed.push(moved);
      if (block) blocksIn.push(moved.box);
    }

    const level = alignSiblings(placed, nodeIds);
    const cells = new Map<string, Cell>();
    const rects = new Map<string, CellRect>();
    for (const b of level) {
      for (const [k, v] of b.cells) cells.set(k, v);
      for (const [k, v] of b.rects) rects.set(k, v);
    }
    const box = boundOf(level);
    const empty = box === undefined;
    const own = box ?? { r0: 0, r1: 0, c0: 0, c1: 0 };
    if (id !== '') rects.set(id, own);
    return { id, anchored: placed.some((b) => b.anchored), cells, rects, box: own, empty };
  };

  return normalised(layLevel(''));
}

/**
 * Sibling clusters stacked one over the other take the same columns, and the ones side by side the same rows, where the
 * wider range covers nothing else.
 */
function alignSiblings(placed: readonly Block[], nodeIds: ReadonlySet<string>): Block[] {
  const out = [...placed];
  out.forEach((_, i) => {
    out.forEach((b, j) => {
      const a = out[i] as Block;
      if (i === j || nodeIds.has(a.id) || nodeIds.has(b.id)) return;
      const stacked = a.box.c0 <= b.box.c1 && b.box.c0 <= a.box.c1 && (a.box.r1 < b.box.r0 || b.box.r1 < a.box.r0);
      const level = a.box.r0 <= b.box.r1 && b.box.r0 <= a.box.r1 && (a.box.c1 < b.box.c0 || b.box.c1 < a.box.c0);
      if (!stacked && !level) return;
      const wide = stacked ? { ...a.box, c0: Math.min(a.box.c0, b.box.c0), c1: Math.max(a.box.c1, b.box.c1) } : { ...a.box, r0: Math.min(a.box.r0, b.box.r0), r1: Math.max(a.box.r1, b.box.r1) };
      if (out.some((o, k) => k !== i && meets(o.box, wide))) return;
      out[i] = { ...a, box: wide, rects: new Map([...a.rects, [a.id, wide]]) };
    });
  });
  return out;
}

/** The grid with the rows and columns no node stands in left out, counted from 0. */
function normalised(root: Block): GridCells {
  const used = (pick: (p: Cell) => number, ends: (q: CellRect) => [number, number], empties: CellRect[]): number[] => {
    const set = new Set<number>([...root.cells.values()].map(pick));
    for (const q of empties) set.add(ends(q)[0]);
    return [...set].sort((a, b) => a - b);
  };
  // A cluster with nothing in it keeps its one cell.
  const empties = [...root.rects].filter(([id, q]) => q.r0 === q.r1 && q.c0 === q.c1 && ![...root.cells.values()].some((p) => inRect(q, p.r, p.c)) && id !== '').map(([, q]) => q);
  const rowsUsed = used((p) => p.r, (q) => [q.r0, q.r1], empties);
  const colsUsed = used((p) => p.c, (q) => [q.c0, q.c1], empties);
  const rowAt = (r: number, up: boolean): number => {
    const i = rowsUsed.findIndex((v) => v >= r);
    if (i < 0) return rowsUsed.length - 1;
    if (rowsUsed[i] === r) return i;
    return up ? i : i - 1;
  };
  const colAt = (c: number, up: boolean): number => {
    const i = colsUsed.findIndex((v) => v >= c);
    if (i < 0) return colsUsed.length - 1;
    if (colsUsed[i] === c) return i;
    return up ? i : i - 1;
  };
  const cell = new Map([...root.cells].map(([id, p]) => [id, { r: rowAt(p.r, true), c: colAt(p.c, true) }] as const));
  const rect = new Map(
    [...root.rects].map(([id, q]) => {
      const r0 = rowAt(q.r0, true);
      const c0 = colAt(q.c0, true);
      return [id, { r0, r1: Math.max(r0, rowAt(q.r1, false)), c0, c1: Math.max(c0, colAt(q.c1, false)) }] as const;
    }),
  );
  return { cell, rect, rows: rowsUsed.length, columns: colsUsed.length };
}
