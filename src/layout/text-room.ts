import { cellWidth } from '../metrics.ts';
import type { Layout, LayoutEdge, LayoutNode, Point } from '../types.ts';
import { placeLaneName } from './lane-names.ts';
import { cellOf, endCells, startCells } from './text-tidy.ts';

/** The fewest cells of a straight upright line that joins two boxes one above the other. */
const UPRIGHT_LEAST = 2;

/** What a seam pays to move one row up or down between two columns, and to run through a box, by the column. */
const STEP = 1;
const THROUGH_BOX = 10_000;

type Side = 'top' | 'bottom' | 'other';
type Cell = [number, number];

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const near = (a: number, b: number): boolean => Math.abs(a - b) < 1e-9;

const sideOf = (p: Point, n: LayoutNode): Side => (near(p.y, n.y) ? 'top' : near(p.y, n.y + n.h) ? 'bottom' : 'other');

const cells = (r: Rect): Rect => ({ x: Math.round(r.x), y: Math.round(r.y), w: Math.max(1, Math.round(r.w)), h: Math.max(1, Math.round(r.h)) });

/** Whether a text is written over a cell. */
const covers = (t: Rect, cell: readonly [number, number]): boolean => {
  const r = cells(t);
  return cell[0] >= r.x && cell[0] < r.x + r.w && cell[1] >= r.y && cell[1] < r.y + r.h;
};

/** The drawing with left and top exchanged: what is done to its rows is then done to the columns of the drawing it came from. The legend stays as it is. */
function turned(l: Layout): Layout {
  const point = <T extends { x: number; y: number }>(p: T): T => ({ ...p, x: p.y, y: p.x });
  const rect = <T extends Rect>(r: T): T => ({ ...r, x: r.y, y: r.x, w: r.h, h: r.w });
  return {
    ...l,
    width: l.height,
    height: l.width,
    nodes: l.nodes.map(rect),
    lanes: l.lanes.map((lane) => ({ ...rect(lane), labelBox: rect(lane.labelBox) })),
    edges: l.edges.map((e) => ({
      ...e,
      points: e.points.map(point),
      ...(e.label ? { label: rect(e.label) } : {}),
      ...(e.startLabel ? { startLabel: rect(e.startLabel) } : {}),
      ...(e.endLabel ? { endLabel: rect(e.endLabel) } : {}),
    })),
  };
}

/** Every cell a line runs through, from its start to its end. */
function cellsAlong(e: LayoutEdge, nodes: Map<string, LayoutNode>): Cell[] {
  const corners = e.points.map((_, i) => cellOf(e, nodes, i));
  const out: Cell[] = [corners[0] as Cell];
  for (let i = 0; i + 1 < corners.length; i++) {
    let [x, y] = corners[i] as Cell;
    const [x2, y2] = corners[i + 1] as Cell;
    const dx = Math.sign(x2 - x);
    const dy = dx === 0 ? Math.sign(y2 - y) : 0;
    while (x !== x2 || (dx === 0 && y !== y2)) {
      x += dx;
      y += dy;
      out.push([x, y]);
    }
  }
  return out;
}

/** The texts of a drawing that are written where the layout says: the labels of the lines and, with `names`, the names of the bands. */
function textsOf(l: Layout, names: boolean): Rect[] {
  const onLines = l.edges.flatMap((e) => (e.invisible ? [] : [e.label, e.startLabel, e.endLabel])).filter((t) => t !== undefined);
  return names ? [...onLines, ...l.lanes.filter((lane) => lane.label !== '').map((lane) => lane.labelBox)] : onLines;
}

/** The names of the bands that find no free place on their rule and are written over the lines that cross it, each with the blank on either side. */
function namesOverLines(l: Layout): Rect[] {
  const named = l.lanes.filter((lane) => lane.label !== '' && lane.bare === true);
  if (named.length === 0) return [];
  const nodes = new Map(l.nodes.map((n) => [n.id, n] as const));
  const shown = l.edges.filter((e) => !e.invisible && e.points.length >= 2);
  const lines = new Set(shown.flatMap((e) => cellsAlong(e, nodes).map((c) => `${c[0]},${c[1]}`)));
  const texts = textsOf(l, false);
  return named.flatMap((lane) => {
    const [x0, y] = [Math.floor(lane.x), Math.floor(lane.y)];
    const bare = (x: number): boolean => !lines.has(`${x},${y}`) && !texts.some((t) => covers(t, [x, y]));
    const placed = placeLaneName(lane.label, x0, x0 + Math.round(lane.w) - 1, Math.floor(lane.labelBox.x), Math.ceil(l.width), bare);
    return placed.over ? [{ x: placed.at - 1, y, w: cellWidth(placed.text) + 2, h: 1 }] : [];
  });
}

