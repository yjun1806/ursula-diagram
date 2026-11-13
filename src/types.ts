import type { Theme } from './render/theme.ts';

export type Direction = 'LR' | 'TD';
export type EdgeStyle = 'normal' | 'thick' | 'dotted';

/**
 * What sits at an end of a line: an arrowhead, a dot, a cross, or nothing; or one of the marks of a record diagram.
 * `triangle-open`, `diamond-filled`, `diamond-open` and `arrow-open` are relation marks (inheritance, composition,
 * aggregation, dependency); `one`, `zero-one`, `many`, `one-many` and `zero-many` are the crow's-foot counts;
 * `circle-plus` is a ring with a cross (containment); `lollipop` is a ring at the end of a short stub (see `GraphEdge`).
 */
export type EdgeEnd =
  | 'arrow'
  | 'circle'
  | 'cross'
  | 'none'
  | 'triangle-open'
  | 'diamond-filled'
  | 'diamond-open'
  | 'arrow-open'
  | 'one'
  | 'zero-one'
  | 'many'
  | 'one-many'
  | 'zero-many'
  | 'circle-plus'
  | 'lollipop';

export interface Lane {
  id: string;
  label: string;
}

export type NodeShape =
  | 'rect'
  | 'round'
  | 'stadium'
  | 'circle'
  | 'diamond'
  | 'hexagon'
  | 'cylinder'
  | 'parallelogram'
  | 'subroutine'
  | 'asym'
  | 'lean-l'
  | 'trap-b'
  | 'trap-t'
  | 'dbl-circle'
  | 'start-dot'
  | 'end-dot'
  | 'bar'
  | 'note'
  | 'ellipse'
  | 'actor';

/** One band of a box that is divided by rules (a class, an entity): the first one is the head. */
export interface Compartment {
  lines: string[];
  /** Text alignment; the head centres, the other compartments start at the left. */
  align?: 'center' | 'left';
  /** `title`: bold; `tag`: small and muted; `body`: regular. The head is a title, the others are bodies. */
  emphasis?: 'title' | 'tag' | 'body';
  /** Look of each line, by index, when the lines of one band differ (a `tag` line over a `title`); a line without an entry takes `emphasis`. */
  lineEmphasis?: Array<'title' | 'tag' | 'body'>;
  /**
   * Cells of each line, by index: when present, the lines of the band are split into columns that line up (a column is as
   * wide as its widest cell, with 16 between columns; a column with no text is left out). `lines` keeps the cells joined
   * for the readers that draw lines only.
   */
  columns?: string[][];
  /** Look of each column of `columns`, by index (a key column in the small muted type); a column without an entry takes the look of its line. */
  columnEmphasis?: Array<'title' | 'tag' | 'body'>;
  /**
   * The only band of a box that has no rules: its lines stand as one group in the middle of the box, and the first line
   * (the kind of the box) is drawn in a small pill; the line after it is a little further down.
   */
  face?: true;
}

/** A note that stands beside the node it belongs to; the layout puts it on the same layer, in the neighbouring place on `side` (`over`: above it). */
export interface Attachment {
  to: string;
  side: 'left' | 'right' | 'over';
}

export interface GraphNode {
  id: string;
  title: string;
  lines: string[];
  shape: NodeShape;
  lane: string;
  /** The innermost cluster the node stands in; absent for a node outside every cluster. */
  cluster?: string;
  /** A size set from outside (a drawn cluster box): the layout gives the node a box at least this large. */
  box?: { w: number; h: number };
  /** The shape name the source asked for when it is not drawn yet (the node is drawn as a rectangle). */
  shapeAsked?: string;
  /** A box divided by rules; when present it is drawn instead of `title` and `lines`. */
  compartments?: Compartment[];
  /** Set on a note: it is not laid out with the others but stands beside `attach.to` once the rest is placed. */
  attach?: Attachment;
}

/** A group of nodes drawn as a box around them; clusters nest through `parent`. */
export interface GraphCluster {
  id: string;
  label: string;
  parent?: string;
  /** The reading direction inside the cluster; the parent's when absent. */
  direction?: Direction;
  /** Set when the cluster reads right to left (`RL`) or bottom to top (`BT`): it is laid out in `direction` and mirrored. */
  mirror?: 'RL' | 'BT';
  /** `dashed`: drawn as a dashed outline without a fill; the boxes in it keep the face they have outside any cluster. */
  style?: 'dashed';
  /** The label is `name · subtitle` and is always written on two lines, the subtitle faint under the name. */
  subtitled?: true;
}

