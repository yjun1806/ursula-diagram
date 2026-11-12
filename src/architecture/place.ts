import type { Architecture, Side } from './model.ts';

export interface Cell {
  col: number;
  row: number;
}

interface Vec {
  x: number;
  y: number;
}

const VEC: Record<Side, Vec> = { T: { x: 0, y: -1 }, B: { x: 0, y: 1 }, L: { x: -1, y: 0 }, R: { x: 1, y: 0 } };

/** The unit vector a side points along, out of its box. */
export const sideVector = (side: Side): Vec => VEC[side];

/**
 * Where the far end of an edge stands relative to the near end, in cells. The near side says which way the line
 * leaves; the far side says which way it arrives. Two sides on one axis give a step along that axis; a horizontal
 * and a vertical side give a diagonal step; the same side twice gives the near side's step.
 */
function step(near: Side, far: Side): Vec {
  const a = VEC[near];
  const b = VEC[far];
  const x = Math.sign(a.x - b.x);
  const y = Math.sign(a.y - b.y);
  return x === 0 && y === 0 ? a : { x, y };
}

const key = (c: number, r: number): string => `${c},${r}`;

/** Pieces of the diagram laid out on their own and then packed side by side; an empty group stands as a ghost. */
interface Component {
  ids: string[];
  cells: Map<string, Cell>;
}

/** The id a group without members is placed under, so its box and name still show. */
export const ghostId = (group: string): string => `ghost:${group}`;

/** Ids of all placeable things in declaration order: services, junctions, and a ghost for every empty group. */
export function placeableIds(model: Architecture): string[] {
  const used = new Set<string>();
  for (const n of model.nodes) for (let p = n.parent; p !== undefined; p = model.groups.find((g) => g.id === p)?.parent) used.add(p);
  return [...model.nodes.map((n) => n.id), ...model.groups.filter((g) => !used.has(g.id)).map((g) => ghostId(g.id))];
}

function alignAxis(model: Architecture, a: string, b: string): 'row' | 'column' | undefined {
  return model.aligns.find((al) => al.members.includes(a) && al.members.includes(b))?.axis;
}

/** Places one connected piece around its first node by following the sides each edge names. */
function growComponent(model: Architecture, start: string, taken: Set<string>): Component {
  const cells = new Map<string, Cell>([[start, { col: 0, row: 0 }]]);
  const at = new Map<string, string>([[key(0, 0), start]]);
  const queue = [start];
  for (let head = 0; head < queue.length; head++) {
    const u = queue[head] ?? start;
    const here = cells.get(u);
    if (here === undefined) continue;
    for (const e of model.edges) {
      const forward = e.from === u;
      const other = forward ? e.to : e.from;
      if ((!forward && e.to !== u) || cells.has(other) || taken.has(other)) continue;
      const d = forward ? step(e.fromSide, e.toSide) : step(e.toSide, e.fromSide);
      const travel = forward ? VEC[e.fromSide] : VEC[e.toSide];
      let col = here.col + d.x;
      let row = here.row + d.y;
      for (;;) {
        const occupant = at.get(key(col, row));
        if (occupant === undefined) break;
        const axis = alignAxis(model, occupant, other);
        const push = axis === 'column' ? { x: 0, y: 1 } : axis === 'row' ? { x: 1, y: 0 } : travel;
        col += push.x;
        row += push.y;
      }
      cells.set(other, { col, row });
      at.set(key(col, row), other);
      queue.push(other);
    }
  }
  return { ids: queue, cells };
}

/**
 * The members of an `align` line that all lead to one other node, and nothing else, leave that node on the line of
 * the first member; it moves to the middle of them so the lines meeting it are symmetric.
 */
