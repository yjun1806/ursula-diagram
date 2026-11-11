import type { Ruler } from '../metrics.ts';
import { gridUp, measureNodes } from '../layout/place.ts';
import type { LegendOption } from '../layout/legend.ts';
import { withLegend } from '../layout/legend.ts';
import type { Diagnostic, Graph, Layout } from '../types.ts';
import { align } from './align.ts';
import type { Extra, PortGeometry } from './align.ts';
import { buildLadder } from './dummies.ts';
import type { Ladder } from './model.ts';
import { orderLayers } from './order.ts';
import { boxLength, growForPorts, planFlat, portDemand, portOffsets, portStep } from './ports.ts';
import type { FlatPlan } from './ports.ts';
import { labelSize } from '../layout/labels.ts';
import type { Frame } from './route.ts';
import { route } from './route.ts';
import { assignLayers } from './rows.ts';

export interface LayeredOptions {
  maxWidth?: number;
  maxHeight?: number;
  legend?: LegendOption;
}

const RETRIES = 10;

interface Placed {
  ladder: Ladder;
  layers: number[][];
  start: number[];
  width: number;
  plan: Map<number, FlatPlan>;
}

/** Units the labels of flat edges between neighbours need beyond the box they follow. */
function labelExtra(graph: Graph, ladder: Ladder, plan: Map<number, FlatPlan>, ruler: Ruler, unit: number, gap: number, td: boolean): Extra {
  const need = new Map<string, number>();
  for (const f of ladder.flat) {
    if (plan.get(f.chain)?.mode !== 'straight') continue;
    const text = graph.edges[ladder.chains[f.chain]?.edge ?? -1]?.label;
    if (text === undefined || text === '') continue;
    const size = labelSize(text, ruler);
    const along = td ? size.h : size.w;
    const units = Math.max(0, Math.ceil((along + 2 * ruler.trackGap - gap) / unit - 1e-9));
    const k = `${f.lo}|${f.hi}`;
    need.set(k, Math.max(need.get(k) ?? 0, units));
  }
  return (a, b) => need.get(`${a}|${b}`) ?? 0;
}

function geometry(ruler: Ruler, unit: number, gap: number): PortGeometry {
  const step = portStep(unit, ruler);
  return { steps: Math.max(1, Math.round(unit / step)), reach: (units) => (boxLength(units, unit, gap) / 2 - step / 2) / unit };
}

/**
 * The ruler this engine measures with: boxes and gaps snap to half the node grid (when that is a whole number
 * of at least two edge grid steps), so a smaller gap really buys another column; gaps may shrink to half the default.
 */
export function layeredRuler(r: Ruler): Ruler {
  const half = r.nodeGrid / 2;
  if (!Number.isInteger(half) || half < 2 * r.edgeGrid) return r;
  return { ...r, nodeGrid: half, rankGapMin: Math.max(half, Math.floor(r.rankGap / 2 / half) * half) };
}

/** Pass-through lines that fit side by side in one gap, each a track gap apart and clear of both boxes by half of that. */
export function gapLines(ruler: Ruler, gap: number): number {
  const fit = Math.floor(gap / ruler.trackGap + 1e-9);
  if (ruler.trackGap >= 2 * ruler.edgeGrid) return Math.max(1, fit);
  // On a coarse grid the lines sit on whole cells around the middle of the gap, so an odd count keeps them symmetric.
  const odd = fit - 1;
  return Math.max(1, odd % 2 === 1 ? odd : odd - 1);
}

function place(graph: Graph, ruler: Ruler, units: number[], capacity: number | number[], reduction: number[], unit: number, gap: number, td: boolean, limit: number, dummyShift: number, squeeze = false): Placed {
  const rows = assignLayers(graph, units, capacity, reduction);
  const ladder = buildLadder(graph, rows, units);
  const layers = orderLayers(graph, ladder, rows).layers;
  const plan = planFlat(ladder, layers, ruler);
  growForPorts(ladder, plan, unit, gap, portStep(unit, ruler));
  const aligned = align(ladder, layers, labelExtra(graph, ladder, plan, ruler, unit, gap, td), { limit, ports: geometry(ruler, unit, gap), squeeze, lines: gapLines(ruler, gap), dummyShift });
  return { ladder, layers, start: aligned.start, width: aligned.width, plan };
}

