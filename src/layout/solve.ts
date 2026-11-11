import type { Ruler } from '../metrics.ts';
import type { Diagnostic, Graph, Layout, LayoutEdge, LayoutLane, LayoutNode, Point } from '../types.ts';
import type { AbsPoint } from './assemble.ts';
import { buildPaths, straightLines } from './assemble.ts';
import { crossings } from './check.ts';
import type { LabelSize, Rect, Segment } from './labels.ts';
import { hostRun, labelDemands, labelSize, placeLabel } from './labels.ts';
import type { Geo, Need, Side, Skeleton, Slot } from './place.ts';
import type { AlongSpec } from './lanes-along.ts';
import { alongBands, shapeAlong } from './lanes-along.ts';
import { buildTopology, measureNodes, finalNf, fitLaneLabels, geometry, gridUp, origin, sizeSlots } from './place.ts';
import { isFlowSide, nodeNeeds, planEdges } from './plan.ts';
import { attachOf, buildPorts, portOrders, portStep } from './ports.ts';
import type { Run } from './route.ts';
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

interface Pass {
  /** Lanes follow one another along the flow axis; the graph then has a single lane. */
  along?: AlongSpec;
  /** Edges planned as straight lines across the flow axis whose boxes ended up without room for one. */
  demote?: Set<number>;
}

interface Built {
  layout: Layout;
  sk: Skeleton;
  geo: Geo;
  plans: ReturnType<typeof planEdges>;
  runs: Run[];
  counts: Map<string, number>;
  tracks: number[];
  /** Plan index of every drawn edge, in the order of `layout.edges`. */
  drawn: number[];
}

/** Straight lines across the flow axis that another edge's segment lies on: they are drawn as routed edges instead. */
function stoodOn(built: Built): number[] {
  const out: number[] = [];
  const segs = (points: Point[]): Array<[Point, Point]> => points.slice(1).map((q, i) => [points[i] as Point, q]);
  built.layout.edges.forEach((edge, i) => {
    const plan = built.plans[built.drawn[i] ?? -1];
    if (!plan || plan.straight !== 'c') return;
    const mine = segs(edge.points);
    const hit = built.layout.edges.some((other, j) => {
      if (j === i) return false;
      return segs(other.points).some(([c, d]) => mine.some(([a, b]) => {
        const horizontal = Math.abs(a.y - b.y) < 1e-6;
        if (horizontal !== (Math.abs(c.y - d.y) < 1e-6) || Math.abs((horizontal ? a.y - c.y : a.x - c.x)) > 1e-6) return false;
        const lo = horizontal ? Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x)) : Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y));
        const hi = horizontal ? Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x)) : Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y));
        return hi - lo > 1e-6;
      }));
    });
    if (hit) out.push(plan.index);
  });
  return out;
}

const demoted = new WeakMap<Map<string, number>, Set<number>>();

