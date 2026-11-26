import { cellRuler, cellWidth } from '../metrics.ts';
import { joinSpans, sliceSpans, spansOf, trimEndSpans } from '../text/terminal.ts';
import { wrapWords } from '../text/wrap.ts';
import type { Point, TextSpan, TextTone } from '../types.ts';
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

/** A grid of terminal cells, each with a tone; a wide character takes two and leaves an empty string in the second. */
class Canvas {
  readonly rows: string[][];
  readonly tones: TextTone[][];
  readonly width: number;

  constructor(width: number, height: number) {
    this.width = width;
    this.rows = Array.from({ length: height }, () => new Array<string>(width).fill(' '));
    this.tones = Array.from({ length: height }, () => new Array<TextTone>(width).fill('normal'));
  }

  put(x: number, y: number, ch: string, tone: TextTone = 'normal'): void {
    const row = this.rows[y];
    const tones = this.tones[y];
    if (row === undefined || tones === undefined || x < 0 || x >= this.width) return;
    row[x] = ch;
    tones[x] = tone;
  }

  text(x: number, y: number, s: string, tone: TextTone = 'normal'): void {
    let at = x;
    for (const ch of s) {
      const w = cellWidth(ch);
      this.put(at, y, ch, tone);
      if (w === 2) this.put(at + 1, y, '', tone);
      at += w;
    }
  }

