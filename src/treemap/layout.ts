import type { Ruler } from '../metrics.ts';
import type { Scene, SceneItem } from '../types.ts';
import { makeFormatter } from './format.ts';
import { isLeaf, total } from './model.ts';
import type { TreeNode, Treemap } from './model.ts';

/** Gap between two tiles; a group keeps a wider gap to its neighbours. */
const TILE_GAP = 4;
const GROUP_GAP = 16;
/** Height of a group-name line, and of the root-name block. */
const NAME_LINE = 24;
const ROOT_BLOCK = 36;
/** Space inside a group that holds further groups, on the left, right and bottom. */
const GROUP_PAD = 12;
const TILE_PAD = 12;
const NAME_H = 18;
const VALUE_H = 16;
const TITLE_H = 18;
const TITLE_GAP = 16;
const TITLE_SIZE = 15;
const CONTENT_W = 936;
const TILE_AREA_H = 400;
const MARGIN = 40;
const MIN_MARGIN = 16;
const SERIES = 8;
const ELLIPSIS = '…';

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
  /** True when some child is a group. */
  nested: boolean;
}

function build(node: TreeNode, series: number): LNode {
  const kids = node.children.map((c) => build(c, series));
  return { node, kids, series, nested: kids.some((k) => !isLeaf(k.node)) };
}

/** Number of nested group levels at or below a node (0 for a leaf). */
function depthOf(n: LNode): number {
  return isLeaf(n.node) ? 0 : 1 + Math.max(0, ...n.kids.map(depthOf));
}

function worst(row: number[], side: number): number {
  const sum = row.reduce((a, b) => a + b, 0);
  const max = Math.max(...row);
  const min = Math.min(...row);
  return Math.max((side * side * max) / (sum * sum), (sum * sum) / (side * side * min));
}

/**
 * Squarified treemap (Bruls, Huizing, van Wijk 2000): rectangles in `rect` with areas proportional to `weights`.
 * Items fill the rows in input order, the first one at the top left.
 */
function squarify(weights: number[], rect: Rect): Rect[] {
  const out: Rect[] = new Array<Rect>(weights.length);
  const order = weights.map((w, i) => i);
  const sum = weights.reduce((a, b) => a + b, 0);
  const scale = sum === 0 ? 0 : (rect.w * rect.h) / sum;
  let { x, y, w, h } = rect;
  let i = 0;
  while (i < order.length) {
    const side = Math.min(w, h);
    const area = (k: number): number => (weights[order[k] ?? 0] ?? 0) * scale;
    const row = [area(i)];
    let j = i + 1;
    while (j < order.length && side > 0 && worst([...row, area(j)], side) <= worst(row, side)) {
      row.push(area(j));
      j++;
    }
    const rowSum = row.reduce((a, b) => a + b, 0);
    if (w >= h) {
      const stripW = h === 0 ? 0 : rowSum / h;
      let cy = y;
      row.forEach((a, k) => {
        const rh = stripW === 0 ? 0 : a / stripW;
        out[order[i + k] ?? 0] = { x, y: cy, w: stripW, h: rh };
        cy += rh;
      });
      x += stripW;
      w -= stripW;
    } else {
      const stripH = w === 0 ? 0 : rowSum / w;
      let cx = x;
      row.forEach((a, k) => {
        const rw = stripH === 0 ? 0 : a / stripH;
        out[order[i + k] ?? 0] = { x: cx, y, w: rw, h: stripH };
        cx += rw;
      });
      y += stripH;
      h -= stripH;
    }
    i = j;
  }
  return out;
}

interface Raw {
  tiles: Array<Rect & { node: LNode }>;
  groups: Array<{ node: LNode; x: number; y: number; w: number }>;
}

