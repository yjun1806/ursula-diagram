import { cellRuler, cellWidth } from '../metrics.ts';
import { wrapWords } from '../text/wrap.ts';
import type { Point } from '../types.ts';
import { layoutBlock } from './layout.ts';
import type { BlockDiagram, BlockGroup, BlockItem, BlockLayout, PlacedBlock, PlacedLink } from './model.ts';

const N = 1;
const E = 2;
const S = 4;
const W = 8;

const LIGHT: Record<number, string> = {
  [E | W]: '─', [E]: '─', [W]: '─', [N | S]: '│', [N]: '│', [S]: '│',
  [S | E]: '╭', [S | W]: '╮', [N | E]: '╰', [N | W]: '╯',
  [N | S | E]: '├', [N | S | W]: '┤', [E | W | S]: '┬', [E | W | N]: '┴', [N | E | S | W]: '┼',
};
const HEAVY: Record<number, string> = {
  [E | W]: '━', [E]: '━', [W]: '━', [N | S]: '┃', [N]: '┃', [S]: '┃',
  [S | E]: '┏', [S | W]: '┓', [N | E]: '┗', [N | W]: '┛',
  [N | S | E]: '┣', [N | S | W]: '┫', [E | W | S]: '┳', [E | W | N]: '┻', [N | E | S | W]: '╋',
};

/** A grid of terminal cells; a wide character takes two and leaves an empty string in the second. */
class Canvas {
  readonly rows: string[][];
  readonly width: number;

  constructor(width: number, height: number) {
    this.width = width;
    this.rows = Array.from({ length: height }, () => new Array<string>(width).fill(' '));
  }

  put(x: number, y: number, ch: string): void {
    const row = this.rows[y];
    if (row === undefined || x < 0 || x >= this.width) return;
    row[x] = ch;
  }

  text(x: number, y: number, s: string): void {
    let at = x;
    for (const ch of s) {
      const w = cellWidth(ch);
      this.put(at, y, ch);
      if (w === 2) this.put(at + 1, y, '');
      at += w;
    }
  }

  /** The rows without trailing blanks, and without the blank rows above and the blank columns left of the drawing. */
  lines(): string[] {
    const out = this.rows.map((r) => r.join('').trimEnd());
    while (out.length > 0 && out[out.length - 1] === '') out.pop();
    while (out.length > 0 && out[0] === '') out.shift();
    const indent = Math.min(...out.filter((l) => l !== '').map((l) => l.length - l.trimStart().length));
    return Number.isFinite(indent) ? out.map((l) => l.slice(indent)) : out;
  }
}

interface Glyphs {
  /** Corners: top-left, top-right, bottom-left, bottom-right. */
  corners: [string, string, string, string];
  top: string;
  side: string;
  /** Replaces the side character on the middle row of the left and right sides. */
  mid?: [string, string];
}

function glyphsOf(b: PlacedBlock): Glyphs {
  switch (b.shape) {
    case 'round':
      return { corners: ['╭', '╮', '╰', '╯'], top: '─', side: '│' };
    case 'stadium':
      return { corners: ['╭', '╮', '╰', '╯'], top: '─', side: '│', mid: ['(', ')'] };
    case 'circle':
      return { corners: ['.', '.', "'", "'"], top: '─', side: ' ', mid: ['(', ')'] };
    case 'dbl-circle':
      return { corners: ['.', '.', "'", "'"], top: '─', side: ' ', mid: ['(', ')'] };
    case 'diamond':
      return { corners: ['╱', '╲', '╲', '╱'], top: '─', side: ' ', mid: ['<', '>'] };
    case 'hexagon':
      return { corners: ['╱', '╲', '╲', '╱'], top: '─', side: '│' };
    case 'parallelogram':
      return { corners: ['┌', '┐', '└', '┘'], top: '─', side: '╱' };
    case 'lean-l':
      return { corners: ['┌', '┐', '└', '┘'], top: '─', side: '╲' };
    case 'trap-b':
      return { corners: ['┌', '┐', '└', '┘'], top: '─', side: '│', mid: ['╱', '╲'] };
    case 'trap-t':
      return { corners: ['┌', '┐', '└', '┘'], top: '─', side: '│', mid: ['╲', '╱'] };
    case 'asym':
      return { corners: ['┌', '┐', '└', '┘'], top: '─', side: '│', mid: ['>', '│'] };
    default:
      return { corners: ['┌', '┐', '└', '┘'], top: '─', side: '│' };
  }
}

