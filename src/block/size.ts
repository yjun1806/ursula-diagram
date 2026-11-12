import { wrapWords } from '../text/wrap.ts';
import type { ArrowDirection, BlockItem, BlockNode, BlockShape } from './model.ts';
import type { Units } from './units.ts';

export interface NodeSize {
  w: number;
  h: number;
  /** Label lines after wrapping. */
  lines: string[];
}

/** Height of a block arrow's head, and how far its barbs reach past the body. */
export const HEAD_LENGTH = 24;
export const HEAD_BARB = 12;
/** Height of the end caps of a cylinder. */
export const CAP = 8;

export const isRound = (shape: BlockShape): boolean => shape === 'circle' || shape === 'dbl-circle';

const horizontal = (heads: readonly ArrowDirection[]): boolean => heads.includes('left') || heads.includes('right');
const vertHeads = (heads: readonly ArrowDirection[]): number => heads.filter((d) => d === 'up' || d === 'down').length;
const vertical = (heads: readonly ArrowDirection[]): boolean => heads.includes('up') || heads.includes('down');

/** Whether the block takes the width and the height of its cell; a round block keeps its own size and a straight arrow its own thickness. */
export function fills(node: BlockNode): { w: boolean; h: boolean } {
  if (isRound(node.shape)) return { w: false, h: false };
  const heads = node.heads ?? [];
  if (node.shape === 'arrow' && vertical(heads) && !horizontal(heads)) return { w: false, h: true };
  if (node.shape === 'arrow' && horizontal(heads) && !vertical(heads)) return { w: true, h: false };
  return { w: true, h: true };
}

/** The thickness every straight block arrow of a drawing shares: the height of a left-right one, the width of an up-down one. */
export interface ArrowThickness {
  flat: number;
  tall: number;
}

function arrowNodes(items: readonly BlockItem[]): BlockNode[] {
  return items.flatMap((i) => (i.kind === 'group' ? arrowNodes(i.children) : i.kind === 'node' && i.shape === 'arrow' ? [i] : []));
}

/** The thickest straight block arrow of each axis, so arrows that point the same way are drawn alike. */
export function arrowThickness(items: readonly BlockItem[], u: Units): ArrowThickness {
  let flat = 0;
  let tall = 0;
  for (const node of arrowNodes(items)) {
    const heads = node.heads ?? [];
    const size = sizeOf(node, u);
    if (horizontal(heads) && !vertical(heads)) flat = Math.max(flat, size.h);
    if (vertical(heads) && !horizontal(heads)) tall = Math.max(tall, size.w);
  }
  return { flat, tall };
}

/** Width a label needs on both sides, by shape. */
function sidePad(shape: BlockShape, u: Units): number {
  if (u.terminal) return shape === 'subroutine' ? 8 : shape === 'rect' || shape === 'round' ? 4 : 6;
  switch (shape) {
    case 'stadium':
    case 'hexagon':
    case 'parallelogram':
    case 'lean-l':
    case 'trap-b':
    case 'trap-t':
      return 48;
    case 'subroutine':
      return 64;
    case 'asym':
      return 44;
    default:
      return 32;
  }
}

/** The natural size of a block: the room its label needs, never below the smallest block. */
export function sizeOf(node: BlockNode, u: Units, arrows?: ArrowThickness): NodeSize {
  const wrapAt = node.shape === 'diamond' ? u.diamondWrap : isRound(node.shape) ? u.roundWrap : u.wrapWidth;
  const lines = node.lines.flatMap((l) => wrapWords(l, wrapAt, u.textWidth, { blank: true }));
  const tw = Math.max(0, ...lines.map(u.textWidth));
  const empty = lines.every((l) => l === '');
  const th = lines.length * u.lineHeight;
  const heads = node.heads ?? [];

  if (u.terminal) {
    const rows = lines.length + (node.shape === 'cylinder' ? 3 : 2);
    if (isRound(node.shape)) return { w: Math.max(7, tw + sidePad(node.shape, u) + (node.shape === 'dbl-circle' ? 2 : 0)), h: rows, lines };
    const arrowPad = node.shape === 'arrow' && horizontal(heads) ? 2 : 0;
    return { w: Math.max(node.shape === 'arrow' ? 5 : u.minWidth, tw + sidePad(node.shape, u) + arrowPad), h: Math.max(u.minHeight, rows), lines };
  }

  switch (node.shape) {
    case 'circle':
    case 'dbl-circle': {
      const d = Math.max(64, u.snap(Math.hypot(tw, th) + 16)) + (node.shape === 'dbl-circle' ? 8 : 0);
      return { w: d, h: d, lines };
    }
    case 'diamond': {
      const w = Math.max(176, u.snap(tw + 2 * th + 24));
      return { w, h: u.snap(w / 2), lines };
    }
    case 'cylinder':
      return { w: Math.max(u.minWidth, u.snap(tw + 32)), h: Math.max(u.minHeight, u.snap(th + 28)), lines };
    case 'arrow': {
      const bodyH = empty ? 24 : th + 6;
      if (horizontal(heads)) {
        const w = Math.max(u.minWidth, u.snap(tw + 2 * HEAD_LENGTH + 16));
        const h = Math.max(u.minHeight, u.snap(bodyH + 2 * HEAD_BARB), vertical(heads) ? u.snap(vertHeads(heads) * HEAD_LENGTH + th + 16) : 0);
        return { w, h: vertical(heads) ? h : Math.max(h, arrows?.flat ?? 0), lines };
      }
      const bodyW = Math.max(24, tw + 16);
      return { w: Math.max(u.snap(bodyW + 2 * HEAD_BARB), arrows?.tall ?? 0), h: Math.max(64, u.snap(vertHeads(heads) * HEAD_LENGTH + th + 16)), lines };
    }
    default:
      return { w: Math.max(u.minWidth, u.snap(tw + sidePad(node.shape, u))), h: Math.max(u.minHeight, u.snap(th + 24)), lines };
  }
}