/** Rows a drawing lacks before one row, and the columns the boxes that ask for them stand in. */
interface Lack {
  row: number;
  rows: number;
  spans: Array<readonly [number, number]>;
}

interface End {
  node: LayoutNode;
  side: Side;
  /** Cells the mark at this end takes. */
  marks: number;
  /** The cells of the line, the one beside the box first. */
  cells: Cell[];
}

/** The row the rows for an end go in before: the row of the box when the line comes down onto it, the row under the box otherwise. */
const rowBefore = (end: End): number => (end.side === 'top' ? Math.round(end.node.y) : Math.round(end.node.y) + Math.round(end.node.h));

/**
 * The rows a drawing lacks. A box stands a row off the rule of a band above or below it (`rules` are the rows of the
 * rules). A mark at the end of a line on the top or the bottom of a box (an arrowhead, the marks of a relation) has a
 * cell of its own line straight behind it that no text is written over, and no mark stands on a rule. With `joins`,
 * what is asked instead is that a straight upright line between two boxes is `least(marks)` cells long.
 */
function rowsLacking(l: Layout, rules: ReadonlySet<number>, texts: Rect[], joins: boolean, least: (marks: number) => number): Lack[] {
  const lack = new Map<number, Lack>();
  const want = (row: number, rows: number, n: LayoutNode): void => {
    if (rows <= 0) return;
    const span = [Math.round(n.x), Math.round(n.x) + Math.round(n.w) - 1] as const;
    const had = lack.get(row);
    lack.set(row, { row, rows: Math.max(rows, had?.rows ?? 0), spans: [...(had?.spans ?? []), span] });
  };
  if (!joins) {
    for (const n of l.nodes) {
      const top = Math.round(n.y);
      const below = top + Math.round(n.h);
      if (rules.has(top - 1)) want(top, 1, n);
      if (rules.has(below)) want(below, 1, n);
    }
  }
  const nodes = new Map(l.nodes.map((n) => [n.id, n] as const));
  for (const e of l.edges) {
    const from = nodes.get(e.from);
    const to = nodes.get(e.to);
    if (e.invisible || e.points.length < 2 || from === undefined || to === undefined) continue;
    const along = cellsAlong(e, nodes);
    const start: End = { node: from, side: sideOf(e.points[0] as Point, from), marks: startCells(e), cells: along };
    const end: End = { node: to, side: sideOf(e.points[e.points.length - 1] as Point, to), marks: endCells(e), cells: [...along].reverse() };
    const upright = from !== to && start.side !== 'other' && end.side !== 'other' && along.every((c) => c[0] === (along[0] as Cell)[0]);
    if (joins) {
      const lower = start.side === 'top' ? start : end;
      if (upright) want(rowBefore(lower), least(start.marks + end.marks) - along.length, lower.node);
      continue;
    }
    for (const one of [start, end]) {
      if (one.side === 'other' || one.marks === 0) continue;
      let straight = 1;
      while (straight < one.cells.length && (one.cells[straight] as Cell)[0] === (one.cells[0] as Cell)[0]) straight++;
      if (!upright) want(rowBefore(one), one.marks + 1 - straight, one.node);
      // A text over a mark, or over the cell behind it, is left a row away.
      if (one.cells.slice(0, one.marks + 1).some((c) => texts.some((t) => covers(t, c)))) want(rowBefore(one), 1, one.node);
      const onRule = one.cells.slice(0, one.marks).findIndex((c) => rules.has(c[1]));
      if (onRule >= 0) want(rowBefore(one), one.marks - onRule, one.node);
    }
  }
  return [...lack.values()].sort((a, b) => a.row - b.row);
}