function drawFrame(c: Canvas, b: PlacedBlock, g: Glyphs, dashed: boolean): void {
  const { x, y, w, h } = b;
  const mid = y + Math.floor(h / 2);
  for (let i = 1; i < w - 1; i++) {
    c.put(x + i, y, dashed ? '╌' : g.top);
    c.put(x + i, y + h - 1, dashed ? '╌' : g.top);
  }
  for (let j = 1; j < h - 1; j++) {
    const row = y + j;
    c.put(x, row, dashed ? '╎' : row === mid && g.mid !== undefined ? g.mid[0] : g.side);
    c.put(x + w - 1, row, dashed ? '╎' : row === mid && g.mid !== undefined ? g.mid[1] : g.side);
  }
  c.put(x, y, g.corners[0]);
  c.put(x + w - 1, y, g.corners[1]);
  c.put(x, y + h - 1, g.corners[2]);
  c.put(x + w - 1, y + h - 1, g.corners[3]);
}

/** Marks that tell a block's kind beyond its outline. */
function drawMarks(c: Canvas, b: PlacedBlock): void {
  const { x, y, w, h } = b;
  const mid = y + Math.floor(h / 2);
  const cx = x + Math.floor(w / 2);
  switch (b.shape) {
    case 'dbl-circle':
      c.put(x + 1, mid, '(');
      c.put(x + w - 2, mid, ')');
      break;
    case 'subroutine':
      for (let j = 1; j < h - 1; j++) {
        c.put(x + 1, y + j, '│');
        c.put(x + w - 2, y + j, '│');
      }
      c.put(x + 1, y, '┬');
      c.put(x + w - 2, y, '┬');
      c.put(x + 1, y + h - 1, '┴');
      c.put(x + w - 2, y + h - 1, '┴');
      break;
    case 'cylinder':
      for (let i = 0; i < w; i++) c.put(x + i, y + 1, i === 0 ? '├' : i === w - 1 ? '┤' : '─');
      c.put(x, y, '╭');
      c.put(x + w - 1, y, '╮');
      c.put(x, y + h - 1, '╰');
      c.put(x + w - 1, y + h - 1, '╯');
      break;
    case 'arrow': {
      const heads = b.heads ?? ['right'];
      if (heads.includes('right')) c.put(x + w - 1, mid, '▶');
      if (heads.includes('left')) c.put(x, mid, '◀');
      if (heads.includes('up')) c.put(cx, y, '▲');
      if (heads.includes('down')) c.put(cx, y + h - 1, '▼');
      break;
    }
    default:
  }
}

function drawBlock(c: Canvas, b: PlacedBlock): void {
  drawFrame(c, b, glyphsOf(b), false);
  drawMarks(c, b);
  const first = b.y + 1 + (b.shape === 'cylinder' ? 1 : 0);
  const room = b.w - 2;
  b.lines.forEach((line, i) => {
    if (line === '') return;
    const w = cellWidth(line);
    c.text(b.x + 1 + Math.max(0, Math.floor((room - w) / 2)), first + i, line);
  });
}

/** The cell a point of a route stands in: an end on the left or top face is drawn in the cell just outside it. */
function cellOf(p: Point, block: PlacedBlock | undefined, isEnd: boolean): [number, number] {
  let x = Math.round(p.x);
  let y = Math.round(p.y);
  if (isEnd && block !== undefined) {
    if (x === block.x && y > block.y && y < block.y + block.h) x -= 1;
    if (y === block.y && x > block.x && x < block.x + block.w) y -= 1;
  }
  return [x, y];
}

const HEADS: Record<string, string> = { '1,0': '▶', '-1,0': '◀', '0,1': '▼', '0,-1': '▲' };

function drawLinks(c: Canvas, links: readonly PlacedLink[], byId: ReadonlyMap<string, PlacedBlock>): void {
  const bits = new Map<string, { bits: number; style: PlacedLink['style'] }>();
  const rank = { dotted: 0, normal: 1, thick: 2 } as const;
  const mark = (x: number, y: number, add: number, style: PlacedLink['style']): void => {
    const key = `${x},${y}`;
    const cur = bits.get(key);
    bits.set(key, { bits: (cur?.bits ?? 0) | add, style: cur === undefined || rank[style] > rank[cur.style] ? style : cur.style });
  };
  const heads: Array<{ x: number; y: number; ch: string }> = [];
  for (const link of links) {
    if (link.invisible || link.points.length < 2) continue;
    const cells = link.points.map((p, i) => cellOf(p, i === 0 ? byId.get(link.from) : i === link.points.length - 1 ? byId.get(link.to) : undefined, i === 0 || i === link.points.length - 1));
    for (let i = 0; i + 1 < cells.length; i++) {
      const [ax, ay] = cells[i] as [number, number];
      const [bx, by] = cells[i + 1] as [number, number];
      const dx = Math.sign(bx - ax);
      const dy = Math.sign(by - ay);
      const out = dx > 0 ? E : dx < 0 ? W : dy > 0 ? S : N;
      const back = dx > 0 ? W : dx < 0 ? E : dy > 0 ? N : S;
      let x = ax;
      let y = ay;
      mark(x, y, out, link.style);
      while (x !== bx || y !== by) {
        x += dx;
        y += dy;
        mark(x, y, x === bx && y === by ? back : back | out, link.style);
      }
    }
    const end = cells[cells.length - 1] as [number, number];
    const before = cells[cells.length - 2] as [number, number];
    if (link.arrow) heads.push({ x: end[0], y: end[1], ch: HEADS[`${Math.sign(end[0] - before[0])},${Math.sign(end[1] - before[1])}`] ?? '▶' });
    if (link.arrowStart) {
      const start = cells[0] as [number, number];
      const after = cells[1] as [number, number];
      heads.push({ x: start[0], y: start[1], ch: HEADS[`${Math.sign(start[0] - after[0])},${Math.sign(start[1] - after[1])}`] ?? '◀' });
    }
  }
  for (const [key, cell] of bits) {
    const [x, y] = key.split(',').map(Number) as [number, number];
    const horizontal = (cell.bits & (E | W)) !== 0 && (cell.bits & (N | S)) === 0;
    const vertical = (cell.bits & (N | S)) !== 0 && (cell.bits & (E | W)) === 0;
    const glyph = cell.style === 'dotted' && horizontal ? '┄' : cell.style === 'dotted' && vertical ? '┆' : (cell.style === 'thick' ? HEAVY : LIGHT)[cell.bits] ?? '┼';
    c.put(x, y, glyph);
  }
  for (const h of heads) c.put(h.x, h.y, h.ch);
}

