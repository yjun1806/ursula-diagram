import { cellWidth } from '../metrics.ts';
import { span } from '../text/terminal.ts';
import { UrsulaError } from '../types.ts';
import type { TextSpan, TextTone } from '../types.ts';
import type { Kanban, KanbanCard } from './model.ts';

const COLUMN_GAP = 2;
const NARROW_COLUMN = 18;
const WIDE_COLUMN = 40;
const DEFAULT_COLUMN = 32;
const MIN_INNER = 4;

type Row = TextSpan[];

const rowWidth = (row: Row): number => row.reduce((n, s) => n + cellWidth(s.text), 0);
const pad = (row: Row, width: number): Row => {
  const gap = width - rowWidth(row);
  return gap > 0 ? [...row, span(' '.repeat(gap))] : row;
};

/** Cuts `text` into pieces of at most `limit` cells, between characters. */
function chop(text: string, limit: number): string[] {
  const pieces: string[] = [];
  let current = '';
  for (const ch of text) {
    if (current !== '' && cellWidth(current + ch) > limit) {
      pieces.push(current);
      current = '';
    }
    current += ch;
  }
  if (current !== '') pieces.push(current);
  return pieces;
}

/** Packs `units` into lines of at most `limit` cells, joined by `sep`; a unit wider than a line is chopped. */
function pack(units: string[], limit: number, sep: string): string[] {
  const lines: string[] = [];
  let current = '';
  for (const unit of units) {
    for (const piece of cellWidth(unit) > limit ? chop(unit, limit) : [unit]) {
      const joined = current === '' ? piece : `${current}${sep}${piece}`;
      if (cellWidth(joined) <= limit) current = joined;
      else {
        lines.push(current);
        current = piece;
      }
    }
  }
  if (current !== '') lines.push(current);
  return lines;
}

function tagUnits(card: KanbanCard): string[] {
  return [card.ticket, card.assigned, card.priority].flatMap((v) => (v === undefined ? [] : [`[${v}]`]));
}

function cardRows(card: KanbanCard, width: number): Row[] {
  const inner = width - 4;
  const body = (text: string, tone: TextTone): Row => [span('│ ', 'dim'), ...pad([span(text, tone)], inner), span(' │', 'dim')];
  const title = pack(card.title.split(/\s+/).filter((w) => w !== ''), inner, ' ').map((t) => body(t, 'normal'));
  const tags = pack(tagUnits(card), inner, ' ').map((t) => body(t, 'dim'));
  return [[span(`╭${'─'.repeat(width - 2)}╮`, 'dim')], ...title, ...tags, [span(`╰${'─'.repeat(width - 2)}╯`, 'dim')]];
}

function columnRows(model: Kanban, index: number, width: number): Row[] {
  const column = model.columns[index];
  if (column === undefined) return [];
  const name = pack(column.title.split(/\s+/).filter((w) => w !== ''), width, ' ').map((t): Row => [span(t, 'bold')]);
  return [...name, ...column.cards.flatMap((c) => cardRows(c, width))];
}

/** Draws the board as terminal rows: columns side by side when each keeps a readable width, else stacked. */
export function layoutKanbanText(model: Kanban, maxWidth: number | undefined): Row[] {
  const n = model.columns.length;
  const limit = maxWidth ?? Number.POSITIVE_INFINITY;
  if (limit < MIN_INNER + 4) throw new UrsulaError(`A kanban drawing needs at least ${MIN_INNER + 4} columns of width; the limit is ${limit}.`, 'kanban-width', undefined, { minWidth: MIN_INNER + 4 });
  const fit = maxWidth === undefined ? DEFAULT_COLUMN : Math.min(WIDE_COLUMN, Math.floor((maxWidth - COLUMN_GAP * (n - 1)) / n));
  let rows: Row[];
  if (fit >= NARROW_COLUMN || n === 1) {
    const width = Math.max(fit, MIN_INNER + 4);
    const stacks = model.columns.map((_, i) => columnRows(model, i, width));
    const height = Math.max(...stacks.map((s) => s.length));
    rows = Array.from({ length: height }, (_, y) =>
      stacks.flatMap((stack, i): Row => {
        const cell = pad(stack[y] ?? [], width);
        return i === 0 ? cell : [span(' '.repeat(COLUMN_GAP)), ...cell];
      }),
    );
  } else {
    const width = Math.min(WIDE_COLUMN, limit);
    rows = model.columns.flatMap((_, i) => [...(i === 0 ? [] : [[] as Row]), ...columnRows(model, i, width)]);
  }
  return rows.map(trimEnd);
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
