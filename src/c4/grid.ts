import { layeredRuler } from '../layered/index.ts';
import { refineLabels } from '../layered/label-spot.ts';
import { keepOffBoxes, placeNames, withinCanvas } from '../layout/clusters.ts';
import type { LayoutOptions } from '../layout/index.ts';
import { labelSize } from '../layout/labels.ts';
import { withLegend } from '../layout/legend.ts';
import type { Ruler } from '../metrics.ts';
import type { Graph, Layout, LayoutCluster, LayoutNode } from '../types.ts';
import type { Cell, CellRect } from './grid-place.ts';
import { placeCells } from './grid-place.ts';
import { emptySpec, gridRows } from './grid-rows.ts';
import { drawLines } from './grid-lines.ts';

/** Gaps between cells: across, down, and around the drawing. */
const GAP_X = 32;
const GAP_Y = 64;
const MARGIN = 24;
/** Room a label keeps from the boxes on both sides of the gap it stands in. */
const LABEL_ROOM = 16;
/** A cluster's border from what stands in it, and the room of its name (two lines) on top. */
const PAD = 24;
const NAME = 48;
/** Where a name starts from the left side of its box, what it keeps clear of a line, and how far the columns move when a line would cross it. */
const NAME_INSET = 16;
const NAME_CLEAR = 12;
const NAME_SHIFT = 24;
/**
 * Lays out a C4 drawing on one grid: every element in a cell of the size every element shares, every boundary on a range
 * of cells, gaps that grow only where a border or a label passes. Lines between elements of one column or one row run
 * straight from middle to middle; the others leave and enter at the middle of a face, or spread on it 64 apart (closer
 * on a short face) and symmetric about the middle or beside the straight line that holds it.
 */
