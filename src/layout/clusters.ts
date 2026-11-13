import { layeredRuler } from '../layered/index.ts';
import { refineLabels } from '../layered/label-spot.ts';
import type { Ruler } from '../metrics.ts';
import type { Diagnostic, Direction, Graph, GraphEdge, GraphNode, Layout, LayoutCluster, LayoutEdge, LayoutNode, Point } from '../types.ts';
import type { LayoutOptions } from './index.ts';
import { withLegend } from './legend.ts';
import { crossingCount } from './check.ts';
import { gridUp } from './place.ts';

/** Space between a cluster box and what stands in it, and the extra line on top that holds the name. */
export const CLUSTER_PAD = 24;
export const CLUSTER_NAME_ROW = 32;
/** Distance of a name from the left side of its box. */
export const CLUSTER_NAME_INSET = 16;
/** Distance from the border of a cluster at which a line that goes round the nodes inside runs. */
const CORRIDOR = CLUSTER_PAD / 2;
/** Distance between the lines of a name written on two. */
export const CLUSTER_NAME_LINE = 16;
/** What a line keeps clear of on both sides in the top row of a box where the name is put. */
const NAME_GAP = 12;

type Rect = { x: number; y: number; w: number; h: number };

/** Draws one level of the clusters: the graph has no clusters left, only boxes of a given size. */
export type DrawLevel = (graph: Graph, ruler: Ruler, opts: LayoutOptions) => Layout;

const tidy = (v: number): number => {
  const r = Math.round(v * 1e6) / 1e6;
  return r === 0 ? 0 : r;
};

/** The graph without its clusters, for a medium that cannot draw them; edges that end at a cluster are dropped. */
export function flattenClusters(graph: Graph): Graph {
  const { clusters: _clusters, ...rest } = graph;
  const known = new Set(graph.nodes.map((n) => n.id));
  return {
    ...rest,
    nodes: graph.nodes.map(({ cluster: _cluster, ...n }) => n),
    edges: graph.edges.filter((e) => known.has(e.from) && known.has(e.to)),
  };
}

export const flattenedNote = (): Diagnostic => ({ kind: 'clusters-flattened-in-text', nodes: [], message: 'Clusters are drawn flat in text: the boxes around nodes are left out.' });

// ---------------------------------------------------------------------------------------------------------------
// The tree of clusters

interface Tree {
  /** Clusters that have nodes in them, by id. */
  label: Map<string, string>;
  setting: Map<string, { direction?: Direction; mirror?: 'RL' | 'BT' }>;
  parent: Map<string, string>;
  /** Cluster ids from the outermost one to `id` (itself last); empty for a node outside every cluster. */
  chain(id: string | undefined): string[];
  /** Ids of the clusters directly in `id` (the root is the empty string). */
  children: Map<string, string[]>;
}

function treeOf(graph: Graph): Tree {
  const all = new Map((graph.clusters ?? []).map((c) => [c.id, c] as const));
  const alive = new Set<string>();
  const parentOf = (id: string): string | undefined => {
    const p = all.get(id)?.parent;
    return p !== undefined && all.has(p) ? p : undefined;
  };
  for (const n of graph.nodes) {
    for (let c = n.cluster, i = 0; c !== undefined && all.has(c) && i <= all.size; c = parentOf(c), i++) alive.add(c);
  }
  const parent = new Map<string, string>();
  const children = new Map<string, string[]>();
  for (const c of graph.clusters ?? []) {
    if (!alive.has(c.id)) continue;
    const p = parentOf(c.id) ?? '';
    if (p !== '') parent.set(c.id, p);
    children.set(p, [...(children.get(p) ?? []), c.id]);
  }
  const chain = (id: string | undefined): string[] => {
    const out: string[] = [];
    for (let c = id, i = 0; c !== undefined && alive.has(c) && i <= all.size; c = parent.get(c), i++) out.unshift(c);
    return out;
  };
  return {
    label: new Map([...alive].map((id) => [id, all.get(id)?.label ?? id] as const)),
    setting: new Map([...alive].map((id) => {
      const c = all.get(id);
      return [id, { ...(c?.direction === undefined ? {} : { direction: c.direction }), ...(c?.mirror === undefined ? {} : { mirror: c.mirror }) }] as const;
    })),
    parent,
    chain,
    children,
  };
}

/** An edge, placed at the level of the innermost cluster that holds both of its ends. */
interface Routed {
  index: number;
  edge: GraphEdge;
  /** The cluster whose level draws the edge ('' is the top). */
  level: string;
  /** What the edge joins at that level: a node of the level, or a cluster box in it. */
  from: string;
  to: string;
}

function placeEdges(graph: Graph, tree: Tree): Routed[] {
  const nodeCluster = new Map(graph.nodes.map((n) => [n.id, n.cluster] as const));
  const isCluster = (id: string): boolean => tree.label.has(id);
  const pathOf = (id: string): string[] | undefined => (isCluster(id) ? tree.chain(id) : nodeCluster.has(id) ? tree.chain(nodeCluster.get(id)) : undefined);
  const out: Routed[] = [];
  graph.edges.forEach((edge, index) => {
    const pa = pathOf(edge.from);
    const pb = pathOf(edge.to);
    if (pa === undefined || pb === undefined) return;
    let k = 0;
    while (k < pa.length && k < pb.length && pa[k] === pb[k]) k++;
    // An edge between a cluster and something inside it has no place of its own.
    if ((isCluster(edge.from) && pa.length <= k) || (isCluster(edge.to) && pb.length <= k)) return;
    out.push({ index, edge, level: k > 0 ? (pa[k - 1] as string) : '', from: pa.length > k ? (pa[k] as string) : edge.from, to: pb.length > k ? (pb[k] as string) : edge.to });
  });
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Levels, drawn from the inside out

interface Block {
  layout: Layout;
  kids: Map<string, Block>;
  /** What the level draws (nodes, lines and labels), in the frame of its layout. */
  content: Rect;
  /** The least box a cluster needs around the content. */
  size: { w: number; h: number };
}

function contentOf(layout: Layout): Rect {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  const take = (x: number, y: number, w = 0, h = 0): void => {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x + w);
    y1 = Math.max(y1, y + h);
  };
  for (const n of layout.nodes) {
    take(n.x, n.y, n.w, n.h);
    if (n.outline) take(n.outline.x, n.outline.y, n.outline.w, n.outline.h);
  }
  for (const e of layout.edges) {
    for (const p of e.points) take(p.x, p.y);
    if (e.label) take(e.label.x, e.label.y, e.label.w, e.label.h);
  }
  return Number.isFinite(x0) ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : { x: 0, y: 0, w: 0, h: 0 };
}

const marker = (index: number): string => `\u0001${index}`;
const indexOfMarker = (id: string | undefined): number | undefined => (id !== undefined && id.startsWith('\u0001') ? Number(id.slice(1)) : undefined);

interface Plan {
  graph: Graph;
  ruler: Ruler;
  opts: LayoutOptions;
  draw: DrawLevel;
  tree: Tree;
  edges: Routed[];
  home: string;
  /** Clusters whose name is written on two lines: their name row is one line taller. */
  rows: ReadonlySet<string>;
}

/** The sizes child boxes grow to: the widest of a column (centres on one x, transitively) and the tallest of a row (centres on one y). Empty when nothing changes. */
function alignBoxes(layout: Layout, kids: Map<string, Block>): Map<string, { w: number; h: number }> {
  const boxes = layout.nodes.filter((n) => kids.has(n.id));
  const size = new Map(boxes.map((n) => [n.id, { w: (kids.get(n.id) as Block).size.w, h: (kids.get(n.id) as Block).size.h }] as const));
  const group = (overlap: (a: LayoutNode, b: LayoutNode) => boolean): LayoutNode[][] => {
    const root = boxes.map((_, i) => i);
    const find = (i: number): number => ((root[i] as number) === i ? i : (root[i] = find(root[i] as number)));
    boxes.forEach((a, i) => boxes.forEach((b, j) => {
      if (i < j && overlap(a, b)) root[find(j)] = find(i);
    }));
    const out = new Map<number, LayoutNode[]>();
    boxes.forEach((n, i) => out.set(find(i), [...(out.get(find(i)) ?? []), n]));
    return [...out.values()];
  };
  for (const col of group((a, b) => Math.abs(a.x + a.w / 2 - (b.x + b.w / 2)) < 1)) {
    const w = Math.max(...col.map((n) => (size.get(n.id) as { w: number }).w));
    for (const n of col) (size.get(n.id) as { w: number }).w = w;
  }
  for (const row of group((a, b) => Math.abs(a.y + a.h / 2 - (b.y + b.h / 2)) < 1)) {
    const h = Math.max(...row.map((n) => (size.get(n.id) as { h: number }).h));
    for (const n of row) (size.get(n.id) as { h: number }).h = h;
  }
  return new Map([...size].filter(([id, v]) => v.w !== (kids.get(id) as Block).size.w || v.h !== (kids.get(id) as Block).size.h));
}

