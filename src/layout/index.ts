import type { Ruler } from '../metrics.ts';
import { cellWidth } from '../metrics.ts';
import { clip } from '../text/fit.ts';
import { wrapWords } from '../text/wrap.ts';
import type { Diagnostic, Graph, Layout } from '../types.ts';
import { bandClusters, flattenedNote, layoutClusters } from './clusters.ts';
import { layoutC4Grid } from '../c4/grid.ts';
import type { LegendOption } from './legend.ts';
import { compactColumns } from './text-compact.ts';
import { closeSpareRows, openTextColumns, openTextRows } from './text-room.ts';
import { endTextsClear } from './text-ends.ts';
import { clearUprightLabels, closeTextColumns, closeTextRows, cutLeftLabels, cutPastLimit, labelsInSight, openTextLabels, packParts, shrinkDots } from './text-tidy.ts';
import { withLegend } from './legend.ts';
import { layoutRanks } from './text-ranks.ts';
import { mirrorLayout } from './mirror.ts';
import { drawAttached, splitAttached } from '../layered/attach.ts';
import { layeredRuler, layoutLayered } from '../layered/index.ts';
import { sharing } from '../layered/ports.ts';
import type { TextCost } from './text-cost.ts';
import { costsMore, textCost, writtenOf } from './text-cost.ts';
import type { Breaks } from './text-intact.ts';
import { adjacentOf, breaksMore, breaksOf } from './text-intact.ts';
import { renderTextLayout } from '../render/text.ts';

export interface LayoutOptions {
  /** Canvas width; the pixel ruler defaults to its own canvas width. */
  maxWidth?: number;
  /** Canvas height for top-down drawings, where the flow axis is vertical; unbounded when absent. */
  maxHeight?: number;
  /** `false` drops the legend; an object replaces the captions of the styles it names. */
  legend?: LegendOption;
  /** bands alongside the reading direction ('lanes') or crossing it ('stages'); chosen from the graph when 'auto'. */
  composition?: 'auto' | 'lanes' | 'stages';
  /** 'fast' or 'best' (pixels: best, terminal: fast); see `LayeredOptions.quality`. */
  quality?: 'fast' | 'best';
  /** draw the first candidate only and refine nothing. */
  quick?: boolean;
  /** cut paths and give up alignment when a drawing is still too wide after blocks moved to other rows (default true). */
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
  /**
   * Terminal drawings: `true` draws a graph by its ranks wherever it can be (see `layoutRanks`), so that the boxes a box leads to stand side by side, `false` never
   * does. Absent, the graph is drawn both ways and the drawing by ranks is kept unless it crosses more lines or breaks a line, a box or a label the other keeps whole (see `breaksOf`).
   */
  ranked?: boolean;
  /**
   * Terminal drawings: `true` gives the usual drawing, which every drawing made otherwise is held against: it is not drawn by ranks or with its bands alongside, its labels are not
   * brought into sight, its spare rows are not taken out and the texts at the ends of its lines are not moved. A quick drawing is the usual one unless this is `false`.
   */
  bare?: boolean;
  /** Terminal drawings: `false` leaves out the rows and columns that arrowheads and the rules of bands ask for; such a drawing is for comparing with another, not for showing. */
  room?: boolean;
  /** try small changes on the chosen drawing (default true). */
  refine?: boolean;
  /** the graph is one level of a drawing with clusters, so edges outside it join its boxes; it keeps the lane model and is not laid out as stages or in shelves of pieces (default false). */
  nested?: boolean;
  /** Clusters only: `true` or `false` forces the straight exits of lines from clusters, the crossing order along a border and the ordering of ports on or off; absent, both are drawn and the one with fewer crossings, then bends, then length is kept (a tie keeps them off). */
  clusterExits?: boolean;
  /** Clusters only: lets a level inside a cluster take the `spread` drawing when it wins (default false). `layoutClusters` draws with it on as a further candidate and keeps whichever whole drawing is better. */
  nestedSpread?: boolean;
  /** Clusters only: see `LayeredOptions.spreadProbe`. */
  spreadProbe?: { wins: boolean };
}

/**
 * The options inside the engine: a caller's, and `questions: false`, which the levels of a drawing with clusters are
 * drawn with; the drawing as a whole asks its questions.
 */