/** What stands in the cells of a drawing, as far as a seam asks. */
interface Sheet {
  w: number;
  h: number;
  /** By cell: whether what stands in it goes on in the cell to its right, so that the two move together. */
  joined: Uint8Array;
  /** By cell: the box or the text that stands in it, counted from 1. */
  owner: Int32Array;
  /** By owner: whether it is a box, which may grow taller, or a text, which may not. */
  box: boolean[];
  /** By column: the last row something stands in. */
  last: Int32Array;
}

/** `texts` keep their cells together; `bars` are the rules of the bands, drawn across. */
function sheetOf(l: Layout, texts: Rect[], bars: Rect[]): Sheet {
  const w = Math.max(1, Math.ceil(l.width));
  const h = Math.max(1, Math.ceil(l.height));
  const sheet: Sheet = { w, h, joined: new Uint8Array(w * h), owner: new Int32Array(w * h), box: [], last: new Int32Array(w).fill(-1) };
  const inside = (x: number, y: number): boolean => x >= 0 && x < w && y >= 0 && y < h;
  const stand = (x: number, y: number): void => {
    if (inside(x, y) && y > (sheet.last[x] as number)) sheet.last[x] = y;
  };
  const join = (x: number, y: number): void => {
    if (inside(x, y) && x + 1 < w) sheet.joined[y * w + x] = 1;
  };
  const own = (given: Rect, box: boolean): void => {
    const r = cells(given);
    sheet.box.push(box);
    for (let y = r.y; y < r.y + r.h; y++) {
      for (let x = r.x; x < r.x + r.w; x++) {
        if (!inside(x, y)) continue;
        sheet.owner[y * w + x] = sheet.box.length;
        if (x + 1 < r.x + r.w) join(x, y);
        stand(x, y);
      }
    }
  };
  for (const n of l.nodes) own(n, true);
  for (const t of texts) own(t, false);
  for (const given of bars) {
    const r = cells(given);
    for (let y = r.y; y < r.y + r.h; y++) {
      for (let x = r.x; x < r.x + r.w; x++) {
        stand(x, y);
        if (x + 1 < r.x + r.w) join(x, y);
      }
    }
  }
  const nodes = new Map(l.nodes.map((n) => [n.id, n] as const));
  for (const e of l.edges) {
    if (e.invisible || e.points.length < 2) continue;
    const along = cellsAlong(e, nodes);
    along.forEach((c, k) => {
      stand(c[0], c[1]);
      const next = along[k + 1];
      if (next !== undefined && next[1] === c[1]) join(Math.min(c[0], next[0]), c[1]);
    });
    // A line that ends on the left or the right side of a box keeps to the row of the box it ends in.
    for (const [i, id] of [[0, e.from], [e.points.length - 1, e.to]] as const) {
      const n = nodes.get(id);
      const p = e.points[i] as Point;
      if (n === undefined || sideOf(p, n) !== 'other') continue;
      const c = cellOf(e, nodes, i);
      if (near(p.x, n.x)) join(c[0], c[1]);
      else if (near(p.x, n.x + n.w)) join(c[0] - 1, c[1]);
    }
  }
  return sheet;
}

/**
 * Where `rows` rows go into a sheet: for every column the row they go in before. The seam runs before `row` in the
 * columns of `spans`. It moves up or down between two columns only past rows where nothing goes on from the one
 * column into the other, so that every box, text and level line moves whole or stays whole; it does so rather than
 * run through a box. `grow` lets it run through a box when there is no other way: that box grows taller. With an
 * `edge` nothing may move past that row. Nothing when there is no such seam.
 */
