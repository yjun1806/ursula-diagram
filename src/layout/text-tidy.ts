import { cellWidth, cellWidthOf } from '../metrics.ts';
import type { Layout, LayoutEdge, LayoutNode, Point } from '../types.ts';

/** The text cut to `cells` cells, its last cell an ellipsis; unchanged when it fits. */
function cut(text: string, cells: number): string {
  if (cellWidth(text) <= cells) return text;
  let out = '';
  let w = 0;
  for (const ch of text) {
    const cw = cellWidthOf(ch.codePointAt(0) ?? 0);
    if (w + cw > cells - 1) break;
    out += ch;
    w += cw;
  }
  return `${out.trimEnd()}…`;
}

/** The cell a point of a line is drawn in: an end on the left or top border of its box is drawn in the cell outside it. */
function cellOf(edge: LayoutEdge, nodes: Map<string, LayoutNode>, index: number): [number, number] {
  const p = edge.points[index] as Point;
  let x = Math.floor(p.x + 1e-9);
  let y = Math.floor(p.y + 1e-9);
  const node = index === 0 ? nodes.get(edge.from) : index === edge.points.length - 1 ? nodes.get(edge.to) : undefined;
  if (node) {
    if (Math.abs(p.x - node.x) < 1e-9) x -= 1;
    if (Math.abs(p.y - node.y) < 1e-9) y -= 1;
  }
  return [x, y];
}

/** Marks drawn in two cells at an end of a line. */
const TWO_CELLS: ReadonlySet<string> = new Set(['one', 'zero-one', 'one-many', 'zero-many']);

/** Cells the mark at the start and the one at the end of a line take; the arrowhead of a plain line takes one. */
const startCells = (e: LayoutEdge): number => (e.startEnd === undefined || e.startEnd === 'none' ? 0 : TWO_CELLS.has(e.startEnd) ? 2 : 1);
const endCells = (e: LayoutEdge): number => (e.end === 'none' ? 0 : e.end !== undefined && TWO_CELLS.has(e.end) ? 2 : 1);

/**
 * The drawing with `count` blank columns (or rows, when `rows` is set) put in before the one numbered `at`: what
 * starts there or further on moves, what spans it grows.
 */
function grow(l: Layout, at: number, count: number, rows: boolean): Layout {
  const v = (c: number): number => (c >= at ? c + count : c);
  const point = (p: Point): Point => (rows ? { x: p.x, y: v(p.y) } : { x: v(p.x), y: p.y });
  const text = <T extends { x: number; y: number }>(t: T): T => (rows ? { ...t, y: v(t.y) } : { ...t, x: v(t.x) });
  const span = <T extends { x: number; y: number; w: number; h: number }>(r: T): T => {
    if (rows) return r.y >= at ? { ...r, y: r.y + count } : r.y + r.h > at ? { ...r, h: r.h + count } : r;
    return r.x >= at ? { ...r, x: r.x + count } : r.x + r.w > at ? { ...r, w: r.w + count } : r;
  };
  return {
    ...l,
    ...(rows ? { height: l.height + count } : { width: l.width + count }),
    nodes: l.nodes.map(span),
    lanes: l.lanes.map((lane) => ({ ...span(lane), labelBox: text(lane.labelBox) })),
    edges: l.edges.map((e) => ({
      ...e,
      points: e.points.map(point),
      ...(e.label ? { label: text(e.label) } : {}),
      ...(e.startLabel ? { startLabel: text(e.startLabel) } : {}),
      ...(e.endLabel ? { endLabel: text(e.endLabel) } : {}),
    })),
    ...(l.legend
      ? {
          legend: rows
            ? { ...l.legend, y: v(l.legend.y), base: { ...l.legend.base, height: l.legend.base.height + count }, items: l.legend.items.map((item) => ({ ...item, y: v(item.y) })) }
            : { ...l.legend, w: l.legend.w + count, base: { ...l.legend.base, width: l.legend.base.width + count } },
        }
      : {}),
  };
}