/** Room between neighbouring boxes in a rank and between ranks: the default gap of the layered engine. */
const levelGap = (ruler: Ruler): number => layeredRuler(ruler).rankGap;

const shifted = (n: LayoutNode, x: number, y: number): LayoutNode => ({
  ...n,
  x: tidy(x),
  y: tidy(y),
  ...(n.outline ? { outline: { ...n.outline, x: tidy(n.outline.x + x - n.x), y: tidy(n.outline.y + y - n.y) } } : {}),
});

/**
 * A level with no line inside it is a grid, not a flow: the plain nodes first, in the order of the source, two to a row
 * (one row when there are fewer), in cells of the size of the largest one; the boxes of the clusters in it stand to the
 * right of them, one above the other with their tops and left sides aligned. With no plain nodes, three or more boxes
 * stand one above the other and fewer stand side by side. `drawn` only supplies the sizes the engine gives the nodes.
 */
function gridLevel(level: Graph, drawn: Layout, kids: Map<string, Block>, gap: number): Layout {
  const at = new Map(drawn.nodes.map((n) => [n.id, n] as const));
  const plain = level.nodes.filter((n) => !kids.has(n.id)).map((n) => at.get(n.id) as LayoutNode);
  const boxes = level.nodes.filter((n) => kids.has(n.id)).map((n) => at.get(n.id) as LayoutNode);
  const cols = plain.length <= 2 ? plain.length : 2;
  const cw = Math.max(0, ...plain.map((n) => n.w));
  const ch = Math.max(0, ...plain.map((n) => n.h));
  const rows = Math.ceil(plain.length / Math.max(1, cols));
  const placed: LayoutNode[] = plain.map((n, i) => shifted(n, (i % cols) * (cw + gap) + (cw - n.w) / 2, Math.floor(i / cols) * (ch + gap) + (ch - n.h) / 2));
  const stacked = plain.length > 0 || boxes.length >= 3;
  let x = plain.length > 0 ? cols * cw + (cols - 1) * gap + gap : 0;
  let y = 0;
  for (const b of boxes) {
    placed.push(shifted(b, x, y));
    if (stacked) y += b.h + gap;
    else x += b.w + gap;
  }
  const order = new Map(level.nodes.map((n, i) => [n.id, i] as const));
  const nodes = placed.sort((a, b) => (order.get(a.id) as number) - (order.get(b.id) as number));
  const right = Math.max(...nodes.map((n) => n.x + n.w));
  const bottom = Math.max(...nodes.map((n) => n.y + n.h));
  return { ...drawn, nodes, edges: [], lanes: [], width: tidy(right), height: tidy(Math.max(bottom, rows * ch)) };
}

/**
 * Plain nodes no line touches that are as big as, and shaped like, a node of the first rank stand in that rank after its
 * members, in the order of the source, instead of wherever the engine packs loose nodes. The level is drawn again
 * without them, so they take no room in the flow; when that changes the size of the first rank, the first drawing stays.
 */
function joinFirstRank(level: Graph, full: Layout, engine: (g: Graph) => Layout, touched: ReadonlySet<string>, kids: Map<string, Block>, gap: number): Layout {
  const lonely = (id: string): boolean => !touched.has(id) && !kids.has(id);
  const connected = full.nodes.filter((n) => !lonely(n.id));
  if (connected.length === 0 || connected.length === full.nodes.length) return full;
  const top = Math.min(...connected.map((n) => n.rank));
  const alike = (a: LayoutNode, b: LayoutNode): boolean => a.shape === b.shape && a.w === b.w && a.h === b.h;
  const first = connected.filter((n) => n.rank === top);
  const joiners = level.nodes.flatMap((n) => {
    const l = full.nodes.find((m) => m.id === n.id) as LayoutNode;
    return lonely(n.id) && first.some((f) => alike(f, l)) ? [l] : [];
  });
  if (joiners.length === 0) return full;
  const gone = new Set(joiners.map((n) => n.id));
  const laid = engine({ ...level, nodes: level.nodes.filter((n) => !gone.has(n.id)) });
  const row = laid.nodes.filter((n) => n.rank === Math.min(...laid.nodes.map((m) => m.rank)));
  const td = level.direction === 'TD';
  const anchors = (j: LayoutNode): LayoutNode | undefined => row.find((f) => alike(f, j));
  if (joiners.some((j) => anchors(j) === undefined)) return full;
  const home = anchors(joiners[0] as LayoutNode) as LayoutNode;
  const line = row.filter((n) => (td ? Math.abs(n.y - home.y) : Math.abs(n.x - home.x)) < 1);
  let at = Math.max(...line.map((n) => (td ? n.x + n.w : n.y + n.h))) + gap;
  const added = joiners.map((j) => {
    const n = shifted({ ...j, rank: home.rank, row: home.row }, td ? at : home.x, td ? home.y : at);
    at += (td ? j.w : j.h) + gap;
    return n;
  });
  const box = contentOf(laid);
  const room = { x: laid.width - box.x - box.w, y: laid.height - box.y - box.h };
  const extent = Math.max(...added.map((n) => (td ? n.x + n.w : n.y + n.h)));
  return {
    ...laid,
    nodes: [...laid.nodes, ...added],
    width: td ? Math.max(laid.width, tidy(extent + room.x)) : laid.width,
    height: td ? laid.height : Math.max(laid.height, tidy(extent + room.y)),
  };
}

/** Height of the row at the top of a cluster that holds its name. */
const rowOf = (plan: Plan, id: string): number => CLUSTER_NAME_ROW + (plan.rows.has(id) ? CLUSTER_NAME_LINE : 0);

function buildLevel(plan: Plan, id: string, direction: Direction, mirror: 'RL' | 'BT' | undefined): Block {
  const { graph, ruler, tree } = plan;
  const kids = new Map<string, Block>();
  for (const c of tree.children.get(id) ?? []) {
    const own = tree.setting.get(c) ?? {};
    kids.set(c, buildLevel(plan, c, own.direction ?? direction, own.direction === undefined ? mirror : own.mirror));
  }
  // The nodes of the level in the order of the source; a cluster stands where its first node stands.
  const nodes: GraphNode[] = [];
  const seen = new Set<string>();
  for (const n of graph.nodes) {
    const path = tree.chain(n.cluster);
    const depth = id === '' ? 0 : path.indexOf(id) + 1;
    if (id !== '' && depth === 0) continue;
    const key = path.length > depth ? (path[depth] as string) : n.id;
    if (seen.has(key)) continue;
    seen.add(key);
    if (path.length > depth) {
      const size = (kids.get(key) as Block).size;
      nodes.push({ id: key, title: tree.label.get(key) ?? key, lines: [], shape: 'rect', lane: plan.home, box: size });
    } else {
      const { cluster: _cluster, ...rest } = n;
      nodes.push({ ...rest, lane: plan.home });
    }
  }
  const here = plan.edges.filter((r) => r.level === id);
  // While a line is written to or from a subgraph, the lines of its nodes between two boxes do not decide the ranks of the boxes.
  const subgraphLevel = here.some((r) => tree.label.has(r.edge.from) || tree.label.has(r.edge.to));
  const edges: GraphEdge[] = here.map(({ index, edge, from, to }) => {
    const { id: _id, ...rest } = edge;
    const lifted = from !== to && tree.label.has(from) && tree.label.has(to) && from !== edge.from && to !== edge.to;
    return { ...rest, from, to, id: marker(index), ...(subgraphLevel && lifted ? { unranked: true as const } : {}) };
  });
  const level: Graph = { direction, ...(mirror === undefined ? {} : { mirror }), lanes: graph.lanes.slice(0, 1), nodes, edges };
  const { maxWidth, maxHeight, ...rest } = plan.opts;
  const root = id === '';
  const engine = (g: Graph): Layout => plan.draw(g, ruler, { ...rest, engine: 'layered', legend: false, questions: false, ...(root ? { ...(maxWidth === undefined ? {} : { maxWidth }), ...(maxHeight === undefined ? {} : { maxHeight }) } : { maxWidth: Infinity }) });
  const touched = new Set(graph.edges.flatMap((e) => [e.from, e.to]));
  const drawLevel = (g: Graph): Layout => {
    const full = engine(g);
    if (!root && g.edges.length === 0 && g.nodes.every((n) => n.attach === undefined)) return gridLevel(g, full, kids, levelGap(ruler));
    return joinFirstRank(g, full, engine, touched, kids, levelGap(ruler));
  };
  let layout = drawLevel(level);
  // Boxes that stand one above the other share their width, boxes side by side share their height; the level is drawn once more with the grown boxes.
  const grown = alignBoxes(layout, kids);
  if (grown.size > 0) {
    layout = drawLevel({ ...level, nodes: nodes.map((n) => (grown.has(n.id) ? { ...n, box: grown.get(n.id) as { w: number; h: number } } : n)) });
    for (const [c, box] of grown) kids.set(c, { ...(kids.get(c) as Block), size: box });
  }
  const content = contentOf(layout);
  const name =ruler.textWidth(tree.label.get(id) ?? '', 'lane') + 2 * CLUSTER_NAME_INSET;
  const size = {
    w: gridUp(ruler, Math.max(content.w + 2 * CLUSTER_PAD, name)),
    h: gridUp(ruler, content.h + rowOf(plan, id) + 2 * CLUSTER_PAD),
  };
  return { layout, kids, content, size };
}

