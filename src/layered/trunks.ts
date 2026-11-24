import type { Ruler } from '../metrics.ts';
import { crossingCount, crossings } from '../layout/check.ts';
import { edgeNear } from '../layout/place.ts';
import { ACTOR_NAME_GAP, ACTOR_NAME_H } from '../layout/records.ts';
import type { Graph, Layout, LayoutEdge, LayoutNode, Point } from '../types.ts';

/** Shortest trunk, and shortest branch below the point where the trunk splits. */
const MIN_RUN = 20;
/** Distance from the corner of a face a trunk keeps when it does not leave from the middle. */
const CORNER = 24;
/** Line kept to be seen on each side of a label that stands on it. */
const LABEL_ROOM = 12;
/** Room an arrowhead or relation mark takes at the end of a line. */
const MARK_ROOM = 14;
/** Room kept for the bend of a line; twice the radius a bend is drawn with. */
const BEND = 16;
const EPS = 1e-6;

interface Member {
  index: number;
  /** The points from the shared box to the other end. */
  pts: Point[];
  /** Where the line meets the face of the shared box it leaves by. */
  face: Point;
  /** The edge was given in the other direction: the points go back reversed. */
  reversed: boolean;
  shared: LayoutNode;
  otherId: string;
  axis: 'x' | 'y';
  d: 1 | -1;
  /** Length of the last piece its label needs to stand on it, or 0 without a label. */
  room: number;
}

const other = (axis: 'x' | 'y'): 'x' | 'y' => (axis === 'x' ? 'y' : 'x');
const at = (axis: 'x' | 'y', flow: number, cross: number): Point => (axis === 'y' ? { x: cross, y: flow } : { x: flow, y: cross });

/** Whether the straight piece from a to b passes through the inside of the box. */
function cuts(a: Point, b: Point, box: LayoutNode): boolean {
  const x0 = Math.min(a.x, b.x);
  const x1 = Math.max(a.x, b.x);
  const y0 = Math.min(a.y, b.y);
  const y1 = Math.max(a.y, b.y);
  return x1 > box.x + EPS && x0 < box.x + box.w - EPS && y1 > box.y + EPS && y0 < box.y + box.h - EPS;
}

/** The middle of the face of a box that looks along `axis` in direction `d`; a figure's name stands under it. */
function faceOf(box: LayoutNode, axis: 'x' | 'y', d: 1 | -1): Point {
  const below = box.shape === 'actor' && axis === 'y' && d > 0 ? ACTOR_NAME_GAP + ACTOR_NAME_H : 0;
  const flow = d > 0 ? box[axis] + (axis === 'x' ? box.w : box.h) + below : box[axis];
  const c = other(axis);
  return at(axis, flow, box[c] + (c === 'x' ? box.w : box.h) / 2);
}

/** A line of the group as member data, or undefined when it cannot join a trunk. */
function memberOf(source: Graph, drawn: Layout, index: number, nodes: Map<string, LayoutNode>): Member | undefined {
  const hint = source.edges[index]?.trunk;
  const edge = drawn.edges[index];
  if (hint === undefined || edge === undefined || edge.invisible || edge.points.length < 2) return undefined;
  const reversed = hint.end === 'to';
  // A multiplicity beside the shared end would stay where the line was.
  if ((reversed ? edge.endLabel : edge.startLabel) !== undefined) return undefined;
  const shared = nodes.get(reversed ? edge.to : edge.from);
  if (shared === undefined) return undefined;
  const pts = reversed ? [...edge.points].reverse() : edge.points;
  const q = pts.at(-1) as Point;
  const prev = pts.at(-2) as Point;
  // A figure is narrow and its lines take whichever face has a free place, so its face is the one that looks at the other end.
  const figure = shared.shape === 'actor';
  const [ax, ay] = figure ? [q.x - prev.x, q.y - prev.y] : [(pts[1] as Point).x - (pts[0] as Point).x, (pts[1] as Point).y - (pts[0] as Point).y];
  if ((Math.abs(ax) > EPS) === (Math.abs(ay) > EPS)) return undefined;
  const axis = Math.abs(ay) > EPS ? 'y' : 'x';
  const d = (axis === 'y' ? ay : ax) > 0 ? 1 : -1;
  // The other end is entered along the same axis, going on in the same direction.
  if (Math.abs(prev[other(axis)] - q[other(axis)]) > EPS || d * (q[axis] - prev[axis]) <= EPS) return undefined;
  const face = figure ? faceOf(shared, axis, d) : (pts[0] as Point);
  if (d * (q[axis] - face[axis]) < 2 * MIN_RUN) return undefined;
  const label = edge.label;
  const room = label === undefined ? 0 : (axis === 'y' ? label.h : label.w) + 2 * LABEL_ROOM + (edge.end !== undefined && edge.end !== 'none' ? MARK_ROOM : 0);
  return { index, pts, face, reversed, shared, otherId: reversed ? edge.from : edge.to, axis, d, room };
}

