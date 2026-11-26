import { cellWidth } from '../metrics.ts';
import { cut, padEnd, padStart, spansOf } from '../text/terminal.ts';
import type { TextSpan } from '../types.ts';
import type { Pie } from './model.ts';


/** Share of the whole, in percent with one decimal. */
export function percent(value: number, total: number): string {
  return `${((value / total) * 100).toFixed(1)}%`;
}

/**
 * The values as a table: a title line, then `label  value  share` rows aligned in columns. The title is bold, the
 * shares dim, and the share of the largest slice is an accent.
 */
export function pieTextSpans(pie: Pie, maxWidth: number | undefined): TextSpan[][] {
  const total = pie.slices.reduce((sum, s) => sum + s.value, 0);
  const values = pie.slices.map((s) => s.valueText);
  const shares = pie.slices.map((s) => percent(s.value, total));
  const valueW = Math.max(...values.map(cellWidth));
  const shareW = Math.max(...shares.map(cellWidth));
  const fixed = 2 + valueW + 2 + shareW;
  const labelW = Math.max(...pie.slices.map((s) => cellWidth(s.label)));
  const cap = maxWidth === undefined ? labelW : Math.max(1, Math.min(labelW, maxWidth - fixed));
  const largest = pie.slices.findIndex((s) => s.value === Math.max(...pie.slices.map((t) => t.value)));
  const rows = pie.slices.map((s, i) => {
    const label = cut(s.label, cap);
    return spansOf(`${padEnd(label, cap)}  ${padStart(values[i] ?? '', valueW)}  `, [padStart(shares[i] ?? '', shareW), i === largest ? 'accent' : 'dim']);
  });
  const head = pie.title === undefined ? [] : [spansOf([maxWidth === undefined ? pie.title : cut(pie.title, maxWidth), 'bold'])];
  return [...head, ...rows];
}
