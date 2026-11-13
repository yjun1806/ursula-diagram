import { ceilTo } from '../chart/grid.ts';
import type { Ruler } from '../metrics.ts';
import type { Theme } from '../render/theme.ts';
import type { Point, Scene, SceneItem } from '../types.ts';
import { DOMAIN_NAMES } from './model.ts';
import type { Cynefin, CynefinTransition, Domain } from './model.ts';

const MARGIN = 24;
const GAP = 8;
/** Baseline of an area name, below the top of its area. */
const NAME_Y = 28;
const ITEM_TOP = 44;
const ITEM_H = 48;
const ITEM_GAP = 8;
const PAD = 24;
const ROW = ITEM_H + ITEM_GAP;
const MIN_ITEM_W = 212;
const CHIP_H = 24;
const CHIP_RISE = 12;
const BARE_CHIP_W = 64;
const ARROW_EXTRA = 32;
const VERTICAL_LEN = 40;
const TITLE_BAND = 40;
const DETOUR = 12;
const DETOUR_BAND = 36;
const LANE_SHIFT = 8;
const PORT_R = 3.25;


export interface PlacedZone {
  domain: Domain;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PlacedItem {
  domain: Domain;
  index: number;
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PlacedTransition {
  from: Domain;
  to: Domain;
  label?: string;
  /** From the start of the arrow to its tip. */
  points: Point[];
  chip?: { x: number; y: number; w: number; h: number; text: string };
  /** `across` joins side-by-side or stacked neighbours; `around` joins the two corners that do not touch. */
  route: 'across' | 'around';
}

export interface CynefinLayout {
  scene: Scene;
  zones: PlacedZone[];
  items: PlacedItem[];
  transitions: PlacedTransition[];
}

type Pair = 'top' | 'bottom' | 'left' | 'right' | 'corner-a' | 'corner-b';

/** Which edge of the 2 × 2 a pair of domains shares; `corner-a` is Complex–Clear and `corner-b` Complicated–Chaotic. */
function pairOf(t: CynefinTransition): Pair {
  const has = (a: Domain, b: Domain): boolean => (t.from === a && t.to === b) || (t.from === b && t.to === a);
  if (has('complex', 'complicated')) return 'top';
  if (has('chaotic', 'clear')) return 'bottom';
  if (has('complex', 'chaotic')) return 'left';
  if (has('complicated', 'clear')) return 'right';
  if (has('complex', 'clear')) return 'corner-a';
  return 'corner-b';
}

/** Height of a zone that stacks `n` items under its name. */
const stackH = (n: number): number => ITEM_TOP + n * ITEM_H + (n - 1) * ITEM_GAP + PAD;

/**
 * Places the four domains as a 2 × 2 with the Confusion zone over the point where they meet.
 * Items stack in the outer column of each domain, so the Confusion zone never covers one.
 */
export function layoutCynefin(model: Cynefin, ruler: Ruler, theme?: Theme): CynefinLayout {
  const textW = (s: string): number => ruler.textWidth(s, 'title');
  const chipW = (label: string | undefined): number => (label === undefined ? BARE_CHIP_W : ceilTo(ruler.textWidth(label, 'line') + 16));
  const transitions = model.transitions;
  const pairs = transitions.map(pairOf);
  const count = (p: Pair): number => pairs.filter((q) => q === p).length;

  const texts = (['complex', 'complicated', 'chaotic', 'clear', 'confusion'] as const).flatMap((d) => model.items[d]);
  const verticalChip = Math.max(0, ...transitions.filter((_, i) => pairs[i] === 'left' || pairs[i] === 'right').map((t) => chipW(t.label)));
  const itemW = Math.max(MIN_ITEM_W, ceilTo(Math.max(0, ...texts.map(textW)) + 32), verticalChip === 0 ? 0 : verticalChip + 36);
  const longestArrow = Math.max(0, ...transitions.filter((_, i) => pairs[i] === 'top' || pairs[i] === 'bottom').map((t) => chipW(t.label) + ARROW_EXTRA));
  const zoneW = ceilTo(Math.max(1.5 * itemW + 82, itemW + 32 + longestArrow / 2));

  const rowsMax = Math.max(1, ...(['complex', 'complicated', 'chaotic', 'clear'] as const).map((d) => model.items[d].length));
  const rowsConfusion = Math.max(1, model.items.confusion.length);
  const confusionW = itemW + 2 * PAD;
  const confusionH = stackH(rowsConfusion);
  // The lower arrows sit at the first item row whose chip clears the Confusion zone; the second row when it is small.
  let lowRow = 1;
  while (ROW * lowRow + 32 < confusionH / 2 + 4) lowRow += 1;
  const topArrows = count('top');
  const bottomArrows = count('bottom');
  const zoneH = ceilTo(
    Math.max(stackH(rowsMax), topArrows > 0 ? 80 + ROW * (topArrows - 1) + confusionH / 2 : 0, bottomArrows > 0 ? stackH(lowRow + bottomArrows) : 0),
  );

  const hasTitle = model.title !== undefined;
  const cornerA = count('corner-a') > 0;
  const cornerB = count('corner-b') > 0;
  const top = MARGIN + (hasTitle ? TITLE_BAND : 0) + (cornerA ? DETOUR_BAND : 0);
  const leftX = MARGIN;
  const rightX = MARGIN + zoneW + GAP;
  const lowerY = top + zoneH + GAP;
  const centreX = MARGIN + zoneW + GAP / 2;
  const centreY = top + zoneH + GAP / 2;
  const titleW = model.title === undefined ? 0 : (ruler.textWidth(model.title, 'title') * 15) / 13;
  const width = Math.max(2 * MARGIN + 2 * zoneW + GAP, ceilTo(2 * MARGIN + titleW));
  const height = lowerY + zoneH + MARGIN + (cornerB ? DETOUR_BAND / 3 : 0);

  const zoneAt: Record<Exclude<Domain, 'confusion'>, { x: number; y: number; outerLeft: boolean }> = {
    complex: { x: leftX, y: top, outerLeft: true },
    complicated: { x: rightX, y: top, outerLeft: false },
    chaotic: { x: leftX, y: lowerY, outerLeft: true },
    clear: { x: rightX, y: lowerY, outerLeft: false },
  };
  const pillarX = (z: { x: number; outerLeft: boolean }): number => (z.outerLeft ? z.x + PAD : z.x + zoneW - PAD - itemW);

  const zones: PlacedZone[] = [];
  const placed: PlacedItem[] = [];
  const quadrants: SceneItem[] = [];
  const confusionZone: SceneItem[] = [];
  const boxes: SceneItem[] = [];

  const stack = (domain: Domain, x: number, y: number, inZone: boolean): void => {
    model.items[domain].forEach((text, index) => {
      const by = y + ITEM_TOP + index * ROW;
      placed.push({ domain, index, text, x, y: by, w: itemW, h: ITEM_H });
      const data = { domain, item: String(index) };
      boxes.push({ kind: 'box', style: 'box', x, y: by, w: itemW, h: ITEM_H, role: inZone ? ['box', 'box--in-zone'] : ['box'], data });
      boxes.push({ kind: 'text', x: x + itemW / 2, y: by + ITEM_H / 2, text, role: ['name'], data });
    });
  };

  for (const domain of ['complex', 'complicated', 'chaotic', 'clear'] as const) {
    const z = zoneAt[domain];
    const px = pillarX(z);
    zones.push({ domain, name: DOMAIN_NAMES[domain], x: z.x, y: z.y, w: zoneW, h: zoneH });
    quadrants.push({ kind: 'box', style: 'frame', x: z.x, y: z.y, w: zoneW, h: zoneH, role: ['zone', 'zone--plain'], data: { domain } });
    quadrants.push({ kind: 'text', x: px, y: z.y + NAME_Y, text: DOMAIN_NAMES[domain], anchor: 'start', role: ['zone-name'], data: { domain }, baseline: 'alphabetic' });
    stack(domain, px, z.y, false);
  }
  const confusionX = centreX - confusionW / 2;
  const confusionY = centreY - confusionH / 2;
  zones.push({ domain: 'confusion', name: DOMAIN_NAMES.confusion, x: confusionX, y: confusionY, w: confusionW, h: confusionH });
  confusionZone.push({ kind: 'box', style: 'frame', x: confusionX, y: confusionY, w: confusionW, h: confusionH, role: ['zone'], data: { domain: 'confusion' } });
  confusionZone.push({ kind: 'text', x: confusionX + PAD, y: confusionY + NAME_Y, text: DOMAIN_NAMES.confusion, anchor: 'start', role: ['zone-name'], data: { domain: 'confusion' }, baseline: 'alphabetic' });
  stack('confusion', confusionX + PAD, confusionY, true);

  // Lanes between an outer column of items and the Confusion zone, where the corner-to-corner arrows run.
  const laneLeft = (MARGIN + PAD + itemW + confusionX) / 2;
  const laneRight = 2 * centreX - laneLeft;
  const isUpper = (d: Domain): boolean => d === 'complex' || d === 'complicated';
  const rowY = (zoneY: number, row: number): number => zoneY + ITEM_TOP + ROW * row + ITEM_H / 2;

  const used: Record<Pair, number> = { top: 0, bottom: 0, left: 0, right: 0, 'corner-a': 0, 'corner-b': 0 };
  const arrows: SceneItem[] = [];
  const ports: SceneItem[] = [];
  const chips: SceneItem[] = [];
  const out: PlacedTransition[] = [];

  transitions.forEach((t, i) => {
    const pair = pairs[i] ?? 'top';
    const nth = used[pair];
    used[pair] += 1;
    const w = chipW(t.label);
    let points: Point[];
    let chip: PlacedTransition['chip'];
    let route: PlacedTransition['route'] = 'across';
    const chipAt = (x: number, y: number): NonNullable<PlacedTransition['chip']> => ({ x, y, w, h: CHIP_H, text: t.label ?? '' });

    if (pair === 'top' || pair === 'bottom') {
      const y = pair === 'top' ? rowY(top, nth) : rowY(lowerY, lowRow + nth);
      const half = (w + ARROW_EXTRA) / 2;
      const forward = t.from === 'complex' || t.from === 'chaotic';
      points = forward ? [{ x: centreX - half, y }, { x: centreX + half, y }] : [{ x: centreX + half, y }, { x: centreX - half, y }];
      if (t.label !== undefined) chip = chipAt(centreX - w / 2, y - CHIP_RISE - CHIP_H);
    } else if (pair === 'left' || pair === 'right') {
      const leftColumn = pair === 'left';
      const ax = pillarX(zoneAt[leftColumn ? 'complex' : 'complicated']) + itemW - PAD;
      const down = isUpper(t.from);
      points = down
        ? [{ x: ax, y: centreY - VERTICAL_LEN / 2 }, { x: ax, y: centreY + VERTICAL_LEN / 2 }]
        : [{ x: ax, y: centreY + VERTICAL_LEN / 2 }, { x: ax, y: centreY - VERTICAL_LEN / 2 }];
      if (t.label !== undefined) chip = chipAt(ax - 12 - w, centreY - CHIP_H / 2);
    } else {
      route = 'around';
      const lowEnd = rowY(lowerY, lowRow);
      const upStart = top + ITEM_TOP;
      let path: Point[];
      let chipY: number;
      if (pair === 'corner-a') {
        const yt = top - DETOUR;
        const l = laneLeft - LANE_SHIFT;
        const r = laneRight + LANE_SHIFT;
        path = [{ x: l, y: upStart }, { x: l, y: yt }, { x: r, y: yt }, { x: r, y: lowEnd }];
        chipY = yt - CHIP_RISE - CHIP_H;
      } else {
        const yb = lowerY + zoneH + DETOUR;
        const l = laneLeft + LANE_SHIFT;
        const r = laneRight - LANE_SHIFT;
        path = [{ x: r, y: upStart }, { x: r, y: yb }, { x: l, y: yb }, { x: l, y: lowEnd }];
        chipY = yb - CHIP_RISE - CHIP_H;
      }
      // Complex → Clear and Complicated → Chaotic read along the path as written; the other way round reverses it.
      const forward = t.from === 'complex' || t.from === 'complicated';
      points = forward ? path : [...path].reverse();
      if (t.label !== undefined) chip = chipAt(centreX - w / 2, chipY);
    }

    const start = points[0];
    arrows.push({ kind: 'line', points, role: ['edge', 'edge--arrow'], data: { from: t.from, to: t.to } });
    if (start !== undefined) ports.push({ kind: 'circle', cx: start.x, cy: start.y, r: PORT_R, role: ['port'] });
    if (chip !== undefined) {
      chips.push({ kind: 'box', style: 'label', x: chip.x, y: chip.y, w: chip.w, h: chip.h, role: ['chip'], data: { from: t.from, to: t.to } });
      chips.push({ kind: 'text', x: chip.x + chip.w / 2, y: chip.y + chip.h / 2, text: chip.text, role: ['label'], data: { from: t.from, to: t.to } });
    }
    out.push({ from: t.from, to: t.to, ...(t.label === undefined ? {} : { label: t.label }), points, ...(chip === undefined ? {} : { chip }), route });
  });

  const titleItems: SceneItem[] =
    model.title === undefined ? [] : [{ kind: 'text', x: MARGIN, y: MARGIN + 16, text: model.title, anchor: 'start', role: ['title'], baseline: 'alphabetic' }];
  const name = model.accTitle ?? (model.title === undefined ? 'cynefin' : `cynefin — ${model.title}`);
  const scene: Scene = {
    width,
    height,
    title: name,
    items: [...titleItems, ...quadrants, ...arrows, ...confusionZone, ...boxes, ...ports, ...chips],
    ...(theme === undefined ? {} : { theme }),
  };
  return { scene, zones, items: placed, transitions: out };
}
