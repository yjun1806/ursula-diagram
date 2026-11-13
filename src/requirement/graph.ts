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

/** A band of key and value pairs: the keys stand in a column of their own, small and muted, and the values line up beside them. */
function factsCell(facts: Array<[string, string]>): Compartment {
  return { lines: facts.map(([key, value]) => `${key}: ${value}`), columns: facts.map(([key, value]) => [key, value]), columnEmphasis: ['tag', 'body'], emphasis: 'body' };
}

/** The head band: the kind of the box as a small tag over its name. */
const headCell = (tag: string, name: string): Compartment => ({ lines: [tag, name], lineEmphasis: ['tag', 'title'], align: 'center', emphasis: 'title' });

function requirementCells(node: RequirementNode, ruler: Ruler): Compartment[] {
  const cells: Compartment[] = [headCell(`<<${KIND_TAGS[node.type]}>>`, node.name)];
  if (node.text !== undefined) {
    const limit = ruler.terminal === true ? TEXT_LIMIT_CELLS : TEXT_LIMIT_PX;
    cells.push({ lines: wrapWords(node.text, limit, (s) => ruler.textWidth(s, 'line'), { longWord: 'break' }), emphasis: 'body' });
  }
  const facts: Array<[string, string]> = [];
  if (node.id !== undefined) facts.push(['id', node.id]);
  if (node.risk !== undefined) facts.push(['risk', node.risk]);
  if (node.verifymethod !== undefined) facts.push(['verifymethod', node.verifymethod]);
  if (facts.length > 0) cells.push(factsCell(facts));
  return cells;
}

function elementCells(node: ElementNode): Compartment[] {
  const cells: Compartment[] = [headCell('<<Element>>', node.name)];
  const facts: Array<[string, string]> = [];
  if (node.type !== undefined) facts.push(['type', node.type]);
  if (node.docref !== undefined) facts.push(['docref', node.docref]);
  if (facts.length > 0) cells.push(factsCell(facts));
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
    ...(r.type === 'contains' ? { startEnd: 'circle-plus', end: 'none', trunk: { end: 'from' as const, kind: 'contains' } } : { end: 'arrow' }),
  }));
  return { direction, ...(mirror === undefined ? {} : { mirror }), ignored: model.ignored, lanes: [LANE], nodes, edges };
}
