import type { Ruler } from '../metrics.ts';
import { monotonePath } from '../chart/monotone.ts';
import { SCENE_THEME_SPECS } from '../render/scene-theme.ts';
import type { Theme } from '../render/theme.ts';
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

const up4 = (v: number): number => Math.ceil(v / 4) * 4;
const r2 = (v: number): number => Math.round(v * 100) / 100;

/** Breaks a line at spaces into lines no wider than `max`; a word wider than `max` is cut between characters. */
function wrap(text: string, max: number, width: (s: string) => number): string[] {
  const out: string[] = [];
  let cur = '';
  for (const word of text.split(' ')) {
    if (word === '') continue;
    const joined = cur === '' ? word : `${cur} ${word}`;
    if (width(joined) <= max) {
      cur = joined;
      continue;
    }
    if (cur !== '') out.push(cur);
    cur = '';
    if (width(word) <= max) {
      cur = word;
      continue;
    }
    for (const ch of word) {
      if (cur !== '' && width(cur + ch) > max) {
        out.push(cur);
        cur = '';
      }
      cur += ch;
    }
  }
  if (cur !== '') out.push(cur);
  return out.length === 0 ? [''] : out;
}

interface Box {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

const hit = (a: Box, b: Box, pad: number): boolean => a.x0 < b.x1 + pad && a.x1 > b.x0 - pad && a.y0 < b.y1 + pad && a.y1 > b.y0 - pad;

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
export function layoutJourney(journey: Journey, ruler: Ruler, theme: Theme, opts: JourneyLayoutOptions = {}): JourneyLayout {
  const spec = SCENE_THEME_SPECS[theme];
  const limit = opts.maxWidth ?? WIDTH_LIMIT;
  const nameW = (t: string): number => ruler.textWidth(t, 'title');
  const smallW = (t: string): number => (ruler.textWidth(t, 'line') * 11) / 12;
  const tasks = journey.sections.flatMap((s) => s.tasks);
  const tagW = (t: string): number => up4(smallW(t) + TAG_PAD);
  const widestTag = Math.max(0, ...tasks.flatMap((t) => t.actors.map(tagW)));
  const widestName = Math.max(0, ...tasks.map((t) => nameW(t.name)));
  const hasName = journey.sections.some((s) => s.name !== undefined);

  const plan = (boxW: number): Plan => {
    const names = tasks.map((t) => wrap(t.name, boxW - BOX_PAD, nameW));
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
      const nameNeed = s.name === undefined ? 0 : up4(nameW(s.name) + 32);
      const base = s.tasks.length === 0 ? Math.max(nameNeed, 120) : natural;
      return base >= nameNeed ? base : group + 2 * (ZONE_PAD + 4 * Math.ceil((nameNeed - natural) / 8));
    });
    const right = LEFT + zoneW.reduce((a, w) => a + w, 0) + ZONE_GAP * Math.max(0, zoneW.length - 1) + MARGIN;
    return { boxW, names, tagRows, titleLines, rows, boxH, zoneW, right };
  };

  const natural = Math.max(BOX_W, up4(widestName + BOX_PAD), widestTag + TAG_PAD);
  const widestWord = Math.max(0, ...tasks.flatMap((t) => t.name.split(' ').map(nameW)));
  const floor = Math.max(BOX_MIN, widestTag + TAG_PAD, up4(widestWord + BOX_PAD));
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
  const width = Math.max(chosen.right, up4(titleW + 2 * MARGIN));
  const zoneTop = titleText === undefined ? MARGIN : 56;
  const head = hasName ? NAME_HEAD : PLAIN_HEAD;
  const zoneH = head + boxH + ZONE_FOOT;
  const gridTop = zoneTop + zoneH + PLOT_GAP;
  const axisY = gridTop + 4 * STEP;
  const height = axisY + FOOT;
  const scoreY = (s: number): number => r2(gridTop + (5 - s) * STEP);
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
    t.name.forEach((text, i) => items.push({ kind: 'text', x: t.x + t.w / 2, y: t.y + 24 + LINE * i, text, anchor: 'middle', role: ['name'] }));
    for (const tag of t.tags) {
      items.push({ kind: 'box', style: 'label', x: tag.x, y: tag.y, w: tag.w, h: TAG_H, role: ['tag'] });
      items.push({ kind: 'text', x: tag.x + tag.w / 2, y: tag.y + TAG_H / 2, text: tag.text, anchor: 'middle', role: ['tag-text'] });
    }
  }

  const dots = placed.map((t) => t.dot);
  if (dots.length > 1) {
    const d = spec.interpolation === 'linear' ? dots.map((p, i) => `${i === 0 ? 'M' : 'L'}${r2(p.x)} ${r2(p.y)}`).join(' ') : monotonePath(dots);
    items.push({ kind: 'path', d, role: ['mark-line'] });
  }
  for (const p of dots) items.push({ kind: 'circle', cx: p.x, cy: p.y, r: spec.dotRadius, role: ['mark-dot'] });

  // value labels: on the side of the dot the line does not pass
  const off = spec.dotRadius < 5 ? 8 : 10;
  const samples: Point[] = [];
  if (spec.interpolation === 'linear') {
    for (let i = 1; i < dots.length; i++) {
      const a = dots[i - 1];
      const b = dots[i];
      if (a === undefined || b === undefined) continue;
      const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 3));
      for (let k = 0; k <= steps; k++) samples.push({ x: a.x + ((b.x - a.x) * k) / steps, y: a.y + ((b.y - a.y) * k) / steps });
    }
  } else if (dots.length > 1) {
    // points along the cubic segments of the drawn curve
    const nums = (monotonePath(dots).match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
    let from: Point = { x: nums[0] ?? 0, y: nums[1] ?? 0 };
    for (let k = 2; k + 5 < nums.length; k += 6) {
      const [c1x = 0, c1y = 0, c2x = 0, c2y = 0, ex = 0, ey = 0] = nums.slice(k, k + 6);
      const steps = Math.max(1, Math.ceil(Math.hypot(ex - from.x, ey - from.y) / 3));
      for (let t = 0; t <= steps; t++) {
        const u = t / steps;
        const v = 1 - u;
        samples.push({
          x: v * v * v * from.x + 3 * v * v * u * c1x + 3 * v * u * u * c2x + u * u * u * ex,
          y: v * v * v * from.y + 3 * v * v * u * c1y + 3 * v * u * u * c2y + u * u * u * ey,
        });
      }
      from = { x: ex, y: ey };
    }
  }
  const dotBoxes: Box[] = dots.map((p) => ({ x0: p.x - spec.dotRadius, x1: p.x + spec.dotRadius, y0: p.y - spec.dotRadius, y1: p.y + spec.dotRadius }));
  const bounds: Box = { x0: LEFT, x1: plotRight, y0: zoneTop + zoneH + 4, y1: height - 4 };
  const taken: Box[] = [];
  const boxOf = (x: number, y: number, w: number, anchor: 'start' | 'middle'): Box => {
    const x0 = anchor === 'start' ? x : x - w / 2;
    return { x0, x1: x0 + w, y0: y - VALUE_H / 2, y1: y + VALUE_H / 2 };
  };
  const clash = (b: Box): number =>
    (b.x0 >= bounds.x0 && b.x1 <= bounds.x1 && b.y0 >= bounds.y0 && b.y1 <= bounds.y1 ? 0 : 100) +
    dotBoxes.filter((o) => hit(b, o, 1)).length +
    taken.filter((o) => hit(b, o, 2)).length * 2 +
    samples.filter((s) => s.x > b.x0 - 1 && s.x < b.x1 + 1 && s.y > b.y0 - 1 && s.y < b.y1 + 1).length;
  const scoreOf = (i: number): number => placed[i]?.score ?? 0;
  const labels: SceneItem[] = [];
  dots.forEach((p, i) => {
    const text = journey.sections.flatMap((s) => s.tasks)[i]?.scoreText ?? String(scoreOf(i));
    const w = smallW(text);
    const cur = scoreOf(i);
    const prev = i > 0 ? scoreOf(i - 1) : undefined;
    const next = i < dots.length - 1 ? scoreOf(i + 1) : undefined;
    let side: 'above' | 'below' | 'right-up' | 'right-down' = 'above';
    if (prev !== undefined || next !== undefined) {
      const before = prev ?? 2 * cur - (next ?? cur);
      const after = next ?? 2 * cur - before;
      if (cur >= before && cur >= after) side = 'above';
      else if (cur <= before && cur <= after) side = 'below';
      else side = cur > before ? 'right-down' : 'right-up';
    }
    const at = (kind: typeof side, extra: number): { x: number; y: number; anchor: 'start' | 'middle' } => {
      const o = off + extra;
      if (kind === 'above') return { x: p.x, y: p.y - (o + 8), anchor: 'middle' };
      if (kind === 'below') return { x: p.x, y: p.y + (o + 8), anchor: 'middle' };
      if (kind === 'right-up') return { x: p.x + o, y: p.y - (o + 4), anchor: 'start' };
      return { x: p.x + o, y: p.y + (o + 4), anchor: 'start' };
    };
    const order: (typeof side)[] = [side, side === 'above' ? 'below' : side === 'below' ? 'above' : side === 'right-up' ? 'above' : 'below', 'right-up', 'right-down', 'above', 'below'];
    let best: { x: number; y: number; anchor: 'start' | 'middle' } | undefined;
    let bestScore = Infinity;
    search: for (const extra of [0, 4, 8, 12]) {
      for (const kind of order) {
        const c = at(kind, extra);
        const score = clash(boxOf(c.x, c.y, w, c.anchor));
        if (score < bestScore) {
          best = c;
          bestScore = score;
        }
        if (score === 0) break search;
      }
    }
    const c = best ?? at(side, 0);
    taken.push(boxOf(c.x, c.y, w, c.anchor));
    labels.push({ kind: 'text', x: r2(c.x), y: r2(c.y), text, anchor: c.anchor, role: ['value'] });
  });
  items.push(...labels);

  const sceneTitle = journey.accTitle !== undefined && journey.accTitle !== '' ? journey.accTitle : journey.title === undefined ? 'user-journey' : `user-journey — ${journey.title}`;
  const scene: Scene = { width, height, title: sceneTitle, items, theme };
  return { scene, width, height, sections, tasks: placed, overflow };
}
