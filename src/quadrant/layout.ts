import { ceilTo, floorTo } from '../chart/grid.ts';
import { nearestSeries } from '../chart/series-color.ts';
import type { Ruler } from '../metrics.ts';
import { SCENE_THEME_SPECS } from '../render/scene-theme.ts';
import type { Theme } from '../render/theme.ts';
import { wrapWords } from '../text/wrap.ts';
import type { Scene, SceneItem } from '../types.ts';
import { quadrantOf } from './parse.ts';
import type { QuadrantChart } from './parse.ts';
import { DEFAULT_THEME } from '../render/theme.ts';

const MARGIN = 40;
const DEFAULT_PLOT = 448;
const ZONE_GAP = 4;
const ZONE_PAD = 16;
const LINE_H = 16;
const LABEL_GAP = 8;
/** Radius of the ring at the tail (low end) of an axis arrow. */
const PORT_R = 4;
const TITLE_SCALE = 15 / 13;
/** Multiplier on the ruler widths for the medium and bold weights; the ruler already measures wide. */
const WEIGHT = 1;


interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type LabelSide = 'right' | 'left' | 'above' | 'below';

export interface PlacedPoint {
  name: string;
  x: number;
  y: number;
  cx: number;
  cy: number;
  r: number;
  quadrant: 1 | 2 | 3 | 4;
  label: Rect & { side: LabelSide; text: string };
  /** The name overlaps something on every side and stays on the right. */
  crowded: boolean;
}

export interface PlacedZone extends Rect {
  quadrant: 1 | 2 | 3 | 4;
  lines: string[];
}

export interface QuadrantLayout {
  scene: Scene;
  plot: Rect;
  zones: PlacedZone[];
  points: PlacedPoint[];
  /** Style and configuration entries read and not drawn. */
  ignored: string[];
}

function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

function touchesCircle(rect: Rect, cx: number, cy: number, r: number): boolean {
  const nx = Math.max(rect.x, Math.min(cx, rect.x + rect.w));
  const ny = Math.max(rect.y, Math.min(cy, rect.y + rect.h));
  return (nx - cx) ** 2 + (ny - cy) ** 2 < r * r;
}

function inside(inner: Rect, outer: Rect): boolean {
  return inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h;
}

