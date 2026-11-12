import type { Ruler } from '../metrics.ts';
import { gridUp, measureNodes } from '../layout/place.ts';
import type { LegendOption } from '../layout/legend.ts';
import { withLegend } from '../layout/legend.ts';
import type { Diagnostic, Graph, Layout } from '../types.ts';
import { align } from './align.ts';
import type { Extra, PortGeometry } from './align.ts';
import { buildLadder } from './dummies.ts';
import type { Ladder, Placed } from './model.ts';
import type { Rows } from './rows.ts';
import { orderLayers } from './order.ts';
import { boxLength, growForPorts, LINE_PITCH, planFlat, portDemand, portOffsets, portStep } from './ports.ts';
import type { FlatPlan } from './ports.ts';
import { labelSize } from '../layout/labels.ts';
import type { Frame } from './route.ts';
import { route } from './route.ts';
import { assignByStage, assignLayers } from './rows.ts';
import type { Composition } from './composition.ts';
import { planZones } from './composition.ts';
import { stageOf } from './stage.ts';
import { refine } from './refine.ts';
import { questionsFor } from './questions.ts';
import type { Variant } from './choose.ts';
import { CANDIDATES, pickBest } from './choose.ts';

export interface LayeredOptions {
  /** Whether bands run alongside the reading direction or cross it; chosen from the graph when 'auto'. */
  composition?: 'auto' | Composition;
  /** Let edges between two layers leave or enter through the side of a box (on by default; on and off both compete). */
  elbows?: boolean;
  /** Add questions (kind 'question') about the structure to the diagnostics (on by default). */
  questions?: boolean;
  /** Try small changes on the chosen drawing and keep those that measure better (on by default). */
  refine?: boolean;
  /** Draw the first candidate only and refine nothing: the quick drawing that tells whether a setting fits. */
  quick?: boolean;
  /** Cut paths and give up alignment when a drawing is still too wide after blocks moved to other rows (on by default). */
  fold?: boolean;
  /** Terminal only: the gap between neighbouring boxes in cells (3 holds one pass-through line, each further line adds 2); tried in turn when absent. */
  gap?: number;
  maxWidth?: number;
  maxHeight?: number;
  legend?: LegendOption;
}

const RETRIES = 10;

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
  return { steps: Math.max(1, Math.round(unit / step)), ...(ruler.uniform ? { centred: true } : {}), reach: (units) => (boxLength(units, unit, gap) / 2 - step / 2 - (step <= 1 ? 1 : 0)) / unit };
}

/**
 * The ruler this engine measures with: boxes and gaps snap to half the node grid (when that is a whole number
 * of at least two edge grid steps), so a smaller gap really buys another column; gaps may shrink to half the default.
 */
export function layeredRuler(r: Ruler, gap?: number): Ruler {
  if (r.terminal) return terminalRuler(r, gap);
  const half = r.nodeGrid / 2;
  if (!Number.isInteger(half) || half < 2 * r.edgeGrid) return r;
  return { ...r, nodeGrid: half, rankGapMin: Math.max(half, Math.floor(r.rankGap / 2 / half) * half) };
}

/**
 * The ruler of a terminal drawing: every coordinate is a cell, boxes are as wide as the widest text needs, the gap
 * between neighbouring boxes is three cells (an arrow and a cell either side), and bands take only the lines they use.
 */
function terminalRuler(r: Ruler, gap = 3): Ruler {
  return { ...r, uniform: true, nodeGrid: 1, edgeGrid: 1, portPitch: 1, rankGap: gap, rankGapMin: gap, rowGap: 0, laneGap: 0, lanePad: 0, laneLabelGap: 0, trackGap: 1 };
}


/** Pass-through lines that fit side by side in one gap, each a track gap apart and clear of both boxes by half of that. */
export function gapLines(ruler: Ruler, gap: number): number {
  if (ruler.uniform) return ruler.linePitch === 1 ? Math.max(1, gap) : Math.max(1, Math.floor((gap - 1) / LINE_PITCH));
  const fit = Math.floor(gap / ruler.trackGap + 1e-9);
  if (ruler.trackGap >= 2 * ruler.edgeGrid) return Math.max(1, fit);
  // On a coarse grid the lines sit on whole cells around the middle of the gap, so an odd count keeps them symmetric.
  const odd = fit - 1;
  return Math.max(1, odd % 2 === 1 ? odd : odd - 1);
}

