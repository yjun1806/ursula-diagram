import { cellWidth } from '../metrics.ts';
import type { TextSpan, TextTone } from '../types.ts';
import type { Ishikawa, IshikawaCause } from './parse.ts';

type Row = TextSpan[];

interface Node {
  text: string;
  tone: TextTone;
  children: Node[];
}

const span = (text: string, tone: TextTone = 'normal'): TextSpan => ({ text, tone });

/** Cuts `text` to at most `limit` cells, ending in an ellipsis when something is left out. */
function fit(text: string, limit: number): string {
  if (cellWidth(text) <= limit) return text;
  let out = '';
  for (const ch of text) {
    if (cellWidth(out + ch) > limit - 1) break;
    out += ch;
  }
  return `${out}…`;
}

/** Nests a flat run of causes by their depth. */
function nest(causes: IshikawaCause[]): Node[] {
  const roots: Node[] = [];
  const open: Node[] = [];
  for (const cause of causes) {
    const node: Node = { text: cause.text, tone: cause.depth > 1 ? 'dim' : 'normal', children: [] };
    open.length = cause.depth - 1;
    (cause.depth === 1 ? roots : open[cause.depth - 2]?.children ?? roots).push(node);
    open[cause.depth - 1] = node;
  }
  return roots;
}

/** The diagram as a tree: the problem, then its categories, then their causes. */
export function layoutIshikawaText(model: Ishikawa, maxWidth: number | undefined): Row[] {
  const limit = maxWidth ?? Number.POSITIVE_INFINITY;
  const rows: Row[] = [];
  const push = (guide: string, text: string, tone: TextTone): void => {
    const room = limit - cellWidth(guide);
    rows.push([...(guide === '' ? [] : [span(guide, 'dim')]), span(room >= 1 ? fit(text, room) : '', tone)]);
  };
  const walk = (nodes: Node[], prefix: string): void => {
    nodes.forEach((node, i) => {
      const last = i === nodes.length - 1;
      push(`${prefix}${last ? '└─ ' : '├─ '}`, node.text, node.tone);
      walk(node.children, `${prefix}${last ? '   ' : '│  '}`);
    });
  };
  push('', model.head, 'bold');
  model.categories.forEach((category, ci) => {
    const last = ci === model.categories.length - 1;
    push(last ? '└─ ' : '├─ ', category.name, 'accent');
    walk(nest(category.causes), last ? '   ' : '│  ');
  });
  return rows;
}

export const joinSpans = (row: Row): string => row.map((s) => s.text).join('');
