import { cellWidth } from '../metrics.ts';
import { cut, padEnd, padStart } from '../text/terminal.ts';
import type { WardleyMap } from './parse.ts';

const GAP = 2;
const MIN = 4;

/** The values as a table: the title, a header, then one row per component with its visibility and evolution. */
export function wardleyTextLines(map: WardleyMap, maxWidth: number | undefined): string[] {
  const evolves = new Map(map.evolves.map((e) => [e.name, e.targetText]));
  const rows = map.nodes.map((n) => ({
    name: n.name,
    vis: n.visibilityText,
    evo: evolves.has(n.name) ? `${n.evolutionText} -> ${evolves.get(n.name)}` : n.evolutionText,
  }));
  const head = { name: 'component', vis: 'visibility', evo: 'evolution' };
  const all = [head, ...rows];
  const visW = Math.max(...all.map((r) => cellWidth(r.vis)));
  const evoW = Math.max(...all.map((r) => cellWidth(r.evo)));
  let nameW = Math.max(...all.map((r) => cellWidth(r.name)));
  if (maxWidth !== undefined) nameW = Math.max(MIN, Math.min(nameW, maxWidth - visW - evoW - 2 * GAP));
  const lines: string[] = [];
  const title = map.title ?? 'Wardley map';
  lines.push(maxWidth === undefined ? title : cut(title, maxWidth));
  for (const r of all) lines.push([padEnd(cut(r.name, nameW), nameW), padStart(r.vis, visW), padStart(r.evo, evoW)].join(' '.repeat(GAP)).trimEnd());
  return lines;
}
