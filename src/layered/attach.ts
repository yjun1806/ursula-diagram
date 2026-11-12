import type { Ruler } from '../metrics.ts';
import type { Rect, Segment } from '../layout/labels.ts';
import { overlaps } from '../layout/labels.ts';
import { measureNodes } from '../layout/place.ts';
import type { Diagnostic, EdgeStyle, EndLabel, Graph, GraphEdge, GraphNode, Layout, LayoutCluster, LayoutEdge, LayoutLane, LayoutNode, Point } from '../types.ts';
import { segmentToRect } from './label-spot.ts';

/** What the arrangement leaves out because it is drawn beside a node once the rest is placed: notes and lollipop stubs. */
export interface Attached {
  /** The graph without them. */
  graph: Graph;
  notes: GraphNode[];
  stubs: GraphEdge[];
}

/** Splits a graph into the part that is arranged and the notes (`attach`) and lollipop stubs that are drawn beside their nodes afterwards. */
export function splitAttached(graph: Graph): Attached | undefined {
  const anchors = new Set(graph.nodes.filter((n) => n.attach === undefined).map((n) => n.id));
  const notes = graph.nodes.filter((n) => n.attach !== undefined && anchors.has(n.attach.to));
  const stubs = graph.edges.filter((e) => e.end === 'lollipop' && e.from === e.to && anchors.has(e.from));
  if (notes.length === 0 && stubs.length === 0) return undefined;
  const gone = new Set(notes.map((n) => n.id));
  return {
    graph: { ...graph, nodes: graph.nodes.filter((n) => !gone.has(n.id)), edges: graph.edges.filter((e) => !stubs.includes(e) && !gone.has(e.from) && !gone.has(e.to)) },
    notes,
    stubs,
  };
}

/** Pixels: gap between a note and its node, the stub of a lollipop and its ring; terminal cells: the same two. */
const NOTE_GAP = 32;
const NOTE_GAP_CELLS = 4;
const STEM = 24;
const RING = 12;
/** Pixels: gap between a ring and the name beside it; and the small text's size as in `end-labels`. */
const RING_TEXT = 4;
const SMALL = 11 / 12;
const SMALL_HEIGHT = 14;
/** Pixels (cells): how much room around a rect nothing else may take; how far a note slides along its way per try, and how many tries. */
const CLEAR = 8;
const CLEAR_CELLS = 1;
const SLIDE = 16;
const SLIDE_CELLS = 1;
const TRIES = 24;
/** Where on a face a stub may stand, in the order tried. */
const FRACTIONS = [0.5, 0.25, 0.75, 0.12, 0.88];

type Face = 'top' | 'right' | 'bottom' | 'left';
const AHEAD: Record<Face, Point> = { top: { x: 0, y: -1 }, right: { x: 1, y: 0 }, bottom: { x: 0, y: 1 }, left: { x: -1, y: 0 } };

const tidy = (v: number): number => {
  const r = Math.round(v * 1e6) / 1e6;
  return r === 0 ? 0 : r;
};
const grow = (r: Rect, by: number): Rect => ({ x: r.x - by, y: r.y - by, w: r.w + 2 * by, h: r.h + 2 * by });
const inside = (r: Rect, c: Rect): boolean => r.x >= c.x - 1e-6 && r.y >= c.y - 1e-6 && r.x + r.w <= c.x + c.w + 1e-6 && r.y + r.h <= c.y + c.h + 1e-6;
const union = (a: Rect, b: Rect): Rect => {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
};

/** The cells a line of a terminal drawing runs through: an end on the left or top border of a box is drawn in the cell outside it. */
function wireOf(edge: LayoutEdge, byId: ReadonlyMap<string, LayoutNode>, cells: boolean): Point[] {
  if (!cells) return edge.points;
  return edge.points.map((p, i) => {
    const node = byId.get(i === 0 ? edge.from : edge.to);
    const onEnd = i === 0 || i === edge.points.length - 1;
    return {
      x: Math.floor(p.x + 1e-9) - (onEnd && node && Math.abs(p.x - node.x) < 1e-9 ? 1 : 0),
      y: Math.floor(p.y + 1e-9) - (onEnd && node && Math.abs(p.y - node.y) < 1e-9 ? 1 : 0),
    };
  });
}

const segmentsOf = (points: Point[]): Segment[] => points.slice(1).map((q, i) => [points[i] as Point, q] as Segment);

/**
 * Draws the notes and the lollipop stubs that the arrangement left out, each beside its node in the places the rest of
 * the drawing leaves free, and grows the canvas by whatever sticks out. A note stands on the side its `attach` names
 * and slides away from the node until nothing is in its way; a stub takes the first free place of the faces of its node,
 * and a place that is not free is reported.
 */
