import { makeFormatter } from '../chart/format.ts';
import { cellWidth } from '../metrics.ts';
import { cut, padEnd, padStart } from '../text/terminal.ts';
import { total } from './model.ts';
import type { TreeNode, Treemap } from './model.ts';


interface Row {
  prefix: string;
  label: string;
  value: string;
}

/** The tree as indented rows; a group row carries the total of its leaves. */
export function treemapTextLines(map: Treemap, maxWidth: number | undefined): string[] {
  const fmt = makeFormatter(map.valueFormat);
  const rows: Row[] = [];
  const walk = (nodes: TreeNode[], lead: string, top: boolean): void => {
    nodes.forEach((n, i) => {
      const last = i === nodes.length - 1;
      const prefix = top ? '' : `${lead}${last ? '└── ' : '├── '}`;
      rows.push({ prefix, label: n.label, value: fmt(total(n)) });
      walk(n.children, top ? '' : `${lead}${last ? '    ' : '│   '}`, false);
    });
  };
  walk(map.roots, '', true);
  const valueW = Math.max(...rows.map((r) => cellWidth(r.value)));
  const natural = Math.max(...rows.map((r) => cellWidth(r.prefix) + cellWidth(r.label)));
  const cap = maxWidth === undefined ? natural : Math.max(1, Math.min(natural, maxWidth - 2 - valueW));
  const lines = rows.map((r) => {
    const label = cut(r.label, Math.max(1, cap - cellWidth(r.prefix)));
    return `${padEnd(`${r.prefix}${label}`, cap)}  ${padStart(r.value, valueW)}`;
  });
  const head = map.title === undefined ? [] : [maxWidth === undefined ? map.title : cut(map.title, maxWidth)];
  return [...head, ...lines];
}
