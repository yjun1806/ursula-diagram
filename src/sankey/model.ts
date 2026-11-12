export interface SankeyNode {
  name: string;
  /** One-based source line where the name first appears. */
  line: number;
}

export interface SankeyLink {
  /** Index into `nodes`. */
  source: number;
  /** Index into `nodes`. */
  target: number;
  /** Always greater than zero. */
  value: number;
  /** One-based source line. */
  line: number;
}

export interface Sankey {
  title?: string;
  accTitle?: string;
  /** Nodes in order of first appearance, a link's source before its target. */
  nodes: SankeyNode[];
  links: SankeyLink[];
  /** Whether the values are written next to the node names. */
  showValues: boolean;
  /** Labels drawn with a halo behind the letters (`labelStyle: outlined`). */
  outlined: boolean;
  /** Width of a node in pixels, when the settings give one. */
  nodeWidth?: number;
  /** Vertical gap between two nodes of a column in pixels, when the settings give one. */
  nodePadding?: number;
}

/** A number as text with no float noise and no trailing zeros. */
export const valueText = (v: number): string => String(Number(v.toFixed(6)));
