import type { Ruler } from '../metrics.ts';
import type { Scene, SceneItem } from '../types.ts';
import type { Theme } from '../render/theme.ts';
import type { Ishikawa, IshikawaCategory } from './parse.ts';

const MARGIN = 24;
const BOX_H = 48;
const BOX_MIN_W = 120;
const BOX_PAD = 32;
/** Distance from the far end of a bone to its first cause, and from its last cause to the spine. */
const EDGE_GAP = 48;
const MIN_REACH = 96;
const CAUSE_PITCH = 32;
const SUB_PITCH = 24;
const TICK_CAUSE = 24;
const TICK_SUB = 12;
const TEXT_GAP = 8;
const CLEAR = 16;
const HEAD_GAP = 48;
const TITLE_H = 40;

export type Side = 'top' | 'bottom';
export type Assign = 'alternate' | 'balanced';

export interface PlacedCause {
  text: string;
  depth: number;
  /** End of the tick on the bone and the anchor of the text (its right end). */
  y: number;
  bone: { x: number; y: number };
  tick: number;
  textX: number;
  width: number;
}

export interface PlacedBone {
  name: string;
  side: Side;
  /** Position among the bones of its side, left to right. */
  rank: number;
  /** Where the bone meets the spine. */
  join: { x: number; y: number };
  /** The far end of the bone, where its name box hangs. */
  far: { x: number; y: number };
  box: { x: number; y: number; w: number; h: number };
  causes: PlacedCause[];
}

export interface IshikawaLayout {
  scene: Scene;
  bones: PlacedBone[];
  head: { x: number; y: number; w: number; h: number };
  spine: { x1: number; x2: number; y: number };
}

export interface IshikawaOptions {
  /** `alternate` puts the categories above and below the spine in turn; `balanced` puts each on the side with fewer causes so far. */
  assign?: Assign;
}

const ceil = (v: number, step: number): number => Math.ceil(v / step) * step;

interface Draft {
  category: IshikawaCategory;
  side: Side;
  rank: number;
  boxW: number;
  /** Offsets of the rows from the start of the list. */
  offsets: number[];
  widths: number[];
  ticks: number[];
}

function assignSides(categories: IshikawaCategory[], mode: Assign): Side[] {
  if (mode === 'alternate') return categories.map((_, i) => (i % 2 === 0 ? 'top' : 'bottom'));
  const load = { top: 0, bottom: 0 };
  return categories.map((c) => {
    const side: Side = load.bottom < load.top ? 'bottom' : 'top';
    load[side] += c.causes.length;
    return side;
  });
}