export interface GraphEdge {
  from: string;
  to: string;
  label?: string;
  style: EdgeStyle;
  /** Id given in the source (`e1@-->`). */
  id?: string;
  /** What sits at the start of the line; absent when nothing does. */
  startEnd?: EdgeEnd;
  /**
   * What sits at the end of the line; absent in a graph that was not read from text, where an arrowhead is drawn.
   * `lollipop` is not a line between two boxes: the edge leaves `from` as a short stub that ends in a ring, `to` equals
   * `from`, and `endLabel` names the interface beside the ring. The layout leaves it out of the arrangement and draws
   * the stub on a free side of `from` afterwards.
   */
  end?: EdgeEnd;
  /** Laid out but not drawn (`A ~~~ B`). */
  invisible?: true;
  /** Length asked for by a longer line (`--->` is 2); absent for the shortest. */
  minLength?: number;
  /**
   * The edge does not decide where its ends stand in the flow: ranks, layers and stages are assigned as if it were not
   * there, and the line is routed afterwards between the places its ends got. Set by the cluster layout on a line
   * between two boxes that was lifted from nodes inside them, while a line written to or from a subgraph is present.
   */
  unranked?: true;
  /** Small texts beside the start and the end of the line (a multiplicity such as `1..*`). */
  startLabel?: string;
  endLabel?: string;
  /**
   * Set on a relation that may share a trunk with the other relations of the same `kind` at one box: `end` is the end at
   * that box (the parent of an inheritance, the container of a containment, the actor of an association). When two or more
   * such lines leave that box by the same face, the layout draws one line out of the face that splits where the other ends
   * are, with the mark of the end drawn once. `dot` asks for a dot where it splits.
   */
  trunk?: { end: 'from' | 'to'; kind: string; dot?: true };
}

export interface Graph {
  /** The direction the graph is laid out in. */
  direction: Direction;
  /** Set when the source reads right to left (`RL`) or bottom to top (`BT`): the drawing is laid out in `direction` and mirrored. */
  mirror?: 'RL' | 'BT';
  /** Statements that were read and left out of the drawing (classes and styles, edge animations). */
  ignored?: string[];
  lanes: Lane[];
  /**
   * `groups` when the lanes are the subgraphs of a flowchart: they are parts of the flow, not owners, so an automatic
   * composition lays them one after another along the reading direction in the order they are written.
   */
  zones?: 'groups';
  /** Clusters drawn as boxes. The `from` and `to` of an edge may name one; a node names its innermost one in `cluster`. */
  clusters?: GraphCluster[];
  nodes: GraphNode[];
  edges: GraphEdge[];
  /**
   * Gaps in pixels this drawing asks for, when they differ from the ruler's: `flow` is the gap along the reading direction
   * (`rankGap`), `join` the gap between the boxes that join the first rank of a level of clusters (`joinGap`). A terminal drawing keeps its own.
   */
  gaps?: { flow?: number; join?: number };
  /** Set when a pixel drawing is placed by a placer of its own instead of the layered engine: `c4-grid` puts every box on one grid of rows and columns (see `grid`). A terminal drawing ignores it. */
  placer?: 'c4-grid';
  /** What the `c4-grid` placer reads besides the graph. */
  grid?: GridSpec;
}

/** Where one element stands from another: `to` above (`up`), below, left of or right of `from`. */
export type GridHint = 'up' | 'down' | 'left' | 'right';

/** Placement settings of the `c4-grid` placer. */
export interface GridSpec {
  /** Per edge, by index: where `to` stands from `from`, as the source asked. */
  hints: Array<GridHint | undefined>;
  /** Per edge, by index: the end that stands above when nothing else decides, set on a line with arrowheads that do not tell (`BiRel`, `Rel_Back`): the first one written. */
  upper: Array<'from' | 'to' | undefined>;
  /** Per edge, by index: the step of a dynamic diagram; the rows follow the steps before the order of writing. */
  steps: Array<number | undefined>;
  /** Places asked for without a line. */
  lays: Array<{ from: string; to: string; hint: GridHint }>;
  /** Ids of the nodes that stand on the start side of their lines (persons). */
  starts: string[];
  /** Ids of nodes and clusters in the order they are written. */
  order: string[];
  /** Nodes without lines in one row of a cluster, and sibling clusters in one row. */
  shapeInRow: number;
  boundaryInRow: number;
  /** Cells given outright, as they stand in the drawing: the placer keeps them instead of finding its own. */
  cells?: Record<string, { r: number; c: number }>;
  /** Per node: how many rows down from its cell it stands (a half for the middle of two rows). */
  shift?: Record<string, number>;
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
  /** Bands of a box divided by rules; drawn instead of `title` and `lines`. */
  compartments?: Compartment[];
  /** The innermost cluster box the node stands in. */
  cluster?: string;
}

