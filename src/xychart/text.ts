import { trimmedNumber } from '../chart/format.ts';
import { cellWidth } from '../metrics.ts';
import type { Ruler } from '../metrics.ts';
import { cut, padEnd, spansOf } from '../text/terminal.ts';
import type { TextSpan, TextTone } from '../types.ts';
import type { XyChart } from './model.ts';

const GAP = 2;


/**
 * The values as a table: a title line, then one row per category with a column per series. The title is bold, the
 * header and the category names dim, and the highest bar of each bar series is an accent.
 */
export function xychartTable(chart: XyChart, _ruler: Ruler, maxWidth: number | undefined): TextSpan[][] {
  const n = chart.categories?.length ?? Math.max(...chart.series.map((s) => s.points.length));
  const labels = Array.from({ length: n }, (_, i) => {
    if (chart.categories) return chart.categories[i] ?? '';
    if (chart.xRange) return trimmedNumber(chart.xRange.min + (n > 1 ? ((chart.xRange.max - chart.xRange.min) * i) / (n - 1) : 0), 10);
    return String(i + 1);
  });
  const kindCount = (k: 'bar' | 'line'): number => chart.series.filter((s) => s.kind === k).length;
  const seen = { bar: 0, line: 0 };
  const names = chart.series.map((s) => {
    seen[s.kind]++;
    return s.name ?? (kindCount(s.kind) > 1 ? `${s.kind} ${seen[s.kind]}` : s.kind);
  });
  const cols = chart.series.map((s) =>
    labels.map((_, i) => {
      const p = s.points[i];
      return p === undefined ? '-' : p.label === undefined ? p.raw : `${p.raw} ${p.label}`;
    }),
  );
  const header = chart.series.length > 1 || chart.xTitle !== undefined || chart.yTitle !== undefined;
  const fullHeads = chart.series.map((s, i) => (chart.series.length === 1 ? (chart.yTitle ?? s.name ?? '') : (names[i] ?? '')));
  const valueWidths = cols.map((c) => Math.max(...c.map(cellWidth)));
  const natural = valueWidths.reduce((a, w, i) => a + GAP + Math.max(w, header ? cellWidth(fullHeads[i] ?? '') : 0), 0);
  const tight = maxWidth !== undefined && natural + 4 > maxWidth;
  const heads = fullHeads.map((h, i) => (tight ? cut(h, Math.max(3, valueWidths[i] ?? 3)) : h));
  const widths = cols.map((c, i) => Math.max(...c.map(cellWidth), header ? cellWidth(heads[i] ?? '') : 0));
  const valuesW = widths.reduce((a, w) => a + GAP + w, 0);
  const labelHead = header ? (chart.xTitle ?? '') : '';
  let labelW = Math.max(...labels.map(cellWidth), cellWidth(labelHead));
  if (maxWidth !== undefined) labelW = Math.max(4, Math.min(labelW, maxWidth - valuesW));
  // The row of the highest bar of each bar series, the first when several are as high.
  const highest = chart.series.map((s) => {
    if (s.kind !== 'bar') return -1;
    const values = labels.map((_, i) => s.points[i]?.value ?? -Infinity);
    return values.indexOf(Math.max(...values));
  });
  const line = (label: string, cells: string[], tone: (i: number) => TextTone): TextSpan[] =>
    spansOf([padEnd(cut(label, labelW), labelW), 'dim'], ...cells.flatMap((c, i) => [padEnd('', GAP + (widths[i] ?? 0) - cellWidth(c)), [c, tone(i)] as const]));
  const out = [spansOf([maxWidth === undefined ? (chart.title ?? 'xychart') : cut(chart.title ?? 'xychart', maxWidth), 'bold'])];
  if (header) out.push(line(labelHead, heads, () => 'dim'));
  labels.forEach((l, r) => out.push(line(l, cols.map((c) => c[r] ?? ''), (i) => (highest[i] === r ? 'accent' : 'normal'))));
  return out;
}
