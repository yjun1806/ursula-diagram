export type Direction = 'LR' | 'TD';
export type EdgeStyle = 'normal' | 'thick' | 'dotted';

export interface Lane {
  id: string;
  label: string;
}

export interface GraphNode {
  id: string;
  title: string;
  lines: string[];
  lane: string;
}

export interface GraphEdge {
  from: string;
  to: string;
  label?: string;
  style: EdgeStyle;
}

export interface Graph {
  direction: Direction;
  lanes: Lane[];
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface Point {
  x: number;
  y: number;
}

export interface LayoutLane {
  id: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Box of the lane label (text extent), placed at the start corner of the band. */
  labelBox: { x: number; y: number; w: number; h: number };
}

export interface LayoutNode {
  id: string;
  lane: string;
  rank: number;
  row: number;
  x: number;
  y: number;
  w: number;
  h: number;
  title: string;
  lines: string[];
}

export interface LayoutEdge {
  from: string;
  to: string;
  style: EdgeStyle;
  points: Point[];
  label?: { text: string; x: number; y: number; w: number; h: number };
}

export type DiagnosticKind = 'crossing' | 'detour' | 'overflow' | 'label-overlap';

export interface Diagnostic {
  kind: DiagnosticKind;
  nodes: string[];
  message: string;
  suggestion?: string;
}

export interface Layout {
  width: number;
  height: number;
  direction: Direction;
  lanes: LayoutLane[];
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  diagnostics: Diagnostic[];
}

export class UrsulaError extends Error {
  readonly code: string;
  readonly line?: number;

  constructor(message: string, code: string, line?: number) {
    super(line === undefined ? message : `line ${line}: ${message}`);
    this.name = 'UrsulaError';
    this.code = code;
    if (line !== undefined) this.line = line;
  }
}
