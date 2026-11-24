/**
 * Shared shapes of the layered pipeline. Everything is abstract: the ORDER axis is the flow axis and the
 * LAYER axis is the cross axis; only the final step maps them to x and y.
 */

export interface LNode {
  idx: number;
  layer: number;
  /** Slot units the node covers along the order axis: 2, 3, 4, 6... for a real node (3 only in pixels), 1 for a dummy. */
  units: number;
  /** The real node a dummy descends from (the node itself for a real one). */
  origin: number;
  /** Index of the chain a dummy belongs to; -1 for a real node. */
  chain: number;
}

export type ChainKind = 'span' | 'flat' | 'loop';

/** One graph edge as a chain of nodes from its source to its target. */
export interface Chain {
  edge: number;
  /** [source, dummies..., target]; one node for a loop, two for a flat edge. */
  nodes: number[];
  kind: ChainKind;
  /** A flat edge laid out from its target to its source (cycle breaking). */
  reversed: boolean;
}

export interface FlatEdge {
  /** Left end and right end in layout direction. */
  lo: number;
  hi: number;
  chain: number;
}

export interface Ladder {
  /** Real nodes first, in graph order; their index is the graph node index. */
  nodes: LNode[];
  realCount: number;
  layers: number[][];
  chains: Chain[];
  layerLane: number[];
  layerRow: number[];
  flat: FlatEdge[];
}

import type { Ruler } from '../metrics.ts';
import type { Bundles, FlatPlan } from './ports.ts';
import type { Rows } from './rows.ts';

export const isReal = (l: Ladder, n: number): boolean => n < l.realCount;

/** Unit-span pieces between adjacent layers: [upper node, lower node, chain index]. */
export function pieces(l: Ladder): Array<[number, number, number]> {
  const out: Array<[number, number, number]> = [];
  l.chains.forEach((c, ci) => {
    if (c.kind !== 'span') return;
    for (let k = 0; k + 1 < c.nodes.length; k++) {
      const a = c.nodes[k] as number;
      const b = c.nodes[k + 1] as number;
      const la = (l.nodes[a] as LNode).layer;
      const lb = (l.nodes[b] as LNode).layer;
      out.push(la < lb ? [a, b, ci] : [b, a, ci]);
    }
  });
  return out;
}

/** A finished placement: the ladder, the order of its layers and the start of every node, and how to place it again with changes. */
export interface Placed {
  ladder: Ladder;
  layers: number[][];
  start: number[];
  width: number;
  plan: Map<number, FlatPlan>;
  /** The line ends that share a port; the boxes were grown for the ports that are left. */
  bundles: Bundles;
  /** Units a layer may hold. */
  capacity: number;
  rows: Rows;
  /** Whether no flat edge was forced to run from left to right. */
  loose: boolean;
  /** The ruler (gap) this placement was made for. */
  ruler: Ruler;
  /** The same ladder with another order of its layers. */
  reorder(layers: number[][]): Placed;
  /** Rows changed by the caller: a new ladder and order. */
  rebuild(rows: Rows): Placed;
}