// ---------------------------------------------------------------------------------------------------------------
// Putting the levels together

interface Assembled {
  nodes: Map<string, LayoutNode>;
  clusters: LayoutCluster[];
  clusterRect: Map<string, Rect>;
  pieces: Map<number, LayoutEdge>;
  diagnostics: Diagnostic[];
}

function assemble(plan: Plan, block: Block, dx: number, dy: number, depth: number, out: Assembled): void {
  const home = new Map(plan.graph.nodes.map((n) => [n.id, n.cluster] as const));
  for (const n of block.layout.nodes) {
    const kid = block.kids.get(n.id);
    if (kid === undefined) {
      const cluster = home.get(n.id);
      out.nodes.set(n.id, {
        ...n,
        x: tidy(n.x + dx),
        y: tidy(n.y + dy),
        ...(n.outline ? { outline: { ...n.outline, x: tidy(n.outline.x + dx), y: tidy(n.outline.y + dy) } } : {}),
        ...(cluster === undefined ? {} : { cluster }),
      });
      continue;
    }
    const box: Rect = { x: tidy(n.x + dx), y: tidy(n.y + dy), w: n.w, h: n.h };
    const style = plan.graph.clusters?.find((c) => c.id === n.id)?.style;
    out.clusters.push({ id: n.id, label: plan.tree.label.get(n.id) ?? n.id, ...box, depth, ...(style === undefined ? {} : { style }) });
    out.clusterRect.set(n.id, box);
    // The content stands in the middle of the room the box leaves it.
    const kx = Math.round(box.x + CLUSTER_PAD + (box.w - 2 * CLUSTER_PAD - kid.content.w) / 2 - kid.content.x);
    const row = rowOf(plan, n.id);
    const ky = Math.round(box.y + row + CLUSTER_PAD + (box.h - row - 2 * CLUSTER_PAD - kid.content.h) / 2 - kid.content.y);
    assemble(plan, kid, kx, ky, depth + 1, out);
  }
  for (const e of block.layout.edges) {
    const index = indexOfMarker(e.id);
    if (index === undefined) continue;
    out.pieces.set(index, {
      ...e,
      points: e.points.map((p) => ({ x: tidy(p.x + dx), y: tidy(p.y + dy) })),
      ...(e.label ? { label: { ...e.label, x: tidy(e.label.x + dx), y: tidy(e.label.y + dy) } } : {}),
    });
  }
  out.diagnostics.push(...block.layout.diagnostics);
}

// ---------------------------------------------------------------------------------------------------------------
// Lines that go into a cluster: from the border to the node or box they end at

interface Seg {
  a: Point;
  b: Point;
}

const EPS = 1e-6;
const DIRS: ReadonlyArray<Point> = [
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 0, y: -1 },
];
/** Prices of a bend, of crossing a line that is already drawn, and of each pixel run along one. */
const BEND_COST = 24;
const CROSS_COST = 60;
const OVERLAP_COST = 2;
/** A line stays this far from a node it passes, and from a box it does not enter. */
const CLEAR = 6;
const FACE_SHARE = 0.3;

function segmentsOf(points: Point[]): Seg[] {
  const out: Seg[] = [];
  for (let i = 0; i + 1 < points.length; i++) out.push({ a: points[i] as Point, b: points[i + 1] as Point });
  return out;
}

/** True when the axis-aligned segment passes through the open inside of the rectangle. */
function through(a: Point, b: Point, r: Rect, grow: number): boolean {
  const x0 = r.x - grow;
  const y0 = r.y - grow;
  const x1 = r.x + r.w + grow;
  const y1 = r.y + r.h + grow;
  return Math.min(a.x, b.x) < x1 - EPS && Math.max(a.x, b.x) > x0 + EPS && Math.min(a.y, b.y) < y1 - EPS && Math.max(a.y, b.y) > y0 + EPS;
}

/** How much a segment crosses or runs along the lines that are already drawn. */
function clash(a: Point, b: Point, drawn: Seg[]): number {
  let cost = 0;
  const horizontal = Math.abs(a.y - b.y) < EPS;
  for (const s of drawn) {
    const sh = Math.abs(s.a.y - s.b.y) < EPS;
    if (sh === horizontal) {
      // Lines closer than a pitch cost as much as lines on top of each other.
      if (horizontal && Math.abs(s.a.y - a.y) < FACE_PITCH - EPS) {
        const lap = Math.min(Math.max(a.x, b.x), Math.max(s.a.x, s.b.x)) - Math.max(Math.min(a.x, b.x), Math.min(s.a.x, s.b.x));
        if (lap > EPS) cost += OVERLAP_COST * lap;
      } else if (!horizontal && Math.abs(s.a.x - a.x) < FACE_PITCH - EPS) {
        const lap = Math.min(Math.max(a.y, b.y), Math.max(s.a.y, s.b.y)) - Math.max(Math.min(a.y, b.y), Math.min(s.a.y, s.b.y));
        if (lap > EPS) cost += OVERLAP_COST * lap;
      }
      continue;
    }
    const [h, v] = horizontal ? [{ a, b }, s] : [s, { a, b }];
    const x = v.a.x;
    const y = h.a.y;
    if (x > Math.min(h.a.x, h.b.x) + EPS && x < Math.max(h.a.x, h.b.x) - EPS && y > Math.min(v.a.y, v.b.y) + EPS && y < Math.max(v.a.y, v.b.y) - EPS) cost += CROSS_COST;
  }
  return cost;
}

/** A binary heap of numbers keyed by cost. */
class Heap {
  private readonly cost: number[] = [];
  private readonly item: number[] = [];
  get size(): number {
    return this.item.length;
  }
  push(cost: number, item: number): void {
    let i = this.item.length;
    this.cost.push(cost);
    this.item.push(item);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if ((this.cost[p] as number) <= cost) break;
      this.swap(i, p);
      i = p;
    }
  }
  pop(): { cost: number; item: number } {
    const top = { cost: this.cost[0] as number, item: this.item[0] as number };
    const lastCost = this.cost.pop() as number;
    const lastItem = this.item.pop() as number;
    if (this.item.length > 0) {
      this.cost[0] = lastCost;
      this.item[0] = lastItem;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < this.item.length && (this.cost[l] as number) < (this.cost[m] as number)) m = l;
        if (r < this.item.length && (this.cost[r] as number) < (this.cost[m] as number)) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }
  private swap(i: number, j: number): void {
    [this.cost[i], this.cost[j]] = [this.cost[j] as number, this.cost[i] as number];
    [this.item[i], this.item[j]] = [this.item[j] as number, this.item[i] as number];
  }
}

interface Inside {
  /** The box of the cluster the line enters; the line stays inside it. */
  region: Rect;
  /** Where the line meets the border, and the unit step that leads into the cluster. */
  start: Point;
  inward: number;
  /** What the line ends at. */
  target: Rect;
  /** Nodes and boxes the line must go round. */
  obstacles: Rect[];
  /** Boxes the line may run along but not enter. */
  walls?: Rect[];
  /** Lines already drawn. */
  drawn: Seg[];
  /** Points of the target that other lines already end at. */
  taken: Set<string>;
}

const key = (p: Point): string => `${Math.round(p.x * 100)},${Math.round(p.y * 100)}`;

/** The coordinates a line may turn at, from the sides of the obstacles to the corridors along the border. */
function candidates(values: number[], lo: number, hi: number, must: number[]): number[] {
  const kept = values.filter((v) => v >= lo - EPS && v <= hi + EPS);
  const edges = [...new Set(kept.map((v) => Math.round(v * 2) / 2))].sort((a, b) => a - b);
  const mids: number[] = [];
  for (let i = 0; i + 1 < edges.length; i++) {
    const gap = (edges[i + 1] as number) - (edges[i] as number);
    if (gap >= 2 * CORRIDOR) mids.push((edges[i] as number) + gap / 2);
  }
  return [...new Set([...edges, ...mids, ...must].map((v) => Math.round(v * 2) / 2))].sort((a, b) => a - b);
}

