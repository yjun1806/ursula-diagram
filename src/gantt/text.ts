import { cellWidth } from '../metrics.ts';
import { UrsulaError } from '../types.ts';
import type { TextSpan, TextTone } from '../types.ts';
import type { Gantt, GanttTask } from './model.ts';
import { planTicks } from './ticks.ts';
import { DAY } from './time.ts';

type Row = TextSpan[];

const DEFAULT_WIDTH = 80;
const MIN_WIDTH = 28;
const MIN_CHART = 10;

/** Cell lengths a terminal column may stand for, shortest first: round steps of a second, a minute, an hour, then whole days. */
const CELLS_MS = [
  1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10_000, 15_000, 30_000, 60_000, 120_000, 300_000, 600_000, 900_000, 1_800_000, 3_600_000, 7_200_000, 10_800_000,
  14_400_000, 21_600_000, 28_800_000, 43_200_000, DAY, 2 * DAY, 3 * DAY, 7 * DAY, 14 * DAY, 30 * DAY, 91 * DAY, 182 * DAY, 365 * DAY, 730 * DAY, 1825 * DAY, 3650 * DAY,
  7300 * DAY, 18_250 * DAY, 36_500 * DAY, 365_000 * DAY, 3_650_000 * DAY,
];

const span = (text: string, tone: TextTone = 'normal'): TextSpan => ({ text, tone });

/** Cuts `text` to at most `limit` cells, ending with an ellipsis when something was left off. */
function fit(text: string, limit: number): string {
  if (cellWidth(text) <= limit) return text;
  let out = '';
  for (const ch of text) {
    if (cellWidth(out + ch) > limit - 1) break;
    out += ch;
  }
  return `${out}…`;
}

const padTo = (text: string, width: number): string => text + ' '.repeat(Math.max(0, width - cellWidth(text)));

function statusOf(t: GanttTask): string {
  return [t.durationText, ...(t.done ? ['done'] : []), ...(t.active ? ['active'] : []), ...(t.milestone ? ['milestone'] : []), ...(t.crit ? ['crit'] : [])].join(' ');
}

function toneOf(t: GanttTask): TextTone {
  if (t.active) return 'accent';
  if (t.crit) return 'bold';
  return t.done ? 'dim' : 'normal';
}

interface Cell {
  ch: string;
  tone: TextTone;
}

/** Joins neighbouring cells of one tone into spans. */
function spansOf(cells: Cell[]): Row {
  const out: Row = [];
  for (const cell of cells) {
    const last = out[out.length - 1];
    if (last !== undefined && last.tone === cell.tone) last.text += cell.ch;
    else out.push(span(cell.ch, cell.tone));
  }
  return out;
}

function trimEnd(row: Row): Row {
  const out = [...row];
  for (;;) {
    const last = out[out.length - 1];
    if (last === undefined) return out;
    const text = last.text.trimEnd();
    if (text === '') out.pop();
    else {
      out[out.length - 1] = { ...last, text };
      return out;
    }
  }
}

