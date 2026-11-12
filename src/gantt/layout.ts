import type { Ruler } from '../metrics.ts';
import type { Theme } from '../render/theme.ts';
import type { Scene, SceneItem } from '../types.ts';
import type { Gantt, GanttTask } from './model.ts';
import { planTicks } from './ticks.ts';
import type { TickPlan } from './ticks.ts';
import { DAY, floorDiv, isExcludedDay } from './time.ts';

const LEFT = 40;
const ROW = 40;
const BAND = 24;
const BAND_TOP = 8;
const HALF = BAND / 2;
const SECTION_MIN = 96;
const NAME_ROOM = 152;
const TAG_GAP = 8;
const MAX_CHART = 960;
const MIN_BAR = 4;
const TICK_GAP = 12;
const COMPACT_GAP = 8;
/** A band narrower than this cannot carry its own name in compact mode. */
const INNER_MIN = 40;

/** Pixels per unit of time the chart may use: `ladder` values of each unit; the largest that fits wins. */
const UNITS_MS = [1, 1000, 60_000, 3_600_000, DAY, 7 * DAY, 30 * DAY, ...Array.from({ length: 8 }, (_, k) => 365 * DAY * 10 ** k)];
const SCALES = [32, 24, 16, 12, 8, 6, 4, 3, 2, 1.5, 1];

const ceil4 = (v: number): number => Math.ceil(v / 4) * 4;

export interface PlacedBar {
  /** Index into `Gantt.tasks`. */
  task: number;
  row: number;
  /** Left edge, width and top of the band; a milestone is a diamond of `BAND` across centred on `cx`. */
  x: number;
  y: number;
  w: number;
  h: number;
  cx: number;
  cy: number;
}

export interface GanttLayout {
  scene: Scene;
  bars: PlacedBar[];
  ticks: TickPlan;
  /** Pixels per millisecond. */
  scale: number;
  /** Where the first time of the axis stands. */
  origin: number;
  /** `after` lines that were left out because they would pass over a bar or have no room. */
  omitted: Array<{ from: number; to: number; reason: 'crosses' | 'short' }>;
}

/** The scale (pixels per millisecond) that gives the longest chart no wider than the limit, from round steps of a unit. */
export function chooseScale(span: number): number {
  let best = 0;
  for (const unit of UNITS_MS) for (const m of SCALES) if ((m / unit) * span <= MAX_CHART && m / unit > best) best = m / unit;
  return best > 0 ? best : MAX_CHART / span;
}

