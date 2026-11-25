import { cellWidth } from '../metrics.ts';
import { renderTextLayout } from '../render/text.ts';
import type { Layout, LayoutEdge, LayoutLane, LayoutNode } from '../types.ts';
import { ZONE_NAMES, ZONE_ORDER, zoneOf } from './model.ts';
import type { EventModel, Frame } from './model.ts';
import { routeWires, spareRows } from './wires.ts';
import type { Cell, Rect, Row, Wire } from './wires.ts';

/** Cells between two boxes of one band. */
const GAP = 3;
/** Spare columns on each side of the boxes for a line that goes around them; the unused ones are cut. */
const MARGIN = 8;
/** The channel rows a gap between two bands starts with: the few that most drawings need, then more when a line found no path. */
const CHANNELS = [3, 12];
/** The fewest boxes of every strip but the last when the frames wrap. */
const STRIP_LEAST = 3;
/** Where a band name starts on its rule. */
const NAME_AT = 3;

interface Band {
  id: string;
  label: string;
}

/** How the frames are set out: every box as wide as the widest or as its own text, and how far each stands right of the one before it in time. */
export interface Variant {
  uniform: boolean;
  step: number;
}

const VARIANTS: Variant[] = [
  { uniform: true, step: 4 },
  { uniform: false, step: 4 },
  { uniform: true, step: 2 },
  { uniform: false, step: 2 },
];

const bandId = (f: Frame): string => (f.namespace === undefined ? zoneOf(f.kind) : `${zoneOf(f.kind)}/${f.namespace}`);

/** The bands in the order of the picture: the three zones from top to bottom, the namespaces of a zone in the order they are first written. */
function bandsOf(model: EventModel): Band[] {
  const seen = new Set<string>();
  const firsts = model.frames.filter((f) => {
    const first = !seen.has(bandId(f));
    seen.add(bandId(f));
    return first;
  });
  return ZONE_ORDER.flatMap((zone) =>
    firsts.filter((f) => zoneOf(f.kind) === zone).map((f) => ({ id: bandId(f), label: f.namespace === undefined ? ZONE_NAMES[zone] : `${ZONE_NAMES[zone]} / ${f.namespace}` })),
  );
}

/** The largest of `values`, at least `least`. The values are not spread into a call: there may be very many. */
const largest = (values: number[], least: number): number => values.reduce((most, v) => (v > most ? v : most), least);

/** The smallest of `values`, at most `most`. */
const smallest = (values: number[], most: number): number => values.reduce((least, v) => (v < least ? v : least), most);

/** For every row of a grid, how many of the rows `spare` stand above it. */
const spareAbove = (spare: Set<number>, height: number): number[] => {
  const above: number[] = [];
  let count = 0;
  for (let y = 0; y <= height; y++) {
    above.push(count);
    if (spare.has(y)) count += 1;
  }
  return above;
};

/** The boxes, the rows and the lines of a drawing once the lines are found. */
interface Routed {
  rects: Rect[];
  rows: Row[];
  paths: Cell[][];
}

/**
 * Opens the rows the rules ask for: one under every rule, and one above a rule that the boxes of the band above
 * reach down to. A box then stands a row off the rule on either side, and a line that ended on a rule ends in the
 * row beside its box, so that no arrowhead stands on a rule. The lines keep their columns.
 */