/**
 * Terminal drawings: a label written on a level stretch of its line leaves a cell of line before it and a cell of
 * line after it, and the marks at the ends of a line (an arrowhead, the marks of a relation) leave a cell of line
 * between them. Where a stretch is too short for that the drawing gets the columns or rows it lacks; columns only
 * as long as it stays within `limit`. The drawing is also as wide as its labels.
 */
export function openTextLabels(given: Layout, limit: number | undefined): Layout {
  let l = given;
  const within = (w: number): boolean => limit === undefined || !Number.isFinite(limit) || w <= limit;
  for (let ei = 0; ei < l.edges.length; ei++) {
    const e = l.edges[ei] as LayoutEdge;
    if (e.invisible || e.points.length < 2) continue;
    const label = e.label !== undefined && Math.round(e.label.h) === 1 ? e.label : undefined;
    const nodes = new Map(l.nodes.map((n) => [n.id, n] as const));
    const cells = e.points.map((_, i) => cellOf(e, nodes, i));
    for (let i = 0; i + 1 < cells.length; i++) {
      const [x1, y1] = cells[i] as [number, number];
      const [x2, y2] = cells[i + 1] as [number, number];
      if (x1 !== x2 && y1 !== y2) continue;
      // A line of one cell runs the way its boxes lie: level when the cell is beside the box it leaves.
      const from = nodes.get(e.from);
      const to = nodes.get(e.to);
      const single = x1 === x2 && y1 === y2;
      if (single && (cells.length !== 2 || from === undefined || to === undefined)) continue;
      const level = single ? from !== undefined && y1 >= from.y && y1 < from.y + from.h : y1 === y2;
      const a = level ? Math.min(x1, x2) : Math.min(y1, y2);
      const b = level ? Math.max(x1, x2) : Math.max(y1, y2);
      const centre = (n: LayoutNode | undefined): number => (n === undefined ? 0 : level ? n.x + n.w / 2 : n.y + n.h / 2);
      const forward = single ? centre(to) > centre(from) : level ? x2 > x1 : y2 > y1;
      const tail = i === 0 ? startCells(e) : 0;
      const head = i + 2 === cells.length ? endCells(e) : 0;
      const [low, high] = forward ? [tail, head] : [head, tail];
      const lx = label === undefined ? 0 : Math.round(label.x);
      const lw = label === undefined ? 0 : Math.round(label.w);
      const labelled = level && label !== undefined && Math.round(label.y) === y1 && lx + lw - 1 >= a && lx <= b;
      if (!labelled && low + high < 2) continue;
      const need = labelled ? lw + 2 + low + high : low + high + 1;
      const lack = need - (b - a + 1);
      // Columns are added up to the limit; a label that still has no room is cut short.
      const added = lack <= 0 ? 0 : !level ? lack : limit === undefined || !Number.isFinite(limit) ? lack : Math.max(0, Math.min(lack, Math.floor(limit - l.width)));
      if (added > 0) l = grow(l, a + 1, added, !level);
      if (!labelled) continue;
      const end = b + added;
      const room = end - a + 1 - (2 + low + high);
      const moved = (l.edges[ei] as LayoutEdge).label;
      if (moved === undefined) break;
      // A cut label keeps the blank on each side of its text.
      // Short of room, a label first gives up the blanks beside its text; only a text that still has no room is cut.
      const bare = cellWidth(moved.text);
      const shown = room >= lw ? moved : room >= bare ? { ...moved, w: bare } : room >= 4 ? { ...moved, text: cut(moved.text, room - 2), w: room } : undefined;
      if (shown === undefined) break;
      const first = a + low + 1 + Math.floor((room - shown.w) / 2);
      if (shown !== moved || added > 0 || lx < a + low + 1 || lx + lw > end - high) {
        l = { ...l, edges: l.edges.map((o, k) => (k === ei ? { ...o, label: { ...shown, x: first } } : o)) };
      }
      break;
    }
  }
  // Texts that reach past the right side: the drawing grows to hold them, up to the limit; past it a label is cut.
  let right = Math.max(l.width, 0);
  const texts = l.edges.flatMap((e) => (e.invisible ? [] : [e.label, e.startLabel, e.endLabel])).filter((t) => t !== undefined);
  for (const t of texts) right = Math.max(right, Math.ceil(t.x + t.w));
  for (const lane of l.lanes) if (lane.label !== '') right = Math.max(right, Math.ceil(lane.labelBox.x) + cellWidth(lane.label));
  // Past the limit the drawing is as wide as its boxes and lines need, and the labels that reach further are cut.
  const solid = Math.max(0, ...l.nodes.map((n) => Math.ceil(n.x + n.w)), ...l.edges.flatMap((e) => (e.invisible ? [] : e.points.map((p) => Math.floor(p.x + 1e-9) + 1))), ...(l.legend?.items ?? []).map((item) => Math.ceil(item.captionX) + cellWidth(item.caption)));
  const width = within(right) ? right : Math.max(solid, limit ?? solid);
  const fitted = (e: LayoutEdge): LayoutEdge => {
    const t = e.label;
    if (t !== undefined && !e.invisible && t.x < 0) {
      // A label that starts left of the drawing keeps its end.
      const room = Math.floor(t.x + t.w);
      const tail = [...t.text];
      let kept = '';
      while (tail.length > 0 && cellWidth(`…${tail[tail.length - 1]}${kept}`) <= room - 2) kept = `${tail.pop()}${kept}`;
      return room >= 4 ? { ...e, label: { ...t, text: `…${kept.trimStart()}`, x: 0, w: room } } : e;
    }
    if (t === undefined || e.invisible || Math.ceil(t.x + t.w) <= width) return e;
    const room = Math.floor(width - t.x);
    return room >= 4 ? { ...e, label: { ...t, text: cut(t.text, room - 2), w: room } } : e;
  };
  return { ...l, width, edges: l.edges.map(fitted) };
}

