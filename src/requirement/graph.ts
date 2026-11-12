import type { Ruler } from '../metrics.ts';
import { wrapWords } from '../text/wrap.ts';
import type { Compartment, Graph, GraphEdge, GraphNode } from '../types.ts';
import { KIND_TAGS } from './parse.ts';
import type { ElementNode, RequirementModel, RequirementNode } from './parse.ts';

const LANE = { id: '_', label: '' };

/** Pixels: widest line of a requirement text; the box is a little wider than this (text plus the sides of the box). */
const TEXT_LIMIT_PX = 192;
/** Terminal cells: the same for a terminal drawing. */
const TEXT_LIMIT_CELLS = 24;

function requirementCells(node: RequirementNode, ruler: Ruler): Compartment[] {
  const cells: Compartment[] = [
    { lines: [`<<${KIND_TAGS[node.type]}>>`], align: 'center', emphasis: 'tag' },
    { lines: [node.name], align: 'center', emphasis: 'title' },
  ];
  if (node.text !== undefined) {
    const limit = ruler.terminal === true ? TEXT_LIMIT_CELLS : TEXT_LIMIT_PX;
    cells.push({ lines: wrapWords(node.text, limit, (s) => ruler.textWidth(s, 'line'), { longWord: 'break' }), emphasis: 'body' });
  }
  const facts = [
    ...(node.id === undefined ? [] : [`id: ${node.id}`]),
    ...(node.risk === undefined ? [] : [`risk: ${node.risk}`]),
    ...(node.verifymethod === undefined ? [] : [`verifymethod: ${node.verifymethod}`]),
  ];
  if (facts.length > 0) cells.push({ lines: facts, emphasis: 'body' });
  return cells;
}

function elementCells(node: ElementNode): Compartment[] {
  const cells: Compartment[] = [
    { lines: ['<<Element>>'], align: 'center', emphasis: 'tag' },
    { lines: [node.name], align: 'center', emphasis: 'title' },
  ];
  const facts = [...(node.type === undefined ? [] : [`type: ${node.type}`]), ...(node.docref === undefined ? [] : [`docref: ${node.docref}`])];
  if (facts.length > 0) cells.push({ lines: facts, emphasis: 'body' });
  return cells;
}

/** The graph of a requirement diagram: every requirement and element is a box divided into compartments, every relation a labelled line. */
export function requirementGraph(model: RequirementModel, ruler: Ruler): Graph {
  const direction = model.direction === 'LR' || model.direction === 'RL' ? 'LR' : 'TD';
  const mirror = model.direction === 'RL' || model.direction === 'BT' ? model.direction : undefined;
  const nodes: GraphNode[] = model.nodes.map((n) => ({
    id: n.name,
    title: n.name,
    lines: [],
    shape: 'rect',
    lane: LANE.id,
    compartments: n.kind === 'requirement' ? requirementCells(n, ruler) : elementCells(n),
  }));
  const edges: GraphEdge[] = model.relations.map((r) => ({
    from: r.from,
    to: r.to,
    label: `<<${r.type}>>`,
    style: 'normal',
    ...(r.type === 'contains' ? { startEnd: 'circle', end: 'none' } : { end: 'arrow' }),
  }));
  return { direction, ...(mirror === undefined ? {} : { mirror }), ignored: model.ignored, lanes: [LANE], nodes, edges };
}
