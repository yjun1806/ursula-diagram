import { ceilTo, floorTo, roundTo } from '../chart/grid.ts';
import type { FrontValue } from '../front-matter.ts';
import { configSection } from '../front/options.ts';
import type { Ruler } from '../metrics.ts';
import type { Scene, SceneItem } from '../types.ts';
import type { MindNode, MindShape, Mindmap } from './model.ts';

/** Space between two columns, and the margin around the drawing. */
export const COLUMN_GAP = 32;
const MARGIN = 24;
/** Horizontal room a box keeps around its widest line, and its smallest width. */
const PAD_X = 40;
const MIN_W = 120;
/** A line of a label is broken at a word once it has more characters than this. */
export const MAX_CHARS = 20;
/** Labels inside a circle break once wider than this, so the circle does not grow wider than the text needs. */
const CIRCLE_TEXT = 120;
const LINE = 20;
/** Gap between neighbouring leaves, and between groups that belong to different parents. */
const SIBLING_GAP = 16;
const GROUP_GAP = 24;
const ROOT_MIN_R = 44;
const TITLE_BLOCK = 40;
const SERIES = 8;
/** How far a hexagon's slanted sides reach in, how much a bang and a cloud grow beyond the plain box. */
const SLANT = 12;
const BANG_W = 32;
const BANG_H = 16;
const CLOUD_W = 24;
const CLOUD_H = 12;

export type ColorBy = 'none' | 'branch' | 'depth';

export interface MindmapLayoutOptions {
  heading?: string;
  colorBy?: ColorBy;
}

export interface PlacedMindNode {
  node: MindNode;
  /** Wrapped label lines. */
  lines: string[];
  depth: number;
  /** -1 left of the root, 1 right of it, 0 for the root. */
  side: -1 | 0 | 1;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Index into `nodes` of the parent; -1 for the root. */
  parent: number;
}

export interface MindmapLayout {
  scene: Scene;
  nodes: PlacedMindNode[];
}

const num = (v: number): string => String(Math.round(v * 100) / 100);

