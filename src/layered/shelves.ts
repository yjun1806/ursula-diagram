import type { Diagnostic, EndLabel, Graph, Layout, LayoutEdge, LayoutNode, Point } from '../types.ts';

/** Room between two pieces that no edge joins. */
export const PIECE_GAP = 48;

const tidy = (v: number): number => {
  const r = Math.round(v * 1e6) / 1e6;
  return r === 0 ? 0 : r;
};

/**
 * The connected pieces of a graph, each as a graph of its own, in the order of their first box in the text. Edges are
 * kept in their source order inside a piece; `edges[k]` of a piece is the edge `edgeAt[k]` of the whole graph.
 */
export function piecesOf(graph: Graph): Array<{ graph: Graph; nodeAt: number[]; edgeAt: number[] }> {
  const index = new Map(graph.nodes.map((n, i) => [n.id, i] as const));
  const parent = graph.nodes.map((_, i) => i);
  const find = (x: number): number => {
    let r = x;
    while ((parent[r] as number) !== r) r = parent[r] as number;
    return r;
  };
  for (const e of graph.edges) {
    const a = index.get(e.from);
    const b = index.get(e.to);
    if (a !== undefined && b !== undefined) parent[Math.max(find(a), find(b))] = Math.min(find(a), find(b));
  }
  const nodesOf = new Map<number, number[]>();
  graph.nodes.forEach((_, i) => nodesOf.set(find(i), [...(nodesOf.get(find(i)) ?? []), i]));
  return [...nodesOf.values()].map((nodeAt) => {
    const mine = new Set(nodeAt);
    const edgeAt = graph.edges.flatMap((e, k) => (mine.has(index.get(e.from) ?? -1) ? [k] : []));
    return {
      nodeAt,
      edgeAt,
      graph: { ...graph, nodes: nodeAt.map((i) => graph.nodes[i] as Graph['nodes'][number]), edges: edgeAt.map((k) => graph.edges[k] as Graph['edges'][number]) },
    };
  });
}

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** The box that holds everything a drawing puts on its canvas except the legend. */
function contentBox(l: Layout): Box {
  const box: Box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  const add = (x: number, y: number, w = 0, h = 0): void => {
    box.x0 = Math.min(box.x0, x);
    box.y0 = Math.min(box.y0, y);
    box.x1 = Math.max(box.x1, x + w);
    box.y1 = Math.max(box.y1, y + h);
  };
  for (const n of l.nodes) add(n.x, n.y, n.w, n.h);
  for (const e of l.edges) {
    for (const p of e.points) add(p.x, p.y);
    for (const t of [e.label, e.startLabel, e.endLabel]) if (t) add(t.x, t.y, t.w, t.h);
  }
  return box;
}

const move = (p: Point, dx: number, dy: number): Point => ({ x: tidy(p.x + dx), y: tidy(p.y + dy) });

function shiftNode(n: LayoutNode, dx: number, dy: number): LayoutNode {
  return { ...n, x: tidy(n.x + dx), y: tidy(n.y + dy), ...(n.outline ? { outline: { ...n.outline, x: tidy(n.outline.x + dx), y: tidy(n.outline.y + dy) } } : {}) };
}

function shiftEdge(e: LayoutEdge, dx: number, dy: number): LayoutEdge {
  const { label, startLabel, endLabel, ...rest } = e;
  const at = (t: EndLabel): EndLabel => ({ ...t, x: tidy(t.x + dx), y: tidy(t.y + dy) });
  return {
    ...rest,
    points: e.points.map((p) => move(p, dx, dy)),
    ...(label ? { label: { ...label, x: tidy(label.x + dx), y: tidy(label.y + dy) } } : {}),
    ...(startLabel ? { startLabel: at(startLabel) } : {}),
    ...(endLabel ? { endLabel: at(endLabel) } : {}),
  };
}

/**
 * Puts the drawings of the pieces of one graph on shelves. Pieces stand side by side across the reading direction in
 * the order of the text, and a piece that would pass `limit` starts the next shelf, which lies further along the
 * reading direction. Nodes and edges come back in the order of the whole graph (`nodeAt`, `edgeAt` per piece).
 */
export function packPieces(parts: Array<{ drawn: Layout; nodeAt: number[]; edgeAt: number[] }>, td: boolean, limit: number): Layout {
  const first = parts[0]?.drawn as Layout;
  const boxes = parts.map((p) => contentBox(p.drawn));
  // The margin the drawings keep around their content: the first one's in front, the widest behind.
  const lead = { x: boxes[0]?.x0 ?? 0, y: boxes[0]?.y0 ?? 0 };
  const tail = parts.reduce((m, p, i) => ({ x: Math.max(m.x, p.drawn.width - (boxes[i] as Box).x1), y: Math.max(m.y, p.drawn.height - (boxes[i] as Box).y1) }), { x: 0, y: 0 });
  const room = limit - (td ? lead.x + tail.x : lead.y + tail.y);
  const across = (b: Box): number => (td ? b.x1 - b.x0 : b.y1 - b.y0);
  const along = (b: Box): number => (td ? b.y1 - b.y0 : b.x1 - b.x0);
  const offsets: Array<{ at: number; shelf: number }> = [];
  let cursor = 0;
  let shelf = 0;
  const shelfAlong: number[] = [];
  boxes.forEach((b, i) => {
    if (cursor > 0 && cursor + PIECE_GAP + across(b) > room) {
      shelf++;
      cursor = 0;
    }
    const at = cursor > 0 ? cursor + PIECE_GAP : 0;
    offsets[i] = { at, shelf };
    cursor = at + across(b);
    shelfAlong[shelf] = Math.max(shelfAlong[shelf] ?? 0, along(b));
  });
  const shelfAt: number[] = [];
  let run = 0;
  shelfAlong.forEach((a, s) => {
    shelfAt[s] = run;
    run += a + PIECE_GAP;
  });
  const nodes: LayoutNode[] = [];
  const edges: LayoutEdge[] = [];
  const diagnostics: Diagnostic[] = [];
  let contentAcross = 0;
  parts.forEach((p, i) => {
    const b = boxes[i] as Box;
    const o = offsets[i] as { at: number; shelf: number };
    const x = td ? o.at : shelfAt[o.shelf] ?? 0;
    const y = td ? shelfAt[o.shelf] ?? 0 : o.at;
    const [dx, dy] = [lead.x + x - b.x0, lead.y + y - b.y0];
    contentAcross = Math.max(contentAcross, o.at + across(b));
    p.drawn.nodes.forEach((n, k) => (nodes[p.nodeAt[k] as number] = shiftNode(n, dx, dy)));
    p.drawn.edges.forEach((e, k) => (edges[p.edgeAt[k] as number] = shiftEdge(e, dx, dy)));
    diagnostics.push(...p.drawn.diagnostics.filter((d) => d.kind !== 'overflow'));
  });
  const contentAlong = Math.max(0, run - PIECE_GAP);
  const [cw, ch] = td ? [contentAcross, contentAlong] : [contentAlong, contentAcross];
  const lane = first.lanes[0];
  return {
    ...first,
    width: tidy(lead.x + cw + tail.x),
    height: tidy(lead.y + ch + tail.y),
    lanes: lane ? [{ ...lane, x: tidy(lead.x), y: tidy(lead.y), w: tidy(cw), h: tidy(ch), labelBox: { x: tidy(lead.x), y: tidy(lead.y), w: 0, h: 0 } }] : [],
    nodes,
    edges,
    diagnostics,
  };
}