function roomAtRules(drawn: Routed, wires: Wire[]): Routed {
  const before = drawn.rows.flatMap((row, y) => (row.kind !== 'rule' ? [] : drawn.rows[y - 1]?.kind === 'box' ? [y, y + 1] : [y + 1]));
  /** How far the row `y` moves down. */
  const down = (y: number): number => y + before.filter((at) => at <= y).length;
  const rows = drawn.rows.flatMap((row, y): Row[] => [...before.filter((at) => at === y).map((): Row => ({ kind: 'box', rank: 0 })), row]);
  const rects = drawn.rects.map((r) => ({ ...r, y: down(r.y) }));
  /** The cells from `from` up or down to `to`, `from` left out. */
  const run = (from: Cell, to: number): Cell[] => Array.from({ length: Math.abs(to - from[1]) }, (_, k): Cell => [from[0], from[1] + Math.sign(to - from[1]) * (k + 1)]);
  /** The row beside `r` that a line in the row `y` runs on to, when it stands off the box. */
  const beside = (y: number, r: Rect): number => (y < r.y - 1 ? r.y - 1 : y > r.y + r.h ? r.y + r.h : y);
  const paths = drawn.paths.map((path, i) => {
    const moved = path.map((c): Cell => [c[0], down(c[1])]);
    const whole = moved.flatMap((c, k): Cell[] => {
      const next = moved[k + 1];
      return next === undefined || next[0] !== c[0] ? [c] : [c, ...run(c, next[1]).slice(0, -1)];
    });
    const wire = wires[i] as Wire;
    const [first, last] = [whole[0] as Cell, whole[whole.length - 1] as Cell];
    return [...run(first, beside(first[1], rects[wire.from] as Rect)).reverse(), ...whole, ...run(last, beside(last[1], rects[wire.to] as Rect))];
  });
  return { rects, rows, paths };
}

/** A box before the rows are known: which strip and band it stands in, and its left edge and size. */
interface Slot {
  strip: number;
  band: number;
  x: number;
  w: number;
  h: number;
}

/**
 * Where each frame stands, in time order. Every box starts `step` right of the box before it, whichever band that
 * one stands in, and clear of the box before it in its own band. A box that would reach past `wrap` opens a new
 * strip under the ones before; nothing when one box alone is wider than `wrap`.
 */
function slotsOf(bandOf: number[], sizes: Array<{ w: number; h: number }>, bandCount: number, step: number, wrap: number): Slot[] | undefined {
  const slots: Slot[] = [];
  let bandEnd = new Array<number>(bandCount).fill(Number.NEGATIVE_INFINITY);
  let strip = 0;
  for (const [k, size] of sizes.entries()) {
    if (size.w > wrap) return undefined;
    const band = bandOf[k] as number;
    const before = slots[k - 1];
    let x = Math.max(before === undefined || before.strip !== strip ? 0 : before.x + step, (bandEnd[band] as number) + GAP);
    if (x + size.w > wrap) {
      strip += 1;
      bandEnd = bandEnd.map(() => Number.NEGATIVE_INFINITY);
      x = 0;
    }
    bandEnd = bandEnd.map((end, i) => (i === band ? x + size.w : end));
    slots.push({ strip, band, x, ...size });
  }
  return slots;
}

/** Cells two boxes one above the other share, corners left out, for a line to run straight between them: the most asked for, then fewer. */
const SHARED = [3, 2, 1];

/**
 * Moves a box right, towards the box of the next frame, when a line joins the two and they share too few cells for
 * it to run straight. The box stays left of the next one by `step`, clear of the next box of its own band, and over
 * the box of the frame before it when a line joins those two. Fewer shared cells are settled for when the box cannot
 * stand over both its neighbours by the most.
 */
function closeUp(slots: Slot[], joined: (k: number) => boolean, step: number): Slot[] {
  const shared = (a: Slot, b: Slot): number => Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) - 2;
  const moved: Slot[] = [...slots];
  /** The left edge of the nearest box after the one in hand, by band, within its strip. */
  let inBand = new Map<number, number>();
  for (let k = slots.length - 1; k >= 0; k--) {
    const slot = slots[k] as Slot;
    const next = moved[k + 1];
    const before = slots[k - 1];
    if (next === undefined || next.strip !== slot.strip) inBand = new Map();
    else if (joined(k) && shared(slot, next) < (SHARED[0] as number)) {
      const held = before !== undefined && before.strip === slot.strip && joined(k - 1) ? shared(before, slot) : 0;
      for (const cells of SHARED) {
        if (shared(slot, next) >= cells) break;
        const most = Math.min(
          next.x - step,
          (inBand.get(slot.band) ?? Number.POSITIVE_INFINITY) - GAP - slot.w,
          before !== undefined && held >= 1 ? before.x + before.w - Math.min(cells, held) - 2 : Number.POSITIVE_INFINITY,
        );
        const x = next.x + cells + 2 - slot.w;
        if (x > slot.x && x <= most) {
          moved[k] = { ...slot, x };
          break;
        }
      }
    }
    inBand.set(slot.band, (moved[k] as Slot).x);
  }
  return moved;
}

