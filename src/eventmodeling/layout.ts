import { ceilTo } from '../chart/grid.ts';
import type { Ruler } from '../metrics.ts';
import { HEAD_BAND, headBand } from '../render/head-band.ts';
import { SCENE_THEME_SPECS } from '../render/scene-theme.ts';
import { DEFAULT_THEME } from '../render/theme.ts';
import type { Theme } from '../render/theme.ts';
import { wrapWords } from '../text/wrap.ts';
import type { Point, Scene, SceneItem } from '../types.ts';
import { ZONE_NAMES, ZONE_ORDER, zoneOf } from './model.ts';
import type { EventLayout, EventModel, Frame, LaneZone, PlacedColumn, PlacedFrame, PlacedLane } from './model.ts';

const MARGIN = 24;
const LABEL_AREA = 96;
const LABEL_PAD = 16;
/** Least room between a lane name and the first box; the ruler measures names a little wide, which leaves some more. */
const LABEL_GAP = 4;
const COLUMN_GAP = 32;
const BOX_W = 132;
const BOX_H = 68;
const BOX_PAD = 12;
const LANE_PAD = 24;
const LANE_MIN = 116;
const LANE_GAP = 4;
const TICK_Y = 32;
const ZONE_TOP = 48;
const TITLE_SHIFT = 44;
const DATA_PAD = 8;
const DATA_ROW = 20;
const DATA_WRAP = 240;
const LABEL_LINE = 18;
/** Centre of a box's name under a head band. */
const NAME_UNDER_BAND = 48;
const PORT_R = 4;
/** Distance before a target at which a detour edge turns toward it. */
const TURN = 16;

interface LaneSpec {
  zone: LaneZone;
  namespace?: string;
  frames: Frame[];
}

/** Lanes in drawing order: the zones top to bottom, inside a zone by first appearance in the text. */
function lanesOf(model: EventModel): LaneSpec[] {
  const found = new Map<string, LaneSpec>();
  for (const frame of model.frames) {
    const zone = zoneOf(frame.kind);
    const key = `${zone}|${frame.namespace ?? ''}`;
    const lane = found.get(key) ?? { zone, ...(frame.namespace === undefined ? {} : { namespace: frame.namespace }), frames: [] };
    lane.frames.push(frame);
    found.set(key, lane);
  }
  return ZONE_ORDER.flatMap((zone) => [...found.values()].filter((l) => l.zone === zone));
}

/** The lines of a zone name, broken after each slash. */
const zoneLines = (zone: LaneZone): string[] => ZONE_NAMES[zone].split(/(?<=\/)/u);

