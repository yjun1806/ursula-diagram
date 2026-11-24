import { trimmedNumber } from '../chart/format.ts';
import { ceilTo, FLOAT_NOISE, floorTo } from '../chart/grid.ts';
import { anchoredBox, boxesOverlap } from '../chart/label-place.ts';
import type { Box, TextAnchor } from '../chart/label-place.ts';
import { niceTicks } from '../chart/ticks.ts';
import type { Ruler } from '../metrics.ts';
import { SCENE_THEME } from '../render/scene-theme.ts';
import { num } from '../render/svg.ts';
import { UrsulaError } from '../types.ts';
import type { Point, Scene, SceneItem } from '../types.ts';
import type { Radar } from './model.ts';

/** Distance from the centre to the outer end of an axis. */
export const RADIUS = 200;
const MARGIN = 40;
const TEXT_H = 16;
const LABEL_GAP = 16;
const NAME_GAP = 16;
const SWATCH = 12;
const LEGEND_GAP = 30;

type Anchor = TextAnchor;

interface Label {
  x: number;
  y: number;
  text: string;
  anchor: Anchor;
  role: string[];
  w: number;
  data?: Record<string, string>;
}

export interface RadarSeriesLayout {
  id: string;
  label: string;
  /** Vertices of the polygon, in absolute coordinates. */
  points: Point[];
}

export interface RadarLayout {
  scene: Scene;
  width: number;
  height: number;
  center: Point;
  radius: number;
  scale: { min: number; max: number };
  rings: number[];
  series: RadarSeriesLayout[];
  /** Boxes of every text, for checks of overlap. */
  textBoxes: Array<{ text: string } & Box>;
}


const boxOf = (l: Label): Box => anchoredBox(l.x, l.y, l.w, l.anchor, TEXT_H);

function inside(p: Point, poly: Point[]): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a === undefined || b === undefined) continue;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
  }
  return hit;
}

const tickText = (v: number): string => trimmedNumber(v, 2);

/** Whether the segment from `p` to `q` passes through the box, shrunk by 1 so that a touch does not count. */
export function segmentHitsBox(p: Point, q: Point, b: Box): boolean {
  const x0 = b.x0 + 1;
  const x1 = b.x1 - 1;
  const y0 = b.y0 + 1;
  const y1 = b.y1 - 1;
  let t0 = 0;
  let t1 = 1;
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  for (const [den, num] of [
    [-dx, p.x - x0],
    [dx, x1 - p.x],
    [-dy, p.y - y0],
    [dy, y1 - p.y],
  ] as const) {
    if (den === 0) {
      if (num < 0) return false;
      continue;
    }
    const t = num / den;
    if (den < 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t0 > t1) return false;
  }
  return true;
}

/** Rings and the value at the outer end of the axes. */
export function radarScale(model: Radar): { min: number; max: number; rings: number[] } {
  const min = model.min ?? 0;
  const all = model.curves.flatMap((c) => c.values);
  const dataMax = all.length === 0 ? min + 1 : Math.max(...all);
  const eps = 1e-9;
  const guide = model.max ?? (dataMax > min ? dataMax : min + 1);
  if (guide <= min) throw new UrsulaError(`max (${guide}) must be greater than min (${min})`, 'range');
  if (model.ticks !== undefined) {
    const top = model.max ?? niceTicks(min, guide, model.ticks + 1).at(-1) ?? guide;
    const rings = Array.from({ length: model.ticks }, (_, i) => min + ((top - min) * (i + 1)) / (model.ticks ?? 1));
    return { min, max: top, rings };
  }
  const ticks = niceTicks(min, guide);
  const top = model.max ?? ticks.at(-1) ?? guide;
  return { min, max: top, rings: ticks.filter((v) => v > min + eps && v <= top + eps) };
}