/** Breaks one paragraph at spaces so no line is too long by `tooLong`; a single longer word stays whole. */
function wrap(paragraph: string, tooLong: (line: string) => boolean): string[] {
  const out: string[] = [];
  let line = '';
  for (const word of paragraph.split(' ')) {
    const next = line === '' ? word : `${line} ${word}`;
    if (line !== '' && tooLong(next)) {
      out.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line !== '') out.push(line);
  return out;
}

/** Height of a box with `n` lines: 48 for one, 68 for two, 84 for three, then 20 for each more. */
function heightOf(n: number): number {
  return n <= 1 ? 48 : n === 2 ? 68 : n === 3 ? 84 : LINE * n + 24;
}

interface Size {
  lines: string[];
  w: number;
  h: number;
  /** A circle keeps its own width; every other shape takes the width of its column. */
  fixedWidth: boolean;
}

function sizeOf(node: MindNode, isRoot: boolean, ruler: Ruler): Size {
  const isCircle = node.shape === 'circle';
  const tooLong = isCircle ? (l: string) => ruler.textWidth(l, 'title') > CIRCLE_TEXT : (l: string) => [...l].length > MAX_CHARS;
  const lines = node.paragraphs.flatMap((p) => wrap(p, tooLong));
  const textW = Math.max(...lines.map((l) => ruler.textWidth(l, 'title')));
  const baseH = heightOf(lines.length);
  const shape = node.shape;
  if (shape === 'circle') {
    const r = Math.max(isRoot ? ROOT_MIN_R : 24, ceilTo(Math.hypot(textW / 2, (lines.length * LINE) / 2) + 12));
    return { lines, w: 2 * r, h: 2 * r, fixedWidth: true };
  }
  const w = Math.max(MIN_W, ceilTo(textW + PAD_X));
  if (shape === 'bang') return { lines, w: w + BANG_W, h: baseH + BANG_H, fixedWidth: false };
  if (shape === 'cloud') return { lines, w: w + CLOUD_W, h: baseH + CLOUD_H, fixedWidth: false };
  if (shape === 'hexagon') return { lines, w: w + 2 * SLANT, h: baseH, fixedWidth: false };
  return { lines, w, h: baseH, fixedWidth: false };
}

/** A node with its subtree, before any position is known. */
interface Tree {
  node: MindNode;
  size: Size;
  depth: number;
  children: Tree[];
  slot: number;
  cy: number;
  index: number;
  branch: number;
}

function build(node: MindNode, depth: number, ruler: Ruler, branch: number): Tree {
  return {
    node,
    size: sizeOf(node, false, ruler),
    depth,
    children: node.children.map((c) => build(c, depth + 1, ruler, branch)),
    slot: 0,
    cy: 0,
    index: -1,
    branch,
  };
}

const gapBetween = (a: Tree, b: Tree): number => (a.children.length > 0 || b.children.length > 0 ? GROUP_GAP : SIBLING_GAP);

function stackHeight(items: Tree[]): number {
  return items.reduce((sum, t, i) => sum + t.slot + (i === 0 ? 0 : gapBetween(items[i - 1] as Tree, t)), 0);
}

/** A slot is the vertical room a node and everything below it needs. */
function measure(t: Tree): void {
  t.children.forEach(measure);
  t.slot = Math.max(t.size.h, stackHeight(t.children));
}

/** Places the children of a node one under another and the node at the middle of its first and last child. */
function place(t: Tree, top: number): void {
  if (t.children.length === 0) {
    t.cy = roundTo(top + t.slot / 2);
    return;
  }
  let y = top + floorTo((t.slot - stackHeight(t.children)) / 2);
  t.children.forEach((c, i) => {
    if (i > 0) y += gapBetween(t.children[i - 1] as Tree, c);
    place(c, y);
    y += c.slot;
  });
  const first = t.children[0] as Tree;
  const last = t.children[t.children.length - 1] as Tree;
  const mid = (first.cy + last.cy) / 2;
  t.cy = roundTo(Math.min(Math.max(mid, top + t.size.h / 2), top + t.slot - t.size.h / 2));
}

function shift(t: Tree, dy: number): void {
  t.cy += dy;
  t.children.forEach((c) => shift(c, dy));
}

/**
 * Splits the root's children into a right and a left half so that reading clockwise from the top of the left half
 * follows the input: the first child sits top left, the next run fills the right half from the top, and the rest
 * climbs the left half from the bottom. The run is the one that leaves the two halves with the closest leaf counts;
 * on a tie the right half takes more. A single child goes to the right.
 */
function sides(children: MindNode[]): { right: MindNode[]; left: MindNode[] } {
  const leaves = (n: MindNode): number => (n.children.length === 0 ? 1 : n.children.reduce((s, c) => s + leaves(c), 0));
  if (children.length <= 1) return { right: [...children], left: [] };
  const counts = children.map(leaves);
  const total = counts.reduce((a, b) => a + b, 0);
  let best = 2;
  let bestDiff = Infinity;
  let right = 0;
  for (let end = 2; end <= children.length; end++) {
    right += counts[end - 1] ?? 0;
    const diff = Math.abs(total - 2 * right);
    if (diff <= bestDiff) {
      best = end;
      bestDiff = diff;
    }
  }
  return { right: children.slice(1, best), left: [children[0] as MindNode, ...children.slice(best).reverse()] };
}

const flatten = (t: Tree): Tree[] => [t, ...t.children.flatMap(flatten)];

/** Outline of a node as path data inside the box `x, y, w, h`. */
function outline(shape: MindShape, x: number, y: number, w: number, h: number): string {
  switch (shape) {
    case 'hexagon':
      return roundedPolygon(
        [
          [x + SLANT, y],
          [x + w - SLANT, y],
          [x + w, y + h / 2],
          [x + w - SLANT, y + h],
          [x + SLANT, y + h],
          [x, y + h / 2],
        ],
        6,
      );
    case 'bang':
      return starburst(x + w / 2, y + h / 2, w / 2, h / 2);
    case 'cloud':
      return cloud(x, y, w, h);
    default:
      return '';
  }
}

/** A closed polygon whose corners are cut back by `k` and joined with a quadratic curve. */
function roundedPolygon(points: Array<[number, number]>, k: number): string {
  const n = points.length;
  const parts = points.map((c, i) => {
    const p = points[(i + n - 1) % n] as [number, number];
    const q = points[(i + 1) % n] as [number, number];
    const toward = (a: [number, number], b: [number, number]): string => {
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      return `${num(a[0] + ((b[0] - a[0]) / len) * k)} ${num(a[1] + ((b[1] - a[1]) / len) * k)}`;
    };
    return `${i === 0 ? 'M' : 'L'}${toward(c, p)} Q${num(c[0])} ${num(c[1])} ${toward(c, q)}`;
  });
  return `${parts.join(' ')}Z`;
}

/** An ellipse whose rim alternates between its full radius and 0.84 of it, like the spikes of a speech bang. */
function starburst(cx: number, cy: number, rx: number, ry: number): string {
  const spikes = Math.max(10, Math.round((rx + ry) / 12));
  const pts: string[] = [];
  for (let i = 0; i < spikes * 2; i++) {
    const a = (i / (spikes * 2)) * Math.PI * 2;
    const f = i % 2 === 0 ? 1 : 0.84;
    pts.push(`${num(cx + Math.cos(a) * rx * f)} ${num(cy + Math.sin(a) * ry * f)}`);
  }
  return `M${pts.join(' L')}Z`;
}

/** A rectangle whose sides are chains of outward arcs. */
function cloud(x: number, y: number, w: number, h: number): string {
  const inset = 8;
  const x0 = x + inset;
  const y0 = y + inset;
  const x1 = x + w - inset;
  const y1 = y + h - inset;
  const bump = (ax: number, ay: number, bx: number, by: number): string => {
    const len = Math.hypot(bx - ax, by - ay);
    const parts = Math.max(1, Math.round(len / 36));
    const r = (len / parts) * 0.75;
    let d = '';
    for (let i = 1; i <= parts; i++) d += ` A${num(r)} ${num(r)} 0 0 1 ${num(ax + ((bx - ax) * i) / parts)} ${num(ay + ((by - ay) * i) / parts)}`;
    return d;
  };
  return `M${num(x0)} ${num(y0)}${bump(x0, y0, x1, y0)}${bump(x1, y0, x1, y1)}${bump(x1, y1, x0, y1)}${bump(x0, y1, x0, y0)}Z`;
}

function curve(x1: number, y1: number, x2: number, y2: number): string {
  if (y1 === y2) return `M${num(x1)} ${num(y1)} H${num(x2)}`;
  const xm = (x1 + x2) / 2;
  return `M${num(x1)} ${num(y1)} C${num(xm)} ${num(y1)} ${num(xm)} ${num(y2)} ${num(x2)} ${num(y2)}`;
}

/** Reads `config.mindmap.colorBy`; any other value leaves the drawing uncoloured. */
export function colorByOf(config: Record<string, FrontValue> | undefined): ColorBy {
  const section = configSection(config, 'mindmap');
  if (section === undefined) return 'none';
  const v = section['colorBy'];
  return v === 'depth' || v === 'branch' ? v : 'none';
}

/**
 * Places a mindmap: the root in the middle, its children split over a right and a left half, one column per depth
 * on each half, every parent at the middle of its children.
 */
export function layoutMindmap(map: Mindmap, ruler: Ruler, opts: MindmapLayoutOptions = {}): MindmapLayout {
  const rootSize = sizeOf(map.root, true, ruler);
  const split = sides(map.root.children);
  const halves = ([[1, split.right], [-1, split.left]] as const).map(([side, nodes]) => {
    const trees = nodes.map((c) => build(c, 1, ruler, map.root.children.indexOf(c)));
    trees.forEach(measure);
    let y = 0;
    trees.forEach((t, i) => {
      if (i > 0) y += gapBetween(trees[i - 1] as Tree, t);
      place(t, y);
      y += t.slot;
    });
    if (trees.length > 0) {
      const mid = ((trees[0] as Tree).cy + (trees[trees.length - 1] as Tree).cy) / 2;
      trees.forEach((t) => shift(t, -roundTo(mid)));
    }
    return { side, trees };
  });

  // Column widths per side: the widest box of each depth.
  const widths = new Map<number, number[]>();
  for (const { side, trees } of halves) {
    const cols: number[] = [];
    for (const t of trees.flatMap(flatten)) cols[t.depth] = Math.max(cols[t.depth] ?? 0, t.size.w);
    widths.set(side, cols);
  }

  const rootR = rootSize.w / 2;
  const placed: PlacedMindNode[] = [];
  const rootIndex = 0;
  placed.push({ node: map.root, lines: rootSize.lines, depth: 0, side: 0, x: -rootR, y: -rootSize.h / 2, w: rootSize.w, h: rootSize.h, parent: -1 });

  const edges: Array<{ from: number; to: number; side: -1 | 1; x1: number; y1: number; x2: number; y2: number; tree: Tree }> = [];
  for (const { side, trees } of halves) {
    const cols = widths.get(side) ?? [];
    // Inner edge of every column, measured from the root's centre outwards.
    const inner: number[] = [];
    let at = rootR + COLUMN_GAP;
    for (let d = 1; d < cols.length; d++) {
      inner[d] = at;
      at += (cols[d] ?? 0) + COLUMN_GAP;
    }
    const walk = (t: Tree, parent: number, from: { x: number; y: number }): void => {
      const colW = cols[t.depth] ?? t.size.w;
      const w = t.size.fixedWidth ? t.size.w : colW;
      const near = (inner[t.depth] ?? 0) * side;
      const x = side === 1 ? near : near - w;
      const index = placed.length;
      t.index = index;
      placed.push({ node: t.node, lines: t.size.lines, depth: t.depth, side, x, y: t.cy - t.size.h / 2, w, h: t.size.h, parent });
      edges.push({ from: parent, to: index, side, x1: from.x, y1: from.y, x2: near, y2: t.cy, tree: t });
      const out = { x: side === 1 ? x + w : x, y: t.cy };
      for (const c of t.children) walk(c, index, out);
    };
    for (const t of trees) walk(t, rootIndex, { x: rootR * side, y: 0 });
  }

  // Extent, then the shift that puts the drawing at the margin.
  const heading = opts.heading;
  const headingW = heading === undefined || heading === '' ? 0 : (ruler.textWidth(heading, 'title') * 15) / 13;
  const topPad = headingW > 0 ? TITLE_BLOCK : 0;
  const minX = Math.min(...placed.map((p) => p.x));
  const maxX = Math.max(...placed.map((p) => p.x + p.w));
  const minY = Math.min(...placed.map((p) => p.y));
  const maxY = Math.max(...placed.map((p) => p.y + p.h));
  const bodyW = maxX - minX;
  const extra = Math.max(0, headingW - bodyW);
  const dx = roundTo(MARGIN - minX + extra / 2);
  const dy = ceilTo(MARGIN + topPad - minY);
  const width = ceilTo(Math.max(bodyW + extra, headingW) + 2 * MARGIN);
  const height = ceilTo(maxY + dy + MARGIN);

  const colorBy = opts.colorBy ?? 'none';
  const series = (t: Tree | undefined): string | undefined => {
    if (t === undefined || colorBy === 'none') return undefined;
    const k = colorBy === 'depth' ? t.depth - 1 : t.branch;
    return `series-${(k % SERIES) + 1}`;
  };

  const items: SceneItem[] = [];
  if (headingW > 0 && heading !== undefined) items.push({ kind: 'text', x: MARGIN, y: MARGIN + 9, text: heading, anchor: 'start', role: ['title'] });
  for (const e of edges) {
    const s = series(e.tree);
    items.push({ kind: 'path', d: curve(e.x1 + dx, e.y1 + dy, e.x2 + dx, e.y2 + dy), role: s === undefined ? ['edge'] : [`${s}--line`] });
  }
  const treeOf = new Map<number, Tree>();
  for (const e of edges) treeOf.set(e.to, e.tree);
  placed.forEach((p, i) => {
    const s = series(treeOf.get(i));
    const role = s === undefined ? ['box'] : ['box', `${s}--tint`];
    const x = p.x + dx;
    const y = p.y + dy;
    const shape = p.node.shape;
    const data = { label: p.lines.join(' '), depth: String(p.depth) };
    if (shape === 'circle') items.push({ kind: 'circle', cx: x + p.w / 2, cy: y + p.h / 2, r: p.w / 2, role, data });
    else if (shape === 'bang' || shape === 'cloud' || shape === 'hexagon') items.push({ kind: 'path', d: outline(shape, x, y, p.w, p.h), role, data });
    else items.push({ kind: 'box', style: 'box', x, y, w: p.w, h: p.h, role: shape === 'round' ? [...role, 'box--round'] : role, ...(shape === 'square' ? { radius: 4 } : {}), data });
    p.lines.forEach((text, k) => {
      items.push({ kind: 'text', x: x + p.w / 2, y: y + p.h / 2 + (k - (p.lines.length - 1) / 2) * LINE, text, anchor: 'middle', role: ['name'] });
    });
  });

  const scene: Scene = { width, height, title: map.accTitle ?? `mindmap — ${map.root.paragraphs.join(' ')}`, items };
  // Report positions in drawing coordinates.
  const nodes = placed.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy }));
  return { scene, nodes };
}
