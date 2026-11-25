import type { Layout } from '../types.ts';

const MOST = 5;

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const word = (id: string): string => `(?<![\\p{L}\\p{N}_])${escape(id)}(?![\\p{L}\\p{N}_])`;

/**
 * The line (from 1) of `src` that writes the edge `from` → `to`: the first line where both ids stand as words with an
 * arrow (two or more of `- . = < >`) between them. Undefined when no line does.
 */
export function edgeLine(rows: readonly string[], from: string, to: string): number | undefined {
  const arrow = '[^\\n]*?[-.=<>]{2,}[^\\n]*?';
  const forward = new RegExp(`${word(from)}${arrow}${word(to)}`, 'u');
  const backward = new RegExp(`${word(to)}${arrow}${word(from)}`, 'u');
  const at = rows.findIndex((r) => !r.trim().startsWith('%%') && (forward.test(r) || backward.test(r)));
  return at < 0 ? undefined : at + 1;
}

/**
 * Lines that say where the counts of `checkLines` come from: the pairs of lines that cross and the lines with the
 * most bends, each named by its ends and the line of the source that writes it.
 */
export function checkDetails(l: Layout, src: string): string[] {
  const rows = src.split(/\r?\n/);
  const name = (from: string, to: string): string => {
    const line = edgeLine(rows, from, to);
    return `${from} --> ${to}${line === undefined ? '' : ` (line ${line})`}`;
  };
  const out: string[] = [];
  const crossings = l.diagnostics.filter((d) => d.kind === 'crossing' && d.nodes.length === 4);
  for (const d of crossings.slice(0, MOST)) {
    const [a, b, c, e] = d.nodes as [string, string, string, string];
    const times = /\((\d+) times\)/.exec(d.message)?.[1];
    out.push(`crossing: ${name(a, b)} crosses ${name(c, e)}${times === undefined ? '' : ` (${times} times)`}`);
  }
  if (crossings.length > MOST) out.push(`crossing: … and ${crossings.length - MOST} more`);
  const bent = l.edges
    .filter((e) => !e.invisible && e.points.length - 2 >= 2)
    .map((e) => ({ e, bends: e.points.length - 2 }))
    .sort((p, q) => q.bends - p.bends)
    .slice(0, MOST);
  if (bent.length > 0) out.push(`bends: ${bent.map(({ e, bends }) => `${name(e.from, e.to)} ${bends}`).join(', ')}`);
  return out;
}
