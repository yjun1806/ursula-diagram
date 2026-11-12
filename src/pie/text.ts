import { cellWidth } from '../metrics.ts';
import type { Pie } from './model.ts';

function cut(text: string, cap: number): string {
  if (cellWidth(text) <= cap) return text;
  let out = '';
  for (const ch of text) {
    if (cellWidth(`${out}${ch}…`) > cap) break;
    out += ch;
  }
  return `${out}…`;
}

const padEnd = (s: string, w: number): string => s + ' '.repeat(Math.max(0, w - cellWidth(s)));
const padStart = (s: string, w: number): string => ' '.repeat(Math.max(0, w - cellWidth(s))) + s;

/** Share of the whole, in percent with one decimal. */
export function percent(value: number, total: number): string {
  return `${((value / total) * 100).toFixed(1)}%`;
}

/** The values as a table: a title line, then `label  value  share` rows aligned in columns. */
export function pieTextLines(pie: Pie, maxWidth: number | undefined): string[] {
  const total = pie.slices.reduce((sum, s) => sum + s.value, 0);
  const values = pie.slices.map((s) => s.valueText);
  const shares = pie.slices.map((s) => percent(s.value, total));
  const valueW = Math.max(...values.map(cellWidth));
  const shareW = Math.max(...shares.map(cellWidth));
  const fixed = 2 + valueW + 2 + shareW;
  const labelW = Math.max(...pie.slices.map((s) => cellWidth(s.label)));
  const cap = maxWidth === undefined ? labelW : Math.max(1, Math.min(labelW, maxWidth - fixed));
  const rows = pie.slices.map((s, i) => {
    const label = cut(s.label, cap);
    return `${padEnd(label, cap)}  ${padStart(values[i] ?? '', valueW)}  ${padStart(shares[i] ?? '', shareW)}`;
  });
  const head = pie.title === undefined ? [] : [maxWidth === undefined ? pie.title : cut(pie.title, maxWidth)];
  return [...head, ...rows];
}