export function layoutIshikawa(model: Ishikawa, ruler: Ruler, theme?: Theme, heading?: string, opts: IshikawaOptions = {}): IshikawaLayout {
  const nameW = (s: string): number => ceil(Math.max(BOX_MIN_W, ruler.textWidth(s, 'title') + BOX_PAD), 8);
  const sides = assignSides(model.categories, opts.assign ?? 'alternate');
  const ranks = { top: 0, bottom: 0 };
  const drafts: Draft[] = model.categories.map((category, i) => {
    const side = sides[i] ?? 'top';
    const offsets: number[] = [];
    let at = 0;
    category.causes.forEach((cause, r) => {
      if (r > 0) at += cause.depth > 1 ? SUB_PITCH : CAUSE_PITCH;
      offsets.push(at);
    });
    return {
      category,
      side,
      rank: ranks[side]++,
      boxW: nameW(category.name),
      offsets,
      widths: category.causes.map((c) => ruler.textWidth(c.text, 'line')),
      ticks: category.causes.map((c) => (c.depth > 1 ? TICK_SUB : TICK_CAUSE)),
    };
  });
  const listHeight = (d: Draft): number => d.offsets[d.offsets.length - 1] ?? 0;
  const reach = (side: Side): number => {
    const own = drafts.filter((d) => d.side === side);
    return own.length === 0 ? 0 : ceil(Math.max(MIN_REACH, ...own.map((d) => 2 * EDGE_GAP + listHeight(d))), 8);
  };
  const reachOf = { top: reach('top'), bottom: reach('bottom') };
  // Rows lie at a distance from the spine: above, counted down from the far end; below, counted down from the spine.
  const distance = (d: Draft, offset: number): number => (d.side === 'top' ? reachOf.top - EDGE_GAP - offset : EDGE_GAP + offset);

  // Bones are paired by rank; each pair meets the spine at one x. A bone clears the bone before it on its side by
  // its widest cause and by the two name boxes, which does not depend on the row because both bones lean alike.
  const columns = Math.max(0, ...drafts.map((d) => d.rank + 1));
  const at = (side: Side, rank: number): Draft | undefined => drafts.find((d) => d.side === side && d.rank === rank);
  const joinX: number[] = [];
  for (let k = 0; k < columns; k += 1) {
    const here = (['top', 'bottom'] as const).flatMap((s) => at(s, k) ?? []);
    if (k === 0) {
      const left = here.map((d) => {
        const rows = d.offsets.map((o, r) => distance(d, o) / 2 + (d.ticks[r] ?? 0) + TEXT_GAP + (d.widths[r] ?? 0));
        return Math.max(reachOf[d.side] / 2 + d.boxW / 2, ...rows);
      });
      joinX.push(ceil(MARGIN + Math.max(0, ...left), 4));
      continue;
    }
    const pitch = here.map((d) => {
      const prev = at(d.side, k - 1);
      const text = Math.max(0, ...d.widths.map((w, r) => (d.ticks[r] ?? 0) + TEXT_GAP + w)) + CLEAR;
      return Math.max(text, prev === undefined ? 0 : (prev.boxW + d.boxW) / 2 + CLEAR);
    });
    joinX.push((joinX[k - 1] ?? 0) + ceil(Math.max(0, ...pitch), 4));
  }

  const titleH = heading === undefined ? 0 : TITLE_H;
  const hasTop = reachOf.top > 0;
  const spineY = hasTop ? MARGIN + titleH + BOX_H + reachOf.top : MARGIN + titleH + BOX_H / 2;
  const height = reachOf.bottom > 0 ? spineY + reachOf.bottom + BOX_H + MARGIN : spineY + BOX_H / 2 + MARGIN;

  const bones: PlacedBone[] = drafts.map((d) => {
    const jx = joinX[d.rank] ?? MARGIN;
    const v = reachOf[d.side];
    const sign = d.side === 'top' ? -1 : 1;
    const far = { x: jx - v / 2, y: spineY + sign * v };
    const causes = d.category.causes.map((cause, r): PlacedCause => {
      const dist = distance(d, d.offsets[r] ?? 0);
      const bone = { x: jx - dist / 2, y: spineY + sign * dist };
      const tick = d.ticks[r] ?? 0;
      return { text: cause.text, depth: cause.depth, y: bone.y, bone, tick, textX: bone.x - tick - TEXT_GAP, width: d.widths[r] ?? 0 };
    });
    const boxY = d.side === 'top' ? far.y - BOX_H : far.y;
    return {
      name: d.category.name,
      side: d.side,
      rank: d.rank,
      join: { x: jx, y: spineY },
      far,
      box: { x: far.x - d.boxW / 2, y: boxY, w: d.boxW, h: BOX_H },
      causes,
    };
  });

  const lastJoin = joinX[columns - 1] ?? MARGIN + HEAD_GAP;
  const boxRight = Math.max(0, ...bones.map((b) => b.box.x + b.box.w + 2 * CLEAR));
  const headW = ceil(Math.max(BOX_MIN_W, ruler.textWidth(model.head, 'title') + BOX_PAD), 8);
  const headX = ceil(Math.max(lastJoin + HEAD_GAP, boxRight), 4);
  const head = { x: headX, y: spineY - BOX_H / 2, w: headW, h: BOX_H };
  const width = Math.max(headX + headW + MARGIN, heading === undefined ? 0 : ceil(ruler.textWidth(heading, 'title') + 2 * MARGIN, 4));
  const spine = { x1: MARGIN, x2: headX, y: spineY };

  const lines: SceneItem[] = [{ kind: 'line', points: [{ x: spine.x1, y: spineY }, { x: spine.x2, y: spineY }], role: ['edge', 'edge--arrow'], data: { part: 'spine' } }];
  const texts: SceneItem[] = [];
  const boxes: SceneItem[] = [];
  bones.forEach((bone, bi) => {
    lines.push({ kind: 'line', points: [bone.far, bone.join], role: ['edge'], data: { part: 'bone', bone: String(bi) } });
    for (const cause of bone.causes) {
      lines.push({ kind: 'line', points: [{ x: cause.bone.x - cause.tick, y: cause.y }, cause.bone], role: ['edge'], data: { part: 'cause', bone: String(bi) } });
      texts.push({ kind: 'text', x: cause.textX, y: cause.y, text: cause.text, role: [cause.depth > 1 ? 'sub' : 'body', 'end'], data: { bone: String(bi), depth: String(cause.depth) } });
    }
    boxes.push({ kind: 'box', style: 'box', x: bone.box.x, y: bone.box.y, w: bone.box.w, h: bone.box.h, role: ['box'], data: { bone: String(bi) } });
    texts.push({ kind: 'text', x: bone.box.x + bone.box.w / 2, y: bone.box.y + bone.box.h / 2, text: bone.name, role: ['name'], data: { bone: String(bi) } });
  });
  boxes.push({ kind: 'box', style: 'box', x: head.x, y: head.y, w: head.w, h: head.h, role: ['box'], data: { part: 'head' } });
  texts.push({ kind: 'text', x: head.x + head.w / 2, y: spineY, text: model.head, role: ['name'], data: { part: 'head' } });
  const titleItems: SceneItem[] = heading === undefined ? [] : [{ kind: 'text', x: MARGIN, y: MARGIN + 8, text: heading, role: ['title', 'start'] }];

  const scene: Scene = {
    width,
    height,
    title: model.accTitle ?? heading ?? `ishikawa — ${model.head}`,
    items: [...titleItems, ...lines, ...boxes, ...texts],
    ...(theme === undefined ? {} : { theme }),
  };
  return { scene, bones, head, spine };
}
