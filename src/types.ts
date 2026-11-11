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
  /** Number of rank columns the box covers; 1 unless the content is wider than the shared box width. */
  span: number;
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

export interface LegendItem {
  style: EdgeStyle;
  caption: string;
  /** Left edge of the sample line. */
  x: number;
  /** Vertical centre of the item row. */
  y: number;
  /** Width of sample, gap and caption together. */
  w: number;
  sampleW: number;
  captionX: number;
}

export interface Legend {
  /** Box of the legend; it starts where the drawing ends. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Size of the drawing without the legend. */
  base: { width: number; height: number };
  items: LegendItem[];
}

/** How lanes sit: 'across' bands run parallel to the flow axis; 'along' bands follow one another along it. */
export type LaneAxis = 'across' | 'along';

export interface Layout {
  width: number;
  height: number;
  direction: Direction;
  laneAxis: LaneAxis;
  lanes: LayoutLane[];
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  diagnostics: Diagnostic[];
  /** Present when the drawing uses two or more edge styles; width and height already include it. */
  legend?: Legend;
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

/** Arrowhead drawn at the last point of a scene line. */
export type SceneArrow = 'none' | 'filled' | 'open' | 'cross';

/** Colour weight: full foreground, foreground at about three quarters, or the muted colour. */
export type SceneTone = 'fg' | 'soft' | 'muted';

export interface SceneBox {
  kind: 'box';
  /**
   * `box`: header with a strong border; `actor`: the same with a tinted fill; `note`: surface with a quiet border;
   * `bar`: narrow activation bar; `frame`: tinted body with a quiet border; `label`: plain backing behind a text.
   */
  style: 'box' | 'actor' | 'note' | 'bar' | 'frame' | 'label';
  x: number;
  y: number;
  w: number;
  h: number;
  /** Label tab on the top-left corner of a frame. */
  tab?: { text: string; w: number; h: number };
  data?: Record<string, string>;
}

export interface SceneText {
  kind: 'text';
  /** Anchor position; `y` is the vertical centre of the line. */
  x: number;
  y: number;
  text: string;
  anchor?: 'start' | 'middle' | 'end';
  font?: 'title' | 'body' | 'label' | 'num' | 'caption';
  tone?: SceneTone;
  data?: Record<string, string>;
}

export interface SceneLine {
  kind: 'line';
  points: Point[];
  /** `message` (default) is drawn in the tone; `life` and `divider` are faint dashed guides; `rule` is a thin separator. */
  role?: 'message' | 'life' | 'divider' | 'rule';
  tone?: SceneTone;
  dash?: boolean;
  /** Corner radius of the bends. */
  radius?: number;
  arrow?: SceneArrow;
  data?: Record<string, string>;
}

export type SceneItem = SceneBox | SceneText | SceneLine;

/** Drawing as a list of generic primitives; later items paint over earlier ones. */
export interface Scene {
  width: number;
  height: number;
  title: string;
  items: SceneItem[];
}

/** How a run of terminal text is meant to look; the host decides how to draw each tone. */
export type TextTone = 'normal' | 'dim' | 'bold' | 'accent';

export interface TextSpan {
  text: string;
  tone: TextTone;
}