export function drawAttached(laid: Layout, attached: Attached, ruler: Ruler): Layout {
  const cells = ruler.terminal === true;
  const td = attached.graph.direction === 'TD';
  const clear = cells ? CLEAR_CELLS : CLEAR;
  const nodes: LayoutNode[] = [...laid.nodes];
  const edges: LayoutEdge[] = [...laid.edges];
  const diagnostics: Diagnostic[] = [...laid.diagnostics];
  const clusters: LayoutCluster[] = [...(laid.clusters ?? [])];
  const byId = new Map(nodes.map((n) => [n.id, n] as const));
  const placed: Rect[] = [];
  for (const e of edges) for (const l of [e.label, e.startLabel, e.endLabel]) if (l && !e.invisible) placed.push({ x: l.x, y: l.y, w: l.w, h: l.h });
  const wire: Segment[] = edges.flatMap((e) => (e.invisible ? [] : segmentsOf(wireOf(e, byId, cells))));
  // A terminal line is named by the cells it runs through, so a rect of w cells reaches w - 1 past its first cell.
  const lineBox = (r: Rect): Rect => (cells ? { x: r.x, y: r.y, w: Math.max(0, r.w - 1), h: Math.max(0, r.h - 1) } : r);
  const taken = (r: Rect, besides: string): boolean =>
    nodes.some((n) => n.id !== besides && overlaps(grow(r, clear), n)) || placed.some((p) => overlaps(r, p)) || wire.some((s) => segmentToRect(s, lineBox(grow(r, cells ? 0 : clear))) < 1e-6);

  const drawn: Rect[] = [];
  /** The boxes of notes with the node they belong to, in the coordinates of the arrangement. */
  const owned: Array<{ rect: Rect; owner: Rect }> = [];
  const note = (spec: GraphNode): void => {
    const target = byId.get(spec.attach?.to ?? '');
    if (!spec.attach || !target) return;
    const size = measureNodes([spec], [], ruler, td);
    const w = size.w[0] ?? 0;
    const h = size.h[0] ?? 0;
    const side = spec.attach.side;
    const gap = cells ? NOTE_GAP_CELLS : NOTE_GAP;
    const slide = cells ? SLIDE_CELLS : SLIDE;
    const middle = cells ? { x: target.x + Math.floor(target.w / 2), y: target.y + Math.floor(target.h / 2) } : { x: target.x + target.w / 2, y: target.y + target.h / 2 };
    const half = (v: number): number => (cells ? Math.floor(v / 2) : v / 2);
    /** The place `k` slides out from the node and `j` boxes along its face: 0 is in line with the node, 1 and -1 are its neighbours. */
    const at = (k: number, j: number): Rect => {
      const away = gap + k * slide;
      if (side === 'left') return { x: tidy(target.x - away - w), y: tidy(middle.y - half(h) + j * (h + clear)), w, h };
      if (side === 'right') return { x: tidy(target.x + target.w + away), y: tidy(middle.y - half(h) + j * (h + clear)), w, h };
      return { x: tidy(middle.x - half(w) + j * (w + clear)), y: tidy(target.y - away - h), w, h };
    };
    // The line runs from the middle of the stretch of the node's face that the note faces.
    const joint = (r: Rect): number | undefined => {
      if (side === 'over') {
        const lo = Math.max(r.x, target.x);
        const hi = Math.min(r.x + r.w, target.x + target.w);
        return hi - lo >= clear ? tidy(cells ? Math.floor((lo + hi - 1) / 2) : (lo + hi) / 2) : undefined;
      }
      const lo = Math.max(r.y, target.y);
      const hi = Math.min(r.y + r.h, target.y + target.h);
      return hi - lo >= clear ? tidy(cells ? Math.floor((lo + hi - 1) / 2) : (lo + hi) / 2) : undefined;
    };
    // The space between the note and its node must be free of boxes as well, or the line would run through them.
    const between = (r: Rect): Rect =>
      side === 'left' ? { x: r.x + r.w, y: r.y, w: target.x - r.x - r.w, h: r.h } : side === 'right' ? { x: target.x + target.w, y: r.y, w: r.x - target.x - target.w, h: r.h } : { x: r.x, y: r.y + r.h, w: r.w, h: target.y - r.y - r.h };
    const ours = new Set(attached.notes.map((s) => s.id));
    let rect: Rect | undefined;
    let at0: number | undefined;
    for (let k = 0; k <= TRIES && rect === undefined; k++) {
      for (const j of [0, 1, -1, 2, -2]) {
        const r = at(k, j);
        const line = joint(r);
        if (line === undefined) continue;
        const gapRect = between(r);
        if (!taken(r, target.id) && !drawn.some((d) => overlaps(grow(r, clear), d)) && !nodes.some((n) => n.id !== target.id && !ours.has(n.id) && overlaps(gapRect, n))) {
          rect = r;
          at0 = line;
          break;
        }
      }
    }
    if (rect === undefined) {
      rect = at(0, 0);
      diagnostics.push({ kind: 'attach-overlap', nodes: [spec.id, target.id], message: `The note ${spec.id} beside ${target.id} overlaps a box, a text or a line.` });
    }
    const box: LayoutNode = { id: spec.id, lane: target.lane, rank: target.rank, span: 1, row: target.row, x: rect.x, y: rect.y, w: rect.w, h: rect.h, title: spec.title, lines: spec.lines, shape: 'note', ...(spec.cluster === undefined ? {} : { cluster: spec.cluster }) };
    nodes.push(box);
    byId.set(box.id, box);
    drawn.push(rect);
    owned.push({ rect, owner: target });
    const style: EdgeStyle = 'dotted';
    const row = at0 ?? tidy(middle.y);
    const col = at0 ?? tidy(middle.x);
    const points: Point[] =
      side === 'left'
        ? [{ x: rect.x + rect.w, y: row }, { x: target.x, y: row }]
        : side === 'right'
          ? [{ x: target.x + target.w, y: row }, { x: rect.x, y: row }]
          : [{ x: col, y: rect.y + rect.h }, { x: col, y: target.y }];
    const [from, to] = side === 'right' ? [target.id, spec.id] : [spec.id, target.id];
    edges.push({ from, to, style, end: 'none', points });
  };
  for (const spec of attached.notes) note(spec);

  const small = (text: string): { w: number; h: number } =>
    cells ? { w: ruler.textWidth(text, 'edge'), h: 1 } : { w: Math.ceil(ruler.textWidth(text, 'edge') * SMALL), h: SMALL_HEIGHT };
  const faces: Face[] = td ? ['top', 'right', 'left', 'bottom'] : ['top', 'bottom', 'left', 'right'];
  const bounds: Rect = { x: 0, y: 0, w: laid.width, h: laid.height };
  const stub = (spec: GraphEdge): void => {
    const target = byId.get(spec.from);
    if (!target) return;
    const text = spec.endLabel ?? '';
    const label = small(text);
    interface Spot {
      line: Rect;
      ring: Rect;
      text: Rect;
      points: Point[];
    }
    const spots: Spot[] = [];
    for (const face of faces) {
      for (const f of FRACTIONS) {
        const ahead = AHEAD[face];
        const vertical = face === 'top' || face === 'bottom';
        const along = vertical ? target.w : target.h;
        const slot = cells ? 1 + Math.floor((along - 2) * f) : Math.round((along * f) / 4) * 4;
        const p0: Point =
          face === 'top' ? { x: target.x + slot, y: target.y } : face === 'bottom' ? { x: target.x + slot, y: target.y + target.h } : face === 'left' ? { x: target.x, y: target.y + slot } : { x: target.x + target.w, y: target.y + slot };
        // A terminal draws the stub in 2 line cells and the ring cell; the ends on the left and top borders are drawn one cell further out.
        const reach = cells ? (face === 'top' || face === 'left' ? 3 : 2) : STEM + RING;
        const p1: Point = { x: p0.x + ahead.x * reach, y: p0.y + ahead.y * reach };
        const centre: Point = cells ? p1 : { x: p0.x + ahead.x * (STEM + RING / 2), y: p0.y + ahead.y * (STEM + RING / 2) };
        const ring: Rect = cells ? { x: p1.x, y: p1.y, w: 1, h: 1 } : { x: centre.x - RING / 2, y: centre.y - RING / 2, w: RING, h: RING };
        // A terminal stub fills three cells outside the border: two of line and the ring.
        const line: Rect = cells
          ? { x: face === 'left' ? p1.x : p0.x, y: face === 'top' ? p1.y : p0.y, w: vertical ? 1 : 3, h: vertical ? 3 : 1 }
          : { x: Math.min(p0.x, p1.x) - (vertical ? RING / 2 : 0), y: Math.min(p0.y, p1.y) - (vertical ? 0 : RING / 2), w: vertical ? RING : reach, h: vertical ? reach : RING };
        const sides: Rect[] = vertical
          ? cells
            ? [{ x: ring.x + 2, y: ring.y, ...label }, { x: ring.x - 1 - label.w, y: ring.y, ...label }]
            : [{ x: centre.x + RING / 2 + RING_TEXT, y: centre.y - label.h / 2, ...label }, { x: centre.x - RING / 2 - RING_TEXT - label.w, y: centre.y - label.h / 2, ...label }]
          : cells
            ? [{ x: ring.x - Math.floor((label.w - 1) / 2), y: ring.y - 1, ...label }, { x: ring.x - Math.floor((label.w - 1) / 2), y: ring.y + 1, ...label }]
            : [{ x: centre.x - label.w / 2, y: centre.y - RING / 2 - RING_TEXT - label.h, ...label }, { x: centre.x - label.w / 2, y: centre.y + RING / 2 + RING_TEXT, ...label }];
        for (const t of sides) spots.push({ line, ring, text: { x: tidy(t.x), y: tidy(t.y), w: t.w, h: t.h }, points: [p0, p1] });
      }
    }
    const free = (s: Spot): boolean => !taken(s.line, target.id) && !taken(s.text, '') && !drawn.some((d) => overlaps(s.line, d) || overlaps(s.text, d));
    // A stub stays inside its zone: it neither leaves a cluster box nor enters one its node is not in.
    const keeps = (s: Spot): boolean => clusters.every((c) => !overlaps(c, s.line) || inside(s.line, c) === inside(target, c));
    const within = (s: Spot): boolean => inside(union(s.line, s.text), bounds);
    const pick = spots.find((s) => within(s) && keeps(s) && free(s)) ?? spots.find((s) => keeps(s) && free(s)) ?? spots.find(free);
    const spot = pick ?? (spots[0] as Spot);
    if (!pick) diagnostics.push({ kind: 'attach-overlap', nodes: [spec.from], message: `The interface ${text} at ${spec.from} overlaps a box, a text or a line.` });
    drawn.push(spot.line, spot.text);
    const endLabel: EndLabel = { text, x: spot.text.x, y: spot.text.y, w: spot.text.w, h: spot.text.h };
    wire.push([spot.points[0] as Point, spot.points[1] as Point]);
    edges.push({ from: spec.from, to: spec.from, style: spec.style, end: 'lollipop', points: spot.points, endLabel });
  };
  for (const spec of attached.stubs) stub(spec);

  // The canvas grows by what the new boxes, stubs and texts take beyond the old content; the margin the drawing had stays.
  const content = (l: Layout): Rect => {
    let r: Rect | undefined;
    const add = (b: Rect): void => {
      r = r === undefined ? b : union(r, b);
    };
    l.nodes.forEach(add);
    l.lanes.forEach(add);
    (l.clusters ?? []).forEach(add);
    for (const e of l.edges) {
      e.points.forEach((p) => add({ x: p.x, y: p.y, w: 0, h: 0 }));
      for (const t of [e.label, e.startLabel, e.endLabel]) if (t) add(t);
    }
    return r ?? { x: 0, y: 0, w: 0, h: 0 };
  };
  const before = content(laid);
  const after = content({ ...laid, nodes, edges });
  const dx = Math.max(0, before.x - after.x);
  const dy = Math.max(0, before.y - after.y);
  const right = Math.max(0, after.x + after.w - (before.x + before.w));
  const bottom = Math.max(0, after.y + after.h - (before.y + before.h));
  const moved = <T extends Rect>(b: T): T => ({ ...b, x: tidy(b.x + dx), y: tidy(b.y + dy) });
  const shiftPoint = (p: Point): Point => ({ x: tidy(p.x + dx), y: tidy(p.y + dy) });
  // A zone that holds the node a note belongs to takes the note in with it.
  const stretch = <T extends Rect>(zone: T): T =>
    owned.reduce<T>((z, o) => (inside(o.owner, zone) && !inside(o.rect, z) ? { ...z, ...union(z, grow(o.rect, cells ? 1 : 12)) } : z), zone);
  const lanes = laid.lanes.map((lane): LayoutLane => ({ ...moved(stretch(lane)), labelBox: moved(lane.labelBox) }));
  const grownClusters = clusters.map((c): LayoutCluster => moved(stretch(c)));
  return {
    ...laid,
    width: tidy(Math.max(laid.width + dx + right, after.x + after.w + dx + Math.max(0, laid.width - before.x - before.w))),
    height: tidy(Math.max(laid.height + dy + bottom, after.y + after.h + dy + Math.max(0, laid.height - before.y - before.h))),
    lanes,
    ...(laid.clusters === undefined ? {} : { clusters: grownClusters }),
    nodes: nodes.map((n): LayoutNode => ({ ...moved(n), ...(n.outline ? { outline: moved(n.outline) } : {}) })),
    edges: edges.map((e): LayoutEdge => ({
      ...e,
      points: e.points.map(shiftPoint),
      ...(e.label ? { label: moved(e.label) } : {}),
      ...(e.startLabel ? { startLabel: moved(e.startLabel) } : {}),
      ...(e.endLabel ? { endLabel: moved(e.endLabel) } : {}),
    })),
    diagnostics,
  };
}
