import { cellWidth } from '../metrics.ts';
import { cut, padEnd, padStart } from '../text/terminal.ts';
import type { Venn } from './model.ts';


/** The sets and unions as a table: a title line, then `name  size` rows; the size column is left out when no size is written. */
export function vennTextLines(venn: Venn, maxWidth: number | undefined): string[] {
  const nameOf = (id: string): string => venn.sets.find((s) => s.id === id)?.label ?? id;
  const rows: Array<[string, string]> = [];
  for (const set of venn.sets) {
    rows.push([set.label, set.sizeText ?? '']);
    for (const t of set.texts) rows.push([`  ${t.label}`, '']);
  }
  for (const u of venn.unions) {
    const sets = u.ids.map(nameOf).join(' ∩ ');
    rows.push([u.label === undefined ? sets : `${sets} : ${u.label}`, u.sizeText ?? '']);
    for (const t of u.texts) rows.push([`  ${t.label}`, '']);
  }
  const valueW = Math.max(...rows.map(([, v]) => cellWidth(v)));
  const labelW = Math.max(...rows.map(([l]) => cellWidth(l)));
  const fixed = valueW === 0 ? 0 : 2 + valueW;
  const cap = maxWidth === undefined ? labelW : Math.max(1, Math.min(labelW, maxWidth - fixed));
  const body = rows.map(([label, value]) => (valueW === 0 ? cut(label, cap) : `${padEnd(cut(label, cap), cap)}  ${padStart(value, valueW)}`));
  const head = venn.title === undefined ? [] : [maxWidth === undefined ? venn.title : cut(venn.title, maxWidth)];
  return [...head, ...body];
}
