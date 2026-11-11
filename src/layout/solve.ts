import type { Ruler } from '../metrics.ts';
import type { Diagnostic, Graph, Layout, LayoutEdge, LayoutLane, LayoutNode, Point } from '../types.ts';
import type { AbsPoint } from './assemble.ts';
import { buildPaths } from './assemble.ts';
import { crossings } from './check.ts';
import type { LabelSize, Rect, Segment } from './labels.ts';
import { hostRun, labelDemands, labelSize, placeLabel } from './labels.ts';
import type { Alignment, Geo, Need, Side, Skeleton, Slot } from './place.ts';
import { buildTopology, finalNf, fitLaneLabels, geometry, gridUp, noAlignment, origin, sizeSlots } from './place.ts';
import { nodeNeeds, planEdges } from './plan.ts';
import { buildPorts, portOrders } from './ports.ts';
import type { Run } from './route.ts';
import { boxesClear, slideBoxes } from './slide.ts';
import { routeEdges } from './route.ts';
import type { Chain } from './tracks.ts';
import { assignTracks, trackCounts, turnOrders } from './tracks.ts';

export interface LayoutOptions {
  /** Canvas width. Fixes the number of rank columns; the pixel ruler defaults to its own canvas width. */
  maxWidth?: number;
  /** Canvas height for top-down drawings, where the flow axis is vertical; unbounded when absent. */
  maxHeight?: number;
}

const tidy = (v: number): number => {
  const r = Math.round(v * 1e6) / 1e6;
  return r === 0 ? 0 : r;
};

/** Drops repeated points and middle points of straight runs. */
function simplify(points: Point[]): Point[] {
  const dedup: Point[] = [];
  for (const p of points) {
    const last = dedup[dedup.length - 1];
    if (!last || last.x !== p.x || last.y !== p.y) dedup.push(p);
  }
  const out: Point[] = [];
  for (const p of dedup) {
    for (;;) {
      const a = out[out.length - 2];
      const b = out[out.length - 1];
      if (!a || !b) break;
      const collinear = (a.x === b.x && b.x === p.x) || (a.y === b.y && b.y === p.y);
      if (!collinear) break;
      out.pop();
    }
    out.push(p);
  }
  return out;
}

/** Switch for sliding boxes along the flow axis; the drawing is then centred in its columns. */
const SLIDE_BOXES = true;

interface Pass {
  align?: Alignment;
  forced?: Set<number>;
  /** Channel widths of an earlier pass; the rank geometry must not change. */
  pin?: { wf: number[]; wc: number[]; sizes: Map<string, { nf: number; nc: number }> };
}

interface Built {
  layout: Layout;
  sk: Skeleton;
  geo: Geo;
  plans: ReturnType<typeof planEdges>;
  runs: Run[];
  counts: Map<string, number>;
  tracks: number[];
  /** False when a pinned channel had to grow. */
  pinned: boolean;
}

/** Lays the graph out for a given rank and row of every node. */
export function solve(
  graph: Graph,
  ruler: Ruler,
  rank: Map<string, number>,
  row: Map<string, number>,
  opts: Pick<LayoutOptions, 'maxWidth'> = {},
  span: Map<string, number> = new Map(),
  slide: boolean = SLIDE_BOXES,
): Layout {
  const first = build(graph, ruler, rank, row, opts, span, {});
  if (!slide) return first.layout;
  // Tight strips (the tracks as assigned) first; if the drawing then differs enough that a box
  // meets a track, the whole channel counts as occupied.
  for (const tracks of [first.tracks, undefined]) {
    const slid = slideBoxes(first.sk, first.geo, ruler, first.plans, first.runs, first.counts, tracks);
    if (!slid) return first.layout;
    const second = build(graph, ruler, rank, row, opts, span, {
      align: slid.alignment,
      forced: slid.forced,
      pin: { wf: first.geo.wf, wc: first.geo.wc, sizes: new Map(first.sk.slots.map((s) => [s.id, { nf: s.nf, nc: s.nc }] as const)) },
    });
    const sameGrid = (a: number[], b: number[]): boolean => a.length === b.length && a.every((v, i) => v === b[i]);
    const stable =
      sameGrid(first.geo.rankStart, second.geo.rankStart) &&
      sameGrid(first.geo.cStart, second.geo.cStart) &&
      first.geo.totalF === second.geo.totalF;
    if (second.pinned && stable && boxesClear(second.sk, second.geo, ruler, second.runs, second.counts, second.tracks)) {
      return second.layout;
    }
  }
  return first.layout;
}

