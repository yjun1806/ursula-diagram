import { arcPath } from '../chart/arc.ts';
import { ceilTo } from '../chart/grid.ts';
import type { Ruler } from '../metrics.ts';
import type { Scene, SceneItem } from '../types.ts';
import type { Pie } from './model.ts';

export const RADIUS = 160;
const GAP = 2;
const CORNER = 4;
/** The guide runs straight out from the circle, from `LEAD` to at least `ELBOW` outside it. */
const LEAD = 4;
const ELBOW = 16;
/** Distance from the end of the guide to the text. */
const TEXT_GAP = 6;
const LINE = 16;
const BLOCK = 2 * LINE;
const LABEL_GAP = 4;
/** Labels beside the circle keep this far from it. */
const CLEAR = 8;
/** Labels whose direction is this close to vertical sit above or below the slice, centred. */
const SIDE_MIN_SIN = 0.3;
const MARGIN = 40;
const TITLE_SIZE = 15;
const TITLE_LINE = 18;
const TITLE_GAP = 24;
/** Space under the title when a label, not the circle, is the topmost thing; the label's line height adds its own. */
const TITLE_GAP_LABEL = 12;
const PANEL_INSET = 16;
const SERIES = 8;

export interface PlacedSlice {
  label: string;
  value: number;
  /** Start and end angle in radians, 0 at 12 o'clock, clockwise. */
  a0: number;
  a1: number;
}

