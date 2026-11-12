import { cellWidth } from '../metrics.ts';
import { cut, padEnd, padStart } from '../text/terminal.ts';
import { valueText } from './model.ts';
import type { Sankey } from './model.ts';

/** The flows as a table of source, target and value, in the order the rows were written. */
export function sankeyTextLines(map: Sankey, maxWidth: number | undefined): string[] {
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
  const lines = rows.map((r) => `${padEnd(cut(r.from, fromW), fromW)}  ${padEnd(cut(r.to, toW), toW)}  ${padStart(r.value, valueW)}`);
  const head = map.title === undefined ? [] : [maxWidth === undefined ? map.title : cut(map.title, maxWidth)];
  return [...head, ...lines];
}
