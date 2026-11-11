import type { Graph } from '../types.ts';
import type { Chain, FlatEdge, Ladder, LNode } from './model.ts';
import type { Rows } from './rows.ts';

/**
 * Stage 2: splits every edge that spans more than one layer into unit pieces through one dummy per
 * intermediate layer. Flat edges and loops stay single-node or two-node chains.
 */
export function buildLadder(graph: Graph, rows: Rows, units: number[]): Ladder {
  const index = new Map(graph.nodes.map((n, i) => [n.id, i] as const));
  const nodes: LNode[] = graph.nodes.map((_, i) => ({ idx: i, layer: rows.layer[i] ?? 0, units: units[i] ?? 2, origin: i, chain: -1 }));
  const realCount = nodes.length;
  const chains: Chain[] = [];
  const flat: FlatEdge[] = [];
  graph.edges.forEach((e, edge) => {
    const u = index.get(e.from);
    const v = index.get(e.to);
    if (u === undefined || v === undefined) return;
    const ci = chains.length;
    if (u === v) {
      chains.push({ edge, nodes: [u], kind: 'loop', reversed: false });
      return;
    }
    const lu = rows.layer[u] ?? 0;
    const lv = rows.layer[v] ?? 0;
    if (lu === lv) {
      const reversed = rows.reversed[edge] === true;
      chains.push({ edge, nodes: [u, v], kind: 'flat', reversed });
      flat.push(reversed ? { lo: v, hi: u, chain: ci } : { lo: u, hi: v, chain: ci });
      return;
    }
    const chain = [u];
    const step = lv > lu ? 1 : -1;
    for (let l = lu + step; l !== lv; l += step) {
      const d: LNode = { idx: nodes.length, layer: l, units: 1, origin: u, chain: ci };
      nodes.push(d);
      chain.push(d.idx);
    }
    chain.push(v);
    chains.push({ edge, nodes: chain, kind: 'span', reversed: false });
  });
  const layers: number[][] = rows.layerLane.map(() => []);
  for (const n of nodes) layers[n.layer]?.push(n.idx);
  return { nodes, realCount, layers, chains, layerLane: rows.layerLane, layerRow: rows.layerRow, flat };
}
