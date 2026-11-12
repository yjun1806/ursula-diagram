import { cellWidth } from '../metrics.ts';
import { cut } from '../text/terminal.ts';
import type { TextSpan, TextTone } from '../types.ts';
import { parentsOf } from './layout.ts';
import type { TreeItem, TreeView } from './parse.ts';

const TEE = '├── ';
const ELBOW = '└── ';
const RAIL = '│   ';
const GAP = '    ';
const DESCRIPTION_MARK = '  # ';

/** Whether a later item shares the parent of item `i`. */
function hasLaterSibling(items: readonly TreeItem[], i: number): boolean {
  const depth = items[i]?.depth ?? 0;
  for (let j = i + 1; j < items.length; j++) {
    const d = items[j]?.depth ?? 0;
    if (d < depth) return false;
    if (d === depth) return true;
  }
  return false;
}

/** Draws the tree as `tree` does: `├── `, `└── ` and `│   ` lead each item; a lone top-level item stands bare above its branches. */
export function layoutTreeViewText(tree: TreeView, maxWidth?: number): TextSpan[][] {
  const { items } = tree;
  const parents = parentsOf(items);
  const roots = items.filter((it) => it.depth === 0).length;
  const bareRoot = roots === 1;
  const later = items.map((_, i) => hasLaterSibling(items, i));
  return items.map((item, i) => {
    if (bareRoot && item.depth === 0) return [{ text: item.label, tone: item.highlight ? 'accent' : 'bold' } as TextSpan];
    let lead = later[i] ? TEE : ELBOW;
    for (let a = parents[i] ?? -1; a >= 0 && !(bareRoot && (items[a]?.depth ?? 0) === 0); a = parents[a] ?? -1) lead = (later[a] ? RAIL : GAP) + lead;
    const tone: TextTone = item.highlight ? 'accent' : item.folder ? 'bold' : 'normal';
    let label = item.label;
    let note = item.description === undefined ? '' : `${DESCRIPTION_MARK}${item.description}`;
    if (maxWidth !== undefined) {
      const room = maxWidth - cellWidth(lead);
      if (cellWidth(label) + cellWidth(note) > room) note = '';
      label = cut(label, Math.max(1, room));
      if (note !== '') note = cut(note, Math.max(0, room - cellWidth(label)));
    }
    const spans: TextSpan[] = [{ text: lead, tone: 'dim' }, { text: label, tone }];
    if (note !== '') spans.push({ text: note, tone: 'dim' });
    return spans;
  });
}

export const joinSpans = (line: readonly TextSpan[]): string => line.map((s) => s.text).join('');
