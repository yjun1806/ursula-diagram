import { cellWidth, cellWidthOf, cellRuler } from '../metrics.ts';
import { placeLaneName } from '../layout/lane-names.ts';
import { columnStarts, compartmentHeights, hasCompartments } from '../layout/records.ts';
import { cornersOf } from '../text/corners.ts';
import { RELATION_MARKS } from '../edge-ends.ts';
import type { EdgeEnd, EdgeStyle, EndLabel, Layout, LayoutEdge, LayoutLane, LayoutNode, TextSpan, TextTone } from '../types.ts';

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
  /** The tone of every cell; kept only for a drawing given out in spans. */
  readonly tones: TextTone[][] | undefined;
  width: number;
  readonly height: number;
  /** The tone `put` and `text` write in when they are given none. */
  tone: TextTone = 'normal';

  constructor(width: number, height: number, toned = false) {
    this.width = width;
    this.height = height;
    this.rows = Array.from({ length: height }, () => new Array<string>(width).fill(' '));
    this.tones = toned ? Array.from({ length: height }, () => new Array<TextTone>(width).fill('normal')) : undefined;
  }

  /** Makes every row at least `width` cells wide; the new cells are blank. */
  widen(width: number): void {
    if (width <= this.width) return;
    for (const row of this.rows) while (row.length < width) row.push(' ');
    for (const row of this.tones ?? []) while (row.length < width) row.push('normal');
    this.width = width;
  }

  /** Writes one character; wide characters take two cells and never get split. */
  put(x: number, y: number, ch: string, tone: TextTone = this.tone): void {
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
    const tones = this.tones?.[y];
    if (tones !== undefined) tones[x] = tone;
  }

  get(x: number, y: number): string {
    return this.rows[y]?.[x] ?? ' ';
  }

  text(x: number, y: number, s: string, tone: TextTone = this.tone): void {
    let cx = x;
    for (const ch of s) {
      this.put(cx, y, ch, tone);
      cx += cellWidthOf(ch.codePointAt(0) ?? 0);
    }
  }

  lines(): string[] {
    return this.rows.map((r) => r.join('').trimEnd());
  }

  /**
   * The rows as spans of one tone, with the same text as `lines`. A blank takes the tone of the text on both sides of it
   * when they agree, so that a name of several words is one span; other blanks are plain.
   */
  spans(): TextSpan[][] {
    return this.rows.map((row, y) => {
      const text = row.join('').trimEnd();
      const tones = this.tones?.[y] ?? [];
      const out: TextSpan[] = [];
      let at = 0;
      const toneAt = (x: number): TextTone => {
        if (row[x] !== ' ') return tones[x] ?? 'normal';
        let l = x - 1;
        while (l >= 0 && (row[l] === ' ' || row[l] === '')) l--;
        let r = x + 1;
        while (r < row.length && (row[r] === ' ' || row[r] === '')) r++;
        const left = l >= 0 ? tones[l] : undefined;
        return left !== undefined && left === tones[r] && r < row.length ? left : 'normal';
      };
      for (let x = 0; x < row.length && at < text.length; x++) {
        const ch = row[x] ?? '';
        if (ch === '') continue;
        at += ch.length;
        const tone = toneAt(x);
        const last = out[out.length - 1];
        if (last !== undefined && last.tone === tone) out[out.length - 1] = { text: last.text + ch, tone };
        else out.push({ text: ch, tone });
      }
      return out;
    });
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
      c.text(Math.floor(lane.labelBox.x), Math.floor(lane.labelBox.y), lane.label, 'bold');
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
    c.text(Math.floor(lane.labelBox.x), Math.floor(lane.labelBox.y), lane.label, 'bold');
  }
}

/** Glyphs that reach the cell above or below them: a rule that touched one would read as part of its line. */
const UPRIGHT = new Set([...'│┆┃╎┌┐└┘├┤┬┴┼╭╮╰╯┏┓┗┛┣┫┳┻╋▲▼△▽^v']);

/**
 * Bands that stand side by side as columns have no border of their own, only their name on top: a dashed rule down the
 * middle of the gap between two neighbouring columns shows which boxes stand in which. It is drawn last, in blank cells
 * only, and stops a cell short of any line that runs up or down, so that it never reads as part of a line. A gap of
 * fewer than three cells has no room for a rule with a blank on either side, and gets none.
 */
function drawColumnRules(c: Canvas, layout: Layout): void {
  if ((layout.direction === 'TD') === (layout.laneAxis === 'along')) return;
  const columns = layout.lanes.filter((l) => l.label !== '' && l.bare === true).sort((a, b) => a.x - b.x);
  for (let i = 0; i + 1 < columns.length; i++) {
    const a = columns[i] as LayoutLane;
    const b = columns[i + 1] as LayoutLane;
    const end = Math.floor(a.x) + Math.round(a.w);
    const gap = Math.floor(b.x) - end;
    if (gap < 3) continue;
    const x = end + Math.floor(gap / 2);
    const top = Math.max(Math.floor(a.y), Math.floor(b.y));
    const bottom = Math.min(Math.floor(a.y) + Math.round(a.h), Math.floor(b.y) + Math.round(b.h)) - 1;
    const free = (y: number): boolean => c.get(x, y) === ' ' && !UPRIGHT.has(c.get(x, y - 1)) && !UPRIGHT.has(c.get(x, y + 1));
    const rows = Array.from({ length: bottom - top + 1 }, (_, k) => top + k).filter(free);
    for (const y of rows) c.put(x, y, '╎', 'dim');
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
    c.put(Number(xs), Number(ys), ch, cell.style === 'dotted' ? 'dim' : 'normal');
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
    if (label) c.text(Math.round(label.x), Math.round(label.y), label.text, 'dim');
  };
  for (const edge of layout.edges) {
    if (edge.invisible) continue;
    put(edge.startLabel);
    put(edge.endLabel);
  }
}

