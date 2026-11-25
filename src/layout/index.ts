import type { Ruler } from '../metrics.ts';
import { cellWidth, pixelRuler } from '../metrics.ts';
import { clip } from '../text/fit.ts';
import { wrapWords } from '../text/wrap.ts';
import type { Diagnostic, Graph, Layout, LaneAxis } from '../types.ts';
import type { AlongArrangement } from './along.ts';
import { alongEstimate, arrangeAlong, considerAlong, polishAlong, refineAlong } from './along.ts';
import { bandClusters, flattenedNote, layoutClusters } from './clusters.ts';
import { layoutC4Grid } from '../c4/grid.ts';
import { structuralEstimate } from './estimate.ts';
import { arrangementScore } from './score.ts';
import type { LegendOption } from './legend.ts';
import { compactColumns } from './text-compact.ts';
import { openTextColumns, openTextRows } from './text-room.ts';
import { clearUprightLabels, closeTextColumns, closeTextRows, openTextLabels, packParts, shrinkDots } from './text-tidy.ts';
import { withLegend } from './legend.ts';
import { gridUp, measureNodes } from './place.ts';
import { assignRanks } from './rank.ts';
import { assignRows } from './rows.ts';
import type { SlotResult } from './slots.ts';
import { placeSlots, shiftHalfSteps } from './slots.ts';
import { crossingCount } from './check.ts';
import { mirrorLayout } from './mirror.ts';
import { drawAttached, splitAttached } from '../layered/attach.ts';
import { layoutLayered } from '../layered/index.ts';
import { sharing } from '../layered/ports.ts';
import { costsMore, textCost } from './text-cost.ts';
import type { LayoutOptions as SolveOptions } from './solve.ts';
import { solve } from './solve.ts';

export interface LayoutOptions extends SolveOptions {
  /** `false` drops the legend; an object replaces the captions of the styles it names. */
  legend?: LegendOption;
  /**
   * 'across' keeps lanes parallel to the flow axis, 'along' places them one after another along it.
   * 'auto' (the default) tries 'along' only when edges between lanes far outnumber edges inside lanes.
   */
  laneAxis?: 'auto' | LaneAxis;
  /** 'layered' (the default) is the layered pipeline of `src/layered`; 'grid' is the slot-based placer. */
  engine?: 'grid' | 'layered';
  /** Layered engine only: bands alongside the reading direction ('lanes') or crossing it ('stages'); chosen from the graph when 'auto'. */
  composition?: 'auto' | 'lanes' | 'stages';
  /** Layered engine only: add questions about the structure to the diagnostics (default true). */
  questions?: boolean;
  /** Layered engine only: let edges between layers leave or enter through the side of a box (default true). */
  elbows?: boolean;
  /** Layered engine only: 'fast' or 'best' (pixels: best, terminal: fast); see `LayeredOptions.quality`. */
  quality?: 'fast' | 'best';
  /** Layered engine only: draw the first candidate only and refine nothing. */
  quick?: boolean;
  /** Layered engine only: cut paths and give up alignment when a drawing is still too wide after blocks moved to other rows (default true). */
  fold?: boolean;
  /** Terminal drawings: `false` leaves a drawing that is too wide as it is, instead of pushing it to the left and cutting its texts shorter. */
  squeeze?: boolean;
  /** Terminal drawings: `false` never cuts the lines of boxes divided into compartments (the caller wraps them narrower itself). */
  clip?: boolean;
  /**
   * Terminal drawings of the layered engine: `true` lets lines without a label that end alike on one side of a box share one line of that side, `false` gives
   * every line end a line of its own. Absent, both are drawn and the drawing with shared lines is kept when it costs no more in any respect (see `TextCost`) and
   * less in one, and only when lines do share in it and its bands are arranged as without; a quick drawing and a drawing that is too wide without shared lines
   * never share.
   */
  sharePorts?: boolean;
  /** Terminal drawings: `false` leaves out the rows and columns that arrowheads and the rules of bands ask for; such a drawing is for comparing with another, not for showing. */
  room?: boolean;
  /** Layered engine only: try small changes on the chosen drawing (default true). */
  refine?: boolean;
  /** Layered engine only: the graph is one level of a drawing with clusters, so edges outside it join its boxes; it keeps the lane model and is not laid out as stages or in shelves of pieces (default false). */
  nested?: boolean;
  /** Clusters only: `true` or `false` forces the straight exits of lines from clusters, the crossing order along a border and the ordering of ports on or off; absent, both are drawn and the one with fewer crossings, then bends, then length is kept (a tie keeps them off). */
  clusterExits?: boolean;
  /** Clusters only: lets a level inside a cluster take the `spread` drawing when it wins (default false). `layoutClusters` draws with it on as a further candidate and keeps whichever whole drawing is better. */
  nestedSpread?: boolean;
  /** Clusters only: see `LayeredOptions.spreadProbe`. */
  spreadProbe?: { wins: boolean };
}