function frameFor(graph: Graph, ruler: Ruler, limit: number | undefined): { frame: Frame; common: number; baseUnits: number[]; unit: number } {
  const td = graph.direction === 'TD';
  const m = measureNodes(graph.nodes, graph.lanes, ruler, td);
  const baseUnits = graph.nodes.map((_, i) => {
    const own = m.w[i] ?? 0;
    return !td && own > m.common ? 2 * Math.max(1, Math.ceil((own + ruler.rankGap) / m.unit / 2 - 1e-9)) : 2;
  });
  const layerExt = graph.nodes.map((_, i) => (td ? Math.max(m.w[i] ?? 0, m.common) : m.contentH));
  const frame: Frame = { graph, ruler, td, unit: m.unit, gap: ruler.rankGap, gutter: m.gutter, layerExt, ...(limit === undefined ? {} : { limit }) };
  return { frame, common: td ? m.contentH : m.common, baseUnits, unit: m.unit };
}

/**
 * Lays the graph out as layers: rows inside lanes, dummies for long edges, barycentre ordering, median
 * alignment on a unit grid, and routes that follow the bands between layers.
 */
interface Solved {
  placed: Placed;
  ruler: Ruler;
  common: number;
  ok: boolean;
}

/** Places the graph for one ruler: full row capacity first, then one box less per overflowing lane, and the alignment squeeze last. */
function solve(graph: Graph, ruler: Ruler, limit: number | undefined, bounded: boolean, plain: boolean): Solved {
  const td = graph.direction === 'TD';
  const { frame, common, baseUnits, unit } = frameFor(graph, ruler, bounded ? limit : undefined);
  const margin = gridUp(ruler, ruler.trackGap);
  const fixed = 2 * margin + frame.gutter + 2 * ruler.lanePad;
  const capacityUnits = bounded && limit !== undefined ? Math.max(2, Math.floor((limit - fixed + ruler.rankGap) / unit + 1e-9)) : Infinity;
  // The last line of a layer may sit in the gap after the last box, half a gap beyond it, plus its side offset.
  const sideOffset = ((gapLines(ruler, ruler.rankGap) - 1) / 2) * ruler.trackGap;
  const dummyEnd = bounded && limit !== undefined ? Math.floor((limit - fixed + ruler.rankGap / 2 - sideOffset) / unit + 1e-9) : Infinity;
  const dummyShift = Number.isFinite(dummyEnd) ? Math.min(1, Math.max(0, capacityUnits - dummyEnd)) : 0;
  const caps = graph.lanes.map(() => (bounded ? 2 * Math.floor(capacityUnits / 2) : Infinity));
  const reduction = graph.lanes.map(() => 0);
  const run = (squeeze = false): Placed => place(graph, ruler, baseUnits, caps, reduction, unit, ruler.rankGap, td, capacityUnits, dummyShift, squeeze);
  let placed = run();
  // A plain placement counts only when no lane needed more rows than it has at unlimited width.
  if (plain) return { placed, ruler, common, ok: !bounded || (placed.width <= capacityUnits && placed.layers.length <= assignLayers(graph, baseUnits, Infinity).layerLane.length) };
  const overLanes = (): Set<number> => {
    const ends = placed.layers.map((row) => Math.max(0, ...row.map((n) => (placed.start[n] ?? 0) + (n < placed.ladder.realCount ? (placed.ladder.nodes[n]?.units ?? 2) : 2))));
    const over = new Set(ends.flatMap((e, i) => (e > capacityUnits ? [placed.ladder.layerLane[i] ?? 0] : [])));
    return over.size > 0 ? over : new Set([placed.ladder.layerLane[ends.indexOf(Math.max(...ends))] ?? 0]);
  };
  // Every way to fit is drawn and scored: bends and crossings, and a heavy price for each added row.
  const price = (p: Placed): number => {
    const l = route(frame, p.ladder, p.layers, p.start, p.plan);
    return l.edges.reduce((n, e) => n + Math.max(0, e.points.length - 2), 0) + 6 * l.diagnostics.filter((d) => d.kind === 'crossing').length + 2 * p.layers.length;
  };
  // Remedies in a fixed order, each tried only when the one before is not enough: blocks move whole to other rows
  // (free cells, stacking, shelves), then paths are cut, then alignment gives way. Variants of one step are scored.
  if (bounded && placed.width > capacityUnits) {
    const found: Array<Placed | undefined> = [undefined, undefined];
    const prices = [Infinity, Infinity];
    for (let attempt = 1; attempt <= 2 * RETRIES && placed.width > capacityUnits; attempt++) {
      const phase = attempt <= RETRIES ? 0 : 1;
      if (phase === 1 && found[0]) break;
      for (const lane of overLanes()) {
        if (phase === 0) reduction[lane] = (reduction[lane] ?? 0) + 2;
        else caps[lane] = Math.max(2, (caps[lane] ?? 2) - 2);
      }
      placed = run();
      if (placed.width <= capacityUnits) {
        const c = price(placed);
        if (c < (prices[phase] as number)) {
          prices[phase] = c;
          found[phase] = placed;
        }
      }
    }
    placed = found[0] ?? found[1] ?? placed;
  }
  const ok = !bounded || placed.width <= capacityUnits;
  return { placed: ok ? placed : run(true), ruler, common, ok };
}