export interface EngineOptions extends LayoutOptions {
  /** Add questions about the structure to the diagnostics (default true). */
  questions?: boolean;
}

export type { LegendOption } from './legend.ts';
export { withLegend } from './legend.ts';

/**
 * A graph that reads right to left or bottom to top is laid out in the opposite direction and its drawing is flipped.
 * A terminal drawing is not flipped; it says so in its diagnostics.
 */
function layoutMirrored(graph: Graph, how: 'RL' | 'BT', ruler: Ruler, opts: EngineOptions): Layout {
  const { mirror: _mirror, ...plain } = graph;
  if (ruler.terminal === true) {
    // The caller closes and opens the rows of what comes back.
    const drawn = layoutOnce(plain, ruler, opts, graph).closed;
    const note: Diagnostic = { kind: 'direction-mirrored-in-text', nodes: [], message: `The direction ${how} is drawn as ${plain.direction} in text.` };
    return { ...drawn, diagnostics: [...drawn.diagnostics, note] };
  }
  const bare = layoutWith(plain, ruler, { ...opts, legend: false });
  return withLegend(mirrorLayout(bare, how, { width: bare.width, height: bare.height }), ruler, opts.legend);
}

/** Lays the graph out with the layered engine of `src/layered`. */
export function layout(graph: Graph, given: Ruler, opts: LayoutOptions = {}): Layout {
  return layoutWith(graph, given, opts);
}

/** `layout` with the options inside the engine. */
export function layoutWith(graph: Graph, given: Ruler, opts: EngineOptions = {}): Layout {
  const picked = layoutPicked(graph, given, opts);
  // A caller that names whether lines share ports compares drawings made each way: it gets the one it names.
  if (given.terminal !== true || given.spaced !== undefined || opts.nested === true || opts.quick === true || opts.bare === true || opts.room === false || opts.sharePorts !== undefined) return picked;
  // Two arrowheads into one side of a box in neighbouring cells, or two lines of one box in neighbouring columns, read
  // as one. The drawing is made again with a blank cell between ports and between tracks, and kept when it has fewer
  // of them, fits the width, crosses no more lines and breaks nothing more (see `breaksOf`). It may be wider and longer.
  // When it does not, every box is made a cell wider on either side too, for a label that lost its room to a port.
  // A spaced drawing is never narrower, so a drawing already too wide is not spaced, and boxes are not widened when
  // spaced ports alone are too wide. A caller that fits the width draws again narrower: that drawing is spaced.
  const labels = labelsOf(graph);
  const limit = opts.maxWidth ?? given.defaultWidth;
  const fits = (l: Layout): boolean => limit === undefined || !Number.isFinite(limit) || (l.width <= limit && textCost(l).width <= limit);
  if (!fits(picked)) return picked;
  const crowded = adjacentOf(breaksIn(picked, labels, limit));
  if (crowded === 0) return picked;
  for (const how of ['ports', 'wide'] as const) {
    // Drawn once, with no other way of drawing it to choose from: the choice is the one against the drawing it replaces.
    const spaced = layoutShared(graph, { ...given, spaced: how }, opts).opened();
    if (!fits(spaced)) return picked;
    if (adjacentOf(breaksIn(spaced, labels, limit)) < crowded && keeps(spaced, picked, labels, limit)) return spaced;
  }
  return picked;
}

