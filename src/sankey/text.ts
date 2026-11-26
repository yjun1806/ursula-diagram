import { cellWidth } from '../metrics.ts';
import { cut, padEnd, padStart, spansOf } from '../text/terminal.ts';
import type { TextSpan } from '../types.ts';
import { valueText } from './model.ts';
import type { Sankey } from './model.ts';

/** The flows as a table of source, target and value, in the order the rows were written. The title and the node names are bold; the largest flow is an accent. */
export function sankeyTextSpans(map: Sankey, maxWidth: number | undefined): TextSpan[][] {
  const rows = map.links.map((l) => ({ from: map.nodes[l.source]?.name ?? '', to: map.nodes[l.target]?.name ?? '', value: valueText(l.value) }));
  const valueW = Math.max(...rows.map((r) => cellWidth(r.value)));
  let fromW = Math.max(...rows.map((r) => cellWidth(r.from)));
  let toW = Math.max(...rows.map((r) => cellWidth(r.to)));
  if (maxWidth !== undefined) {
    const room = Math.max(2, maxWidth - 4 - valueW);
    while (fromW + toW > room && (fromW > 1 || toW > 1)) {
      if (fromW >= toW) fromW--;
      else toW--;
    }
  }
  const largest = map.links.findIndex((l) => l.value === Math.max(...map.links.map((m) => m.value)));
  const named = (text: string, width: number): TextSpan[] => {
    const name = cut(text, width);
    return spansOf([name, 'bold'], padEnd('', width - cellWidth(name)));
  };
  const lines = rows.map((r, i) => spansOf(named(r.from, fromW), '  ', named(r.to, toW), '  ', [padStart(r.value, valueW), i === largest ? 'accent' : 'normal']));
  const head = map.title === undefined ? [] : [spansOf([maxWidth === undefined ? map.title : cut(map.title, maxWidth), 'bold'])];
  return [...head, ...lines];
}
