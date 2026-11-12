import { cellWidth } from '../metrics.ts';
import { cut } from '../text/terminal.ts';
import { displayOrder } from './model.ts';
import type { Commit, GitGraph } from './model.ts';

const GLYPH = { NORMAL: '●', HIGHLIGHT: '◉', REVERSE: '⊗' } as const;

/** One cell per branch column: a glyph, plus the filler between it and the next column. */
interface Row {
  glyph: string[];
  /** `fill[i]` is the cell between column i and column i+1. */
  fill: string[];
}

/**
 * The graph as `git log --graph` draws it, oldest commit first: one row per commit, one column per branch
 * (`●` commit, `│` branch line, `╮` fork, `╯` merge), then the commit id, tag and the branches that end there.
 */
export function gitTextLines(graph: GitGraph, maxWidth: number | undefined): string[] {
  const order = displayOrder(graph);
  const col = new Map(order.map((n, i) => [n, i] as const));
  const cols = order.length;
  const rows: Row[] = graph.commits.map(() => ({ glyph: Array.from({ length: cols }, () => ' '), fill: Array.from({ length: Math.max(0, cols - 1) }, () => ' ') }));
  const colOf = (name: string): number => col.get(name) ?? 0;

  // Rows each branch line is alive in.
  const span = new Map<string, [number, number]>();
  for (const b of graph.branches) {
    const own = graph.commits.filter((c) => c.branch === b.name).map((c) => c.seq);
    const merged = graph.commits.filter((c) => c.kind === 'merge' && c.mergedFrom === b.name).map((c) => c.seq);
    const all = [...own, ...merged, ...(b.parent === undefined ? [] : [b.parent])];
    if (all.length === 0) continue;
    span.set(b.name, [b.parent ?? Math.min(...all), Math.max(...all)]);
  }
  for (const [name, [from, to]] of span) {
    for (let r = from; r <= to; r++) {
      const row = rows[r];
      if (row !== undefined) row.glyph[colOf(name)] = '│';
    }
  }
  for (const c of graph.commits) {
    const row = rows[c.seq];
    if (row !== undefined) row.glyph[colOf(c.branch)] = GLYPH[c.type];
  }

  /** A horizontal connector on `row` from the commit column `from` to the corner at `to`. */
  const connect = (row: Row | undefined, from: number, to: number): void => {
    if (row === undefined || from === to) return;
    const lo = Math.min(from, to);
    const hi = Math.max(from, to);
    for (let g = lo; g < hi; g++) row.fill[g] = '─';
    for (let i = lo + 1; i < hi; i++) {
      const cell = row.glyph[i];
      if (cell === ' ') row.glyph[i] = '─';
      else if (cell === '│') row.glyph[i] = '┼';
    }
  };
  for (const b of graph.branches) {
    if (b.parent === undefined) continue;
    const parent = graph.commits[b.parent];
    if (parent === undefined) continue;
    const row = rows[b.parent];
    connect(row, colOf(parent.branch), colOf(b.name));
    if (row !== undefined) row.glyph[colOf(b.name)] = colOf(b.name) > colOf(parent.branch) ? '╮' : '╭';
  }
  for (const c of graph.commits) {
    if (c.kind !== 'merge' || c.mergedFrom === undefined) continue;
    const row = rows[c.seq];
    connect(row, colOf(c.branch), colOf(c.mergedFrom));
    if (row !== undefined) row.glyph[colOf(c.mergedFrom)] = colOf(c.mergedFrom) > colOf(c.branch) ? '╯' : '╰';
  }

  // Branch names go beside the last commit of each branch.
  const tips = new Map<number, string[]>();
  if (graph.config.showBranches) {
    for (const name of order) {
      const own = graph.commits.filter((c) => c.branch === name);
      const tip = own[own.length - 1]?.seq ?? graph.branches.find((b) => b.name === name)?.parent;
      if (tip === undefined) continue;
      tips.set(tip, [...(tips.get(tip) ?? []), name]);
    }
  }

  const note = (c: Commit): string => {
    const parts: string[] = [];
    if (graph.config.showCommitLabel) parts.push(c.id);
    if (c.tag !== undefined) parts.push(`[${c.tag}]`);
    const names = tips.get(c.seq);
    if (names !== undefined) parts.push(`(${names.join(', ')})`);
    return parts.join('  ');
  };

  const graphCells = rows.map((row) => row.glyph.map((g, i) => `${g}${row.fill[i] ?? ''}`).join(''));
  const graphW = Math.max(0, ...graphCells.map(cellWidth));
  const lines = graph.commits.map((c, i) => {
    const left = (graphCells[i] ?? '').replace(/\s+$/u, '');
    const pad = ' '.repeat(Math.max(0, graphW - cellWidth(left)));
    const text = note(c);
    const room = maxWidth === undefined ? undefined : Math.max(1, maxWidth - graphW - 2);
    return `${left}${pad}  ${room === undefined ? text : cut(text, room)}`.replace(/\s+$/u, '');
  });
  const head = graph.title === undefined ? [] : [maxWidth === undefined ? graph.title : cut(graph.title, maxWidth)];
  const strays = order.filter((n) => !graph.commits.some((c) => c.branch === n) && !(tips.get(graph.branches.find((b) => b.name === n)?.parent ?? -1) ?? []).includes(n));
  const tail = graph.config.showBranches && strays.length > 0 ? [`(${strays.join(', ')})`] : [];
  return [...head, ...lines, ...tail];
}
