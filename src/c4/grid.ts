import { layeredRuler } from '../layered/index.ts';
import { refineLabels } from '../layered/label-spot.ts';
import { keepOffBoxes, placeNames, withinCanvas } from '../layout/clusters.ts';
import type { LayoutOptions } from '../layout/index.ts';
import { labelSize } from '../layout/labels.ts';
import { withLegend } from '../layout/legend.ts';
import type { Ruler } from '../metrics.ts';
import type { Graph, Layout, LayoutCluster, LayoutNode, Point } from '../types.ts';
import type { Cell, CellRect, GridCells } from './grid-place.ts';
import { placeCells } from './grid-place.ts';
import { emptySpec, gridRows } from './grid-rows.ts';
import { drawLines } from './grid-lines.ts';
import { measureNodes } from '../layout/place.ts';
import { ACTOR_H, ACTOR_W } from '../layout/records.ts';
import type { Rect } from './grid-lines.ts';

/** Gaps between cells: across, down, and around the drawing. */
const GAP_X = 32;
const GAP_Y = 64;
const MARGIN = 24;
/** What stands between two borders that face each other, and between a border and a box. */
const BORDER_GAP = 24;
const BOX_GAP = 48;
/** Room a label keeps from the boxes on both sides of the gap it stands in. */
const LABEL_ROOM = 16;
/** What two labels of one pair keep between them. */
const LABEL_GAP = 8;
/** How far the loop of a box with itself stands out of it. */
const LOOP = 24;
/** What a bent line runs out of a face before it turns, and the distance between two lanes of a gap. */
const TURN = 16;
const LANE = 16;
/** A cluster's border from what stands in it, and the room of its name (two lines) on top. */
const PAD = 24;
const NAME = 48;
/** Where a name starts from the left side of its box, what it keeps clear of a line, and how far the columns move when a line would cross it. */
const NAME_INSET = 16;
const NAME_CLEAR = 12;
const NAME_SHIFT = 24;
/** Where the text of a name starts below the top border. */
const NAME_TOP = 12;

/**
 * Lays out a C4 drawing on one grid: every element in a cell of the size every element shares, every boundary on a range
 * of cells, gaps that grow only where a border or a label passes. Lines between elements of one column or one row run
 * straight from middle to middle; the others leave and enter at the middle of a face, or spread on it 64 apart (closer
 * on a short face) and symmetric about the middle or beside the straight line that holds it.
 */
