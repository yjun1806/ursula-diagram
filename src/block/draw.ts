import { asymPoints, diamondPoints, hexagonPoints, leanLeftPoints, parallelogramPoints, roundedPolygonPath, trapBottomPoints, trapTopPoints } from '../render/shapes.ts';
import type { NodeShape, Point, SceneItem } from '../types.ts';
import type { ArrowDirection, PlacedBlock } from './model.ts';
import { CAP, HEAD_BARB, HEAD_LENGTH } from './size.ts';

const n = (v: number): string => String(Math.round(v * 100) / 100 || 0);
const at = (p: Point): string => `${n(p.x)} ${n(p.y)}`;

/** Distance of the two bars of a subroutine from its sides. */
const BAR_INSET = 20;
/** Gap between the two rings of a double circle. */
const RING_GAP = 4;
const POLYGON_RADIUS = 6;

type Box = { x: number; y: number; w: number; h: number; shape: NodeShape };

/** The corners of a block arrow: a body with a triangular head on each side the source named. */
export function arrowOutline(b: { x: number; y: number; w: number; h: number }, heads: readonly ArrowDirection[]): Point[] {
  const left = heads.includes('left');
  const right = heads.includes('right');
  const up = heads.includes('up');
  const down = heads.includes('down');
  const flatOnly = (left || right) && !(up || down);
  const tallOnly = (up || down) && !(left || right);
  const ex = tallOnly ? HEAD_BARB : 0;
  const ey = flatOnly ? HEAD_BARB : 0;
  const bx0 = b.x + (left ? HEAD_LENGTH : 0) + ex;
  const bx1 = b.x + b.w - (right ? HEAD_LENGTH : 0) - ex;
  const by0 = b.y + (up ? HEAD_LENGTH : 0) + ey;
  const by1 = b.y + b.h - (down ? HEAD_LENGTH : 0) - ey;
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const pts: Point[] = [
    ...(up ? [{ x: bx0 - ex, y: by0 }, { x: cx, y: b.y }, { x: bx1 + ex, y: by0 }] : [{ x: bx0, y: by0 }, { x: bx1, y: by0 }]),
    ...(right ? [{ x: bx1, y: by0 - ey }, { x: b.x + b.w, y: cy }, { x: bx1, y: by1 + ey }] : [{ x: bx1, y: by0 }, { x: bx1, y: by1 }]),
    ...(down ? [{ x: bx1 + ex, y: by1 }, { x: cx, y: b.y + b.h }, { x: bx0 - ex, y: by1 }] : [{ x: bx1, y: by1 }, { x: bx0, y: by1 }]),
    ...(left ? [{ x: bx0, y: by1 + ey }, { x: b.x, y: cy }, { x: bx0, y: by0 - ey }] : [{ x: bx0, y: by1 }, { x: bx0, y: by0 }]),
  ];
  return pts.filter((p, i) => {
    const prev = pts[(i + pts.length - 1) % pts.length] as Point;
    return p.x !== prev.x || p.y !== prev.y;
  });
}

/** The middle of the body of a block arrow, where its label stands. */
export function arrowBody(b: { x: number; y: number; w: number; h: number }, heads: readonly ArrowDirection[]): Point {
  const left = heads.includes('left') ? HEAD_LENGTH : 0;
  const right = heads.includes('right') ? HEAD_LENGTH : 0;
  const up = heads.includes('up') ? HEAD_LENGTH : 0;
  const down = heads.includes('down') ? HEAD_LENGTH : 0;
  return { x: b.x + (b.w + left - right) / 2, y: b.y + (b.h + up - down) / 2 };
}

/** The outline of a block and the line or lines that mark its kind, as scene items. */
export function shapeItems(b: PlacedBlock, role: string[]): SceneItem[] {
  const { x, y, w, h } = b;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const path = (d: string, r: string[] = role): SceneItem => ({ kind: 'path', d, role: r });
  const polygon = (points: Point[], radius = POLYGON_RADIUS): SceneItem => path(roundedPolygonPath(points, radius));
  const box: Box = { x, y, w, h, shape: b.shape === 'group' || b.shape === 'arrow' || b.shape === 'subroutine' || b.shape === 'cylinder' ? 'rect' : b.shape };
  switch (b.shape) {
    case 'stadium':
      return [{ kind: 'box', style: 'box', x, y, w, h, radius: h / 2, role }];
    case 'subroutine':
      return [
        { kind: 'box', style: 'box', x, y, w, h, role },
        ...[x + BAR_INSET, x + w - BAR_INSET].map((bx): SceneItem => ({ kind: 'line', points: [{ x: bx, y }, { x: bx, y: y + h }], role: ['rule'] })),
      ];
    case 'cylinder': {
      const arc = `A${n(w / 2)} ${CAP} 0 0`;
      return [
        path(`M${at({ x, y: y + CAP })} ${arc} 1 ${at({ x: x + w, y: y + CAP })} V${n(y + h - CAP)} ${arc} 1 ${at({ x, y: y + h - CAP })} Z`),
        path(`M${at({ x, y: y + CAP })} ${arc} 0 ${at({ x: x + w, y: y + CAP })}`, ['rule']),
      ];
    }
    case 'circle':
    case 'dbl-circle': {
      const ring = (r: number): string => `M${at({ x: cx - r, y: cy })} A${n(r)} ${n(r)} 0 1 0 ${at({ x: cx + r, y: cy })} A${n(r)} ${n(r)} 0 1 0 ${at({ x: cx - r, y: cy })} Z`;
      return [path(ring(w / 2)), ...(b.shape === 'dbl-circle' ? [path(ring(w / 2 - RING_GAP), ['rule'])] : [])];
    }
    case 'hexagon':
      return [polygon(hexagonPoints(box))];
    case 'parallelogram':
      return [polygon(parallelogramPoints(box))];
    case 'lean-l':
      return [polygon(leanLeftPoints(box))];
    case 'trap-b':
      return [polygon(trapBottomPoints(box))];
    case 'trap-t':
      return [polygon(trapTopPoints(box))];
    case 'asym':
      return [polygon(asymPoints(box))];
    case 'diamond':
      return [polygon(diamondPoints({ x, y, w, h }), 12)];
    case 'arrow':
      return [polygon(arrowOutline(b, b.heads ?? ['right']), 4)];
    default:
      return [{ kind: 'box', style: 'box', x, y, w, h, role }];
  }
}
