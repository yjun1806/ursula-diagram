import { clip } from '../text/fit.ts';
import { cellWidth, cellWidthOf, cellRuler } from '../metrics.ts';
import { columnStarts, compartmentHeights, hasCompartments } from '../layout/records.ts';
import type { EdgeEnd, EdgeStyle, EndLabel, Layout, LayoutEdge, LayoutNode, TextSpan, TextTone } from '../types.ts';

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
  width: number;
  readonly height: number;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.rows = Array.from({ length: height }, () => new Array<string>(width).fill(' '));
  }

  /** Makes every row at least `width` cells wide; the new cells are blank. */
  widen(width: number): void {
    if (width <= this.width) return;
    for (const row of this.rows) while (row.length < width) row.push(' ');
    this.width = width;
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

  get(x: number, y: number): string {
    return this.rows[y]?.[x] ?? ' ';
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
  // Bands run down the page for top-down drawings with lanes across, and for left-to-right ones with lanes along.
  const vertical = (layout.direction === 'TD') !== (layout.laneAxis === 'along');
  for (const lane of layout.lanes) {
    if (lane.label === '') continue;
    const x0 = Math.floor(lane.x);
    const y0 = Math.floor(lane.y);
    const x1 = x0 + Math.round(lane.w) - 1;
    const y1 = y0 + Math.round(lane.h) - 1;
    if (lane.bare && vertical) {
      c.text(Math.floor(lane.labelBox.x), Math.floor(lane.labelBox.y), lane.label);
      continue;
    }
    if (vertical) {
      for (let y = y0; y <= y1; y++) {
        c.put(x0, y, '╎');
        c.put(x1, y, '╎');
      }
    } else {
      for (let x = x0; x <= x1; x++) c.put(x, y0, '─');
      continue;
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

type Heading = 'right' | 'left' | 'down' | 'up';

/**
 * The glyphs of a relation mark, from the cell next to the box outwards along the line. `heading` is the way the
 * line runs into the box. A mark of a count is a pair: the foot or the bars next to the box, then the bar or the
 * circle (`|<`, `o<`, `||`). Marks that are not relation marks give nothing.
 */
export function markGlyphs(end: EdgeEnd, heading: Heading): string[] {
  const across = heading === 'right' || heading === 'left';
  const foot = { right: '<', left: '>', down: '^', up: 'v' }[heading];
  const bar = across ? '|' : '┼';
  switch (end) {
    case 'triangle-open':
      return [{ right: '▷', left: '◁', down: '▽', up: '△' }[heading]];
    case 'diamond-filled':
      return ['◆'];
    case 'diamond-open':
      return ['◇'];
    case 'arrow-open':
      return [{ right: '>', left: '<', down: 'v', up: '^' }[heading]];
    case 'one':
      return [bar, bar];
    case 'zero-one':
      return [bar, 'o'];
    case 'many':
      return [foot];
    case 'one-many':
      return [foot, bar];
    case 'zero-many':
      return [foot, 'o'];
    case 'circle-plus':
      return ['⊕'];
    case 'lollipop':
      return ['○'];
    default:
      return [];
  }
}

const RELATION_MARKS: ReadonlySet<EdgeEnd> = new Set<EdgeEnd>(['triangle-open', 'diamond-filled', 'diamond-open', 'arrow-open', 'one', 'zero-one', 'many', 'one-many', 'zero-many', 'circle-plus', 'lollipop']);

/** The rows the rules of the bands are drawn in, with the first and the last column of each rule. */
function rulesOf(layout: Layout): Map<number, readonly [number, number]> {
  const vertical = (layout.direction === 'TD') !== (layout.laneAxis === 'along');
  if (vertical) return new Map();
  return new Map(layout.lanes.filter((lane) => lane.label !== '').map((lane) => [Math.floor(lane.y), [Math.floor(lane.x), Math.floor(lane.x) + Math.round(lane.w) - 1]] as const));
}

function drawEdges(c: Canvas, layout: Layout): void {
  const nodes = new Map(layout.nodes.map((n) => [n.id, n] as const));
  const rules = rulesOf(layout);
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
  // A drawing of records says what sits at each end of a line: a line that ends in nothing has no arrow.
  const records =
    layout.nodes.some((n) => hasCompartments(n) || ['start-dot', 'end-dot', 'bar', 'note', 'ellipse', 'actor'].includes(n.shape)) ||
    layout.edges.some((e) => (e.end !== undefined && RELATION_MARKS.has(e.end)) || (e.startEnd !== undefined && RELATION_MARKS.has(e.startEnd)));
  /** Writes the glyphs of a relation mark at an end of a line, from the cell next to the box outwards. */
  const mark = (end: EdgeEnd, at: readonly [number, number], from: readonly [number, number]): void => {
    const dx = Math.sign(at[0] - from[0]);
    const dy = Math.sign(at[1] - from[1]);
    const heading: Heading = dx !== 0 ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
    markGlyphs(end, heading).forEach((ch, i) => arrows.push({ x: at[0] - dx * i, y: at[1] - dy * i, ch }));
  };
  for (const edge of layout.edges) {
    if (edge.invisible) continue;
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
    // The end that sits on a box also reaches toward that box, so a line that turns at once draws a corner.
    const first = pts[0];
    const last = pts[pts.length - 1];
    const toward = (index: number, id: string): void => {
      const n = nodes.get(id);
      const p = edge.points[index];
      const cell = index === 0 ? first : last;
      if (!n || !p || !cell) return;
      const bit = Math.abs(p.x - n.x) < 1e-9 ? E : Math.abs(p.x - n.x - n.w) < 1e-9 ? W : Math.abs(p.y - n.y) < 1e-9 ? S : Math.abs(p.y - n.y - n.h) < 1e-9 ? N : 0;
      if (bit !== 0) touch(cell[0], cell[1], bit, edge.style);
    };
    toward(0, edge.from);
    toward(edge.points.length - 1, edge.to);
    const endMark = edge.end !== undefined && RELATION_MARKS.has(edge.end) ? edge.end : undefined;
    if (last && pts.length >= 2 && endMark !== undefined) mark(endMark, last, pts[pts.length - 2] as [number, number]);
    else if (last && edge.end !== 'none') arrows.push({ x: last[0], y: last[1], ch: arrowFor(edge) });
    if (first && pts.length >= 2 && edge.startEnd !== undefined && RELATION_MARKS.has(edge.startEnd)) mark(edge.startEnd, first, pts[1] as [number, number]);
    else if (first && pts.length >= 2 && edge.startEnd === 'arrow') arrows.push({ x: first[0], y: first[1], ch: arrowFor({ ...edge, points: [...edge.points].reverse() }) });
  }
  for (const [key, cell] of cells) {
    const [xs, ys] = key.split(',');
    const glyphs = cell.style === 'thick' ? HEAVY : LIGHT;
    let ch = glyphs[cell.bits] ?? '┼';
    // An upright line that crosses the rule of a band is drawn as the crossing it is.
    const rule = cell.bits === (N | S) ? rules.get(Number(ys)) : undefined;
    if (rule !== undefined && Number(xs) >= rule[0] && Number(xs) <= rule[1]) ch = glyphs[cell.bits | (Number(xs) > rule[0] ? W : 0) | (Number(xs) < rule[1] ? E : 0)] ?? '┼';
    else if (cell.style === 'dotted') {
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
    if (!l || edge.invisible) continue;
    const x = Math.round(l.x);
    const y = Math.round(l.y);
    for (let dy = 0; dy < Math.round(l.h); dy++) for (let dx = 0; dx < Math.round(l.w); dx++) c.put(x + dx, y + dy, ' ');
    const tw = cellWidth(l.text);
    c.text(x + Math.floor((l.w - tw) / 2), y + Math.floor((l.h - 1) / 2), l.text);
  }
}

function drawEndLabels(c: Canvas, layout: Layout): void {
  const put = (label: EndLabel | undefined): void => {
    if (label) c.text(Math.round(label.x), Math.round(label.y), label.text);
  };
  for (const edge of layout.edges) {
    if (edge.invisible) continue;
    put(edge.startLabel);
    put(edge.endLabel);
  }
}

/** The corners of a box: square, or rounded for the shapes that are not square. */
const CORNERS: Record<string, readonly [string, string, string, string]> = {
  square: ['┌', '┐', '└', '┘'],
  round: ['╭', '╮', '╰', '╯'],
  note: ['┌', '┒', '└', '┘'],
};

/** The rules between the compartments, and the lines of each, of a box divided into compartments. */
function drawCompartments(c: Canvas, n: LayoutNode, x0: number, y0: number, w: number): void {
  const cells = n.compartments ?? [];
  const heights = compartmentHeights(cells, cellRuler());
  let y = y0 + 1;
  cells.forEach((cell, i) => {
    if (i > 0) {
      c.put(x0, y, '├');
      for (let x = x0 + 1; x < x0 + w - 1; x++) c.put(x, y, '─');
      c.put(x0 + w - 1, y, '┤');
      y += 1;
    }
    const centred = (cell.align ?? (i === 0 ? 'center' : 'left')) === 'center';
    const starts = cell.columns === undefined ? [] : columnStarts(cell, cellRuler());
    cell.lines.forEach((line, k) => {
      const row = cell.columns?.[k];
      if (row === undefined) c.text(centred ? x0 + 1 + Math.floor((w - 2 - cellWidth(line)) / 2) : x0 + 2, y + k, line);
      else row.forEach((text, col) => text !== '' && c.text(x0 + 2 + (starts[col] ?? 0), y + k, text));
    });
    y += heights[i] ?? 0;
  });
}

function drawNode(c: Canvas, n: LayoutNode): void {
  const x0 = Math.round(n.x);
  const y0 = Math.round(n.y);
  const w = Math.round(n.w);
  const h = Math.round(n.h);
  if ((n.shape === 'start-dot' || n.shape === 'end-dot') && w === 1 && h === 1) {
    c.put(x0, y0, n.shape === 'start-dot' ? '●' : '◉');
    return;
  }
  const [tl, tr, bl, br] = CORNERS[n.shape === 'ellipse' || n.shape === 'actor' ? 'round' : n.shape === 'note' ? 'note' : 'square'] as readonly [string, string, string, string];
  const solid = n.shape === 'bar';
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      const top = y === y0;
      const bottom = y === y0 + h - 1;
      const left = x === x0;
      const right = x === x0 + w - 1;
      let ch = solid ? '█' : ' ';
      if (top && left) ch = solid ? '█' : tl;
      else if (top && right) ch = solid ? '█' : tr;
      else if (bottom && left) ch = solid ? '█' : bl;
      else if (bottom && right) ch = solid ? '█' : br;
      else if (top || bottom) ch = solid ? '█' : '─';
      else if (left || right) ch = solid ? '█' : '│';
      c.put(x, y, ch);
    }
  }
  if (hasCompartments(n)) {
    drawCompartments(c, n, x0, y0, w);
    return;
  }
  if (solid) return;
  if (n.shape === 'start-dot' || n.shape === 'end-dot') {
    c.put(x0 + Math.floor((w - 1) / 2), y0 + Math.floor((h - 1) / 2), n.shape === 'start-dot' ? '●' : '◉');
    return;
  }
  const texts = [n.shape === 'actor' ? `o ${n.title}` : n.title, ...n.lines].filter((t, i) => i > 0 || t !== '' || n.lines.length === 0);
  const start = y0 + 1 + Math.floor((h - 2 - texts.length) / 2);
  texts.forEach((t, i) => {
    c.text(x0 + 1 + Math.floor((w - 2 - cellWidth(t)) / 2), start + i, t);
  });
}

const SAMPLE_GLYPH: Record<EdgeStyle, string> = { normal: '──', thick: '━━', dotted: '┄┄' };

function drawLegend(c: Canvas, layout: Layout): void {
  for (const item of layout.legend?.items ?? []) {
    c.text(Math.round(item.x), Math.floor(item.y), SAMPLE_GLYPH[item.style]);
    c.text(Math.round(item.captionX), Math.floor(item.y), item.caption);
  }
}

/** The fewest cells of a lane name worth writing when it is cut. */
const SHORT_NAME = 6;

/**
 * Writes the name of every horizontal lane on its rule once everything else is drawn: `── name `. No line or label
 * is drawn over the name; where a line crosses the rule at that place the name moves to the right of the line (a
 * cell and a blank after it), and where no such place is free, to the first free stretch of the rule.
 */
function drawLaneNames(c: Canvas, layout: Layout, limit: number): void {
  const vertical = (layout.direction === 'TD') !== (layout.laneAxis === 'along');
  if (vertical) return;
  for (const lane of layout.lanes) {
    if (lane.label === '' || !lane.bare) continue;
    const y = Math.floor(lane.y);
    const x0 = Math.floor(lane.x);
    const x1 = x0 + Math.round(lane.w) - 1;
    const w = cellWidth(lane.label);
    const free = (x: number): boolean => {
      for (let k = x - 1; k <= x + w; k++) if (k < x0 || k > x1 || c.get(k, y) !== '─') return false;
      return true;
    };
    const preferred = Math.floor(lane.labelBox.x);
    const lines: number[] = [];
    for (let x = x0; x <= x1; x++) if (c.get(x, y) !== '─') lines.push(x);
    const candidates = [preferred, ...lines.map((x) => x + 2)];
    for (let x = preferred; x + w <= x1; x++) candidates.push(x);
    // A rule too short for the name beside its lines lets the name run past its end, up to `limit`, rather than over a line.
    const past = (x: number): boolean => {
      if (x + w > limit) return false;
      for (let k = x - 1; k <= Math.min(x + w, x1); k++) if (k < x0 || c.get(k, y) !== '─') return false;
      return true;
    };
    const whole = candidates.find(free) ?? candidates.find(past);
    if (whole === undefined) {
      // No room for the whole name: it is cut to the longest free stretch of the rule, when that holds a few letters.
      let best = { from: 0, len: 0 };
      for (let x = x0, from = x0; x <= x1 + 1; x++) {
        if (x <= x1 && c.get(x, y) === '─') continue;
        if (x - from > best.len) best = { from, len: x - from };
        from = x + 1;
      }
      if (best.len >= SHORT_NAME + 4) {
        const cut = clip(lane.label, best.len - 4);
        const start = best.from + 2;
        c.put(start - 1, y, ' ');
        c.text(start, y, cut);
        c.put(start + cellWidth(cut), y, ' ');
        continue;
      }
    }
    const at = whole ?? preferred;
    c.widen(at + w);
    c.put(at - 1, y, ' ');
    c.text(at, y, lane.label);
    c.put(at + w, y, ' ');
  }
}

/**
 * Draws a layout made with the cell ruler; returns one string per terminal row. `maxWidth` is how wide a row may grow
 * for a lane name that has no room on its rule; without it no row is wider than the layout.
 */
export function renderTextLayout(layout: Layout, maxWidth?: number): string[] {
  const c = new Canvas(Math.ceil(layout.width), Math.ceil(layout.height));
  drawLanes(c, layout);
  drawEdges(c, layout);
  drawLabels(c, layout);
  drawEndLabels(c, layout);
  for (const n of layout.nodes) drawNode(c, n);
  drawLaneNames(c, layout, maxWidth ?? c.width);
  drawLegend(c, layout);
  const lines = c.lines();
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

const ANSI: Record<TextTone, string> = { normal: '', dim: '\u001b[2m', bold: '\u001b[1m', accent: '\u001b[36m' };

/** Maps tones to ANSI escape codes for a terminal: bold, dim and a cyan accent. */
export function spansToAnsi(line: TextSpan[]): string {
  return line.map((s) => (ANSI[s.tone] === '' ? s.text : `${ANSI[s.tone]}${s.text}\u001b[0m`)).join('');
}