function layoutPicked(graph: Graph, given: Ruler, opts: EngineOptions): Layout {
  const out = (drawn: Drawn): Layout => (opts.room === false ? drawn.closed : drawn.opened());
  // A quick drawing is what a caller chooses a setting on: it is the usual drawing, so that the setting chosen is the one the usual drawing would choose.
  if (given.terminal !== true || opts.nested === true || opts.quick === true || opts.bare === true) return out(layoutShared(graph, given, opts));
  // A drawing without room is one to compare, and a caller that names the composition or the ports gets what it names: none is drawn another way.
  const plain = opts.room === false || (opts.composition ?? 'auto') !== 'auto' || opts.sharePorts !== undefined;
  const limit = opts.maxWidth ?? given.defaultWidth;
  const ranks = plain || opts.ranked === false ? undefined : layoutRanks(graph, given, limit);
  const ranked = ranks === undefined ? undefined : withLegend(ranks, layeredRuler(given), opts.legend);
  if (ranked !== undefined && opts.ranked === true) return ranked;
  const labels = labelsOf(graph);
  // Every drawing made otherwise is held against the usual drawing, arranged once for both: it crosses no more lines, and breaks no line, box or label the usual drawing keeps whole.
  const usual = out(layoutShared(graph, given, { ...opts, bare: true }));
  const tidied = out(layoutShared(graph, given, opts));
  const flow = tidied === usual || sameRows(tidied, usual, limit) || keeps(tidied, usual, labels, limit) ? tidied : usual;
  if (ranked !== undefined) return worthIt(ranked, flow, labels, limit) ? ranked : flow;
  // The subgraphs of a flowchart written across are drawn as bands that follow one another, their boxes set across the flow, or as bands that run alongside it. The
  // bands alongside are kept when more lines then lead the way the flow is written, unless they do not fit the width, are much longer, or lose something.
  if (plain || graph.zones !== 'groups' || flow.composition !== 'stages' || graph.direction !== 'LR') return flow;
  const alongside = out(layoutShared(graph, given, { ...opts, composition: 'lanes' }));
  const fits = limit === undefined || !Number.isFinite(limit) || Math.max(alongside.width, textCost(alongside).width) <= limit;
  return fits && onward(alongside) > onward(flow) && worthIt(alongside, flow, labels, limit) ? alongside : flow;
}

/** The labels of the lines of a graph. */
const labelsOf = (graph: Graph): string[] => graph.edges.flatMap((e) => (e.label === undefined || e.label === '' ? [] : [e.label]));

/** How many lines of a drawing lead to a box that stands wholly further on in the direction the drawing is written in. */
function onward(l: Layout): number {
  const nodes = new Map(l.nodes.map((n) => [n.id, n] as const));
  const down = l.direction === 'TD' || l.direction === 'BT';
  return l.edges.filter((e) => {
    const [a, b] = [nodes.get(e.from), nodes.get(e.to)];
    return a !== undefined && b !== undefined && e.invisible !== true && (down ? b.y >= a.y + a.h : b.x >= a.x + a.w);
  }).length;
}

/** Whether two drawings are written out alike. */
function sameRows(a: Layout, b: Layout, limit: number | undefined): boolean {
  const [x, y] = [writtenOut(a, limit), writtenOut(b, limit)];
  return x.length === y.length && x.every((row, i) => row === y[i]);
}

/** Whether a drawing crosses no more lines than another and breaks nothing more where it is written out (see `breaksOf`). */
function keeps(other: Layout, usual: Layout, labels: readonly string[], limit: number | undefined): boolean {
  return textCost(other).crossings <= textCost(usual).crossings && !breaksMore(breaksIn(other, labels, limit), breaksIn(usual, labels, limit));
}

/** What a drawing made another way may not cost more than the drawing it replaces. Its width is held by the limit alone; it may be longer and bend more. */
const KEPT: ReadonlyArray<keyof TextCost> = ['crossings', 'touches', 'cut', 'hidden', 'crossed'];

/**
 * Whether a drawing made another way replaces the usual one: it crosses no more lines, and breaks nothing more where
 * it is written out (see `breaksOf`): no line, box or label that the usual drawing keeps whole.
 */
function worthIt(other: Layout, usual: Layout, labels: readonly string[], limit: number | undefined): boolean {
  const [mine, theirs] = [textCost(other), textCost(usual)];
  if (!KEPT.every((k) => mine[k] <= theirs[k])) return false;
  return !breaksMore(breaksIn(other, labels, limit), breaksIn(usual, labels, limit));
}

/** The breaks of a terminal drawing as it is written out, counted once for every drawing. */
const counted = new WeakMap<Layout, Breaks>();
function breaksIn(l: Layout, labels: readonly string[], limit: number | undefined): Breaks {
  const known = counted.get(l);
  if (known !== undefined) return known;
  const found = breaksOf(l, writtenOut(l, limit), labels);
  counted.set(l, found);
  return found;
}