/** Draws the chart as terminal rows: names on the left, `█` bars on a date axis, `◆` for milestones. */
export function layoutGanttText(model: Gantt, maxWidth: number | undefined): Row[] {
  const width = maxWidth ?? DEFAULT_WIDTH;
  if (width < MIN_WIDTH) throw new UrsulaError(`A Gantt drawing needs at least ${MIN_WIDTH} columns of width; the limit is ${width}.`, 'gantt-width');
  const rowsOf = model.tasks.flatMap((t, i) => (t.vert ? [] : [i]));
  const tasks = model.tasks;
  const task = (i: number): GanttTask => tasks[i] as GanttTask;
  const centre = (t: GanttTask): number => (t.milestone ? t.start + (t.end - t.start) / 2 : t.start);

  const marks = [...rowsOf.flatMap((i) => (task(i).milestone ? [centre(task(i))] : [task(i).start, task(i).end])), ...tasks.filter((t) => t.vert).map((t) => t.start)];
  const t0 = Math.min(...marks);
  const t1 = Math.max(...marks) > t0 ? Math.max(...marks) : t0 + DAY;

  const named = model.sections.some((s) => s !== '');
  const indent = named ? 2 : 0;
  const nameLimit = Math.max(10, Math.floor(width * 0.34));
  const nameW = Math.min(nameLimit, Math.max(...rowsOf.map((i) => cellWidth(task(i).label)), ...model.sections.map(cellWidth)) + indent);
  const rightW = Math.max(...rowsOf.map((i) => cellWidth(statusOf(task(i))) + 1));
  let showRight = true;
  let chartW = width - nameW - 1 - rightW;
  if (chartW < MIN_CHART) {
    showRight = false;
    chartW = width - nameW - 1;
  }
  if (chartW < MIN_CHART) throw new UrsulaError(`A Gantt drawing needs ${nameW + 1 + MIN_CHART} columns for its names and chart; the limit is ${width}.`, 'gantt-width');

  const cellMs = CELLS_MS.find((c) => Math.ceil((t1 - t0) / c) <= chartW) ?? (t1 - t0) / chartW;
  const cellOf = (t: number): number => (t - t0) / cellMs;
  const columns = Math.min(chartW, Math.max(1, Math.ceil(cellOf(t1))));

  const plan = planTicks({ t0, t1, posOf: cellOf, width: cellWidth, gap: 1, axisFormat: model.axisFormat, tickInterval: model.tickInterval, weekday: model.weekday, wholeDays: marks.every((m) => m % DAY === 0) });
  const blank = (n: number): Cell[] => Array.from({ length: n }, () => ({ ch: ' ', tone: 'normal' as TextTone }));
  const put = (cells: Cell[], at: number, text: string, tone: TextTone): void => {
    let col = at;
    for (const ch of text) {
      const w = cellWidth(ch);
      if (col + w > cells.length) return;
      cells[col] = { ch, tone };
      for (let k = 1; k < w; k++) cells[col + k] = { ch: '', tone };
      col += w;
    }
  };
  const lead = (text: string, tone: TextTone = 'normal'): Row => [span(padTo(fit(text, nameW), nameW) + ' ', tone)];
  const rows: Row[] = [];

  if (model.title !== undefined) rows.push([span(fit(model.title, width), 'bold')]);
  if (plan.twoRow) {
    const cells = blank(columns + rightW);
    for (const tick of plan.ticks) if (tick.month !== undefined) put(cells, Math.floor(cellOf(tick.t)), tick.month, 'dim');
    rows.push([...lead(''), ...spansOf(cells)]);
  }
  const labelCells = blank(columns + rightW);
  for (const tick of plan.ticks) if (tick.label !== '') put(labelCells, Math.floor(cellOf(tick.t)), tick.label, 'dim');
  rows.push([...lead(''), ...spansOf(labelCells)]);
  const rule = blank(columns);
  for (let i = 0; i < columns; i++) rule[i] = { ch: '─', tone: 'dim' };
  for (const tick of plan.ticks) {
    const at = Math.floor(cellOf(tick.t));
    if (at >= 0 && at < columns) rule[at] = { ch: '┬', tone: 'dim' };
  }
  rows.push([span('─'.repeat(nameW + 1), 'dim'), ...spansOf(rule)]);

  const verts = tasks.filter((t) => t.vert).map((t) => ({ col: Math.min(columns - 1, Math.max(0, Math.floor(cellOf(t.start)))), label: t.label }));
  let section = -1;
  for (const ti of rowsOf) {
    const t = task(ti);
    if (named && t.section !== section) {
      section = t.section;
      rows.push([span(padTo(fit(model.sections[section] ?? '', nameW), nameW) + ' ', 'bold')]);
    }
    const cells = blank(columns + (showRight ? rightW : 0));
    for (const v of verts) if (v.col < columns) cells[v.col] = { ch: '┊', tone: 'dim' };
    let end: number;
    if (t.milestone) {
      const at = Math.min(columns - 1, Math.max(0, Math.floor(cellOf(centre(t)))));
      put(cells, at, '◆', 'accent');
      end = at + 1;
    } else {
      const from = Math.min(columns - 1, Math.max(0, Math.floor(cellOf(t.start))));
      const to = Math.min(columns, Math.max(from + 1, Math.ceil(cellOf(t.end))));
      for (let c = from; c < to; c++) cells[c] = { ch: '█', tone: toneOf(t) };
      end = to;
    }
    if (showRight) put(cells, end + 1, statusOf(t), 'dim');
    rows.push([...lead(`${' '.repeat(indent)}${t.label}`), ...spansOf(cells)]);
  }

  // Markers get their names on a row of their own under the chart.
  verts.forEach((v, i) => {
    const cells = blank(columns + rightW);
    for (const other of verts.slice(i + 1)) cells[other.col] = { ch: '┊', tone: 'dim' };
    // A name that would run past the chart ends at its marker instead.
    const room = cells.length - v.col;
    if (cellWidth(`┊ ${v.label}`) <= room) put(cells, v.col, `┊ ${v.label}`, 'dim');
    else put(cells, Math.max(0, v.col - cellWidth(v.label) - 1), `${v.label} ┊`, 'dim');
    rows.push([...lead(''), ...spansOf(cells)]);
  });

  return rows.map(trimEnd);
}

export const joinSpans = (row: Row): string => row.map((s) => s.text).join('');