/** The orthogonal path inside a cluster from its border to a face of the target, round everything else; undefined when none exists. */
function pathInside(g: Inside): Point[] | undefined {
  const { region, start, target } = g;
  const faces: Array<{ p: Point; dir: number }> = [];
  for (const f of [0.5, FACE_SHARE, 1 - FACE_SHARE]) {
    faces.push({ p: { x: target.x + target.w * f, y: target.y }, dir: 1 });
    faces.push({ p: { x: target.x + target.w * f, y: target.y + target.h }, dir: 3 });
    faces.push({ p: { x: target.x, y: target.y + target.h * f }, dir: 0 });
    faces.push({ p: { x: target.x + target.w, y: target.y + target.h * f }, dir: 2 });
  }
  const lo = { x: region.x + CORRIDOR, y: region.y + CORRIDOR };
  const hi = { x: region.x + region.w - CORRIDOR, y: region.y + region.h - CORRIDOR };
  const near = (r: Rect): boolean => r.x < region.x + region.w && r.x + r.w > region.x && r.y < region.y + region.h && r.y + r.h > region.y;
  const obstacles = g.obstacles.filter(near);
  const walls = (g.walls ?? []).filter(near);
  const rx = [lo.x, hi.x, ...walls.flatMap((o) => [o.x - CORRIDOR, o.x + o.w + CORRIDOR, o.x, o.x + o.w]), ...obstacles.flatMap((o) => [o.x - CORRIDOR, o.x + o.w + CORRIDOR, o.x, o.x + o.w]), target.x - CORRIDOR, target.x + target.w + CORRIDOR];
  const ry = [lo.y, hi.y, ...walls.flatMap((o) => [o.y - CORRIDOR, o.y + o.h + CORRIDOR, o.y, o.y + o.h]), ...obstacles.flatMap((o) => [o.y - CORRIDOR, o.y + o.h + CORRIDOR, o.y, o.y + o.h]), target.y - CORRIDOR, target.y + target.h + CORRIDOR];
  const xs = candidates(rx, lo.x, hi.x, [start.x, ...faces.map((f) => f.p.x)]);
  const ys = candidates(ry, lo.y, hi.y, [start.y, ...faces.map((f) => f.p.y)]);
  const nx = xs.length;
  const at = (xi: number, yi: number): number => yi * nx + xi;
  const indexIn = (list: number[], v: number): number => list.findIndex((c) => Math.abs(c - Math.round(v * 2) / 2) < EPS);
  const s0 = at(indexIn(xs, start.x), indexIn(ys, start.y));
  const goal = new Map<number, { dir: number; price: number }>();
  for (const f of faces) {
    const price = g.taken.has(key(f.p)) ? 40 : 0;
    goal.set(at(indexIn(xs, f.p.x), indexIn(ys, f.p.y)) * 4 + f.dir, { dir: f.dir, price });
  }
  // A point of the grid is free when it lies inside the corridors, or is the place the line starts.
  const free = (xi: number, yi: number): boolean => {
    if (at(xi, yi) === s0) return true;
    const x = xs[xi] as number;
    const y = ys[yi] as number;
    return x >= lo.x - EPS && x <= hi.x + EPS && y >= lo.y - EPS && y <= hi.y + EPS;
  };
  const dist = new Float64Array(xs.length * ys.length * 4).fill(Infinity);
  const from = new Int32Array(dist.length).fill(-1);
  const heap = new Heap();
  const first = s0 * 4 + g.inward;
  dist[first] = 0;
  heap.push(0, first);
  while (heap.size > 0) {
    const { cost, item } = heap.pop();
    if (cost > (dist[item] as number)) continue;
    if (goal.has(item) && item !== first) {
      const out: Point[] = [];
      for (let s = item; s >= 0; s = from[s] as number) {
        const cell = Math.floor(s / 4);
        out.unshift({ x: xs[cell % nx] as number, y: ys[Math.floor(cell / nx)] as number });
      }
      out[0] = start;
      return out;
    }
    const cell = Math.floor(item / 4);
    const xi = cell % nx;
    const yi = Math.floor(cell / nx);
    const d = item % 4;
    for (const nd of [d, (d + 1) % 4, (d + 3) % 4]) {
      // The line leaves the border straight.
      if (cell === s0 && nd !== g.inward) continue;
      const step = DIRS[nd] as Point;
      const mx = xi + step.x;
      const my = yi + step.y;
      if (mx < 0 || my < 0 || mx >= nx || my >= ys.length || !free(mx, my)) continue;
      const a: Point = { x: xs[xi] as number, y: ys[yi] as number };
      const b: Point = { x: xs[mx] as number, y: ys[my] as number };
      const next = at(mx, my) * 4 + nd;
      const arrival = goal.get(next);
      if (obstacles.some((o) => through(a, b, o, CLEAR)) || walls.some((o) => through(a, b, o, 0))) continue;
      if (arrival === undefined && through(a, b, target, 2)) continue;
      const len = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
      const total = cost + len + (nd === d ? 0 : BEND_COST) + clash(a, b, g.drawn) + (arrival?.price ?? 0);
      if (total < (dist[next] as number)) {
        dist[next] = total;
        from[next] = item;
        heap.push(total, next);
      }
    }
  }
  return undefined;
}

/** A path with the repeated points and the points in the middle of a straight run taken out. */
function tighten(points: Point[]): Point[] {
  const out: Point[] = [];
  for (const p of points) {
    const last = out.at(-1);
    if (last !== undefined && Math.abs(last.x - p.x) < EPS && Math.abs(last.y - p.y) < EPS) continue;
    out.push(p);
  }
  for (let i = out.length - 2; i > 0; i--) {
    const a = out[i - 1] as Point;
    const b = out[i] as Point;
    const c = out[i + 1] as Point;
    if ((Math.abs(a.x - b.x) < EPS && Math.abs(b.x - c.x) < EPS) || (Math.abs(a.y - b.y) < EPS && Math.abs(b.y - c.y) < EPS)) out.splice(i, 1);
  }
  return out;
}

const dirOf = (from: Point, to: Point): number => {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  return Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 0 : 2) : dy >= 0 ? 1 : 3;
};

/** A line slid along a cluster face stays this far from the corners of the box, and keeps this much of its run before and after a jog. */
const FACE_CLEAR = 20;
const JOG = 24;
/** Distance between two lines that meet the same face of a cluster box. */
const FACE_PITCH = 8;

interface Slide {
  box: Rect;
  target: Rect;
  /** Lines of the other edges. */
  others: Seg[];
  /** Where the other edges meet the borders of boxes. */
  meets: Point[];
  /** What a line may not pass through. */
  obstacles: Rect[];
  /** What stands between the border and the target inside the box: a line that cannot run straight to the target stays where it is. */
  inner: Rect[];
  label?: Rect;
}

/**
 * The line `points`, which ends on a border of the box `box`, made to meet that border level with the centre of
 * `target` (the node or box it goes on to inside), so that what lies inside is one straight stretch; when something
 * stands in the way of that stretch the line stays as it was. The meeting
 * point takes the nearest free place a pitch apart from the others on that face, clear of the corners. A line that
 * cannot move without passing through a box, crossing more lines than before, or leaving its label behind stays as it was.
 */
