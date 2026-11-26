import { cutSpans, spansOf } from '../text/terminal.ts';
import type { TextSpan } from '../types.ts';
import type { MindNode, Mindmap } from './model.ts';

const labelOf = (n: MindNode): string => n.paragraphs.join(' ');

/**
 * The map as a tree: the root on the first line, then one line per node with `├──` and `└──` branches. The heading
 * and the root are bold, the branches dim.
 */
export function mindmapTextSpans(map: Mindmap, maxWidth: number | undefined, heading?: string): TextSpan[][] {
  const rows: TextSpan[][] = [];
  const walk = (children: MindNode[], prefix: string): void => {
    children.forEach((c, i) => {
      const last = i === children.length - 1;
      rows.push(spansOf([`${prefix}${last ? '└── ' : '├── '}`, 'dim'], labelOf(c)));
      walk(c.children, `${prefix}${last ? '    ' : '│   '}`);
    });
  };
  rows.push(spansOf([labelOf(map.root), 'bold']));
  walk(map.root.children, '');
  const head = heading === undefined || heading === '' ? [] : [spansOf([heading, 'bold'])];
  const lines = [...head, ...rows];
  return maxWidth === undefined ? lines : lines.map((l) => cutSpans(l, maxWidth));
}