/**
 * Terminal drawings: the dot a state diagram starts or ends at is one cell, without a box. Its lines run on to it.
 * A dot keeps its box when a line meets it away from the middle of a side.
 */
export function shrinkDots(l: Layout): Layout {
  const near = (a: number, b: number): boolean => Math.abs(a - b) < 1e-9;
  let edges = l.edges;
  const nodes = l.nodes.map((n) => {
    if ((n.shape !== 'start-dot' && n.shape !== 'end-dot') || Math.round(n.w) < 3 || Math.round(n.h) < 3) return n;
    const cx = Math.round(n.x) + Math.floor((Math.round(n.w) - 1) / 2);
    const cy = Math.round(n.y) + Math.floor((Math.round(n.h) - 1) / 2);
    let fits = true;
    const moved = edges.map((e) => {
      if (e.from !== n.id && e.to !== n.id) return e;
      const points = e.points.map((p, i) => {
        const mine = (i === 0 && e.from === n.id) || (i === e.points.length - 1 && e.to === n.id);
        if (!mine) return p;
        const col = Math.floor(p.x + 1e-9);
        const row = Math.floor(p.y + 1e-9);
        if (near(p.y, n.y) && col === cx) return { x: p.x, y: cy };
        if (near(p.y, n.y + n.h) && col === cx) return { x: p.x, y: cy + 1 };
        if (near(p.x, n.x) && row === cy) return { x: cx, y: p.y };
        if (near(p.x, n.x + n.w) && row === cy) return { x: cx + 1, y: p.y };
        fits = false;
        return p;
      });
      return { ...e, points };
    });
    if (!fits) return n;
    edges = moved;
    return { ...n, x: cx, y: cy, w: 1, h: 1 };
  });
  return { ...l, nodes, edges };
}