/** Lays the graph out for a given slot unit and row of every node; `span` counts slot units. */
export function solve(
  graph: Graph,
  ruler: Ruler,
  rank: Map<string, number>,
  row: Map<string, number>,
  opts: Pick<LayoutOptions, 'maxWidth'> = {},
  span: Map<string, number> = new Map(),
  along?: AlongSpec,
): Layout {
  // The same assignment drawn again (other gaps) starts from the edges that lost their line the first time.
  const demote = new Set(demoted.get(rank) ?? []);
  for (let round = 0; ; round++) {
    const built = build(graph, ruler, rank, row, opts, span, { ...(along ? { along } : {}), demote });
    const lines = straightLines(built.sk, built.geo, ruler, built.plans);
    // A line is lost when no shared port exists or a box of a row between the two stands on it.
    const lost = built.plans.filter((p) => {
      if (p.straight !== 'c') return false;
      const at = lines.get(p.index);
      const a = built.sk.byId.get(p.from);
      const b = built.sk.byId.get(p.to);
      if (at === undefined || !a || !b) return true;
      const [lo, hi] = [Math.min(a.cRow, b.cRow), Math.max(a.cRow, b.cRow)];
      return built.sk.slots.some((n) => {
        if (n.cRow <= lo || n.cRow >= hi) return false;
        const f0 = origin(built.sk, built.geo, ruler, n).f0;
        return at > f0 - ruler.trackGap / 2 && at < f0 + n.nf + ruler.trackGap / 2;
      });
    });
    const stood = stoodOn(built).filter((i) => !demote.has(i));
    if ((lost.length === 0 && stood.length === 0) || round >= 8) {
      demoted.set(rank, demote);
      return built.layout;
    }
    for (const p of lost) demote.add(p.index);
    for (const i of stood) demote.add(i);
  }
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
  const unit = measureNodes(graph.nodes, graph.lanes, ruler, td).unit;
  const plans = planEdges(graph, topo, pass.along !== undefined, ruler.rankGap / unit, pass.demote);
  const needs: Map<string, Need> = nodeNeeds(plans, topo, ruler, portStep(unit, ruler));
  const sized = sizeSlots(topo, ruler, graph.direction, needs);
  const sk: Skeleton = pass.along ? shapeAlong(sized, ruler, pass.along) : sized;
  const insetOf = (key: string, count: number): number => (count > 0 ? (sk.inset?.get(key) ?? 0) : 0);

  const rough = geometry(sk, sk.baseWf, sk.baseWc);
  const { routed, runs } = routeEdges(sk, rough, ruler, plans);
  const table = buildPorts(sk, ruler, plans, routed, runs, straightLines(sk, rough, ruler, plans), (slot) => origin(sk, rough, ruler, slot).f0);
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
  const sizes = new Map<number, LabelSize>();
  for (const p of plans) if (p.label) sizes.set(p.index, labelSize(p.label, ruler));
  const demand = labelDemands(sk, rough, ruler, plans, routed, runs, sizes);
  // A channel that grows pushes the later units away by a whole number of port pitches and grid steps,
  // so that ports of boxes half a step apart keep coinciding.
  const pitch = portStep(sk.unit, ruler);
  let quantum = ruler.nodeGrid;
  for (let k = 1; k <= 12; k++) {
    if (Math.abs((k * pitch) / ruler.nodeGrid - Math.round((k * pitch) / ruler.nodeGrid)) < 1e-6) {
      quantum = k * pitch;
      break;
    }
  }
  // Coordinates of the stubs that leave a port: a track on the same line must not coincide with one.
  const stubCoords = (g: Geo): Map<string, number[]> => {
    const out = new Map<string, number[]>();
    for (const plan of plans) {
      if (plan.straight || !routed.has(plan.index)) continue;
      for (const [id, side, role] of [[plan.from, plan.srcSide, 'src'], [plan.to, plan.tgtSide, 'tgt']] as const) {
        const slot = sk.byId.get(id);
        const off = attachOf(table, id, side, plan.index, role)?.off;
        if (!slot || off === undefined) continue;
        const { f0, c0 } = origin(sk, g, ruler, slot);
        const flow = isFlowSide(side);
        const at = (flow ? c0 : f0) + off;
        const starts = flow ? g.cStart : g.fStart;
        const widths = flow ? g.wc : g.wf;
        const k = starts.findIndex((st, i) => at > st - 1e-6 && at < st + (widths[i] ?? 0) + 1e-6);
        if (k < 0) continue;
        const key = `${flow ? 'c' : 'f'}${k}`;
        out.set(key, [...(out.get(key) ?? []), at]);
      }
    }
    return out;
  };
  const turns = turnOrders(runs, chains);
  const settle = (at: (slot: Slot, off: number) => number): { tracks: number[]; counts: Map<string, number>; geo: Geo; avoid: ReadonlyMap<string, number[]> } => {
    const tracks = assignTracks(runs, [...portOrders(sk, table, runs, at), ...turns]);
    const counts = trackCounts(runs, tracks);
    const tracksOf = (key: string, avoid: ReadonlyMap<string, number[]>): number => {
      const n = counts.get(key) ?? 0;
      return n === 0 ? 0 : n + new Set(avoid.get(key) ?? []).size;
    };
    const sizeFor = (avoid: ReadonlyMap<string, number[]>): { wf: number[]; wc: number[] } => {
      const wf = sk.baseWf.map((w, a) => {
        const need = gridUp(ruler, Math.max(w, tracksOf(`f${a}`, avoid) * ruler.trackGap + insetOf(`f${a}`, tracksOf(`f${a}`, avoid)), demand.wf[a] ?? 0));
        const inner = a > 0 && a < sk.ranks && need > w;
        return inner ? w + Math.ceil((need - w) / quantum - 1e-9) * quantum : need;
      });
      const wc = fitLaneLabels(
        sk,
        sk.baseWc.map((w, b) =>
          gridUp(ruler, Math.max(w, tracksOf(`c${b}`, avoid) * ruler.trackGap + insetOf(`c${b}`, tracksOf(`c${b}`, avoid)), demand.wc[b] ?? 0)),
        ),
      );
      return { wf, wc };
    };
    let avoid: ReadonlyMap<string, number[]> = new Map();
    let size = sizeFor(avoid);
    let geo = geometry(sk, size.wf, size.wc);
    for (let round = 0; round < 3; round++) {
      avoid = stubCoords(geo);
      size = sizeFor(avoid);
      geo = geometry(sk, size.wf, size.wc);
    }
    return { tracks, counts, geo, avoid: stubCoords(geo) };
  };
  // Boxes half a step apart share port coordinates only in the drawn geometry, so the track order is settled again once it is known.
  let settled = settle((slot, off) => origin(sk, rough, ruler, slot).f0 + off);
  for (let round = 0; round < 2; round++) {
    const g = settled.geo;
    const again = settle((slot, off) => origin(sk, g, ruler, slot).f0 + off);
    const same = again.tracks.every((t, i) => t === settled.tracks[i]);
    settled = again;
    if (same) break;
  }
  const { tracks, counts, geo, avoid } = settled;

  const phys = (p: AbsPoint): Point => (td ? { x: tidy(p.c), y: tidy(p.f) } : { x: tidy(p.f), y: tidy(p.c) });
  const nodes: LayoutNode[] = sk.slots.map((s) => {
    const { f0, c0 } = origin(sk, geo, ruler, s);
    const nf = finalNf(sk, geo, s);
    const [x, y, w, h] = td ? [c0, f0, s.nc, nf] : [f0, c0, nf, s.nc];
    return {
      id: s.id,
      lane: pass.along?.laneOf.get(s.id) ?? sk.lanes[s.lane]?.id ?? '',
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

  const paths = buildPaths(sk, geo, ruler, plans, routed, runs, tracks, counts, table, avoid);
  const diagnostics: Diagnostic[] = [];
  const edges: LayoutEdge[] = [];
  const drawn: number[] = [];
  const raws: Array<{ plan: (typeof plans)[number]; raw: Point[] }> = [];
  for (const plan of plans) {
    const abs = paths.get(plan.index);
    if (!abs) continue;
    const raw = abs.map(phys);
    edges.push({ from: plan.from, to: plan.to, style: plan.style, points: simplify(raw) });
    drawn.push(plans.indexOf(plan));
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

  const lanes: LayoutLane[] = pass.along ? alongBands(sk, geo, ruler, pass.along) : sk.lanes.map((lane, l) => {
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
    laneAxis: pass.along ? 'along' : 'across',
    lanes,
    nodes,
    edges,
    diagnostics,
  };
  return { layout, sk, geo, plans, runs, counts, tracks, drawn };
}