export interface PlacedLabel {
  index: number;
  anchor: 'start' | 'middle' | 'end';
  /** Anchor x of both lines and the box they stand in. */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PieLayout {
  scene: Scene;
  cx: number;
  cy: number;
  r: number;
  slices: PlacedSlice[];
  labels: PlacedLabel[];
  /** Radius of the donut hole; 0 for a full pie. */
  hole: number;
}

interface Draft {
  index: number;
  anchor: 'start' | 'middle' | 'end';
  /** +1 for the right half, -1 for the left. */
  side: 1 | -1;
  /** Bend of the guide, relative to the centre. */
  bend: { x: number; y: number };
  start: { x: number; y: number };
  x: number;
  top: number;
  w: number;
  nameW: number;
  valueW: number;
  /** Middle labels: the box is above (-1) or below (1) the bend. */
  vertical: -1 | 1;
}

const lo = (d: Draft): number => (d.anchor === 'start' ? d.x : d.anchor === 'end' ? d.x - d.w : d.x - d.w / 2);
const hi = (d: Draft): number => lo(d) + d.w;

/** Moves labels apart until neighbouring boxes are `LABEL_GAP` apart; keeps their order. */
function separate(drafts: Draft[]): void {
  {
    // Boxes of the two halves can meet only where centred labels reach across the middle; the extent test tells.
    const group = drafts;
    for (let pass = 0; pass < 400; pass++) {
      let moved = false;
      for (const a of group) {
        for (const b of group) {
          if (a === b || hi(a) <= lo(b) || hi(b) <= lo(a)) continue;
          const upper = a.top + BLOCK / 2 < b.top + BLOCK / 2 || (a.top === b.top && a.index < b.index) ? a : b;
          const lower = upper === a ? b : a;
          if (upper.top + BLOCK + LABEL_GAP > lower.top + 1e-9) {
            const need = upper.top + BLOCK + LABEL_GAP - lower.top;
            upper.top -= need / 2;
            lower.top += need / 2;
            moved = true;
          }
        }
      }
      if (!moved) break;
    }
    for (const d of group) d.top = Math.round(d.top);
    // A last downward sweep guarantees the gap after rounding.
    const sorted = [...group].sort((p, q) => p.top - q.top || p.index - q.index);
    sorted.forEach((d, i) => {
      for (const prev of sorted.slice(0, i)) {
        if (hi(prev) <= lo(d) || hi(d) <= lo(prev)) continue;
        d.top = Math.max(d.top, prev.top + BLOCK + LABEL_GAP);
      }
    });
  }
}

/** Pushes labels beside the circle outward until their boxes clear it. */
function clear(drafts: Draft[]): void {
  for (const d of drafts) {
    if (d.anchor === 'middle') continue;
    const dy = d.top > 0 ? d.top : d.top + BLOCK < 0 ? -(d.top + BLOCK) : 0;
    const need = Math.ceil(Math.sqrt(Math.max(0, (RADIUS + CLEAR) ** 2 - dy * dy)));
    if (d.x * d.side < need) d.x = d.side * need;
  }
}

/** Places a pie chart: slices clockwise from 12 o'clock, names and values outside on guides. */
export function layoutPie(pie: Pie, ruler: Ruler): PieLayout {
  const total = pie.slices.reduce((sum, s) => sum + s.value, 0);
  let acc = 0;
  const slices: PlacedSlice[] = pie.slices.map((s) => {
    const a0 = (acc / total) * Math.PI * 2;
    acc += s.value;
    return { label: s.label, value: s.value, a0, a1: (acc / total) * Math.PI * 2 };
  });

  const drafts: Draft[] = slices.map((s, index) => {
    const mid = (s.a0 + s.a1) / 2;
    const sin = Math.sin(mid);
    const dir = { x: sin, y: -Math.cos(mid) };
    const start = { x: dir.x * (RADIUS + LEAD), y: dir.y * (RADIUS + LEAD) };
    const bend = { x: dir.x * (RADIUS + ELBOW), y: dir.y * (RADIUS + ELBOW) };
    const nameW = ruler.textWidth(s.label, 'title');
    const valueW = ruler.textWidth(pie.slices[index]?.valueText ?? '', 'line');
    const w = Math.max(nameW, valueW);
    const side: 1 | -1 = sin >= 0 ? 1 : -1;
    if (Math.abs(sin) >= SIDE_MIN_SIN) {
      return { index, anchor: side === 1 ? 'start' : 'end', side, bend, start, x: side * Math.ceil(Math.abs(bend.x) + TEXT_GAP), top: bend.y - LINE / 2, w, nameW, valueW, vertical: 1 };
    }
    const vertical: -1 | 1 = dir.y < 0 ? -1 : 1;
    const top = vertical === -1 ? bend.y - TEXT_GAP - BLOCK : bend.y + TEXT_GAP;
    return { index, anchor: 'middle', side, bend, start, x: bend.x, top, w, nameW, valueW, vertical };
  });

  clear(drafts);
  separate(drafts);
  clear(drafts);
  separate(drafts);

  // Extent of the drawing around the circle's centre.
  let minX = -RADIUS;
  let maxX = RADIUS;
  let minY = -RADIUS;
  let maxY = RADIUS;
  for (const d of drafts) {
    minX = Math.min(minX, lo(d));
    maxX = Math.max(maxX, hi(d));
    minY = Math.min(minY, d.top);
    maxY = Math.max(maxY, d.top + BLOCK);
  }

  const titleW = pie.title === undefined ? 0 : (ruler.textWidth(pie.title, 'title') * TITLE_SIZE) / 13;
  const bodyW = maxX - minX;
  const innerW = Math.max(bodyW, titleW);
  const bodyLeft = MARGIN + (innerW - bodyW) / 2;
  const cx = ceilTo(bodyLeft - minX);
  const titleGap = minY < -RADIUS ? TITLE_GAP_LABEL : TITLE_GAP;
  const top = MARGIN + (pie.title === undefined ? 0 : TITLE_LINE + titleGap);
  const cy = ceilTo(top - minY);
  const width = ceilTo(Math.max(cx + maxX, MARGIN + titleW) + MARGIN);
  const height = ceilTo(cy + maxY + MARGIN);

  const items: SceneItem[] = [
    { kind: 'box', x: PANEL_INSET, y: PANEL_INSET, w: width - 2 * PANEL_INSET, h: height - 2 * PANEL_INSET, role: ['panel'] },
  ];
  if (pie.title !== undefined) {
    items.push({ kind: 'text', x: MARGIN, y: MARGIN + TITLE_LINE / 2, text: pie.title, anchor: 'start', role: ['title'] });
  }
  const hole = pie.donutHole * RADIUS;
  slices.forEach((s, i) => {
    const sweep = s.a1 - s.a0;
    // A very narrow slice gets a narrower gap so the straight sides can still meet.
    const gap = Math.min(GAP, RADIUS * Math.sin(Math.min(sweep, Math.PI) / 2));
    items.push({
      kind: 'path',
      d: hole > 0 ? ringPath(cx, cy, RADIUS, hole, s.a0, s.a1, gap, CORNER) : arcPath(cx, cy, RADIUS, s.a0, s.a1, { gap, corner: CORNER }),
      role: [`series-${(i % SERIES) + 1}--tint`],
      data: { label: s.label, value: pie.slices[i]?.valueText ?? '' },
    });
  });

  const labels: PlacedLabel[] = [];
  for (const d of drafts) {
    const slice = pie.slices[d.index];
    if (slice === undefined) continue;
    // A label pushed away from its slice gets a longer guide, still straight out from the centre, to `TEXT_GAP` short of it.
    const reach =
      d.anchor === 'middle'
        ? (d.vertical === -1 ? d.top + BLOCK + TEXT_GAP : d.top - TEXT_GAP) / d.bend.y
        : (Math.abs(d.x) - TEXT_GAP) / Math.abs(d.bend.x);
    const k = Math.max(1, reach);
    items.push({
      kind: 'line',
      points: [
        { x: cx + d.start.x, y: cy + d.start.y },
        { x: cx + d.bend.x * k, y: cy + d.bend.y * k },
      ],
      role: ['guide'],
      radius: 0,
    });
    items.push({ kind: 'text', x: cx + d.x, y: cy + d.top + LINE / 2, text: slice.label, anchor: d.anchor, role: ['name'] });
    items.push({ kind: 'text', x: cx + d.x, y: cy + d.top + LINE * 1.5, text: slice.valueText, anchor: d.anchor, role: ['value'] });
    labels.push({ index: d.index, anchor: d.anchor, x: cx + d.x, y: cy + d.top, w: d.w, h: BLOCK });
  }

  const name = pie.title === undefined ? `Pie chart: ${pie.slices.length} slices` : `Pie chart: ${pie.title}`;
  return { scene: { width, height, title: name, items }, cx, cy, r: RADIUS, slices, labels, hole };
}

const fmt = (v: number): string => String(Math.round(v * 100) / 100 || 0);

/**
 * A slice of a ring between radii `inner` and `outer`, from angle `a0` to `a1` (0 at 12 o'clock, clockwise). Its
 * straight sides move inward by half of `gap`, and the two outer corners are rounded by `corner`.
 */
function ringPath(cx: number, cy: number, outer: number, inner: number, a0: number, a1: number, gap: number, corner: number): string {
  const at = (a: number, r: number): string => `${fmt(cx + r * Math.sin(a))} ${fmt(cy - r * Math.cos(a))}`;
  if (a1 - a0 >= Math.PI * 2 - 1e-9) {
    const circle = (r: number, sweep: 0 | 1): string => `M${at(0, r)}A${fmt(r)} ${fmt(r)} 0 1 ${sweep} ${at(Math.PI, r)}A${fmt(r)} ${fmt(r)} 0 1 ${sweep} ${at(0, r)}Z`;
    return circle(outer, 1) + circle(inner, 0);
  }
  const g = gap / 2;
  // A point at `distance` along the side at angle `a`, moved across it by `g` toward the slice.
  const side = (a: number, dir: 1 | -1, distance: number): string =>
    `${fmt(cx + distance * Math.sin(a) + dir * g * Math.cos(a))} ${fmt(cy - distance * Math.cos(a) + dir * g * Math.sin(a))}`;
  const dOut = Math.asin(Math.min(1, g / outer));
  const dIn = Math.asin(Math.min(1, g / inner));
  const reachOut = Math.sqrt(outer * outer - g * g);
  const reachIn = Math.sqrt(Math.max(0, inner * inner - g * g));
  const c = Math.max(0, Math.min(corner, (reachOut - reachIn) / 2, ((a1 - a0 - 2 * dOut) * outer) / 4));
  const outerSweep = a1 - a0 - 2 * dOut - (2 * c) / outer;
  const innerSweep = a1 - a0 - 2 * dIn;
  if (innerSweep <= 0) return arcPath(cx, cy, outer, a0, a1, { gap, corner });
  const r = fmt(outer);
  const ri = fmt(inner);
  return [
    `M${side(a0, 1, reachIn)}`,
    `L${side(a0, 1, reachOut - c)}`,
    `Q${at(a0 + dOut, outer)} ${at(a0 + dOut + c / outer, outer)}`,
    `A${r} ${r} 0 ${outerSweep > Math.PI ? 1 : 0} 1 ${at(a1 - dOut - c / outer, outer)}`,
    `Q${at(a1 - dOut, outer)} ${side(a1, -1, reachOut - c)}`,
    `L${side(a1, -1, reachIn)}`,
    `A${ri} ${ri} 0 ${innerSweep > Math.PI ? 1 : 0} 0 ${side(a0, 1, reachIn)}`,
    'Z',
  ].join('');
}
