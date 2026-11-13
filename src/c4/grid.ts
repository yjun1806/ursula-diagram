import { layeredRuler } from '../layered/index.ts';
import { refineLabels } from '../layered/label-spot.ts';
import { keepOffBoxes, placeNames, withinCanvas } from '../layout/clusters.ts';
import type { LayoutOptions } from '../layout/index.ts';
import { labelSize } from '../layout/labels.ts';
import { withLegend } from '../layout/legend.ts';
import type { Ruler } from '../metrics.ts';
import type { Graph, Layout, LayoutCluster, LayoutNode, Point } from '../types.ts';
import type { Cell, CellRect } from './grid-place.ts';
import { placeCells } from './grid-place.ts';
import { emptySpec, gridRows } from './grid-rows.ts';
import { drawLines } from './grid-lines.ts';
import type { Rect } from './grid-lines.ts';

/** Gaps between cells: across, down, and around the drawing. */
const GAP_X = 32;
const GAP_Y = 64;
const MARGIN = 24;
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
export function layoutC4Grid(graph: Graph, ruler: Ruler, opts: LayoutOptions): Layout {
  const spec = graph.grid ?? emptySpec(graph);
  const rows = gridRows(graph, spec);
  const grid = placeCells(graph, spec, rows);
  const bw = Math.max(1, ...graph.nodes.map((n) => n.box?.w ?? 0));
  const bh = Math.max(1, ...graph.nodes.map((n) => n.box?.h ?? 0));
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
    const size = labelSize(text, layeredRuler(ruler));
    const side = (['r', 'l', 'b', 't'] as const)[n % 4] as 'r' | 'l' | 'b' | 't';
    const k = `${outer}:${side}`;
    inner.set(k, Math.max(inner.get(k) ?? 0, (side === 'r' || side === 'l' ? size.w : size.h) + 2 * LABEL_ROOM));
  });
  /**
   * The drawing with the columns inside each cluster moved right by `shiftOf`, and its lines, kept off the names of the
   * clusters when `names` is set.
   */
  const drawn = (shiftOf: ReadonlyMap<string, number>, names: boolean) => {
    const extraRight = new Map<string, number>();
    for (const c of clusters) {
      const q = grid.rect.get(c.id);
      if (q === undefined) continue;
      const span = (q.c1 - q.c0 + 1) * bw + (q.c1 - q.c0) * GAP_X + 2 * PAD;
      extraRight.set(c.id, Math.max(0, NAME_INSET + nameWidth(c.label) + NAME_INSET - span));
    }
    const inset = (id: string, side: 'l' | 'r' | 't' | 'b'): number => {
      const q = grid.rect.get(id) as CellRect;
      const own = (side === 'l' ? PAD + (shiftOf.get(id) ?? 0) : side === 'r' ? PAD + (extraRight.get(id) ?? 0) : side === 't' ? PAD + NAME : PAD) + (inner.get(`${id}:${side}`) ?? 0);
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
      base = Math.max(base, labelRoom('across', k));
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
      base = Math.max(base, labelRoom('down', k));
      // A bent line turns in the gap under its upper end, half of them to each side: each keeps a lane of its own.
      const turning = graph.edges.filter((e) => {
        const [a, b] = [cellOf(e.from), cellOf(e.to)];
        return a !== undefined && b !== undefined && a.c !== b.c && a.r !== b.r && Math.min(a.r, b.r) === k - 1;
      }).length;
      if (turning > 0) base = Math.max(base, 2 * TURN + LANE * Math.ceil(turning / 2));
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

    // The name stands in the top left corner, two lines high.
    const nameOf = (id: string): { x: number; y: number; w: number; h: number } | undefined => {
      const c = laidClusters.find((k) => k.id === id);
      return c === undefined ? undefined : { x: c.x + NAME_INSET, y: c.y + NAME_TOP, w: nameWidth(c.label), h: NAME - NAME_TOP };
    };
    const { edges, diagnostics } = drawLines({ graph, nodes, clusters: laidClusters, width, height, holds, labelOf, ...(names ? { nameOf } : {}) });
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
  const { width, height, nodes, laidClusters, edges, diagnostics } = drawn(shiftOf, true);

  const laid: Layout = { width, height, direction: 'TD', laneAxis: 'across', lanes: [], clusters: laidClusters, nodes, edges, diagnostics };
  const every = new Set(laidClusters.map((c) => c.id));
  const subtitled = new Set(clusters.filter((c) => c.subtitled === true).map((c) => c.id));
  const named = { ...laid, clusters: placeNames(laid, ruler, every, subtitled).clusters };
  const avoid = keepOffBoxes(named.clusters ?? [], true);
  const refined = alongGap(centreLabels(refineLabels(named, layeredRuler(ruler), new Set(edges.map((_, i) => i)), avoid), avoid));
  const grown = withinCanvas({ ...refined, clusters: placeNames(refined, ruler, every, subtitled).clusters });
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
 * A label on a line stands in the middle of a free gap the line crosses: the first gap from the start of the line, along
 * the run that carries the label, where it is deep enough and touches no box, border, name, other line or other label.
 * The gaps are cut by the boxes, the borders and the names of the clusters, the runs of the other lines and the other
 * labels, so labels of one gap stand at one level. A label with no such gap stays where it is.
 */
function centreLabels(layout: Layout, avoid: readonly Rect[]): Layout {
  const rects: Rect[] = [...layout.nodes, ...(layout.clusters ?? []), ...(layout.clusters ?? []).flatMap((c) => (c.name ? [c.name] : []))];
  const solid: Rect[] = [...layout.nodes, ...avoid];
  const segsOf = (pts: readonly Point[]): Array<[Point, Point]> => pts.slice(1).map((q, i) => [pts[i] as Point, q]);
  const meets = (a: Rect, b: Rect): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  // Every label as it stands now; a label moved takes its new place here.
  const placed: Array<Rect | undefined> = layout.edges.map((e) => e.label);
  const others = (ei: number): Rect[] => placed.flatMap((b, k) => (k === ei || b === undefined ? [] : [b]));
  const edges = layout.edges.map((e, ei) => {
    const l = e.label;
    if (l === undefined || e.from === e.to) return e;
    const cx = l.x + l.w / 2;
    const cy = l.y + l.h / 2;
    // The run the label stands on or right beside.
    const own = segsOf(e.points).find(([a, b]) =>
      Math.abs(a.x - b.x) < 0.5
        ? a.x >= l.x - LABEL_GAP && a.x <= l.x + l.w + LABEL_GAP && cy >= Math.min(a.y, b.y) - 0.5 && cy <= Math.max(a.y, b.y) + 0.5
        : a.y >= l.y - LABEL_GAP && a.y <= l.y + l.h + LABEL_GAP && cx >= Math.min(a.x, b.x) - 0.5 && cx <= Math.max(a.x, b.x) + 0.5,
    );
    if (own === undefined) return e;
    const down = Math.abs(own[0].x - own[1].x) < 0.5;
    // Along `t` (y when the run goes down), across `u`.
    const t0 = down ? own[0].y : own[0].x;
    const t1 = down ? own[1].y : own[1].x;
    const [u0, u1] = down ? [l.x, l.x + l.w] : [l.y, l.y + l.h];
    const size = down ? l.h : l.w;
    const span = (r: Rect): [number, number, number, number] => (down ? [r.y, r.y + r.h, r.x, r.x + r.w] : [r.x, r.x + r.w, r.y, r.y + r.h]);
    const cuts = [t0, t1];
    for (const r of [...rects, ...others(ei)]) {
      const [lo, hi, ulo, uhi] = span(r);
      if (ulo < u1 && uhi > u0) cuts.push(lo, hi);
    }
    const runs = layout.edges.flatMap((o, oi) => segsOf(o.points).map((sg) => ({ sg, mine: oi === ei })));
    for (const { sg: [a, b] } of runs) {
      if (down ? Math.abs(a.y - b.y) >= 0.5 : Math.abs(a.x - b.x) >= 0.5) continue;
      const [v0, v1] = down ? [Math.min(a.x, b.x), Math.max(a.x, b.x)] : [Math.min(a.y, b.y), Math.max(a.y, b.y)];
      if (v0 < u1 && v1 > u0) cuts.push(down ? a.y : a.x);
    }
    const [s0, s1] = [Math.min(t0, t1), Math.max(t0, t1)];
    const ts = [...new Set(cuts.filter((t) => t >= s0 - 0.5 && t <= s1 + 0.5))].sort((a, b) => (t1 >= t0 ? a - b : b - a));
    for (let k = 1; k < ts.length; k++) {
      const [a, b] = [ts[k - 1] as number, ts[k] as number];
      if (Math.abs(b - a) < size + 2 * LABEL_GAP) continue;
      const at = (a + b) / 2;
      const moved = down ? { ...l, y: at - l.h / 2 } : { ...l, x: at - l.w / 2 };
      const through = runs.some(({ sg: [p, q], mine }) => !mine && Math.max(p.x, q.x) > moved.x && Math.min(p.x, q.x) < moved.x + moved.w && Math.max(p.y, q.y) > moved.y && Math.min(p.y, q.y) < moved.y + moved.h);
      if (through || [...solid, ...others(ei)].some((r) => meets(r, moved))) continue;
      placed[ei] = moved;
      return { ...e, label: moved };
    }
    return e;
  });
  return { ...layout, edges };
}