export type { LegendOption } from './legend.ts';
export { withLegend } from './legend.ts';

/**
 * Number of slot units the canvas holds, and how many of them each node covers. A unit is half of a box
 * plus half a gap; a normal box covers two. Without a known canvas length every rank gets its own pair.
 */
export function canvasSlots(
  graph: Graph,
  ruler: Ruler,
  ranks: number,
  opts: Pick<SolveOptions, 'maxWidth' | 'maxHeight'>,
): { columns: number; span: Map<string, number> } {
  const td = graph.direction === 'TD';
  const m = measureNodes(graph.nodes, graph.lanes, ruler, td);
  const limit = td ? opts.maxHeight : (opts.maxWidth ?? ruler.defaultWidth);
  const fixed = 2 * gridUp(ruler, ruler.trackGap) + m.gutter + 2 * ruler.lanePad;
  const wanted = new Map<string, number>();
  if (!td) {
    graph.nodes.forEach((n, i) => {
      const own = m.w[i] ?? 0;
      if (own > m.common) wanted.set(n.id, 2 * Math.max(1, Math.ceil((own + ruler.rankGap) / m.unit / 2 - 1e-9)));
    });
  }
  const unbounded = limit === undefined || !Number.isFinite(limit);
  // Without a canvas every rank gets its own pair of units, and wide boxes bring the units they cover beyond a pair; they cover an even number of units, so the boxes after them stay on even units.
  const extra = [...wanted.values()].reduce((sum, s) => sum + s - 2, 0);
  const columns = unbounded
    ? Math.max(2, 2 * ranks + extra)
    : Math.max(2, Math.floor((limit - fixed + ruler.rankGap) / m.unit + 1e-9));
  const span = new Map([...wanted].map(([id, s]) => [id, Math.min(columns, s)] as const));
  return { columns, span };
}

/**
 * Spreads leftover canvas width evenly: the rank gap grows by whole pairs of node grid steps (so a slot unit
 * stays on the grid), the same everywhere, up to twice the default and never past the canvas.
 */
function justify(drawn: Layout, ruler: Ruler, limit: number | undefined, draw: (r: Ruler) => Layout, boxWidth: number): Layout {
  if (limit === undefined || !Number.isFinite(limit) || drawn.direction !== 'LR' || drawn.width >= limit) return drawn;
  let best = drawn;
  for (let gap = ruler.rankGap + 2 * ruler.nodeGrid; gap <= 2 * ruler.rankGap && gap <= boxWidth - 2 * ruler.nodeGrid; gap += 2 * ruler.nodeGrid) {
    const wider = draw({ ...ruler, rankGap: gap });
    if (wider.width > limit) break;
    best = wider;
  }
  return best;
}

/** A drawing that overflows its canvas because channels grew is placed again with one column fewer. */
const MAX_NARROWINGS = 6;

interface AcrossStart {
  sized: ReturnType<typeof canvasSlots>;
  placed: SlotResult;
  rank: Map<string, number>;
  row: Map<string, number>;
}