function seamOf(sheet: Sheet, lack: Lack, grow: boolean, edge: number | undefined): Int32Array | undefined {
  const { w, h } = sheet;
  const states = h + 1;
  const forced = new Uint8Array(w);
  for (const [from, to] of lack.spans) for (let x = Math.max(0, from); x <= Math.min(w - 1, to); x++) forced[x] = 1;
  const price = (x: number, s: number): number => {
    if (forced[x] === 1 && s !== lack.row) return Number.POSITIVE_INFINITY;
    if (edge !== undefined && s <= (sheet.last[x] as number) && (sheet.last[x] as number) + lack.rows > edge) return Number.POSITIVE_INFINITY;
    if (s === 0 || s === h) return 0;
    const above = sheet.owner[(s - 1) * w + x] as number;
    if (above === 0 || above !== sheet.owner[s * w + x]) return 0;
    return grow && sheet.box[above - 1] === true ? THROUGH_BOX : Number.POSITIVE_INFINITY;
  };
  const from = new Int32Array(w * states);
  let cost = new Float64Array(states);
  for (let s = 0; s < states; s++) cost[s] = price(0, s);
  for (let x = 1; x < w; x++) {
    const next = Float64Array.from(cost);
    const origin = from.subarray(x * states, (x + 1) * states);
    for (let s = 0; s < states; s++) origin[s] = s;
    for (let s = 1; s < states; s++) {
      if (sheet.joined[(s - 1) * w + x - 1] === 1 || (next[s - 1] as number) + STEP >= (next[s] as number)) continue;
      next[s] = (next[s - 1] as number) + STEP;
      origin[s] = origin[s - 1] as number;
    }
    for (let s = states - 2; s >= 0; s--) {
      if (sheet.joined[s * w + x - 1] === 1 || (next[s + 1] as number) + STEP >= (next[s] as number)) continue;
      next[s] = (next[s + 1] as number) + STEP;
      origin[s] = origin[s + 1] as number;
    }
    for (let s = 0; s < states; s++) next[s] = (next[s] as number) + price(x, s);
    cost = next;
  }
  let best = 0;
  for (let s = 1; s < states; s++) if ((cost[s] as number) < (cost[best] as number)) best = s;
  if (!Number.isFinite(cost[best] as number)) return undefined;
  const seam = new Int32Array(w);
  for (let x = w - 1, s = best; x >= 0; x--) {
    seam[x] = s;
    s = from[x * states + s] as number;
  }
  return seam;
}

/**
 * The drawing with `rows` rows put in along `seam`: what stands at or below the seam in its column moves down. The
 * ends of the lines stay on their boxes; a line whose end kept to its box while the row it came along moved away
 * turns in the cell that row moved to. With the drawing come the rows each rectangle of `fixed` moved down by.
 */
function withRows(l: Layout, seam: Int32Array, rows: number, fixed: Rect[]): { layout: Layout; moved: number[] } {
  const at = (x: number): number => seam[Math.max(0, Math.min(seam.length - 1, x))] as number;
  const shift = (x: number, y: number): number => (y >= at(x) ? rows : 0);
  const text = <T extends { x: number; y: number }>(t: T): T => ({ ...t, y: t.y + shift(Math.round(t.x), Math.round(t.y)) });
  const moved = l.nodes.map((n) => {
    const [x, top] = [Math.round(n.x), Math.round(n.y)];
    const last = top + Math.round(n.h) - 1;
    return { ...n, y: n.y + shift(x, top), h: n.h + shift(x, last) - shift(x, top) };
  });
  const before = new Map(l.nodes.map((n) => [n.id, n] as const));
  const after = new Map(moved.map((n) => [n.id, n] as const));
  const edges = l.edges.map((e) => {
    if (e.points.length === 0) return e;
    const was = e.points.map((_, i) => cellOf(e, before, i));
    const last = e.points.length - 1;
    const points = e.points.map((p, i) => {
      const old = was[i] as Cell;
      const plain = { x: p.x, y: p.y + shift(old[0], old[1]) };
      const id = i === 0 ? e.from : i === last ? e.to : undefined;
      const [stood, stands] = id === undefined ? [undefined, undefined] : [before.get(id), after.get(id)];
      if (stood === undefined || stands === undefined) return plain;
      const side = sideOf(p, stood);
      return side === 'top' ? { x: p.x, y: stands.y } : side === 'bottom' ? { x: p.x, y: stands.y + stands.h } : plain;
    });
    const now = points.map((_, i) => cellOf({ ...e, points }, after, i));
    const turn = (end: number, next: number): Point | undefined => {
      const [old, beside] = [was[end] as Cell, was[next] as Cell];
      const row = old[1] + shift(old[0], old[1]);
      if (old[0] === beside[0] || row === (now[end] as Cell)[1]) return undefined;
      const inner = next !== 0 && next !== last;
      return { x: (points[end] as Point).x, y: inner ? (points[next] as Point).y : row };
    };
    const first = last >= 1 ? turn(0, 1) : undefined;
    const final = last >= 1 ? turn(last, last - 1) : undefined;
    return {
      ...e,
      points: [points[0] as Point, ...(first ? [first] : []), ...points.slice(1, -1), ...(final ? [final] : []), points[last] as Point],
      ...(e.label ? { label: text(e.label) } : {}),
      ...(e.startLabel ? { startLabel: text(e.startLabel) } : {}),
      ...(e.endLabel ? { endLabel: text(e.endLabel) } : {}),
    };
  });
  const layout: Layout = {
    ...l,
    height: l.height + rows,
    nodes: moved,
    lanes: l.lanes.map((lane) => {
      const [x, top] = [Math.round(lane.x), Math.round(lane.y)];
      return { ...lane, y: lane.y + shift(x, top), h: lane.h + shift(x, top + Math.round(lane.h)) - shift(x, top), labelBox: text(lane.labelBox) };
    }),
    edges,
  };
  return { layout, moved: fixed.map((r) => shift(Math.round(r.x), Math.round(r.y))) };
}

