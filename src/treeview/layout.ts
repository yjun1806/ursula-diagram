import { ceilTo, roundTo } from '../chart/grid.ts';
import type { Ruler } from '../metrics.ts';
import { SCENE_THEME_SPECS } from '../render/scene-theme.ts';
import type { Theme } from '../render/theme.ts';
import type { Scene, SceneItem } from '../types.ts';
import type { IconSettings, TreeItem, TreeView } from './parse.ts';
import { DEFAULT_THEME } from '../render/theme.ts';

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
const DESCRIPTION_GAP = 8;
/** The largest theme bend radius a guide takes whole. */
const SMALL_BEND = 8;
const HIGHLIGHT_PAD = 6;
const HIGHLIGHT_H = 24;
/** Size of an item icon and the room from the item's left edge to its text. */
const ICON = 14;
const ICON_ROOM = 20;

export type Glyph = 'folder' | 'file';

/**
 * The icon of an item. An `icon()` argument always decides: empty or `none` hides it, `folder` and `file` name the
 * built-in icons, and an icon of a pack falls back to the built-in icon of the item's kind, since no pack ships here.
 * Otherwise `showIcons` draws the built-in icon unless a filename or extension map sends the item to `none`.
 */
export function glyphOf(item: TreeItem, icons: IconSettings | undefined): Glyph | undefined {
  const kind: Glyph = item.folder ? 'folder' : 'file';
  if (item.icon !== undefined) {
    if (item.icon === '' || item.icon === 'none') return undefined;
    return item.icon === 'folder' || item.icon === 'file' ? item.icon : kind;
  }
  if (icons === undefined || !icons.show) return undefined;
  if (!item.folder) {
    const byName = icons.filenames[item.label];
    const ext = Object.keys(icons.extensions).find((e) => item.label.endsWith(e));
    const mapped = byName ?? (ext === undefined ? undefined : icons.extensions[ext]);
    if (mapped === 'none') return undefined;
  }
  return kind;
}

/** Outline of a built-in icon in the box `x`..`x + ICON`, centred on `cy`. */
function glyphPath(glyph: Glyph, x: number, cy: number): string {
  const r = 1.5;
  const arc = (dx: number, dy: number): string => `a${r} ${r} 0 0 1 ${dx} ${dy}`;
  if (glyph === 'folder') {
    const top = cy - 6;
    const bottom = cy + 6;
    return `M${x} ${top + r} ${arc(r, -r)} H${x + 5} l1.5 2 H${x + ICON - r} ${arc(r, r)} V${bottom - r} ${arc(-r, r)} H${x + r} ${arc(-r, -r)} Z`;
  }
  const left = x + 1.5;
  const right = x + ICON - 1.5;
  const top = cy - 7;
  const bottom = cy + 7;
  return `M${left + r} ${top} H${right - 4} L${right} ${top + 4} V${bottom - r} ${arc(-r, r)} H${left + r} ${arc(-r, -r)} V${top + r} ${arc(r, -r)} Z`;
}

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

/** Indent per level: the source's `rowIndent` when it leaves room for a guide, else the standard step, on a grid of four. */
function indentOf(tree: TreeView): number {
  if (tree.rowIndent === undefined) return INDENT;
  return Math.max(MIN_INDENT, roundTo(tree.rowIndent));
}

/** Places each item on its own row and draws the guides from a parent down to its children. */
export function layoutTreeView(tree: TreeView, ruler: Ruler, theme: Theme = DEFAULT_THEME): TreeViewLayout {
  const { items } = tree;
  const indent = indentOf(tree);
  // A guide bends by half the theme's radius, or by the whole of a radius that is already small.
  const themeBend = SCENE_THEME_SPECS[theme].bend;
  const bend = themeBend <= SMALL_BEND ? themeBend : themeBend / 2;
  const parents = parentsOf(items);
  const glyphs = items.map((item) => glyphOf(item, tree.icons));
  const columns = items.map((item) => PAD + indent * item.depth);
  const centres = items.map((_, i) => PAD + ROW * i + ROW / 2);
  const children = items.map((): number[] => []);
  parents.forEach((p, i) => {
    if (p >= 0) children[p]?.push(i);
  });

  const boxes: SceneItem[] = [];
  const marks: SceneItem[] = [];
  const guides: SceneItem[] = [];
  const texts: SceneItem[] = [];
  let right = 0;
  items.forEach((item, i) => {
    const left = columns[i] ?? PAD;
    const cy = centres[i] ?? 0;
    const glyph = glyphs[i];
    const x = glyph === undefined ? left : left + ICON_ROOM;
    if (glyph !== undefined) marks.push({ kind: 'path', d: glyphPath(glyph, left, cy), role: ['faint'], data: { icon: glyph, line: String(item.line) } });
    const labelW = ruler.textWidth(item.label, item.folder ? 'title' : 'line');
    let end = x + labelW;
    if (item.highlight) {
      boxes.push({ kind: 'box', style: 'label', x: left - HIGHLIGHT_PAD, y: cy - HIGHLIGHT_H / 2, w: x - left + labelW + 2 * HIGHLIGHT_PAD, h: HIGHLIGHT_H, role: ['active'], data: { line: String(item.line) } });
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
    // Under an icon the guide drops from the icon's centre.
    const gx = glyph === undefined ? left + GUIDE_INSET : left + ICON / 2;
    const top = cy + GUIDE_DROP;
    kids.forEach((kid) => {
      const kidY = centres[kid] ?? 0;
      const reach = (columns[kid] ?? 0) - GUIDE_GAP - (items[kid]?.highlight === true ? HIGHLIGHT_PAD : 0);
      const d =
        kid === lastKid
          ? `M${gx} ${top} V${kidY - bend} Q${gx} ${kidY} ${gx + bend} ${kidY} H${reach}`
          : `M${gx} ${kidY} H${reach}`;
      guides.push({ kind: 'path', d, role: ['guide'], data: { from: String(item.line), to: String(items[kid]?.line ?? 0) } });
    });
  });

  const scene: Scene = {
    width: ceilTo(right + PAD, ruler.grid),
    height: 2 * PAD + ROW * items.length,
    title: 'Tree view',
    items: [...boxes, ...guides, ...marks, ...texts],
  };
  return { scene, columns, centres };
}
