import { cellWidth } from '../metrics.ts';
import type { EndLabel, Layout, LayoutEdge, LayoutNode } from '../types.ts';
import { renderTextLayout } from '../render/text.ts';
import { cellsOf } from './text-read.ts';
import { cellOf } from './text-tidy.ts';

/**
 * Terminal drawings: a text at an end of a line (a count such as `1` or `*`) that would be written over a label or
 * another such text moves to the nearest free cells beside the same end of its line, a blank away from any other text:
 * across the line first, then along it. A text with no such cells near its end stays where it is.
 */
export function endTextsClear(l: Layout): Layout {
  const ends = l.edges.flatMap((e, i) => (e.invisible === true ? [] : (['startLabel', 'endLabel'] as const).flatMap((which) => ((e[which]?.text ?? '') === '' ? [] : [{ i, which }]))));
  if (ends.length === 0) return l;
  const bare = l.edges.map((e) => {
    const { startLabel: _s, endLabel: _e, ...rest } = e;
    return rest;
  });
  const grid = cellsOf(renderTextLayout({ ...l, edges: bare }));
  const nodes = new Map(l.nodes.map((n) => [n.id, n] as const));
  const width = Math.ceil(l.width);
  const height = Math.ceil(l.height);
  const taken = new Set<string>();
  const inBox = (x: number, y: number): boolean => l.nodes.some((n) => x >= Math.round(n.x) && x < Math.round(n.x) + Math.round(n.w) && y >= Math.round(n.y) && y < Math.round(n.y) + Math.round(n.h));
  // The cells of the text of every label and a cell on either side of it: a text set there would read as one word with the label.
  const words = new Set<string>();
  const letters = new Set<string>();
  for (const e of l.edges) {
    const t = e.label;
    if (t === undefined || e.invisible === true) continue;
    const rows = t.lines ?? [t.text];
    const top = Math.round(t.y) + Math.floor((Math.round(t.h) - rows.length) / 2);
    rows.forEach((row, k) => {
      const tw = cellWidth(row);
      const x0 = Math.round(t.x) + Math.floor((Math.round(t.w) - tw) / 2);
      for (let cx = x0 - 1; cx <= x0 + tw; cx++) words.add(`${cx},${top + k}`);
      for (let cx = x0; cx < x0 + tw; cx++) letters.add(`${cx},${top + k}`);
    });
  }
  const free = (x: number, y: number, w: number): boolean =>
    x >= 0 && x + w <= width && y >= 0 && y < height && Array.from({ length: w }, (_, k) => x + k).every((cx) => (grid[y]?.[cx] ?? ' ') === ' ' && !inBox(cx, y) && !taken.has(`${cx},${y}`));
  // A text that moves leaves a blank between it and the text of a label or of another end.
  const apart = (x: number, y: number, w: number): boolean =>
    free(x, y, w) && Array.from({ length: w }, (_, k) => x + k).every((cx) => !words.has(`${cx},${y}`)) && !taken.has(`${x - 1},${y}`) && !taken.has(`${x + w},${y}`);
  const moved = new Map<string, EndLabel>();
  for (const { i, which } of ends) {
    const e = l.edges[i] as LayoutEdge;
    const t = e[which] as EndLabel;
    const [x, y, w] = [Math.round(t.x), Math.round(t.y), cellWidth(t.text)];
    // Only a text that would be written over a label or another such text moves: over a line, it stands as it did.
    const over = Array.from({ length: w }, (_, k) => `${x + k},${y}`).some((key) => letters.has(key) || taken.has(key));
    let spot: readonly [number, number] | undefined = !over || free(x, y, w) ? [x, y] : undefined;
    if (spot === undefined) {
      const k = which === 'startLabel' ? 0 : e.points.length - 1;
      const [cx, cy] = cellOf(e, nodes, k);
      const [nx, ny] = cellOf(e, nodes, which === 'startLabel' ? Math.min(1, e.points.length - 1) : Math.max(0, e.points.length - 2));
      const level = ny === cy;
      const along = level ? Math.sign(nx - cx) : Math.sign(ny - cy);
      // Across the line beside its end, then a cell or two further along it.
      const tries = [0, 1, 2].flatMap((step) =>
        level
          ? [-1, 1].map((side) => [along > 0 ? cx + step : cx - w + 1 - step, cy + side] as const)
          : [1, -1].map((side) => [side > 0 ? cx + 1 : cx - w, cy + along * step] as const),
      );
      spot = tries.find(([tx, ty]) => apart(tx, ty, w));
    }
    if (spot === undefined) continue;
    for (let k = 0; k < w; k++) taken.add(`${spot[0] + k},${spot[1]}`);
    if (spot[0] !== x || spot[1] !== y) moved.set(`${i}|${which}`, { ...t, x: spot[0], y: spot[1] });
  }
  if (moved.size === 0) return l;
  return {
    ...l,
    edges: l.edges.map((e, i) => {
      const [s, t] = [moved.get(`${i}|startLabel`), moved.get(`${i}|endLabel`)];
      return s === undefined && t === undefined ? e : { ...e, ...(s === undefined ? {} : { startLabel: s }), ...(t === undefined ? {} : { endLabel: t }) };
    }),
  };
}
