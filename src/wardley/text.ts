import { cellWidth } from '../metrics.ts';
import { cut, padEnd, padStart, spansOf, trimEndSpans } from '../text/terminal.ts';
import type { TextSpan } from '../types.ts';
import type { WardleyMap } from './parse.ts';

const GAP = 2;
const MIN = 4;

/**
 * The values as a table: the title, a header, then one row per component with its visibility and evolution. The title
 * and the component names are bold, the header dim, and where a component evolves to is an accent.
 */
export function wardleyTextSpans(map: WardleyMap, maxWidth: number | undefined): TextSpan[][] {
  const evolves = new Map(map.evolves.map((e) => [e.name, e.targetText]));
  const rows = map.nodes.map((n) => ({
    name: n.name,
    vis: n.visibilityText,
    evo: evolves.has(n.name) ? `${n.evolutionText} -> ${evolves.get(n.name)}` : n.evolutionText,
    from: evolves.has(n.name) ? n.evolutionText : undefined,
  }));
  const head = { name: 'component', vis: 'visibility', evo: 'evolution', from: undefined };
  const all = [head, ...rows];
  const visW = Math.max(...all.map((r) => cellWidth(r.vis)));
  const evoW = Math.max(...all.map((r) => cellWidth(r.evo)));
  let nameW = Math.max(...all.map((r) => cellWidth(r.name)));
  if (maxWidth !== undefined) nameW = Math.max(MIN, Math.min(nameW, maxWidth - visW - evoW - 2 * GAP));
  const lines: TextSpan[][] = [];
  const title = map.title ?? 'Wardley map';
  lines.push(spansOf([maxWidth === undefined ? title : cut(title, maxWidth), 'bold']));
  const gap = ' '.repeat(GAP);
  for (const r of all) {
    const name = cut(r.name, nameW);
    const evo = padStart(r.evo, evoW);
    // The evolution column: `from -> to`, the arrow and target as an accent.
    const split = r.from === undefined ? evo.length : evo.length - (r.evo.length - r.from.length);
    const row =
      r === head
        ? spansOf([[padEnd(name, nameW), padStart(r.vis, visW), evo].join(gap), 'dim'])
        : spansOf([name, 'bold'], padEnd('', nameW - cellWidth(name)), gap, padStart(r.vis, visW), gap, evo.slice(0, split), [evo.slice(split), 'accent']);
    lines.push(trimEndSpans(row));
  }
  return lines;
}