/** Slot assignment of the first, widest attempt of the parallel-lane arrangement; no routing happens here. */
function startAcross(graph: Graph, ruler: Ruler, opts: SolveOptions): AcrossStart {
  const { maxHeight, ...solveOpts } = opts;
  const rank = assignRanks(graph);
  const row = assignRows(graph, rank);
  const ranks = Math.max(0, ...rank.values()) + 1;
  const sized = canvasSlots(graph, ruler, ranks, { ...solveOpts, ...(maxHeight === undefined ? {} : { maxHeight }) });
  return { sized, placed: slotsFor(graph, ruler, rank, row, sized, sized.columns), rank, row };
}

function slotsFor(graph: Graph, ruler: Ruler, rank: Map<string, number>, row: Map<string, number>, sized: AcrossStart['sized'], columns: number): SlotResult {
  const span = new Map([...sized.span].map(([id, s]) => [id, Math.min(s, columns)] as const));
  const m = measureNodes(graph.nodes, graph.lanes, ruler, graph.direction === 'TD');
  return placeSlots({ graph, rank, row, columns, span, gap: ruler.rankGap / m.unit });
}

/** Crossings, detours, bends and half-step boxes of a drawing, in the order they decide between two drawings. */
function quality(l: Layout): number[] {
  return [
    crossingCount(l.edges),
    l.diagnostics.filter((d) => d.kind === 'detour').length,
    l.edges.reduce((n, e) => n + Math.max(0, e.points.length - 2), 0),
    l.nodes.filter((n) => n.rank % 2 === 1).length,
  ];
}

const better = (a: number[], b: number[]): boolean => {
  for (let i = 0; i < a.length; i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) < (b[i] ?? 0);
  return false;
};

/** Lanes as bands parallel to the flow axis. */
function layoutAcross(graph: Graph, ruler: Ruler, opts: SolveOptions, start: AcrossStart = startAcross(graph, ruler, opts), fit = false): Layout {
  const { sized, rank, row } = start;
  const limit = opts.maxWidth ?? ruler.defaultWidth;
  const bounded = limit !== undefined && Number.isFinite(limit);
  let drawn: Layout | undefined;
  let placed = start.placed;
  let squeezedGap = false;
  let used = ruler;
  for (let columns = sized.columns, tries = 0; ; columns -= 1, tries++) {
    used = ruler;
    placed = tries === 0 ? start.placed : slotsFor(graph, ruler, rank, row, sized, columns);
    drawn = solve(graph, ruler, placed.rank, placed.row, bounded ? { maxWidth: limit } : {}, placed.span);
    let tooWide = graph.direction === 'LR' && bounded && drawn.width > limit;
    if (tooWide && limit !== undefined) {
      // Before giving up a column, close the gaps by one pair of node grid steps.
      const tight = { ...ruler, rankGap: ruler.rankGap - 2 * ruler.nodeGrid };
      if (tight.rankGap >= ruler.nodeGrid) {
        const squeezed = solve(graph, tight, placed.rank, placed.row, { maxWidth: limit }, placed.span);
        if (squeezed.width <= limit) {
          drawn = squeezed;
          tooWide = false;
          squeezedGap = true;
          used = tight;
        }
      }
    }
    if (!tooWide || columns <= 2 || tries >= MAX_NARROWINGS) break;
  }
  // The predicted crossings and the routed ones can differ: when the routed drawing has any, the next-best assignments are routed too.
  if (quality(drawn)[0] !== 0 || quality(drawn)[1] !== 0) {
    for (const alt of (placed.rest?.() ?? []).slice(0, 3)) {
      const l = solve(graph, used, alt.rank, alt.row, bounded ? { maxWidth: limit } : {}, alt.span);
      if ((!bounded || l.width <= (limit ?? Infinity)) && better(quality(l), quality(drawn))) {
        drawn = l;
        placed = alt;
      }
    }
  }
  if (!fit || !bounded || squeezedGap) return drawn;
  const final = placed;
  return justify(drawn, ruler, limit, (r) => solve(graph, r, final.rank, final.row, { maxWidth: limit }, final.span), measureNodes(graph.nodes, graph.lanes, ruler, false).common);
}