/** Rows a box needs: its borders and its text. A bar keeps the rows it has. */
function rowsNeeded(n: LayoutNode): number {
  if (n.shape === 'bar') return Math.round(n.h);
  if (n.compartments !== undefined && n.compartments.length > 0) return n.compartments.reduce((sum, c) => sum + Math.max(1, c.lines.length), 0) + n.compartments.length - 1 + 2;
  if (n.shape === 'start-dot' || n.shape === 'end-dot') return Math.min(3, Math.round(n.h));
  return 2 + Math.max(1, (n.title === '' ? 0 : 1) + n.lines.length);
}

/**
 * Terminal drawings: rows that show nothing are taken out. A row goes when every box it runs through has a spare
 * row there (below its text, for a box divided into compartments), and nothing else stands in it but lines passing
 * straight down: no end or bend of a line, no level stretch, no label, no rule or name of a lane. Of the rows
 * between boxes that hold nothing at all, one stays.
 */
export function closeTextRows(l: Layout): Layout {
  const height = Math.ceil(l.height);
  if (height <= 0 || l.clusters !== undefined) return l;
  const kept = new Array<boolean>(height).fill(false);
  const used = new Array<boolean>(height).fill(false);
  const keep = (from: number, to: number): void => {
    for (let y = Math.max(0, Math.floor(from)); y <= Math.min(height - 1, Math.floor(to)); y++) kept[y] = true;
  };
  const nodes = new Map(l.nodes.map((n) => [n.id, n] as const));
  for (const e of l.edges) {
    if (e.points.length < 2) continue;
    const corners = e.points.map((_, i) => cellOf(e, nodes, i));
    const cells: Array<[number, number]> = [corners[0] as [number, number]];
    for (let i = 0; i + 1 < corners.length; i++) {
      let [x, y] = corners[i] as [number, number];
      const [x2, y2] = corners[i + 1] as [number, number];
      const dx = Math.sign(x2 - x);
      const dy = dx === 0 ? Math.sign(y2 - y) : 0;
      if (dx !== 0 && y2 !== y) keep(Math.min(y, y2), Math.max(y, y2));
      while (x !== x2 || (dx === 0 && y !== y2)) {
        x += dx;
        y += dy;
        cells.push([x, y]);
      }
    }
    // Between the marks of a relation at least one cell of line stays.
    const marks = startCells(e) + endCells(e) >= 2;
    let lineKept = !marks;
    cells.forEach(([x, y], k) => {
      if (y >= 0 && y < height) used[y] = true;
      const before = cells[k - 1];
      const after = cells[k + 1];
      const passing = before !== undefined && after !== undefined && before[0] === x && after[0] === x && before[1] !== y && after[1] !== y;
      const marked = (k === 1 && e.startEnd !== undefined && TWO_CELLS.has(e.startEnd)) || (k === cells.length - 2 && e.end !== undefined && TWO_CELLS.has(e.end));
      if (!passing || marked) keep(y, y);
      else if (!lineKept) {
        keep(y, y);
        lineKept = true;
      }
    });
    for (const t of [e.label, e.startLabel, e.endLabel]) if (t) keep(Math.round(t.y), Math.round(t.y) + Math.max(1, Math.round(t.h)) - 1);
  }
  for (const lane of l.lanes) {
    if (lane.label === '') continue;
    keep(lane.y, lane.y);
    keep(lane.labelBox.y, lane.labelBox.y);
    keep(lane.y + lane.h - 1, lane.y + lane.h - 1);
  }
  for (const item of l.legend?.items ?? []) keep(item.y, item.y);
  const boxes = l.nodes.map((n) => ({ n, y0: Math.round(n.y), h: Math.round(n.h), spare: Math.round(n.h) - rowsNeeded(n), records: n.compartments !== undefined && n.compartments.length > 0 }));
  for (const b of boxes) {
    keep(b.y0, b.y0);
    keep(b.y0 + b.h - 1, b.y0 + b.h - 1);
    if (b.records) keep(b.y0, b.y0 + rowsNeeded(b.n) - 2);
  }
  const gone: number[] = [];
  let blank = 0;
  for (let y = height - 1; y >= 0; y--) {
    const through = boxes.filter((b) => y > b.y0 && y < b.y0 + b.h - 1);
    if (through.length === 0 && !used[y] && !kept[y]) {
      // A row with nothing in it: the first of a run stays.
      blank += 1;
      if (blank > 1) gone.push(y);
      continue;
    }
    blank = 0;
    if (kept[y] || through.some((b) => b.spare <= 0)) continue;
    for (const b of through) b.spare -= 1;
    gone.push(y);
  }
  if (gone.length === 0) return l;
  const before = (v: number): number => gone.reduce((count, r) => count + (r < v ? 1 : 0), 0);
  const y = (v: number): number => v - before(Math.floor(v + 1e-9));
  const span = <T extends { y: number; h: number }>(r: T): T => {
    const top = Math.round(r.y);
    const bottom = top + Math.round(r.h);
    return { ...r, y: r.y - before(top), h: r.h - (before(bottom) - before(top)) };
  };
  return {
    ...l,
    height: l.height - gone.length,
    nodes: l.nodes.map(span),
    lanes: l.lanes.map((lane) => ({ ...span(lane), labelBox: { ...lane.labelBox, y: y(lane.labelBox.y) } })),
    edges: l.edges.map((e) => ({
      ...e,
      points: e.points.map((p) => ({ x: p.x, y: y(p.y) })),
      ...(e.label ? { label: { ...e.label, y: y(e.label.y) } } : {}),
      ...(e.startLabel ? { startLabel: { ...e.startLabel, y: y(e.startLabel.y) } } : {}),
      ...(e.endLabel ? { endLabel: { ...e.endLabel, y: y(e.endLabel.y) } } : {}),
    })),
    ...(l.legend ? { legend: { ...l.legend, y: y(l.legend.y), base: { ...l.legend.base, height: l.legend.base.height - before(Math.ceil(l.legend.base.height)) }, items: l.legend.items.map((item) => ({ ...item, y: y(item.y) })) } } : {}),
  };
}