/** The rows a terminal drawing is written in, as it is given out. */
const written = new WeakMap<Layout, string[]>();
function writtenOut(l: Layout, limit: number | undefined): string[] {
  // Only the names of bands are written past the width of a drawing, up to the limit: without them the rows written for its cost serve.
  if (limit === undefined || !Number.isFinite(limit) || l.lanes.every((lane) => lane.label === '')) return writtenOf(l);
  const known = written.get(l);
  if (known !== undefined) return known;
  const rows = renderTextLayout(l, limit);
  written.set(l, rows);
  return rows;
}

/** The usual terminal drawing, with shared ports where they cost nothing. */
function layoutShared(graph: Graph, given: Ruler, opts: EngineOptions): Drawn {
  // A quick drawing is what a caller chooses a setting on: it never shares ports, so that the choice does not turn on them.
  if (given.terminal !== true || opts.nested === true || opts.sharePorts !== undefined || opts.quick === true) return layoutOnce(graph, given, opts);
  // Lines that share a port on the side of a box leave the box shorter, and may cost elsewhere: the drawing is made
  // with shared ports and without, and the one with shared ports is kept only when it costs no more in any respect
  // and less in one. Where no line found a port to share there is one drawing only. The two are compared before the
  // rows that arrowheads and bands ask for are opened: those rows are owed either way.
  const before = sharing.placements;
  const joined = layoutOnce(graph, given, { ...opts, sharePorts: true });
  const shares = joined.closed.edges.some((e) => e.sharedPort !== undefined);
  if (sharing.placements === before && !shares) return joined;
  const apart = layoutOnce(graph, given, { ...opts, sharePorts: false });
  // Sharing ports changes the width of a drawing on the way, and with it the arrangement that fits: a drawing in which
  // no line shares a port after all, or one whose bands are arranged another way, is not kept for it.
  if (!shares || arrangementOf(joined.closed) !== arrangementOf(apart.closed)) return apart;
  const own = textCost(apart.closed);
  // A drawing that is too wide without shared ports is given as it is, so that a caller that draws again for the width does what it did without them.
  const limit = opts.maxWidth ?? given.defaultWidth;
  if (limit !== undefined && Number.isFinite(limit) && Math.max(apart.closed.width, own.width) > limit) return apart;
  const shared = textCost(joined.closed);
  return costsMore(shared, own) || !costsMore(own, shared) ? apart : joined;
}

/** How the bands of a drawing are arranged: alongside the reading direction or across it, and which bands there are. */
const arrangementOf = (l: Layout): string => [l.composition, l.laneAxis, ...l.lanes.map((lane) => lane.id)].join('|');

/** A drawing as it is compared with another (`closed`), and as it is given out: a terminal drawing with its rows opened. */
interface Drawn {
  closed: Layout;
  opened: () => Layout;
}

/**
 * Arrangements of a graph already made, and the ports they shared (see `sharing`), by the ruler and the terms they were made on: the usual drawing and a drawing
 * made otherwise differ only in how they are finished, so a graph is arranged once for both.
 */
const arrangements = new WeakMap<Ruler, WeakMap<Graph, Map<string, { layout: Layout; shared: number }>>>();
function arranged(key: Graph, graph: Graph, how: string, given: Ruler, opts: EngineOptions): Layout {
  // A flow drawn the other way round is finished as it is arranged: it is arranged for each way of finishing.
  const { bare, ...terms } = opts;
  const id = `${how}|${graph.mirror === undefined ? '' : String(bare ?? opts.quick === true)}|${JSON.stringify(terms)}`;
  const byGraph = arrangements.get(given) ?? new WeakMap<Graph, Map<string, { layout: Layout; shared: number }>>();
  arrangements.set(given, byGraph);
  const known = byGraph.get(key) ?? new Map<string, { layout: Layout; shared: number }>();
  byGraph.set(key, known);
  const found = known.get(id);
  if (found !== undefined) {
    sharing.placements += found.shared;
    return found.layout;
  }
  const before = sharing.placements;
  const layout = layoutAny(graph, given, opts);
  known.set(id, { layout, shared: sharing.placements - before });
  return layout;
}

/**
 * `turned` is the graph of a flow drawn the other way round, when `graph` is that flow turned: the drawing without room is the one given out then, and it is finished again
 * by the caller.
 */