function slideEnd(points: Point[], g: Slide): Point[] {
  const n = points.length;
  if (n < 2) return points;
  const b = points[n - 1] as Point;
  const a = points[n - 2] as Point;
  const { box, target } = g;
  const onX = Math.abs(b.x - box.x) < EPS || Math.abs(b.x - (box.x + box.w)) < EPS;
  const onY = Math.abs(b.y - box.y) < EPS || Math.abs(b.y - (box.y + box.h)) < EPS;
  if (onX === onY) return points;
  const along = (p: Point): number => (onX ? p.y : p.x);
  const across = (p: Point): number => (onX ? p.x : p.y);
  const at = (al: number, ac: number): Point => (onX ? { x: ac, y: al } : { x: al, y: ac });
  const lo = (onX ? box.y : box.x) + FACE_CLEAR;
  const hi = (onX ? box.y + box.h : box.x + box.w) - FACE_CLEAR;
  if (hi < lo) return points;
  const centre = onX ? target.y + target.h / 2 : target.x + target.w / 2;
  if (centre < lo - EPS || centre > hi + EPS) return points;
  const reach = onX ? (across(b) < target.x ? target.x : target.x + target.w) : across(b) < target.y ? target.y : target.y + target.h;
  const run = [at(centre, across(b)), at(centre, reach)] as const;
  if (g.inner.some((o) => through(run[0], run[1], o, 0))) return points;
  const sameFace = g.meets.filter((m) => Math.abs(across(m) - across(b)) < EPS);
  let chosen: number | undefined;
  for (let k = 0; k <= 6 && chosen === undefined; k++) {
    for (const sign of k === 0 ? [0] : [1, -1]) {
      const v = centre + sign * k * FACE_PITCH;
      if (v >= lo - EPS && v <= hi + EPS && sameFace.every((m) => Math.abs(along(m) - v) >= FACE_PITCH - EPS)) {
        chosen = v;
        break;
      }
    }
  }
  if (chosen === undefined || Math.abs(along(b) - chosen) < EPS) return points;
  const label = g.label;
  const touches = (p: Point, q: Point): boolean => label !== undefined && Math.min(p.x, q.x) < label.x + label.w + 1 && Math.max(p.x, q.x) > label.x - 1 && Math.min(p.y, q.y) < label.y + label.h + 1 && Math.max(p.y, q.y) > label.y - 1;
  let moved: Point[];
  let changed: Point[];
  if (n === 2) {
    const span = Math.abs(across(a) - across(b));
    const room = label === undefined ? 0 : (onX ? label.w : label.h) + 16;
    if (span < 2 * JOG + room) return points;
    const jog = across(b) + (across(a) < across(b) ? -JOG : JOG);
    moved = [a, at(along(a), jog), at(chosen, jog), at(chosen, across(b))];
    changed = moved;
    if (Math.abs(along(a) - chosen) < EPS) {
      moved = [a, at(chosen, across(b))];
      changed = moved;
    }
  } else {
    const c = points[n - 3] as Point;
    if (Math.abs(across(c) - across(a)) > EPS || Math.abs(along(a) - along(b)) > EPS) return points;
    if (touches(c, a) || touches(a, b)) return points;
    const [na, nb] = [at(chosen, across(a)), at(chosen, across(b))];
    moved = [...points.slice(0, n - 2), na, nb];
    changed = [c, na, nb];
  }
  const before = n === 2 ? [a, b] : [points[n - 3] as Point, a, b];
  const price = (path: Point[]): number => segmentsOf(path).reduce((sum, s) => sum + clash(s.a, s.b, g.others), 0);
  if (price(changed) > price(before) + EPS) return points;
  if (segmentsOf(changed).some((s) => g.obstacles.some((o) => through(s.a, s.b, o, 0)))) return points;
  return moved;
}

type Face = 'top' | 'bottom' | 'left' | 'right';

const faceOfPoint = (p: Point, box: Rect): Face | undefined => {
  const within = (v: number, lo: number, hi: number): boolean => v > lo - EPS && v < hi + EPS;
  if (Math.abs(p.y - box.y) < EPS && within(p.x, box.x, box.x + box.w)) return 'top';
  if (Math.abs(p.y - (box.y + box.h)) < EPS && within(p.x, box.x, box.x + box.w)) return 'bottom';
  if (Math.abs(p.x - box.x) < EPS && within(p.y, box.y, box.y + box.h)) return 'left';
  if (Math.abs(p.x - (box.x + box.w)) < EPS && within(p.y, box.y, box.y + box.h)) return 'right';
  return undefined;
};

const opposite = (f: Face): Face => (f === 'top' ? 'bottom' : f === 'bottom' ? 'top' : f === 'left' ? 'right' : 'left');

/** The faces a line between `target` (inside a cluster) and `other` (outside it) may use at `target`: the one that points at `other`, then the two across it, the one on the side of `other` first. */
function exitFaces(target: Rect, other: Rect): Face[] {
  const dx = other.x + other.w / 2 - (target.x + target.w / 2);
  const dy = other.y + other.h / 2 - (target.y + target.h / 2);
  const vertical: Face = dy < 0 ? 'top' : 'bottom';
  const horizontal: Face = dx < 0 ? 'left' : 'right';
  return Math.abs(dy) >= Math.abs(dx) ? [vertical, horizontal, opposite(horizontal)] : [horizontal, vertical, opposite(vertical)];
}

/** Where along `face` a straight line between the face of `target` and the border of `box` may stand: on the face of the node, clear of the corners of both. */
function exitRange(face: Face, box: Rect, target: Rect): [number, number] | undefined {
  const flat = face === 'top' || face === 'bottom';
  const lo = Math.max((flat ? box.x : box.y) + FACE_CLEAR, (flat ? target.x : target.y) + FACE_CLEAR);
  const hi = Math.min((flat ? box.x + box.w : box.y + box.h) - FACE_CLEAR, (flat ? target.x + target.w : target.y + target.h) - FACE_CLEAR);
  return lo <= hi + EPS ? [lo, hi] : undefined;
}

/** The ends of the straight line at `v` along `face`: on the face of `target`, and on the border of `box`. */
function exitEnds(face: Face, v: number, box: Rect, target: Rect): { inner: Point; border: Point } {
  switch (face) {
    case 'top':
      return { inner: { x: v, y: target.y }, border: { x: v, y: box.y } };
    case 'bottom':
      return { inner: { x: v, y: target.y + target.h }, border: { x: v, y: box.y + box.h } };
    case 'left':
      return { inner: { x: target.x, y: v }, border: { x: box.x, y: v } };
    default:
      return { inner: { x: target.x + target.w, y: v }, border: { x: box.x + box.w, y: v } };
  }
}

/** The lanes beside a face: a corridor from the border, then a pitch further each time. */
const lanesOf = (face: Face, box: Rect): number[] => {
  const edge = face === 'top' ? box.y : face === 'bottom' ? box.y + box.h : face === 'left' ? box.x : box.x + box.w;
  const way = face === 'top' || face === 'left' ? -1 : 1;
  return [0, 1, 2, 3].map((k) => edge + way * (CORRIDOR + k * FACE_PITCH));
};

/** Where along the face the line `forward` goes up to the lane `lane` before it is led to the face: the place it crosses the lane. */
function crossingAlong(forward: Point[], lane: number, flat: boolean): number | undefined {
  for (let i = forward.length - 2; i >= 0; i--) {
    const a = forward[i] as Point;
    const c = forward[i + 1] as Point;
    if (flat ? Math.abs(a.x - c.x) < EPS && Math.min(a.y, c.y) + EPS < lane && lane < Math.max(a.y, c.y) - EPS : Math.abs(a.y - c.y) < EPS && Math.min(a.x, c.x) + EPS < lane && lane < Math.max(a.x, c.x) - EPS) return flat ? a.x : a.y;
  }
  return undefined;
}

/** `forward` cut where it crosses the lane (a horizontal one when `flat`), and led along the lane to `stub` and on to `q`; undefined when a box stands in the way. */
function joinAt(forward: Point[], lane: number, flat: boolean, stub: Point, q: Point, obstacles: Rect[]): Point[] | undefined {
  for (let i = forward.length - 2; i >= 0; i--) {
    const a = forward[i] as Point;
    const c = forward[i + 1] as Point;
    // The lane runs across the face: a line that crosses it is a stretch that runs along the normal of the face.
    const crossing = flat ? Math.abs(a.x - c.x) < EPS && Math.min(a.y, c.y) + EPS < lane && lane < Math.max(a.y, c.y) - EPS : Math.abs(a.y - c.y) < EPS && Math.min(a.x, c.x) + EPS < lane && lane < Math.max(a.x, c.x) - EPS;
    if (!crossing) continue;
    const joint: Point = flat ? { x: a.x, y: lane } : { x: lane, y: a.y };
    const added = [joint, stub, q];
    const free = [[joint, stub], [stub, q]].every(([p, r]) => obstacles.every((o) => !through(p as Point, r as Point, o, 0)));
    if (free) return [...forward.slice(0, i + 1), ...added];
  }
  return undefined;
}

/** A path that ignores everything but the target, when none goes round it. */
function straightIn(start: Point, inward: number, target: Rect): Point[] {
  const mid = { x: target.x + target.w / 2, y: target.y + target.h / 2 };
  return inward % 2 === 1 ? [start, { x: start.x, y: mid.y }, { x: mid.x, y: mid.y }] : [start, { x: mid.x, y: start.y }, { x: mid.x, y: mid.y }];
}

/** Room kept between the drawing and the edge of the canvas when a line or a label has to go past it. */
const EDGE_ROOM = 8;

