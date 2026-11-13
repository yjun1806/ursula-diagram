import { tightPasses } from './clearance.ts';
import type { Ruler } from '../metrics.ts';
import { gridUp, measureNodes } from '../layout/place.ts';
import { hasCompartments, ownSize } from '../layout/records.ts';
import type { LegendOption } from '../layout/legend.ts';
import { withLegend } from '../layout/legend.ts';
import type { Diagnostic, Graph, Layout } from '../types.ts';
import { align } from './align.ts';
import type { Extra, PortGeometry } from './align.ts';
import { buildLadder } from './dummies.ts';
import type { Ladder, Placed } from './model.ts';
import type { Rows } from './rows.ts';
import { orderLayers } from './order.ts';
import { bodyLength, boxLength, CORNER_CLEAR, growForPorts, lacksRoom, LINE_PITCH, planFlat, portDemand, portStep } from './ports.ts';
import type { FlatPlan } from './ports.ts';
import { labelSize } from '../layout/labels.ts';
import { labelBox, labelLines, roomAround } from './label-room.ts';
import { refineLabels } from './label-spot.ts';
import { crossings } from '../layout/check.ts';
import { offCentreEnds } from './centre.ts';
import { settleMixedSides } from './vertex.ts';
import type { Frame } from './route.ts';
import { route } from './route.ts';
import { assignByStage, assignLayers } from './rows.ts';
import type { Composition } from './composition.ts';
import { planZones, unzoned } from './composition.ts';
import { packPieces, piecesOf } from './shelves.ts';
import { stageOf } from './stage.ts';
import { refine } from './refine.ts';
import { questionsFor } from './questions.ts';
import type { Variant } from './choose.ts';
import { CANDIDATES, FOLDED, pickBest, score, spreadWins } from './choose.ts';
import { directionsOf, mixedSideEnds } from './sides.ts';
import { stats } from './stats.ts';

export interface LayeredOptions {
  /** Whether bands run alongside the reading direction or cross it; chosen from the graph when 'auto'. */
  composition?: 'auto' | Composition;
  /** Let edges between two layers leave or enter through the side of a box (on by default; on and off both compete). */
  elbows?: boolean;
  /** Add questions (kind 'question') about the structure to the diagnostics (on by default). */
  questions?: boolean;
  /** Try small changes on the chosen drawing and keep those that measure better (on by default). */
  refine?: boolean;
  /** 'fast': three candidates and one fold, drawn once, nothing refined, no questions; 'best': every candidate, the best three refined (the default for pixels; the terminal defaults to 'fast'). */
  quality?: 'fast' | 'best';
  /** Draw the first candidate only and refine nothing: the quick drawing that tells whether a setting fits. */
  quick?: boolean;
  /** Pixels, left to right: true lets a box a little wider than the common width take three slot units instead of four, false keeps whole pairs; when absent, both are drawn and the better drawing is kept. */
  compact?: boolean;
  /** Cut paths and give up alignment when a drawing is still too wide after blocks moved to other rows (on by default). */
  fold?: boolean;
  /** Terminal only: the gap between neighbouring boxes in cells (3 holds one pass-through line, each further line adds 2); tried in turn when absent. */
  gap?: number;
  maxWidth?: number;
  maxHeight?: number;
  legend?: LegendOption;
  /** The graph is one level of a drawing with clusters: edges outside it join its boxes, so it is neither shelved in pieces nor drawn as stages (off by default). */
  nested?: boolean;
  /** With `nested`: the `spread` drawing is taken at this level when it wins (off by default, because it is scored before the lines are joined into boxes). */
  nestedSpread?: boolean;
}

const RETRIES = 10;

/** Units the labels of flat edges between neighbours need beyond the box they follow. */
function labelExtra(graph: Graph, ladder: Ladder, plan: Map<number, FlatPlan>, ruler: Ruler, unit: number, gap: number, td: boolean): Extra {
  const need = new Map<string, number>();
  for (const f of ladder.flat) {
    if (plan.get(f.chain)?.mode !== 'straight') continue;
    const e = graph.edges[ladder.chains[f.chain]?.edge ?? -1];
    const text = e?.label;
    if (e === undefined || text === undefined || text === '') continue;
    let along: number;
    let room: number;
    if (ruler.uniform) {
      const size = labelSize(text, ruler);
      along = td ? size.h : size.w;
      room = 2 * ruler.trackGap;
    } else {
      // Pixels: a line stays visible on both sides of the label, and the arrowhead takes more; a long label may be wrapped.
      const lines = td ? [text] : labelLines(text, e.style, ruler, gap, unit);
      const size = labelBox(lines, ruler);
      along = td ? size.h : size.w;
      room = roomAround(e.style);
    }
    const units = Math.max(0, Math.ceil((along + room - gap) / unit - 1e-9));
    const k = `${f.lo}|${f.hi}`;
    need.set(k, Math.max(need.get(k) ?? 0, units));
  }
  return (a, b) => need.get(`${a}|${b}`) ?? 0;
}

