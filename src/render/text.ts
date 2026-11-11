import { cellWidth, cellWidthOf } from '../metrics.ts';
import type { EdgeStyle, Layout, LayoutEdge, LayoutNode } from '../types.ts';

const N = 1;
const E = 2;
const S = 4;
const W = 8;

const LIGHT: Record<number, string> = {
  [E | W]: '─', [E]: '─', [W]: '─',
  [N | S]: '│', [N]: '│', [S]: '│',
  [S | E]: '┌', [S | W]: '┐', [N | E]: '└', [N | W]: '┘',
  [N | S | E]: '├', [N | S | W]: '┤', [E | W | S]: '┬', [E | W | N]: '┴', [N | E | S | W]: '┼',
};
const HEAVY: Record<number, string> = {
  [E | W]: '━', [E]: '━', [W]: '━',
  [N | S]: '┃', [N]: '┃', [S]: '┃',
  [S | E]: '┏', [S | W]: '┓', [N | E]: '┗', [N | W]: '┛',
  [N | S | E]: '┣', [N | S | W]: '┫', [E | W | S]: '┳', [E | W | N]: '┻', [N | E | S | W]: '╋',
};

const PRIORITY: Record<EdgeStyle, number> = { dotted: 0, normal: 1, thick: 2 };

class Canvas {
  readonly rows: string[][];
  readonly width: number;
  readonly height: number;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.rows = Array.from({ length: height }, () => new Array<string>(width).fill(' '));
  }

  /** Writes one character; wide characters take two cells and never get split. */
  put(x: number, y: number, ch: string): void {
    const row = this.rows[y];
    if (!row || x < 0 || x >= this.width) return;
    const wide = cellWidthOf(ch.codePointAt(0) ?? 0) === 2;
    if (wide && x + 1 >= this.width) return;
    if (row[x] === '' && x > 0) row[x - 1] = ' ';
    if (row[x + 1] === '' && !wide) row[x + 1] = ' ';
    if (wide) {
      if (row[x + 1] === '' && x + 2 < this.width) row[x + 2] = row[x + 2] === '' ? ' ' : row[x + 2] ?? ' ';
      if (row[x + 2] === '') row[x + 2] = ' ';
      row[x + 1] = '';
    }
    row[x] = ch;
  }

  text(x: number, y: number, s: string): void {
    let cx = x;
    for (const ch of s) {
      this.put(cx, y, ch);
      cx += cellWidthOf(ch.codePointAt(0) ?? 0);
    }
  }

  lines(): string[] {
    return this.rows.map((r) => r.join('').trimEnd());
  }
}

function drawLanes(c: Canvas, layout: Layout): void {
  const td = layout.direction === 'TD';
  for (const lane of layout.lanes) {
    if (lane.label === '') continue;
    const x0 = Math.floor(lane.x);
    const y0 = Math.floor(lane.y);
    const x1 = x0 + Math.round(lane.w) - 1;
    const y1 = y0 + Math.round(lane.h) - 1;
    if (td) {
      for (let y = y0; y <= y1; y++) {
        c.put(x0, y, '╎');
        c.put(x1, y, '╎');
      }
    } else {
      for (let x = x0; x <= x1; x++) {
        c.put(x, y0, '╌');
        c.put(x, y1, '╌');
      }
    }
    c.text(Math.floor(lane.labelBox.x), Math.floor(lane.labelBox.y), lane.label);
  }
}

interface Cell {
  bits: number;
  style: EdgeStyle;
  arrow?: string;
}

function cellOf(edge: LayoutEdge, nodes: Map<string, LayoutNode>, index: number): [number, number] {
  const p = edge.points[index];
  if (!p) return [0, 0];
  let x = Math.floor(p.x + 1e-9);
  let y = Math.floor(p.y + 1e-9);
  const isEnd = index === 0 || index === edge.points.length - 1;
  const node = nodes.get(index === 0 ? edge.from : edge.to);
  if (isEnd && node) {
    // A port on a left or top border is drawn in the cell just outside that border.
    if (Math.abs(p.x - node.x) < 1e-9) x -= 1;
    if (Math.abs(p.y - node.y) < 1e-9) y -= 1;
  }
  return [x, y];
}

function arrowFor(edge: LayoutEdge): string {
  const a = edge.points[edge.points.length - 2];
  const b = edge.points[edge.points.length - 1];
  if (!a || !b) return '▶';
  if (Math.abs(b.x - a.x) > Math.abs(b.y - a.y)) return b.x > a.x ? '▶' : '◀';
  return b.y > a.y ? '▼' : '▲';
}