export function layoutC4Grid(graph: Graph, ruler: Ruler, opts: LayoutOptions): Layout {
  const spec = graph.grid ?? emptySpec(graph);
  const rows = gridRows(graph, spec);
  const grid = placeCells(graph, spec, rows);
  const bw = Math.max(1, ...graph.nodes.map((n) => n.box?.w ?? 0));
  const bh = Math.max(1, ...graph.nodes.map((n) => n.box?.h ?? 0));
  const clusters = graph.clusters ?? [];
  const parentOf = new Map(clusters.map((c) => [c.id, c.parent]));
  const kidsOf = (id: string): string[] => clusters.filter((c) => c.parent === id && grid.rect.has(c.id)).map((c) => c.id);
  const nodeIds = new Set(graph.nodes.map((n) => n.id));
  const cellOf = (id: string): Cell | undefined => grid.cell.get(id);
  const holds = (cid: string, id: string): boolean => {
    for (let at = graph.nodes.find((n) => n.id === id)?.cluster ?? parentOf.get(id); at !== undefined; at = parentOf.get(at)) if (at === cid) return true;
    return false;
  };
  const nameWidth = (label: string): number => Math.max(...label.split(' · ').map((l) => ruler.textWidth(l, 'lane')));

  // A line that comes into the first cell of a boundary from above crosses its name: the columns inside move right.
  const shiftOf = new Map<string, number>();
  for (const c of clusters) {
    const q = grid.rect.get(c.id);
    if (q === undefined) continue;
    const crossed = graph.edges.some((e) => {
      const [a, b] = [cellOf(e.from), cellOf(e.to)];
      if (a === undefined || b === undefined) return false;
      return ([[e.from, a, e.to, b], [e.to, b, e.from, a]] as const).some(([id, p, other, o]) => p.r === q.r0 && p.c === q.c0 && holds(c.id, id) && !holds(c.id, other) && o.r < p.r);
    });
    shiftOf.set(c.id, crossed && NAME_INSET + nameWidth(c.label) + NAME_CLEAR > PAD + bw / 2 ? NAME_SHIFT : 0);
  }
  const extraRight = new Map<string, number>();
  for (const c of clusters) {
    const q = grid.rect.get(c.id);
    if (q === undefined) continue;
    const span = (q.c1 - q.c0 + 1) * bw + (q.c1 - q.c0) * GAP_X + 2 * PAD;
    extraRight.set(c.id, Math.max(0, NAME_INSET + nameWidth(c.label) + NAME_INSET - span));
  }
  const inset = (id: string, side: 'l' | 'r' | 't' | 'b'): number => {
    const q = grid.rect.get(id) as CellRect;
    const own = side === 'l' ? PAD + (shiftOf.get(id) ?? 0) : side === 'r' ? PAD + (extraRight.get(id) ?? 0) : side === 't' ? PAD + NAME : PAD;
    const same = kidsOf(id).filter((k) => {
      const p = grid.rect.get(k) as CellRect;
      return side === 'l' ? p.c0 === q.c0 : side === 'r' ? p.c1 === q.c1 : side === 't' ? p.r0 === q.r0 : p.r1 === q.r1;
    });
    return own + Math.max(0, ...same.map((k) => inset(k, side)));
  };
  const rects = [...grid.rect].map(([id, q]) => ({ id, q, l: inset(id, 'l'), r: inset(id, 'r'), t: inset(id, 't'), b: inset(id, 'b') }));

  const labelOf = (i: number): { w: number; h: number } | undefined => {
    const text = graph.edges[i]?.label;
    return text === undefined || text === '' ? undefined : labelSize(text, layeredRuler(ruler));
  };
  // Gaps: the border insets that meet in a gap, in the row or column where they meet most.
  const colGap: number[] = [];
  for (let k = 0; k <= grid.columns; k++) {
    let base = k === 0 || k === grid.columns ? MARGIN : GAP_X;
    graph.edges.forEach((e, i) => {
      const [a, b] = [cellOf(e.from), cellOf(e.to)];
      const size = labelOf(i);
      if (a && b && size && a.r === b.r && Math.max(a.c, b.c) === k && Math.abs(a.c - b.c) === 1) base = Math.max(base, size.w + 2 * LABEL_ROOM);
    });
    let most = 0;
    for (let r = 0; r < grid.rows; r++) {
      const left = Math.max(0, ...rects.filter((x) => x.q.c1 === k - 1 && x.q.r0 <= r && r <= x.q.r1).map((x) => x.r));
      const right = Math.max(0, ...rects.filter((x) => x.q.c0 === k && x.q.r0 <= r && r <= x.q.r1).map((x) => x.l));
      most = Math.max(most, left + right);
    }
    colGap.push(base + most);
  }
  const rowGap: number[] = [];
  for (let k = 0; k <= grid.rows; k++) {
    let base = k === 0 || k === grid.rows ? MARGIN : GAP_Y;
    graph.edges.forEach((e, i) => {
      const [a, b] = [cellOf(e.from), cellOf(e.to)];
      const size = labelOf(i);
      if (a && b && size && a.c === b.c && Math.max(a.r, b.r) === k && Math.abs(a.r - b.r) === 1) base = Math.max(base, size.h + 2 * LABEL_ROOM);
    });
    let most = 0;
    for (let c = 0; c < grid.columns; c++) {
      const above = Math.max(0, ...rects.filter((x) => x.q.r1 === k - 1 && x.q.c0 <= c && c <= x.q.c1).map((x) => x.b));
      const below = Math.max(0, ...rects.filter((x) => x.q.r0 === k && x.q.c0 <= c && c <= x.q.c1).map((x) => x.t));
      most = Math.max(most, above + below);
    }
    rowGap.push(base + most);
  }
  const colX: number[] = [];
  for (let c = 0, x = 0; c < grid.columns; c++) {
    x += (colGap[c] as number) + (c === 0 ? 0 : bw);
    colX.push(x);
  }
  const rowY: number[] = [];
  for (let r = 0, y = 0; r < grid.rows; r++) {
    y += (rowGap[r] as number) + (r === 0 ? 0 : bh);
    rowY.push(y);
  }
  const width = (colX.at(-1) ?? 0) + bw + (colGap.at(-1) ?? MARGIN);
  const height = (rowY.at(-1) ?? 0) + bh + (rowGap.at(-1) ?? MARGIN);

  const nodes: LayoutNode[] = graph.nodes.map((n) => {
    const p = cellOf(n.id) as Cell;
    return {
      id: n.id,
      lane: n.lane,
      rank: p.r,
      span: 1,
      row: p.c,
      x: colX[p.c] as number,
      y: rowY[p.r] as number,
      w: bw,
      h: bh,
      title: n.title,
      lines: n.lines,
      shape: n.shape,
      ...(n.compartments === undefined ? {} : { compartments: n.compartments }),
      ...(n.cluster === undefined ? {} : { cluster: n.cluster }),
    };
  });
  const depthOf = (id: string): number => {
    let d = 1;
    for (let at = parentOf.get(id); at !== undefined; at = parentOf.get(at)) d++;
    return d;
  };
  const order = new Map(spec.order.map((id, i) => [id, i] as const));
  const laidClusters: LayoutCluster[] = rects
    .map(({ id, q, l, r, t, b }): LayoutCluster => {
      const c = clusters.find((k) => k.id === id);
      const x = (colX[q.c0] as number) - l;
      const y = (rowY[q.r0] as number) - t;
      return { id, label: c?.label ?? id, x, y, w: (colX[q.c1] as number) + bw + r - x, h: (rowY[q.r1] as number) + bh + b - y, depth: depthOf(id), ...(c?.style === undefined ? {} : { style: c.style }) };
    })
    .sort((a, b) => a.depth - b.depth || (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));

  const { edges, diagnostics } = drawLines({ graph, nodes, clusters: laidClusters, width, height, holds, labelOf });

  const laid: Layout = { width, height, direction: 'TD', laneAxis: 'across', lanes: [], clusters: laidClusters, nodes, edges, diagnostics };
  const every = new Set(laidClusters.map((c) => c.id));
  const subtitled = new Set(clusters.filter((c) => c.subtitled === true).map((c) => c.id));
  const named = { ...laid, clusters: placeNames(laid, ruler, every, subtitled).clusters };
  const refined = refineLabels(named, layeredRuler(ruler), new Set(edges.map((_, i) => i)), keepOffBoxes(named.clusters ?? [], true));
  const grown = withinCanvas({ ...refined, clusters: placeNames(refined, ruler, every, subtitled).clusters });
  return withLegend(grown, ruler, opts.legend);
}