/** Blank columns between two parts of a drawing set side by side. */
const PART_GAP = 3;

/**
 * Terminal drawings: parts that no line joins, drawn one below the other, are set side by side in the order they
 * come, as many to a row as the width holds, when that takes fewer rows. A drawing with named lanes keeps its rows.
 */
export function packParts(l: Layout, limit: number | undefined): Layout {
  const height = Math.ceil(l.height);
  if (height <= 0 || l.clusters !== undefined || l.lanes.some((lane) => lane.label !== '')) return l;
  const room = limit === undefined || !Number.isFinite(limit) ? 100 : limit;
  const nodes = new Map(l.nodes.map((n) => [n.id, n] as const));
  interface Piece {
    top: number;
    bottom: number;
    left: number;
    right: number;
  }
  const pieces: Piece[] = [];
  const nodeBox = (n: LayoutNode): Piece => ({ top: Math.round(n.y), bottom: Math.round(n.y) + Math.round(n.h) - 1, left: Math.round(n.x), right: Math.round(n.x) + Math.round(n.w) - 1 });
  const edgeBox = (e: LayoutEdge): Piece | undefined => {
    if (e.points.length === 0) return undefined;
    const cells = e.points.map((_, i) => cellOf(e, nodes, i));
    const box: Piece = { top: Math.min(...cells.map((c) => c[1])), bottom: Math.max(...cells.map((c) => c[1])), left: Math.min(...cells.map((c) => c[0])), right: Math.max(...cells.map((c) => c[0])) };
    for (const t of [e.label, e.startLabel, e.endLabel]) {
      if (t === undefined) continue;
      box.top = Math.min(box.top, Math.round(t.y));
      box.bottom = Math.max(box.bottom, Math.round(t.y) + Math.max(1, Math.round(t.h)) - 1);
      box.left = Math.min(box.left, Math.round(t.x));
      box.right = Math.max(box.right, Math.round(t.x) + Math.round(t.w) - 1);
    }
    return box;
  };
  for (const n of l.nodes) pieces.push(nodeBox(n));
  for (const e of l.edges) {
    const box = e.invisible ? undefined : edgeBox(e);
    if (box) pieces.push(box);
  }
  if (pieces.length === 0) return l;
  const legendTop = Math.min(height, ...(l.legend?.items ?? []).map((item) => Math.floor(item.y)));
  const filled = new Array<boolean>(height + 1).fill(false);
  for (const p of pieces) for (let y = Math.max(0, p.top); y <= Math.min(height, p.bottom); y++) filled[y] = true;
  // A part is a run of rows with something in each; the legend is not one.
  const parts: Piece[] = [];
  for (let y = 0; y < legendTop; y++) {
    if (!filled[y]) continue;
    let end = y;
    while (end + 1 < legendTop && filled[end + 1]) end++;
    const inside = pieces.filter((p) => p.top >= y && p.bottom <= end);
    parts.push({ top: y, bottom: end, left: Math.min(...inside.map((p) => p.left)), right: Math.max(...inside.map((p) => p.right)) });
    y = end;
  }
  if (parts.length < 2) return l;
  const place: Array<{ dx: number; dy: number }> = [];
  let x = 0;
  let y = parts[0]?.top ?? 0;
  let shelf = 0;
  for (const p of parts) {
    const w = p.right - p.left + 1;
    const h = p.bottom - p.top + 1;
    if (x > 0 && x + w > room) {
      y += shelf + 1;
      x = 0;
      shelf = 0;
    }
    place.push({ dx: x - p.left, dy: y - p.top });
    x += w + PART_GAP;
    shelf = Math.max(shelf, h);
  }
  const last = parts[parts.length - 1] as Piece;
  const bottom = y + shelf;
  if (bottom >= last.bottom + 1) return l;
  const partOf = (row: number): number => parts.findIndex((p) => row >= p.top && row <= p.bottom);
  const shift = (row: number): { dx: number; dy: number } => place[partOf(row)] ?? { dx: 0, dy: 0 };
  const lift = last.bottom + 1 - bottom;
  const width = Math.max(...parts.map((p, i) => p.right + (place[i]?.dx ?? 0) + 1), ...(l.legend?.items ?? []).map((item) => Math.ceil(item.captionX) + cellWidth(item.caption)));
  return {
    ...l,
    width,
    height: l.height - lift,
    lanes: l.lanes.map((lane) => ({ ...lane, x: 0, y: 0, w: width, h: l.height - lift })),
    nodes: l.nodes.map((n) => {
      const s = shift(Math.round(n.y));
      return { ...n, x: n.x + s.dx, y: n.y + s.dy };
    }),
    edges: l.edges.map((e) => {
      const box = edgeBox(e);
      if (box === undefined) return e;
      const s = shift(box.top);
      const move = <T extends { x: number; y: number }>(t: T): T => ({ ...t, x: t.x + s.dx, y: t.y + s.dy });
      return { ...e, points: e.points.map(move), ...(e.label ? { label: move(e.label) } : {}), ...(e.startLabel ? { startLabel: move(e.startLabel) } : {}), ...(e.endLabel ? { endLabel: move(e.endLabel) } : {}) };
    }),
    ...(l.legend ? { legend: { ...l.legend, y: l.legend.y - lift, w: Math.max(l.legend.w, width), base: { width, height: l.legend.base.height - lift }, items: l.legend.items.map((item) => ({ ...item, y: item.y - lift })) } } : {}),
  };
}