/** The frames in time order with the lines between them, and where each box stands before the rows are known. */
interface SetOut {
  bands: Band[];
  frames: Frame[];
  texts: string[][];
  wires: Wire[];
  slots: Slot[];
}

/** Sets the frames of `model` out one way; nothing when one box alone is wider than `wrap`. */
function setOut(model: EventModel, variant: Variant, wrap: number): SetOut | undefined {
  const bands = bandsOf(model);
  const frames = [...model.frames].sort((a, b) => a.number - b.number);
  const texts = frames.map((f) => [f.name, `${f.label} ${f.kind}`, ...f.data]);
  const widths = texts.map((t) => largest(t.map(cellWidth), 0) + 4);
  const widest = largest(widths, 0);
  const bandAt = new Map(bands.map((b, i) => [b.id, i]));
  const bandOf = frames.map((f) => bandAt.get(bandId(f)) as number);
  const sizes = texts.map((t, k) => ({ w: variant.uniform ? widest : (widths[k] as number), h: t.length + 2 }));
  const frameAt = new Map<number, number>();
  frames.forEach((f, k) => {
    if (!frameAt.has(f.number)) frameAt.set(f.number, k);
  });
  const wires: Wire[] = model.relations.flatMap((r) => {
    const from = frameAt.get(r.from);
    const to = frameAt.get(r.to);
    return from === undefined || to === undefined ? [] : [{ from, to }];
  });
  /** The frames a line joins to the frame next in time. */
  const joined = new Set(wires.flatMap((w) => (Math.abs(w.from - w.to) === 1 ? [Math.min(w.from, w.to)] : [])));
  const set = slotsOf(bandOf, sizes, bands.length, variant.step, wrap);
  if (set === undefined) return undefined;
  return { bands, frames, texts, wires, slots: closeUp(set, (k) => joined.has(k), variant.step) };
}

/** The rows the boxes and the band rules of `slots` take, whatever rows the lines add: no drawing of them has fewer. */
function leastRows(slots: Slot[], bandCount: number): number {
  const tallest = new Map<number, number>();
  for (const s of slots) tallest.set(s.strip * bandCount + s.band, Math.max(tallest.get(s.strip * bandCount + s.band) ?? 0, s.h));
  return [...tallest.values()].reduce((sum, h) => sum + h + 1, slots[slots.length - 1]?.strip ?? 0);
}

/**
 * The model on a grid of cells: a band per swimlane, a box per frame with its number and kind under the name and its
 * data rows below. Time runs left to right: the boxes step down and up the bands in the order of their numbers. With
 * a `wrap` the frames that do not fit one strip of bands go on in a further strip below it. `spend` is told what the
 * grid and the search for its lines cost and answers whether the work may go on; nothing comes back once it says no.
 * `tidy` is how the lines are drawn: see `routeWires`. `set` is the frames set out already, when the caller has them.
 */
