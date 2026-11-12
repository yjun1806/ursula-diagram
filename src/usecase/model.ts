import type { Graph } from '../types.ts';

/** What the source says about an element beyond what a graph node carries. */
export interface ElementMeta {
  kind: 'actor' | 'usecase' | 'json' | 'note';
  /** Actor figure: `normal`, `hollow`, `awesome` or an icon name. */
  variant?: 'normal' | 'hollow' | 'awesome' | 'icon';
  icon?: string;
  /** The business slash. */
  business?: boolean;
  stereotype?: string;
}

/** A usecase diagram read from text: the graph the layered engine draws, and what the graph cannot say. */
export interface UsecaseModel {
  graph: Graph;
  /** Per node id. */
  meta: Map<string, ElementMeta>;
  /** Ids of boundaries that ask for a package tab. */
  packages: Set<string>;
  accTitle?: string;
  accDescr?: string;
}