/** Where the trunk leaves the box: the middle of the face when the branches spread on both sides of it, otherwise the nearest point to their mean. */
function trunkCross(shared: LayoutNode, axis: 'x' | 'y', crosses: number[], leaving: number, ruler: Ruler): number {
  if (shared.shape === 'actor') return leaving;
  const c = other(axis);
  const lo = shared[c];
  const hi = shared[c] + (c === 'x' ? shared.w : shared.h);
  const middle = (lo + hi) / 2;
  if (Math.min(...crosses) < middle - EPS && Math.max(...crosses) > middle + EPS) return middle;
  const mean = crosses.reduce((a, b) => a + b, 0) / crosses.length;
  return hi - lo <= 2 * CORNER ? middle : edgeNear(ruler, Math.min(hi - CORNER, Math.max(lo + CORNER, mean)));
}

interface Drawn {
  points: Map<number, Point[]>;
  junction: Point;
  /** The line that keeps the mark at the shared end and draws the trunk; the others begin a little before the split. */
  lead: number;
}

/** The points of every member as one trunk, or undefined when a member would run through a box. */
function drawGroup(group: Member[], nodes: LayoutNode[], ruler: Ruler, round: boolean): Drawn | undefined {
  const first = group[0] as Member;
  const { axis, d } = first;
  const c = other(axis);
  const face = first.face;
  const gap = Math.min(...group.map((m) => d * ((m.pts.at(-1) as Point)[axis] - face[axis])));
  // The split stands half way, or nearer the shared box when a label would not fit below it.
  const half = face[axis] + (d * gap) / 2;
  const toRoom = Math.min(...group.map((m) => d * ((m.pts.at(-1) as Point)[axis] - face[axis]) - m.room));
  const nearer = face[axis] + d * Math.max(MIN_RUN, Math.min((d * (half - face[axis])), toRoom));
  const flow = edgeNear(ruler, nearer);
  if (d * (flow - face[axis]) < MIN_RUN - EPS || gap - d * (flow - face[axis]) < MIN_RUN - EPS) return undefined;
  const t = trunkCross(first.shared, axis, group.map((m) => (m.pts.at(-1) as Point)[c]), face[c], ruler);
  const junction = at(axis, flow, t);
  // The line that runs straight on is the trunk's own; with none, the one nearest to it.
  const lead = group.reduce((a, b) => (Math.abs((b.pts.at(-1) as Point)[c] - t) < Math.abs((a.pts.at(-1) as Point)[c] - t) - EPS ? b : a));
  // With round bends the other lines start so far before the split that their bend there is round; otherwise they start at the split, on a flat bar.
  const runIn = round ? at(axis, flow - d * Math.min(2 * BEND, d * (flow - face[axis])), t) : junction;
  const points = new Map<number, Point[]>();
  for (const m of group) {
    const q = m.pts.at(-1) as Point;
    const start = m === lead ? at(axis, face[axis], t) : runIn;
    const path = Math.abs(q[c] - t) < EPS ? [start, at(axis, q[axis], t)] : [start, junction, at(axis, flow, q[c]), q];
    const blocked = nodes.some((n) => n.id !== m.shared.id && n.id !== m.otherId && path.slice(1).some((p, i) => cuts(path[i] as Point, p, n)));
    if (blocked) return undefined;
    points.set(m.index, path);
  }
  return { points, junction, lead: lead.index };
}