/** A name stands out and a tag steps back; without emphasis the first compartment holds the name of the box. */
function compartmentTone(emphasis: string | undefined, index: number): TextTone {
  if (emphasis === 'title') return 'bold';
  if (emphasis === 'tag') return 'dim';
  return emphasis === undefined && index === 0 ? 'bold' : 'normal';
}

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
      const tone = compartmentTone(cell.lineEmphasis?.[k], i);
      if (row === undefined) c.text(centred ? x0 + 1 + Math.floor((w - 2 - cellWidth(line)) / 2) : x0 + 2, y + k, line, tone);
      else row.forEach((text, col) => text !== '' && c.text(x0 + 2 + (starts[col] ?? 0), y + k, text, tone));
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
  const [tl, tr, bl, br] = cornersOf(n.shape);
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
    c.text(x0 + 1 + Math.floor((w - 2 - cellWidth(t)) / 2), start + i, t, i === 0 && n.title !== '' ? 'bold' : 'normal');
  });
}

const SAMPLE_GLYPH: Record<EdgeStyle, string> = { normal: '──', thick: '━━', dotted: '┄┄' };

function drawLegend(c: Canvas, layout: Layout): void {
  for (const item of layout.legend?.items ?? []) {
    c.text(Math.round(item.x), Math.floor(item.y), SAMPLE_GLYPH[item.style], item.style === 'dotted' ? 'dim' : 'normal');
    c.text(Math.round(item.captionX), Math.floor(item.y), item.caption, 'dim');
  }
}

/**
 * Writes the name of every horizontal lane on its rule once everything else is drawn: `── name `. No line or label
 * is drawn over the name; where it stands is told by `placeLaneName`.
 */
function drawLaneNames(c: Canvas, layout: Layout, limit: number): void {
  const vertical = (layout.direction === 'TD') !== (layout.laneAxis === 'along');
  if (vertical) return;
  for (const lane of layout.lanes) {
    if (lane.label === '' || !lane.bare) continue;
    const y = Math.floor(lane.y);
    const x0 = Math.floor(lane.x);
    const placed = placeLaneName(lane.label, x0, x0 + Math.round(lane.w) - 1, Math.floor(lane.labelBox.x), limit, (x) => c.get(x, y) === '─');
    const w = cellWidth(placed.text);
    c.widen(placed.at + w);
    c.put(placed.at - 1, y, ' ');
    c.text(placed.at, y, placed.text, 'bold');
    c.put(placed.at + w, y, ' ');
  }
}

/**
 * Draws a layout made with the cell ruler; returns one string per terminal row. `maxWidth` is how wide a row may grow
 * for a lane name that has no room on its rule; without it no row is wider than the layout.
 */
export function renderTextLayout(layout: Layout, maxWidth?: number): string[] {
  const lines = drawLayout(layout, maxWidth, false).lines();
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

/** The same drawing as `renderTextLayout`, in spans: names bold; dotted lines, end labels and legend captions dim. */
export function renderTextLayoutSpans(layout: Layout, maxWidth?: number): TextSpan[][] {
  const rows = drawLayout(layout, maxWidth, true).spans();
  while (rows.length > 0 && (rows[rows.length - 1] ?? []).length === 0) rows.pop();
  return rows;
}

/**
 * `lines`, a terminal drawing whose first rows were drawn from `layout`, as spans: those rows take the tones of the
 * layout, the rows after them (a list below the drawing) are plain. Rows that are not the layout's are all plain.
 */
export function layoutSpans(layout: Layout, lines: readonly string[], maxWidth?: number): TextSpan[][] {
  const plain = (text: string): TextSpan[] => (text === '' ? [] : [{ text, tone: 'normal' }]);
  const drawn = renderTextLayoutSpans(layout, maxWidth);
  const same = drawn.length <= lines.length && drawn.every((row, i) => row.map((s) => s.text).join('') === lines[i]);
  return same ? [...drawn, ...lines.slice(drawn.length).map(plain)] : lines.map(plain);
}

function drawLayout(layout: Layout, maxWidth: number | undefined, toned: boolean): Canvas {
  const c = new Canvas(Math.ceil(layout.width), Math.ceil(layout.height), toned);
  drawLanes(c, layout);
  drawEdges(c, layout);
  drawLabels(c, layout);
  drawEndLabels(c, layout);
  for (const n of layout.nodes) drawNode(c, n);
  drawLaneNames(c, layout, maxWidth ?? c.width);
  drawLegend(c, layout);
  drawColumnRules(c, layout);
  return c;
}

const ANSI: Record<TextTone, string> = { normal: '', dim: '\u001b[2m', bold: '\u001b[1m', accent: '\u001b[36m' };

/** Maps tones to ANSI escape codes for a terminal: bold, dim and a cyan accent. */
export function spansToAnsi(line: TextSpan[]): string {
  return line.map((s) => (ANSI[s.tone] === '' ? s.text : `${ANSI[s.tone]}${s.text}\u001b[0m`)).join('');
}
