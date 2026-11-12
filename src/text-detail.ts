import { cellWidth } from './metrics.ts';
import type { Graph } from './types.ts';

/** How much of every box a terminal drawing keeps: all text, narrower description, or the title only. */
export type Detail = 'auto' | 'full' | 'narrow' | 'title';

const TITLE_LINES = 2;
const DESCRIPTION_LINES = 3;
/** Narrowest text width of a box the steps try. */
const NARROWEST = 10;

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

/** Width of the widest line of text in any box: the inner width of a box at step 1. */
export function innerWidth(graph: Graph): number {
  return Math.max(0, ...graph.nodes.flatMap((n) => [n.title, ...n.lines].map(cellWidth)));
}

/** Inner widths the narrower steps try, widest first: two cells less than step 1, then two less each time, down to ten. */
export function innerWidths(graph: Graph): number[] {
  const out: number[] = [];
  for (let w = innerWidth(graph) - 2; w >= NARROWEST; w -= 2) out.push(w);
  return out;
}

/**
 * Every title (at most two lines) and, when `describe`, every description (at most three) rewrapped to `width`
 * cells; undefined when one of them needs more lines. Nothing is cut.
 */
export function wrapGraph(graph: Graph, width: number, describe: boolean): Graph | undefined {
  const nodes = [];
  for (const n of graph.nodes) {
    const title = wrapCells(n.title, width);
    const description = describe ? wrapCells(n.lines.join(' '), width) : [];
    if (title.length > TITLE_LINES || description.length > DESCRIPTION_LINES) return undefined;
    nodes.push({ ...n, title: title[0] ?? '', lines: [...title.slice(1), ...description] });
  }
  return { ...graph, nodes };
}

/** The descriptions step 3 leaves out, as `title: description` lines that fit `width` cells. */
export function descriptionList(graph: Graph, width: number): string[] {
  return graph.nodes.flatMap((n) => {
    if (n.lines.length === 0) return [];
    const wrapped = wrapCells(`${n.title}: ${n.lines.join(' ')}`, Math.max(3, width - 2));
    return wrapped.map((line, i) => (i === 0 ? line : `  ${line}`));
  });
}

/** Titles only, unwrapped: the fallback when no width lets every title fit in two lines. */
export function titlesOnly(graph: Graph): Graph {
  return { ...graph, nodes: graph.nodes.map((n) => ({ ...n, lines: [] })) };
}
