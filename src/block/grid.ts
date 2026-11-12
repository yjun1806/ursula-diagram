import { floorTo } from '../chart/grid.ts';
import type { BlockGroup, BlockItem, PlacedBlock } from './model.ts';
import { fills, sizeOf } from './size.ts';
import type { NodeSize } from './size.ts';
import type { Units } from './units.ts';

/** A block (or empty stretch) in its row and column, with the size it asks for. */
export interface PlanCell {
  item: BlockItem;
  row: number;
  col: number;
  span: number;
  /** Natural width and height; zero for an empty block. */
  w: number;
  h: number;
  size?: NodeSize;
  inner?: Plan;
}

/** The grid of one group: every column is as wide as the widest block that needs it, every row as high as its highest block. */
export interface Plan {
  cells: PlanCell[];
  nCols: number;
  colW: number;
  rowH: number[];
  w: number;
  h: number;
}

/**
 * Assigns each child a row and column (a new row starts when the next block no longer fits in `columns`), measures
 * the blocks, and sizes columns and rows from them. A group's inner grid is measured first.
 */
export function measure(children: readonly BlockItem[], columns: number | undefined, u: Units): Plan {
  const limit = columns ?? Infinity;
  const cells: PlanCell[] = [];
  let row = 0;
  let col = 0;
  for (const item of children) {
    const span = Math.min(item.span, limit);
    if (col > 0 && col + span > limit) {
      row += 1;
      col = 0;
    }
    const cell: PlanCell = { item, row, col, span, w: 0, h: 0 };
    if (item.kind === 'node') {
      const size = sizeOf(item, u);
      cell.size = size;
      cell.w = size.w;
      cell.h = size.h;
    } else if (item.kind === 'group') {
      const inner = measure(item.children, item.columns, u);
      cell.inner = inner;
      cell.w = inner.w + 2 * u.pad;
      cell.h = inner.h + 2 * u.pad;
    }
    cells.push(cell);
    col += span;
  }
  const nCols = cells.reduce((n, c) => Math.max(n, c.col + c.span), 0);
  const nRows = cells.length === 0 ? 0 : (cells[cells.length - 1]?.row ?? 0) + 1;
  let colW = 0;
  for (const c of cells) if (c.item.kind !== 'space') colW = Math.max(colW, u.snap((c.w - (c.span - 1) * u.colGap) / c.span));
  const rowH = Array.from({ length: nRows }, (_, r) => {
    const own = cells.filter((c) => c.row === r && c.item.kind !== 'space');
    return own.length === 0 ? u.spaceHeight : Math.max(...own.map((c) => c.h));
  });
  return {
    cells,
    nCols,
    colW,
    rowH,
    w: nCols === 0 ? 0 : nCols * colW + (nCols - 1) * u.colGap,
    h: nRows === 0 ? 0 : rowH.reduce((s, v) => s + v, 0) + (nRows - 1) * u.rowGap,
  };
}

/**
 * Puts the blocks of `plan` into the rectangle `x, y, w, h`. A grid narrower than the rectangle widens its columns;
 * a shorter one stands in the middle. Groups are pushed before the blocks inside them.
 */
export function place(plan: Plan, rect: { x: number; y: number; w: number; h: number }, u: Units, out: PlacedBlock[], parent: BlockGroup | undefined, depth: number): void {
  if (plan.nCols === 0) return;
  const colW = floorTo((rect.w - (plan.nCols - 1) * u.colGap) / plan.nCols, u.grid);
  const x0 = rect.x + floorTo((rect.w - (plan.nCols * colW + (plan.nCols - 1) * u.colGap)) / 2, u.grid);
  const y0 = rect.y + floorTo(Math.max(0, rect.h - plan.h) / 2, u.grid);
  const rowY: number[] = [];
  plan.rowH.forEach((h, r) => rowY.push(r === 0 ? y0 : (rowY[r - 1] ?? 0) + (plan.rowH[r - 1] ?? 0) + u.rowGap));
  for (const cell of plan.cells) {
    if (cell.item.kind === 'space') continue;
    const cx = x0 + cell.col * (colW + u.colGap);
    const cw = cell.span * colW + (cell.span - 1) * u.colGap;
    const cy = rowY[cell.row] ?? y0;
    const ch = plan.rowH[cell.row] ?? 0;
    const base = { x: cx, y: cy, w: cw, h: ch, row: cell.row, column: cell.col, span: cell.span, ...(parent === undefined ? {} : { parent: parent.id }) };
    if (cell.item.kind === 'group') {
      out.push({ ...base, id: cell.item.id, kind: 'group', shape: 'group', lines: [], depth: depth + 1, start: false });
      if (cell.inner !== undefined) place(cell.inner, { x: cx + u.pad, y: cy + u.pad, w: cw - 2 * u.pad, h: ch - 2 * u.pad }, u, out, cell.item, depth + 1);
      continue;
    }
    const fill = fills(cell.item);
    const w = fill.w ? cw : Math.min(cell.w, cw);
    const h = fill.h ? ch : Math.min(cell.h, ch);
    out.push({
      ...base,
      id: cell.item.id,
      kind: 'node',
      shape: cell.item.shape,
      lines: cell.size?.lines ?? [],
      depth: 0,
      x: cx + floorTo((cw - w) / 2, u.grid),
      y: cy + floorTo((ch - h) / 2, u.grid),
      w,
      h,
      start: false,
      ...(cell.item.heads === undefined ? {} : { heads: cell.item.heads }),
    });
  }
}
