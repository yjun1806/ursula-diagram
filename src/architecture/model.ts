export type Side = 'T' | 'B' | 'L' | 'R';

export interface ArchGroup {
  id: string;
  /** Icon name written in parentheses; absent when the group has none. */
  icon?: string;
  label: string;
  parent?: string;
  line: number;
}

/** A service (a box with an icon name and a label) or a junction (a four-way meeting point of lines). */
export interface ArchNode {
  id: string;
  kind: 'service' | 'junction';
  icon?: string;
  label: string;
  parent?: string;
  line: number;
}

export interface ArchEdge {
  from: string;
  fromSide: Side;
  /** The line leaves the group around `from` instead of the service itself (`a{group}:B`). */
  fromGroup: boolean;
  to: string;
  toSide: Side;
  toGroup: boolean;
  /** Arrowhead at the `from` end (`<--`). */
  startArrow: boolean;
  /** Arrowhead at the `to` end (`-->`). */
  endArrow: boolean;
  line: number;
}

/** `align row a b c` puts the members on one row, `align column` on one column. */
export interface ArchAlign {
  axis: 'row' | 'column';
  members: string[];
  line: number;
}

export interface Architecture {
  title?: string;
  /** Text of `accTitle:`; the drawing's accessible title. */
  accTitle?: string;
  groups: ArchGroup[];
  nodes: ArchNode[];
  edges: ArchEdge[];
  aligns: ArchAlign[];
}

export interface PlacedNode {
  id: string;
  kind: 'service' | 'junction';
  /** Cell of the grid the node stands in, counted from 0 at the top left. */
  col: number;
  row: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PlacedGroup {
  id: string;
  label: string;
  icon?: string;
  /** 1 for a group that stands in no other. */
  depth: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PlacedEdge {
  from: string;
  to: string;
  points: { x: number; y: number }[];
}