interface Asked {
  /** The rules of the bands. */
  bars: Rect[];
  /** Whether the names of the bands are written where the layout says. */
  names: boolean;
  /** Rectangles that keep their cells together and are not part of the layout. */
  fixed: Rect[];
  least: (marks: number) => number;
  grow: boolean;
  /** When set, the drawing grows no taller where it need not: nothing moves past the last row something stands in, or past this row when that is further. */
  reach?: number;
  /** With `reach`: the rows the drawing may come to have when a row has no place within it. */
  most?: number;
}

/**
 * Opens the rows a drawing lacks; what cannot be opened is left as it is. Rows that go in where no box stands go in
 * straight across, all that one look at the drawing finds; the others go in one at a time along a seam.
 */
function opened(given: Layout, asked: Asked): { layout: Layout; fixed: Rect[] } {
  let l = given;
  let { fixed, bars } = asked;
  const left = new Set<string>();
  const key = (lack: Lack): string => `${lack.row}:${lack.spans.map((s) => s.join('-')).join(',')}`;
  const put = (seam: Int32Array, rows: number, keep: number | undefined): void => {
    const done = withRows(l, seam, rows, [...fixed, ...bars]);
    const down = (rects: Rect[], skip: number): Rect[] => rects.map((r, i) => ({ ...r, y: r.y + (done.moved[skip + i] as number) }));
    l = keep === undefined ? done.layout : { ...done.layout, height: Math.max(l.height, keep) };
    [fixed, bars] = [down(fixed, 0), down(bars, fixed.length)];
  };
  for (let turn = 0, most = 6 * given.nodes.length + 24; turn < most; turn++) {
    const rules = new Set(bars.map((r) => Math.round(r.y)));
    const texts = [...textsOf(l, asked.names), ...fixed, ...(bars.length > 0 ? namesOverLines(l) : [])];
    const lacking = (joins: boolean): Lack[] => rowsLacking(l, rules, texts, joins, asked.least).filter((lack) => !left.has(key(lack)));
    // The rows the marks ask for go in first: a straight line between two boxes often has its cells by then.
    const marks = lacking(false);
    const lacks = marks.length > 0 ? marks : lacking(true);
    if (lacks.length === 0) break;
    const width = Math.max(1, Math.ceil(l.width));
    const through = (row: number): boolean => [...l.nodes, ...texts].some((r) => Math.round(r.y) < row && row < Math.round(r.y) + Math.round(r.h));
    const straight = asked.reach === undefined ? lacks.filter((lack) => !through(lack.row)) : [];
    if (straight.length > 0) {
      // From the last row up, so that the rows above keep their numbers.
      for (const lack of [...straight].reverse()) put(new Int32Array(width).fill(lack.row), lack.rows, undefined);
      continue;
    }
    const lack = lacks[0] as Lack;
    const sheet = sheetOf(l, texts, bars);
    const edge = asked.reach === undefined ? undefined : Math.max(asked.reach, sheet.last.reduce((far, y) => Math.max(far, y), 0));
    const within = seamOf(sheet, lack, asked.grow, edge);
    const wider = within === undefined && edge !== undefined && asked.most !== undefined && asked.most - 1 > edge;
    const seam = wider ? seamOf(sheet, lack, asked.grow, (asked.most as number) - 1) : within;
    if (seam === undefined) {
      left.add(key(lack));
      continue;
    }
    // A drawing with a `reach` grows only as far as what moved past its last row.
    const far = sheet.last.reduce((most, y, x) => Math.max(most, y >= (seam[x] as number) ? y + lack.rows : y), -1);
    put(seam, lack.rows, edge === undefined ? undefined : far + 1);
  }
  return { layout: l, fixed };
}