interface Rect {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

export function layoutGantt(model: Gantt, ruler: Ruler, theme?: Theme): GanttLayout {
  const w11 = (s: string): number => (ruler.textWidth(s, 'line') * 11) / 12;
  const w12 = (s: string): number => ruler.textWidth(s, 'line');
  const w13 = (s: string): number => ruler.textWidth(s, 'title');
  const taskOf = (i: number): GanttTask => model.tasks[i] as GanttTask;

  const rowTasks = model.tasks.flatMap((t, i) => (t.vert ? [] : [i]));
  const vertTasks = model.tasks.flatMap((t, i) => (t.vert ? [i] : []));
  const centreOf = (t: GanttTask): number => (t.milestone ? t.start + (t.end - t.start) / 2 : t.start);

  // Time axis
  const marks = [...rowTasks.flatMap((i) => (taskOf(i).milestone ? [centreOf(taskOf(i))] : [taskOf(i).start, taskOf(i).end])), ...vertTasks.map((i) => taskOf(i).start)];
  const t0 = Math.min(...marks);
  const t1 = Math.max(...marks) > t0 ? Math.max(...marks) : t0 + DAY;
  const scale = chooseScale(t1 - t0);
  const posOf = (t: number): number => (t - t0) * scale;
  const plan = planTicks({ t0, t1, posOf, width: w11, gap: TICK_GAP, axisFormat: model.axisFormat, tickInterval: model.tickInterval, weekday: model.weekday, wholeDays: marks.every((m) => m % DAY === 0) });

  // Each task's band and the text to its right, measured from the axis start (`rx`)
  interface Geo {
    rx: number;
    w: number;
    dur: string;
    chips: Array<{ dx: number; w: number; text: string }>;
    /** Right end of the text after the band, from the axis start. */
    reach: number;
  }
  const geoOf = new Map<number, Geo>();
  for (const ti of rowTasks) {
    const t = taskOf(ti);
    const milestone = t.milestone;
    const w = milestone ? BAND : Math.max(MIN_BAR, (t.end - t.start) * scale);
    const rx = milestone ? posOf(centreOf(t)) - HALF : posOf(t.start);
    let at = rx + w + TAG_GAP + w11(t.durationText);
    const chips: Geo['chips'] = [];
    for (const [on, text] of [[t.done, 'done'], [t.active, 'active'], [t.milestone, 'milestone']] as const) {
      if (!on) continue;
      const cw = ceil4(w11(text) + 16);
      const dx = at + (chips.length === 0 ? TAG_GAP : 4);
      chips.push({ dx, w: cw, text });
      at = dx + cw;
    }
    geoOf.set(ti, { rx, w, dur: t.durationText, chips, reach: at });
  }
  const geo = (ti: number): Geo => geoOf.get(ti) as Geo;

  // Rows: one task each, or in compact mode the topmost row of its section where it clears the others
  const lines: number[][] = [];
  const lineSection: number[] = [];
  const lineEnds: number[] = [];
  for (const ti of rowTasks) {
    const t = taskOf(ti);
    const g = geo(ti);
    let row = -1;
    if (model.compact === true && !t.milestone && g.w >= INNER_MIN) {
      row = lines.findIndex((_, r) => lineSection[r] === t.section && g.rx >= (lineEnds[r] ?? 0) + COMPACT_GAP);
    }
    if (row < 0) {
      row = lines.length;
      lines.push([]);
      lineSection.push(t.section);
      lineEnds.push(Number.NEGATIVE_INFINITY);
    }
    lines[row]?.push(ti);
    lineEnds[row] = g.reach;
  }
  const rowOfTask = new Map<number, number>();
  lines.forEach((tasksOfLine, row) => tasksOfLine.forEach((ti) => rowOfTask.set(ti, row)));

  // Columns
  const named = model.sections.some((s) => s !== '');
  const sectionW = named ? Math.max(SECTION_MIN, ceil4(Math.max(...model.sections.map(w13)) + 16)) : 0;
  const nameX = LEFT + sectionW;
  const nameW = Math.max(...lines.map((l) => w12(taskOf(l[0] ?? 0).label)));
  const x0 = Math.max(nameX + NAME_ROOM, ceil4(nameX + nameW + 24));
  const xOf = (t: number): number => x0 + posOf(t);

  // Rows' places
  const hasTitle = model.title !== undefined;
  const base = hasTitle ? 120 : 80;
  const gridTop = plan.twoRow ? base : base - 12;
  const rowTop = (row: number): number => gridTop + ROW * row;
  const gridBottom = rowTop(lines.length);

  const bars: PlacedBar[] = [];
  const labels = new Map<number, { dur: { x: number; text: string }; chips: Array<{ x: number; w: number; text: string }>; right: number }>();
  const obstacles: Rect[][] = lines.map(() => []);
  for (const ti of rowTasks) {
    const row = rowOfTask.get(ti) ?? 0;
    const g = geo(ti);
    const x = x0 + g.rx;
    const y = rowTop(row) + BAND_TOP;
    const cy = y + HALF;
    bars.push({ task: ti, row, x, y, w: g.w, h: BAND, cx: x + g.w / 2, cy });
    const durX = x + g.w + TAG_GAP;
    const chips = g.chips.map((c) => ({ x: ceil4(x0 + c.dx), w: c.w, text: c.text }));
    const right = chips.length === 0 ? durX + w11(g.dur) : (chips[chips.length - 1]?.x ?? 0) + (chips[chips.length - 1]?.w ?? 0);
    labels.set(ti, { dur: { x: durX, text: g.dur }, chips, right });
    obstacles[row]?.push({ x0: x, x1: x + g.w, y0: y, y1: y + BAND }, { x0: durX, x1: right, y0: cy - 10, y1: cy + 10 });
  }

  // Vertical markers: a dashed line with its name under the chart
  const vertLabels = vertTasks.map((ti) => {
    const t = taskOf(ti);
    const x = xOf(t.start);
    return { x, text: t.label, right: x + 4 + w11(t.label), level: 0 };
  });
  const levelEnds: number[] = [];
  for (const v of vertLabels) {
    let level = levelEnds.findIndex((end) => v.x + 4 >= end + TICK_GAP);
    if (level < 0) {
      level = levelEnds.length;
      levelEnds.push(0);
    }
    levelEnds[level] = v.right;
    v.level = level;
  }

  // Overall size
  const x1 = x0 + posOf(t1);
  const tickRight = Math.max(...plan.ticks.map((t) => (t.label === '' ? 0 : xOf(t.t) + w11(t.label))), ...plan.ticks.map((t) => (t.month === undefined ? 0 : xOf(t.t) + w12(t.month))));
  const titleRight = model.title === undefined ? 0 : LEFT + (w13(model.title) * 15) / 13;
  const rightMost = Math.max(x1, tickRight, titleRight, ...[...labels.values()].map((l) => l.right), ...vertLabels.map((v) => v.right));
  const width = ceil4(rightMost) + 40;
  const height = gridBottom + 40 + (vertLabels.length === 0 ? 0 : 16 * levelEnds.length + 8);

  const items: SceneItem[] = [];
  const lineItem = (x1p: number, y1p: number, x2p: number, y2p: number, role: string[]): SceneItem => ({
    kind: 'line',
    points: [
      { x: x1p, y: y1p },
      { x: x2p, y: y2p },
    ],
    role,
  });

  items.push({ kind: 'box', style: 'frame', x: 16, y: 16, w: width - 32, h: height - 32, role: ['panel'] });
  if (model.title !== undefined) items.push({ kind: 'text', x: LEFT, y: 52, text: model.title, role: ['title'] });

  // Excluded days, as columns behind the grid
  const days = floorDiv(t1, DAY) - floorDiv(t0, DAY);
  if ((model.excludes.weekdays.length > 0 || model.excludes.days.length > 0) && days <= 4000) {
    let runStart: number | undefined;
    const close = (endDay: number): void => {
      if (runStart === undefined) return;
      const a = xOf(Math.max(runStart * DAY, t0));
      const b = xOf(Math.min(endDay * DAY, t1));
      if (b > a) items.push({ kind: 'box', style: 'frame', x: a, y: gridTop, w: b - a, h: gridBottom - gridTop, radius: 0, role: ['zone'], data: { excluded: 'true' } });
      runStart = undefined;
    };
    for (let d = floorDiv(t0, DAY); d <= floorDiv(t1, DAY); d++) {
      if (isExcludedDay(model.excludes, d)) runStart ??= d;
      else close(d);
    }
    close(floorDiv(t1, DAY) + 1);
  }

  for (const v of vertLabels) {
    items.push(lineItem(v.x, gridTop, v.x, gridBottom, ['edge', 'edge--msg', 'edge--pending']));
    items.push({ kind: 'text', x: v.x + 4, y: gridBottom + 16 + 16 * v.level, text: v.text, role: ['tick', 'start'] });
  }

  for (const tick of plan.ticks) {
    const x = xOf(tick.t);
    items.push(lineItem(x, gridTop, x, gridBottom, ['grid']));
    if (tick.label !== '') items.push({ kind: 'text', x, y: gridTop - 16, text: tick.label, role: ['tick', 'start'] });
    if (tick.month !== undefined) items.push({ kind: 'text', x, y: gridTop - 36, text: tick.month, role: ['axis-name'] });
  }

  // Section dividers and names
  const firstRowOf = new Map<number, number>();
  const lastRowOf = new Map<number, number>();
  rowTasks.forEach((ti) => {
    const row = rowOfTask.get(ti) ?? 0;
    const s = taskOf(ti).section;
    if (!firstRowOf.has(s)) firstRowOf.set(s, row);
    lastRowOf.set(s, Math.max(lastRowOf.get(s) ?? 0, row));
  });
  const dividerRows = [0, ...[...lastRowOf.values()].map((r) => r + 1)];
  for (const row of new Set(dividerRows)) items.push(lineItem(LEFT, rowTop(row), width - 40, rowTop(row), ['grid']));
  model.sections.forEach((name, s) => {
    const row = firstRowOf.get(s);
    if (name !== '' && row !== undefined) items.push({ kind: 'text', x: LEFT, y: rowTop(row) + 20, text: name, role: ['zone-name'] });
  });
  lines.forEach((tasksOfLine, row) => items.push({ kind: 'text', x: nameX, y: rowTop(row) + 20, text: taskOf(tasksOfLine[0] ?? 0).label, role: ['body'] }));

  // `after` lines, under the bars
  const omitted: GanttLayout['omitted'] = [];
  const barOf = new Map(bars.map((b) => [b.task, b]));
  const ports = new Set<string>();
  const portItems: SceneItem[] = [];
  const arrowReach = 3;
  for (const to of rowTasks) {
    const target = barOf.get(to);
    if (target === undefined) continue;
    for (const from of taskOf(to).after) {
      const pred = barOf.get(from);
      if (pred === undefined || pred.row === target.row) continue;
      const predTask = taskOf(from);
      const left = target.x;
      const tip = left - arrowReach;
      const inset = Math.min(8, pred.w / 2);
      const xFrom = predTask.milestone ? pred.cx : Math.min(Math.max(left - 32, pred.x + inset), pred.x + pred.w - inset);
      const down = target.row > pred.row;
      const yFrom = down ? pred.y + pred.h : pred.y;
      if (tip - xFrom < 28) {
        omitted.push({ from, to, reason: 'short' });
        continue;
      }
      const between = down ? range(pred.row + 1, target.row) : range(target.row + 1, pred.row);
      const blocked = between.some((r) => (obstacles[r] ?? []).some((o) => xFrom >= o.x0 - 4 && xFrom <= o.x1 + 4));
      if (blocked) {
        omitted.push({ from, to, reason: 'crosses' });
        continue;
      }
      items.push({
        kind: 'line',
        points: [
          { x: xFrom, y: yFrom },
          { x: xFrom, y: target.cy },
          { x: tip, y: target.cy },
        ],
        role: ['edge', 'edge--arrow'],
        data: { from: taskOf(from).id, to: taskOf(to).id },
      });
      const key = `${xFrom}:${yFrom}`;
      if (!ports.has(key)) {
        ports.add(key);
        portItems.push({ kind: 'circle', cx: xFrom, cy: yFrom, r: 3.25, role: ['port'] });
      }
    }
  }

  // Bars and their text
  for (const bar of bars) {
    const t = taskOf(bar.task);
    const series = `series-${(t.section % 8) + 1}`;
    const data = { task: t.id };
    if (t.milestone) {
      const d = `M${bar.cx - HALF} ${bar.cy} L${bar.cx} ${bar.cy - HALF} L${bar.cx + HALF} ${bar.cy} L${bar.cx} ${bar.cy + HALF} Z`;
      items.push({ kind: 'path', d, role: [series], data });
      if (t.crit) items.push({ kind: 'path', d: diamondOutline(bar.cx, bar.cy), role: ['edge', 'edge--accent'], data });
    } else {
      items.push({ kind: 'box', style: 'frame', x: bar.x, y: bar.y, w: bar.w, h: bar.h, role: ['band', t.active ? series : `${series}--tint`], data });
      if (t.crit) items.push({ kind: 'path', d: roundedOutline(bar.x + 1, bar.y + 1, bar.w - 2, bar.h - 2, Math.min(5, (bar.w - 2) / 2)), role: ['edge', 'edge--accent'], data });
    }
    if (lines[bar.row]?.[0] !== bar.task) {
      const text = clip(t.label, bar.w - 16, w12);
      items.push({ kind: 'text', x: bar.x + 8, y: bar.cy, text, role: t.active ? ['body', 'on-start'] : ['body'], data });
    }
    const label = labels.get(bar.task);
    if (label === undefined) continue;
    items.push({ kind: 'text', x: label.dur.x, y: bar.cy, text: label.dur.text, role: ['tick', 'start'] });
    for (const chip of label.chips) {
      items.push({ kind: 'box', style: 'label', x: chip.x, y: bar.cy - 10, w: chip.w, h: 20, role: ['tag'] });
      items.push({ kind: 'text', x: chip.x + chip.w / 2, y: bar.cy, text: chip.text, role: ['tag-text'] });
    }
  }
  items.push(...portItems);

  const name = model.accTitle ?? (model.title === undefined ? 'gantt' : `gantt — ${model.title}`);
  const scene: Scene = { width, height, title: name, items, ...(theme === undefined ? {} : { theme }) };
  return { scene, bars, ticks: plan, scale, origin: x0, omitted };
}

/** `text` cut to `limit` with an ellipsis when it does not fit. */
function clip(text: string, limit: number, width: (s: string) => number): string {
  if (width(text) <= limit) return text;
  let out = '';
  for (const ch of text) {
    if (width(`${out}${ch}…`) > limit) break;
    out += ch;
  }
  return `${out}…`;
}

function range(from: number, to: number): number[] {
  return Array.from({ length: Math.max(0, to - from) }, (_, i) => from + i);
}

function roundedOutline(x: number, y: number, w: number, h: number, r: number): string {
  return `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`;
}

function diamondOutline(cx: number, cy: number): string {
  const r = HALF - 1;
  return `M${cx - r} ${cy}L${cx} ${cy - r}L${cx + r} ${cy}L${cx} ${cy + r}Z`;
}
