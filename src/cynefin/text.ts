import { cellWidth } from '../metrics.ts';
import { cut, padEnd } from '../text/terminal.ts';
import { DOMAIN_NAMES } from './model.ts';
import type { Cynefin, Domain } from './model.ts';

const ORDER: Domain[] = ['complex', 'complicated', 'chaotic', 'clear', 'confusion'];

/**
 * The values as a table: a title line, `domain  item` rows (the name only on a domain's first row),
 * then one `From → To : label` line per transition.
 */
export function cynefinTextLines(model: Cynefin, maxWidth: number | undefined): string[] {
  const nameW = Math.max(...ORDER.map((d) => cellWidth(DOMAIN_NAMES[d])));
  const cap = (fixed: number): number => (maxWidth === undefined ? Number.POSITIVE_INFINITY : Math.max(1, maxWidth - fixed));
  const fit = (s: string, fixed: number): string => cut(s, cap(fixed));
  const rows = ORDER.flatMap((domain) => {
    const items = model.items[domain];
    const name = DOMAIN_NAMES[domain];
    if (items.length === 0) return [name];
    return items.map((item, i) => `${padEnd(i === 0 ? name : '', nameW)}  ${fit(item, nameW + 2)}`);
  });
  const moves = model.transitions.map((t) => {
    const head = `${DOMAIN_NAMES[t.from]} → ${DOMAIN_NAMES[t.to]}`;
    return fit(t.label === undefined ? head : `${head} : ${t.label}`, 0);
  });
  const head = model.title === undefined ? [] : [fit(model.title, 0)];
  return [...head, ...rows, ...(moves.length === 0 ? [] : ['', ...moves])];
}
