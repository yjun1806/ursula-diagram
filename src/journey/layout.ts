import { ceilTo, round2 } from '../chart/grid.ts';
import { anchoredBox, clashCost, pickLeastClash, trendAt } from '../chart/label-place.ts';
import type { Box } from '../chart/label-place.ts';
import { monotonePath, pathSamples } from '../chart/monotone.ts';
import type { Ruler } from '../metrics.ts';
import { SCENE_THEME } from '../render/scene-theme.ts';
import { wrapWords } from '../text/wrap.ts';
import type { Point, Scene, SceneItem } from '../types.ts';
import type { Journey } from './model.ts';

const MARGIN = 24;
const LEFT = 56;
const TITLE_Y = 36;
const BOX_W = 152;
const BOX_MIN = 96;
const BOX_PAD = 32;
const LINE = 16;
const TAG_H = 20;
const TAG_GAP = 4;
const TAG_PAD = 16;
const ROW = TAG_H + TAG_GAP;
const ZONE_PAD = 24;
const BOX_GAP = 24;
const ZONE_GAP = 8;
const NAME_HEAD = 44;
const PLAIN_HEAD = 24;
const ZONE_FOOT = 24;
const PLOT_GAP = 48;
const STEP = 32;
const FOOT = 52;
const WIDTH_LIMIT = 1280;
const VALUE_H = 12;

export interface JourneyLayoutOptions {
  /** Width past which the task boxes narrow and wrap their names; 1280 when absent. */
  maxWidth?: number;
}

export interface PlacedTask {
  name: string[];
  score: number;
  actors: string[];
  x: number;
  y: number;
  w: number;
  h: number;
  /** Centre of the box and the height of the score. */
  dot: Point;
  tags: { text: string; x: number; y: number; w: number }[];
}

