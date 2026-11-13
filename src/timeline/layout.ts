import { ceilTo } from '../chart/grid.ts';
import type { Ruler } from '../metrics.ts';
import type { Theme } from '../render/theme.ts';
import type { Scene, SceneItem } from '../types.ts';
import type { TimelineModel } from './model.ts';
import { pixelWidth, wrapLines } from './wrap.ts';
import { DEFAULT_THEME } from '../render/theme.ts';

const MARGIN = 24;
const BOX_MIN = 152;
const BOX_MAX = 200;
const BOX_PAD = 32;
const TEXT_MAX = BOX_MAX - BOX_PAD;
const LINE = 16;
const COL_GAP = 48;
const STACK_GAP = 8;
const STEM = 24;
const NAME_RISE = 20;
const ZONE_PAD = 16;
const ZONE_GAP = 16;
const ROW_GAP = 32;
const DOT_R = 4;
const TITLE_Y = 40;
const TITLE_SIZE_RATIO = 15 / 13;
const DEFAULT_WIDTH_LIMIT = 1280;
const TD_ROW_GAP = 24;
const SERIES = 8;

export interface TimelineLayoutOptions {
  /** Width at which a horizontal drawing folds into another row. */
  maxWidth?: number;
  /** Colours each section, or each period when there is no section, with its own series; true when absent. */
  multicolor?: boolean;
}

export interface PlacedBox {
  x: number;
  y: number;
  w: number;
  h: number;
  lines: string[];
}

export interface PlacedPeriod {
  label: string[];
  /** Position of the dot on the axis. */
  dot: { x: number; y: number };
  boxes: PlacedBox[];
  /** Index of the row (horizontal) the period sits in; 0 for a vertical drawing. */
  row: number;
}

export interface PlacedZone {
  x: number;
  y: number;
  w: number;
  h: number;
  name?: string[];
}

export interface TimelineLayout {
  scene: Scene;
  width: number;
  height: number;
  direction: 'LR' | 'TD';
  periods: PlacedPeriod[];
  zones: PlacedZone[];
}


interface Col {
  /** Series role of the period's dot and boxes; absent when the drawing is in one scheme. */
  series?: string;
  label: string[];
  events: string[][];
  w: number;
  heights: number[];
}

interface Part {
  group: number;
  named: boolean;
  /** The first part of its group draws the section name. */
  first: boolean;
  cols: Col[];
}

const boxHeight = (lines: number): number => LINE * lines + 32;

function widest(lines: readonly string[], width: (s: string) => number): number {
  return Math.max(0, ...lines.map(width));
}

function boxItems(box: PlacedBox, inZone: boolean, series: string | undefined): SceneItem[] {
  const cx = box.x + box.w / 2;
  const role = series !== undefined ? ['box', `${series}--tint`] : inZone ? ['box', 'box--in-zone'] : ['box'];
  return [
    { kind: 'box', style: 'box', x: box.x, y: box.y, w: box.w, h: box.h, role },
    ...box.lines.map((text, i): SceneItem => ({ kind: 'text', x: cx, y: box.y + box.h / 2 + LINE * (i - (box.lines.length - 1) / 2), text, anchor: 'middle', role: ['name'] })),
  ];
}

interface RowPlan {
  xs: number[][];
  rects: { left: number; right: number }[];
  contentRight: number;
  width: number;
}

function planRow(parts: readonly Part[]): RowPlan {
  const xs: number[][] = [];
  const rects: { left: number; right: number }[] = [];
  let left = MARGIN - (parts[0]?.named ? 0 : ZONE_PAD);
  for (const part of parts) {
    let x = left + ZONE_PAD;
    const row: number[] = [];
    for (const col of part.cols) {
      row.push(x);
      x += col.w + COL_GAP;
    }
    const right = x - COL_GAP + ZONE_PAD;
    xs.push(row);
    rects.push({ left, right });
    left = right + ZONE_GAP;
  }
  const last = rects[rects.length - 1];
  const lastRight = last?.right ?? MARGIN;
  const contentRight = parts[parts.length - 1]?.named ? lastRight : lastRight - ZONE_PAD;
  return { xs, rects, contentRight, width: contentRight + MARGIN };
}

