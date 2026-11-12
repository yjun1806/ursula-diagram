import type { Diagnostic, Graph, Lane, Layout } from '../types.ts';
import type { Composition } from './composition.ts';
import { planZones } from './composition.ts';
import { score } from './choose.ts';

/** What a drawing looks like, in the few numbers a question compares. */
export interface Picture {
  composition: Composition;
  bends: number;
  crossings: number;
  /** Edges that run against the reading direction. */
  back: number;
  cost: number;
}

export function pictureOf(l: Layout): Picture {
  const axis = l.direction === 'TD' ? 'y' : 'x';
  let bends = 0;
  let back = 0;
  for (const e of l.edges) {
    bends += Math.max(0, e.points.length - 2);
    const first = e.points[0];
    const last = e.points[e.points.length - 1];
    if (first && last && last[axis] < first[axis] - 8) back++;
  }
  return {
    composition: l.composition ?? 'lanes',
    bends,
    crossings: l.diagnostics.filter((d) => d.kind === 'crossing').length,
    back,
    cost: score(l)[1] ?? 0,
  };
}

const MOST = 3;

/** Nodes of a lane that edges to other lanes only leave, split from the rest when no edge inside the lane joins the two groups. */
function leavingOnly(graph: Graph, lane: Lane): string[] | undefined {
  const mine = graph.nodes.filter((n) => n.lane === lane.id).map((n) => n.id);
  if (mine.length < 2) return undefined;
  const inside = new Set(mine);
  const out = new Set<string>();
  const into = new Set<string>();
  const parent = new Map(mine.map((id) => [id, id] as const));
  const find = (x: string): string => {
    let r = x;
    while ((parent.get(r) ?? r) !== r) r = parent.get(r) ?? r;
    return r;
  };
  for (const e of graph.edges) {
    const a = inside.has(e.from);
    const b = inside.has(e.to);
    if (a && b) parent.set(find(e.from), find(e.to));
    else if (a) out.add(e.from);
    else if (b) into.add(e.to);
  }
  if ([...out].some((id) => into.has(id))) return undefined;
  const leaving = new Set<string>();
  const group = new Map<string, { out: boolean; into: boolean; ids: string[] }>();
  for (const id of mine) {
    const g = group.get(find(id)) ?? { out: false, into: false, ids: [] };
    g.out ||= out.has(id);
    g.into ||= into.has(id);
    g.ids.push(id);
    group.set(find(id), g);
  }
  for (const g of group.values()) {
    if (g.out && g.into) return undefined;
    if (g.out) for (const id of g.ids) leaving.add(id);
  }
  const ids = mine.filter((id) => leaving.has(id));
  return ids.length > 0 && ids.length < mine.length ? ids : undefined;
}

/** The graph with the leaving nodes of a lane in a new lane in front of it. */
function splitGraph(graph: Graph, lane: Lane, ids: string[]): Graph {
  const fresh: Lane = { id: `${lane.id}~out`, label: `${lane.label} (out)` };
  const at = graph.lanes.findIndex((l) => l.id === lane.id);
  return {
    ...graph,
    lanes: [...graph.lanes.slice(0, at), fresh, ...graph.lanes.slice(at)],
    nodes: graph.nodes.map((n) => (ids.includes(n.id) ? { ...n, lane: fresh.id } : n)),
  };
}

/** Nodes no edge touches, in lanes that also hold nodes with edges. */
function isolated(graph: Graph, lane: Lane): string[] {
  const touched = new Set(graph.edges.flatMap((e) => [e.from, e.to]));
  const mine = graph.nodes.filter((n) => n.lane === lane.id);
  const alone = mine.filter((n) => !touched.has(n.id)).map((n) => n.id);
  return alone.length > 0 && alone.length < mine.length ? alone : [];
}

const show = (p: Picture): string => `${p.composition}, bends ${p.bends}, crossings ${p.crossings}, backward ${p.back}`;

/**
 * Doubts the structure raises, each tried before it is asked: a lane that holds both starts and ends of the
 * flow is split in a copy and drawn, and asked about only when that copy costs less; nodes without any edge
 * inside a lane with connected nodes are asked about without a trial.
 */
export function questionsFor(graph: Graph, laid: Layout, draw: (g: Graph) => Layout): Diagnostic[] {
  const out: Diagnostic[] = [];
  const before = pictureOf(laid);
  if (laid.composition === 'lanes') {
    for (const lane of graph.lanes) {
      if (out.length >= MOST) break;
      const ids = leavingOnly(graph, lane);
      if (!ids) continue;
      const split = splitGraph(graph, lane, ids);
      if (planZones(split).composition !== 'stages') continue;
      const after = pictureOf(draw(split));
      // A gain of one is not worth a question.
      if (before.cost - after.cost < 2) continue;
      out.push({
        kind: 'question',
        code: 'split-lane',
        lane: lane.label || lane.id,
        nodes: ids,
        before,
        after,
        message: `Lane '${lane.label || lane.id}' holds both starts and ends of the flow; moving ${ids.join(', ')} into a lane of their own changes ${show(before)} to ${show(after)}.`,
      });
    }
  }
  for (const lane of graph.lanes) {
    if (out.length >= MOST) break;
    const ids = isolated(graph, lane);
    if (ids.length === 0) continue;
    out.push({
      kind: 'question',
      code: 'isolated-nodes',
      lane: lane.label || lane.id,
      nodes: ids,
      message: `Lane '${lane.label || lane.id}' mixes ${ids.length} node(s) that no edge touches (${ids.join(', ')}) with connected ones; in a subgraph of their own they are placed last.`,
    });
  }
  return out;
}

/** A few short lines for a reader that does not look at the drawing. */
export function checkLines(l: Layout): string[] {
  const p = pictureOf(l);
  const lines = [`composition ${p.composition} · bends ${p.bends} · crossings ${p.crossings}`];
  const asked = l.diagnostics.filter((d) => d.kind === 'question');
  asked.forEach((d, i) => {
    if (d.code === 'split-lane' && d.before && d.after) {
      lines.push(`question ${i + 1}: lane '${d.lane}' holds the start (${d.nodes.join(', ')}) and the end of the flow`);
      lines.push(`  if split: ${show(d.before)} -> ${show(d.after)}`);
      lines.push(`  to do: move ${d.nodes.join(', ')} into a new subgraph and name it`);
    } else {
      lines.push(`question ${i + 1}: lane '${d.lane}' has ${d.nodes.length} node(s) without edges (${d.nodes.join(', ')})`);
      lines.push('  to do: group them in a new subgraph and name it; left alone they are placed last in the lane');
    }
  });
  return lines;
}