function drawChips(c: Canvas, links: readonly PlacedLink[]): void {
  for (const link of links) {
    if (link.chip === undefined) continue;
    const { x, y, text } = link.chip;
    c.text(x - 1, y, ` ${text} `);
  }
}

function render(layout: BlockLayout): string[] {
  const c = new Canvas(layout.width, layout.height);
  const byId = new Map(layout.blocks.map((b) => [b.id, b] as const));
  for (const g of layout.blocks.filter((b) => b.kind === 'group')) drawFrame(c, g, glyphsOf(g), true);
  drawLinks(c, layout.links, byId);
  for (const b of layout.blocks.filter((n) => n.kind === 'node')) drawBlock(c, b);
  drawChips(c, layout.links);
  return c.lines();
}

/** The blocks as an outline when the grid does not fit the width: one line per row, then one per link. */
function outline(model: BlockDiagram, maxWidth: number): string[] {
  const lines: string[] = [];
  if (model.title !== undefined) lines.push(model.title, '');
  const label = (item: BlockItem): string => (item.kind === 'space' ? '·'.repeat(Math.min(item.span, 3)) : item.kind === 'group' ? `[${item.id}]` : `${item.lines.join(' ')}${item.span > 1 ? ` x${item.span}` : ''}`);
  const walk = (children: readonly BlockItem[], columns: number | undefined, depth: number): void => {
    const perRow: BlockItem[][] = [[]];
    let used = 0;
    for (const item of children) {
      const span = Math.min(item.span, columns ?? Infinity);
      if (used > 0 && used + span > (columns ?? Infinity)) {
        perRow.push([]);
        used = 0;
      }
      perRow[perRow.length - 1]?.push(item);
      used += span;
    }
    for (const row of perRow) {
      for (const text of wrapWords(row.map(label).join(' | '), Math.max(8, maxWidth - 2 * depth), cellWidth, { blank: true })) lines.push(`${'  '.repeat(depth)}${text}`);
      for (const item of row) if (item.kind === 'group') walk((item as BlockGroup).children, (item as BlockGroup).columns, depth + 1);
    }
  };
  walk(model.children, model.columns, 0);
  if (model.links.length > 0) lines.push('');
  for (const link of model.links) lines.push(`${link.from} ${link.style === 'dotted' ? '┄' : link.style === 'thick' ? '━' : '─'}${link.arrow ? '▶' : '─'} ${link.to}${link.label === undefined ? '' : `  ${link.label}`}`);
  return lines.map((l) => (cellWidth(l) > maxWidth ? [...l].slice(0, maxWidth - 1).join('') + '…' : l));
}

/**
 * The diagram in terminal cells: blocks drawn with box characters, a mark on each kind of block, links as lines with
 * arrowheads. A drawing wider than `maxWidth` is drawn tighter, and when that is still too wide, written as an outline.
 */
export function blockTextLines(model: BlockDiagram, maxWidth: number | undefined): string[] {
  const ruler = cellRuler();
  const titleRows = model.title === undefined ? [] : [model.title, ''];
  const { title, ...untitled } = model;
  void title;
  for (const compact of [false, true]) {
    const body = render(layoutBlock(untitled, ruler, compact));
    const widest = Math.max(0, ...body.map(cellWidth));
    if (maxWidth === undefined || widest <= maxWidth) return [...titleRows, ...body];
  }
  return outline(model, maxWidth ?? 80);
}
