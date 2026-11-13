import { makeFormatter } from '../chart/format.ts';
import { ceilTo } from '../chart/grid.ts';
import type { Ruler } from '../metrics.ts';
import { shrinkToFit } from '../text/fit.ts';
import type { Scene, SceneItem } from '../types.ts';
import { isLeaf, total } from './model.ts';
import type { TreeNode, Treemap } from './model.ts';

/** Gap between two tiles, and between a group and what lies next to it. */
const TILE_GAP = 4;
const GROUP_GAP = 16;
/** Height of a group-name line, and of the root-name block. */
const NAME_LINE = 24;
const ROOT_BLOCK = 36;
/** A tile lower than a two-line label (padding, name, value, padding) joins the row at the foot of its column. */
const MIN_TILE_H = 56;
const TILE_PAD = 12;
const NAME_H = 18;
const VALUE_H = 16;
/** A tile's name stands on a baseline this far below the tile's top, its value on one this far below the name's. */
const NAME_BASE = 24;
const VALUE_STEP = 18;
const TITLE_H = 18;
const TITLE_GAP = 16;
const TITLE_SIZE = 15;
const CONTENT_W = 936;
const TILE_AREA_H = 400;
const MARGIN = 40;
const MIN_MARGIN = 16;
const SERIES = 8;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PlacedTile extends Rect {
  label: string;
  value: number;
  valueText: string;
  /** One-based colour family of the top-level group the tile belongs to. */
  series: number;
  cls?: string;
  /** Text the tile shows: the name possibly cut with an ellipsis, and the value; absent when the tile is too small. */
  nameShown?: string;
  valueShown?: string;
}

export interface PlacedName {
  label: string;
  shown: string;
  x: number;
  y: number;
  /** Group names only: the total of the group's leaves. */
  total?: number;
}

export interface TreemapLayout {
  scene: Scene;
  tiles: PlacedTile[];
  groups: PlacedName[];
  /** Largest relative difference between a tile's area and its share of the total area. */
  areaError: number;
}

interface LNode {
  node: TreeNode;
  kids: LNode[];
  series: number;
}

function build(node: TreeNode, series: number): LNode {
  return { node, kids: node.children.map((c) => build(c, series)), series };
}

interface Raw {
  tiles: Array<Rect & { node: LNode }>;
  groups: Array<{ node: LNode; x: number; y: number; w: number }>;
}

const valueOf = (n: LNode): number => n.node.value ?? 0;
const sumValue = (items: LNode[]): number => items.reduce((a, n) => a + valueOf(n), 0);
const allLeaves = (items: LNode[]): boolean => items.every((n) => isLeaf(n.node));

/** Number of name lines a stack holds below its own top (one per group, counted at every depth). */
function nameLines(items: LNode[]): number {
  return allLeaves(items) ? 0 : items.reduce((a, n) => a + (isLeaf(n.node) ? 0 : 1 + nameLines(n.kids)), 0);
}

/**
 * Lays `items` out in a column of width `w` whose top is `y` and returns its height; each unit of value takes `k` of area.
 * Leaves of a column (`foot`) stack from top to bottom; the lowest ones that would be shorter than a two-line label
 * form one row at the foot, split by value, and that row takes in the tiles above it until it is as tall as a label. The leaves of a nested group form one row. A stack holding groups puts
 * each group's name line above its tiles. Areas always follow the values, so a foot row can be lower than a label;
 * its tiles then shed text instead.
 */