/** Flat edges are drawn from their left end to their right end; after a free order the left end may be the target. */
function cloneLadder(l: Ladder): Ladder {
  return {
    ...l,
    nodes: l.nodes.map((n) => ({ ...n })),
    layers: l.layers.map((r) => [...r]),
    chains: l.chains.map((c) => ({ ...c, nodes: [...c.nodes] })),
    flat: l.flat.map((f) => ({ ...f })),
  };
}

function leftToRight(ladder: Ladder, layers: number[][]): void {
  const pos = new Array<number>(ladder.nodes.length).fill(0);
  layers.forEach((r) => r.forEach((n, k) => (pos[n] = k)));
  for (const f of ladder.flat) {
    if ((pos[f.lo] ?? 0) > (pos[f.hi] ?? 0)) [f.lo, f.hi] = [f.hi, f.lo];
    const c = ladder.chains[f.chain];
    if (c) c.reversed = f.lo === c.nodes[1];
  }
}

function place(graph: Graph, ruler: Ruler, units: number[], capacity: number | number[], reduction: number[], unit: number, gap: number, td: boolean, limit: number, dummyShift: number, apart: boolean, variant: Variant, squeeze = false, given?: Rows): Placed {
  const first = given ?? assignLayers(graph, units, capacity, reduction, apart);
  const stage = variant.stage ? stageOf(graph, first) : undefined;
  const rows = given ?? (stage ? assignByStage(graph, first, stage) : first);
  const finish = (ladder: Ladder, layers: number[][]): Placed => {
    // Flat edges are drawn from their left end to their right end, whatever the order turned out to be.
    leftToRight(ladder, layers);
    for (const node of ladder.nodes) if (node.idx < ladder.realCount) node.units = units[node.idx] ?? 2;
    const plan = planFlat(ladder, layers, ruler);
    growForPorts(ladder, plan, unit, gap, portStep(unit, ruler));
    const aligned = align(ladder, layers, labelExtra(graph, ladder, plan, ruler, unit, gap, td), { limit, ports: geometry(ruler, unit, gap), squeeze, lines: gapLines(ruler, gap), dummyShift, main: new Set(rows.main) });
    return {
      ladder,
      layers,
      start: aligned.start,
      width: aligned.width,
      plan,
      capacity: limit,
      rows,
      loose: variant.loose,
      ruler,
      reorder: (order) => finish(cloneLadder(ladder), order.map((r) => [...r])),
      rebuild: (next) => place(graph, ruler, units, capacity, reduction, unit, gap, td, limit, dummyShift, apart, variant, squeeze, next),
    };
  };
  const ladder = buildLadder(graph, rows, units);
  return finish(ladder, orderLayers(graph, ladder, rows, variant.free, stage, variant.loose, variant.start).layers);
}

function frameFor(graph: Graph, ruler: Ruler, limit: number | undefined): { frame: Frame; common: number; baseUnits: number[]; unit: number } {
  const td = graph.direction === 'TD';
  const m = measureNodes(graph.nodes, graph.lanes, ruler, td);
  const baseUnits = graph.nodes.map((_, i) => {
    const own = m.w[i] ?? 0;
    return !td && own > m.common ? 2 * Math.max(1, Math.ceil((own + ruler.rankGap) / m.unit / 2 - 1e-9)) : 2;
  });
  const layerExt = graph.nodes.map((_, i) => (td ? Math.max(m.w[i] ?? 0, m.common) : ruler.uniform ? (m.h[i] ?? m.contentH) : m.contentH));
  const frame: Frame = { graph, ruler, td, unit: m.unit, gap: ruler.rankGap, gutter: m.gutter, layerExt, ...(limit === undefined ? {} : { limit }) };
  return { frame, common: td ? m.contentH : m.common, baseUnits, unit: m.unit };
}

