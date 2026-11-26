import type { Ruler } from '../metrics.ts';
import type { LayoutNode, NodeShape } from '../types.ts';

/** How far a diamond reaches past the top and the bottom of the box it is placed in. */
export const DIAMOND_OVERHANG = 8;

/** Width the outline adds around the text, and the step its width is rounded up to. */
const PAD = 16;
const STEP = 8;

/** True for a node drawn as a diamond outline: pixel media only, a terminal draws it as a box. */
export const hasOutline = (shape: NodeShape | undefined, ruler: Ruler): boolean => shape === 'diamond' && ruler.terminal !== true;

/** Height of the diamond outline of a node whose box is `boxH` high. */
export const diamondHeight = (boxH: number): number => boxH + 2 * DIAMOND_OVERHANG;

/**
 * Width of the smallest diamond of height `height` that holds the text: the widest line must fit at the height of
 * the text block, where the diamond is narrower than at its middle.
 */
export function diamondWidth(ruler: Ruler, node: { title: string; lines: string[] }, height: number): number {
  const textW = Math.max(ruler.textWidth(node.title, 'title'), ...node.lines.map((l) => ruler.textWidth(l, 'line')));
  const textH = ruler.lineHeight('title') + node.lines.length * ruler.lineHeight('line');
  return Math.ceil((textW / (1 - textH / height) + PAD) / STEP - 1e-9) * STEP;
}

/** The node with the outline of its diamond, centred in its box; `least` is the width the diamonds of the drawing share. */
export function withOutline(node: LayoutNode, ruler: Ruler, least = 0): LayoutNode {
  if (!hasOutline(node.shape, ruler)) return node;
  const h = diamondHeight(node.h);
  const w = Math.max(diamondWidth(ruler, node, h), least);
  return { ...node, outline: { x: node.x + node.w / 2 - w / 2, y: node.y - DIAMOND_OVERHANG, w, h } };
}