/** A small text beside an end of a line. */
export interface EndLabel {
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A cluster drawn as a box around its nodes and inner clusters; `depth` is 1 for a box that stands in no other. */
export interface LayoutCluster {
  id: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  depth: number;
  /** As in `GraphCluster`. */
  style?: 'dashed';
  /** Where the name is written: the box of its text (the first line's baseline is 12 below the top, each further line 16 further), on how many lines, and whether a line passes behind it, so that the name is drawn over a knockout of the fill. */
  name?: { x: number; y: number; w: number; h: number; lines: string[]; knockout?: boolean; subtitle?: true };
}

export interface LayoutEdge {
  from: string;
  to: string;
  style: EdgeStyle;
  id?: string;
  startEnd?: EdgeEnd;
  end?: EdgeEnd;
  /** Takes part in the layout but is not drawn. */
  invisible?: true;
  points: Point[];
  /** Drawn with one bend, out of or into the side of a box. */
  elbow?: boolean;
  /** Joins two nodes of the main flow in turn (set by the layered engine for lanes). */
  main?: true;
  /** `lines` is present when the label is wrapped onto two lines; `text` is then the whole text. */
  label?: { text: string; x: number; y: number; w: number; h: number; lines?: string[] };
  /** Small texts beside the start and the end of the line. */
  startLabel?: EndLabel;
  endLabel?: EndLabel;
  /**
   * The line is one of several that leave a box together as a trunk. `id` is the same on all of them. `lead` is the one
   * that keeps the mark at the shared end (the others have none there). `dot` is the place of the dot where the trunk
   * splits, on the lead only. `square`: the branches leave a flat bar and are drawn without rounded bends.
   */
  trunk?: { id: string; lead: boolean; dot?: Point; square?: true };
}

export type DiagnosticKind = 'crossing' | 'detour' | 'overflow' | 'label-overlap' | 'label-tight' | 'off-centre' | 'mixed-side' | 'shared-port' | 'attach-overlap' | 'question' | 'direction-mirrored-in-text' | 'clusters-flattened-in-text';

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
  /** The direction of the source; `RL` and `BT` are laid out as `LR` and `TD` and mirrored. */
  direction: Direction | 'RL' | 'BT';
  laneAxis: LaneAxis;
  /** Set by the layered engine: whether bands run alongside the reading direction or cross it in reading order. */
  composition?: 'lanes' | 'stages';
  /** Set by the layered engine: size of one place along the reading direction (a box and a gap). */
  pitch?: number;
  /** Set by the layered engine for pixels: the gap between neighbouring boxes the drawing used, and the default one. */
  gap?: number;
  gapDefault?: number;
  lanes: LayoutLane[];
  /** Cluster boxes, outer ones before the ones inside them. */
  clusters?: LayoutCluster[];
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
  /** Anchor position; `y` is the vertical centre of the line, or its baseline when `baseline` is `alphabetic`. */
  x: number;
  y: number;
  text: string;
  anchor?: 'start' | 'middle' | 'end';
  /** Set for a text placed by its baseline, such as a heading or a number standing on a mark. */
  baseline?: 'alphabetic';
  font?: 'title' | 'body' | 'label' | 'num' | 'caption';
  tone?: SceneTone;
  /** Roles of the themed renderer, each naming a class `ursula-<role>`. */
  role?: string[];
  /**
   * Runs of one line drawn in their own weight, slant or roles; `text` stays the whole line. Spaces between runs are
   * the spaces inside their text.
   */
  spans?: SceneTextSpan[];
  /** Turn in degrees about the anchor point. */
  rotate?: number;
  data?: Record<string, string>;
}

/** One run of a scene text. */
export interface SceneTextSpan {
  text: string;
  weight?: 'bold';
  italic?: true;
  /** Roles of the themed renderer, each naming a class `ursula-<role>`. */
  role?: string[];
  /** Space in pixels before the run, in place of a space in its text. */
  dx?: number;
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