export function eventModelGrid(
  model: EventModel,
  variant: Variant,
  wrap: number,
  strips: 'one' | 'any',
  most: number = CHANNELS[0] as number,
  spend: (cost: number) => boolean = () => true,
  tidy = true,
  set: SetOut | undefined = setOut(model, variant, wrap),
): Layout | undefined {
  if (set === undefined) return undefined;
  const { bands, frames, texts, wires, slots } = set;
  const stripCount = (slots[slots.length - 1]?.strip ?? 0) + 1;
  if (stripCount > 1 && strips === 'one') return undefined;
  // A strip of one or two boxes shows no order: such a drawing is left to the list.
  const inStrip = new Array<number>(stripCount).fill(0);
  for (const s of slots) inStrip[s.strip] = (inStrip[s.strip] as number) + 1;
  if (inStrip.slice(0, -1).some((n) => n < STRIP_LEAST)) return undefined;

  const channels = Math.min(wires.length, most);
  const channelRows = (nearFirst: boolean): Row[] => Array.from({ length: channels }, (_, i): Row => ({ kind: 'channel', rank: nearFirst ? i : channels - 1 - i }));
  const rows: Row[] = channelRows(false);
  /** The rule row of each band of each strip that holds a box, in the order they stand. */
  const rules: Array<{ strip: number; band: number; height: number }> = [];
  const place = (s: { strip: number; band: number }): number => s.strip * bands.length + s.band;
  const tallest = new Map<number, number>();
  for (const s of slots) tallest.set(place(s), Math.max(tallest.get(place(s)) ?? 0, s.h));
  const ruleIndex = new Map<number, number>();
  for (let strip = 0; strip < stripCount; strip++) {
    bands.forEach((_, band) => {
      const height = tallest.get(place({ strip, band }));
      if (height === undefined) return;
      rows.push({ kind: 'rule', rank: 0 });
      ruleIndex.set(place({ strip, band }), rules.length);
      rules.push({ strip, band, height });
      for (let i = 0; i < height; i++) rows.push({ kind: 'box', rank: 0 });
      rows.push(...channelRows(true));
    });
    // The row under a strip that has another below it stays, to keep the two apart; a line to the next strip turns in it first.
    if (strip + 1 < stripCount) {
      const from = rows.length - channels;
      rows.splice(from, channels, { kind: 'channel', rank: 0, keep: true }, ...rows.slice(from).map((row): Row => ({ ...row, rank: row.rank + 1 })));
    }
  }
  const ruleRows = (all: Row[]): number[] => all.flatMap((row, y) => (row.kind === 'rule' ? [y] : []));
  const ruleOf = (slot: Slot): number => ruleIndex.get(place(slot)) as number;
  const ruleAt = ruleRows(rows);
  const rects: Rect[] = slots.map((s) => ({ x: s.x + MARGIN, y: (ruleAt[ruleOf(s)] as number) + 1, w: s.w, h: s.h }));

  const gridWidth = largest(rects.map((r) => r.x + r.w), 0) + MARGIN;
  // Setting up a grid costs by its cells, before any line is searched for.
  if (!spend(gridWidth * rows.length)) return undefined;
  const routed = routeWires(rects, wires, gridWidth, rows, spend, tidy);
  if (routed === undefined) return channels < wires.length && most < (CHANNELS[1] as number) && spend(0) ? eventModelGrid(model, variant, wrap, strips, CHANNELS[1], spend, tidy, set) : undefined;
  let closed: Routed = { rects, rows, paths: routed };
  for (;;) {
    const spare = spareRows(closed.rects, wires, closed.paths, closed.rows);
    if (spare.size === 0) break;
    const above = spareAbove(spare, closed.rows.length);
    closed = {
      rects: closed.rects.map((r) => ({ ...r, y: r.y - (above[r.y] as number) })),
      rows: closed.rows.filter((_, y) => !spare.has(y)),
      paths: closed.paths.map((path) => path.filter((c) => !spare.has(c[1])).map((c): Cell => [c[0], c[1] - (above[c[1]] as number)])),
    };
  }
  const state = roomAtRules(closed, wires);

  const cells = state.paths.flat();
  const left = smallest(cells.map((c) => c[0]), smallest(state.rects.map((r) => r.x), Number.POSITIVE_INFINITY));
  const right = Math.max(largest(state.rects.map((r) => r.x + r.w), 0), largest(cells.map((c) => c[0] + 1), 0));
  const width = largest(bands.map((b) => NAME_AT + cellWidth(b.label) + 2), right - left);
  const placed = state.rects.map((r) => ({ ...r, x: r.x - left }));

  const nodes: LayoutNode[] = frames.map((f, k) => ({
    id: String(f.number),
    lane: `${(slots[k] as Slot).strip}/${bandId(f)}`,
    rank: k,
    span: 1,
    row: ruleOf(slots[k] as Slot),
    ...(placed[k] as Rect),
    title: f.name,
    lines: (texts[k] as string[]).slice(1),
    shape: 'rect',
  }));
  const edges: LayoutEdge[] = wires.map((wire, i) => {
    const path = state.paths[i] as Cell[];
    const a = placed[wire.from] as Rect;
    const b = placed[wire.to] as Rect;
    // An end stands on the border of its box: the cell beside that border is where the line is drawn.
    const onBorder = (cell: Cell, r: Rect): { x: number; y: number } => {
      const x = cell[0] - left;
      if (cell[1] === r.y - 1) return { x, y: r.y };
      if (cell[1] === r.y + r.h) return { x, y: r.y + r.h };
      return x < r.x ? { x: r.x, y: cell[1] } : { x: r.x + r.w, y: cell[1] };
    };
    const corners = path.slice(1, -1).filter((c, k) => {
      const before = path[k] as Cell;
      const after = path[k + 2] as Cell;
      return (before[0] === c[0]) !== (after[0] === c[0]);
    });
    const first = path[0] as Cell;
    const last = path[path.length - 1] as Cell;
    // A line that turns in the cell beside the box keeps that cell as a point of its own.
    const turnsAt = (end: Cell, next: Cell | undefined, r: Rect): boolean => next !== undefined && (end[1] === r.y - 1 || end[1] === r.y + r.h) && next[1] === end[1];
    return {
      from: String((frames[wire.from] as Frame).number),
      to: String((frames[wire.to] as Frame).number),
      style: 'normal',
      points: [
        onBorder(first, a),
        ...(turnsAt(first, path[1], a) ? [{ x: first[0] - left, y: first[1] }] : []),
        ...corners.map((c) => ({ x: c[0] - left, y: c[1] })),
        onBorder(last, b),
      ],
    };
  });
  const lanes: LayoutLane[] = rules.map((rule, i) => {
    const band = bands[rule.band] as Band;
    const y = ruleRows(state.rows)[i] as number;
    return { id: `${rule.strip}/${band.id}`, label: band.label, x: 0, y, w: width, h: rule.height + 1, labelBox: { x: NAME_AT, y, w: cellWidth(band.label), h: 1 }, bare: true };
  });
  return { width, height: state.rows.length, direction: 'LR', laneAxis: 'across', lanes, nodes, edges, diagnostics: [] };
}