/** Whether the bands of a drawing lie one above the other, each under a rule of its own. */
const ruled = (l: Layout): boolean => (l.direction === 'TD') === (l.laneAxis === 'along');

const rulesOf = (l: Layout): Rect[] => (ruled(l) ? l.lanes.filter((lane) => lane.label !== '').map((lane) => ({ x: Math.floor(lane.x), y: Math.floor(lane.y), w: Math.round(lane.w), h: 1 })) : []);

/**
 * Terminal drawings: the rows are opened that the bands and the marks at the ends of upright lines ask for. A box
 * stands a row off the rule of a band on either side. A mark at the end of a line that meets the top or the bottom
 * of a box stands in the cell before the box with a cell of its own line straight behind it, never on a rule,
 * never in the cell the line turns in and never under a text; a line that crosses a rule under the name of its
 * band counts as under a text. Two boxes one above the other that a straight line joins are two rows apart.
 * The rows go in along a seam that leaves every box as tall as it was where it can.
 */
export function openTextRows(l: Layout): Layout {
  if (l.clusters !== undefined) return l;
  const bars = rulesOf(l);
  const items = l.legend?.items ?? [];
  const legend: Rect[] = items.length === 0 ? [] : [{ x: 0, y: Math.floor((items[0] as { y: number }).y), w: Math.max(1, Math.ceil(l.width)), h: 1 }];
  const done = opened(l, { bars, names: bars.length === 0, fixed: legend, least: (marks) => Math.max(UPRIGHT_LEAST, marks + 1), grow: true }).layout;
  const added = done.height - l.height;
  if (added === 0 || l.legend === undefined) return done;
  return { ...done, legend: { ...l.legend, y: l.legend.y + added, base: { ...l.legend.base, height: l.legend.base.height + added }, items: l.legend.items.map((item) => ({ ...item, y: item.y + added })) } };
}

/**
 * Terminal drawings: the same for the marks at the ends of level lines. A mark on the left or the right side of a
 * box gets the cell of line behind it where the columns for it go in along a seam that runs through no box. The
 * seam first moves nothing past the right edge of the drawing; where there is no such seam the drawing grows wider,
 * up to `limit`, and where that is not enough the mark stays as it is.
 */
export function openTextColumns(l: Layout, limit?: number): Layout {
  if (l.clusters !== undefined) return l;
  const flat = turned(l);
  const rules = rulesOf(l);
  const items = l.legend?.items ?? [];
  const captions: Rect[] = items.map((item) => ({ x: Math.floor(item.y), y: Math.round(item.x), w: 1, h: Math.ceil(item.captionX) + cellWidth(item.caption) - Math.round(item.x) }));
  // A rule may be laid out longer than the drawing is wide: what is drawn of it ends with the drawing.
  const reach = Math.max(-1, ...rules.map((r) => Math.min(r.x + r.w, Math.ceil(l.width)) - 1));
  const done = opened(flat, { bars: [], names: rules.length === 0, fixed: captions, least: (marks) => (marks === 0 ? 0 : marks + 1), grow: false, reach, most: limit === undefined || !Number.isFinite(limit) ? Number.MAX_SAFE_INTEGER : Math.floor(limit) });
  if (done.layout === flat) return l;
  const back = turned(done.layout);
  // The rule of a band is as long as it was, or as much longer as the drawing grew wider.
  const lanes = back.lanes.map((lane, i) => {
    const was = l.lanes[i] as { x: number; w: number };
    return { ...lane, w: rules.length > 0 && was.x + was.w >= l.width ? back.width - lane.x : Math.min(lane.w, back.width - lane.x) };
  });
  if (l.legend === undefined) return { ...back, lanes };
  const right = (i: number): number => (done.fixed[i] as Rect).y - (captions[i] as Rect).y;
  return { ...back, lanes, legend: { ...l.legend, base: { ...l.legend.base, width: l.legend.base.width + back.width - l.width }, items: l.legend.items.map((item, i) => ({ ...item, x: item.x + right(i), captionX: item.captionX + right(i) })) } };
}

