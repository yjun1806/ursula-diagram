import type { Layout, LayoutEdge, LayoutLane, LayoutNode, Point } from '../types.ts';

type Box = { x: number; y: number; w: number; h: number };

const tidy = (v: number): number => {
  const r = Math.round(v * 1e6) / 1e6;
  return r === 0 ? 0 : r;
};

/**
 * The layout flipped about the middle of its drawing: `RL` flips the horizontal axis, `BT` the vertical one.
 * Boxes keep their size, so text placed from a box (centred in it, or starting at its corner) is not turned over.
 * `base` is the size of the drawing without a legend; the legend is not part of the flip.
 */
export function mirrorLayout(layout: Layout, how: 'RL' | 'BT', base: { width: number; height: number }): Layout {
  const horizontal = how === 'RL';
  const flipBox = <T extends Box>(b: T): T => (horizontal ? { ...b, x: tidy(base.width - b.x - b.w) } : { ...b, y: tidy(base.height - b.y - b.h) });
  const flipPoint = (p: Point): Point => (horizontal ? { x: tidy(base.width - p.x), y: p.y } : { x: p.x, y: tidy(base.height - p.y) });
  const lanes = layout.lanes.map((lane): LayoutLane => ({ ...flipBox(lane), labelBox: flipBox(lane.labelBox) }));
  const nodes = layout.nodes.map((node): LayoutNode => ({ ...flipBox(node), ...(node.outline ? { outline: flipBox(node.outline) } : {}) }));
  const edges = layout.edges.map((edge): LayoutEdge => ({
    ...edge,
    points: edge.points.map(flipPoint),
    ...(edge.label ? { label: flipBox(edge.label) } : {}),
  }));
  return { ...layout, direction: how, lanes, nodes, edges };
}