/**
 * Terminal drawings: columns that show only level lines passing through are taken out. A column stays when a box, a
 * label, or the end, a bend or an upright stretch of a line stands in it; the cell before the end of a line stays as
 * well, so that an arrowhead keeps a cell of line behind it. A drawing with named lanes keeps its columns.
 */
export function closeTextColumns(l: Layout): Layout {
  const width = Math.ceil(l.width);
  if (width <= 0 || l.clusters !== undefined || l.lanes.some((lane) => lane.label !== '')) return l;
  const kept = new Array<boolean>(width).fill(false);
  const used = new Array<boolean>(width).fill(false);
  const keep = (from: number, to: number): void => {
    for (let x = Math.max(0, Math.floor(from)); x <= Math.min(width - 1, Math.floor(to)); x++) kept[x] = true;
  };
  const nodes = new Map(l.nodes.map((n) => [n.id, n] as const));
  for (const n of l.nodes) keep(Math.round(n.x), Math.round(n.x) + Math.round(n.w) - 1);
  for (const item of l.legend?.items ?? []) keep(item.x, Math.ceil(item.captionX) + cellWidth(item.caption));
  for (const e of l.edges) {
    for (const t of [e.label, e.startLabel, e.endLabel]) if (t) keep(Math.round(t.x), Math.round(t.x) + Math.max(1, Math.round(t.w)) - 1);
    if (e.points.length < 2) continue;
    const corners = e.points.map((_, i) => cellOf(e, nodes, i));
    const cells: Array<[number, number]> = [corners[0] as [number, number]];
    for (let i = 0; i + 1 < corners.length; i++) {
      let [x, y] = corners[i] as [number, number];
      const [x2, y2] = corners[i + 1] as [number, number];
      const dx = Math.sign(x2 - x);
      const dy = dx === 0 ? Math.sign(y2 - y) : 0;
      if (dx !== 0 && y2 !== y) keep(Math.min(x, x2), Math.max(x, x2));
      while (x !== x2 || (dx === 0 && y !== y2)) {
        x += dx;
        y += dy;
        cells.push([x, y]);
      }
    }
    cells.forEach(([x, y], k) => {
      if (x >= 0 && x < width) used[x] = true;
      const before = cells[k - 1];
      const after = cells[k + 1];
      const passing = before !== undefined && after !== undefined && before[1] === y && after[1] === y && before[0] !== x && after[0] !== x;
      // The cell of line next to the marks at each end stays.
      if (!passing || k <= startCells(e) || k >= cells.length - 1 - Math.max(1, endCells(e))) keep(x, x);
    });
  }
  const gone: number[] = [];
  for (let x = 0; x < width; x++) if (used[x] && !kept[x]) gone.push(x);
  if (gone.length === 0) return l;
  const before = (v: number): number => gone.reduce((count, c) => count + (c < v ? 1 : 0), 0);
  const at = (v: number): number => v - before(Math.floor(v + 1e-9));
  const text = <T extends { x: number }>(t: T): T => ({ ...t, x: at(t.x) });
  return {
    ...l,
    width: l.width - gone.length,
    nodes: l.nodes.map(text),
    lanes: l.lanes.map((lane) => ({ ...lane, w: lane.w - gone.length })),
    edges: l.edges.map((e) => ({
      ...e,
      points: e.points.map(text),
      ...(e.label ? { label: text(e.label) } : {}),
      ...(e.startLabel ? { startLabel: text(e.startLabel) } : {}),
      ...(e.endLabel ? { endLabel: text(e.endLabel) } : {}),
    })),
    ...(l.legend ? { legend: { ...l.legend, base: { ...l.legend.base, width: l.legend.base.width - gone.length } } } : {}),
  };
}