interface Solved {
  placed: Placed;
  ruler: Ruler;
  common: number;
  ok: boolean;
}

/** Everything the placement needs to know about a ruler and the canvas it must fit. */
function paramsFor(graph: Graph, ruler: Ruler, limit: number | undefined, bounded: boolean): { frame: Frame; common: number; baseUnits: number[]; unit: number; capacityUnits: number; dummyShift: number } {
  const { frame, common, baseUnits, unit } = frameFor(graph, ruler, bounded ? limit : undefined);
  const margin = gridUp(ruler, ruler.trackGap);
  const fixed = 2 * margin + frame.gutter + 2 * ruler.lanePad;
  const capacityUnits = bounded && limit !== undefined ? Math.max(2, Math.floor((limit - fixed + ruler.rankGap) / unit + 1e-9)) : Infinity;
  // The last line of a layer may sit in the gap after the last box, half a gap beyond it, plus its side offset.
  const sideOffset = ((gapLines(ruler, ruler.rankGap) - 1) / 2) * (ruler.uniform ? (ruler.linePitch ?? LINE_PITCH) : ruler.trackGap);
  const dummyEnd = bounded && limit !== undefined ? Math.floor((limit - fixed + ruler.rankGap / 2 - sideOffset) / unit + 1e-9) : Infinity;
  const dummyShift = Number.isFinite(dummyEnd) ? Math.min(1, Math.max(0, capacityUnits - dummyEnd)) : 0;
  return { frame, common, baseUnits, unit, capacityUnits, dummyShift };
}

