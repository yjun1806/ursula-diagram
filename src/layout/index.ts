import type { Ruler } from '../metrics.ts';
import type { Diagnostic, Graph, Layout, LayoutEdge, LayoutLane, LayoutNode, Point } from '../types.ts';
import type { AbsPoint } from './assemble.ts';
import { buildPaths } from './assemble.ts';
import { crossings } from './check.ts';
import type { LabelSize, Rect } from './labels.ts';
import { hostRun, labelDemands, labelSize, placeLabel } from './labels.ts';
import type { Need, Side, Slot } from './place.ts';
import { buildTopology, fitLaneLabels, geometry, origin, sizeSlots } from './place.ts';
import { nodeNeeds, planEdges } from './plan.ts';
import { buildPorts, portOrders } from './ports.ts';
import { assignRanks } from './rank.ts';
import { assignRows } from './rows.ts';
import type { Run } from './route.ts';
import { routeEdges } from './route.ts';
import type { Chain } from './tracks.ts';
import { assignTracks, trackCounts, turnOrders } from './tracks.ts';

export interface LayoutOptions {
  maxWidth?: number;
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

export function layout(graph: Graph, ruler: Ruler, opts: LayoutOptions = {}): Layout {
  const td = graph.direction === 'TD';
  const rank = assignRanks(graph);
  const row = assignRows(graph, rank);
  const topo = buildTopology(graph, rank, row);
  const plans = planEdges(graph, topo);
  const needs: Map<string, Need> = nodeNeeds(plans, topo, ruler);
  const sk = sizeSlots(topo, ruler, graph.direction, needs);

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
      run.kind === 'f' ? 2 * slot.cb + 1 : 2 * slot.rank + 1;
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
  const wf = sk.baseWf.map((w, a) => Math.max(w, (counts.get(`f${a}`) ?? 0) * ruler.trackGap, demand.wf[a] ?? 0));
  const wcRaw = sk.baseWc.map((w, b) => Math.max(w, (counts.get(`c${b}`) ?? 0) * ruler.trackGap, demand.wc[b] ?? 0));
  const geo = geometry(sk, wf, fitLaneLabels(sk, wcRaw));

  const phys = (p: AbsPoint): Point => (td ? { x: tidy(p.c), y: tidy(p.f) } : { x: tidy(p.f), y: tidy(p.c) });
  const nodes: LayoutNode[] = sk.slots.map((s) => {
    const { f0, c0 } = origin(sk, geo, ruler, s);
    const [x, y, w, h] = td ? [c0, f0, s.nc, s.nf] : [f0, c0, s.nf, s.nc];
    return {
      id: s.id,
      lane: sk.lanes[s.lane]?.id ?? '',
      rank: s.rank,
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
  const placedLabels: Rect[] = [];
  const diagnostics: Diagnostic[] = [];
  const edges: LayoutEdge[] = [];
  for (const plan of plans) {
    const abs = paths.get(plan.index);
    if (!abs) continue;
    const raw = abs.map(phys);
    const edge: LayoutEdge = { from: plan.from, to: plan.to, style: plan.style, points: simplify(raw) };
    const size = sizes.get(plan.index);
    if (plan.label && size) {
      const r = routed.get(plan.index);
      const segIndex = plan.straight || !r ? 0 : hostRun(geo, r, runs) + 1;
      const p = raw[segIndex];
      const q = raw[segIndex + 1];
      if (p && q) {
        const placed = placeLabel([p, q], size, nodeRects, placedLabels, ruler);
        placedLabels.push(placed.rect);
        edge.label = { text: plan.label, x: tidy(placed.rect.x), y: tidy(placed.rect.y), w: size.w, h: size.h };
        if (placed.overlap) {
          diagnostics.push({
            kind: 'label-overlap',
            nodes: [plan.from, plan.to],
            message: `Label of ${plan.from} -> ${plan.to} overlaps a node or another label.`,
          });
        }
      }
    }
    edges.push(edge);
  }

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

  return {
    width: tidy(width),
    height: tidy(height),
    direction: graph.direction,
    lanes,
    nodes,
    edges,
    diagnostics,
  };
}
