import { cellWidth } from '../metrics.ts';
import type { TextSpan } from '../types.ts';
import type { TimelineModel } from './model.ts';
import { wrapLines } from './wrap.ts';

const GAP = 2;

const pad = (s: string, w: number): string => s + ' '.repeat(Math.max(0, w - cellWidth(s)));

/** Draws a timeline for a terminal: periods in the left column, events beside them from top to bottom, sections as bold rules. */
export function layoutTimelineText(model: TimelineModel, maxWidth: number | undefined): TextSpan[][] {
  const limit = maxWidth ?? Infinity;
  const out: TextSpan[][] = [];
  const line = (text: string, tone: TextSpan['tone'] = 'normal'): void => {
    out.push(text === '' ? [] : [{ text, tone }]);
  };
  if (model.title !== undefined) {
    line(model.title, 'bold');
    line('');
  }
  const all = model.groups.flatMap((g) => g.periods);
  const labelCap = Number.isFinite(limit) ? Math.max(4, Math.floor(limit / 2) - GAP) : Infinity;
  const labels = all.map((p) => wrapLines(p.label, labelCap, cellWidth));
  const labelW = Math.max(0, ...labels.flat().map(cellWidth));
  const eventW = Number.isFinite(limit) ? Math.max(4, limit - labelW - GAP) : Infinity;
  model.groups.forEach((g, gi) => {
    if (g.name !== undefined) {
      if (gi > 0) line('');
      line(g.name.join(' '), 'bold');
    }
    for (const p of g.periods) {
      const label = labels[all.indexOf(p)] ?? [];
      const events = p.events.flatMap((e) => wrapLines(e, eventW, cellWidth));
      const n = Math.max(label.length, events.length);
      for (let i = 0; i < n; i++) {
        const l = pad(label[i] ?? '', labelW);
        const e = events[i];
        line(e === undefined ? l.trimEnd() : `${l}${' '.repeat(GAP)}${e}`);
      }
    }
  });
  return out;
}

export const joinSpans = (spans: TextSpan[]): string => spans.map((s) => s.text).join('');
