import type { Ruler } from '../metrics.ts';
import { ACTOR_NAME_GAP, ACTOR_NAME_H, fixedBody, ownSize } from '../layout/records.ts';
import type { LayoutEdge, LayoutNode, Point } from '../types.ts';

const EPS = 1e-6;

const tidy = (v: number): number => {
  const r = Math.round(v * 1e6) / 1e6;
  return r === 0 ? 0 : r;
};

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * The box a shape of a fixed size takes inside its slot, centred in it. An ellipse keeps the whole slot along the
 * reading direction, where its ports stand, and takes its own size across it, so that it is not stretched to the
 * thickness of the tallest box of its layer.
 */
function bodyOf(node: LayoutNode, td: boolean, ruler: Ruler): Box | undefined {
  const own = node.shape === 'ellipse' ? ownSize(node, td, ruler) : fixedBody(node.shape, td, ruler);
  if (!own) return undefined;
  const body = node.shape === 'ellipse' ? (td ? { w: own.w, h: node.h } : { w: node.w, h: own.h }) : own;
  const w = Math.min(node.w, body.w);
  const h = Math.min(node.h, body.h);
  return { x: tidy(node.x + (node.w - w) / 2), y: tidy(node.y + (node.h - h) / 2), w: tidy(w), h: tidy(h) };
}

/**
 * Moves the end `end` of an edge, whose neighbouring point is `next`, from the face of the slot it was drawn to onto
 * the face of the smaller box inside it, along the way the line runs. An end that is not on a face of the slot, or
 * that does not run across it, stays where it is.
 */
function reach(slot: Box, body: Box, end: Point, next: Point, below = 0): Point {
  const dx = end.x - next.x;
  const dy = end.y - next.y;
  if (Math.abs(dx) < EPS && Math.abs(dy) > EPS) {
    if (dy > 0 && Math.abs(end.y - slot.y) < EPS) return { x: end.x, y: body.y };
    if (dy < 0 && Math.abs(end.y - (slot.y + slot.h)) < EPS) return { x: end.x, y: body.y + body.h + below };
  } else if (Math.abs(dy) < EPS && Math.abs(dx) > EPS) {
    if (dx > 0 && Math.abs(end.x - slot.x) < EPS) return { x: body.x, y: end.y };
    if (dx < 0 && Math.abs(end.x - (slot.x + slot.w)) < EPS) return { x: body.x + body.w, y: end.y };
  }
  return end;
}

/**
 * Gives the dots, the bar and the actor the boxes they are drawn in, and lets the lines that ended on the faces of
 * their slots run on to those boxes. Terminal drawings draw these shapes as boxes and are left as they are.
 */
export function settleBodies(nodes: LayoutNode[], edges: LayoutEdge[], td: boolean, ruler: Ruler): LayoutNode[] {
  const bodies = new Map<string, { slot: Box; body: Box; below: number }>();
  const settled = nodes.map((node) => {
    const body = bodyOf(node, td, ruler);
    if (!body) return node;
    // The name of an actor stands under the figure: a line that comes from below stops under the name.
    bodies.set(node.id, { slot: { x: node.x, y: node.y, w: node.w, h: node.h }, body, below: node.shape === 'actor' ? ACTOR_NAME_GAP + ACTOR_NAME_H : 0 });
    return { ...node, ...body };
  });
  if (bodies.size === 0) return nodes;
  for (const edge of edges) {
    const pts = edge.points;
    if (pts.length < 2) continue;
    const first = bodies.get(edge.from);
    const last = bodies.get(edge.to);
    if (!first && !last) continue;
    const out = [...pts];
    if (first) out[0] = reach(first.slot, first.body, pts[0] as Point, pts[1] as Point, first.below);
    if (last) out[pts.length - 1] = reach(last.slot, last.body, pts[pts.length - 1] as Point, pts[pts.length - 2] as Point, last.below);
    edge.points = out.map((p) => ({ x: tidy(p.x), y: tidy(p.y) }));
  }
  return settled;
}