/** Packs groups into rows no wider than `limit`; a group moves whole to the next row when it fits there, else it is cut between columns. */
function packRows(groups: readonly Part[], limit: number): Part[][] {
  const rows: Part[][] = [[]];
  const fits = (row: readonly Part[]): boolean => planRow(row).width <= limit;
  for (const whole of groups) {
    const current = rows[rows.length - 1] ?? [];
    if (fits([...current, whole])) {
      current.push(whole);
      continue;
    }
    if (current.length > 0 && fits([whole])) {
      rows.push([whole]);
      continue;
    }
    let remaining = whole.cols;
    let first = true;
    while (remaining.length > 0) {
      const row = rows[rows.length - 1] ?? [];
      const piece = (n: number): Part => ({ ...whole, first, cols: remaining.slice(0, n) });
      let k = 0;
      while (k < remaining.length && fits([...row, piece(k + 1)])) k++;
      if (k === 0) {
        if (row.length > 0) {
          rows.push([]);
          continue;
        }
        k = 1;
      }
      row.push(piece(k));
      first = false;
      remaining = remaining.slice(k);
      if (remaining.length > 0) rows.push([]);
    }
  }
  return rows;
}

/** Packs into as few rows as the limit needs, then narrows the limit while the row count holds so the rows come out even. */
function balancedRows(groups: readonly Part[], limit: number): Part[][] {
  const rows = packRows(groups, limit);
  if (rows.length < 2) return rows;
  let best = rows;
  for (let l = limit - 4; l > 0; l -= 4) {
    const trial = packRows(groups, l);
    if (trial.length !== rows.length) break;
    best = trial;
  }
  return best;
}

/** Every column takes the width of the widest one, and the n-th boxes of all columns the height of the tallest of them. */
function columns(model: TimelineModel, width: (s: string) => number): Col[][] {
  const raw = model.groups.map((g) =>
    g.periods.map((p) => {
      const events = p.events.map((e) => wrapLines(e, TEXT_MAX, width));
      const label = wrapLines(p.label, TEXT_MAX, width);
      const text = Math.max(widest(label, width), ...events.map((e) => widest(e, width)));
      return { label, events, w: Math.max(BOX_MIN, ceilTo(text + BOX_PAD)) };
    }),
  );
  const w = Math.max(BOX_MIN, ...raw.flat().map((c) => c.w));
  const depth = Math.max(0, ...raw.flat().map((c) => c.events.length));
  const heights = Array.from({ length: depth }, (_, k) => Math.max(0, ...raw.flat().map((c) => (c.events[k] === undefined ? 0 : boxHeight(c.events[k].length)))));
  return raw.map((g) => g.map((c) => ({ label: c.label, events: c.events, w, heights: c.events.map((_, k) => heights[k] ?? 48) })));
}

/** The series of each period, by group and position: one per section when there are sections, else one per period. */
function seriesOf(model: TimelineModel, multicolor: boolean): (string | undefined)[][] {
  const bySection = model.groups.some((g) => g.name !== undefined);
  let n = 0;
  return model.groups.map((g, gi) =>
    g.periods.map(() => {
      if (!multicolor) return undefined;
      const k = bySection ? gi : n++;
      return `series-${(k % SERIES) + 1}`;
    }),
  );
}

const withSeries = (col: Col, series: string | undefined): Col => (series === undefined ? col : { ...col, series });

const dotRole = (series: string | undefined): string[] => (series === undefined ? ['dot'] : ['dot', series]);

