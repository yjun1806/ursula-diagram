import { cellWidth } from '../metrics.ts';
import type { Ruler } from '../metrics.ts';
import { formatNumber } from './layout.ts';
import type { XyChart } from './model.ts';

const GAP = 2;

const padEnd = (s: string, w: number): string => s + ' '.repeat(Math.max(0, w - cellWidth(s)));
const padStart = (s: string, w: number): string => ' '.repeat(Math.max(0, w - cellWidth(s))) + s;

function shorten(s: string, w: number): string {
  if (cellWidth(s) <= w) return s;
  let out = '';
  for (const ch of s) {
    if (cellWidth(`${out}${ch}…`) > w) break;
    out += ch;
  }
  return `${out}…`;
}

/** The values as a table: a title line, then one row per category with a column per series. */
export function xychartTable(chart: XyChart, _ruler: Ruler, maxWidth: number | undefined): string[] {
  const n = chart.categories?.length ?? Math.max(...chart.series.map((s) => s.points.length));
  const labels = Array.from({ length: n }, (_, i) => {
    if (chart.categories) return chart.categories[i] ?? '';
    if (chart.xRange) return formatNumber(chart.xRange.min + (n > 1 ? ((chart.xRange.max - chart.xRange.min) * i) / (n - 1) : 0));
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
  const heads = fullHeads.map((h, i) => (tight ? shorten(h, Math.max(3, valueWidths[i] ?? 3)) : h));
  const widths = cols.map((c, i) => Math.max(...c.map(cellWidth), header ? cellWidth(heads[i] ?? '') : 0));
  const valuesW = widths.reduce((a, w) => a + GAP + w, 0);
  const labelHead = header ? (chart.xTitle ?? '') : '';
  let labelW = Math.max(...labels.map(cellWidth), cellWidth(labelHead));
  if (maxWidth !== undefined) labelW = Math.max(4, Math.min(labelW, maxWidth - valuesW));
  const line = (label: string, cells: string[]): string => padEnd(shorten(label, labelW), labelW) + cells.map((c, i) => ' '.repeat(GAP) + padStart(c, widths[i] ?? 0)).join('');
  const out = [maxWidth === undefined ? (chart.title ?? 'xychart') : shorten(chart.title ?? 'xychart', maxWidth)];
  if (header) out.push(line(labelHead, heads));
  labels.forEach((l, i) => out.push(line(l, cols.map((c) => c[i] ?? ''))));
  return out;
}
