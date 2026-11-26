import { cellWidth } from '../metrics.ts';
import { cutSpans, padEndSpans, spansOf } from '../text/terminal.ts';
import type { TextSpan } from '../types.ts';
import { DOMAIN_NAMES } from './model.ts';
import type { Cynefin, Domain } from './model.ts';

const ORDER: Domain[] = ['complex', 'complicated', 'chaotic', 'clear', 'confusion'];

/**
 * The values as a table: a title line, `domain  item` rows (the name only on a domain's first row),
 * then one `From → To : label` line per transition. The title and the domain names are bold, a transition's label dim.
 */
export function cynefinTextSpans(model: Cynefin, maxWidth: number | undefined): TextSpan[][] {
  const nameW = Math.max(...ORDER.map((d) => cellWidth(DOMAIN_NAMES[d])));
  const cap = (fixed: number): number => (maxWidth === undefined ? Number.POSITIVE_INFINITY : Math.max(1, maxWidth - fixed));
  const fit = (row: TextSpan[], fixed: number): TextSpan[] => cutSpans(row, cap(fixed));
  const rows = ORDER.flatMap((domain) => {
    const items = model.items[domain];
    const name = DOMAIN_NAMES[domain];
    if (items.length === 0) return [spansOf([name, 'bold'])];
    return items.map((item, i) => spansOf(padEndSpans(spansOf([i === 0 ? name : '', 'bold']), nameW), '  ', fit(spansOf(item), nameW + 2)));
  });
  const moves = model.transitions.map((t) => {
    const head = `${DOMAIN_NAMES[t.from]} → ${DOMAIN_NAMES[t.to]}`;
    return fit(spansOf(head, [t.label === undefined ? '' : ` : ${t.label}`, 'dim']), 0);
  });
  const head = model.title === undefined ? [] : [fit(spansOf([model.title, 'bold']), 0)];
  return [...head, ...rows, ...(moves.length === 0 ? [] : [[], ...moves])];
}