/** Slots of the parallel-lane arrangement: lanes stack across the flow axis, rows are local to a lane. */
function acrossEstimate(graph: Graph, placed: SlotResult): number {
  const offset = new Map<string, number>();
  let next = 0;
  for (const lane of graph.lanes) {
    offset.set(lane.id, next);
    const rows = graph.nodes.filter((n) => n.lane === lane.id).map((n) => placed.row.get(n.id) ?? 0);
    next += rows.length === 0 ? 0 : Math.max(...rows) + 1;
  }
  const slots = new Map(
    graph.nodes.map((n) => [n.id, { flow: placed.rank.get(n.id) ?? 0, cross: (offset.get(n.lane) ?? 0) + (placed.row.get(n.id) ?? 0) }] as const),
  );
  return structuralEstimate(graph.edges, slots);
}

/** Lanes as bands one after another along the flow axis. */
function layoutAlong(arranged: AlongArrangement, ruler: Ruler, opts: SolveOptions, fit = false): Layout {
  const limit = opts.maxWidth ?? ruler.defaultWidth;
  const bounded = limit !== undefined && Number.isFinite(limit);
  // The arrangement counts whole columns; every column is two slot units.
  const units = new Map([...arranged.rank].map(([id, r]) => [id, 2 * r] as const));
  const bands = new Map(
    arranged.graph.nodes.map((n) => {
      const k = Math.max(0, arranged.spec.lanes.findIndex((l) => l.id === arranged.spec.laneOf.get(n.id)));
      return [n.id, [2 * (arranged.spec.starts[k] ?? 0), k + 1 < arranged.spec.starts.length ? 2 * (arranged.spec.starts[k + 1] ?? 0) : Infinity] as const] as const;
    }),
  );
  const rank = shiftHalfSteps(arranged.graph, units, arranged.row, new Map(), ruler.rankGap / measureNodes(arranged.graph.nodes, arranged.graph.lanes, ruler, arranged.graph.direction === 'TD').unit, bands);
  const spec = { ...arranged.spec, starts: arranged.spec.starts.map((a) => 2 * a) };
  const draw = (r: Ruler): Layout => solve(arranged.graph, r, rank, arranged.row, bounded ? { maxWidth: limit } : {}, new Map(), spec);
  const drawn = draw(ruler);
  return fit ? justify(drawn, ruler, limit, draw, measureNodes(arranged.graph.nodes, arranged.graph.lanes, ruler, false).common) : drawn;
}

/**
 * A graph that reads right to left or bottom to top is laid out in the opposite direction and its drawing is flipped.
 * A terminal drawing is not flipped; it says so in its diagnostics.
 */
function layoutMirrored(graph: Graph, how: 'RL' | 'BT', ruler: Ruler, opts: LayoutOptions): Layout {
  const { mirror: _mirror, ...plain } = graph;
  if (ruler.terminal === true) {
    // The caller closes and opens the rows of what comes back.
    const drawn = layoutOnce(plain, ruler, opts).closed;
    const note: Diagnostic = { kind: 'direction-mirrored-in-text', nodes: [], message: `The direction ${how} is drawn as ${plain.direction} in text.` };
    return { ...drawn, diagnostics: [...drawn.diagnostics, note] };
  }
  const bare = layout(plain, ruler, { ...opts, legend: false });
  return withLegend(mirrorLayout(bare, how, { width: bare.width, height: bare.height }), ruler, opts.legend);
}

/**
 * Lays the graph out. When edges between lanes far outnumber edges inside lanes, the lanes are also tried
 * one after another along the flow axis and the drawing with the better score is kept. The choice is made
 * with the pixel ruler (the given ruler when it is one), so every medium shows the same arrangement.
 */