function titleItems(title: string | undefined): SceneItem[] {
  return title === undefined ? [] : [{ kind: 'text', x: MARGIN, y: TITLE_Y, text: title, anchor: 'start', role: ['title'], baseline: 'alphabetic' }];
}

function layoutHorizontal(model: TimelineModel, ruler: Ruler, theme: Theme, limit: number, multicolor: boolean): TimelineLayout {
  const width = pixelWidth(ruler);
  const series = seriesOf(model, multicolor);
  const cols = columns(model, width).map((g, gi) => g.map((c, pi) => withSeries(c, series[gi]?.[pi])));
  const zones = model.groups.some((g) => g.name !== undefined);
  const nameLines = Math.max(1, ...cols.flat().map((c) => c.label.length));
  const sectionLines = Math.max(1, ...model.groups.map((g) => (g.name === undefined ? 0 : wrapLines(g.name, TEXT_MAX * 2, width).length)));
  const sectionNames = model.groups.map((g) => (g.name === undefined ? undefined : wrapLines(g.name, TEXT_MAX * 2, width)));

  const parts: Part[] = model.groups.map((g, i) => ({ group: i, named: g.name !== undefined, first: true, cols: cols[i] ?? [] }));
  const rows = balancedRows(parts, limit);

  const items: SceneItem[] = [...titleItems(model.title)];
  const periods: PlacedPeriod[] = [];
  const placedZones: PlacedZone[] = [];
  let top = zones ? (model.title === undefined ? MARGIN : 64) : model.title === undefined ? MARGIN : 72;
  let sceneWidth = 0;
  let bottom = top;

  rows.forEach((row, rowIndex) => {
    const plan = planRow(row);
    const contentTop = zones ? top + ZONE_PAD + LINE * sectionLines + 8 : top;
    const axis = contentTop + LINE * nameLines + 12;
    const boxTop = axis + STEM;
    const tall = Math.max(0, ...row.flatMap((p) => p.cols.map((c) => c.heights.reduce((s, h) => s + h, 0) + STACK_GAP * Math.max(0, c.heights.length - 1))));
    const rowBottom = Math.max(axis, boxTop + tall);
    const zoneBottom = rowBottom + ZONE_PAD;
    const end = zones ? zoneBottom : rowBottom;

    const zoneItems: SceneItem[] = [];
    const lineItems: SceneItem[] = [];
    const dotItems: SceneItem[] = [];
    const contentItems: SceneItem[] = [];
    row.forEach((part, pi) => {
      const rect = plan.rects[pi];
      if (rect === undefined) return;
      const names = sectionNames[part.group];
      if (part.named) {
        const zone: PlacedZone = { x: rect.left, y: top, w: rect.right - rect.left, h: zoneBottom - top };
        if (part.first && names !== undefined) zone.name = names;
        placedZones.push(zone);
        zoneItems.push({ kind: 'box', style: 'frame', x: zone.x, y: zone.y, w: zone.w, h: zone.h, role: ['zone'] });
        if (part.first && names !== undefined)
          names.forEach((text, i) => zoneItems.push({ kind: 'text', x: rect.left + ZONE_PAD, y: top + ZONE_PAD + 8 + LINE * i, text, anchor: 'start', role: ['zone-name'] }));
      }
      part.cols.forEach((col, ci) => {
        const x = plan.xs[pi]?.[ci] ?? 0;
        const cx = x + col.w / 2;
        let y = boxTop;
        const boxes: PlacedBox[] = col.events.map((lines, k) => {
          const h = col.heights[k] ?? 48;
          const box = { x, y, w: col.w, h, lines };
          y += h + STACK_GAP;
          return box;
        });
        if (boxes.length > 0) lineItems.push({ kind: 'line', points: [{ x: cx, y: axis }, { x: cx, y: boxTop }], role: ['edge'] });
        dotItems.push({ kind: 'circle', cx, cy: axis, r: DOT_R, role: dotRole(col.series) });
        col.label.forEach((text, i) =>
          dotItems.push({ kind: 'text', x: cx, y: axis - NAME_RISE - LINE * (col.label.length - 1 - i), text, anchor: 'middle', role: ['name'], baseline: 'alphabetic' }),
        );
        for (const b of boxes) contentItems.push(...boxItems(b, part.named, col.series));
        periods.push({ label: col.label, dot: { x: cx, y: axis }, boxes, row: rowIndex });
      });
    });
    const axisLine: SceneItem = { kind: 'line', points: [{ x: MARGIN, y: axis }, { x: plan.contentRight - 2, y: axis }], role: ['edge', 'edge--arrow'] };
    items.push(...zoneItems, axisLine, ...lineItems, ...dotItems, ...contentItems);
    sceneWidth = Math.max(sceneWidth, plan.width);
    bottom = end;
    top = end + ROW_GAP;
  });

  const titleWidth = model.title === undefined ? 0 : ceilTo(ruler.textWidth(model.title, 'title') * TITLE_SIZE_RATIO) + 2 * MARGIN;
  const w = Math.max(sceneWidth, titleWidth);
  const h = bottom + MARGIN;
  return {
    scene: { width: w, height: h, title: model.title ?? 'timeline', items, theme },
    width: w,
    height: h,
    direction: 'LR',
    periods,
    zones: placedZones,
  };
}