/**
 * The cells the search for the lines may settle over all the ways of setting the frames out that one drawing tries.
 * A model that needs more is written as the list: the time it takes is bounded whatever the input.
 */
const BUDGET = 2_200_000;

/**
 * The cells one way of setting the frames out may cost. A way that needs more ends the drawing: the other ways of a
 * model that large cost about as much, so the list is written without trying them.
 */
export const WAY_BUDGET = 1_200_000;

/** What the search may have cost for a further way to be tried only to write a band name whole. */
const NAME_BUDGET = 200_000;

/** Rows a drawing may be taller than the first that fits, to write a band name whole that the first cuts short. */
const NAME_ROWS = 2;

/** A drawing that fits, and how many of its band names are cut short. */
interface Drawing {
  lines: string[];
  cut: number;
}

/** Whether a band name is written over a line that crosses the rule of its band. */
function nameOverLine(layout: Layout, lines: string[]): boolean {
  return layout.lanes.some((lane) => {
    const row = lines[lane.y] ?? '';
    const at = row.indexOf(lane.label);
    if (at < 0) return false;
    // The name takes a blank cell on each side.
    const from = cellWidth(row.slice(0, at)) - 1;
    const to = from + cellWidth(lane.label) + 1;
    return layout.edges.some((e) =>
      e.points.some((p, i) => {
        const q = e.points[i + 1];
        return q !== undefined && p.x === q.x && p.x >= from && p.x <= to && Math.min(p.y, q.y) <= lane.y && lane.y <= Math.max(p.y, q.y);
      }),
    );
  });
}

/** Cells kept free at the right of a wrapped strip for the lines that go around its boxes; a wider reserve is tried when the lines needed more. */
const RESERVES = [0, 2, 4, 8];

/**
 * The rows of the drawing in boxes and lines, or nothing when it cannot be drawn within `maxWidth`. The frames are
 * first set out as one strip, with a narrower step between the boxes and boxes of their own widths tried in turn;
 * when no strip fits, the frames wrap onto further strips, the way whose boxes take the fewest rows first. A way that
 * writes every band name whole is taken before one that cuts a name short, and a way that would write a name over a
 * line is not drawn. Nothing comes back either when the search for the lines has cost more than `BUDGET`, or more
 * than `WAY_BUDGET` for one way; `told` hears what it has cost so far.
 */