function layoutOnce(graph: Graph, given: Ruler, opts: EngineOptions, turned?: Graph): Drawn {
  const out = turned !== undefined;
  if (given.terminal !== true || opts.nested === true) {
    const drawn = layoutAny(graph, given, opts);
    return { closed: drawn, opened: () => drawn };
  }
  const bare = opts.bare ?? opts.quick === true;
  const drawn = turned === undefined ? arranged(graph, graph, 'as given', given, opts) : arranged(turned, graph, 'turned', given, opts);
  const limit = opts.maxWidth ?? given.defaultWidth;
  const over = (l: Layout): boolean => opts.squeeze !== false && limit !== undefined && Number.isFinite(limit) && l.width > limit;
  // A step that tidies a drawing up is not taken where it breaks a line, a box or a label the drawing kept whole.
  const labels = labelsOf(graph);
  const intact = (after: Layout, before: Layout): boolean => !breaksMore(breaksIn(after, labels, limit), breaksIn(before, labels, limit));
  // Spare rows are taken out all at once where that breaks nothing, and one by one otherwise.
  const spare = (l: Layout): Layout => {
    if (bare) return l;
    const all = closeSpareRows(l);
    return all === l || intact(all, l) ? all : closeSpareRows(l, intact);
  };
  // Texts at the ends of lines move off the labels and texts they stand on where that breaks nothing else.
  const ends = (l: Layout): Layout => {
    if (bare) return l;
    const moved = endTextsClear(l);
    return moved === l || intact(moved, l) ? moved : l;
  };
  // Rows and columns are closed first, so that a label is given the room that frees.
  const close = (l: Layout): Layout => openTextLabels(closeTextColumns(closeTextRows(shrinkDots(l))), limit, bare);
  // A drawing that is still too wide once its rows and columns are closed is pushed to the left.
  const finish = (fitted: Layout, room: boolean): Layout => {
    // A label that moves to its place beside an upright line may come to stand behind an arrowhead: the rows are opened once more after it.
    // A row that the rows opened later made needless is taken out again.
    const closed = room ? spare(openTextRows(clearUprightLabels(openTextRows(fitted), true))) : clearUprightLabels(fitted);
    const squeeze = (c: Layout): Layout => {
      const pushed = openTextLabels(compactColumns(c), limit, bare);
      // Still too wide: the labels on level lines give way, and are cut to the room they are left.
      return over(pushed) ? openTextLabels(compactColumns(c, true), limit, bare) : pushed;
    };
    const fit = (): Layout => {
      if (!over(closed)) return closed;
      const pushed = squeeze(closed);
      // A label that starts left of the drawing holds the columns it stands over: still too wide, it keeps its end only, and the columns close without it.
      if (bare || !over(pushed) || !closed.edges.some((e) => e.label !== undefined && !e.invisible && e.label.x < 0)) return pushed;
      const cut = squeeze(cutLeftLabels(closed));
      return cut.width < pushed.width ? cut : pushed;
    };
    const narrow = fit();
    // Last of all, every label is brought to where it is written in full: before the parts are packed, so that a part is measured as it is drawn, and again after, when a label that still has no room is cut.
    // A label left of the drawing that takes rows to show in full, by keeping a part from standing beside another, keeps its end only.
    // Labels are brought into sight only where that breaks nothing the drawing without it keeps whole (see `breaksOf`): a label cut short does not trade for one that stands by another line.
    const packed = (l: Layout): Layout => {
      // The drawing of a flow drawn the other way round is finished again once it is turned: its labels are brought into sight then, where the rows they stand among are final.
      if (out || bare) return packParts(l, limit);
      const sighted = labelsInSight(l, limit, false);
      const left = l.edges.some((e) => e.label !== undefined && !e.invisible && e.label.x < 0);
      const plain = cutPastLimit(packParts(left ? cutLeftLabels(l) : l, limit), limit);
      const full = sighted === l && !left ? labelsInSight(plain, limit) : labelsInSight(packParts(sighted, limit), limit);
      if (full === plain) return full;
      // A drawing without room that is only compared with another keeps its labels in sight unchecked.
      if (!left) return !room ? full : intact(full, plain) ? full : plain;
      const short = labelsInSight(packParts(cutLeftLabels(l), limit), limit);
      const wide = (d: Layout): boolean => limit !== undefined && Number.isFinite(limit) && d.width > limit;
      const tried = (wide(full) && !wide(short)) || Math.ceil(short.height) < Math.ceil(full.height) ? [short, full] : [full, short];
      return !room ? (tried[0] as Layout) : (tried.find((d) => intact(d, plain)) ?? plain);
    };
    if (!room) return ends(packed(narrow));
    // The columns an arrowhead on the side of a box asks for never take a drawing over the limit.
    const wider = openTextColumns(narrow, limit);
    return ends(packed(over(wider) && !over(narrow) ? narrow : wider));
  };
  let source = close(drawn);
  let best = finish(source, false);
  // A drawing too wide with notes beside its boxes: the notes are wrapped narrower until it fits.
  if (over(best) && limit !== undefined && graph.nodes.some((n) => n.attach !== undefined && n.lines.length > 0)) {
    for (const cells of [28, 22, 16]) {
      const narrow: Graph = { ...graph, nodes: graph.nodes.map((n) => (n.attach === undefined ? n : { ...n, lines: wrapWords(n.lines.join(' '), cells, cellWidth) })) };
      const fitted = close(arranged(graph, narrow, `notes ${cells}`, given, opts));
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
      const fitted = close(arranged(graph, short, `clip ${cells}`, given, opts));
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

function layoutAny(source: Graph, given: Ruler, opts: EngineOptions): Layout {
  const graph = given.terminal === true ? withoutEmptyCompartments(source) : source;
  const ruler: Ruler = graph.gaps === undefined || given.terminal === true ? given : { ...given, ...(graph.gaps.flow === undefined ? {} : { rankGap: graph.gaps.flow }), ...(graph.gaps.join === undefined ? {} : { joinGap: graph.gaps.join }) };
  const attached = splitAttached(graph);
  if (attached === undefined) return arrange(graph, ruler, opts);
  // Notes and lollipop stubs are not arranged: they are drawn beside their nodes once everything else has its place.
  const { legend: _drawn, ...bare } = arrange(attached.graph, ruler, opts);
  return withLegend(drawAttached(bare, attached, ruler), ruler, opts.legend);
}

/**
 * A grid that reads from left to right and passes the width (`maxWidth`, else the width of the medium) is set down the
 * page instead when that is narrower: a chain of wide boxes in one row is shown so small that its text cannot be read.
 */
function c4GridWithin(graph: Graph, ruler: Ruler, opts: EngineOptions): Layout {
  const across = layoutC4Grid(graph, ruler, opts);
  const limit = opts.maxWidth ?? ruler.defaultWidth;
  if (graph.direction !== 'LR' || graph.mirror !== undefined || graph.grid?.cells !== undefined || limit === undefined || across.width <= limit) return across;
  const down = layoutC4Grid({ ...graph, direction: 'TD' }, ruler, opts);
  return down.width < across.width ? down : across;
}

function arrange(graph: Graph, ruler: Ruler, opts: EngineOptions): Layout {
  if (graph.placer === 'c4-grid' && ruler.terminal !== true) return c4GridWithin(graph, ruler, opts);
  if (graph.clusters !== undefined && graph.clusters.length > 0) {
    if (ruler.terminal !== true) return layoutClusters(graph, ruler, opts, (g, r, o) => layoutWith(g, r, { ...o, nested: true }));
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
  const { legend, composition, refine, questions, fold, quick, quality, nested, nestedSpread, spreadProbe, squeeze: _squeeze, clip: _clip, ranked: _ranked, bare: _bare, ...rest } = opts;
  return layoutLayered(graph, ruler, { ...rest, ...(legend === undefined ? {} : { legend }), ...(composition === undefined ? {} : { composition }), ...(refine === undefined ? {} : { refine }), ...(questions === undefined ? {} : { questions }), ...(fold === undefined ? {} : { fold }), ...(quick === undefined ? {} : { quick }), ...(quality === undefined ? {} : { quality }), ...(nested === undefined ? {} : { nested }), ...(nestedSpread === undefined ? {} : { nestedSpread }), ...(spreadProbe === undefined ? {} : { spreadProbe }) });
}