export function layout(graph: Graph, given: Ruler, opts: LayoutOptions = {}): Layout {
  const out = (drawn: Drawn): Layout => (opts.room === false ? drawn.closed : drawn.opened());
  // A quick drawing is what a caller chooses a setting on: it never shares ports, so that the choice does not turn on them.
  if (given.terminal !== true || opts.nested === true || opts.sharePorts !== undefined || opts.quick === true) return out(layoutOnce(graph, given, opts));
  // Lines that share a port on the side of a box leave the box shorter, and may cost elsewhere: the drawing is made
  // with shared ports and without, and the one with shared ports is kept only when it costs no more in any respect
  // and less in one. Where no line found a port to share there is one drawing only. The two are compared before the
  // rows that arrowheads and bands ask for are opened: those rows are owed either way.
  const before = sharing.placements;
  const joined = layoutOnce(graph, given, { ...opts, sharePorts: true });
  const shares = joined.closed.edges.some((e) => e.sharedPort !== undefined);
  if (sharing.placements === before && !shares) return out(joined);
  const apart = layoutOnce(graph, given, { ...opts, sharePorts: false });
  // Sharing ports changes the width of a drawing on the way, and with it the arrangement that fits: a drawing in which
  // no line shares a port after all, or one whose bands are arranged another way, is not kept for it.
  if (!shares || arrangementOf(joined.closed) !== arrangementOf(apart.closed)) return out(apart);
  const own = textCost(apart.closed);
  // A drawing that is too wide without shared ports is given as it is, so that a caller that draws again for the width does what it did without them.
  const limit = opts.maxWidth ?? given.defaultWidth;
  if (limit !== undefined && Number.isFinite(limit) && Math.max(apart.closed.width, own.width) > limit) return out(apart);
  const shared = textCost(joined.closed);
  return out(costsMore(shared, own) || !costsMore(own, shared) ? apart : joined);
}

/** How the bands of a drawing are arranged: alongside the reading direction or across it, and which bands there are. */
const arrangementOf = (l: Layout): string => [l.composition, l.laneAxis, ...l.lanes.map((lane) => lane.id)].join('|');

/** A drawing as it is compared with another (`closed`), and as it is given out: a terminal drawing with its rows opened. */
interface Drawn {
  closed: Layout;
  opened: () => Layout;
}