/**
 * Lays the graph out as layers: rows inside lanes, dummies for long edges, barycentre ordering, median
 * alignment on a unit grid, and routes that follow the bands between layers.
 */
export function layoutLayered(graph: Graph, given: Ruler, opts: LayeredOptions = {}): Layout {
  const base = layeredRuler(given);
  const td = graph.direction === 'TD';
  const limit = td ? opts.maxHeight : (opts.maxWidth ?? base.defaultWidth);
  const bounded = limit !== undefined && Number.isFinite(limit);
  let solved = solve(graph, base, limit, bounded, true);
  if (bounded && !solved.ok) {
    // 1. Close the rank gaps toward the ruler's minimum, one grid step at a time.
    const unit0 = measureNodes(graph.nodes, graph.lanes, base, td).unit;
    let tightest = base;
    for (let gap = base.rankGap - base.nodeGrid; gap >= base.rankGapMin; gap -= base.nodeGrid) {
      const tight = { ...base, rankGap: gap };
      if (measureNodes(graph.nodes, graph.lanes, tight, td).unit >= unit0) continue;
      tightest = tight;
      const attempt = solve(graph, tight, limit, bounded, true);
      if (attempt.ok) {
        solved = attempt;
        break;
      }
    }
    // 2. Still too wide: whole blocks to other rows, then cut paths, at the narrowest gap.
    if (!solved.ok) solved = solve(graph, tightest, limit, bounded, false);
  }
  const { placed, common } = solved;
  const ruler = solved.ruler;
  const draw = (r: Ruler): Layout => {
    const f = frameFor(graph, r, bounded ? limit : undefined).frame;
    return route(f, placed.ladder, placed.layers, placed.start, placed.plan);
  };
  let drawn = draw(ruler);
  // Spread spare width: the rank gap grows by pairs of grid steps, at most to twice the default.
  if (bounded && limit !== undefined) {
    const total = (d: Layout): number => (td ? d.height : d.width);
    for (let gap = ruler.rankGap + 2 * ruler.nodeGrid; total(drawn) < limit && gap <= 2 * base.rankGap && gap <= common - 2 * ruler.nodeGrid; gap += 2 * ruler.nodeGrid) {
      const r = { ...ruler, rankGap: gap };
      const u = frameFor(graph, r, undefined).unit;
      // Wider gaps coarsen the port lattice: stop when a box would lose a port an edge needs.
      const need = portDemand(placed.ladder, placed.plan);
      if (placed.ladder.nodes.some((n) => n.idx < placed.ladder.realCount && portOffsets(boxLength(n.units, u, gap), portStep(u, r)).length < Math.max(need[n.idx]?.up ?? 0, need[n.idx]?.down ?? 0))) break;
      const wider = draw(r);
      if (total(wider) > limit) break;
      drawn = wider;
    }
  }
  const diagnostics: Diagnostic[] = [...drawn.diagnostics];
  if (opts.maxWidth !== undefined && drawn.width > opts.maxWidth) {
    diagnostics.push({ kind: 'overflow', nodes: [], message: `Drawing is ${drawn.width} wide; the limit is ${opts.maxWidth}.` });
  } else if (!td && opts.maxWidth === undefined && ruler.defaultWidth !== undefined && drawn.width > ruler.defaultWidth) {
    diagnostics.push({ kind: 'overflow', nodes: [], message: `Drawing is ${drawn.width} wide; the limit is ${ruler.defaultWidth}.` });
  }
  return withLegend({ ...drawn, diagnostics }, given, opts.legend);
}
