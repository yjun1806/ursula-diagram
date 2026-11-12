import { arcPath } from '../chart/arc.ts';
import { ceilTo } from '../chart/grid.ts';
import type { Ruler } from '../metrics.ts';
import type { Scene, SceneItem } from '../types.ts';
import type { Pie } from './model.ts';

export const RADIUS = 160;
const GAP = 3;
const CORNER = 4;
/** The guide starts this far outside the circle and bends at `ELBOW`. */
const LEAD = 4;
const ELBOW = 16;
/** Distance from the bend to the text, and the last stretch of the guide. */
const TEXT_GAP = 12;
const TAIL = 6;
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
  const top = MARGIN + (pie.title === undefined ? 0 : TITLE_LINE + TITLE_GAP);
  const cy = ceilTo(top - minY);
  const width = ceilTo(Math.max(cx + maxX, MARGIN + titleW) + MARGIN);
  const height = ceilTo(cy + maxY + MARGIN);

  const items: SceneItem[] = [
    { kind: 'box', style: 'frame', x: PANEL_INSET, y: PANEL_INSET, w: width - 2 * PANEL_INSET, h: height - 2 * PANEL_INSET, role: ['panel'] },
  ];
  if (pie.title !== undefined) {
    items.push({ kind: 'text', x: MARGIN, y: MARGIN + TITLE_LINE / 2, text: pie.title, anchor: 'start', role: ['title'] });
  }
  slices.forEach((s, i) => {
    const sweep = s.a1 - s.a0;
    // A very narrow slice gets a narrower gap so the straight sides can still meet.
    const gap = Math.min(GAP, RADIUS * Math.sin(Math.min(sweep, Math.PI) / 2));
    items.push({
      kind: 'path',
      d: arcPath(cx, cy, RADIUS, s.a0, s.a1, { gap, corner: CORNER }),
      role: [`series-${(i % SERIES) + 1}--tint`],
      data: { label: s.label, value: pie.slices[i]?.valueText ?? '' },
    });
  });

  const labels: PlacedLabel[] = [];
  for (const d of drafts) {
    const slice = pie.slices[d.index];
    if (slice === undefined) continue;
    let end: { x: number; y: number };
    if (d.anchor === 'middle') {
      end = { x: d.x, y: d.vertical === -1 ? d.top + BLOCK + TAIL : d.top - TAIL };
    } else {
      end = { x: d.x - d.side * TAIL, y: d.top + LINE / 2 };
    }
    items.push({
      kind: 'line',
      points: [
        { x: cx + d.start.x, y: cy + d.start.y },
        { x: cx + d.bend.x, y: cy + d.bend.y },
        { x: cx + end.x, y: cy + end.y },
      ],
      role: ['guide'],
      radius: 0,
    });
    items.push({ kind: 'text', x: cx + d.x, y: cy + d.top + LINE / 2, text: slice.label, anchor: d.anchor, role: ['name'] });
    items.push({ kind: 'text', x: cx + d.x, y: cy + d.top + LINE * 1.5, text: slice.valueText, anchor: d.anchor, role: ['value'] });
    labels.push({ index: d.index, anchor: d.anchor, x: cx + d.x, y: cy + d.top, w: d.w, h: BLOCK });
  }

  const name = pie.title === undefined ? `Pie chart: ${pie.slices.length} slices` : `Pie chart: ${pie.title}`;
  return { scene: { width, height, title: name, items }, cx, cy, r: RADIUS, slices, labels };
}
