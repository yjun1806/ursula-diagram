import type { NodeShape } from '../types.ts';

/** The corners of a box: top-left, top-right, bottom-left, bottom-right. */
export type Corners = readonly [string, string, string, string];

/** Rounded corners: every box that stands for one thing. Frames, tables and the boxes of block diagrams draw their own. */
const ROUND: Corners = ['╭', '╮', '╰', '╯'];

/** The corners of a note: square, with the top-right corner folded, so that it reads apart from the boxes. */
const NOTE: Corners = ['┌', '┒', '└', '┘'];

/** The corners a box of the shape is drawn with in a terminal drawing. */
export function cornersOf(shape: NodeShape): Corners {
  return shape === 'note' ? NOTE : ROUND;
}