/** Places the graph for one ruler: full row capacity first, then one box less per overflowing lane, and the alignment squeeze last. */
function solve(graph: Graph, ruler: Ruler, limit: number | undefined, bounded: boolean, plain: boolean, apart: boolean, variant: Variant, fold = true): Solved {
  const td = graph.direction === 'TD';
  const { frame, common, baseUnits, unit, capacityUnits, dummyShift } = paramsFor(graph, ruler, limit, bounded);
  const caps = graph.lanes.map(() => (bounded ? 2 * Math.floor(capacityUnits / 2) : Infinity));
  const reduction = graph.lanes.map(() => 0);
  const run = (squeeze = false): Placed => place(graph, ruler, baseUnits, caps, reduction, unit, ruler.rankGap, td, capacityUnits, dummyShift, apart, variant, squeeze);
  let placed = run();
  // A plain placement counts only when no lane needed more rows than it has at unlimited width.
  if (plain) return { placed, ruler, common, ok: !bounded || (placed.width <= capacityUnits && placed.layers.length <= assignLayers(graph, baseUnits, Infinity, 0, apart).layerLane.length) };
  const overLanes = (): Set<number> => {
    const ends = placed.layers.map((row) => Math.max(0, ...row.map((n) => (placed.start[n] ?? 0) + (n < placed.ladder.realCount ? (placed.ladder.nodes[n]?.units ?? 2) : 2))));
    const over = new Set(ends.flatMap((e, i) => (e > capacityUnits ? [placed.ladder.layerLane[i] ?? 0] : [])));
    return over.size > 0 ? over : new Set([placed.ladder.layerLane[ends.indexOf(Math.max(...ends))] ?? 0]);
  };
  // Every way to fit is drawn and scored: bends and crossings, and a heavy price for each added row.
  const price = (p: Placed): number => {
    const l = route(frame, p.ladder, p.layers, p.start, p.plan);
    // An edge inside a lane that runs from a lower row up to a higher one reads against the folded flow.
    const byId = new Map(l.nodes.map((n) => [n.id, n] as const));
    const upward = l.edges.filter((e) => {
      const a = byId.get(e.from);
      const b = byId.get(e.to);
      return a !== undefined && b !== undefined && a !== b && a.lane === b.lane && !td && b.y < a.y - 0.5;
    }).length;
    return l.edges.reduce((n, e) => n + Math.max(0, e.points.length - 2), 0) + 6 * l.diagnostics.filter((d) => d.kind === 'crossing').length + 2 * p.layers.length + 6 * upward;
  };
  // Remedies in a fixed order, each tried only when the one before is not enough: blocks move whole to other rows
  // (free cells, stacking, shelves), then paths are cut, then alignment gives way. Variants of one step are scored.
  if (bounded && placed.width > capacityUnits) {
    const found: Array<Placed | undefined> = [undefined, undefined];
    const prices = [Infinity, Infinity];
    for (let attempt = 1; attempt <= 2 * RETRIES && placed.width > capacityUnits; attempt++) {
      const phase = attempt <= RETRIES ? 0 : 1;
      if (phase === 1 && (found[0] || !fold)) break;
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
  return { placed: ok || !fold ? placed : run(true), ruler, common, ok };
}

/**
 * Lays the graph out as layers: rows inside lanes, dummies for long edges, barycentre ordering, median
 * alignment on a unit grid, and routes that follow the bands between layers.
 */
interface Prep {
  graph: Graph;
  given: Ruler;
  opts: LayeredOptions;
  apart: boolean;
  base: Ruler;
  ruler: Ruler;
  common: number;
  td: boolean;
  limit: number | undefined;
  bounded: boolean;
  placed: Placed;
  variant: Variant;
}

function prepare(graph: Graph, given: Ruler, opts: LayeredOptions, apart: boolean, variant: Variant): Prep {
  const td = graph.direction === 'TD';
  const tuned = layeredRuler(given, opts.gap);
  // Terminal stages stack boxes in a column: the lines that cross the gap between them stand on adjacent rows.
  const base = tuned.uniform && td && apart ? { ...tuned, linePitch: 1 } : tuned;
  const limit = td ? opts.maxHeight : (opts.maxWidth ?? base.defaultWidth);
  const bounded = limit !== undefined && Number.isFinite(limit);
  let solved = solve(graph, base, limit, bounded, true, apart, variant);
  if (bounded && !solved.ok) {
    // 1. Close the rank gaps toward the ruler's minimum, one grid step at a time.
    const unit0 = measureNodes(graph.nodes, graph.lanes, base, td).unit;
    let tightest = base;
    for (let gap = base.rankGap - base.nodeGrid; gap >= base.rankGapMin; gap -= base.nodeGrid) {
      const tight = { ...base, rankGap: gap };
      if (measureNodes(graph.nodes, graph.lanes, tight, td).unit >= unit0) continue;
      tightest = tight;
      const attempt = solve(graph, tight, limit, bounded, true, apart, variant);
      if (attempt.ok) {
        solved = attempt;
        break;
      }
    }
    // 2. Still too wide: whole blocks to other rows, then cut paths, at the narrowest gap.
    if (!solved.ok) solved = solve(graph, tightest, limit, bounded, false, apart, variant, opts.fold !== false);
  }
  return { graph, given, opts, apart, base, ruler: solved.ruler, common: solved.common, td, limit, bounded, placed: solved.placed, variant };
}

/** The drawing as it stands, without the spreading of spare room: what candidates and changes are measured on. */
/** The edges that join two nodes of the main flow in turn. */
function mainEdges(graph: Graph, rows: Rows): ReadonlySet<string> {
  const pairs = new Set(rows.main.slice(1).flatMap((v, i) => [`${rows.main[i]}|${v}`, `${v}|${rows.main[i]}`]));
  const index = new Map(graph.nodes.map((n, i) => [n.id, i] as const));
  return new Set(graph.edges.filter((e) => pairs.has(`${index.get(e.from)}|${index.get(e.to)}`)).map((e) => `${e.from}|${e.to}`));
}

function plainDraw(p: Prep, placed: Placed, elbows = p.opts.elbows !== false): Layout {
  const f = { ...frameFor(p.graph, placed.ruler, p.bounded ? p.limit : undefined).frame, elbows, ...(p.apart ? {} : { main: mainEdges(p.graph, placed.rows) }) };
  return route(f, placed.ladder, placed.layers, placed.start, placed.plan);
}

function finalize(p: Prep, placed: Placed = p.placed, elbows = p.opts.elbows !== false): Layout {
  const { graph, given, opts, apart, base, td, limit, bounded } = p;
  const ruler = placed.ruler;
  const common = frameFor(graph, ruler, undefined).common;
  const draw = (r: Ruler, spread = 0): Layout => {
    const f = { ...frameFor(graph, r, bounded ? limit : undefined).frame, elbows, ...(apart ? {} : { main: mainEdges(graph, placed.rows) }) };
    return route(spread === 0 ? f : { ...f, spread }, placed.ladder, placed.layers, placed.start, placed.plan);
  };
  let drawn = draw(ruler);
  // Spread spare width: the rank gap grows by pairs of grid steps, at most to twice the default.
  if (bounded && limit !== undefined && !ruler.uniform) {
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
  // Stages: the reading direction is the layer axis, so spare room (or a shortfall) goes into the bands between layers.
  const reading = td ? (opts.maxWidth ?? base.defaultWidth) : opts.maxHeight;
  if (apart && !ruler.uniform && reading !== undefined && Number.isFinite(reading) && placed.layers.length > 1) {
    const size = (d: Layout): number => (td ? d.width : d.height);
    const steps = placed.layers.length - 1;
    let spread = Math.floor((reading - size(drawn)) / steps / ruler.nodeGrid) * ruler.nodeGrid;
    let best = drawn;
    for (let tries = 0; tries < 8 && spread !== 0; tries++, spread -= ruler.nodeGrid) {
      const next = draw(ruler, spread);
      if (size(next) <= reading) {
        best = next;
        break;
      }
      if (size(next) < size(best)) best = next;
    }
    drawn = best;
  }
  const diagnostics: Diagnostic[] = [...drawn.diagnostics];
  if (opts.maxWidth !== undefined && drawn.width > opts.maxWidth) {
    diagnostics.push({ kind: 'overflow', nodes: [], message: `Drawing is ${drawn.width} wide; the limit is ${opts.maxWidth}.` });
  } else if (!td && opts.maxWidth === undefined && ruler.defaultWidth !== undefined && drawn.width > ruler.defaultWidth) {
    diagnostics.push({ kind: 'overflow', nodes: [], message: `Drawing is ${drawn.width} wide; the limit is ${ruler.defaultWidth}.` });
  }
  return withLegend({ ...drawn, diagnostics, pitch: 2 * frameFor(graph, ruler, undefined).unit }, ruler, opts.legend);
}

/**
 * Lays the graph out with the composition the graph asks for. Stages are drawn as lanes of the transposed
 * reading direction, so that the bands cross the reading direction; the result is then labelled with the real one.
 */
function layoutAt(source: Graph, given: Ruler, opts: LayeredOptions): Layout {
  const plan = planZones(source, opts.composition ?? 'auto');
  const stages = plan.composition === 'stages';
  const lanes = plan.order.flatMap((i) => (source.lanes[i] ? [source.lanes[i]] : []));
  const graph: Graph = { ...source, lanes, direction: stages ? (source.direction === 'LR' ? 'TD' : 'LR') : source.direction };
  const laid = stages ? finalize(prepare(graph, given, opts, true, CANDIDATES[0] as Variant)) : drawLanes(graph, given, opts);
  return { ...laid, direction: source.direction, laneAxis: stages ? 'along' : 'across', composition: plan.composition };
}

function withQuestions(source: Graph, drawn: Layout, given: Ruler, opts: LayeredOptions): Layout {
  if (opts.questions === false) return drawn;
  const asked = questionsFor(source, drawn, (g) => layoutAt(g, given, { ...opts, questions: false }));
  return asked.length === 0 ? drawn : { ...drawn, diagnostics: [...drawn.diagnostics, ...asked] };
}

/** Gaps a terminal drawing is tried with: one pass-through line per gap, then two, then three. */
const TERMINAL_GAPS = [3, 5, 7];

/** Stages of a left-to-right text: columns of stacked boxes, whose gap is one row (or two, when the box height is even) and grows by two. */
function stagesTall(source: Graph, opts: LayeredOptions): boolean {
  return source.direction === 'LR' && planZones(source, opts.composition ?? 'auto').composition === 'stages';
}

function stackGaps(source: Graph): number[] {
  const height = Math.max(0, ...source.nodes.map((n) => 3 + n.lines.length));
  const first = height % 2 === 1 ? 1 : 2;
  return [first, first + 2, first + 4];
}

export function layoutLayered(source: Graph, given: Ruler, opts: LayeredOptions = {}): Layout {
  if (!given.terminal || opts.gap !== undefined) return withQuestions(source, layoutAt(source, given, opts), given, opts);
  // A wider gap makes room for more lines between boxes at two cells a line, where a line of its own costs a whole column.
  // The narrowest gap whose drawing fits the width is used; when none fits, the narrowest drawing.
  const limit = opts.maxWidth;
  const fits = (d: Layout): boolean => limit !== undefined && Number.isFinite(limit) && d.width <= limit;
  let best: { drawn: Layout; gap: number } | undefined;
  const gaps = stagesTall(source, opts) ? stackGaps(source) : TERMINAL_GAPS;
  for (const gap of gaps) {
    // The gap is chosen on quick drawings; the full drawing is made once, with that gap.
    const drawn = layoutAt(source, given, { ...opts, gap, quick: true, refine: false });
    if (best === undefined || drawn.width < best.drawn.width) best = { drawn, gap };
    if (fits(best.drawn)) break;
  }
  const chosen = best as { drawn: Layout; gap: number };
  const final = opts.quick ? chosen.drawn : layoutAt(source, given, { ...opts, gap: chosen.gap });
  return withQuestions(source, final, given, { ...opts, gap: chosen.gap });
}

/** Places given rows at the smallest rank gap, for changes that need more room; undefined when the gap cannot shrink. */
function tightPlacer(p: Prep): ((rows: Rows) => Placed) | undefined {
  const { graph, base, td, limit, bounded, apart, variant } = p;
  const tight = { ...base, rankGap: base.rankGapMin };
  if (tight.rankGap >= p.placed.ruler.rankGap || measureNodes(graph.nodes, graph.lanes, tight, td).unit >= measureNodes(graph.nodes, graph.lanes, p.placed.ruler, td).unit) return undefined;
  const q = paramsFor(graph, tight, limit, bounded);
  return (rows) => place(graph, tight, q.baseUnits, graph.lanes.map(() => Infinity), graph.lanes.map(() => 0), q.unit, tight.rankGap, td, q.capacityUnits, q.dummyShift, apart, variant, false, rows);
}

const TERMINAL_CANDIDATES: readonly Variant[] = CANDIDATES.filter((v) => ['forced', 'free', 'forced-unheld'].includes(v.name));

/** Lanes: every candidate is drawn to the end and measured, the best is refined by small changes. */
function drawLanes(graph: Graph, given: Ruler, opts: LayeredOptions): Layout {
  // A terminal drawing tries three candidates and redraws at most 60 times while refining.
  const terminal = given.terminal === true;
  const candidates = opts.quick ? CANDIDATES.slice(0, 1) : terminal ? TERMINAL_CANDIDATES : CANDIDATES;
  const preps = candidates.map((v) => prepare(graph, given, opts, false, v));
  // Drawings with and without one-bend edges both compete.
  const shapes = opts.elbows === false ? [false] : opts.quick ? [true] : [true, false];
  const drawn = preps.flatMap((p) => shapes.map((e) => finalize(p, p.placed, e)));
  if (opts.refine === false || opts.quick) return pickBest(drawn);
  // Every candidate is also refined by small changes; the best of all finished drawings is kept.
  const refined = [false, true].flatMap((crossingsFirst) =>
    preps.flatMap((p) => {
      const r = refine(graph, p.placed, (placed) => plainDraw(p, placed, false), { tight: tightPlacer(p), crossingsFirst, ...(terminal ? { maxDraws: 60 } : {}) });
      return r.accepted > 0 ? shapes.map((e) => finalize(p, r.placed, e)) : [];
    }),
  );
  return pickBest([...drawn, ...refined]);
}
