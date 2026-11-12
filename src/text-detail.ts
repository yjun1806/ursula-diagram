import { cellWidth } from './metrics.ts';
import type { Graph } from './types.ts';

/** How much of every box a terminal drawing keeps: all text, narrower description, or the title only. */
export type Detail = 'auto' | 'full' | 'narrow' | 'title';

const DESCRIPTION_LINES = 3;

/** Breaks `text` into lines of at most `width` cells: at spaces, and inside a word only when the word is wider than a line. */
export function wrapCells(text: string, width: number): string[] {
  const out: string[] = [];
  let cur = '';
  const add = (word: string): void => {
    const joined = cur === '' ? word : `${cur} ${word}`;
    if (cellWidth(joined) <= width) {
      cur = joined;
      return;
    }
    if (cur !== '') {
      out.push(cur);
      cur = '';
    }
    for (const ch of word) {
      if (cur !== '' && cellWidth(cur + ch) > width) {
        out.push(cur);
        cur = '';
      }
      cur += ch;
    }
  };
  for (const word of text.split(/\s+/)) if (word !== '') add(word);
  if (cur !== '') out.push(cur);
  return out;
}

/** Description lines rewrapped to `width` cells, at most three; a longer text ends its third line with an ellipsis. */
function rewrap(lines: string[], width: number): string[] {
  const wrapped = wrapCells(lines.join(' '), width);
  if (wrapped.length <= DESCRIPTION_LINES) return wrapped;
  const kept = wrapped.slice(0, DESCRIPTION_LINES);
  let last = kept[DESCRIPTION_LINES - 1] ?? '';
  while (last !== '' && cellWidth(last) + 1 > width) last = last.slice(0, -1);
  kept[DESCRIPTION_LINES - 1] = `${last}…`;
  return kept;
}

/** Step 2: boxes as wide as the longest title, descriptions rewrapped to that width. */
export function narrowDescriptions(graph: Graph): Graph {
  const width = Math.max(1, ...graph.nodes.map((n) => cellWidth(n.title)));
  return { ...graph, nodes: graph.nodes.map((n) => ({ ...n, lines: rewrap(n.lines, width) })) };
}

/** Step 3: titles only. */
export function titlesOnly(graph: Graph): Graph {
  return { ...graph, nodes: graph.nodes.map((n) => ({ ...n, lines: [] })) };
}

/** The descriptions step 3 leaves out, as `title: description` lines that fit `width` cells. */
export function descriptionList(graph: Graph, width: number): string[] {
  return graph.nodes.flatMap((n) => {
    if (n.lines.length === 0) return [];
    const wrapped = wrapCells(`${n.title}: ${n.lines.join(' ')}`, Math.max(3, width - 2));
    return wrapped.map((line, i) => (i === 0 ? line : `  ${line}`));
  });
}