function stack(items: LNode[], x: number, y: number, w: number, k: number, foot: boolean, raw: Raw): number {
  const area = (n: LNode): number => k * valueOf(n);
  const rowAt = (row: LNode[], top: number): number => {
    const room = w - TILE_GAP * (row.length - 1);
    const h = (k * sumValue(row)) / room;
    let cx = x;
    for (const n of row) {
      const tw = (area(n) / (k * sumValue(row))) * room;
      raw.tiles.push({ x: cx, y: top, w: tw, h, node: n });
      cx += tw + TILE_GAP;
    }
    return h;
  };
  if (allLeaves(items) && !foot) return rowAt(items, y);
  if (allLeaves(items)) {
    let start = items.length;
    while (start > 0 && area(items[start - 1] as LNode) / w < MIN_TILE_H) start--;
    // A foot row still lower than a label takes the tile above it too, until it is tall enough or holds them all.
    const rowH = (from: number): number => (k * sumValue(items.slice(from))) / (w - TILE_GAP * (items.length - from - 1));
    while (start > 0 && start < items.length && rowH(start) < MIN_TILE_H) start--;
    const above = items.slice(0, start);
    const row = items.slice(start);
    const rawRow = row.length === 0 ? 0 : (k * sumValue(row)) / (w - TILE_GAP * (row.length - 1));
    const gaps = TILE_GAP * Math.max(0, above.length - 1) + (above.length > 0 && row.length > 0 ? TILE_GAP : 0);
    const stacked = above.reduce((a, n) => a + area(n) / w, 0);
    let cy = y;
    for (const n of above) {
      const h = area(n) / w;
      raw.tiles.push({ x, y: cy, w, h, node: n });
      cy += h + TILE_GAP;
    }
    if (row.length > 0) rowAt(row, cy);
    return stacked + gaps + rawRow;
  }
  let cy = y;
  let prevGroup = false;
  items.forEach((n, i) => {
    const group = !isLeaf(n.node);
    if (i > 0) cy += group || prevGroup ? GROUP_GAP : TILE_GAP;
    if (!group) {
      const h = area(n) / w;
      raw.tiles.push({ x, y: cy, w, h, node: n });
      cy += h;
    } else {
      raw.groups.push({ node: n, x, y: cy, w });
      cy += NAME_LINE + stack(n.kids, x, cy + NAME_LINE, w, k, false, raw);
    }
    prevGroup = group;
  });
  return cy - y;
}

