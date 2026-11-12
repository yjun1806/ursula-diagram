import type { Ruler } from '../metrics.ts';
import { SCENE_THEME_SPECS } from '../render/scene-theme.ts';
import type { Theme } from '../render/theme.ts';
import type { Scene, SceneItem } from '../types.ts';
import type { TreeItem, TreeView } from './parse.ts';

/** Height of a row and the margin around the drawing. */
export const ROW = 28;
export const PAD = 24;
/** Indent per level when the source sets none; the narrowest indent that leaves room for a guide's bend. */
export const INDENT = 28;
const MIN_INDENT = 20;
/** The guide runs this far right of the parent's text start, and stops this far short of a child's text. */
const GUIDE_INSET = 4;
const GUIDE_GAP = 8;
/** The guide leaves the parent's row this far below its centre. */
const GUIDE_DROP = 12;
/** The text centre sits this far below the middle of its row, where the eye puts the line of a 12-13 px text. */
const TEXT_DROP = 2;
const DESCRIPTION_GAP = 8;
const HIGHLIGHT_PAD = 6;
const HIGHLIGHT_H = 24;

export interface TreeViewLayout {
  scene: Scene;
  /** Left edge of the text of each item, in item order. */
  columns: number[];
  /** Vertical centre of the text of each item. */
  centres: number[];
}

/** The index of the parent of each item, or -1 for a top-level item. */
export function parentsOf(items: readonly TreeItem[]): number[] {
  const last: number[] = [];
  return items.map((item, i) => {
    last[item.depth] = i;
    return item.depth === 0 ? -1 : (last[item.depth - 1] ?? -1);
  });
}

const snapUp = (v: number, grid: number): number => Math.ceil(v / grid) * grid;

/** Indent per level: the source's `rowIndent` when it leaves room for a guide, else the standard step, on a grid of four. */
function indentOf(tree: TreeView): number {
  if (tree.rowIndent === undefined) return INDENT;
  return Math.max(MIN_INDENT, Math.round(tree.rowIndent / 4) * 4);
}

/** Places each item on its own row and draws the guides from a parent down to its children. */
export function layoutTreeView(tree: TreeView, ruler: Ruler, theme: Theme = 'solid'): TreeViewLayout {
  const { items } = tree;
  const indent = indentOf(tree);
  const bend = SCENE_THEME_SPECS[theme].bend / 2;
  const parents = parentsOf(items);
  const columns = items.map((item) => PAD + indent * item.depth);
  const centres = items.map((_, i) => PAD + ROW * i + ROW / 2 + TEXT_DROP);
  const children = items.map((): number[] => []);
  parents.forEach((p, i) => {
    if (p >= 0) children[p]?.push(i);
  });

  const boxes: SceneItem[] = [];
  const guides: SceneItem[] = [];
  const texts: SceneItem[] = [];
  let right = 0;
  items.forEach((item, i) => {
    const x = columns[i] ?? PAD;
    const cy = centres[i] ?? 0;
    const labelW = ruler.textWidth(item.label, item.folder ? 'title' : 'line');
    let end = x + labelW;
    if (item.highlight) {
      boxes.push({ kind: 'box', style: 'label', x: x - HIGHLIGHT_PAD, y: cy - HIGHLIGHT_H / 2, w: labelW + 2 * HIGHLIGHT_PAD, h: HIGHLIGHT_H, role: ['active'], data: { line: String(item.line) } });
      end += HIGHLIGHT_PAD;
    }
    texts.push({ kind: 'text', x, y: cy, text: item.label, anchor: 'start', role: item.folder ? ['name'] : ['body'], data: { line: String(item.line) } });
    if (item.description !== undefined) {
      const dx = x + labelW + DESCRIPTION_GAP + (item.highlight ? HIGHLIGHT_PAD : 0);
      texts.push({ kind: 'text', x: dx, y: cy, text: item.description, anchor: 'start', role: ['sub'], data: { line: String(item.line) } });
      end = dx + ruler.textWidth(item.description, 'line');
    }
    right = Math.max(right, end);

    const kids = children[i] ?? [];
    const lastKid = kids[kids.length - 1];
    if (lastKid === undefined) return;
    const gx = x + GUIDE_INSET;
    const top = cy + GUIDE_DROP;
    kids.forEach((kid) => {
      const kidY = centres[kid] ?? 0;
      const reach = (columns[kid] ?? 0) - GUIDE_GAP;
      const d =
        kid === lastKid
          ? `M${gx} ${top} V${kidY - bend} Q${gx} ${kidY} ${gx + bend} ${kidY} H${reach}`
          : `M${gx} ${kidY} H${reach}`;
      guides.push({ kind: 'path', d, role: ['guide'], data: { from: String(item.line), to: String(items[kid]?.line ?? 0) } });
    });
  });

  const scene: Scene = {
    width: snapUp(right + PAD, ruler.grid),
    height: 2 * PAD + ROW * items.length,
    title: 'Tree view',
    items: [...boxes, ...guides, ...texts],
  };
  return { scene, columns, centres };
}