function layoutOnce(graph: Graph, given: Ruler, opts: LayoutOptions): Drawn {
  const drawn = layoutAny(graph, given, opts);
  if (given.terminal !== true || opts.nested === true) return { closed: drawn, opened: () => drawn };
  const limit = opts.maxWidth ?? given.defaultWidth;
  const over = (l: Layout): boolean => opts.squeeze !== false && limit !== undefined && Number.isFinite(limit) && l.width > limit;
  // Rows and columns are closed first, so that a label is given the room that frees.
  const close = (l: Layout): Layout => openTextLabels(closeTextColumns(closeTextRows(shrinkDots(l))), limit);
  // A drawing that is still too wide once its rows and columns are closed is pushed to the left.
  const finish = (fitted: Layout, room: boolean): Layout => {
    // A label that moves to its place beside an upright line may come to stand behind an arrowhead: the rows are opened once more after it.
    const closed = room ? openTextRows(clearUprightLabels(openTextRows(fitted), true)) : clearUprightLabels(fitted);
    const fit = (): Layout => {
      if (!over(closed)) return closed;
      const pushed = openTextLabels(compactColumns(closed), limit);
      // Still too wide: the labels on level lines give way, and are cut to the room they are left.
      return over(pushed) ? openTextLabels(compactColumns(closed, true), limit) : pushed;
    };
    const narrow = fit();
    if (!room) return packParts(narrow, limit);
    // The columns an arrowhead on the side of a box asks for never take a drawing over the limit.
    const wider = openTextColumns(narrow, limit);
    return packParts(over(wider) && !over(narrow) ? narrow : wider, limit);
  };
  let source = close(drawn);
  let best = finish(source, false);
  // A drawing too wide with notes beside its boxes: the notes are wrapped narrower until it fits.
  if (over(best) && limit !== undefined && graph.nodes.some((n) => n.attach !== undefined && n.lines.length > 0)) {
    for (const cells of [28, 22, 16]) {
      const narrow: Graph = { ...graph, nodes: graph.nodes.map((n) => (n.attach === undefined ? n : { ...n, lines: wrapWords(n.lines.join(' '), cells, cellWidth) })) };
      const fitted = close(layoutAny(narrow, given, opts));
      const tried = finish(fitted, false);
      if (tried.width < best.width) [source, best] = [fitted, tried];
      if (best.width <= limit) break;
    }
  }
  // A drawing of boxes divided into compartments that is still too wide: every line is cut shorter, from 40 cells down to 8.
  if (opts.clip !== false && over(best) && limit !== undefined && graph.nodes.some((n) => n.compartments !== undefined)) {
    for (let cells = 40; best.width > limit && cells >= 8; cells -= 4) {
      const cutLines = (ls: string[]): string[] => ls.map((t) => clip(t, cells));
      const short: Graph = {
        ...graph,
        nodes: graph.nodes.map((n) => ({
          ...n,
          title: clip(n.title, cells),
          lines: n.attach === undefined ? cutLines(n.lines) : wrapWords(n.lines.join(' '), Math.min(cells, 16), cellWidth),
          ...(n.compartments === undefined
            ? {}
            : { compartments: n.compartments.map((c) => ({ ...c, lines: cutLines(c.lines), ...(c.columns === undefined ? {} : { columns: c.columns.map((row) => row.map((cell) => clip(cell, Math.max(4, Math.floor(cells / Math.max(1, row.length)))))) }) })) }),
        })),
      };
      const fitted = close(layoutAny(short, given, opts));
      const tried = finish(fitted, false);
      if (tried.width < best.width) [source, best] = [fitted, tried];
    }
  }
  const chosen = source;
  return { closed: best, opened: () => finish(chosen, true) };
}

/** Terminal drawings: a compartment with nothing in it takes no rows; the name of the box always stays. */
function withoutEmptyCompartments(graph: Graph): Graph {
  const empty = (lines: readonly string[]): boolean => lines.every((t) => t.trim() === '');
  if (!graph.nodes.some((n) => n.compartments?.some((c, i) => i > 0 && empty(c.lines)))) return graph;
  return { ...graph, nodes: graph.nodes.map((n) => (n.compartments === undefined ? n : { ...n, compartments: n.compartments.filter((c, i) => i === 0 || !empty(c.lines)) })) };
}

function layoutAny(source: Graph, given: Ruler, opts: LayoutOptions): Layout {
  const graph = given.terminal === true ? withoutEmptyCompartments(source) : source;
  const ruler: Ruler = graph.gaps === undefined || given.terminal === true ? given : { ...given, ...(graph.gaps.flow === undefined ? {} : { rankGap: graph.gaps.flow }), ...(graph.gaps.join === undefined ? {} : { joinGap: graph.gaps.join }) };
  const attached = splitAttached(graph);
  if (attached === undefined) return arrange(graph, ruler, opts);
  // Notes and lollipop stubs are not arranged: they are drawn beside their nodes once everything else has its place.
  const { legend: _drawn, ...bare } = arrange(attached.graph, ruler, opts);
  return withLegend(drawAttached(bare, attached, ruler), ruler, opts.legend);
}

