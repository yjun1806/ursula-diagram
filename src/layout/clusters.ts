import { layeredRuler } from '../layered/index.ts';
import { refineLabels } from '../layered/label-spot.ts';
import type { Ruler } from '../metrics.ts';
import type { Diagnostic, Direction, Graph, GraphEdge, GraphNode, Layout, LayoutCluster, LayoutEdge, LayoutNode, Point } from '../types.ts';
import type { LayoutOptions } from './index.ts';
import { withLegend } from './legend.ts';
import { gridUp } from './place.ts';

/** Space between a cluster box and what stands in it, and the extra line on top that holds the name. */
export const CLUSTER_PAD = 24;
export const CLUSTER_NAME_ROW = 32;
/** Distance of a name from the left side of its box. */
export const CLUSTER_NAME_INSET = 16;
/** Distance from the border of a cluster at which a line that goes round the nodes inside runs. */
const CORRIDOR = CLUSTER_PAD / 2;

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
}

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
  const edges: GraphEdge[] = plan.edges
    .filter((r) => r.level === id)
    .map(({ index, edge, from, to }) => {
      const { id: _id, ...rest } = edge;
      return { ...rest, from, to, id: marker(index) };
    });
  const level: Graph = { direction, ...(mirror === undefined ? {} : { mirror }), lanes: graph.lanes.slice(0, 1), nodes, edges };
  const { maxWidth, maxHeight, ...rest } = plan.opts;
  const root = id === '';
  const layout = plan.draw(level, ruler, { ...rest, engine: 'layered', legend: false, questions: false, ...(root ? { ...(maxWidth === undefined ? {} : { maxWidth }), ...(maxHeight === undefined ? {} : { maxHeight }) } : { maxWidth: Infinity }) });
  const content = contentOf(layout);
  const name = ruler.textWidth(tree.label.get(id) ?? '', 'lane') + 2 * CLUSTER_NAME_INSET;
  const size = {
    w: gridUp(ruler, Math.max(content.w + 2 * CLUSTER_PAD, name)),
    h: gridUp(ruler, content.h + CLUSTER_NAME_ROW + 2 * CLUSTER_PAD),
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
    const ky = Math.round(box.y + CLUSTER_NAME_ROW + CLUSTER_PAD + (box.h - CLUSTER_NAME_ROW - 2 * CLUSTER_PAD - kid.content.h) / 2 - kid.content.y);
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
      if (horizontal && Math.abs(s.a.y - a.y) < EPS) {
        const lap = Math.min(Math.max(a.x, b.x), Math.max(s.a.x, s.b.x)) - Math.max(Math.min(a.x, b.x), Math.min(s.a.x, s.b.x));
        if (lap > EPS) cost += OVERLAP_COST * lap;
      } else if (!horizontal && Math.abs(s.a.x - a.x) < EPS) {
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
  const rx = [lo.x, hi.x, ...obstacles.flatMap((o) => [o.x - CORRIDOR, o.x + o.w + CORRIDOR, o.x, o.x + o.w]), target.x - CORRIDOR, target.x + target.w + CORRIDOR];
  const ry = [lo.y, hi.y, ...obstacles.flatMap((o) => [o.y - CORRIDOR, o.y + o.h + CORRIDOR, o.y, o.y + o.h]), target.y - CORRIDOR, target.y + target.h + CORRIDOR];
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
      if (obstacles.some((o) => through(a, b, o, CLEAR))) continue;
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

/** A path that ignores everything but the target, when none goes round it. */
function straightIn(start: Point, inward: number, target: Rect): Point[] {
  const mid = { x: target.x + target.w / 2, y: target.y + target.h / 2 };
  return inward % 2 === 1 ? [start, { x: start.x, y: mid.y }, { x: mid.x, y: mid.y }] : [start, { x: mid.x, y: start.y }, { x: mid.x, y: mid.y }];
}

// ---------------------------------------------------------------------------------------------------------------

/**
 * Lays out a graph whose nodes stand in clusters. Each cluster is drawn on its own first, with the nodes and the
 * clusters directly in it, and then stands as one box of its size in the level above. A line that crosses a cluster
 * border is drawn between the outermost boxes it joins; inside, it goes on from the border to its node.
 */
export function layoutClusters(graph: Graph, ruler: Ruler, opts: LayoutOptions, draw: DrawLevel): Layout {
  const tree = treeOf(graph);
  const plan: Plan = { graph, ruler, opts, draw, tree, edges: placeEdges(graph, tree), home: (graph.lanes[0] ?? { id: '_' }).id };
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

  // A line that crosses a cluster border meets it level with the node it goes on to, so that its stretch inside is one straight line.
  for (const r of plan.edges) {
    for (const end of ['from', 'to'] as const) {
      const piece = acc.pieces.get(r.index);
      if (piece === undefined || piece.invisible || piece.points.length < 2 || r[end] === r.edge[end]) continue;
      const box = acc.clusterRect.get(r[end]);
      const target = rectOf(r.edge[end]);
      if (box === undefined || target === undefined) continue;
      const rest = [...acc.pieces].filter(([index]) => index !== r.index).map(([, e]) => e).filter((e) => !e.invisible);
      const obstacles: Rect[] = [...acc.nodes.values(), ...[...acc.clusterRect.values()].filter((c) => !(c.x <= box.x && c.y <= box.y && c.x + c.w >= box.x + box.w && c.y + c.h >= box.y + box.h))];
      const forward = end === 'to' ? piece.points : [...piece.points].reverse();
      const moved = slideEnd(forward, {
        box,
        target,
        others: rest.flatMap((e) => segmentsOf(e.points)),
        meets: rest.flatMap((e) => [e.points[0] as Point, e.points[e.points.length - 1] as Point]),
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

  const edges: LayoutEdge[] = [];
  for (const r of plan.edges) {
    const piece = acc.pieces.get(r.index);
    if (piece === undefined || piece.points.length < 2) continue;
    let points = piece.points;
    if (!piece.invisible) {
      const own = pieceSegs.get(r.index) ?? [];
      if (r.from !== r.edge.from) {
        const [p, q] = points as [Point, Point];
        points = [...inside(r.from, r.edge.from, p, q, own).reverse(), ...points.slice(1)];
      }
      if (r.to !== r.edge.to) {
        const p = points.at(-1) as Point;
        const q = points.at(-2) as Point;
        points = [...points.slice(0, -1), ...inside(r.to, r.edge.to, p, q, own)];
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
  return withLegend(ruler.terminal === true ? base : refineLabels(base, layeredRuler(ruler)), ruler, opts.legend);
}