/** Computes the scene of a quadrant chart; the theme sets the default point radius. */
export function layoutQuadrant(chart: QuadrantChart, ruler: Ruler, theme: Theme = DEFAULT_THEME): QuadrantLayout {
  const body = (s: string): number => ruler.textWidth(s, 'line') * WEIGHT;
  const name = (s: string): number => ruler.textWidth(s, 'title') * WEIGHT;
  const plain = (s: string): number => ruler.textWidth(s, 'line');
  const spec = SCENE_THEME_SPECS[theme];

  const plotW = chart.chartWidth ?? DEFAULT_PLOT;
  const plotH = chart.chartHeight ?? DEFAULT_PLOT;
  const yW = chart.yAxis === undefined ? 0 : Math.max(body(chart.yAxis.low), chart.yAxis.high === undefined ? 0 : body(chart.yAxis.high));
  const titleW = chart.title === undefined ? 0 : ruler.textWidth(chart.title, 'title') * TITLE_SCALE * WEIGHT;
  const plotX = chart.yAxis === undefined ? MARGIN : ceilTo(MARGIN + yW + 16);
  const top = chart.title === undefined ? MARGIN : 80;
  const bottom = top + plotH;
  const right = plotX + plotW;
  const plot: Rect = { x: plotX, y: top, w: plotW, h: plotH };

  const items: SceneItem[] = [];
  let width = Math.max(right + MARGIN, MARGIN + titleW + MARGIN);
  const height = bottom + (chart.xAxis === undefined ? MARGIN : 24 + MARGIN);

  if (chart.title !== undefined) items.push({ kind: 'text', x: MARGIN, y: 56, text: chart.title, anchor: 'start', role: ['title'], baseline: 'alphabetic' });

  // Zones: quadrant-2 top left, 1 top right, 3 bottom left, 4 bottom right; neighbours alternate in fill.
  const zw = (plotW - ZONE_GAP) / 2;
  const zh = (plotH - ZONE_GAP) / 2;
  const zones: PlacedZone[] = [];
  const cell: Array<[1 | 2 | 3 | 4, number, number]> = [
    [2, 0, 0],
    [1, 1, 0],
    [3, 0, 1],
    [4, 1, 1],
  ];
  for (const [quadrant, col, row] of cell) {
    const x = plotX + col * (zw + ZONE_GAP);
    const y = top + row * (zh + ZONE_GAP);
    const text = chart.quadrants[quadrant - 1] ?? '';
    const lines = text === '' ? [] : wrapWords(text, zw - 2 * ZONE_PAD, name);
    zones.push({ x, y, w: zw, h: zh, quadrant, lines });
    items.push({ kind: 'box', style: 'frame', x, y, w: zw, h: zh, role: (col + row) % 2 === 0 ? ['zone'] : ['zone', 'zone--plain'] });
  }
  for (const z of zones) {
    z.lines.forEach((line, i) => items.push({ kind: 'text', x: z.x + ZONE_PAD, y: z.y + 28 + i * LINE_H, text: line, anchor: 'start', role: ['zone-name'], baseline: 'alphabetic' }));
  }

  // Axes: both end names with an arrow between them, or the one name alone.
  if (chart.xAxis !== undefined) {
    const y = bottom + 24;
    const { low, high } = chart.xAxis;
    items.push({ kind: 'text', x: plotX, y, text: low, anchor: 'start', role: ['axis-name'], baseline: 'alphabetic' });
    if (high !== undefined) {
      items.push({ kind: 'text', x: right, y, text: high, anchor: 'end', role: ['axis-name'], baseline: 'alphabetic' });
      const x1 = ceilTo(plotX + body(low) + 16);
      const x2 = floorTo(right - body(high) - 16);
      if (x2 - x1 >= 24) items.push({ kind: 'line', points: [{ x: x1, y: y - 4 }, { x: x2, y: y - 4 }], role: ['edge', 'edge--arrow'] }, { kind: 'circle', cx: x1, cy: y - 4, r: PORT_R, role: ['port'] });
    }
  }
  if (chart.yAxis !== undefined) {
    const x = plotX - 16;
    const { low, high } = chart.yAxis;
    // The low name stands on a line just above the plot's bottom edge; the high name hangs from its top edge.
    items.push({ kind: 'text', x, y: bottom - 4, text: low, anchor: 'end', role: ['axis-name'], baseline: 'alphabetic' });
    if (high !== undefined) {
      items.push({ kind: 'text', x, y: top + 12, text: high, anchor: 'end', role: ['axis-name'], baseline: 'alphabetic' });
      const y1 = floorTo(bottom - 32);
      const y2 = ceilTo(top + 32);
      if (y1 - y2 >= 24) items.push({ kind: 'line', points: [{ x: plotX - 20, y: y1 }, { x: plotX - 20, y: y2 }], role: ['edge', 'edge--arrow'] }, { kind: 'circle', cx: plotX - 20, cy: y1, r: PORT_R, role: ['port'] });
    }
  }

  // Points sit at their value inside the whole plot square; the stroke of a dot reaches 1.25 past its radius.
  const dots = chart.points.map((p) => ({
    cx: plotX + p.x * plotW,
    cy: bottom - p.y * plotH,
    r: p.radius ?? spec.dotRadius,
  }));
  const obstacles: Rect[] = [
    { x: plotX + zw, y: top, w: ZONE_GAP, h: plotH },
    { x: plotX, y: top + zh, w: plotW, h: ZONE_GAP },
  ];
  for (const z of zones) {
    z.lines.forEach((line, i) => obstacles.push({ x: z.x + ZONE_PAD, y: z.y + 28 + i * LINE_H - LINE_H / 2, w: name(line), h: LINE_H }));
  }

  const placed: PlacedPoint[] = [];
  chart.points.forEach((p, i) => {
    const d = dots[i];
    if (d === undefined) return;
    const w = plain(p.name) * WEIGHT;
    const right: Rect = { x: d.cx + d.r + LABEL_GAP, y: d.cy - LINE_H / 2, w, h: LINE_H };
    const candidates: Array<[LabelSide, Rect]> = [
      ['right', right],
      ['left', { x: d.cx - d.r - LABEL_GAP - w, y: d.cy - LINE_H / 2, w, h: LINE_H }],
      ['above', { x: d.cx - w / 2, y: d.cy - d.r - LABEL_GAP - LINE_H, w, h: LINE_H }],
      ['below', { x: d.cx - w / 2, y: d.cy + d.r + LABEL_GAP, w, h: LINE_H }],
    ];
    const free = (r: Rect): boolean => {
      const padded = { x: r.x - 2, y: r.y - 2, w: r.w + 4, h: r.h + 4 };
      return (
        inside(r, plot) &&
        !obstacles.some((o) => intersects(padded, o)) &&
        !placed.some((q) => intersects(padded, q.label)) &&
        !dots.some((o) => touchesCircle(padded, o.cx, o.cy, o.r + 1.25))
      );
    };
    const chosen = candidates.find(([, r]) => free(r));
    const [side, rect] = chosen ?? ['right', { ...right, x: Math.min(right.x, plotX + plotW - right.w) }];
    placed.push({
      name: p.name,
      x: p.x,
      y: p.y,
      cx: d.cx,
      cy: d.cy,
      r: d.r,
      quadrant: quadrantOf(p.x, p.y),
      label: { ...rect, side, text: p.name },
      crowded: chosen === undefined,
    });
  });

  for (const q of placed) {
    const color = chart.points[placed.indexOf(q)]?.color;
    const role = color === undefined ? ['mark-dot'] : [`series-${nearestSeries(color, { skipFirst: true })}--dot`];
    items.push({ kind: 'circle', cx: q.cx, cy: q.cy, r: q.r, role, data: { name: q.name } });
  }
  for (const q of placed) {
    const l = q.label;
    const anchor = l.side === 'right' ? 'start' : l.side === 'left' ? 'end' : 'middle';
    const x = l.side === 'right' ? l.x : l.side === 'left' ? l.x + l.w : l.x + l.w / 2;
    items.push({ kind: 'text', x, y: l.y + LINE_H / 2, text: q.name, anchor, role: ['body'] });
    width = Math.max(width, ceilTo(l.x + l.w + MARGIN));
  }

  items.unshift({ kind: 'box', style: 'frame', x: 16, y: 16, w: width - 32, h: height - 32, role: ['panel'] });
  const scene: Scene = { width, height, title: chart.accTitle ?? chart.title ?? 'Quadrant chart', items, theme };
  return { scene, plot, zones, points: placed, ignored: chart.ignored };
}