export interface PlacedSection {
  name?: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface JourneyLayout {
  scene: Scene;
  width: number;
  height: number;
  sections: PlacedSection[];
  tasks: PlacedTask[];
  /** True when the drawing is wider than the limit although the boxes are as narrow as they go. */
  overflow: boolean;
}


interface Plan {
  boxW: number;
  names: string[][];
  tagRows: { text: string; w: number }[][][];
  titleLines: number;
  rows: number;
  boxH: number;
  zoneW: number[];
  right: number;
}

/** Lays a journey out: sections over task boxes with their actors, and the scores as a line below. */
export function layoutJourney(journey: Journey, ruler: Ruler, opts: JourneyLayoutOptions = {}): JourneyLayout {
  const limit = opts.maxWidth ?? WIDTH_LIMIT;
  const nameW = (t: string): number => ruler.textWidth(t, 'title');
  const smallW = (t: string): number => (ruler.textWidth(t, 'line') * 11) / 12;
  const tasks = journey.sections.flatMap((s) => s.tasks);
  const tagW = (t: string): number => ceilTo(smallW(t) + TAG_PAD);
  const widestTag = Math.max(0, ...tasks.flatMap((t) => t.actors.map(tagW)));
  const widestName = Math.max(0, ...tasks.map((t) => nameW(t.name)));
  const hasName = journey.sections.some((s) => s.name !== undefined);

  const plan = (boxW: number): Plan => {
    const names = tasks.map((t) => wrapWords(t.name, boxW - BOX_PAD, nameW, { split: 'space', blank: true }));
    const tagRows = tasks.map((t) => {
      const rows: { text: string; w: number }[][] = [];
      let cur: { text: string; w: number }[] = [];
      let used = 0;
      for (const text of t.actors) {
        const w = tagW(text);
        const need = cur.length === 0 ? w : used + TAG_GAP + w;
        if (cur.length > 0 && need > boxW - TAG_PAD) {
          rows.push(cur);
          cur = [];
          used = 0;
        }
        used = cur.length === 0 ? w : used + TAG_GAP + w;
        cur.push({ text, w });
      }
      if (cur.length > 0) rows.push(cur);
      return rows;
    });
    const titleLines = Math.max(1, ...names.map((n) => n.length));
    const rows = Math.max(0, ...tagRows.map((r) => r.length));
    const boxH = rows === 0 ? 48 + LINE * (titleLines - 1) : 44 + LINE * (titleLines - 1) + ROW * rows;
    const zoneW = journey.sections.map((s) => {
      const group = s.tasks.length * boxW + Math.max(0, s.tasks.length - 1) * BOX_GAP;
      const natural = s.tasks.length === 0 ? 0 : group + 2 * ZONE_PAD;
      const nameNeed = s.name === undefined ? 0 : ceilTo(nameW(s.name) + 32);
      const base = s.tasks.length === 0 ? Math.max(nameNeed, 120) : natural;
      return base >= nameNeed ? base : group + 2 * (ZONE_PAD + 4 * Math.ceil((nameNeed - natural) / 8));
    });
    const right = LEFT + zoneW.reduce((a, w) => a + w, 0) + ZONE_GAP * Math.max(0, zoneW.length - 1) + MARGIN;
    return { boxW, names, tagRows, titleLines, rows, boxH, zoneW, right };
  };

  const natural = Math.max(BOX_W, ceilTo(widestName + BOX_PAD), widestTag + TAG_PAD);
  const widestWord = Math.max(0, ...tasks.flatMap((t) => t.name.split(' ').map(nameW)));
  const floor = Math.max(BOX_MIN, widestTag + TAG_PAD, ceilTo(widestWord + BOX_PAD));
  let chosen = plan(natural);
  if (chosen.right > limit) {
    let w = natural - 4;
    let found: Plan | undefined;
    for (; w >= floor; w -= 4) {
      const p = plan(w);
      if (p.right <= limit) {
        found = p;
        break;
      }
    }
    chosen = found ?? plan(Math.min(natural, floor));
  }
  const { boxW, names, tagRows, titleLines, boxH, zoneW } = chosen;
  const overflow = chosen.right > limit;

  const items: SceneItem[] = [];
  const titleText = journey.title;
  const titleW = titleText === undefined ? 0 : (ruler.textWidth(titleText, 'title') * 15) / 13;
  const width = Math.max(chosen.right, ceilTo(titleW + 2 * MARGIN));
  const zoneTop = titleText === undefined ? MARGIN : 56;
  const head = hasName ? NAME_HEAD : PLAIN_HEAD;
  const zoneH = head + boxH + ZONE_FOOT;
  const gridTop = zoneTop + zoneH + PLOT_GAP;
  const axisY = gridTop + 4 * STEP;
  const height = axisY + FOOT;
  const scoreY = (s: number): number => round2(gridTop + (5 - s) * STEP);
  const plotRight = width - MARGIN;

  if (titleText !== undefined) items.push({ kind: 'text', x: MARGIN, y: TITLE_Y, text: titleText, anchor: 'start', role: ['title'] });

  const sections: PlacedSection[] = [];
  const placed: PlacedTask[] = [];
  let cursor = LEFT;
  let index = 0;
  journey.sections.forEach((sec, si) => {
    const w = zoneW[si] ?? 0;
    const zone: PlacedSection = { ...(sec.name === undefined ? {} : { name: sec.name }), x: cursor, y: zoneTop, w, h: zoneH };
    sections.push(zone);
    items.push({ kind: 'box', style: 'frame', x: zone.x, y: zone.y, w, h: zoneH, role: ['zone'] });
    if (sec.name !== undefined) items.push({ kind: 'text', x: zone.x + 16, y: zoneTop + 24, text: sec.name, anchor: 'start', role: ['zone-name'] });
    const group = sec.tasks.length * boxW + Math.max(0, sec.tasks.length - 1) * BOX_GAP;
    const start = cursor + (w - group) / 2;
    sec.tasks.forEach((task, ti) => {
      const x = start + ti * (boxW + BOX_GAP);
      const y = zoneTop + head;
      const lines = names[index] ?? [task.name];
      const cx = x + boxW / 2;
      const tags: PlacedTask['tags'] = [];
      (tagRows[index] ?? []).forEach((row, ri) => {
        const total = row.reduce((a, t) => a + t.w, 0) + TAG_GAP * (row.length - 1);
        let tx = cx - total / 2;
        for (const t of row) {
          tags.push({ text: t.text, x: tx, y: y + 40 + LINE * (titleLines - 1) + ROW * ri, w: t.w });
          tx += t.w + TAG_GAP;
        }
      });
      placed.push({ name: lines, score: task.score, actors: task.actors, x, y, w: boxW, h: boxH, dot: { x: cx, y: scoreY(task.score) }, tags });
      index++;
    });
    cursor += w + ZONE_GAP;
  });

  for (let s = 5; s >= 1; s--) {
    const y = scoreY(s);
    items.push({ kind: 'line', points: [{ x: LEFT, y }, { x: plotRight, y }], role: [s === 1 ? 'axis' : 'grid'], radius: 0 });
    items.push({ kind: 'text', x: LEFT - 16, y, text: String(s), anchor: 'end', role: ['tick'] });
  }

  for (const t of placed) {
    items.push({ kind: 'box', style: 'box', x: t.x, y: t.y, w: t.w, h: t.h, role: ['box', 'box--in-zone'] });
    t.name.forEach((text, i) => items.push({ kind: 'text', x: t.x + t.w / 2, y: t.y + 26 + LINE * i, text, anchor: 'middle', role: ['name'] }));
    for (const tag of t.tags) {
      items.push({ kind: 'box', style: 'label', x: tag.x, y: tag.y, w: tag.w, h: TAG_H, role: ['tag'] });
      items.push({ kind: 'text', x: tag.x + tag.w / 2, y: tag.y + TAG_H / 2, text: tag.text, anchor: 'middle', role: ['tag-text'] });
    }
  }

  const dots = placed.map((t) => t.dot);
  if (dots.length > 1) {
    // the lone value line is drawn in ink; the points stay hollow rings
    items.push({ kind: 'path', d: monotonePath(dots), role: ['mark-line--ink'] });
  }
  for (const p of dots) items.push({ kind: 'circle', cx: p.x, cy: p.y, r: SCENE_THEME.dotRadius, role: ['mark-dot'] });

  // value labels: on the side of the dot the line does not pass
  const off = 8;
  const samples: Point[] = [];
  if (dots.length > 1) samples.push(...pathSamples(monotonePath(dots)));
  const dotBoxes: Box[] = dots.map((p) => ({ x0: p.x - SCENE_THEME.dotRadius, x1: p.x + SCENE_THEME.dotRadius, y0: p.y - SCENE_THEME.dotRadius, y1: p.y + SCENE_THEME.dotRadius }));
  const bounds: Box = { x0: LEFT, x1: plotRight, y0: zoneTop + zoneH + 4, y1: height - 4 };
  const taken: Box[] = [];
  const boxOf = (x: number, y: number, w: number, anchor: 'start' | 'middle'): Box => anchoredBox(x, y, w, anchor, VALUE_H);
  const clash = (b: Box): number => clashCost(b, { bounds, fixed: dotBoxes, placed: taken, samples });
  const scoreOf = (i: number): number => placed[i]?.score ?? 0;
  const labels: SceneItem[] = [];
  dots.forEach((p, i) => {
    const text = journey.sections.flatMap((s) => s.tasks)[i]?.scoreText ?? String(scoreOf(i));
    const w = smallW(text);
    const cur = scoreOf(i);
    const prev = i > 0 ? scoreOf(i - 1) : undefined;
    const next = i < dots.length - 1 ? scoreOf(i + 1) : undefined;
    const trend = trendAt(cur, prev, next);
    const side: 'above' | 'below' | 'right-up' | 'right-down' = trend === 'peak' ? 'above' : trend === 'valley' ? 'below' : trend === 'rising' ? 'right-down' : 'right-up';
    const at = (kind: typeof side, extra: number): { x: number; y: number; anchor: 'start' | 'middle' } => {
      const o = off + extra;
      if (kind === 'above') return { x: p.x, y: p.y - (o + 8), anchor: 'middle' };
      if (kind === 'below') return { x: p.x, y: p.y + (o + 8), anchor: 'middle' };
      if (kind === 'right-up') return { x: p.x + o, y: p.y - (o + 4), anchor: 'start' };
      return { x: p.x + o, y: p.y + (o + 4), anchor: 'start' };
    };
    const order: (typeof side)[] = [side, side === 'above' ? 'below' : side === 'below' ? 'above' : side === 'right-up' ? 'above' : 'below', 'right-up', 'right-down', 'above', 'below'];
    const spots = [0, 4, 8, 12].flatMap((extra) => order.map((kind) => at(kind, extra)));
    const c = pickLeastClash(spots, (spot) => boxOf(spot.x, spot.y, w, spot.anchor), clash)?.candidate ?? at(side, 0);
    taken.push(boxOf(c.x, c.y, w, c.anchor));
    labels.push({ kind: 'text', x: round2(c.x), y: round2(c.y), text, anchor: c.anchor, role: ['value'] });
  });
  items.push(...labels);

  const sceneTitle = journey.accTitle !== undefined && journey.accTitle !== '' ? journey.accTitle : journey.title === undefined ? 'user-journey' : `user-journey — ${journey.title}`;
  const scene: Scene = { width, height, title: sceneTitle, items };
  return { scene, width, height, sections, tasks: placed, overflow };
}