/** Places the children of one region; sides that touch the region's border keep no gap. */
function place(items: LNode[], region: Rect, weight: (n: LNode) => number, raw: Raw): void {
  if (items.length === 0) return;
  const rects = squarify(items.map(weight), region);
  const eps = 1e-6;
  items.forEach((item, i) => {
    const r = rects[i];
    if (r === undefined) return;
    const inset = isLeaf(item.node) ? TILE_GAP / 2 : GROUP_GAP / 2;
    const left = r.x > region.x + eps ? inset : 0;
    const top = r.y > region.y + eps ? inset : 0;
    const right = r.x + r.w < region.x + region.w - eps ? inset : 0;
    const bottom = r.y + r.h < region.y + region.h - eps ? inset : 0;
    const x = r.x + left;
    const y = r.y + top;
    const w = Math.max(0, r.w - left - right);
    const h = Math.max(0, r.h - top - bottom);
    if (isLeaf(item.node)) {
      raw.tiles.push({ x, y, w, h, node: item });
      return;
    }
    raw.groups.push({ node: item, x, y, w });
    const pad = item.nested ? GROUP_PAD : 0;
    const inner: Rect = { x: x + pad, y: y + NAME_LINE, w: Math.max(0, w - 2 * pad), h: Math.max(0, h - NAME_LINE - pad) };
    place(item.kids, inner, weight, raw);
  });
}

function leavesOf(n: LNode): LNode[] {
  return isLeaf(n.node) ? [n] : n.kids.flatMap(leavesOf);
}

/** Cuts `text` with an ellipsis until it fits `room`; undefined when not even the ellipsis fits. */
function fitText(text: string, room: number, width: (t: string) => number): string | undefined {
  if (width(text) <= room) return text;
  const chars = [...text];
  while (chars.length > 0) {
    chars.pop();
    const cut = `${chars.join('').trimEnd()}${ELLIPSIS}`;
    if (width(cut) <= room) return cut;
  }
  return width(ELLIPSIS) <= room ? ELLIPSIS : undefined;
}