/** The drawing without row `y`: what stands below it moves up a row. Nothing but upright lines may run through the row. */
function withoutRow(l: Layout, y: number): Layout {
  const v = (c: number): number => (c > y ? c - 1 : c);
  const text = <T extends { y: number }>(t: T): T => ({ ...t, y: v(t.y) });
  return {
    ...l,
    height: l.height - 1,
    nodes: l.nodes.map(text),
    lanes: l.lanes.map((lane) => (lane.y > y ? { ...text(lane), labelBox: text(lane.labelBox) } : lane.y + lane.h > y ? { ...lane, h: lane.h - 1, labelBox: text(lane.labelBox) } : lane)),
    edges: l.edges.map((e) => ({
      ...e,
      points: e.points.map(text),
      ...(e.label ? { label: text(e.label) } : {}),
      ...(e.startLabel ? { startLabel: text(e.startLabel) } : {}),
      ...(e.endLabel ? { endLabel: text(e.endLabel) } : {}),
    })),
    ...(l.legend ? { legend: { ...l.legend, y: v(l.legend.y), base: { ...l.legend.base, height: l.legend.base.height - 1 }, items: l.legend.items.map(text) } } : {}),
  };
}

/**
 * Terminal drawings: a row that only upright lines pass, each on a stretch of three cells or more, is taken out again
 * when the drawing keeps every row its bands and the marks at the ends of its lines ask for without it.
 */
export function closeSpareRows(given: Layout): Layout {
  if (given.clusters !== undefined) return given;
  let l = given;
  for (let y = Math.ceil(l.height) - 2; y >= 1; y--) {
    const now = l;
    const nodes = new Map(now.nodes.map((n) => [n.id, n] as const));
    const on = (r: Rect): boolean => {
      const c = cells(r);
      return y >= c.y && y < c.y + c.h;
    };
    if (now.nodes.some(on) || textsOf(now, false).some(on) || now.lanes.some((lane) => lane.label !== '' && (Math.floor(lane.y) === y || Math.floor(lane.labelBox.y) === y))) continue;
    if ((now.legend?.items ?? []).some((item) => Math.floor(item.y) >= y - 1 && Math.floor(item.y) <= y + 1)) continue;
    // A text next to the row is not brought right against a box on its other side.
    const row = (r: Rect, at: number): boolean => {
      const c = cells(r);
      return at >= c.y && at < c.y + c.h;
    };
    const texts = textsOf(now, false);
    if (now.nodes.some((n) => texts.some((t) => (row(t, y - 1) && row(n, y + 1)) || (row(t, y + 1) && row(n, y - 1))))) continue;
    let passes = 0;
    const spare = now.edges.every((e) => {
      if (e.invisible || e.points.length < 2) return true;
      const corners = e.points.map((_, i) => cellOf(e, nodes, i));
      return corners.slice(1).every((b, i) => {
        const a = corners[i] as Cell;
        const [top, bottom] = [Math.min(a[1], b[1]), Math.max(a[1], b[1])];
        if (y < top || y > bottom) return true;
        // An upright stretch runs through the row with a cell above it and a cell below it; nothing else of a line may lie in it.
        if (a[0] !== b[0] || y === top || y === bottom || bottom - top < 2) return false;
        passes++;
        return true;
      });
    });
    if (!spare || passes === 0) continue;
    const shorter = withoutRow(now, y);
    if (openTextRows(shorter).height === shorter.height) l = shorter;
  }
  return l;
}