/** Places a radar chart: axes clockwise from 12 o'clock, rings, one polygon per curve, value labels and a legend. */
export function layoutRadar(model: Radar, ruler: Ruler): RadarLayout {
  const n = model.axes.length;
  const R = RADIUS;
  const { min, max, rings } = radarScale(model);
  const textW = (text: string, px: number): number => (ruler.textWidth(text, 'line') * px) / 12;
  const dirOf = (i: number): Point => ({ x: Math.sin((2 * Math.PI * i) / n), y: -Math.cos((2 * Math.PI * i) / n) });
  const at = (i: number, r: number): Point => {
    const d = dirOf(i);
    return { x: d.x * r, y: d.y * r };
  };
  const radiusOf = (v: number): number => ((Math.min(max, Math.max(min, v)) - min) / (max - min)) * R;

  // Coordinates here are relative to the centre.
  const polygons = model.curves.map((c) => c.values.map((v, i) => at(i, radiusOf(v))));
  const placed: Box[] = [];
  const edges = polygons.flatMap((pts) => pts.map((p, i) => [p, pts[(i + 1) % pts.length] as Point] as const));
  const free = (b: Box): boolean => placed.every((p) => !boxesOverlap(b, p, 1));
  const clearOfEdges = (b: Box): boolean => edges.every(([p, q]) => !segmentHitsBox(p, q, b));

  const names: Label[] = model.axes.map((a, i) => {
    const d = dirOf(i);
    const e = at(i, R);
    return {
      x: e.x + d.x * NAME_GAP,
      y: e.y + d.y * NAME_GAP + d.y * Math.abs(d.y) * 8,
      text: a.label,
      anchor: d.x > 0.2 ? 'start' : d.x < -0.2 ? 'end' : 'middle',
      role: ['name'],
      w: ruler.textWidth(a.label, 'title'),
      data: { axis: a.id },
    };
  });
  for (const l of names) placed.push(boxOf(l));

  // Ring labels stand on the ring in the gap between two axes that lies nearest to 3 o'clock.
  const gaps = Array.from({ length: n }, (_, k) => k).sort((a, b) => {
    const da = Math.abs(((a + 0.5) * 360) / n - 90);
    const db = Math.abs(((b + 0.5) * 360) / n - 90);
    return da - db || a - b;
  });
  const widest = Math.max(0, ...rings.map((v) => textW(tickText(v), 11)));
  const spacing = rings.length > 1 ? (R * ((rings[1] ?? 0) - (rings[0] ?? 0))) / (max - min) : R;
  const every = Math.max(1, Math.ceil((widest + 6) / Math.max(1, spacing)));
  const ringPoint = (gap: number, v: number): Point => {
    const a = (2 * Math.PI * (gap + 0.5)) / n;
    const r = ((v - min) / (max - min)) * R;
    return { x: Math.sin(a) * r, y: -Math.cos(a) * r };
  };
  const shown = rings.filter((_, i) => (rings.length - 1 - i) % every === 0);
  const tickLabels = (gap: number): Label[] =>
    shown.map((v) => {
      const p = ringPoint(gap, v);
      const text = tickText(v);
      return { x: p.x, y: p.y, text, anchor: 'middle', role: ['tick'], w: textW(text, 11) };
    });
  const gapOk = (gap: number): boolean => tickLabels(gap).every((l) => free(boxOf(l)));
  const gap = gaps.find((g) => gapOk(g) && tickLabels(g).every((l) => clearOfEdges(boxOf(l)))) ?? gaps.find(gapOk) ?? gaps[0] ?? 0;
  const onArea = (p: Point): boolean => model.filled && polygons.some((poly) => inside(p, poly));
  const ticks = tickLabels(gap).map((l): Label => (onArea(l) ? l : { ...l, role: ['tick', 'tick--halo'] }));
  for (const l of ticks) placed.push(boxOf(l));

  // Values: on each axis the largest stands outside its point, the others inside; curves that meet at one point share one label.
  const values: Label[] = [];
  model.axes.forEach((axis, i) => {
    const d = dirOf(i);
    const all = model.curves
      .map((c, k) => ({ k, v: c.values[i] ?? min, r: radiusOf(c.values[i] ?? min) }))
      .sort((a, b) => b.r - a.r || a.k - b.k);
    const entries = all.filter((e, at) => at === 0 || Math.abs((all[at - 1]?.r ?? 0) - e.r) > FLOAT_NOISE);
    const seriesAt = (r: number): string => all.filter((x) => Math.abs(x.r - r) <= FLOAT_NOISE).map((x) => model.curves[x.k]?.id ?? '').join(' ');
    entries.forEach((e, rank) => {
      const text = tickText(e.v);
      const w = textW(text, 11);
      const offsets = rank === 0 ? [LABEL_GAP, -LABEL_GAP] : [-LABEL_GAP];
      for (let o = -LABEL_GAP - 4; o >= -LABEL_GAP - 4 * 30; o -= 4) offsets.push(o);
      const make = (off: number): Label => ({
        x: d.x * (e.r + off),
        y: d.y * (e.r + off),
        text,
        anchor: 'middle',
        role: ['value'],
        w,
        data: { axis: axis.id, series: seriesAt(e.r), value: text },
      });
      const label =
        offsets.map(make).find((l) => free(boxOf(l)) && clearOfEdges(boxOf(l))) ?? offsets.map(make).find((l) => free(boxOf(l))) ?? make(offsets[0] ?? LABEL_GAP);
      placed.push(boxOf(label));
      values.push(onArea(label) ? { ...label, role: ['value', 'value--plain'] } : label);
    });
  });

  // Extent of the chart around the centre.
  const boxes = [...names, ...ticks, ...values].map(boxOf);
  const minX = Math.min(-R, ...boxes.map((b) => b.x0));
  const maxX = Math.max(R, ...boxes.map((b) => b.x1));
  const minY = Math.min(-R, ...boxes.map((b) => b.y0));
  const maxY = Math.max(R, ...boxes.map((b) => b.y1));

  const titleW = model.title === undefined ? 0 : (ruler.textWidth(model.title, 'title') * 15) / 13;
  const legendOn = model.showLegend && model.curves.length > 0;
  // Text widths are estimated a little wide, so the half width and the centre round down to the grid rather than up.
  let width = 2 * floorTo(Math.max(-minX, maxX) + MARGIN, 4, FLOAT_NOISE);
  width = Math.max(width, ceilTo(titleW + 2 * MARGIN, 8, FLOAT_NOISE));
  const itemW = model.curves.map((c) => SWATCH + 8 + textW(c.label, 12));
  const rowsOf = (avail: number): number[][] => {
    const out: number[][] = [[]];
    let used = 0;
    itemW.forEach((w, k) => {
      const row = out[out.length - 1] ?? [];
      if (row.length > 0 && used + LEGEND_GAP + w > avail) {
        out.push([k]);
        used = w;
      } else {
        row.push(k);
        used += (row.length > 1 ? LEGEND_GAP : 0) + w;
      }
    });
    return out;
  };
  const legendRows = legendOn ? rowsOf(width - 2 * MARGIN) : [];
  const rowWidth = (row: number[]): number => row.reduce((s, k, j) => s + (j > 0 ? LEGEND_GAP : 0) + (itemW[k] ?? 0), 0);
  width = Math.max(width, ceilTo(Math.max(0, ...legendRows.map(rowWidth)) + 2 * MARGIN, 8));

  const titleY = 52;
  const cx = width / 2;
  const cy = floorTo((model.title === undefined ? MARGIN : titleY + 10 + 12) - minY, 4, FLOAT_NOISE);
  const contentBottom = cy + maxY;
  const legendTop = ceilTo(contentBottom + 16, 4, FLOAT_NOISE);
  const legendBottom = legendTop + (legendRows.length > 0 ? legendRows.length * 24 - 8 : 0);
  const height = ceilTo((legendRows.length > 0 ? legendBottom : contentBottom) + MARGIN, 4, FLOAT_NOISE);

  const items: SceneItem[] = [];
  const P = (p: Point): Point => ({ x: cx + p.x, y: cy + p.y });
  const poly = (pts: Point[]): string => `M${pts.map((p) => `${num(p.x)} ${num(p.y)}`).join(' L')} Z`;
  const text = (l: Label): SceneItem => ({
    kind: 'text',
    x: cx + l.x,
    y: cy + l.y,
    text: l.text,
    anchor: l.anchor,
    role: l.role,
    ...(l.data === undefined ? {} : { data: l.data }),
  });

  items.push({ kind: 'box', style: 'frame', x: 16, y: 16, w: width - 32, h: height - 32, role: ['panel'] });
  if (model.title !== undefined) items.push({ kind: 'text', x: MARGIN, y: titleY, text: model.title, anchor: 'start', role: ['title'] });
  for (const v of rings) {
    const r = ((v - min) / (max - min)) * R;
    if (model.graticule === 'circle') items.push({ kind: 'circle', cx, cy, r, role: ['grid'] });
    else items.push({ kind: 'path', d: poly(Array.from({ length: n }, (_, i) => P(at(i, r)))), role: ['grid'] });
  }
  for (let i = 0; i < n; i++) {
    const e = P(at(i, R));
    items.push({ kind: 'path', d: `M${num(cx)} ${num(cy)} L${num(e.x)} ${num(e.y)}`, role: ['grid'] });
  }
  const seriesNo = (k: number): number => model.colors?.[k] ?? (k % 8) + 1;
  polygons.forEach((pts, k) => {
    items.push({ kind: 'path', d: poly(pts.map(P)), role: [`series-${seriesNo(k)}--${model.filled ? 'overlap' : 'line'}`], data: { series: model.curves[k]?.id ?? '' } });
  });
  for (const l of ticks) items.push(text(l));
  polygons.forEach((pts, k) => {
    pts.forEach((p, i) => {
      const q = P(p);
      items.push({ kind: 'circle', cx: q.x, cy: q.y, r: SCENE_THEME.dotRadius, role: [`series-${seriesNo(k)}--dot`], data: { series: model.curves[k]?.id ?? '', axis: model.axes[i]?.id ?? '' } });
    });
  });
  for (const l of values) items.push(text(l));
  for (const l of names) items.push(text(l));
  legendRows.forEach((row, r) => {
    let x = MARGIN;
    const y = legendTop + r * 24 + 8;
    for (const k of row) {
      const c = model.curves[k];
      if (c === undefined) continue;
      items.push({ kind: 'box', style: 'label', x, y: y - SWATCH / 2, w: SWATCH, h: SWATCH, role: [`series-${seriesNo(k)}`, 'swatch'] });
      items.push({ kind: 'text', x: x + SWATCH + 8, y, text: c.label, anchor: 'start', role: ['legend'] });
      x += (itemW[k] ?? 0) + LEGEND_GAP;
    }
  });

  const abs = (b: Box): Box => ({ x0: b.x0 + cx, y0: b.y0 + cy, x1: b.x1 + cx, y1: b.y1 + cy });
  const textBoxes = [...names, ...ticks, ...values].map((l) => ({ text: l.text, ...abs(boxOf(l)) }));
  if (model.title !== undefined) textBoxes.push({ text: model.title, x0: MARGIN, y0: titleY - 10, x1: MARGIN + titleW, y1: titleY + 10 });
  legendRows.forEach((row, r) => {
    let x = MARGIN;
    const y = legendTop + r * 24 + 8;
    for (const k of row) {
      const c = model.curves[k];
      if (c === undefined) continue;
      const tw = textW(c.label, 12);
      textBoxes.push({ text: c.label, x0: x + SWATCH + 8, y0: y - 8, x1: x + SWATCH + 8 + tw, y1: y + 8 });
      x += (itemW[k] ?? 0) + LEGEND_GAP;
    }
  });

  const heading = model.title ?? `Radar chart: ${n} axes, ${model.curves.length} series`;
  return {
    scene: { width, height, title: heading, items },
    width,
    height,
    center: { x: cx, y: cy },
    radius: R,
    scale: { min, max },
    rings,
    series: polygons.map((pts, k) => ({ id: model.curves[k]?.id ?? '', label: model.curves[k]?.label ?? '', points: pts.map(P) })),
    textBoxes,
  };
}