/** Places a treemap: leaf tiles whose areas follow the values, group names above their tiles. */
export function layoutTreemap(map: Treemap, ruler: Ruler): TreemapLayout {
  const fmt = makeFormatter(map.valueFormat);
  const root = map.roots.length === 1 && !isLeaf(map.roots[0] as TreeNode) ? (map.roots[0] as TreeNode) : undefined;
  const tops = (root === undefined ? map.roots : root.children).map((n, i) => build(n, (i % SERIES) + 1));

  const margin = Math.max(MIN_MARGIN, Math.ceil((map.diagramPadding ?? MARGIN) / 4) * 4);
  const nameW = (t: string): number => ruler.textWidth(t, 'title');
  const valueW = (t: string): number => ruler.textWidth(t, 'line');

  let y = margin;
  const titleY = y + TITLE_H / 2;
  if (map.title !== undefined) y += TITLE_H + TITLE_GAP;
  const rootY = y + 16;
  if (root !== undefined) y += ROOT_BLOCK;
  const levels = Math.max(0, ...tops.map(depthOf));
  const regionH = TILE_AREA_H + NAME_LINE * levels + GROUP_PAD * Math.max(0, levels - 1);
  const region: Rect = { x: margin, y, w: CONTENT_W, h: regionH };

  const leaves = tops.flatMap(leavesOf);
  const valueOf = (n: LNode): number => n.node.value ?? 0;
  const totalValue = leaves.reduce((a, n) => a + valueOf(n), 0);

  // Gaps and name lines take area, so tile areas drift from the values; the weights are refitted until they agree.
  let weights = new Map<LNode, number>(leaves.map((n) => [n, valueOf(n)]));
  const weightOf = (w: Map<LNode, number>): ((n: LNode) => number) => {
    const f = (n: LNode): number => (isLeaf(n.node) ? (w.get(n) ?? 0) : n.kids.reduce((a, k) => a + f(k), 0));
    return f;
  };
  const measure = (raw: Raw): { error: number; ratios: Map<LNode, number> } => {
    const area = raw.tiles.reduce((a, t) => a + t.w * t.h, 0);
    const unit = area / totalValue;
    let error = 0;
    const ratios = new Map<LNode, number>();
    for (const t of raw.tiles) {
      const ratio = (t.w * t.h) / (unit * valueOf(t.node));
      ratios.set(t.node, ratio);
      error = Math.max(error, Math.abs(ratio - 1));
    }
    return { error, ratios };
  };
  let best: { raw: Raw; error: number } | undefined;
  for (let pass = 0; pass < 400; pass++) {
    const raw: Raw = { tiles: [], groups: [] };
    place(tops, region, weightOf(weights), raw);
    const { error, ratios } = measure(raw);
    if (best === undefined || error < best.error) best = { raw, error };
    if (error < 0.002) break;
    const next = new Map<LNode, number>();
    let sum = 0;
    for (const n of leaves) {
      const ratio = Math.max(ratios.get(n) ?? 0.01, 0.01);
      const w = (weights.get(n) ?? 0) / ratio ** 0.8;
      next.set(n, w);
      sum += w;
    }
    const norm = totalValue / sum;
    weights = new Map([...next].map(([n, w]) => [n, w * norm]));
  }
  const raw = best?.raw ?? { tiles: [], groups: [] };

  const tiles: PlacedTile[] = raw.tiles.map((t) => {
    const value = valueOf(t.node);
    const valueText = fmt(value);
    const label = t.node.node.label;
    const room = t.w - 2 * TILE_PAD;
    const base: PlacedTile = { x: t.x, y: t.y, w: t.w, h: t.h, label, value, valueText, series: t.node.series, ...(t.node.node.cls === undefined ? {} : { cls: t.node.node.cls }) };
    const both = t.h >= 2 * TILE_PAD + NAME_H + VALUE_H && nameW(label) <= room && valueW(valueText) <= room;
    if (both) return { ...base, nameShown: label, valueShown: valueText };
    if (t.h >= 2 * TILE_PAD + NAME_H) {
      const shown = fitText(label, room, nameW);
      if (shown !== undefined) return { ...base, nameShown: shown };
    }
    return base;
  });

  const groups: PlacedName[] = raw.groups.flatMap((g) => {
    const label = g.node.node.label;
    const shown = fitText(label, g.w, nameW);
    return shown === undefined ? [] : [{ label, shown, x: g.x, y: g.y + NAME_LINE / 2, total: total(g.node.node) }];
  });

  const rootLabel = root === undefined ? undefined : fitText(root.label, CONTENT_W, nameW);
  const titleShown = map.title === undefined ? undefined : fitText(map.title, CONTENT_W, (t) => (nameW(t) * TITLE_SIZE) / 13);

  const width = CONTENT_W + 2 * margin;
  const height = Math.ceil((y + regionH + margin) / 4) * 4;
  const items: SceneItem[] = [{ kind: 'box', style: 'frame', x: 16, y: 16, w: width - 32, h: height - 32, role: ['panel'] }];
  if (titleShown !== undefined) items.push({ kind: 'text', x: margin, y: titleY, text: titleShown, anchor: 'start', role: ['title'] });
  if (rootLabel !== undefined) items.push({ kind: 'text', x: margin, y: rootY, text: rootLabel, anchor: 'start', role: ['zone-name'] });
  for (const g of groups) items.push({ kind: 'text', x: g.x, y: g.y, text: g.shown, anchor: 'start', role: ['zone-name'], data: { label: g.label } });
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
      items.push({ kind: 'text', x: t.x + TILE_PAD, y: t.y + TILE_PAD + NAME_H / 2, text: t.nameShown, anchor: 'start', role: ['name'] });
    }
    if (t.valueShown !== undefined) {
      items.push({ kind: 'text', x: t.x + TILE_PAD, y: t.y + TILE_PAD + NAME_H + VALUE_H / 2, text: t.valueShown, anchor: 'start', role: ['value', 'value--plain'] });
    }
  }

  const label = map.accTitle ?? (map.title !== undefined ? `Treemap: ${map.title}` : root !== undefined ? `Treemap: ${root.label}` : `Treemap: ${tiles.length} leaves`);
  return { scene: { width, height, title: label, items }, tiles, groups, areaError: best?.error ?? 0 };
}