export function layoutC4Grid(given: Graph, ruler: Ruler, opts: LayoutOptions): Layout {
  // Boxes not measured yet (any type but C4) take the size the layered engine measures, the widest and the highest of
  // them for all; an actor keeps the figure's own size and stands in the middle of its cell.
  const own = new Map<string, { w: number; h: number }>();
  let graph = given;
  if (given.nodes.some((n) => n.box === undefined)) {
    const size = measureNodes(given.nodes, [{ label: '' }], layeredRuler(ruler), given.direction !== 'LR');
    const boxes = given.nodes.map((n, i) => ({ n, w: size.w[i] as number, h: size.h[i] as number })).filter((b) => b.n.shape !== 'actor');
    const box = { w: Math.max(ACTOR_W, ...boxes.map((b) => b.w)), h: Math.max(ACTOR_H, ...boxes.map((b) => b.h)) };
    // Every other box keeps its own height: a row is as high as its highest box, the boxes of a row share their top.
    // Measured across, each box keeps the height of its own content.
    const tall = measureNodes(given.nodes, [{ label: '' }], layeredRuler(ruler), false).h;
    given.nodes.forEach((n, i) => own.set(n.id, n.shape === 'actor' ? { w: ACTOR_W, h: ACTOR_H } : { w: box.w, h: Math.max(tall[i] as number, ACTOR_H) }));
    graph = { ...given, nodes: given.nodes.map((n) => ({ ...n, box })) };
  }
  const spec = graph.grid ?? emptySpec(graph);
  const rows = gridRows(graph, spec);
  // Cells given outright stand as they are; otherwise a drawing that reads from left to right stands its rows as columns.
  const given_ = spec.cells;
  const grid: GridCells = given_ !== undefined ? givenCells(given_) : graph.direction === 'LR' ? transposed(placeCells(graph, spec, rows)) : placeCells(graph, spec, rows);
  const bw = Math.max(1, ...graph.nodes.map((n) => n.box?.w ?? 0));
  const bh = Math.max(1, ...graph.nodes.map((n) => n.box?.h ?? 0));
  const rowH = Array.from({ length: grid.rows }, (_, r) => {
    const here = graph.nodes.filter((n) => grid.cell.get(n.id)?.r === r).map((n) => own.get(n.id)?.h ?? bh);
    return here.length === 0 ? bh : Math.max(...here);
  });
  const clusters = graph.clusters ?? [];
  const parentOf = new Map(clusters.map((c) => [c.id, c.parent]));
  const kidsOf = (id: string): string[] => clusters.filter((c) => c.parent === id && grid.rect.has(c.id)).map((c) => c.id);
  const cellOf = (id: string): Cell | undefined => grid.cell.get(id);
  const holds = (cid: string, id: string): boolean => {
    for (let at = graph.nodes.find((n) => n.id === id)?.cluster ?? parentOf.get(id); at !== undefined; at = parentOf.get(at)) if (at === cid) return true;
    return false;
  };
  const nameWidth = (label: string): number => Math.max(...label.split(' · ').map((l) => ruler.textWidth(l, 'lane')));

  // A line from a box to a cluster that holds it runs out to the border on the right, then the left, the bottom and the
  // top of that box: the cluster keeps the room of its label on that side.
  const inner = new Map<string, number>();
  const outward = new Map<string, number>();
  graph.edges.forEach((e) => {
    const outer = holds(e.to, e.from) ? e.to : holds(e.from, e.to) ? e.from : undefined;
    if (outer === undefined) return;
    const own = outer === e.to ? e.from : e.to;
    const n = outward.get(own) ?? 0;
    outward.set(own, n + 1);
    const text = e.label;
    if (text === undefined || text === '') return;
    const size = chipSize(text, ruler);
    const side = (['r', 'l', 'b', 't'] as const)[n % 4] as 'r' | 'l' | 'b' | 't';
    const k = `${outer}:${side}`;
    inner.set(k, Math.max(inner.get(k) ?? 0, (side === 'r' || side === 'l' ? size.w : size.h) + 2 * LABEL_ROOM));
  });
  /**
   * The drawing with the columns inside each cluster moved right by `shiftOf`, and its lines, kept off the names of the
   * clusters when `names` is set.
   */
  const drawn = (shiftOf: ReadonlyMap<string, number>, names: boolean, wider: ReadonlyMap<number, number> = new Map()) => {
    // The width a long name needs beyond what the cluster holds, given half to each side so what it holds stays in the middle.
    const extraRight = new Map<string, number>();
    for (const c of clusters) {
      const q = grid.rect.get(c.id);
      if (q === undefined) continue;
      const span = (q.c1 - q.c0 + 1) * bw + (q.c1 - q.c0) * GAP_X + 2 * PAD;
      extraRight.set(c.id, Math.max(0, NAME_INSET + nameWidth(c.label) + NAME_INSET - span));
    }
    const inset = (id: string, side: 'l' | 'r' | 't' | 'b'): number => {
      const q = grid.rect.get(id) as CellRect;
      const own = (side === 'l' ? PAD + (shiftOf.get(id) ?? 0) + (extraRight.get(id) ?? 0) / 2 : side === 'r' ? PAD + (extraRight.get(id) ?? 0) / 2 : side === 't' ? PAD + NAME : PAD) + (inner.get(`${id}:${side}`) ?? 0);
      const same = kidsOf(id).filter((k) => {
        const p = grid.rect.get(k) as CellRect;
        return side === 'l' ? p.c0 === q.c0 : side === 'r' ? p.c1 === q.c1 : side === 't' ? p.r0 === q.r0 : p.r1 === q.r1;
      });
      // A child that does not start in the first column stands beside the name of its parent, not under it.
      const nameFits = NAME_INSET + nameWidth(clusters.find((c) => c.id === id)?.label ?? id) + NAME_CLEAR <= PAD + bw;
      const ownFor = (k: string): number => (side === 't' && nameFits && (grid.rect.get(k) as CellRect).c0 > q.c0 ? own - NAME : own);
      return Math.max(own, ...same.map((k) => ownFor(k) + inset(k, side)));
    };
    const rects = [...grid.rect].map(([id, q]) => ({ id, q, l: inset(id, 'l'), r: inset(id, 'r'), t: inset(id, 't'), b: inset(id, 'b') }));

    const labelOf = (i: number): { w: number; h: number } | undefined => {
      const text = graph.edges[i]?.label;
      return text === undefined || text === '' ? undefined : chipSize(text, ruler);
    };
    /**
     * The room the labels of the straight lines across gap `k` need: the lines between two boxes side by side (`across`,
     * gap between columns) or one over the other (`down`), a cluster counting with the cells it covers. The labels of
     * the lines of one pair stand one after the other along the gap.
     */
    const labelRoom = (axis: 'across' | 'down', k: number): number => {
      const rangeOf = (id: string): CellRect | undefined => {
        const p = cellOf(id);
        return p === undefined ? grid.rect.get(id) : { r0: p.r, r1: p.r, c0: p.c, c1: p.c };
      };
      const sum = new Map<string, number[]>();
      let loops = 0;
      graph.edges.forEach((e, i) => {
        const [a, b] = [rangeOf(e.from), rangeOf(e.to)];
        const size = labelOf(i);
        // The loop of a box with itself stands right of it, its label beside the loop.
        if (e.from === e.to && axis === 'across' && a !== undefined && a.c1 + 1 === k) loops = Math.max(loops, LOOP + LABEL_GAP + (size?.w ?? 0) + LABEL_ROOM);
        if (a === undefined || b === undefined || size === undefined || holds(e.from, e.to) || holds(e.to, e.from)) return;
        const level = axis === 'across' ? a.r0 <= b.r1 && b.r0 <= a.r1 : a.c0 <= b.c1 && b.c0 <= a.c1;
        const [lo, hi] = axis === 'across' ? (a.c1 < b.c0 ? [a.c1, b.c0] : [b.c1, a.c0]) : a.r1 < b.r0 ? [a.r1, b.r0] : [b.r1, a.r0];
        if (!level || hi !== lo + 1 || hi !== k) return;
        const pair = [e.from, e.to].sort().join('\u0000');
        sum.set(pair, [...(sum.get(pair) ?? []), axis === 'across' ? size.w : size.h]);
      });
      return Math.max(loops, ...[...sum.values()].map((l) => l.reduce((t, v) => t + v, 0) + (l.length - 1) * LABEL_GAP + 2 * LABEL_ROOM));
    };
    // Gaps: the border insets that meet in a gap, in the row or column where they meet most.
    const colGap: number[] = [];
    for (let k = 0; k <= grid.columns; k++) {
      let base = k === 0 || k === grid.columns ? MARGIN : GAP_X;
      // What the lines need between the innermost borders: their labels.
      const need = labelRoom('across', k);
      base = Math.max(base, need);
      let most = 0;
      let mostGap = 0;
      for (let r = 0; r < grid.rows; r++) {
        const left = Math.max(0, ...rects.filter((x) => x.q.c1 === k - 1 && x.q.r0 <= r && r <= x.q.r1).map((x) => x.r));
        const right = Math.max(0, ...rects.filter((x) => x.q.c0 === k && x.q.r0 <= r && r <= x.q.r1).map((x) => x.l));
        if (left + right > most) mostGap = left > 0 && right > 0 ? BORDER_GAP : left + right > 0 ? BOX_GAP : 0;
        most = Math.max(most, left + right);
      }
      colGap.push((k === 0 || k === grid.columns ? base + most : Math.max(base, most + Math.max(mostGap, need))) + (wider.get(k) ?? 0));
    }
    const rowGap: number[] = [];
    for (let k = 0; k <= grid.rows; k++) {
      let base = k === 0 || k === grid.rows ? MARGIN : GAP_Y;
      // A bent line turns in the gap under its upper end, half of them to each side: each keeps a lane of its own,
      // beside the labels that stand in the gap.
      const turning = graph.edges.filter((e) => {
        const [a, b] = [cellOf(e.from), cellOf(e.to)];
        return a !== undefined && b !== undefined && a.c !== b.c && a.r !== b.r && Math.min(a.r, b.r) === k - 1;
      }).length;
      const labels = labelRoom('down', k);
      // What the lines need between the innermost borders: their labels, and the lanes of the lines that turn here.
      const need = turning > 0 ? Math.max(labels, 2 * TURN + LANE * Math.ceil(turning / 2) + (labels > 0 ? labels - 2 * LABEL_ROOM + LABEL_GAP : 0)) : labels;
      base = Math.max(base, need);
      let most = 0;
      let mostGap = 0;
      for (let c = 0; c < grid.columns; c++) {
        const above = Math.max(0, ...rects.filter((x) => x.q.r1 === k - 1 && x.q.c0 <= c && c <= x.q.c1).map((x) => x.b));
        const below = Math.max(0, ...rects.filter((x) => x.q.r0 === k && x.q.c0 <= c && c <= x.q.c1).map((x) => x.t));
        if (above + below > most) mostGap = above > 0 && below > 0 ? BORDER_GAP : above + below > 0 ? BOX_GAP : 0;
        most = Math.max(most, above + below);
      }
      rowGap.push(k === 0 || k === grid.rows ? base + most : Math.max(base, most + Math.max(mostGap, need)));
    }
    const colX: number[] = [];
    for (let c = 0, x = 0; c < grid.columns; c++) {
      x += (colGap[c] as number) + (c === 0 ? 0 : bw);
      colX.push(x);
    }
    const rowY: number[] = [];
    for (let r = 0, y = 0; r < grid.rows; r++) {
      y += (rowGap[r] as number) + (r === 0 ? 0 : (rowH[r - 1] as number));
      rowY.push(y);
    }
    const width = (colX.at(-1) ?? 0) + bw + (colGap.at(-1) ?? MARGIN);
    const height = (rowY.at(-1) ?? 0) + (rowH.at(-1) ?? bh) + (rowGap.at(-1) ?? MARGIN);

    const nodes: LayoutNode[] = graph.nodes.map((n) => {
      const p = cellOf(n.id) as Cell;
      return {
        id: n.id,
        lane: n.lane,
        rank: p.r,
        span: 1,
        row: p.c,
        // A box of its own size (an actor) stands in the middle of its cell.
        x: (colX[p.c] as number) + (bw - (own.get(n.id)?.w ?? bw)) / 2,
        y: (rowY[p.r] as number) + (spec.shift?.[n.id] ?? 0) * ((rowY[p.r + 1] ?? (rowY[p.r] as number) + bh + GAP_Y) - (rowY[p.r] as number)) + (n.shape === 'actor' ? ((rowH[p.r] as number) - ACTOR_H) / 2 : 0),
        w: own.get(n.id)?.w ?? bw,
        h: own.get(n.id)?.h ?? bh,
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
    const placedClusters: LayoutCluster[] = rects
      .map(({ id, q, l, r, t, b }): LayoutCluster => {
        const c = clusters.find((k) => k.id === id);
        const x = (colX[q.c0] as number) - l;
        const y = (rowY[q.r0] as number) - t;
        return { id, label: c?.label ?? id, x, y, w: (colX[q.c1] as number) + bw + r - x, h: (rowY[q.r1] as number) + (rowH[q.r1] as number) + b - y, depth: depthOf(id), ...(c?.style === undefined ? {} : { style: c.style }) };
      })
      .sort((a, b) => a.depth - b.depth || (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    const laidClusters = alignSiblings(placedClusters, (id) => grid.rect.get(id) as CellRect, (id) => parentOf.get(id), nodes.map((n) => ({ x: n.x, y: n.y, w: n.w, h: n.h, cluster: n.cluster })));

    // The name stands in the top left corner, two lines high.
    const nameOf = (id: string): { x: number; y: number; w: number; h: number } | undefined => {
      const c = laidClusters.find((k) => k.id === id);
      return c === undefined ? undefined : { x: c.x + NAME_INSET, y: c.y + NAME_TOP, w: nameWidth(c.label), h: NAME - NAME_TOP };
    };
    const drawnLines = drawLines({ graph, nodes, clusters: laidClusters, width, height, holds, labelOf, ...(names ? { nameOf } : {}) });
    const { diagnostics } = drawnLines;
    const edges = trunked(graph, nodes, drawnLines.edges);
    return { width, height, nodes, laidClusters, colX, edges, diagnostics };
  };
  // A line down the first column of a cluster that runs over its name moves the columns inside right, as far as the name needs.
  const first = drawn(new Map(), false);
  const shiftOf = new Map<string, number>();
  for (const c of first.laidClusters) {
    const q = grid.rect.get(c.id) as CellRect;
    const [x0, x1] = [first.colX[q.c0] as number, (first.colX[q.c0] as number) + bw];
    const reach = c.x + NAME_INSET + nameWidth(c.label) + NAME_CLEAR;
    let need = 0;
    for (const e of first.edges) {
      for (const [a, b] of e.points.slice(1).map((p, i) => [e.points[i] as Point, p] as const)) {
        if (Math.abs(a.x - b.x) > 1e-6 || a.x < x0 || a.x > x1 || a.x < c.x + NAME_INSET - NAME_CLEAR || a.x > reach) continue;
        if (Math.min(a.y, b.y) < c.y + PAD + NAME && Math.max(a.y, b.y) > c.y) need = Math.max(need, NAME_SHIFT, reach - a.x);
      }
    }
    if (need > 0) shiftOf.set(c.id, need);
  }
  const finish = (wider: ReadonlyMap<number, number>): { layout: Layout; colX: number[] } => {
    const { width, height, nodes, laidClusters, edges, diagnostics, colX } = drawn(shiftOf, true, wider);
    const laid: Layout = { width, height, direction: 'TD', laneAxis: 'across', lanes: [], clusters: laidClusters, nodes, edges, diagnostics };
    const every = new Set(laidClusters.map((c) => c.id));
    const subtitled = new Set(clusters.filter((c) => c.subtitled === true).map((c) => c.id));
    const named = { ...laid, clusters: placeNames(laid, ruler, every, subtitled).clusters };
    const avoid = keepOffBoxes(named.clusters ?? [], true);
    const refined = alongGap(centreLabels(refineLabels(named, layeredRuler(ruler), new Set(edges.map((_, i) => i)), avoid), avoid));
    return { layout: { ...refined, clusters: placeNames(refined, ruler, every, subtitled).clusters }, colX };
  };
  // A label left on another line, in a gap between two columns, widens that gap by its width once.
  const once = finish(new Map());
  const wider = new Map<number, number>();
  for (const e of once.layout.edges) {
    const l = e.label;
    if (l === undefined || !once.layout.edges.some((o) => o !== e && o.points.slice(1).some((q, i) => crossesRect(o.points[i] as Point, q, l)))) continue;
    const cx = l.x + l.w / 2;
    for (let k = 1; k < once.colX.length; k++) {
      if (cx > (once.colX[k - 1] as number) + bw && cx < (once.colX[k] as number)) wider.set(k, Math.max(wider.get(k) ?? 0, l.w + 2 * LABEL_GAP));
    }
  }
  const grown = withinCanvas(wider.size === 0 ? once.layout : finish(wider).layout);
  return withLegend(grown, ruler, opts.legend);
}

/**
 * The labels of two or more straight lines side by side between one pair stand one after the other along the stretch
 * the lines share, each on its own line, so that they do not cover each other. The label of a loop stands right of it.
 */
function alongGap(layout: Layout): Layout {
  const groups = new Map<string, number[]>();
  layout.edges.forEach((e, i) => {
    const [p, q] = e.points;
    if (e.label === undefined || e.points.length !== 2 || p === undefined || q === undefined) return;
    const k = [e.from, e.to].sort().join('\u0000') + (p.x === q.x ? '|' : '-');
    groups.set(k, [...(groups.get(k) ?? []), i]);
  });
  const edges = layout.edges.map((e) => {
    if (e.from !== e.to || e.label === undefined || e.points.length < 2) return e;
    const x = Math.max(...e.points.map((p) => p.x));
    const y = (Math.min(...e.points.map((p) => p.y)) + Math.max(...e.points.map((p) => p.y))) / 2;
    return { ...e, label: { ...e.label, x: x + LABEL_GAP, y: y - e.label.h / 2 } };
  });
  for (const [k, list] of groups) {
    if (list.length < 2) continue;
    const down = k.endsWith('|');
    const lines = list.map((i) => edges[i] as Layout['edges'][number]);
    const lo = Math.max(...lines.map((e) => Math.min(...e.points.map((p) => (down ? p.y : p.x)))));
    const hi = Math.min(...lines.map((e) => Math.max(...e.points.map((p) => (down ? p.y : p.x)))));
    const sizes = lines.map((e) => (down ? (e.label as { h: number }).h : (e.label as { w: number }).w));
    const total = sizes.reduce((t, v) => t + v, 0) + (lines.length - 1) * LABEL_GAP;
    const order = list.map((_, n) => n).sort((a, b) => ((lines[a] as Layout['edges'][number]).points[0] as Point)[down ? 'x' : 'y'] - ((lines[b] as Layout['edges'][number]).points[0] as Point)[down ? 'x' : 'y']);
    let at = (lo + hi) / 2 - total / 2;
    for (const n of order) {
      const e = lines[n] as Layout['edges'][number];
      const label = e.label as NonNullable<Layout['edges'][number]['label']>;
      const p = e.points[0] as Point;
      edges[list[n] as number] = { ...e, label: down ? { ...label, x: p.x - label.w / 2, y: at } : { ...label, x: at, y: p.y - label.h / 2 } };
      at += (sizes[n] as number) + LABEL_GAP;
    }
  }
  return { ...layout, edges };
}

/**
 * A label stands across its line, the line through its middle, in the middle of a free gap the line crosses: the first
 * such gap from the start of the line, over all its runs in order, that is deep enough for the label and where the label
 * touches no box, border, name, other line or other label. The gaps are cut by the boxes, the borders and the names of
 * the clusters, the runs of the other lines and the other labels, so labels of one gap stand at one level. A label with
 * no such gap stays where it was put. The labels are placed twice, so that each sees the others where they end up.
 */
function centreLabels(layout: Layout, avoid: readonly Rect[]): Layout {
  const rects: Rect[] = [...layout.nodes, ...(layout.clusters ?? []), ...(layout.clusters ?? []).flatMap((c) => (c.name ? [c.name] : []))];
  const solid: Rect[] = [...layout.nodes, ...avoid];
  const segsOf = (pts: readonly Point[]): Array<[Point, Point]> => pts.slice(1).map((q, i) => [pts[i] as Point, q]);
  const meets = (a: Rect, b: Rect): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  // Every label as it stands now; a label moved takes its new place here.
  const placed: Array<Rect | undefined> = layout.edges.map((e) => e.label);
  const others = (ei: number): Rect[] => placed.flatMap((b, k) => (k === ei || b === undefined ? [] : [b]));
  const runs = layout.edges.flatMap((o, oi) => segsOf(o.points).map((sg) => ({ sg, oi })));
  const spotOn = (ei: number, l: Rect, [p, q]: [Point, Point]): Rect | undefined => {
    const down = Math.abs(p.x - q.x) < 0.5;
    if (!down && Math.abs(p.y - q.y) >= 0.5) return undefined;
    // Along `t` (y when the run goes down); the label across the run, its middle on it.
    const [t0, t1] = down ? [p.y, q.y] : [p.x, q.x];
    const [u0, u1] = down ? [p.x - l.w / 2, p.x + l.w / 2] : [p.y - l.h / 2, p.y + l.h / 2];
    const size = down ? l.h : l.w;
    const cuts = [t0, t1];
    for (const r of [...rects, ...others(ei)]) {
      const [lo, hi, ulo, uhi] = down ? [r.y, r.y + r.h, r.x, r.x + r.w] : [r.x, r.x + r.w, r.y, r.y + r.h];
      if (ulo < u1 && uhi > u0) cuts.push(lo, hi);
    }
    for (const { sg: [a, b], oi } of runs) {
      if (oi === ei || (down ? Math.abs(a.y - b.y) >= 0.5 : Math.abs(a.x - b.x) >= 0.5)) continue;
      const [v0, v1] = down ? [Math.min(a.x, b.x), Math.max(a.x, b.x)] : [Math.min(a.y, b.y), Math.max(a.y, b.y)];
      if (v0 < u1 && v1 > u0) cuts.push(down ? a.y : a.x);
    }
    const [s0, s1] = [Math.min(t0, t1), Math.max(t0, t1)];
    const ts = [...new Set(cuts.filter((t) => t >= s0 - 0.5 && t <= s1 + 0.5))].sort((a, b) => (t1 >= t0 ? a - b : b - a));
    for (let k = 1; k < ts.length; k++) {
      const [a, b] = [ts[k - 1] as number, ts[k] as number];
      if (Math.abs(b - a) < size + 2 * LABEL_GAP) continue;
      const at = (a + b) / 2;
      const spot = down ? { x: u0, y: at - l.h / 2, w: l.w, h: l.h } : { x: at - l.w / 2, y: u0, w: l.w, h: l.h };
      const through = runs.some(({ sg: [m, n], oi }) => oi !== ei && Math.max(m.x, n.x) > spot.x && Math.min(m.x, n.x) < spot.x + spot.w && Math.max(m.y, n.y) > spot.y && Math.min(m.y, n.y) < spot.y + spot.h);
      if (!through && ![...solid, ...others(ei)].some((r) => meets(r, spot))) return spot;
    }
    return undefined;
  };
  const settle = (from: Layout['edges']): Layout['edges'] =>
    from.map((e, ei) => {
      const l = e.label;
      if (l === undefined || e.from === e.to) return e;
      // A line of a trunk carries its label on its own branch: the run into its box first.
      const order = e.trunk === undefined ? segsOf(e.points) : [...segsOf(e.points)].reverse();
      for (const sg of order) {
        const spot = spotOn(ei, l, sg);
        if (spot === undefined) continue;
        const label = { ...l, x: spot.x, y: spot.y };
        placed[ei] = label;
        return { ...e, label };
      }
      return e;
    });
  // A label placed later leaves where it was put; a second round lets the labels before it use that room.
  return { ...layout, edges: settle(settle(layout.edges)) };
}

/** The chip a label is drawn on (`CHIP_PAD` and `CHIP_HEIGHT` of the renderer): the room the label takes on the drawing. */
const CHIP_PAD = 10;
const CHIP_HEIGHT = 24;
function chipSize(text: string, ruler: Ruler): { w: number; h: number } {
  const size = labelSize(text, layeredRuler(ruler));
  const pad = layeredRuler(ruler).labelPadX;
  return { w: size.w + 2 * (CHIP_PAD - pad), h: Math.max(size.h, CHIP_HEIGHT) };
}

/**
 * Boundaries of one parent that start in one column share their left side, that end in one column their right side, and
 * likewise their top and bottom in rows, so that they stand as one frame instead of each fitting its own nesting. A
 * boundary only grows. From the deepest up, siblings align and a parent grows to keep its margin round the children at
 * its sides; then from the top down, a child at a side of its parent grows with it, keeping that margin, and its
 * siblings align again.
 */
function alignSiblings(clusters: readonly LayoutCluster[], rectOf: (id: string) => CellRect, parentOf: (id: string) => string | undefined, boxes: ReadonlyArray<Rect & { cluster?: string }> = []): LayoutCluster[] {
  type Edges = { x0: number; x1: number; y0: number; y1: number };
  const at = new Map<string, Edges>(clusters.map((c) => [c.id, { x0: c.x, x1: c.x + c.w, y0: c.y, y1: c.y + c.h }]));
  const was = new Map(at);
  const depthOf = new Map(clusters.map((c) => [c.id, c.depth]));
  const depths = [...new Set(clusters.map((c) => c.depth))].sort((a, b) => a - b);
  const kidsOf = (id: string): string[] => clusters.filter((c) => parentOf(c.id) === id).map((c) => c.id);
  const get = (id: string): Edges => at.get(id) as Edges;
  // Which sides of its parent a child stands at, and the margin it had there.
  const sides = (kid: string, parent: string): Array<{ k: keyof Edges; margin: number }> => {
    const [q, p] = [rectOf(kid), rectOf(parent)];
    const [k0, p0] = [was.get(kid) as Edges, was.get(parent) as Edges];
    const out: Array<{ k: keyof Edges; margin: number }> = [];
    if (q.c0 === p.c0) out.push({ k: 'x0', margin: k0.x0 - p0.x0 });
    if (q.c1 === p.c1) out.push({ k: 'x1', margin: p0.x1 - k0.x1 });
    if (q.r0 === p.r0) out.push({ k: 'y0', margin: k0.y0 - p0.y0 });
    if (q.r1 === p.r1) out.push({ k: 'y1', margin: p0.y1 - k0.y1 });
    return out;
  };
  const grow = (id: string, k: keyof Edges, v: number): void => {
    const e = get(id);
    const low = k === 'x0' || k === 'y0';
    at.set(id, { ...e, [k]: low ? Math.min(e[k], v) : Math.max(e[k], v) });
  };
  const alignLevel = (depth: number): void => {
    const groups = new Map<string, string[]>();
    for (const c of clusters) if (c.depth === depth) groups.set(parentOf(c.id) ?? '', [...(groups.get(parentOf(c.id) ?? '') ?? []), c.id]);
    for (const group of groups.values()) {
      const keys: Array<[keyof Edges, (q: CellRect) => number]> = [['x0', (q) => q.c0], ['x1', (q) => q.c1], ['y0', (q) => q.r0], ['y1', (q) => q.r1]];
      for (const [k, cell] of keys) {
        const low = k === 'x0' || k === 'y0';
        const by = new Map<number, number>();
        for (const id of group) {
          const v = get(id)[k];
          const c = cell(rectOf(id));
          by.set(c, low ? Math.min(by.get(c) ?? v, v) : Math.max(by.get(c) ?? v, v));
        }
        for (const id of group) grow(id, k, by.get(cell(rectOf(id))) as number);
      }
    }
  };
  for (const depth of [...depths].reverse()) {
    alignLevel(depth);
    for (const c of clusters.filter((k) => k.depth === depth - 1)) {
      for (const kid of kidsOf(c.id)) for (const { k, margin } of sides(kid, c.id)) grow(c.id, k, k === 'x0' || k === 'y0' ? get(kid)[k] - margin : get(kid)[k] + margin);
    }
  }
  for (const depth of depths.slice(1)) {
    for (const c of clusters.filter((k) => k.depth === depth)) {
      const parent = parentOf(c.id);
      if (parent === undefined || !depthOf.has(parent)) continue;
      for (const { k, margin } of sides(c.id, parent)) grow(c.id, k, k === 'x0' || k === 'y0' ? get(parent)[k] + margin : get(parent)[k] - margin);
    }
    alignLevel(depth);
  }
  // A boundary grown on one side only grows as far on the other, so what it holds stays in the middle: where that side
  // is no side it shares with a sibling, keeps its margin in the parent, and keeps a border gap from what stands beside.
  const within = (inner: string | undefined, outer: string): boolean => {
    for (let at = inner; at !== undefined; at = parentOf(at)) if (at === outer) return true;
    return false;
  };
  for (const depth of depths) {
    for (const c of clusters.filter((k) => k.depth === depth)) {
      const [now, before] = [get(c.id), was.get(c.id) as Edges];
      const [left, right] = [before.x0 - now.x0, now.x1 - before.x1];
      if (Math.abs(left - right) < 0.5) continue;
      const k: keyof Edges = left < right ? 'x0' : 'x1';
      const v = k === 'x0' ? before.x0 - right : before.x1 + left;
      const q = rectOf(c.id);
      const parent = parentOf(c.id);
      const shared = clusters.some((o) => o.id !== c.id && parentOf(o.id) === parent && (k === 'x0' ? rectOf(o.id).c0 === q.c0 : rectOf(o.id).c1 === q.c1));
      const room = parent === undefined || !depthOf.has(parent) ? true : k === 'x0' ? v >= get(parent).x0 + PAD : v <= get(parent).x1 - PAD;
      const next = { ...now, [k]: v };
      const clash = [
        ...clusters.filter((o) => o.id !== c.id && !within(c.id, o.id) && !within(o.id, c.id)).map((o) => get(o.id)),
        ...boxes.filter((b) => !within(b.cluster, c.id)).map((b) => ({ x0: b.x, x1: b.x + b.w, y0: b.y, y1: b.y + b.h })),
      ].some((o) => o.x0 < next.x1 + BORDER_GAP && next.x0 < o.x1 + BORDER_GAP && o.y0 < next.y1 && next.y0 < o.y1);
      if (!shared && room && !clash) at.set(c.id, next);
    }
  }
  return clusters.map((c) => {
    const e = get(c.id);
    return { ...c, x: e.x0, y: e.y0, w: e.x1 - e.x0, h: e.y1 - e.y0 };
  });
}

/** The grid with its rows as columns and its columns as rows. */
function transposed(g: GridCells): GridCells {
  return {
    cell: new Map([...g.cell].map(([id, p]) => [id, { r: p.c, c: p.r }])),
    rect: new Map([...g.rect].map(([id, q]) => [id, { r0: q.c0, r1: q.c1, c0: q.r0, c1: q.r1 }])),
    rows: g.columns,
    columns: g.rows,
  };
}

/** The grid of cells given outright. */
function givenCells(cells: Record<string, { r: number; c: number }>): GridCells {
  const all = Object.values(cells);
  return { cell: new Map(Object.entries(cells)), rect: new Map(), rows: Math.max(0, ...all.map((p) => p.r)) + 1, columns: Math.max(0, ...all.map((p) => p.c)) + 1 };
}

/** How far right of the shared end the dot of a trunk stands. */
const TRUNK = 48;
const TRUNK_MIN = 24;
const HAND = 12;

/**
 * Lines that ask for a trunk at one end (`trunk` on the graph edge) and whose other ends all stand in one column to the
 * right: one run out of the middle of the right face of the shared box to a dot, then a branch to the middle of the left
 * face of each other box. Other lines stay as drawn.
 */
function trunked(graph: Graph, nodes: readonly LayoutNode[], edges: Layout['edges']): Layout['edges'] {
  const boxOf = new Map(nodes.map((n) => [n.id, n]));
  const groups = new Map<string, number[]>();
  graph.edges.forEach((e, i) => {
    if (e.trunk === undefined) return;
    const at = e.trunk.end === 'from' ? e.from : e.to;
    const k = `${at}|${e.trunk.kind}`;
    groups.set(k, [...(groups.get(k) ?? []), i]);
  });
  const out = [...edges];
  for (const [k, list] of groups) {
    const at = boxOf.get(k.slice(0, k.indexOf('|')));
    if (at === undefined || list.length < 2) continue;
    const ends = list.map((i) => {
      const e = graph.edges[i] as Graph['edges'][number];
      return boxOf.get(e.trunk?.end === 'from' ? e.to : e.from);
    });
    const run = trunkRun(at, ends as LayoutNode[]);
    if (run === undefined) continue;
    list.forEach((i, n) => {
      const e = graph.edges[i] as Graph['edges'][number];
      const dedup = (run.paths[n] as Point[]).filter((p, j, all) => j === 0 || p.x !== (all[j - 1] as Point).x || p.y !== (all[j - 1] as Point).y);
      // A point in the middle of a straight run is no corner.
      const way = dedup.filter((p, j, all) => {
        const [a, b] = [all[j - 1], all[j + 1]];
        return a === undefined || b === undefined || !((a.x === p.x && p.x === b.x) || (a.y === p.y && p.y === b.y));
      });
      const points = e.trunk?.end === 'from' ? way : [...way].reverse();
      // Only the lead line draws the mark at the shared end.
      const shared = n === 0 ? {} : e.trunk?.end === 'from' ? { startEnd: 'none' as const } : { end: 'none' as const };
      out[i] = { ...(out[i] as Layout['edges'][number]), points, trunk: { id: k, lead: n === 0, dot: run.dot }, ...shared };
    });
  }
  return out;
}

/**
 * The paths of a trunk from `at` to `ends`: when the ends stand in one column to the right, out of the right face (clear
 * of an actor's hand) to a dot and on into the middle of each left face; when they stand in one row below, out of the
 * bottom face to a dot in the gap and on into the middle of each top face. Undefined when they stand otherwise.
 */
function trunkRun(at: LayoutNode, ends: readonly (LayoutNode | undefined)[]): { dot: Point; paths: Point[][] } | undefined {
  if (ends.some((b) => b === undefined)) return undefined;
  const bs = ends as LayoutNode[];
  const first = bs[0] as LayoutNode;
  if (bs.every((b) => b.x === first.x) && first.x > at.x + at.w) {
    // An actor's line starts a little clear of its hand.
    const x0 = at.x + at.w + (at.shape === 'actor' ? HAND : 0);
    if (first.x - x0 < 2 * TRUNK_MIN) return undefined;
    const y0 = at.y + at.h / 2;
    const dot = { x: x0 + Math.min(TRUNK, (first.x - x0) / 2), y: y0 };
    return { dot, paths: bs.map((b) => [{ x: x0, y: y0 }, dot, { x: dot.x, y: b.y + b.h / 2 }, { x: b.x, y: b.y + b.h / 2 }]) };
  }
  if (bs.every((b) => b.y === first.y) && first.y > at.y + at.h) {
    const y0 = at.y + at.h;
    if (first.y - y0 < 2 * TRUNK_MIN) return undefined;
    const x0 = at.x + at.w / 2;
    const dot = { x: x0, y: y0 + (first.y - y0) / 2 };
    return { dot, paths: bs.map((b) => [{ x: x0, y: y0 }, dot, { x: b.x + b.w / 2, y: dot.y }, { x: b.x + b.w / 2, y: b.y }]) };
  }
  return undefined;
}

/** True when the run from `a` to `b` passes through the inside of `r`. */
function crossesRect(a: Point, b: Point, r: { x: number; y: number; w: number; h: number }): boolean {
  return Math.max(a.x, b.x) > r.x + 1 && Math.min(a.x, b.x) < r.x + r.w - 1 && Math.max(a.y, b.y) > r.y + 1 && Math.min(a.y, b.y) < r.y + r.h - 1;
}
