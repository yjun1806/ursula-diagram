import { cellWidth } from '../metrics.ts';
import { cut, padEnd, padStart } from '../text/terminal.ts';
import type { Radar } from './model.ts';


/** Values as a table: a row per axis, a column per curve. */
export function radarTextLines(model: Radar, maxWidth: number | undefined): string[] {
  const cols = model.curves.map((c, k) => ({ head: c.label, cells: model.axes.map((_, i) => String(c.values[i] ?? '')), k }));
  const labels = model.axes.map((a) => a.label);
  let labelW = Math.max(0, ...labels.map(cellWidth));
  const colW = cols.map((c) => Math.max(cellWidth(c.head), ...c.cells.map(cellWidth)));
  const total = (): number => labelW + colW.reduce((s, w) => s + 2 + w, 0);
  if (maxWidth !== undefined) {
    while (total() > maxWidth) {
      if (labelW > 8) {
        labelW--;
        continue;
      }
      const widest = Math.max(labelW, ...colW);
      if (widest <= 3) break;
      if (labelW === widest) labelW--;
      else colW[colW.findIndex((w) => w === widest)] = widest - 1;
    }
  }
  const lines: string[] = [];
  if (model.title !== undefined) lines.push(maxWidth === undefined ? model.title : cut(model.title, maxWidth));
  if (cols.length > 0) lines.push(padEnd('', labelW) + cols.map((c, j) => `  ${padStart(cut(c.head, colW[j] ?? 0), colW[j] ?? 0)}`).join(''));
  labels.forEach((l, i) => {
    lines.push(padEnd(cut(l, labelW), labelW) + cols.map((c, j) => `  ${padStart(c.cells[i] ?? '', colW[j] ?? 0)}`).join(''));
  });
  return lines.map((l) => l.trimEnd());
}