function labelLines(lane: LaneSpec): Array<{ text: string; sub: boolean }> {
  if (lane.namespace === undefined) return zoneLines(lane.zone).map((text) => ({ text, sub: false }));
  return [{ text: lane.namespace, sub: false }, ...zoneLines(lane.zone).map((text) => ({ text, sub: true }))];
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const hits = (r: Rect, a: Point, b: Point): boolean => {
  const x1 = Math.min(a.x, b.x);
  const x2 = Math.max(a.x, b.x);
  const y1 = Math.min(a.y, b.y);
  const y2 = Math.max(a.y, b.y);
  return x2 > r.x && x1 < r.x + r.w && y2 > r.y && y1 < r.y + r.h;
};

export function layoutEventModel(model: EventModel, ruler: Ruler, theme?: Theme): EventLayout {
  const spec = SCENE_THEME_SPECS[theme ?? DEFAULT_THEME];
  const nameW = (s: string): number => ruler.textWidth(s, 'title');
  const lineW = (s: string): number => ruler.textWidth(s, 'line');
  const lanes = lanesOf(model);
  const columnsSorted = [...model.frames].sort((a, b) => a.number - b.number);
  const columnOf = new Map(columnsSorted.map((f, i) => [f.number, i]));
  const laneOf = new Map(lanes.flatMap((l, i) => l.frames.map((f) => [f.number, i] as const)));

  const labelWidth = Math.max(0, ...lanes.flatMap((l) => labelLines(l).map((t) => (t.sub ? lineW(t.text) : nameW(t.text)))));
  const labelArea = Math.max(LABEL_AREA, ceilTo(labelWidth + LABEL_PAD + LABEL_GAP));

  // Size of every box: the name, the kind tag and the data rows decide its width; data rows add a compartment.
  const sizes = new Map<number, { w: number; h: number; rows: string[]; tagW: number }>();
  for (const f of model.frames) {
    const rows = f.data.flatMap((row) => wrapWords(row, DATA_WRAP, lineW, { longWord: 'keep' }));
    const tagBase = ceilTo(lineW(f.kind) + 16);
    const content = Math.max(nameW(f.name) + 2 * BOX_PAD, tagBase + 2 * BOX_PAD, ...rows.map((r) => lineW(r) + 2 * BOX_PAD));
    const w = Math.max(BOX_W, ceilTo(content));
    let tagW = tagBase;
    while ((w - tagW) % 8 !== 0) tagW += 4;
    sizes.set(f.number, { w, h: rows.length === 0 ? BOX_H : BOX_H + 2 * DATA_PAD + DATA_ROW * rows.length, rows, tagW });
  }

  const left = MARGIN + labelArea;
  const columns: PlacedColumn[] = [];
  let cx = left;
  for (const f of columnsSorted) {
    const w = sizes.get(f.number)?.w ?? BOX_W;
    columns.push({ number: f.number, x: cx, w });
    cx += w + COLUMN_GAP;
  }
  const zoneRight = cx - COLUMN_GAP + MARGIN;
  const heading = model.title;
  const shift = heading === undefined ? 0 : TITLE_SHIFT;
  const zoneW = zoneRight - MARGIN;
  const headingW = heading === undefined ? 0 : (nameW(heading) * 15) / 13;
  const width = Math.max(zoneRight + MARGIN, ceilTo(headingW + 2 * MARGIN));

  const placedLanes: PlacedLane[] = [];
  let top = ZONE_TOP + shift;
  for (const lane of lanes) {
    const tallest = Math.max(...lane.frames.map((f) => sizes.get(f.number)?.h ?? BOX_H));
    const h = Math.max(LANE_MIN, tallest + 2 * LANE_PAD);
    placedLanes.push({ zone: lane.zone, ...(lane.namespace === undefined ? {} : { namespace: lane.namespace }), x: MARGIN, y: top, w: zoneW, h });
    top += h + LANE_GAP;
  }
  const height = top - LANE_GAP + MARGIN;

  const placed: PlacedFrame[] = model.frames.map((f) => {
    const size = sizes.get(f.number);
    const column = columnOf.get(f.number) ?? 0;
    const laneIndex = laneOf.get(f.number) ?? 0;
    const lane = placedLanes[laneIndex];
    const col = columns[column];
    if (size === undefined || lane === undefined || col === undefined) throw new Error('unplaced frame');
    const y = lane.y + Math.round((lane.h - size.h) / 2 / 4) * 4;
    return { number: f.number, kind: f.kind, column, lane: laneIndex, x: col.x, y, w: size.w, h: size.h };
  });
  const placedOf = new Map(placed.map((p) => [p.number, p]));

  const items: SceneItem[] = [];
  if (heading !== undefined) items.push({ kind: 'text', x: MARGIN, y: 28, text: heading, anchor: 'start', role: ['title'] });
  for (const col of columns) {
    const frame = model.frames.find((f) => f.number === col.number);
    items.push({ kind: 'text', x: col.x + col.w / 2, y: TICK_Y + shift, text: frame?.label ?? String(col.number), anchor: 'middle', role: ['tick'] });
  }
  placedLanes.forEach((lane, i) => {
    items.push({ kind: 'box', style: 'frame', x: lane.x, y: lane.y, w: lane.w, h: lane.h, role: i % 2 === 0 ? ['zone'] : ['zone', 'zone--plain'], data: { zone: lane.zone } });
    const spec = lanes[i];
    if (spec === undefined) return;
    labelLines(spec).forEach((t, li) => {
      items.push({ kind: 'text', x: lane.x + LABEL_PAD, y: lane.y + 28 + LABEL_LINE * li, text: t.text, anchor: 'start', role: [t.sub ? 'zone-sub' : 'zone-name'], baseline: 'alphabetic' });
    });
  });

  // Relations: one bend when the vertical run from the source reaches the target's side clear of other boxes;
  // otherwise the edge leaves the source sideways and turns just before the target.
  const edges: EventLayout['edges'] = [];
  const edgeItems: SceneItem[] = [];
  const portItems: SceneItem[] = [];
  for (const rel of model.relations) {
    const a = placedOf.get(rel.from);
    const b = placedOf.get(rel.to);
    if (a === undefined || b === undefined) continue;
    const forward = b.x > a.x;
    const ay = a.y + a.h / 2;
    const by = b.y + b.h / 2;
    const acx = a.x + a.w / 2;
    const others: Rect[] = placed.filter((p) => p !== a && p !== b);
    const end: Point = forward ? { x: b.x, y: by } : { x: b.x + b.w, y: by };
    let points: Point[];
    let startPort: Point;
    if (a.lane === b.lane) {
      startPort = forward ? { x: a.x + a.w, y: ay } : { x: a.x, y: ay };
      points = [startPort, end];
    } else {
      const down = b.y > a.y;
      startPort = { x: acx, y: down ? a.y + a.h : a.y };
      const one: Point[] = [startPort, { x: acx, y: by }, end];
      const clear = !others.some((r) => hits(r, { x: acx, y: by }, end));
      if (clear) points = one;
      else {
        const turnX = forward ? b.x - TURN : b.x + b.w + TURN;
        const side: Point = forward ? { x: a.x + a.w, y: ay } : { x: a.x, y: ay };
        points = [side, { x: turnX, y: ay }, { x: turnX, y: by }, end];
        startPort = side;
      }
    }
    edges.push({ from: rel.from, to: rel.to, points });
    edgeItems.push({ kind: 'line', points, role: ['edge', 'edge--arrow'], arrow: 'filled', data: { from: String(rel.from), to: String(rel.to) } });
    portItems.push({ kind: 'circle', cx: startPort.x, cy: startPort.y, r: PORT_R, role: ['port'] });
  }

  const incoming = new Set(model.relations.map((r) => r.to));
  const outgoing = new Set(model.relations.map((r) => r.from));
  const boxItems: SceneItem[] = [];
  for (const p of placed) {
    const frame = model.frames.find((f) => f.number === p.number);
    const size = sizes.get(p.number);
    if (frame === undefined || size === undefined) continue;
    const filled = p.lane % 2 === 0;
    const start = !incoming.has(p.number) && outgoing.has(p.number);
    const role = ['box', ...(filled ? ['box--in-zone'] : []), ...(start ? ['box--start'] : [])];
    const data = { frame: frame.label, kind: frame.kind };
    boxItems.push({ kind: 'box', style: 'box', x: p.x, y: p.y, w: p.w, h: p.h, role, data });
    if (spec.headBand) {
      // The band stays grey on a start box too, so that the start colour fills only the body.
      boxItems.push(headBand(p.x, p.y, p.w, spec, data));
      boxItems.push({ kind: 'text', x: p.x + p.w / 2, y: p.y + HEAD_BAND / 2, text: frame.kind, anchor: 'middle', role: ['tag-text'], data });
    } else {
      const tagX = p.x + (p.w - size.tagW) / 2;
      boxItems.push({ kind: 'box', style: 'label', x: tagX, y: p.y + 8, w: size.tagW, h: 20, role: ['tag'], data });
      boxItems.push({ kind: 'text', x: p.x + p.w / 2, y: p.y + 18, text: frame.kind, anchor: 'middle', role: ['tag-text'], data });
    }
    const nameY = p.y + (spec.headBand ? NAME_UNDER_BAND : 48);
    boxItems.push({ kind: 'text', x: p.x + p.w / 2, y: nameY, text: frame.name, anchor: 'middle', role: start ? ['name', 'on-start'] : ['name'], data });
    if (size.rows.length > 0) {
      boxItems.push({ kind: 'line', points: [{ x: p.x, y: p.y + BOX_H }, { x: p.x + p.w, y: p.y + BOX_H }], role: filled ? ['rule', 'rule--in-zone'] : ['rule'], data });
      size.rows.forEach((row, ri) => {
        boxItems.push({ kind: 'text', x: p.x + BOX_PAD, y: p.y + BOX_H + DATA_PAD + DATA_ROW * ri + DATA_ROW / 2, text: row, anchor: 'start', role: start ? ['body', 'on-start'] : ['body'], data });
      });
    }
  }

  const title = model.accTitle ?? `eventmodeling — ${heading ?? 'Event Modeling'}`;
  const scene: Scene = { width, height, title, items: [...items, ...edgeItems, ...boxItems, ...portItems], ...(theme === undefined ? {} : { theme }) };
  return { scene, lanes: placedLanes, columns, frames: placed, edges };
}