/** The width at which a column's stack is `height` tall: the stack only gets shorter as it widens. */
function widthFor(items: LNode[], k: number, height: number): number {
  let lo = 1e-3;
  let hi = 1e6;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    const h = stack(items, 0, 0, mid, k, true, { tiles: [], groups: [] });
    if (h > height) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Places a treemap: columns side by side in input order, each as tall as the others, tile areas following the values. */
export function layoutTreemap(map: Treemap, ruler: Ruler): TreemapLayout {
  const fmt = makeFormatter(map.valueFormat);
  const root = map.roots.length === 1 && !isLeaf(map.roots[0] as TreeNode) ? (map.roots[0] as TreeNode) : undefined;
  const tops = (root === undefined ? map.roots : root.children).map((n, i) => build(n, (i % SERIES) + 1));
  /** What a column stacks: the children of a group, or the leaf itself. */
  const itemsOf = (t: LNode): LNode[] => (isLeaf(t.node) ? [t] : t.kids);

  const margin = Math.max(MIN_MARGIN, ceilTo(map.diagramPadding ?? MARGIN));
  const nameW = (t: string): number => ruler.textWidth(t, 'title');
  const valueW = (t: string): number => ruler.textWidth(t, 'line');

  let y = margin;
  const titleY = y + TITLE_H / 2;
  if (map.title !== undefined) y += TITLE_H + TITLE_GAP;
  const rootY = y + 16;
  if (root !== undefined) y += ROOT_BLOCK;
  const headed = tops.some((t) => !isLeaf(t.node));
  const columnH = TILE_AREA_H + NAME_LINE * Math.max(0, ...tops.map((t) => nameLines(itemsOf(t))));
  const regionH = (headed ? NAME_LINE : 0) + columnH;
  const top = y + (headed ? NAME_LINE : 0);

  // One area unit per value that makes the columns, with the gaps between them, fill the content width.
  const widths = (k: number): number[] => tops.map((t) => widthFor(itemsOf(t), k, columnH));
  const span = (k: number): number => widths(k).reduce((a, b) => a + b, 0) + GROUP_GAP * (tops.length - 1);
  let lo = 1e-9;
  let hi = 1e12;
  for (let i = 0; i < 120; i++) {
    const mid = Math.sqrt(lo * hi);
    if (span(mid) > CONTENT_W) hi = mid;
    else lo = mid;
  }
  const k = Math.sqrt(lo * hi);
  const colW = widths(k);

  const raw: Raw = { tiles: [], groups: [] };
  let cx = margin;
  tops.forEach((t, i) => {
    const w = colW[i] ?? 0;
    if (!isLeaf(t.node)) raw.groups.push({ node: t, x: cx, y: top - NAME_LINE, w });
    stack(itemsOf(t), cx, top, w, k, true, raw);
    cx += w + GROUP_GAP;
  });
  const areaError = Math.max(0, ...raw.tiles.map((t) => Math.abs((t.w * t.h) / (k * valueOf(t.node)) - 1)));

  const tiles: PlacedTile[] = raw.tiles.map((t) => {
    const value = valueOf(t.node);
    const valueText = fmt(value);
    const label = t.node.node.label;
    const room = t.w - 2 * TILE_PAD;
    const base: PlacedTile = { x: t.x, y: t.y, w: t.w, h: t.h, label, value, valueText, series: t.node.series, ...(t.node.node.cls === undefined ? {} : { cls: t.node.node.cls }) };
    const both = t.h >= 2 * TILE_PAD + NAME_H + VALUE_H && nameW(label) <= room && valueW(valueText) <= room;
    if (both) return { ...base, nameShown: label, valueShown: valueText };
    if (t.h >= 2 * TILE_PAD + NAME_H) {
      const shown = shrinkToFit(label, room, nameW);
      if (shown !== undefined) return { ...base, nameShown: shown };
    }
    return base;
  });

  const groups: PlacedName[] = raw.groups.flatMap((g) => {
    const label = g.node.node.label;
    const shown = shrinkToFit(label, g.w, nameW);
    return shown === undefined ? [] : [{ label, shown, x: g.x, y: g.y + NAME_LINE / 2, total: total(g.node.node) }];
  });

  const rootLabel = root === undefined ? undefined : shrinkToFit(root.label, CONTENT_W, nameW);
  const titleShown = map.title === undefined ? undefined : shrinkToFit(map.title, CONTENT_W, (t) => (nameW(t) * TITLE_SIZE) / 13);

  const width = CONTENT_W + 2 * margin;
  const height = ceilTo(y + regionH + margin);
  const items: SceneItem[] = [{ kind: 'box', style: 'frame', x: 16, y: 16, w: width - 32, h: height - 32, role: ['panel'] }];
  if (titleShown !== undefined) items.push({ kind: 'text', x: margin, y: titleY, text: titleShown, anchor: 'start', role: ['title'] });
  if (rootLabel !== undefined) items.push({ kind: 'text', x: margin, y: rootY, text: rootLabel, anchor: 'start', role: ['zone-name'], baseline: 'alphabetic' });
  for (const g of groups) items.push({ kind: 'text', x: g.x, y: g.y, text: g.shown, anchor: 'start', role: ['zone-name'], data: { label: g.label }, baseline: 'alphabetic' });
  for (const t of tiles) {
    items.push({
      kind: 'box',
      style: 'frame',
      x: t.x,
      y: t.y,
      w: t.w,
      h: t.h,
      role: ['tile', `series-${t.series}--tint`],
      data: { label: t.label, value: t.valueText, ...(t.cls === undefined ? {} : { class: t.cls }) },
    });
    if (t.nameShown !== undefined) {
      items.push({ kind: 'text', x: t.x + TILE_PAD, y: t.y + NAME_BASE, text: t.nameShown, anchor: 'start', role: ['name'], baseline: 'alphabetic' });
    }
    if (t.valueShown !== undefined) {
      items.push({ kind: 'text', x: t.x + TILE_PAD, y: t.y + NAME_BASE + VALUE_STEP, text: t.valueShown, anchor: 'start', role: ['value', 'value--plain'], baseline: 'alphabetic' });
    }
  }

  const label = map.accTitle ?? (map.title !== undefined ? `Treemap: ${map.title}` : root !== undefined ? `Treemap: ${root.label}` : `Treemap: ${tiles.length} leaves`);
  return { scene: { width, height, title: label, items }, tiles, groups, areaError };
}
