import { cellWidth } from '../metrics.ts';
import { cut, cutSpans, padEnd, padEndSpans, padStart, spansOf } from '../text/terminal.ts';
import type { TextSpan } from '../types.ts';
import type { Venn } from './model.ts';


/**
 * The sets and unions as a table: a title line, then `name  size` rows; the size column is left out when no size is
 * written. The title and the set names are bold; the texts inside a set or union are dim.
 */
export function vennTextSpans(venn: Venn, maxWidth: number | undefined): TextSpan[][] {
  const nameOf = (id: string): string => venn.sets.find((s) => s.id === id)?.label ?? id;
  const rows: Array<[TextSpan[], string]> = [];
  const texts = (list: ReadonlyArray<{ label: string }>): void => {
    for (const t of list) rows.push([spansOf(['  ' + t.label, 'dim']), '']);
  };
  for (const set of venn.sets) {
    rows.push([spansOf([set.label, 'bold']), set.sizeText ?? '']);
    texts(set.texts);
  }
  for (const u of venn.unions) {
    const sets = u.ids.map(nameOf).join(' ∩ ');
    rows.push([spansOf(sets, u.label === undefined ? '' : ` : ${u.label}`), u.sizeText ?? '']);
    texts(u.texts);
  }
  const text = (row: readonly TextSpan[]): string => row.map((s) => s.text).join('');
  const valueW = Math.max(...rows.map(([, v]) => cellWidth(v)));
  const labelW = Math.max(...rows.map(([l]) => cellWidth(text(l))));
  const fixed = valueW === 0 ? 0 : 2 + valueW;
  const cap = maxWidth === undefined ? labelW : Math.max(1, Math.min(labelW, maxWidth - fixed));
  const body = rows.map(([label, value]) => (valueW === 0 ? cutSpans(label, cap) : spansOf(padEndSpans(cutSpans(label, cap), cap), `  ${padStart(value, valueW)}`)));
  const head = venn.title === undefined ? [] : [spansOf([maxWidth === undefined ? venn.title : cut(venn.title, maxWidth), 'bold'])];
  return [...head, ...body];
}
