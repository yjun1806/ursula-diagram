/** Node outlines of the mindmap syntax; `default` is the plain text line without delimiters. */
export type MindShape = 'default' | 'square' | 'round' | 'circle' | 'bang' | 'cloud' | 'hexagon';

/** Part of a paragraph in one weight and slant. */
export interface MindRun {
  text: string;
  bold?: true;
  italic?: true;
}

export interface MindNode {
  /** Text before the shape delimiters; equals the text for a plain node. */
  id: string;
  /** Label paragraphs; a break written in the source (`<br/>` or a newline in a markdown string) starts a new one. */
  paragraphs: string[];
  /** Runs of each paragraph when a markdown string sets some of its words bold or italic; their texts join to the paragraph. */
  runs?: MindRun[][];
  shape: MindShape;
  /** 1-based source line of the node. */
  line: number;
  children: MindNode[];
}

export interface Mindmap {
  root: MindNode;
  /** Value of `accTitle:` when the source has one. */
  accTitle?: string;
}