function centreTargets(model: Architecture, comp: Component): void {
  const occupied = new Set([...comp.cells.values()].map((c) => key(c.col, c.row)));
  for (const al of model.aligns) {
    const members = al.members.filter((m) => comp.cells.has(m));
    if (members.length !== al.members.length) continue;
    const linked = (id: string): Set<string> =>
      new Set(model.edges.flatMap((e) => (e.from === id ? [e.to] : e.to === id ? [e.from] : [])));
    const common = [...linked(members[0] ?? '')].filter((t) => !members.includes(t) && members.every((m) => linked(m).has(t)));
    const target = common.length === 1 ? common[0] : undefined;
    if (target === undefined) continue;
    const tcell = comp.cells.get(target);
    if (tcell === undefined || [...linked(target)].some((n) => !members.includes(n))) continue;
    const cells = members.flatMap((m) => comp.cells.get(m) ?? []);
    const vertical = al.axis === 'column';
    const coords = cells.map((c) => (vertical ? c.row : c.col)).sort((a, b) => a - b);
    const mid = coords[Math.floor((coords.length - 1) / 2)];
    if (mid === undefined) continue;
    const moved = vertical ? { col: tcell.col, row: mid } : { col: mid, row: tcell.row };
    if (occupied.has(key(moved.col, moved.row))) continue;
    occupied.delete(key(tcell.col, tcell.row));
    occupied.add(key(moved.col, moved.row));
    comp.cells.set(target, moved);
  }
}

/**
 * Puts every service, junction and empty group in a cell. Edges decide neighbours: `a:R -- L:b` puts b in the cell to
 * the right of a, `a:B -- T:b` below it. A taken cell pushes the newcomer one more cell on, along the line when
 * the two are aligned and in the edge's direction otherwise. Unconnected pieces sit side by side; each piece moves
 * as far left as the cells already placed in its rows allow, and an `align` between pieces moves it to line up.
 */
export function placeCells(model: Architecture): Map<string, Cell> {
  const ids = placeableIds(model);
  const taken = new Set<string>();
  const comps: Component[] = [];
  for (const id of ids) {
    if (taken.has(id)) continue;
    const comp = growComponent(model, id, taken);
    for (const m of comp.ids) taken.add(m);
    centreTargets(model, comp);
    const minCol = Math.min(...[...comp.cells.values()].map((c) => c.col));
    const minRow = Math.min(...[...comp.cells.values()].map((c) => c.row));
    for (const [m, c] of comp.cells) comp.cells.set(m, { col: c.col - minCol, row: c.row - minRow });
    comps.push(comp);
  }

  const placed = new Map<string, Cell>();
  const reach = new Map<number, number>();
  for (const comp of comps) {
    let rowShift = 0;
    let wantCol: number | undefined;
    for (const al of model.aligns) {
      const mine = al.members.find((m) => comp.cells.has(m));
      const theirs = al.members.find((m) => placed.has(m));
      const mc = mine === undefined ? undefined : comp.cells.get(mine);
      const tc = theirs === undefined ? undefined : placed.get(theirs);
      if (mc === undefined || tc === undefined) continue;
      if (al.axis === 'row') rowShift = tc.row - mc.row;
      else wantCol = tc.col - mc.col;
    }
    let colShift = 0;
    for (const c of comp.cells.values()) {
      const seen = reach.get(c.row + rowShift);
      if (seen !== undefined) colShift = Math.max(colShift, seen + 1 - c.col);
    }
    if (wantCol !== undefined && wantCol >= colShift) colShift = wantCol;
    for (const [m, c] of comp.cells) {
      const cell = { col: c.col + colShift, row: c.row + rowShift };
      placed.set(m, cell);
      reach.set(cell.row, Math.max(reach.get(cell.row) ?? -1, cell.col));
    }
  }

  const minCol = Math.min(...[...placed.values()].map((c) => c.col));
  const minRow = Math.min(...[...placed.values()].map((c) => c.row));
  return new Map([...placed].map(([id, c]) => [id, { col: c.col - minCol, row: c.row - minRow }]));
}