function layoutVertical(model: TimelineModel, ruler: Ruler, theme: Theme, multicolor: boolean): TimelineLayout {
  const width = pixelWidth(ruler);
  const series = seriesOf(model, multicolor);
  const zones = model.groups.some((g) => g.name !== undefined);
  const labels = model.groups.map((g) => g.periods.map((p) => wrapLines(p.label, TEXT_MAX, width)));
  const nameW = Math.max(0, ...labels.flat().map((l) => widest(l, width)));
  const axisX = ceilTo(MARGIN + (zones ? ZONE_PAD : 0) + nameW + NAME_RISE);
  const boxLeft = axisX + STEM;

  const eventLines = model.groups.map((g) => g.periods.map((p) => p.events.map((e) => wrapLines(e, TEXT_MAX, width))));
  // Every event box takes the width of the widest one.
  const boxW = Math.max(BOX_MIN, ...eventLines.flat(2).map((l) => ceilTo(widest(l, width) + BOX_PAD)));
  const rowsOf = model.groups.map((g, gi) =>
    g.periods.map((p, pi) => {
      const lines = eventLines[gi]?.[pi] ?? [];
      const ws = lines.map(() => boxW);
      const h = Math.max(48, ...lines.map((l) => boxHeight(l.length)), LINE * (labels[gi]?.[pi]?.length ?? 1));
      return { lines, ws, h, boxH: Math.max(0, ...lines.map((l) => boxHeight(l.length))) };
    }),
  );
  const maxRight = Math.max(
    boxLeft,
    ...rowsOf.flat().map((r) => boxLeft + r.ws.reduce((s, v) => s + v, 0) + STACK_GAP * Math.max(0, r.ws.length - 1)),
  );
  const zoneRight = maxRight + ZONE_PAD;
  const contentRight = zones ? zoneRight : maxRight;

  const items: SceneItem[] = [...titleItems(model.title)];
  const zoneItems: SceneItem[] = [];
  const lineItems: SceneItem[] = [];
  const dotItems: SceneItem[] = [];
  const contentItems: SceneItem[] = [];
  const periods: PlacedPeriod[] = [];
  const placedZones: PlacedZone[] = [];
  let rectTop = model.groups[0]?.name === undefined ? (model.title === undefined ? MARGIN : 72) - ZONE_PAD : model.title === undefined ? MARGIN : 64;
  const segments: { from: number; to: number }[] = [];
  let lastRowBottom = 0;
  let bottom = 0;

  model.groups.forEach((g, gi) => {
    const names = g.name === undefined ? undefined : wrapLines(g.name, TEXT_MAX * 2, width);
    let y = rectTop + ZONE_PAD + (names === undefined ? 0 : LINE * names.length + 8);
    const groupTop = y;
    (rowsOf[gi] ?? []).forEach((r, pi) => {
      const dotY = y + r.h / 2;
      const label = labels[gi]?.[pi] ?? [];
      label.forEach((text, i) => dotItems.push({ kind: 'text', x: axisX - NAME_RISE, y: dotY + LINE * (i - (label.length - 1) / 2), text, anchor: 'end', role: ['name'] }));
      const tone = series[gi]?.[pi];
      dotItems.push({ kind: 'circle', cx: axisX, cy: dotY, r: DOT_R, role: dotRole(tone) });
      let x = boxLeft;
      const boxes: PlacedBox[] = r.lines.map((lines, k) => {
        const w = r.ws[k] ?? BOX_MIN;
        const h = boxHeight(lines.length);
        const box = { x, y: dotY - r.boxH / 2, w, h: r.boxH, lines };
        x += w + STACK_GAP;
        return box;
      });
      if (boxes.length > 0) lineItems.push({ kind: 'line', points: [{ x: axisX, y: dotY }, { x: boxLeft, y: dotY }], role: ['edge'] });
      for (const b of boxes) contentItems.push(...boxItems(b, g.name !== undefined, tone));
      periods.push({ label, dot: { x: axisX, y: dotY }, boxes, row: 0 });
      lastRowBottom = y + r.h;
      y += r.h + TD_ROW_GAP;
    });
    const rectBottom = lastRowBottom + ZONE_PAD;
    if (names !== undefined) {
      const zone: PlacedZone = { x: MARGIN, y: rectTop, w: zoneRight - MARGIN, h: rectBottom - rectTop, name: names };
      placedZones.push(zone);
      zoneItems.push({ kind: 'box', style: 'frame', x: zone.x, y: zone.y, w: zone.w, h: zone.h, role: ['zone'] });
      names.forEach((text, i) => zoneItems.push({ kind: 'text', x: MARGIN + ZONE_PAD, y: rectTop + ZONE_PAD + 8 + LINE * i, text, anchor: 'start', role: ['zone-name'] }));
    }
    bottom = g.name === undefined ? lastRowBottom : rectBottom;
    segments.push({ from: groupTop, to: gi === model.groups.length - 1 ? lastRowBottom + 12 : rectBottom });
    rectTop = rectBottom + ZONE_GAP;
  });

  const axisLines = segments.map(
    (seg, i): SceneItem => ({ kind: 'line', points: [{ x: axisX, y: seg.from }, { x: axisX, y: seg.to }], role: i === segments.length - 1 ? ['edge', 'edge--arrow'] : ['edge'] }),
  );
  items.push(...zoneItems, ...axisLines, ...lineItems, ...dotItems, ...contentItems);
  const titleWidth = model.title === undefined ? 0 : ceilTo(ruler.textWidth(model.title, 'title') * TITLE_SIZE_RATIO) + 2 * MARGIN;
  const w = Math.max(contentRight + MARGIN, titleWidth);
  const h = bottom + MARGIN;
  return { scene: { width: w, height: h, title: model.title ?? 'timeline', items, theme }, width: w, height: h, direction: 'TD', periods, zones: placedZones };
}

/** Places a timeline: periods on an axis as dots, events stacked below (or beside) them, sections as zones. */
export function layoutTimeline(model: TimelineModel, ruler: Ruler, theme: Theme = DEFAULT_THEME, opts: TimelineLayoutOptions = {}): TimelineLayout {
  const multicolor = opts.multicolor ?? true;
  return model.direction === 'TD' ? layoutVertical(model, ruler, theme, multicolor) : layoutHorizontal(model, ruler, theme, opts.maxWidth ?? DEFAULT_WIDTH_LIMIT, multicolor);
}