/** The cells every line of the drawing runs through, as `x,y`. */
function lineCells(l: Layout): Set<string> {
  const nodes = new Map(l.nodes.map((n) => [n.id, n] as const));
  const out = new Set<string>();
  for (const e of l.edges) {
    if (e.invisible || e.points.length === 0) continue;
    const corners = e.points.map((_, i) => cellOf(e, nodes, i));
    let [x, y] = corners[0] as [number, number];
    out.add(`${x},${y}`);
    for (let i = 1; i < corners.length; i++) {
      const [x2, y2] = corners[i] as [number, number];
      const dx = Math.sign(x2 - x);
      const dy = dx === 0 ? Math.sign(y2 - y) : 0;
      if (dx === 0 && dy === 0) continue;
      while (x !== x2 || (dx === 0 && y !== y2)) {
        x += dx;
        y += dy;
        out.add(`${x},${y}`);
      }
      y = y2;
    }
  }
  return out;
}

/**
 * Terminal drawings: a label beside an upright stretch of its line stands where no line runs under its text. When
 * a line does, the label moves to another row of that stretch; when no row of it is free, the drawing gets one more
 * row there.
 */
export function clearUprightLabels(given: Layout): Layout {
  let l = given;
  for (let ei = 0; ei < l.edges.length; ei++) {
    const e = l.edges[ei] as LayoutEdge;
    const label = e.label;
    if (label === undefined || e.invisible || e.points.length < 2 || Math.round(label.h) !== 1) continue;
    const lx = Math.round(label.x);
    const lw = Math.round(label.w);
    const stretch = (now: Layout): { x: number; top: number; bottom: number } | undefined => {
      const nodes = new Map(now.nodes.map((n) => [n.id, n] as const));
      const edge = now.edges[ei] as LayoutEdge;
      const cells = edge.points.map((_, i) => cellOf(edge, nodes, i));
      const ly = Math.round((edge.label as { y: number }).y);
      let best: { x: number; top: number; bottom: number } | undefined;
      for (let i = 0; i + 1 < cells.length; i++) {
        const [x1, y1] = cells[i] as [number, number];
        const [x2, y2] = cells[i + 1] as [number, number];
        // A label on a level stretch of its own line is not beside an upright one.
        if (y1 === y2 && x1 !== x2 && ly === y1 && lx + lw - 1 >= Math.min(x1, x2) && lx <= Math.max(x1, x2)) return undefined;
        if (x1 !== x2) continue;
        const run = { x: x1, top: Math.min(y1, y2), bottom: Math.max(y1, y2) };
        if (ly >= run.top && ly <= run.bottom && run.x < lx) best = run;
      }
      return best;
    };
    const free = (now: Layout, row: number): boolean => {
      const taken = lineCells(now);
      for (let x = lx + 1; x < lx + lw - 1; x++) if (taken.has(`${x},${row}`)) return false;
      return !now.nodes.some((n) => row >= Math.round(n.y) && row < Math.round(n.y) + Math.round(n.h) && lx + lw - 1 > Math.round(n.x) && lx + 1 < Math.round(n.x) + Math.round(n.w)) &&
        !now.edges.some((o, k) => k !== ei && o.label !== undefined && Math.round(o.label.y) === row && lx < Math.round(o.label.x) + Math.round(o.label.w) && Math.round(o.label.x) < lx + lw);
    };
    const run = stretch(l);
    if (run === undefined || free(l, Math.round(label.y))) continue;
    const place = (now: Layout, s: { top: number; bottom: number }): Layout | undefined => {
      const middle = (s.top + s.bottom) / 2;
      const rows = Array.from({ length: s.bottom - s.top + 1 }, (_, k) => s.top + k).sort((a, b) => Math.abs(a - middle) - Math.abs(b - middle));
      const row = rows.find((r) => free(now, r));
      if (row === undefined) return undefined;
      return { ...now, edges: now.edges.map((o, k) => (k === ei && o.label ? { ...o, label: { ...o.label, y: row } } : o)) };
    };
    const moved = place(l, run);
    if (moved !== undefined) {
      l = moved;
      continue;
    }
    // One more row after the first cell of the stretch; the label takes a row of the longer stretch.
    const taller = grow(l, run.top + 0.5, 1, true);
    const again = stretch({ ...taller, edges: taller.edges.map((o, k) => (k === ei && o.label ? { ...o, label: { ...o.label, y: run.top } } : o)) });
    const placed = again === undefined ? undefined : place(taller, again);
    if (placed !== undefined) l = placed;
  }
  return l;
}