/** Where the label of a branch stands: centred on the piece below the split that runs into the other box, or on the piece along the split when that one is too short; the label stays where it was when neither fits. */
function labelOn(edge: LayoutEdge, path: Point[], junction: Point, ruler: Ruler): LayoutEdge['label'] {
  const label = edge.label;
  if (label === undefined) return undefined;
  const last = path.at(-1) as Point;
  const pieces: Array<[Point, Point]> = path.length === 2 ? [[junction, last]] : [[path.at(-2) as Point, last], [junction, path.at(-2) as Point]];
  for (const [a, b] of pieces) {
    const vertical = Math.abs(a.x - b.x) < EPS;
    const axis = vertical ? 'y' : 'x';
    const sign = b[axis] > a[axis] ? 1 : -1;
    // The label keeps clear of the mark at the end the line runs into.
    const from = a[axis];
    const to = b[axis] - sign * (edge.end !== undefined && edge.end !== 'none' ? MARK_ROOM : 0);
    const length = sign * (to - from);
    if (length < (vertical ? label.h : label.w) + 2 * LABEL_ROOM) continue;
    const middle = (from + to) / 2;
    const [cx, cy] = vertical ? [a.x, middle] : [middle, a.y];
    return { ...label, x: edgeNear(ruler, cx - label.w / 2), y: edgeNear(ruler, cy - label.h / 2) };
  }
  return label;
}

/**
 * Lines that carry the same kind of mark at one box and leave it by the same face are drawn as a trunk: one line out
 * of the face to the middle of the gap, where it splits into a branch for each other end. The mark is drawn once,
 * on the line that runs straight on, or the nearest to it. A group stays as it was when a branch would run through a box or when the
 * drawing would have more crossings. Pixel drawings only.
 */
export function applyTrunks(drawn: Layout, source: Graph, ruler: Ruler): Layout {
  if (ruler.terminal === true || ruler.uniform === true || (source.clusters?.length ?? 0) > 0 || source.edges.length !== drawn.edges.length) return drawn;
  if (!source.edges.some((e) => e.trunk !== undefined)) return drawn;
  const nodes = new Map(drawn.nodes.map((n) => [n.id, n] as const));
  const groups = new Map<string, Member[]>();
  source.edges.forEach((e, i) => {
    const edge = drawn.edges[i] as LayoutEdge;
    if (e.trunk === undefined || e.from !== edge.from || e.to !== edge.to) return;
    const m = memberOf(source, drawn, i, nodes);
    if (m === undefined) return;
    const key = `${m.shared.id}|${m.axis}${m.d}|${e.trunk.kind}|${edge.style}`;
    groups.set(key, [...(groups.get(key) ?? []), m]);
  });
  let edges = drawn.edges;
  let changed = false;
  for (const [key, all] of groups) {
    let group = all;
    const round = source.edges[group[0]?.index ?? 0]?.trunk?.dot === true;
    let result: Drawn | undefined;
    // A member that cannot be drawn into the trunk is left as it was; the rest are tried again.
    while (group.length >= 2) {
      result = drawGroup(group, drawn.nodes, ruler, round);
      if (result !== undefined) break;
      const worst = group.findIndex((m) => drawGroup(group.filter((x) => x !== m), drawn.nodes, ruler, round) !== undefined);
      group = worst < 0 ? [] : group.filter((_, i) => i !== worst);
    }
    if (result === undefined || group.length < 2) continue;
    const members = new Map(group.map((m) => [m.index, m] as const));
    const next = edges.map((edge, i) => {
      const m = members.get(i);
      const path = result?.points.get(i);
      if (m === undefined || path === undefined) return edge;
      const lead = i === result?.lead;
      const points = m.reversed ? [...path].reverse() : path;
      const trunk = { id: key, lead, ...(round ? {} : { square: true as const }), ...(lead && source.edges[i]?.trunk?.dot === true ? { dot: result?.junction as Point } : {}) };
      const { label: _label, ...rest } = edge;
      const label = labelOn(edge, path, result?.junction as Point, ruler);
      return {
        ...rest,
        points,
        trunk,
        ...(label === undefined ? {} : { label }),
        ...(lead ? {} : m.reversed ? { end: 'none' as const } : { startEnd: 'none' as const }),
      } satisfies LayoutEdge;
    });
    // Pieces that run along one another are not crossings, so the members of a trunk do not add to the count.
    if (crossingCount(next) > crossingCount(edges)) continue;
    edges = next;
    changed = true;
  }
  if (!changed) return drawn;
  const diagnostics = [...drawn.diagnostics.filter((d) => d.kind !== 'crossing'), ...crossings(edges)];
  return { ...drawn, edges, diagnostics };
}
