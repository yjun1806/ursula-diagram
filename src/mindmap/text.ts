import { cellWidth } from '../metrics.ts';
import type { MindNode, Mindmap } from './model.ts';

function cut(text: string, cap: number): string {
  if (cellWidth(text) <= cap) return text;
  let out = '';
  for (const ch of text) {
    if (cellWidth(`${out}${ch}…`) > cap) break;
    out += ch;
  }
  return `${out}…`;
}

const labelOf = (n: MindNode): string => n.paragraphs.join(' ');

/** The map as a tree: the root on the first line, then one line per node with `├──` and `└──` branches. */
export function mindmapTextLines(map: Mindmap, maxWidth: number | undefined, heading?: string): string[] {
  const rows: string[] = [];
  const walk = (children: MindNode[], prefix: string): void => {
    children.forEach((c, i) => {
      const last = i === children.length - 1;
      rows.push(`${prefix}${last ? '└── ' : '├── '}${labelOf(c)}`);
      walk(c.children, `${prefix}${last ? '    ' : '│   '}`);
    });
  };
  rows.push(labelOf(map.root));
  walk(map.root.children, '');
  const head = heading === undefined || heading === '' ? [] : [heading];
  const lines = [...head, ...rows];
  return maxWidth === undefined ? lines : lines.map((l) => cut(l, maxWidth));
}