function geometry(ruler: Ruler, unit: number, gap: number): PortGeometry {
  const step = portStep(unit, ruler);
  return {
    steps: Math.max(1, Math.round(unit / step)),
    ...(ruler.uniform ? { centred: true } : { inner: (units: number) => (boxLength(units, unit, gap) / 2 - CORNER_CLEAR) / unit, innerFor: (length: number) => (length / 2 - CORNER_CLEAR) / unit }),
    reach: (units) => (boxLength(units, unit, gap) / 2 - step / 2 - (step <= 1 ? 1 : 0)) / unit,
    reachFor: (length) => (length / 2 - step / 2 - (step <= 1 ? 1 : 0)) / unit,
  };
}

/**
 * The own length along the order axis of every box divided into compartments in a drawing whose layers are columns
 * (pixels): such a box keeps its height and stands in the middle of its slot instead of filling it.
 */
function bodyLengths(graph: Graph, ruler: Ruler, td: boolean): Array<number | undefined> {
  // A box of a cluster keeps the size it was given along the order axis too, in the middle of the slots it takes.
  return graph.nodes.map((n) => (n.box !== undefined && !ruler.uniform ? (td ? n.box.h : n.box.w) : td && !ruler.uniform && hasCompartments(n) ? ownSize(n, td, ruler)?.h : undefined));
}

/** Boxes up to 15% wider than the middle one share its place size: a box a few pixels wider does not take two places. */
const COMMON_WITHIN = 1.15;

/** The default canvas is a wish, not a border: a drawing may take this many times its width before it counts as too wide. A size the caller gave is kept. */
const DEFAULT_ROOM = 1.15;

/**
 * The ruler this engine measures with: boxes and gaps snap to half the node grid (when that is a whole number
 * of at least two edge grid steps), so a smaller gap really buys another column; gaps may shrink to half the default.
 */