function build(
  graph: Graph,
  ruler: Ruler,
  rank: Map<string, number>,
  row: Map<string, number>,
  opts: Pick<LayoutOptions, 'maxWidth'>,
  span: Map<string, number>,
  pass: Pass,
): Built {
  const td = graph.direction === 'TD';
  const topo = buildTopology(graph, rank, row, span);
  const plans = planEdges(graph, topo, pass.forced);
  const needs: Map<string, Need> = nodeNeeds(plans, topo, ruler);
  const sk: Skeleton = { ...sizeSlots(topo, ruler, graph.direction, needs, pass.pin?.sizes), align: pass.align ?? noAlignment() };

  const rough = geometry(sk, sk.baseWf, sk.baseWc);
  const { routed, runs } = routeEdges(sk, rough, ruler, plans);
  const table = buildPorts(sk, ruler, plans, routed, runs);
  const chains: Chain[] = [];
  for (const plan of plans) {
    const r = routed.get(plan.index);
    const from = sk.byId.get(plan.from);
    const to = sk.byId.get(plan.to);
    if (!r || !from || !to) continue;
    // A stub leaves a line toward the node: nodes on the low side (fH, cH) are at lower coordinates.
    const stubDir = (side: Side): -1 | 1 => (side === 'fH' || side === 'cH' ? -1 : 1);
    const stubPos = (slot: Slot) => (run: Run): number =>
      run.kind === 'f' ? 2 * slot.cb + 1 : 2 * slot.rank + slot.span;
    chains.push({
      runs: r.runs,
      start: stubDir(plan.srcSide),
      end: stubDir(plan.tgtSide),
      startPos: stubPos(from),
      endPos: stubPos(to),
    });
  }
  const tracks = assignTracks(runs, [...portOrders(sk, table, runs), ...turnOrders(runs, chains)]);
  const counts = trackCounts(runs, tracks);

  const sizes = new Map<number, LabelSize>();
  for (const p of plans) if (p.label) sizes.set(p.index, labelSize(p.label, ruler));
  const demand = labelDemands(sk, rough, ruler, plans, routed, runs, sizes);
  const wfNeed = sk.baseWf.map((w, a) =>
    gridUp(ruler, Math.max(w, (counts.get(`f${a}`) ?? 0) * ruler.trackGap, demand.wf[a] ?? 0)),
  );
  const wcNeed = fitLaneLabels(
    sk,
    sk.baseWc.map((w, b) => gridUp(ruler, Math.max(w, (counts.get(`c${b}`) ?? 0) * ruler.trackGap, demand.wc[b] ?? 0))),
  );
  const pin = pass.pin;
  const pinned = !pin || (wfNeed.every((w, a) => w <= (pin.wf[a] ?? 0)) && wcNeed.every((w, b) => w <= (pin.wc[b] ?? 0)));
  const wf = pin ? pin.wf : wfNeed;
  const geo = geometry(sk, wf, pin ? pin.wc : wcNeed);

  const phys = (p: AbsPoint): Point => (td ? { x: tidy(p.c), y: tidy(p.f) } : { x: tidy(p.f), y: tidy(p.c) });
  const nodes: LayoutNode[] = sk.slots.map((s) => {
    const { f0, c0 } = origin(sk, geo, ruler, s);
    const nf = finalNf(sk, geo, s);
    const [x, y, w, h] = td ? [c0, f0, s.nc, nf] : [f0, c0, nf, s.nc];
    return {
      id: s.id,
      lane: sk.lanes[s.lane]?.id ?? '',
      rank: s.rank,
      span: s.span,
      row: s.row,
      x: tidy(x),
      y: tidy(y),
      w: tidy(w),
      h: tidy(h),
      title: s.title,
      lines: s.lines,
    };
  });
  const nodeRects: Rect[] = nodes.map(({ x, y, w, h }) => ({ x, y, w, h }));

  const paths = buildPaths(sk, geo, ruler, plans, routed, runs, tracks, counts, table);
  const diagnostics: Diagnostic[] = [];
  const edges: LayoutEdge[] = [];
  const raws: Array<{ plan: (typeof plans)[number]; raw: Point[] }> = [];
  for (const plan of plans) {
    const abs = paths.get(plan.index);
    if (!abs) continue;
    const raw = abs.map(phys);
    edges.push({ from: plan.from, to: plan.to, style: plan.style, points: simplify(raw) });
    raws.push({ plan, raw });
  }
  const segmentsOf = (points: Point[]): Segment[] => {
    const out: Segment[] = [];
    for (let i = 0; i + 1 < points.length; i++) {
      const p = points[i];
      const q = points[i + 1];
      if (p && q) out.push([p, q]);
    }
    return out;
  };
  const placedLabels: Rect[] = [];
  raws.forEach(({ plan, raw }, e) => {
    const size = sizes.get(plan.index);
    const edge = edges[e];
    if (!plan.label || !size || !edge) return;
    const r = routed.get(plan.index);
    const segIndex = plan.straight || !r ? 0 : hostRun(geo, r, runs) + 1;
    const p = raw[segIndex];
    const q = raw[segIndex + 1];
    if (!p || !q) return;
    const foreign = edges.flatMap((other, k) => (k === e ? [] : segmentsOf(other.points)));
    const placed = placeLabel([p, q], size, nodeRects, placedLabels, ruler, foreign);
    placedLabels.push(placed.rect);
    edge.label = { text: plan.label, x: tidy(placed.rect.x), y: tidy(placed.rect.y), w: size.w, h: size.h };
    if (placed.overlap) {
      diagnostics.push({
        kind: 'label-overlap',
        nodes: [plan.from, plan.to],
        message: `Label of ${plan.from} -> ${plan.to} overlaps a node, another label or another edge.`,
      });
    }
  });

  const lastChannel = sk.channels - 1;
  for (const plan of plans) {
    const r = routed.get(plan.index);
    const outer = r?.runs.some((id) => {
      const run = runs[id];
      if (!run) return false;
      return run.kind === 'f' ? run.idx === 0 || run.idx === sk.ranks : run.idx === 0 || run.idx === lastChannel;
    });
    if (outer) {
      diagnostics.push({
        kind: 'detour',
        nodes: [plan.from, plan.to],
        message: `Edge ${plan.from} -> ${plan.to} runs around the outside of the drawing.`,
      });
    }
  }
  diagnostics.push(...crossings(edges));

  const width = td ? geo.totalC : geo.totalF;
  const height = td ? geo.totalF : geo.totalC;
  if (opts.maxWidth !== undefined && width > opts.maxWidth) {
    diagnostics.push({
      kind: 'overflow',
      nodes: [],
      message: `Drawing is ${tidy(width)} wide; the limit is ${opts.maxWidth}.`,
    });
  }

  const lanes: LayoutLane[] = sk.lanes.map((lane, l) => {
    const start = geo.bandStart[l] ?? 0;
    const ext = geo.bandExt[l] ?? 0;
    const flowExt = geo.totalF - 2 * sk.margin;
    const labelW = ruler.textWidth(lane.label, 'lane');
    const labelH = ruler.lineHeight('lane');
    const firstRow = geo.rowStart[l]?.[0] ?? start;
    return td
      ? {
          id: lane.id,
          label: lane.label,
          x: tidy(start),
          y: tidy(sk.margin),
          w: tidy(ext),
          h: tidy(flowExt),
          labelBox: { x: tidy(start + ruler.laneLabelGap), y: tidy(sk.margin + ruler.laneLabelGap), w: labelW, h: labelH },
        }
      : {
          id: lane.id,
          label: lane.label,
          x: tidy(sk.margin),
          y: tidy(start),
          w: tidy(flowExt),
          h: tidy(ext),
          labelBox: { x: tidy(sk.margin + ruler.laneLabelGap), y: tidy(firstRow), w: labelW, h: labelH },
        };
  });

  const layout: Layout = {
    width: tidy(width),
    height: tidy(height),
    direction: graph.direction,
    lanes,
    nodes,
    edges,
    diagnostics,
  };
  return { layout, sk, geo, plans, runs, counts, tracks, pinned };
}
