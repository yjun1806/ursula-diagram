import type { Theme } from './render/theme.ts';

export type Direction = 'LR' | 'TD';
export type EdgeStyle = 'normal' | 'thick' | 'dotted';

export interface Lane {
  id: string;
  label: string;
}

export type NodeShape = 'rect' | 'round' | 'stadium' | 'circle' | 'diamond' | 'hexagon' | 'cylinder' | 'parallelogram' | 'subroutine';

export interface GraphNode {
  id: string;
  title: string;
  lines: string[];
  shape: NodeShape;
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
  /** Terminal drawings: the band has no border; its name stands on a line of its own (a rule across the band when lanes run along the reading direction). */
  bare?: true;
}

export interface LayoutNode {
  id: string;
  lane: string;
  rank: number;
  /** Number of rank columns the box covers; 1 unless the content is wider than the shared box width (it can be a half step, such as 1.5). */
  span: number;
  row: number;
  x: number;
  y: number;
  w: number;
  h: number;
  title: string;
  lines: string[];
  shape: NodeShape;
  /** Diamonds in pixel media: the outline, centred in the box and reaching past its top and bottom. */
  outline?: { x: number; y: number; w: number; h: number };
}

export interface LayoutEdge {
  from: string;
  to: string;
  style: EdgeStyle;
  points: Point[];
  /** Drawn with one bend, out of or into the side of a box. */
  elbow?: boolean;
  /** Joins two nodes of the main flow in turn (set by the layered engine for lanes). */
  main?: true;
  /** `lines` is present when the label is wrapped onto two lines; `text` is then the whole text. */
  label?: { text: string; x: number; y: number; w: number; h: number; lines?: string[] };
}

export type DiagnosticKind = 'crossing' | 'detour' | 'overflow' | 'label-overlap' | 'label-tight' | 'off-centre' | 'mixed-side' | 'shared-port' | 'question';

/** What a drawing looks like, as far as a question compares drawings. */
export interface DrawingFacts {
  composition: 'lanes' | 'stages';
  bends: number;
  crossings: number;
  /** Edges that run against the reading direction. */
  back: number;
  cost: number;
}

export interface Diagnostic {
  kind: DiagnosticKind;
  nodes: string[];
  message: string;
  suggestion?: string;
  /** Questions only: what to ask, where, and what drawing the answer would give. */
  code?: 'split-lane' | 'isolated-nodes';
  lane?: string;
  before?: DrawingFacts;
  after?: DrawingFacts;
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
  /** Set by the layered engine: whether bands run alongside the reading direction or cross it in reading order. */
  composition?: 'lanes' | 'stages';
  /** Set by the layered engine: size of one place along the reading direction (a box and a gap). */
  pitch?: number;
  /** Set by the layered engine for pixels: the gap between neighbouring boxes the drawing used, and the default one. */
  gap?: number;
  gapDefault?: number;
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
  /** Corner radius; when absent the themed renderer takes it from the role and the theme. */
  radius?: number;
  /** Roles of the themed renderer, each naming a class `ursula-<role>`. */
  role?: string[];
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
  /** Roles of the themed renderer, each naming a class `ursula-<role>`. */
  role?: string[];
  data?: Record<string, string>;
}

export interface SceneLine {
  kind: 'line';
  points: Point[];
  /**
   * A name (`message` by default is drawn in the tone; `life` and `divider` are faint dashed guides; `rule` is a thin
   * separator) for the plain renderer, or a list of roles for the themed renderer.
   */
  role?: 'message' | 'life' | 'divider' | 'rule' | string[];
  tone?: SceneTone;
  dash?: boolean;
  /** Corner radius of the bends. */
  radius?: number;
  arrow?: SceneArrow;
  data?: Record<string, string>;
}

/** Free-form path (arc, band, polygon, curve); `d` is SVG path data. */
export interface ScenePath {
  kind: 'path';
  d: string;
  role: string[];
  data?: Record<string, string>;
}

export interface SceneCircle {
  kind: 'circle';
  cx: number;
  cy: number;
  r: number;
  role: string[];
  data?: Record<string, string>;
}

export type SceneItem = SceneBox | SceneText | SceneLine | ScenePath | SceneCircle;

/** Drawing as a list of generic primitives; later items paint over earlier ones. */
export interface Scene {
  width: number;
  height: number;
  title: string;
  items: SceneItem[];
  /** Look of the themed renderer; defaults to `solid`. */
  theme?: Theme;
}

/** How a run of terminal text is meant to look; the host decides how to draw each tone. */
export type TextTone = 'normal' | 'dim' | 'bold' | 'accent';

export interface TextSpan {
  text: string;
  tone: TextTone;
}