function drawEdges(c: Canvas, layout: Layout): void {
  const nodes = new Map(layout.nodes.map((n) => [n.id, n] as const));
  const cells = new Map<string, Cell>();
  const touch = (x: number, y: number, bits: number, style: EdgeStyle): Cell => {
    const key = `${x},${y}`;
    const cur = cells.get(key) ?? { bits: 0, style };
    const next: Cell = {
      ...cur,
      bits: cur.bits | bits,
      style: PRIORITY[style] > PRIORITY[cur.style] ? style : cur.style,
    };
    cells.set(key, next);
    return next;
  };
  const arrows: Array<{ x: number; y: number; ch: string }> = [];
  for (const edge of layout.edges) {
    const pts = edge.points.map((_, i) => cellOf(edge, nodes, i));
    for (let i = 0; i + 1 < pts.length; i++) {
      const [x1, y1] = pts[i] ?? [0, 0];
      const [x2, y2] = pts[i + 1] ?? [0, 0];
      const dx = Math.sign(x2 - x1);
      const dy = Math.sign(y2 - y1);
      if (dx === 0 && dy === 0) continue;
      const out = dx > 0 ? E : dx < 0 ? W : dy > 0 ? S : N;
      const back = dx > 0 ? W : dx < 0 ? E : dy > 0 ? N : S;
      let x = x1;
      let y = y1;
      while (x !== x2 || y !== y2) {
        touch(x, y, out, edge.style);
        x += dx;
        y += dy;
        touch(x, y, back, edge.style);
      }
    }
    const last = pts[pts.length - 1];
    if (last) arrows.push({ x: last[0], y: last[1], ch: arrowFor(edge) });
  }
  for (const [key, cell] of cells) {
    const [xs, ys] = key.split(',');
    const glyphs = cell.style === 'thick' ? HEAVY : LIGHT;
    let ch = glyphs[cell.bits] ?? '┼';
    if (cell.style === 'dotted') {
      if (cell.bits === (E | W) || cell.bits === E || cell.bits === W) ch = '┄';
      else if (cell.bits === (N | S) || cell.bits === N || cell.bits === S) ch = '┆';
    }
    c.put(Number(xs), Number(ys), ch);
  }
  for (const a of arrows) c.put(a.x, a.y, a.ch);
}

function drawLabels(c: Canvas, layout: Layout): void {
  for (const edge of layout.edges) {
    const l = edge.label;
    if (!l) continue;
    const x = Math.round(l.x);
    const y = Math.round(l.y);
    for (let dy = 0; dy < Math.round(l.h); dy++) for (let dx = 0; dx < Math.round(l.w); dx++) c.put(x + dx, y + dy, ' ');
    const tw = cellWidth(l.text);
    c.text(x + Math.floor((l.w - tw) / 2), y + Math.floor((l.h - 1) / 2), l.text);
  }
}

function drawNode(c: Canvas, n: LayoutNode): void {
  const x0 = Math.round(n.x);
  const y0 = Math.round(n.y);
  const w = Math.round(n.w);
  const h = Math.round(n.h);
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      const top = y === y0;
      const bottom = y === y0 + h - 1;
      const left = x === x0;
      const right = x === x0 + w - 1;
      let ch = ' ';
      if (top && left) ch = '┌';
      else if (top && right) ch = '┐';
      else if (bottom && left) ch = '└';
      else if (bottom && right) ch = '┘';
      else if (top || bottom) ch = '─';
      else if (left || right) ch = '│';
      c.put(x, y, ch);
    }
  }
  const texts = [n.title, ...n.lines];
  const start = y0 + 1 + Math.floor((h - 2 - texts.length) / 2);
  texts.forEach((t, i) => {
    c.text(x0 + 1 + Math.floor((w - 2 - cellWidth(t)) / 2), start + i, t);
  });
}

/** Draws a layout made with the cell ruler; returns one string per terminal row. */
export function renderTextLayout(layout: Layout): string[] {
  const c = new Canvas(Math.ceil(layout.width), Math.ceil(layout.height));
  drawLanes(c, layout);
  drawEdges(c, layout);
  drawLabels(c, layout);
  for (const n of layout.nodes) drawNode(c, n);
  const lines = c.lines();
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return lines;
}