/** The layout with the canvas grown, and everything moved, where a line or a label went past its edge; as it was otherwise. */
function withinCanvas(layout: Layout): Layout {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  const take = (x: number, y: number, w = 0, h = 0): void => {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x + w);
    y1 = Math.max(y1, y + h);
  };
  for (const e of layout.edges) {
    for (const p of e.points) take(p.x, p.y);
    for (const t of [e.label, e.startLabel, e.endLabel]) if (t) take(t.x, t.y, t.w, t.h);
  }
  const dx = Math.max(0, EDGE_ROOM - x0);
  const dy = Math.max(0, EDGE_ROOM - y0);
  const width = Math.max(layout.width + dx, x1 + dx + EDGE_ROOM);
  const height = Math.max(layout.height + dy, y1 + dy + EDGE_ROOM);
  if (dx === 0 && dy === 0 && width === layout.width && height === layout.height) return layout;
  const move = <T extends { x: number; y: number }>(t: T): T => ({ ...t, x: tidy(t.x + dx), y: tidy(t.y + dy) });
  return {
    ...layout,
    width: tidy(width),
    height: tidy(height),
    nodes: layout.nodes.map((n) => ({ ...move(n), ...(n.outline ? { outline: move(n.outline) } : {}) })),
    clusters: (layout.clusters ?? []).map(move),
    lanes: layout.lanes.map((l) => ({ ...move(l), ...(l.labelBox ? { labelBox: move(l.labelBox) } : {}) })),
    edges: layout.edges.map((e) => ({
      ...e,
      points: e.points.map((p) => ({ x: tidy(p.x + dx), y: tidy(p.y + dy) })),
      ...(e.label ? { label: move(e.label) } : {}),
      ...(e.startLabel ? { startLabel: move(e.startLabel) } : {}),
      ...(e.endLabel ? { endLabel: move(e.endLabel) } : {}),
    })),
  };
}

// ---------------------------------------------------------------------------------------------------------------
// The names of the clusters

const NAME_FONT = 12;

/** The gaps of [from, to] that the intervals leave free, left to right. */
function gapsOf(from: number, to: number, taken: Array<[number, number]>): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let at = from;
  for (const [a, b] of [...taken].sort((p, q) => p[0] - q[0])) {
    if (a > at) out.push([at, Math.min(a, to)]);
    at = Math.max(at, b);
    if (at >= to) break;
  }
  if (at < to) out.push([at, to]);
  return out.filter(([a, b]) => b > a);
}

/**
 * Puts the name of every cluster in the top row of its box, in a gap between the lines that cross that row: the
 * first gap from the left where the whole text fits; else, when the name has a type after " · ", on two lines in the
 * taller row of `rows` (a cluster not yet in `rows` is reported in `need`); else at the left over a knockout of the
 * fill, so that the line is seen to stop at the name.
 */
function placeNames(layout: Layout, ruler: Ruler, rows: ReadonlySet<string>): { clusters: LayoutCluster[]; need: Set<string> } {
  const need = new Set<string>();
  const segs = layout.edges.filter((e) => !e.invisible).flatMap((e) => e.points.slice(1).map((q, i) => [e.points[i] as Point, q] as const));
  const labels = layout.edges.flatMap((e) => (e.label ? [e.label] : []));
  const clusters = (layout.clusters ?? []).map((c) => {
    const row = CLUSTER_NAME_ROW + (rows.has(c.id) ? CLUSTER_NAME_LINE : 0);
    const taken: Array<[number, number]> = [];
    for (const [a, b] of segs) {
      if (Math.abs(a.y - b.y) < EPS) {
        if (a.y >= c.y - EPS && a.y <= c.y + row + EPS && Math.max(a.x, b.x) > c.x && Math.min(a.x, b.x) < c.x + c.w) taken.push([Math.min(a.x, b.x) - NAME_GAP, Math.max(a.x, b.x) + NAME_GAP]);
      } else if (a.x > c.x && a.x < c.x + c.w && Math.max(a.y, b.y) > c.y && Math.min(a.y, b.y) < c.y + row) taken.push([a.x - NAME_GAP, a.x + NAME_GAP]);
    }
    // A label counts where it reaches the text of the name, not where it only reaches over the border.
    for (const t of labels) if (t.y < c.y + NAME_FONT + row - CLUSTER_NAME_ROW + 16 && t.y + t.h > c.y + NAME_FONT && t.x + t.w > c.x && t.x < c.x + c.w) taken.push([t.x - NAME_GAP, t.x + t.w + NAME_GAP]);
    const gaps = gapsOf(c.x, c.x + c.w, taken);
    const at = (lines: string[]): { x: number; w: number } | undefined => {
      const w = Math.max(...lines.map((l) => ruler.textWidth(l, 'lane')));
      for (const [a, b] of gaps) {
        const x = a <= c.x + EPS ? c.x + CLUSTER_NAME_INSET : a;
        if (x + w <= (b >= c.x + c.w - EPS ? b - NAME_GAP : b) + EPS) return { x, w };
      }
      return undefined;
    };
    const whole = [c.label];
    const parts = c.label.split(' \u00b7 ');
    const split = parts.length > 1 ? [parts[0] as string, parts.slice(1).join(' \u00b7 ')] : undefined;
    const one = at(whole);
    const two = rows.has(c.id) && split !== undefined ? at(split) : undefined;
    const choice = one !== undefined ? { ...one, lines: whole, knockout: false } : two !== undefined && split !== undefined ? { ...two, lines: split, knockout: false } : undefined;
    if (choice === undefined && split !== undefined && !rows.has(c.id)) need.add(c.id);
    const lines = choice?.lines ?? whole;
    const w = choice?.w ?? ruler.textWidth(c.label, 'lane');
    const name = { x: choice?.x ?? c.x + CLUSTER_NAME_INSET, y: c.y + NAME_FONT, w, h: 16 * lines.length, lines, ...(choice === undefined ? { knockout: true } : {}) };
    return { ...c, name };
  });
  return { clusters, need };
}

// ---------------------------------------------------------------------------------------------------------------

/**
 * Lays out a graph whose nodes stand in clusters. Each cluster is drawn on its own first, with the nodes and the
 * clusters directly in it, and then stands as one box of its size in the level above. A line that crosses a cluster
 * border is drawn between the outermost boxes it joins; inside, it goes on from the border to its node.
 */
export function layoutClusters(graph: Graph, ruler: Ruler, opts: LayoutOptions, draw: DrawLevel): Layout {
  // Drawn once with every name on one line; the clusters whose name has no room there get a taller name row, and the drawing is made once more.
  const drawn = (exits: boolean): Layout => {
    const first = layoutPass(graph, ruler, opts, draw, new Set(), exits);
    return first.need.size === 0 ? first.layout : layoutPass(graph, ruler, opts, draw, first.need, exits).layout;
  };
  if (opts.clusterExits !== undefined) return drawn(opts.clusterExits);
  // The straight exits are kept only when the whole drawing is better with them: fewer crossings, then fewer bends, then shorter lines.
  const off = drawn(false);
  const on = drawn(true);
  const price = (l: Layout): number[] => [crossingCount(l.edges), l.edges.reduce((n, e) => n + Math.max(0, e.points.length - 2), 0), l.edges.reduce((n, e) => n + segmentsOf(e.points).reduce((m, t) => m + Math.abs(t.a.x - t.b.x) + Math.abs(t.a.y - t.b.y), 0), 0)];
  const [a, b] = [price(on), price(off)];
  for (let i = 0; i < 3; i++) if ((a[i] as number) !== (b[i] as number)) return (a[i] as number) < (b[i] as number) ? on : off;
  return off;
}