function arrange(graph: Graph, ruler: Ruler, opts: LayoutOptions): Layout {
  if (graph.placer === 'c4-grid' && ruler.terminal !== true) return layoutC4Grid(graph, ruler, opts);
  if (graph.clusters !== undefined && graph.clusters.length > 0) {
    if (ruler.terminal !== true) return layoutClusters(graph, ruler, opts, (g, r, o) => layout(g, r, { ...o, nested: true }));
    // Bands side by side cannot fold: when they are too wide the bands are stacked, and when that is too wide as well no band is drawn.
    const banded = bandClusters(graph);
    const home = banded.lanes.find((lane) => lane.label === '') ?? { id: '', label: '' };
    const { zones: _zones, ...unzoned } = banded;
    const plain: Graph = { ...unzoned, lanes: [home], nodes: banded.nodes.map((n) => ({ ...n, lane: home.id })) };
    const limit = opts.maxWidth ?? ruler.defaultWidth;
    const tries: Array<() => Layout> = [() => layoutAny(banded, ruler, opts), () => layoutAny(banded, ruler, { ...opts, composition: 'lanes' }), () => layoutAny(plain, ruler, opts)];
    let flat: Layout | undefined;
    for (const draw of opts.composition === undefined ? tries : [tries[0] as () => Layout, tries[2] as () => Layout]) {
      const drawn = draw();
      if (flat === undefined || drawn.width < flat.width) flat = drawn;
      if (limit === undefined || !Number.isFinite(limit) || flat.width <= limit) break;
    }
    const kept = flat as Layout;
    return { ...kept, diagnostics: [...kept.diagnostics, flattenedNote()] };
  }
  if (graph.mirror !== undefined) return layoutMirrored(graph, graph.mirror, ruler, opts);
  const { legend, laneAxis = 'auto', engine = 'layered', composition, refine, questions, elbows, fold, quick, quality, nested, nestedSpread, spreadProbe, squeeze: _squeeze, clip: _clip, ...solveOpts } = opts;
  if (engine === 'layered') return layoutLayered(graph, ruler, { ...solveOpts, ...(legend === undefined ? {} : { legend }), ...(composition === undefined ? {} : { composition }), ...(refine === undefined ? {} : { refine }), ...(questions === undefined ? {} : { questions }), ...(elbows === undefined ? {} : { elbows }), ...(fold === undefined ? {} : { fold }), ...(quick === undefined ? {} : { quick }), ...(quality === undefined ? {} : { quality }), ...(nested === undefined ? {} : { nested }), ...(nestedSpread === undefined ? {} : { nestedSpread }), ...(spreadProbe === undefined ? {} : { spreadProbe }) });
  if (laneAxis === 'across' || (laneAxis === 'auto' && !considerAlong(graph))) {
    return withLegend(layoutAcross(graph, ruler, solveOpts, undefined, true), ruler, legend);
  }
  const native = ruler.defaultWidth !== undefined;
  const reference = native ? ruler : pixelRuler();
  const referenceOpts: SolveOptions = native ? solveOpts : {};
  const limit = referenceOpts.maxWidth ?? reference.defaultWidth;
  const score = (layout: Layout): number => arrangementScore(layout, limit);
  const start = startAcross(graph, reference, referenceOpts);
  const constructed = polishAlong(arrangeAlong(graph));
  // Gate: the parallel arrangement is returned untouched unless slots alone say the other one is better.
  if (laneAxis === 'auto' && alongEstimate(constructed) >= acrossEstimate(graph, start.placed)) {
    return withLegend(layoutAcross(graph, ruler, solveOpts, native ? start : undefined, true), ruler, legend);
  }
  const routed = new Map<AlongArrangement, Layout>();
  const route = (a: AlongArrangement): number => {
    const l = layoutAlong(a, reference, referenceOpts);
    routed.set(a, l);
    return score(l);
  };
  const arranged = refineAlong(constructed, route(constructed), route);
  const along = routed.get(arranged) ?? layoutAlong(arranged, reference, referenceOpts);
  const across = layoutAcross(graph, reference, referenceOpts, start);
  const useAlong = laneAxis === 'along' || score(along) < score(across);
  const chosen = useAlong ? layoutAlong(arranged, ruler, solveOpts, true) : layoutAcross(graph, ruler, solveOpts, native ? start : undefined, true);
  return withLegend(chosen, ruler, legend);
}