export function drawEventModel(model: EventModel, maxWidth: number | undefined, told?: (spent: number) => void): string[] | undefined {
  if (model.frames.length === 0) return undefined;
  const limit = maxWidth ?? Number.POSITIVE_INFINITY;
  let spent = 0;
  const spend = (cost: number): boolean => {
    spent += cost;
    told?.(spent);
    return spent <= BUDGET;
  };
  /** The ways already drawn, by where their boxes stand: two ways that set the boxes out alike are searched once. */
  const tried = new Map<string, Drawing | undefined>();
  let tooLarge = false;
  const attempt = (variant: Variant, wrap: number, strips: 'one' | 'any', tidy: boolean): Drawing | undefined => {
    if (spent > BUDGET || tooLarge) return undefined;
    const set = setOut(model, variant, wrap);
    const key = `${strips} ${tidy} ${set?.slots.map((s) => `${s.strip},${s.x},${s.w}`).join(' ')}`;
    if (!tried.has(key)) tried.set(key, draw(variant, wrap, strips, tidy, set));
    return tried.get(key);
  };
  const draw = (variant: Variant, wrap: number, strips: 'one' | 'any', tidy: boolean, set: SetOut | undefined): Drawing | undefined => {
    const before = spent;
    const layout = eventModelGrid(model, variant, wrap, strips, CHANNELS[0], (cost) => spend(cost) && spent - before <= WAY_BUDGET, tidy, set);
    tooLarge = spent - before > WAY_BUDGET;
    if (layout === undefined) return undefined;
    const first = renderTextLayout(layout, limit);
    // A name that ran past the end of its rule: the rules are drawn again long enough to hold it.
    const widest = largest(first.map(cellWidth), 0);
    const reach = Math.min(widest + 2, limit);
    const lines = widest > layout.width ? renderTextLayout({ ...layout, width: reach, lanes: layout.lanes.map((l) => ({ ...l, w: reach })) }, limit) : first;
    if (!lines.every((line) => cellWidth(line) <= limit) || nameOverLine(layout, lines)) return undefined;
    return { lines, cut: layout.lanes.filter((lane) => !(lines[lane.y] ?? '').includes(lane.label)).length };
  };
  // The first way that fits is drawn, unless it cuts a band name short and a later way writes every name whole in few more rows.
  const firstWhole = (ways: Array<() => Drawing | undefined>): Drawing | undefined => {
    let fits: Drawing | undefined;
    for (const way of ways) {
      if (fits !== undefined && spent > NAME_BUDGET) break;
      const drawing = way();
      if (drawing === undefined) continue;
      if (drawing.cut === 0 && (fits === undefined || drawing.lines.length <= fits.lines.length + NAME_ROWS)) return drawing;
      fits ??= drawing;
    }
    return fits;
  };
  // Lines that do not fit drawn the tidy way, with one stem to a side of a box, are drawn again free of that.
  const one = firstWhole(VARIANTS.map((variant) => () => attempt(variant, limit, 'one', true) ?? attempt(variant, limit, 'one', false)));
  if (one !== undefined || maxWidth === undefined || spent > BUDGET || tooLarge) return one?.lines;
  const wide = VARIANTS.filter((v) => v.step === VARIANTS[0]?.step);
  // The ways are tried from the one whose boxes and band rules take the fewest rows: the first that fits is the shortest of them, or near it.
  const ways = wide
    .flatMap((variant) => RESERVES.map((reserve) => ({ variant, wrap: maxWidth - reserve, set: setOut(model, variant, maxWidth - reserve) })))
    .map(({ variant, wrap, set }) => ({ variant, wrap, least: set === undefined ? Number.POSITIVE_INFINITY : leastRows(set.slots, set.bands.length) }))
    .sort((a, b) => a.least - b.least);
  const wrapped = (tidy: boolean): Drawing | undefined => firstWhole(ways.map((way) => () => attempt(way.variant, way.wrap, 'any', tidy)));
  return (wrapped(true) ?? wrapped(false))?.lines;
}
