import { layeredRuler } from '../layered/index.ts';
import { measureNodes } from '../layout/place.ts';
import type { Ruler } from '../metrics.ts';
import { wrapWords } from '../text/wrap.ts';
import type { Compartment, Graph, GraphCluster, GraphEdge, GraphNode, NodeShape } from '../types.ts';
import type { C4Element, C4Model } from './parse.ts';

/** Width of the text of a description in pixels, and in terminal cells. */
const WRAP_PX = 200;
const WRAP_CELLS = 26;

/** A boundary with more elements than this reads top down: unconnected elements stand in one line and a longer row grows too wide. */
const MAX_ROW = 4;

const LANE = { id: '_', label: '' };

/** Written between a relation's text and its technology: an em space, which the drawing paints as a fainter span. */
export const TECH_SEPARATOR = '\u2003';

function wrap(text: string, ruler: Ruler): string[] {
  const width = (s: string): number => ruler.textWidth(s, 'line');
  const limit = ruler.terminal === true ? WRAP_CELLS : WRAP_PX;
  return text.split('\n').flatMap((paragraph) => wrapWords(paragraph, limit, width));
}

function compartmentsOf(e: C4Element, ruler: Ruler): Compartment[] {
  const name = e.label.split('\n').map((l) => l.trim());
  const tech = e.tech === undefined ? [] : wrap(e.tech, ruler);
  const descr = e.descr === undefined ? [] : wrap(e.descr, ruler);
  return [
    {
      lines: [e.macro, ...name, ...tech, ...descr],
      lineEmphasis: ['tag', ...name.map((): 'title' => 'title'), ...tech.map((): 'tag' => 'tag'), ...descr.map((): 'body' => 'body')],
      align: 'center',
      emphasis: 'body',
      face: true,
    },
  ];
}

/** A person is a rounded box, a database a cylinder; the other kinds are boxes and differ in their tag only. */
function shapeOf(e: C4Element): NodeShape {
  if (e.role === 'person') return 'round';
  return e.store === 'db' ? 'cylinder' : 'rect';
}

/** The ends of a line swapped, with what sits at each end. */
function reversed(e: GraphEdge): GraphEdge {
  const { startEnd, end, ...rest } = e;
  return { ...rest, from: e.to, to: e.from, end: startEnd ?? 'none', ...(end === undefined || end === 'none' ? {} : { startEnd: end }) };
}

/**
 * The element boxes, each as wide as the widest and as high as the highest. The sizes are measured as the layered
 * engine measures them, and rounded to what it gives a box of the shared size both down and across the reading
 * direction, so that no box grows past the others in either.
 */
function sharedBox(nodes: readonly GraphNode[], ruler: Ruler): GraphNode[] {
  const engine = layeredRuler(ruler);
  const down = measureNodes(nodes, [LANE], engine, true);
  const widest = { w: Math.max(0, ...down.w), h: down.contentH };
  const across = measureNodes(nodes.map((n) => ({ ...n, box: widest })), [LANE], engine, false);
  const box = { w: across.common, h: widest.h };
  return nodes.map((n) => ({ ...n, box }));
}

/** The name of a boundary with what it is, split into two lines by the layout (`BankBoundary · Enterprise_Boundary`, `Web Browser · Apache Tomcat 8.x`). */
function clusterLabel(label: string, kind: string, descr: string | undefined): string {
  return [label, kind, descr].filter((p): p is string => p !== undefined && p !== '').map((p) => p.replace(/\s*\n\s*/g, ' ')).join(' · ');
}

/**
 * The drawing graph of a C4 model: one node per element (a face of its kind, its name, its technology and its
 * description), one dashed cluster per boundary or deployment node, and one line per relation. Every element box has the
 * width of the widest and the height of the highest. A line into a person from anything else is laid out from the person,
 * so that persons stand above what they use and what reaches them; its arrowhead stays at the person.
 */
export function c4Graph(model: C4Model, ruler: Ruler): Graph {
  const own: GraphNode[] = model.elements.map((e) => ({
    id: e.alias,
    title: e.label,
    lines: [],
    shape: shapeOf(e),
    lane: LANE.id,
    ...(e.boundary === undefined ? {} : { cluster: e.boundary }),
    compartments: compartmentsOf(e, ruler),
  }));
  const nodes = sharedBox(own, ruler);
  const person = new Set(model.elements.filter((e) => e.role === 'person').map((e) => e.alias));
  const directCount = new Map<string, number>();
  for (const e of model.elements) if (e.boundary !== undefined) directCount.set(e.boundary, (directCount.get(e.boundary) ?? 0) + 1);
  const clusters: GraphCluster[] = model.boundaries.map((b) => ({
    id: b.alias,
    label: clusterLabel(b.label, b.kind, b.descr),
    style: 'dashed' as const,
    subtitled: true as const,
    ...(directCount.get(b.alias) !== undefined && (directCount.get(b.alias) ?? 0) <= MAX_ROW ? { direction: 'LR' as const } : {}),
    ...(b.parent === undefined ? {} : { parent: b.parent }),
  }));
  const edges: GraphEdge[] = model.rels.map((r): GraphEdge => {
    const text = [r.index === undefined ? '' : `${r.index}.`, r.label, r.tech === undefined ? '' : `${TECH_SEPARATOR}${r.tech}`].filter((p) => p !== '').join(' ').replace(` ${TECH_SEPARATOR}`, TECH_SEPARATOR);
    const base = { style: 'normal' as const, ...(text === '' ? {} : { label: text }) };
    // `Rel_Back` has its arrowhead at the first element; the line is stored from the second so that it reads along the arrow.
    const edge: GraphEdge =
      r.heads === 'start'
        ? { from: r.to, to: r.from, ...base, end: 'arrow' }
        : { from: r.from, to: r.to, ...base, end: 'arrow', ...(r.heads === 'both' ? { startEnd: 'arrow' as const } : {}) };
    return person.has(edge.to) && !person.has(edge.from) ? reversed(edge) : edge;
  });
  return { direction: 'TD', lanes: [LANE], clusters, nodes, edges, ignored: model.ignored, gaps: { flow: 96, join: 48 } };
}
