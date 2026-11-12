import type { Point, Scene } from '../types.ts';

/** The look of a block: the bracket pair of the source decides it. */
export type BlockShape =
  | 'rect'
  | 'round'
  | 'stadium'
  | 'subroutine'
  | 'cylinder'
  | 'circle'
  | 'dbl-circle'
  | 'asym'
  | 'diamond'
  | 'hexagon'
  | 'parallelogram'
  | 'lean-l'
  | 'trap-b'
  | 'trap-t'
  | 'arrow';

export type ArrowDirection = 'right' | 'left' | 'up' | 'down';

/** A block that shows a label. */
export interface BlockNode {
  kind: 'node';
  id: string;
  /** Lines of the label; one empty line for a block with no text. */
  lines: string[];
  shape: BlockShape;
  /** Number of columns the block covers. */
  span: number;
  /** Heads of a block arrow, in the order the source named them. */
  heads?: ArrowDirection[];
  line: number;
}

/** An empty stretch of columns (`space`, `space:3`). */
export interface BlockSpace {
  kind: 'space';
  span: number;
  line: number;
}

/** Blocks inside a block (`block ... end`), laid out on a grid of their own. */
export interface BlockGroup {
  kind: 'group';
  id: string;
  /** False for a group the source gave no id; no link can name it. */
  named: boolean;
  span: number;
  /** Number of columns of the inner grid; absent when every child stands in one row. */
  columns?: number;
  children: BlockItem[];
  line: number;
}

export type BlockItem = BlockNode | BlockSpace | BlockGroup;

export type LinkStyle = 'normal' | 'thick' | 'dotted';

export interface BlockLink {
  from: string;
  to: string;
  label?: string;
  style: LinkStyle;
  /** Arrowhead at the `to` end. */
  arrow: boolean;
  /** Arrowhead at the `from` end as well. */
  arrowStart: boolean;
  /** Takes no part in the drawing (`~~~`). */
  invisible: boolean;
  line: number;
}

export interface BlockDiagram {
  title?: string;
  accTitle?: string;
  /** Number of columns of the outer grid; absent when every block stands in one row. */
  columns?: number;
  children: BlockItem[];
  links: BlockLink[];
  /** Statements that were read and left out of the drawing (`style`, `classDef`, `class`). */
  ignored: string[];
}

/** The box a block takes in a drawing. */
export interface PlacedBlock {
  id: string;
  kind: 'node' | 'group';
  shape: BlockShape | 'group';
  x: number;
  y: number;
  w: number;
  h: number;
  lines: string[];
  /** Zone nesting depth: 1 for a group in no other. Zero for a node. */
  depth: number;
  /** The innermost group the block stands in, absent for the outer grid. */
  parent?: string;
  /** Row, column and span in the grid of its parent. */
  row: number;
  column: number;
  span: number;
  heads?: ArrowDirection[];
  /** Nothing leads into it and something leaves it. */
  start: boolean;
}

export interface PlacedLink {
  from: string;
  to: string;
  label?: string;
  style: LinkStyle;
  arrow: boolean;
  arrowStart: boolean;
  invisible: boolean;
  points: Point[];
  chip?: { x: number; y: number; w: number; h: number; text: string };
}

export interface BlockLayout {
  scene: Scene;
  width: number;
  height: number;
  blocks: PlacedBlock[];
  links: PlacedLink[];
}