export function layeredRuler(r: Ruler, gap?: number): Ruler {
  if (r.terminal) return terminalRuler(r, gap);
  const half = r.nodeGrid / 2;
  if (!Number.isInteger(half) || half < 2 * r.edgeGrid) return { ...r, commonWithin: COMMON_WITHIN };
  return { ...r, commonWithin: COMMON_WITHIN, nodeGrid: half, rankGapMin: Math.max(half, Math.floor(r.rankGap / 2 / half) * half) };
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

/** Thickness of the boxes along the layer axis of a drawing that has a stadium, whose straight stretch depends on it; 0 otherwise. */
function stadiumThickness(graph: Graph, ruler: Ruler, td: boolean): number {
  return ruler.uniform || td || !graph.nodes.some((n) => n.shape === 'stadium') ? 0 : measureNodes(graph.nodes, graph.lanes, ruler, td).contentH;
}

function place(graph: Graph, ruler: Ruler, units: number[], capacity: number | number[], reduction: number[], unit: number, gap: number, td: boolean, limit: number, dummyShift: number, apart: boolean, variant: Variant, squeeze = false, given?: Rows): Placed {
  const index = new Map(graph.nodes.map((n, i) => [n.id, i] as const));
  const degreeOf = graph.nodes.map(() => 0);
  for (const e of graph.edges) {
    const a = index.get(e.from);
    const b = index.get(e.to);
    if (a === undefined || b === undefined || a === b) continue;
    degreeOf[a] = (degreeOf[a] ?? 0) + 1;
    degreeOf[b] = (degreeOf[b] ?? 0) + 1;
  }
  const shapes = graph.nodes.map((n) => n.shape);
  const bodies = bodyLengths(graph, ruler, td);
  const across = stadiumThickness(graph, ruler, td);
  const first = given ?? assignLayers(graph, units, capacity, reduction, apart, variant.fold);
  const stage = variant.stage ? stageOf(graph, first) : undefined;
  const rows = given ?? (stage ? assignByStage(graph, first, stage) : first);
  const finish = (ladder: Ladder, layers: number[][]): Placed => {
    // Flat edges are drawn from their left end to their right end, whatever the order turned out to be.
    leftToRight(ladder, layers);
    for (const node of ladder.nodes) if (node.idx < ladder.realCount) node.units = units[node.idx] ?? 2;
    const plan = planFlat(ladder, layers, ruler);
    growForPorts(ladder, plan, unit, gap, portStep(unit, ruler), ruler.uniform === true, shapes, td, across, graph.nodes.map((n, i) => (n.box === undefined ? undefined : bodies[i])));
    const need = portDemand(ladder, plan);
    const aligned = align(ladder, layers, labelExtra(graph, ladder, plan, ruler, unit, gap, td), { limit, ports: geometry(ruler, unit, gap), body: (n) => { const own = bodies[n]; return own === undefined ? undefined : bodyLength(own, boxLength(ladder.nodes[n]?.units ?? 2, unit, gap)); }, squeeze, lines: gapLines(ruler, gap), dummyShift, main: new Set(rows.main), single: (n, side) => n < ladder.realCount && need[n]?.[side] === 1, degree: (n) => degreeOf[n] ?? 0, hubs: apart || (!ruler.uniform && unzoned(graph)) });
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
  stats.placements++;
  const ladder = buildLadder(graph, rows, units);
  return finish(ladder, orderLayers(graph, ladder, rows, variant.free, stage, variant.loose, variant.start).layers);
}

/** Slot units of a box: 2, or the next whole pair for a box wider than the common width; compact lets three be enough. */
function unitsOf(own: number, common: number, unit: number, gap: number, compact: boolean): number {
  if (own <= common) return 2;
  if (compact && Math.ceil((own + gap) / unit - 1e-9) <= 3) return 3;
  return 2 * Math.max(1, Math.ceil((own + gap) / unit / 2 - 1e-9));
}

function frameFor(graph: Graph, ruler: Ruler, limit: number | undefined, compact = false): { frame: Frame; common: number; baseUnits: number[]; unit: number } {
  const td = graph.direction === 'TD';
  const m = measureNodes(graph.nodes, graph.lanes, ruler, td);
  // A box given from outside is as long as its size needs along the reading direction and as thick as it is across.
  const baseUnits = graph.nodes.map((n, i) => (td ? (n.box === undefined ? 2 : unitsOf(m.h[i] ?? 0, m.contentH, m.unit, ruler.rankGap, compact)) : unitsOf(m.w[i] ?? 0, m.common, m.unit, ruler.rankGap, compact)));
  const layerExt = graph.nodes.map((n, i) => (td ? Math.max(m.w[i] ?? 0, m.common) : ruler.uniform ? (m.h[i] ?? m.contentH) : n.box === undefined ? (m.h[i] ?? m.contentH) : Math.max(m.contentH, m.h[i] ?? 0)));
  const frame: Frame = { graph, ruler, td, unit: m.unit, gap: ruler.rankGap, gutter: m.gutter, layerExt, bodyLen: bodyLengths(graph, ruler, td), ...(limit === undefined ? {} : { limit }) };
  return { frame, common: td ? m.contentH : m.common, baseUnits, unit: m.unit };
}

interface Solved {
  placed: Placed;
  ruler: Ruler;
  common: number;
  ok: boolean;
}

/** Everything the placement needs to know about a ruler and the canvas it must fit. */
function paramsFor(graph: Graph, ruler: Ruler, limit: number | undefined, bounded: boolean, compact = false): { frame: Frame; common: number; baseUnits: number[]; unit: number; capacityUnits: number; dummyShift: number } {
  const { frame, common, baseUnits, unit } = frameFor(graph, ruler, bounded ? limit : undefined, compact);
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
/** What a placement may do to count as fitting: `rows` caps the rows of a lane at its own or two, `intact` keeps the main flow in one piece. */
interface Allowance {
  rows?: boolean;
  intact?: boolean;
}

function rowsPerLane(layerLane: number[], lanes: number): number[] {
  const out = new Array<number>(lanes).fill(0);
  for (const lane of layerLane) out[lane] = (out[lane] ?? 0) + 1;
  return out;
}

function solve(graph: Graph, ruler: Ruler, limit: number | undefined, bounded: boolean, plain: boolean, apart: boolean, variant: Variant, fold = true, allow: Allowance = {}, compact = false): Solved {
  const td = graph.direction === 'TD';
  const { frame, common, baseUnits, unit, capacityUnits, dummyShift } = paramsFor(graph, ruler, limit, bounded, compact);
  const caps = graph.lanes.map(() => (bounded ? 2 * Math.floor(capacityUnits / 2) : Infinity));
  const reduction = graph.lanes.map(() => 0);
  const run = (squeeze = false): Placed => place(graph, ruler, baseUnits, caps, reduction, unit, ruler.rankGap, td, capacityUnits, dummyShift, apart, variant, squeeze);
  let placed = run();
  // A plain placement counts only when no lane needed more rows than it has at unlimited width.
  if (plain) return { placed, ruler, common, ok: !bounded || (placed.width <= capacityUnits && placed.layers.length <= assignLayers(graph, baseUnits, Infinity, 0, apart, variant.fold).layerLane.length) };
  // Rows first: a lane may use its own rows or two, and the main flow is kept whole.
  const unlimitedRows = allow.rows ? rowsPerLane(assignLayers(graph, baseUnits, Infinity, 0, apart, variant.fold).layerLane, graph.lanes.length) : [];
  const allowed = (p: Placed): boolean =>
    !(allow.intact && p.rows.mainCut) && (!allow.rows || rowsPerLane(p.ladder.layerLane, graph.lanes.length).every((n, lane) => n <= Math.max(unlimitedRows[lane] ?? 0, 2)));
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
      const rowsNow = allow.rows ? rowsPerLane(placed.ladder.layerLane, graph.lanes.length) : [];
      let moved = false;
      for (const lane of overLanes()) {
        // Rows first: a lane that already uses all the rows it may is not pressed further.
        if (phase === 0 && allow.rows && (rowsNow[lane] ?? 0) >= Math.max(unlimitedRows[lane] ?? 0, 2)) continue;
        moved = true;
        if (phase === 0) reduction[lane] = (reduction[lane] ?? 0) + 2;
        else caps[lane] = Math.max(2, (caps[lane] ?? 2) - 2);
      }
      if (!moved && allow.rows) break;
      placed = run();
      if (placed.width <= capacityUnits && allowed(placed)) {
        const c = price(placed);
        if (c < (prices[phase] as number)) {
          prices[phase] = c;
          found[phase] = placed;
        }
      }
    }
    placed = found[0] ?? found[1] ?? placed;
  }
  const ok = !bounded || (placed.width <= capacityUnits && allowed(placed));
  if (!ok && allow.rows) {
    const squeezed = run(true);
    if (squeezed.width <= capacityUnits && allowed(squeezed)) return { placed: squeezed, ruler, common, ok: true };
  }
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

/**
 * How a drawing that is too wide is narrowed. 'gap' (the order of the terminal, and one candidate of pixels): close the
 * gaps, then move blocks to further rows, then cut paths. 'rows' (pixels): keep the default gap and give every lane a
 * second row, then close the gaps with the second rows in use, then open a third row and further ones, and cut the
 * flow last; the main flow is not cut before that last step.
 */
export type Order = 'gap' | 'rows';

function prepare(graph: Graph, given: Ruler, opts: LayeredOptions, apart: boolean, variant: Variant, order: Order = 'gap'): Prep {
  const td = graph.direction === 'TD';
  const tuned = layeredRuler(given, opts.gap);
  // Terminal stages stack boxes in a column: the lines that cross the gap between them stand on adjacent rows.
  const base = tuned.uniform && td && apart ? { ...tuned, linePitch: 1 } : tuned;
  const limit = td ? opts.maxHeight : (opts.maxWidth ?? base.defaultWidth);
  const bounded = limit !== undefined && Number.isFinite(limit);
  const compact = opts.compact === true;
  const rowsFirst = order === 'rows' && !base.uniform;
  if (rowsFirst) {
    const second: Allowance = { rows: true, intact: true };
    const unit0 = measureNodes(graph.nodes, graph.lanes, base, td).unit;
    // 1. The default gap, a second row in every lane.
    let solved = solve(graph, base, limit, bounded, false, apart, variant, false, second, compact);
    let tightest = base;
    // 2. Close the gaps, the second rows in use.
    for (let gap = base.rankGap - base.nodeGrid; bounded && !solved.ok && gap >= base.rankGapMin; gap -= base.nodeGrid) {
      const tight = { ...base, rankGap: gap };
      if (measureNodes(graph.nodes, graph.lanes, tight, td).unit >= unit0) continue;
      tightest = tight;
      const attempt = solve(graph, tight, limit, bounded, false, apart, variant, false, second, compact);
      if (attempt.ok) solved = attempt;
    }
    // 3. A third row and further ones, the main flow whole. 4. The flow is cut.
    if (bounded && !solved.ok) solved = solve(graph, tightest, limit, bounded, false, apart, variant, false, { intact: true }, compact);
    if (bounded && !solved.ok) solved = solve(graph, tightest, limit, bounded, false, apart, variant, opts.fold !== false, {}, compact);
    return { graph, given, opts, apart, base, ruler: solved.ruler, common: solved.common, td, limit, bounded, placed: solved.placed, variant };
  }
  let solved = solve(graph, base, limit, bounded, true, apart, variant, true, {}, compact);
  if (bounded && !solved.ok) {
    // 1. Close the rank gaps toward the ruler's minimum, one grid step at a time.
    const unit0 = measureNodes(graph.nodes, graph.lanes, base, td).unit;
    let tightest = base;
    for (let gap = base.rankGap - base.nodeGrid; gap >= base.rankGapMin; gap -= base.nodeGrid) {
      const tight = { ...base, rankGap: gap };
      if (measureNodes(graph.nodes, graph.lanes, tight, td).unit >= unit0) continue;
      tightest = tight;
      const attempt = solve(graph, tight, limit, bounded, true, apart, variant, true, {}, compact);
      if (attempt.ok) {
        solved = attempt;
        break;
      }
    }
    // 2. Still too wide: whole blocks to other rows, then cut paths, at the narrowest gap.
    if (!solved.ok) solved = solve(graph, tightest, limit, bounded, false, apart, variant, opts.fold !== false, {}, compact);
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
  const f = { ...frameFor(p.graph, placed.ruler, p.bounded ? p.limit : undefined).frame, elbows, stages: p.apart, ...(p.apart ? {} : { main: mainEdges(p.graph, placed.rows) }) };
  return route(f, placed.ladder, placed.layers, placed.start, placed.plan);
}

function finalize(p: Prep, placed: Placed = p.placed, elbows = p.opts.elbows !== false): Layout {
  const { graph, given, opts, apart, base, td, limit, bounded } = p;
  const ruler = placed.ruler;
  const common = frameFor(graph, ruler, undefined).common;
  const draw = (r: Ruler, spread = 0): Layout => {
    const f = { ...frameFor(graph, r, bounded ? limit : undefined).frame, elbows, stages: apart, ...(apart ? {} : { main: mainEdges(graph, placed.rows) }) };
    return route(spread === 0 ? f : { ...f, spread }, placed.ladder, placed.layers, placed.start, placed.plan);
  };
  let drawn = draw(ruler);
  let usedGap = ruler.rankGap;
  // A line that passes beside a box it does not end on keeps its room: the rank gap grows by pairs of grid steps, at most to twice the default, while that takes such passes away.
  if (bounded && limit !== undefined && !ruler.uniform) {
    const total = (d: Layout): number => (td ? d.height : d.width);
    // The default canvas is a wish, not a border: room for passing lines may take up to 15% more than it. A size the caller gave is kept.
    const room = (td ? opts.maxHeight : opts.maxWidth) === undefined ? limit * DEFAULT_ROOM : limit;
    let tight = tightPasses(drawn);
    for (let gap = ruler.rankGap + 2 * ruler.nodeGrid; tight > 0 && gap <= 2 * base.rankGap && gap <= common - 2 * ruler.nodeGrid; gap += 2 * ruler.nodeGrid) {
      const r = { ...ruler, rankGap: gap };
      const u = frameFor(graph, r, undefined).unit;
      // Wider gaps coarsen the port lattice: stop when a box would lose a port an edge needs.
      const need = portDemand(placed.ladder, placed.plan);
      const across = stadiumThickness(graph, r, td);
      if (placed.ladder.nodes.some((n) => n.idx < placed.ladder.realCount && graph.nodes[n.idx]?.box === undefined && lacksRoom(graph.nodes[n.idx]?.shape, td, boxLength(n.units, u, gap), portStep(u, r), across, r.uniform === true, need[n.idx]?.up ?? 0, need[n.idx]?.down ?? 0))) break;
      const wider = draw(r);
      if (total(wider) > room) break;
      const now = tightPasses(wider);
      if (now >= tight) continue;
      drawn = wider;
      usedGap = gap;
      tight = now;
    }
  }
  // Gaps stay as wide as what stands in them needs: spare width is left empty, not spread between the boxes.
  // Stages: the reading direction is the layer axis, so a shortfall is taken out of the bands between layers.
  const reading = td ? (opts.maxWidth ?? base.defaultWidth) : opts.maxHeight;
  if (apart && !ruler.uniform && reading !== undefined && Number.isFinite(reading) && placed.layers.length > 1) {
    const size = (d: Layout): number => (td ? d.width : d.height);
    const steps = placed.layers.length - 1;
    let spread = Math.min(0, Math.floor((reading - size(drawn)) / steps / ruler.nodeGrid) * ruler.nodeGrid);
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
  const diagnostics: Diagnostic[] = [...drawn.diagnostics, ...overflowOf(drawn, opts, ruler, td)];
  return withLegend({ ...drawn, diagnostics, pitch: 2 * frameFor(graph, ruler, undefined).unit, ...(ruler.uniform ? {} : { gap: usedGap, gapDefault: base.rankGap }) }, ruler, opts.legend);
}

/** The note that a drawing is wider than the limit the caller gave, or than the default canvas by more than the room a wish may take. */
function overflowOf(drawn: Layout, opts: LayeredOptions, ruler: Ruler, td: boolean): Diagnostic[] {
  if (opts.maxWidth !== undefined && drawn.width > opts.maxWidth) return [{ kind: 'overflow', nodes: [], message: `Drawing is ${drawn.width} wide; the limit is ${opts.maxWidth}.` }];
  if (!td && opts.maxWidth === undefined && ruler.defaultWidth !== undefined && drawn.width > ruler.defaultWidth * DEFAULT_ROOM) return [{ kind: 'overflow', nodes: [], message: `Drawing is ${drawn.width} wide; the limit is ${ruler.defaultWidth}.` }];
  return [];
}

/**
 * The pieces of a drawing without zones that no edge joins are drawn one by one and stand side by side across the
 * reading direction in the order of the text, on further shelves when they would pass the limit.
 */
function layoutPieces(source: Graph, given: Ruler, opts: LayeredOptions): Layout | undefined {
  if (opts.nested === true || !unzoned(source) || given.terminal || (source.clusters?.length ?? 0) > 0) return undefined;
  const pieces = piecesOf(source);
  if (pieces.length < 2) return undefined;
  const td = source.direction === 'TD';
  const parts = pieces.map((p) => ({ ...p, drawn: layoutAt(p.graph, given, { ...opts, legend: false }) }));
  const limit = td ? (opts.maxWidth ?? (given.defaultWidth ?? Infinity) * DEFAULT_ROOM) : (opts.maxHeight ?? Infinity);
  const packed = packPieces(parts, td, limit);
  const diagnostics = [...packed.diagnostics, ...overflowOf(packed, opts, given, td)];
  return withLegend({ ...packed, diagnostics }, given, opts.legend);
}

/**
 * Lays the graph out with the composition the graph asks for. Stages are drawn as lanes of the transposed
 * reading direction, so that the bands cross the reading direction; the result is then labelled with the real one.
 */
function layoutAt(source: Graph, given: Ruler, opts: LayeredOptions): Layout {
  const packed = layoutPieces(source, given, opts);
  if (packed) return packed;
  const plan = planZones(source, opts.composition ?? 'auto');
  const stages = plan.composition === 'stages';
  const lanes = plan.order.flatMap((i) => (source.lanes[i] ? [source.lanes[i]] : []));
  const graph: Graph = { ...source, lanes, direction: stages ? (source.direction === 'LR' ? 'TD' : 'LR') : source.direction };
  const laid = stages ? finalize(prepare(graph, given, opts, true, CANDIDATES[0] as Variant)) : drawLanes(graph, given, opts);
  const drawn = withMixedSides({ ...laid, direction: source.direction, laneAxis: stages ? 'along' : 'across', composition: plan.composition });
  // Without zones the `spread` drawing replaces the usual one only when `spreadWins`.
  const spread = unzoned(source) && !given.terminal && opts.quality === 'best' && opts.quick !== true ? drawSpread(source, given, opts) : undefined;
  const room = { width: opts.maxWidth ?? (given.defaultWidth ?? Infinity) * DEFAULT_ROOM, height: opts.maxHeight ?? Infinity };
  return spread !== undefined && spreadWins(spread, drawn, room, opts.nested !== true || opts.nestedSpread === true) ? spread : drawn;
}

/**
 * Pixel drawings, once the drawing is chosen: an end that comes into a face edges leave from is drawn again on a free
 * face (`settleMixedSides`). The candidates compete without this step. Returns the drawing, the ruler and the edges
 * drawn again, whose labels are placed again; the crossings, off-centre ends and mixed sides are counted again.
 */
function settledSides(drawn: Layout, ruler: Ruler): [Layout, Ruler, ReadonlySet<number>] {
  const none: ReadonlySet<number> = new Set();
  if (ruler.uniform || drawn.pitch === undefined) return [drawn, ruler, none];
  const edges = drawn.edges.map((e) => ({ ...e, points: e.points.map((p) => ({ ...p })) }));
  if (settleMixedSides(edges, drawn.nodes, ruler, portStep(drawn.pitch / 2, ruler)).moved === 0) return [drawn, ruler, none];
  const redrawn = new Set(edges.flatMap((e, i) => (JSON.stringify(e.points) === JSON.stringify(drawn.edges[i]?.points) ? [] : [i])));
  const base = { ...drawn, edges };
  const kept = drawn.diagnostics.filter((d) => d.kind !== 'crossing' && d.kind !== 'off-centre' && d.kind !== 'mixed-side');
  const diagnostics = [...kept, ...crossings(edges), ...offCentreEnds(base), ...mixedSideEnds(base, directionsOf(base))];
  return [{ ...base, diagnostics }, ruler, redrawn];
}

/** Edges that look the same way at a node should leave by the same side of it. */
function withMixedSides(drawn: Layout): Layout {
  const mixed = mixedSideEnds(drawn, directionsOf(drawn));
  return mixed.length === 0 ? drawn : { ...drawn, diagnostics: [...drawn.diagnostics, ...mixed] };
}

/**
 * The `spread` drawing of a graph without zones: every box stands in the stage of its longest path, and the boxes of
 * one stage stand side by side across the reading direction, in the order of the text; a box with several partners in
 * the next stage stands in the middle of them. It is drawn as stages, one zone without a name per stage, and then
 * given back its one unnamed zone. Nothing when the flow has a single stage.
 */
function drawSpread(source: Graph, given: Ruler, opts: LayeredOptions): Layout | undefined {
  const rows = assignLayers(source, source.nodes.map(() => 2), Infinity, 0, false, 'flat');
  const stage = stageOf(source, rows);
  const order = [...new Set(stage)].sort((a, b) => a - b);
  if (order.length < 2) return undefined;
  const home = source.lanes[0] as Graph['lanes'][number];
  const lanes = order.map((s) => ({ id: `${home.id}${s}`, label: '' }));
  const nodes = source.nodes.map((n, i) => ({ ...n, lane: (lanes[order.indexOf(stage[i] ?? 0)] as Graph['lanes'][number]).id }));
  const graph: Graph = { ...source, lanes, nodes, direction: source.direction === 'LR' ? 'TD' : 'LR' };
  // The zones are not drawn, so the stages keep the gap of two neighbours instead of the gap of two zones.
  const ruler: Ruler = { ...given, laneGap: given.rankGap - 2 * given.lanePad };
  const laid = withMixedSides({ ...finalize(prepare(graph, ruler, opts, true, CANDIDATES[0] as Variant)), direction: source.direction, laneAxis: 'along', composition: 'stages' });
  const box = laid.lanes.reduce((b, l) => ({ x0: Math.min(b.x0, l.x), y0: Math.min(b.y0, l.y), x1: Math.max(b.x1, l.x + l.w), y1: Math.max(b.y1, l.y + l.h) }), { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity });
  const whole = { id: home.id, label: '', x: box.x0, y: box.y0, w: box.x1 - box.x0, h: box.y1 - box.y0, labelBox: { x: box.x0, y: box.y0, w: 0, h: 0 } };
  const homeOf = new Map(source.nodes.map((n) => [n.id, n.lane] as const));
  return { ...laid, lanes: [whole], nodes: laid.nodes.map((n) => ({ ...n, lane: homeOf.get(n.id) ?? n.lane })) };
}

function withQuestions(source: Graph, drawn: Layout, given: Ruler, opts: LayeredOptions): Layout {
  if (opts.questions === false || opts.quality === 'fast') return drawn;
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

export function layoutLayered(source: Graph, given: Ruler, options: LayeredOptions = {}): Layout {
  const opts: LayeredOptions = { ...options, quality: options.quality ?? (given.terminal ? 'fast' : 'best') };
  if (!given.terminal || opts.gap !== undefined) return withQuestions(source, given.terminal ? layoutAt(source, given, opts) : refineLabels(...settledSides(layoutAt(source, given, opts), given)), given, opts);
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
  const q = paramsFor(graph, tight, limit, bounded, p.opts.compact === true);
  return (rows) => place(graph, tight, q.baseUnits, graph.lanes.map(() => Infinity), graph.lanes.map(() => 0), q.unit, tight.rankGap, td, q.capacityUnits, q.dummyShift, apart, variant, false, rows);
}

const TERMINAL_CANDIDATES: readonly Variant[] = CANDIDATES.filter((v) => ['forced', 'free', 'forced-unheld'].includes(v.name));

/** Whether some box is wider than the common width by little enough to take three slot units instead of four. */
function hasNarrowBox(graph: Graph, given: Ruler, opts: LayeredOptions): boolean {
  const ruler = layeredRuler(given, opts.gap);
  const m = measureNodes(graph.nodes, graph.lanes, ruler, false);
  return graph.nodes.some((_, i) => unitsOf(m.w[i] ?? 0, m.common, m.unit, ruler.rankGap, true) === 3);
}

/**
 * Lanes. With the best quality in pixels, when a box could take three slot units, the whole set of candidates is drawn
 * twice, with whole pairs and with three units allowed, and the better winner is kept: a better score wins, an equal score the smaller drawing (width times height), and whole pairs when that is equal too.
 */
function drawLanes(graph: Graph, given: Ruler, opts: LayeredOptions): Layout {
  const both = opts.compact === undefined && opts.quality === 'best' && opts.quick !== true && !given.terminal && graph.direction !== 'TD' && hasNarrowBox(graph, given, opts);
  const even = drawCandidates(graph, given, both ? { ...opts, compact: false } : opts);
  if (!both) return even;
  const narrow = drawCandidates(graph, given, { ...opts, compact: true });
  // The narrow sizes win a better score, and an equal score with a smaller drawing.
  const order = compareScores(score(narrow), score(even));
  if (order > 0 || (order === 0 && narrow.width * narrow.height >= even.width * even.height)) return even;
  stats.compact++;
  return narrow;
}

/** Every candidate is drawn to the end and measured, the best is refined by small changes. */
function drawCandidates(graph: Graph, given: Ruler, opts: LayeredOptions): Layout {
  // A terminal drawing tries three candidates and redraws at most 60 times while refining.
  const terminal = given.terminal === true;
  const candidates = opts.quick ? CANDIDATES.slice(0, 1) : terminal ? TERMINAL_CANDIDATES : CANDIDATES;
  // Pixels draw every candidate with rows first (the default gap kept, a second row in every lane) and the first two
  // also in the order that closes gaps first; the terminal keeps the order of gaps first.
  // The candidates forced and free are also drawn with the flows of a lane folded by the head, and by head and tail.
  const fast = opts.quality === 'fast';
  const entries: Array<{ v: Variant; order: Order }> = opts.quick
    ? candidates.map((v) => ({ v, order: 'gap' as Order }))
    : fast
      ? [...TERMINAL_CANDIDATES, FOLDED[0] as Variant].map((v) => ({ v, order: 'rows' as Order }))
      : terminal
        ? [...candidates.map((v) => ({ v, order: 'gap' as Order })), ...FOLDED.slice(0, 2).map((v) => ({ v, order: 'gap' as Order }))]
        : [...candidates.map((v) => ({ v, order: 'rows' as Order })), ...candidates.filter((v) => v.name === 'forced' || v.name === 'free').map((v) => ({ v, order: 'gap' as Order })), ...FOLDED.map((v) => ({ v, order: 'rows' as Order }))];
  // Candidates that came to the same placement draw and refine to the same drawing: the first of them stands for all.
  const seen = new Set<string>();
  const preps = entries
    .map((e) => prepare(graph, given, opts, false, e.v, e.order))
    .filter((p) => {
      const key = `${p.placed.ruler.rankGap}|${p.placed.layers.map((r) => r.join('.')).join('/')}|${p.placed.start.join(',')}|${p.placed.loose}|${p.variant.free}|${p.variant.start}|${p.variant.stage}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  // Drawings with and without one-bend edges both compete.
  const shapes = opts.elbows === false ? [false] : opts.quick ? [true] : [true, false];
  const drawn = preps.flatMap((p) => shapes.map((e) => finalize(p, p.placed, e)));
  if (opts.refine === false || opts.quick || fast) return pickBest(drawn);
  // Only the three candidates whose drawings score best are refined (the earlier one when equal); the others compete as drawn.
  const ranked = preps
    .map((p, i) => ({ p, best: bestOf(drawn.slice(i * shapes.length, (i + 1) * shapes.length)), i }))
    .sort((a, b) => compareScores(a.best, b.best) || a.i - b.i)
    .slice(0, 3)
    .sort((a, b) => a.i - b.i)
    .map((r) => r.p);
  // Every one of them is refined by small changes; the best of all finished drawings is kept. Drawings already made are kept in a table.
  const memo = new Map<string, Layout | null>();
  const refined = [false, true].flatMap((crossingsFirst) =>
    ranked.flatMap((p) => {
      const r = refine(graph, p.placed, (placed) => plainDraw(p, placed, false), { tight: tightPlacer(p), crossingsFirst, memo, tag: `${p.variant.name}|${p.placed.ruler.rankGap}`, ...(terminal ? { maxDraws: 60 } : {}) });
      return r.accepted > 0 ? shapes.map((e) => finalize(p, r.placed, e)) : [];
    }),
  );
  return pickBest([...drawn, ...refined]);
}

function bestOf(drawings: Layout[]): number[] {
  return score(pickBest(drawings));
}

function compareScores(a: number[], b: number[]): number {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return (a[i] as number) - (b[i] as number);
  return 0;
}