  /** The rows without trailing blanks, and without the blank rows above and the blank columns left of the drawing. */
  lines(): TextSpan[][] {
    const out = this.rows.map((r, y) => trimEndSpans(spansOf(...r.map((ch, x) => [ch, this.tones[y]?.[x] ?? 'normal'] as const))));
    while (out.length > 0 && out[out.length - 1]?.length === 0) out.pop();
    while (out.length > 0 && out[0]?.length === 0) out.shift();
    const texts = out.map(joinSpans);
    const indent = Math.min(...texts.filter((l) => l !== '').map((l) => l.length - l.trimStart().length));
    return Number.isFinite(indent) ? out.map((l) => sliceSpans(l, indent)) : out;
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

/** The outline of a block; a group's is dashed and dim. */
function drawFrame(c: Canvas, b: PlacedBlock, g: Glyphs, dashed: boolean): void {
  const { x, y, w, h } = b;
  const mid = y + Math.floor(h / 2);
  const tone: TextTone = dashed ? 'dim' : 'normal';
  for (let i = 1; i < w - 1; i++) {
    c.put(x + i, y, dashed ? '╌' : g.top, tone);
    c.put(x + i, y + h - 1, dashed ? '╌' : g.top, tone);
  }
  for (let j = 1; j < h - 1; j++) {
    const row = y + j;
    c.put(x, row, dashed ? '╎' : row === mid && g.mid !== undefined ? g.mid[0] : g.side, tone);
    c.put(x + w - 1, row, dashed ? '╎' : row === mid && g.mid !== undefined ? g.mid[1] : g.side, tone);
  }
  c.put(x, y, g.corners[0], tone);
  c.put(x + w - 1, y, g.corners[1], tone);
  c.put(x, y + h - 1, g.corners[2], tone);
  c.put(x + w - 1, y + h - 1, g.corners[3], tone);
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
    c.text(b.x + 1 + Math.max(0, Math.floor((room - w) / 2)), first + i, line, 'bold');
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
    c.put(x, y, glyph, cell.style === 'dotted' ? 'dim' : 'normal');
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

function render(layout: BlockLayout): TextSpan[][] {
  const c = new Canvas(layout.width, layout.height);
  const byId = new Map(layout.blocks.map((b) => [b.id, b] as const));
  for (const g of layout.blocks.filter((b) => b.kind === 'group')) drawFrame(c, g, glyphsOf(g), true);
  drawLinks(c, layout.links, byId);
  for (const b of layout.blocks.filter((n) => n.kind === 'node')) drawBlock(c, b);
  drawChips(c, layout.links);
  return c.lines();
}

/**
 * Gives the lines that `wrapWords` makes of `whole`, one after another, the tones of `whole`: wrapping keeps every
 * character but white space in order, so the n-th of those takes the tone of the n-th in `whole`. A space takes the
 * tone of the characters on both sides when they have one tone.
 */
function tonesAlong(whole: readonly TextSpan[]): (line: string) => TextSpan[] {
  const blank = (ch: string): boolean => /\s/u.test(ch);
  const tones = whole.flatMap((s) => [...s.text].filter((ch) => !blank(ch)).map(() => s.tone));
  let at = 0;
  return (line) => {
    const chars = [...line];
    const own = chars.map((ch) => (blank(ch) ? undefined : (tones[at++] ?? 'normal')));
    return spansOf(
      ...chars.map((ch, i): readonly [string, TextTone] => {
        const tone = own[i];
        if (tone !== undefined) return [ch, tone];
        const before = own.slice(0, i).reverse().find((t) => t !== undefined);
        const after = own.slice(i + 1).find((t) => t !== undefined);
        return [ch, before !== undefined && before === after ? before : 'normal'];
      }),
    );
  };
}

/** The blocks as an outline when the grid does not fit the width: one line per row, then one per link (the ends bold, a label and a dotted line dim). */
function outline(model: BlockDiagram, maxWidth: number): TextSpan[][] {
  const lines: TextSpan[][] = [];
  if (model.title !== undefined) lines.push(spansOf([model.title, 'bold']), []);
  const label = (item: BlockItem): TextSpan[] =>
    item.kind === 'space'
      ? spansOf(['·'.repeat(Math.min(item.span, 3)), 'dim'])
      : item.kind === 'group'
        ? spansOf(['[', 'dim'], [item.id, 'bold'], [']', 'dim'])
        : spansOf([item.lines.join(' '), 'bold'], [item.span > 1 ? ` x${item.span}` : '', 'dim']);
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
      const whole = spansOf(...row.flatMap((item, i) => [i === 0 ? '' : ([' | ', 'dim'] as const), label(item)]));
      const along = tonesAlong(whole);
      for (const text of wrapWords(joinSpans(whole), Math.max(8, maxWidth - 2 * depth), cellWidth, { blank: true })) lines.push(spansOf('  '.repeat(depth), along(text)));
      for (const item of row) if (item.kind === 'group') walk((item as BlockGroup).children, (item as BlockGroup).columns, depth + 1);
    }
  };
  walk(model.children, model.columns, 0);
  if (model.links.length > 0) lines.push([]);
  for (const link of model.links) {
    const line = `${link.style === 'dotted' ? '┄' : link.style === 'thick' ? '━' : '─'}${link.arrow ? '▶' : '─'}`;
    lines.push(spansOf([link.from, 'bold'], ' ', [line, link.style === 'dotted' ? 'dim' : 'normal'], ' ', [link.to, 'bold'], [link.label === undefined ? '' : `  ${link.label}`, 'dim']));
  }
  return lines.map((l) => {
    const text = joinSpans(l);
    if (cellWidth(text) <= maxWidth) return l;
    const kept = [...text].slice(0, maxWidth - 1).join('').length;
    return spansOf(sliceSpans(l, 0, kept), ['…', sliceSpans(l, kept, kept + 1)[0]?.tone ?? 'normal']);
  });
}

/**
 * The diagram in terminal cells: blocks drawn with box characters, a mark on each kind of block, links as lines with
 * arrowheads. A drawing wider than `maxWidth` is drawn tighter, and when that is still too wide, written as an outline.
 * The title and the block names are bold; group outlines and dotted links are dim.
 */
export function blockTextSpans(model: BlockDiagram, maxWidth: number | undefined): TextSpan[][] {
  const ruler = cellRuler();
  const titleRows = model.title === undefined ? [] : [spansOf([model.title, 'bold']), []];
  const { title, ...untitled } = model;
  void title;
  for (const compact of [false, true]) {
    const body = render(layoutBlock(untitled, ruler, compact));
    const widest = Math.max(0, ...body.map((l) => cellWidth(joinSpans(l))));
    if (maxWidth === undefined || widest <= maxWidth) return [...titleRows, ...body];
  }
  return outline(model, maxWidth ?? 80);
}
