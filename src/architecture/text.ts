import { cellWidth } from '../metrics.ts';
import { cut, span } from '../text/terminal.ts';
import type { TextSpan } from '../types.ts';
import type { ArchEdge, ArchGroup, ArchNode, Architecture } from './model.ts';

type Row = TextSpan[];

/** Lists the services of every group, then the connections between them, as terminal rows. */
export function layoutArchitectureText(model: Architecture, maxWidth: number | undefined): Row[] {
  const rows: Row[] = [];
  const labelCount = new Map<string, number>();
  for (const n of model.nodes) labelCount.set(n.label, (labelCount.get(n.label) ?? 0) + 1);
  const nameOf = (id: string): string => {
    const n = model.nodes.find((x) => x.id === id);
    if (n === undefined) return id;
    return (labelCount.get(n.label) ?? 0) > 1 || n.kind === 'junction' ? `${n.label} (${id})` : n.label;
  };

  if (model.title !== undefined) rows.push([span(model.title, 'bold')]);

  const nodeRow = (n: ArchNode, depth: number): Row => [
    span('  '.repeat(depth)),
    n.kind === 'junction' ? span(`${n.id} `, 'normal') : span(n.label),
    span(n.kind === 'junction' ? '(junction)' : n.icon === undefined ? '' : ` [${n.icon}]`, 'dim'),
  ];
  const groupRows = (g: ArchGroup, depth: number): void => {
    rows.push([span('  '.repeat(depth)), span(g.label, 'bold'), span(g.icon === undefined ? '' : ` (${g.icon})`, 'dim'), span(`  ${g.id}`, 'dim')]);
    for (const n of model.nodes.filter((x) => x.parent === g.id)) rows.push(nodeRow(n, depth + 1));
    for (const child of model.groups.filter((x) => x.parent === g.id)) groupRows(child, depth + 1);
  };
  for (const n of model.nodes.filter((x) => x.parent === undefined)) rows.push(nodeRow(n, 0));
  for (const g of model.groups.filter((x) => x.parent === undefined)) groupRows(g, 0);

  if (model.edges.length > 0) {
    if (rows.length > 0) rows.push([]);
    rows.push([span('Connections', 'bold')]);
    const end = (e: ArchEdge, which: 'from' | 'to'): string => {
      const id = which === 'from' ? e.from : e.to;
      const group = which === 'from' ? e.fromGroup : e.toGroup;
      const side = which === 'from' ? e.fromSide : e.toSide;
      return which === 'from' ? `${nameOf(id)}${group ? '{group}' : ''}:${side}` : `${side}:${nameOf(id)}${group ? '{group}' : ''}`;
    };
    for (const e of model.edges) {
      rows.push([span('  '), span(`${end(e, 'from')} ${e.startArrow ? '<' : ''}--${e.endArrow ? '>' : ''} ${end(e, 'to')}`)]);
    }
  }

  if (maxWidth === undefined) return rows;
  return rows.map((row) => {
    const text = row.map((s) => s.text).join('');
    if (cellWidth(text) <= maxWidth) return row;
    const cutText = cut(text, maxWidth);
    return [span(cutText)];
  });
}