function layoutPass(graph: Graph, ruler: Ruler, opts: LayoutOptions, draw: DrawLevel, rows: ReadonlySet<string>, useExits: boolean): { layout: Layout; need: Set<string> } {
  const tree = treeOf(graph);
  const plan: Plan = { graph, ruler, opts, draw, tree, edges: placeEdges(graph, tree), home: (graph.lanes[0] ?? { id: '_' }).id, rows };
  const top = buildLevel(plan, '', graph.direction, graph.mirror);
  const acc: Assembled = { nodes: new Map(), clusters: [], clusterRect: new Map(), pieces: new Map(), diagnostics: [] };
  assemble(plan, top, 0, 0, 1, acc);

  const rectOf = (id: string): Rect | undefined => acc.clusterRect.get(id) ?? acc.nodes.get(id);
  const nodeCluster = new Map(graph.nodes.map((n) => [n.id, n.cluster] as const));

  /** The nodes and boxes a line that goes on to `end` inside a cluster must go round: everything but `end` and the clusters that hold it. */
  const obstaclesFor = (end: string): Rect[] => {
    const holds = new Set(tree.chain(acc.clusterRect.has(end) ? end : nodeCluster.get(end)));
    if (acc.clusterRect.has(end)) holds.delete(end);
    const out: Rect[] = [];
    for (const [id, r] of acc.clusterRect) if (!holds.has(id) && id !== end) out.push(r);
    for (const [id, n] of acc.nodes) {
      const c = nodeCluster.get(id);
      if (id !== end && (c === undefined || holds.has(c))) out.push(n);
    }
    return out;
  };

  const near = (o: Rect, box: Rect): boolean => o.x < box.x + box.w && o.x + o.w > box.x && o.y < box.y + box.h && o.y + o.h > box.y;
  /** What a straight line from `end` to the border of `box` must not pass through: the nodes and boxes round it. */
  const blockersFor = (box: Rect, _entry: string, end: string): Rect[] => {
    return obstaclesFor(end).filter((o) => near(o, box));
  };

  // A line between a node inside a cluster and a node outside it goes straight from a face of the node to the border
  // of the cluster: the face that points at the other node, else one of the two across it. The lines that meet one
  // side of a border stand along it in the order of their outside ends, so that they do not cross on the way there.
  interface Exit {
    r: Routed;
    end: 'from' | 'to';
    box: Rect;
    target: Rect;
    face: Face;
    range: [number, number];
    wanted: number;
    own: Point[];
    blockers: Rect[];
    sort: number[];
    at?: number;
    /** Which lane beside the border the line runs along to meet it: the deepest first. */
    lane?: number;
  }
  const direct = new Map<string, Point[]>();
  const exits: Exit[] = [];
  for (const r of useExits ? plan.edges : []) {
    for (const end of ['from', 'to'] as const) {
      const piece = acc.pieces.get(r.index);
      if (piece === undefined || piece.invisible || piece.points.length < 2 || r[end] === r.edge[end]) continue;
      const box = acc.clusterRect.get(r[end]);
      const target = rectOf(r.edge[end]);
      const other = rectOf(r.edge[end === 'to' ? 'from' : 'to']);
      if (box === undefined || target === undefined || other === undefined) continue;
      const own = end === 'to' ? piece.points : [...piece.points].reverse();
      const blockers = blockersFor(box, r[end], r.edge[end]);
      for (const face of exitFaces(target, other)) {
        const flat = face === 'top' || face === 'bottom';
        const centre = flat ? target.x + target.w / 2 : target.y + target.h / 2;
        const range = exitRange(face, box, target);
        if (range === undefined) continue;
        const wanted = Math.min(range[1], Math.max(range[0], centre));
        const ends = exitEnds(face, wanted, box, target);
        if (blockers.some((o) => through(ends.inner, ends.border, o, 0))) continue;
        const cut = crossingAlong(own, lanesOf(face, box)[0] as number, flat);
        const outer = flat ? other.x + other.w / 2 : other.y + other.h / 2;
        exits.push({ r, end, box, target, face, range, wanted, own, blockers, sort: [outer, centre, cut ?? outer] });
        break;
      }
    }
  }
  const groups = new Map<string, Exit[]>();
  /** Where lines already stand along the face of a node. */
  const onNode = new Map<string, number[]>();
  for (const e of exits) groups.set(`${e.r[e.end]}|${e.face}`, [...(groups.get(`${e.r[e.end]}|${e.face}`) ?? []), e]);
  for (const group of groups.values()) {
    const [first] = group;
    if (first === undefined) continue;
    const flat = first.face === 'top' || first.face === 'bottom';
    const inGroup = new Set(group.map((e) => e.r.index));
    // The ends of the other lines on that face stay where they are.
    const fixed = [...acc.pieces].filter(([index, e]) => !inGroup.has(index) && !e.invisible).flatMap(([, e]) => [e.points[0] as Point, e.points[e.points.length - 1] as Point]).filter((m) => faceOfPoint(m, first.box) === first.face).map((m) => (flat ? m.x : m.y));
    let last = -Infinity;
    for (const e of [...group].sort((a, b) => (a.sort[0] as number) - (b.sort[0] as number) || (a.sort[1] as number) - (b.sort[1] as number) || (a.sort[2] as number) - (b.sort[2] as number))) {
      let v = Math.max(e.wanted, last + FACE_PITCH);
      const own = `${e.r.edge[e.end]}|${e.face}`;
      while (v <= e.range[1] + EPS && (fixed.some((m) => Math.abs(m - v) < FACE_PITCH - EPS) || (onNode.get(own) ?? []).some((m) => Math.abs(m - v) < FACE_PITCH - EPS))) v += FACE_PITCH;
      const ends = exitEnds(e.face, v, e.box, e.target);
      if (v > e.range[1] + EPS || e.blockers.some((o) => through(ends.inner, ends.border, o, 0))) continue;
      e.at = v;
      last = v;
      onNode.set(own, [...(onNode.get(own) ?? []), v]);
    }
  }
  // The lines that leave one face of an outside node for one side of a border stand along that face in the order they meet the border, so that they do not cross on the way.
  const leaving = new Map<string, Exit[]>();
  for (const e of exits) {
    if (e.at === undefined || e.face === 'left' || e.face === 'right') continue;
    const piece = acc.pieces.get(e.r.index) as LayoutEdge;
    const start = (e.end === 'to' ? piece.points : [...piece.points].reverse())[0] as Point;
    const outside = rectOf(e.r.edge[e.end === 'to' ? 'from' : 'to']);
    if (outside === undefined || e.r[e.end === 'to' ? 'from' : 'to'] !== e.r.edge[e.end === 'to' ? 'from' : 'to']) continue;
    const face = faceOfPoint(start, outside);
    if (face === 'top' || face === 'bottom') leaving.set(`${e.r.edge[e.end === 'to' ? 'from' : 'to']}|${face}|${e.box.x}|${e.box.y}`, [...(leaving.get(`${e.r.edge[e.end === 'to' ? 'from' : 'to']}|${face}|${e.box.x}|${e.box.y}`) ?? []), e]);
  }
  for (const group of leaving.values()) {
    if (group.length < 2) continue;
    const startOf = (e: Exit): Point[] => {
      const piece = acc.pieces.get(e.r.index) as LayoutEdge;
      return e.end === 'to' ? piece.points : [...piece.points].reverse();
    };
    const ports = group.map((e) => (startOf(e)[0] as Point).x).sort((a, b) => a - b);
    const ordered = [...group].sort((a, b) => (a.at as number) - (b.at as number));
    ordered.forEach((e, i) => {
      const pts = startOf(e);
      const [a, c] = [pts[0] as Point, pts[1] as Point];
      const x = ports[i] as number;
      if (Math.abs(a.x - c.x) > EPS || Math.abs(a.x - x) < EPS) return;
      const moved = [{ x, y: a.y }, { x, y: c.y }, ...pts.slice(2)];
      const piece = acc.pieces.get(e.r.index) as LayoutEdge;
      acc.pieces.set(e.r.index, { ...piece, points: e.end === 'to' ? moved : [...moved].reverse() });
    });
  }
  // Lines that go along the lane towards where they meet the border nest: the one that comes from furthest away takes the deepest lane, so that they do not cross.
  for (const group of groups.values()) {
    const placed = group.filter((e) => e.at !== undefined && e.face !== undefined);
    const flat = (group[0] as Exit).face === 'top' || (group[0] as Exit).face === 'bottom';
    const origin = (e: Exit): number => {
      const piece = acc.pieces.get(e.r.index) as LayoutEdge;
      return crossingAlong(e.end === 'to' ? piece.points : [...piece.points].reverse(), lanesOf(e.face, e.box)[0] as number, flat) ?? (e.at as number);
    };
    const right = placed.filter((e) => origin(e) < (e.at as number) - EPS).sort((a, b) => origin(a) - origin(b));
    const left = placed.filter((e) => origin(e) > (e.at as number) + EPS).sort((a, b) => origin(b) - origin(a));
    right.forEach((e, i) => (e.lane = Math.min(3, i)));
    left.forEach((e, i) => (e.lane = Math.min(3, right.length + i)));
  }
  for (const e of exits) {
    if (e.at === undefined) continue;
    const piece = acc.pieces.get(e.r.index) as LayoutEdge;
    const flat = e.face === 'top' || e.face === 'bottom';
    const ends = exitEnds(e.face, e.at, e.box, e.target);
    const ownNow = e.end === 'to' ? piece.points : [...piece.points].reverse();
    const rest = [...acc.pieces].filter(([index]) => index !== e.r.index).map(([, v]) => v).filter((v) => !v.invisible);
    const others = rest.flatMap((v) => segmentsOf(v.points));
    const obstacles: Rect[] = [...acc.nodes.values(), ...[...acc.clusterRect.values()].filter((c) => !(c.x <= e.box.x && c.y <= e.box.y && c.x + c.w >= e.box.x + e.box.w && c.y + c.h >= e.box.y + e.box.h))].filter((o) => o !== e.target);
    let best: { path: Point[]; cost: number } | undefined;
    const lanes = lanesOf(e.face, e.box);
    for (const lane of e.lane === undefined ? lanes : [lanes[e.lane] as number, ...lanes.filter((_, k) => k !== e.lane)]) {
      const stub: Point = flat ? { x: e.at, y: lane } : { x: lane, y: e.at };
      const path = joinAt(ownNow, lane, flat, stub, ends.border, obstacles);
      if (path === undefined) continue;
      const cost = segmentsOf(path).reduce((sum, t) => sum + clash(t.a, t.b, others), 0);
      if (e.lane !== undefined && lane === lanes[e.lane]) {
        best = { path, cost };
        break;
      }
      if (best === undefined || cost < best.cost - EPS) best = { path, cost };
    }
    // When the line cannot be cut and led on, it is drawn again from the border to the node at its other end, round everything else.
    const otherEnd = e.end === 'to' ? 'from' : 'to';
    const far = e.r[otherEnd] === e.r.edge[otherEnd] ? acc.nodes.get(e.r.edge[otherEnd]) : undefined;
    if (best === undefined && far !== undefined) {
      const holds = new Set([...tree.chain(nodeCluster.get(e.r.edge[otherEnd])), ...tree.chain(e.r[e.end]), e.r[e.end]]);
      const around = [...acc.nodes].filter(([id]) => id !== e.r.edge[otherEnd]).map(([, n]) => n as Rect).concat([...acc.clusterRect].filter(([id]) => !holds.has(id)).map(([, c]) => c));
      const found = pathInside({ region: { x: 0, y: 0, w: top.layout.width, h: top.layout.height }, start: ends.border, inward: e.face === 'top' ? 3 : e.face === 'bottom' ? 1 : e.face === 'left' ? 2 : 0, target: far, obstacles: around, walls: [e.box], drawn: others, taken: new Set<string>() });
      if (found !== undefined) best = { path: [...found].reverse(), cost: 0 };
    }
    if (best === undefined) continue;
    // The line is drawn this way only when that costs less than the way it was drawn: bends, length and crossings.
    const price = (pts: Point[]): number => segmentsOf(pts).reduce((sum, t) => sum + Math.abs(t.a.x - t.b.x) + Math.abs(t.a.y - t.b.y) + clash(t.a, t.b, others), 0) + BEND_COST * Math.max(0, pts.length - 2);
    const along = [ends.border, ends.inner];
    const slid = slideEnd(ownNow, {
      box: e.box,
      target: e.target,
      others,
      meets: rest.flatMap((v) => [v.points[0] as Point, v.points[v.points.length - 1] as Point]),
      obstacles: [...acc.nodes.values(), ...[...acc.clusterRect.values()].filter((c) => !(c.x <= e.box.x && c.y <= e.box.y && c.x + c.w >= e.box.x + e.box.w && c.y + c.h >= e.box.y + e.box.h))],
      inner: blockersFor(e.box, e.r[e.end], e.r.edge[e.end]),
    });
    const entry = slid.at(-1) as Point;
    const inward = dirOf(slid.at(-2) as Point, entry);
    const around = pathInside({ region: e.box, start: entry, inward, target: e.target, obstacles: blockersFor(e.box, e.r[e.end], e.r.edge[e.end]), drawn: others, taken: new Set<string>() }) ?? straightIn(entry, inward, e.target);
    if (price([...slid, ...around.slice(1)]) <= price([...best.path, ...along.slice(1)]) + EPS) continue;
    acc.pieces.set(e.r.index, { ...piece, points: e.end === 'to' ? best.path : [...best.path].reverse() });
    direct.set(`${e.r.index}:${e.end}`, [ends.border, ends.inner]);
  }

  // A line that crosses a cluster border meets it level with the node it goes on to, so that its stretch inside is one straight line.
  for (const r of plan.edges) {
    for (const end of ['from', 'to'] as const) {
      const piece = acc.pieces.get(r.index);
      if (piece === undefined || piece.invisible || piece.points.length < 2 || r[end] === r.edge[end] || direct.has(`${r.index}:${end}`)) continue;
      const box = acc.clusterRect.get(r[end]);
      const target = rectOf(r.edge[end]);
      if (box === undefined || target === undefined) continue;
      const rest = [...acc.pieces].filter(([index]) => index !== r.index).map(([, e]) => e).filter((e) => !e.invisible);
      const obstacles: Rect[] = [...acc.nodes.values(), ...[...acc.clusterRect.values()].filter((c) => !(c.x <= box.x && c.y <= box.y && c.x + c.w >= box.x + box.w && c.y + c.h >= box.y + box.h))];
      const forward = end === 'to' ? piece.points : [...piece.points].reverse();
      const meets = rest.flatMap((e) => [e.points[0] as Point, e.points[e.points.length - 1] as Point]);
      const moved = slideEnd(forward, {
        box,
        target,
        others: rest.flatMap((e) => segmentsOf(e.points)),
        meets,
        obstacles,
        inner: obstaclesFor(r.edge[end]).filter((o) => o.x < box.x + box.w && o.x + o.w > box.x && o.y < box.y + box.h && o.y + o.h > box.y),
        ...(piece.label === undefined ? {} : { label: { x: piece.label.x, y: piece.label.y, w: piece.label.w, h: piece.label.h } }),
      });
      acc.pieces.set(r.index, { ...piece, points: end === 'to' ? moved : [...moved].reverse() });
    }
  }
  const pieceSegs = new Map([...acc.pieces].map(([index, e]) => [index, e.invisible ? [] : segmentsOf(e.points)] as const));
  const drawn: Seg[] = [...pieceSegs.values()].flat();
  const taken = new Set<string>();

  /** The path from the border where a line meets the cluster `entry` to its end `end` inside it. */
  const inside = (entry: string, end: string, start: Point, towards: Point, own: Seg[]): Point[] => {
    const target = rectOf(end) as Rect;
    const region = acc.clusterRect.get(entry) as Rect;
    const inward = dirOf(towards, start);
    const obstacles = obstaclesFor(end);
    const others = drawn.filter((s) => !own.includes(s));
    const found = pathInside({ region, start, inward, target, obstacles, drawn: others, taken }) ?? straightIn(start, inward, target);
    const last = found.at(-1);
    if (last !== undefined) taken.add(key(last));
    drawn.push(...segmentsOf(found));
    return found;
  };

  /** The way in from the border: the straight line chosen for it, or the path round what stands in the way. */
  const via = (r: Routed, end: 'from' | 'to', start: Point, towards: Point, own: Seg[]): Point[] => {
    const straight = direct.get(`${r.index}:${end}`);
    if (straight === undefined) return inside(r[end], r.edge[end], start, towards, own);
    const last = straight.at(-1);
    if (last !== undefined) taken.add(key(last));
    drawn.push(...segmentsOf(straight));
    return straight;
  };

  const edges: LayoutEdge[] = [];
  /** The lines drawn again from their ends, whose labels are placed again on their longest stretch. */
  const redrawn = new Set<number>();
  for (const r of plan.edges) {
    const piece = acc.pieces.get(r.index);
    if (piece === undefined || piece.points.length < 2) continue;
    if (direct.has(`${r.index}:from`) || direct.has(`${r.index}:to`)) redrawn.add(edges.length);
    let points = piece.points;
    if (!piece.invisible) {
      const own = pieceSegs.get(r.index) ?? [];
      if (r.from !== r.edge.from) {
        const [p, q] = points as [Point, Point];
        points = [...via(r, 'from', p, q, own).reverse(), ...points.slice(1)];
      }
      if (r.to !== r.edge.to) {
        const p = points.at(-1) as Point;
        const q = points.at(-2) as Point;
        points = [...points.slice(0, -1), ...via(r, 'to', p, q, own)];
      }
    }
    const { id: _id, ...rest } = piece;
    edges.push({ ...rest, from: r.edge.from, to: r.edge.to, ...(r.edge.id === undefined ? {} : { id: r.edge.id }), points: tighten(points) });
  }

  const nodes = graph.nodes.flatMap((n) => {
    const placed = acc.nodes.get(n.id);
    return placed === undefined ? [] : [placed];
  });
  const base: Layout = {
    ...top.layout,
    nodes,
    edges,
    clusters: acc.clusters,
    diagnostics: acc.diagnostics,
  };
  // The labels were placed level by level; once every level and every inner stretch is in, they are placed again against all the lines.
  const finished = ruler.terminal === true ? base : withinCanvas(refineLabels(base, layeredRuler(ruler), redrawn));
  const named = ruler.terminal === true ? { clusters: finished.clusters ?? [], need: new Set<string>() } : placeNames(finished, ruler, rows);
  return { layout: withLegend({ ...finished, clusters: named.clusters }, ruler, opts.legend), need: named.need };
}
