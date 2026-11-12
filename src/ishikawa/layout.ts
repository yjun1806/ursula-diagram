import { ceilTo } from '../chart/grid.ts';
import type { Ruler } from '../metrics.ts';
import type { Theme } from '../render/theme.ts';
import type { Scene, SceneItem } from '../types.ts';
import type { Ishikawa, IshikawaCategory, IshikawaCause } from './parse.ts';

const MARGIN = 24;
const BOX_H = 48;
const BOX_MIN_W = 120;
const BOX_PAD = 32;
/** Distance from the far end of a bone to its first cause, and from its last cause to the spine. */
const EDGE_GAP = 48;
const MIN_REACH = 96;
const CAUSE_PITCH = 32;
const TICK_CAUSE = 24;
const TEXT_GAP = 8;
/** A deeper cause: a sub-bone that drops `SUB_RISE` and runs `SUB_RUN` left from its cause line, its text centred
 * `SUB_TEXT` below the sub-bone's end. The first sub-bone starts `SUB_START` from the line's left end, the others
 * keep `SUB_GAP` between their texts. A cause with sub-bones takes `SUB_BLOCK` more room below its row. */
const SUB_RISE = 24;
const SUB_RUN = 12;
const SUB_TEXT = 14;
const SUB_START = 16;
const SUB_GAP = 16;
const SUB_BLOCK = 40;
/** How far a bone leans across the height of a sub-bone and its text. */
const SUB_LEAN = (SUB_RISE + SUB_TEXT + TEXT_GAP) / 2;
const CLEAR = 16;
const HEAD_GAP = 48;
const TITLE_H = 40;

export type Side = 'top' | 'bottom';
export type Assign = 'halves' | 'alternate' | 'balanced';

export interface PlacedCause {
  text: string;
  depth: number;
  /** The cause a deeper cause belongs to. */
  parent?: string;
  /** Height of the cause's row; for a deeper cause, the row of its cause line. */
  y: number;
  /** Where the cause's line starts: on the bone for a cause, on the cause line for a deeper cause. */
  bone: { x: number; y: number };
  /** Length of a cause line. */
  tick: number;
  /** End of a deeper cause's sub-bone. */
  tip?: { x: number; y: number };
  /** Anchor of the text: its right end for a cause, its centre for a deeper cause. */
  textX: number;
  textY: number;
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
  /**
   * `halves` (the default) puts the first half of the categories above the spine and the rest below; `alternate` puts
   * them above and below in turn; `balanced` puts each on the side with fewer causes so far.
   */
  assign?: Assign;
}


/** A cause with the deeper causes listed under it, and where its sub-bones start, from the left end of its line. */
interface Row {
  cause: IshikawaCause;
  width: number;
  subs: IshikawaCause[];
  subWidths: number[];
  starts: number[];
  tick: number;
  /** How far left of its point on the bone the row's texts reach. */
  reach: number;
}

interface Draft {
  category: IshikawaCategory;
  side: Side;
  rank: number;
  boxW: number;
  rows: Row[];
  /** Offsets of the rows from the start of the list. */
  offsets: number[];
  /** From the first row to the end of the last row's sub-bones. */
  height: number;
}

function assignSides(categories: IshikawaCategory[], mode: Assign): Side[] {
  if (mode === 'halves') return categories.map((_, i) => (i < Math.ceil(categories.length / 2) ? 'top' : 'bottom'));
  if (mode === 'alternate') return categories.map((_, i) => (i % 2 === 0 ? 'top' : 'bottom'));
  const load = { top: 0, bottom: 0 };
  return categories.map((c) => {
    const side: Side = load.bottom < load.top ? 'bottom' : 'top';
    load[side] += c.causes.length;
    return side;
  });
}

/** Groups every deeper cause under the cause above it; a deeper cause with no cause above it stands as a cause. */
function rowsOf(causes: IshikawaCause[], ruler: Ruler): Row[] {
  const groups: Array<{ cause: IshikawaCause; subs: IshikawaCause[] }> = [];
  for (const c of causes) {
    const last = groups[groups.length - 1];
    if (c.depth > 1 && last !== undefined) last.subs.push(c);
    else groups.push({ cause: c, subs: [] });
  }
  return groups.map(({ cause, subs }) => {
    const width = ruler.textWidth(cause.text, 'line');
    const subWidths = subs.map((c) => ruler.textWidth(c.text, 'line'));
    const starts: number[] = [];
    subWidths.forEach((w, i) => {
      const prev = starts[i - 1];
      starts.push(prev === undefined ? SUB_START : prev + ceilTo(((subWidths[i - 1] ?? 0) + w) / 2 + SUB_GAP, 4));
    });
    const lastStart = starts[starts.length - 1];
    const lastW = subWidths[subWidths.length - 1] ?? 0;
    // The line runs past its last sub-bone, far enough that the last text clears the bone below the row.
    const tick = lastStart === undefined ? TICK_CAUSE : ceilTo(Math.max(lastStart + TICK_CAUSE, lastStart - SUB_RUN + lastW / 2 + TEXT_GAP + SUB_LEAN), 4);
    const firstW = subWidths[0] ?? 0;
    const subReach = subs.length === 0 ? 0 : tick - SUB_START + SUB_RUN + firstW / 2 + SUB_LEAN;
    return { cause, width, subs, subWidths, starts, tick, reach: Math.max(tick + TEXT_GAP + width, subReach) };
  });
}

export function layoutIshikawa(model: Ishikawa, ruler: Ruler, theme?: Theme, heading?: string, opts: IshikawaOptions = {}): IshikawaLayout {
  const nameW = (s: string): number => ceilTo(Math.max(BOX_MIN_W, ruler.textWidth(s, 'title') + BOX_PAD), 8);
  const sides = assignSides(model.categories, opts.assign ?? 'halves');
  const ranks = { top: 0, bottom: 0 };
  const drafts: Draft[] = model.categories.map((category, i) => {
    const side = sides[i] ?? 'top';
    const rows = rowsOf(category.causes, ruler);
    const offsets: number[] = [];
    let at = 0;
    rows.forEach((row, r) => {
      if (r > 0) at += CAUSE_PITCH + ((rows[r - 1]?.subs.length ?? 0) > 0 ? SUB_BLOCK : 0);
      offsets.push(at);
    });
    const height = at + ((rows[rows.length - 1]?.subs.length ?? 0) > 0 ? SUB_BLOCK : 0);
    return { category, side, rank: ranks[side]++, boxW: nameW(category.name), rows, offsets, height };
  });
  const reach = (side: Side): number => {
    const own = drafts.filter((d) => d.side === side);
    return own.length === 0 ? 0 : ceilTo(Math.max(MIN_REACH, ...own.map((d) => 2 * EDGE_GAP + d.height)), 8);
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
        const rows = d.rows.map((row, r) => distance(d, d.offsets[r] ?? 0) / 2 + row.reach);
        return Math.max(reachOf[d.side] / 2 + d.boxW / 2, ...rows);
      });
      joinX.push(ceilTo(MARGIN + Math.max(0, ...left), 4));
      continue;
    }
    const pitch = here.map((d) => {
      const prev = at(d.side, k - 1);
      const text = Math.max(0, ...d.rows.map((row) => row.reach)) + CLEAR;
      return Math.max(text, prev === undefined ? 0 : (prev.boxW + d.boxW) / 2 + CLEAR);
    });
    joinX.push((joinX[k - 1] ?? 0) + ceilTo(Math.max(0, ...pitch), 4));
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
    const causes = d.rows.flatMap((row, r): PlacedCause[] => {
      const dist = distance(d, d.offsets[r] ?? 0);
      const bone = { x: jx - dist / 2, y: spineY + sign * dist };
      const left = bone.x - row.tick;
      const main: PlacedCause = { text: row.cause.text, depth: row.cause.depth, y: bone.y, bone, tick: row.tick, textX: left - TEXT_GAP, textY: bone.y, width: row.width };
      const subs = row.subs.map((sub, k): PlacedCause => {
        const start = { x: left + (row.starts[k] ?? 0), y: bone.y };
        const tip = { x: start.x - SUB_RUN, y: start.y + SUB_RISE };
        return { text: sub.text, depth: sub.depth, parent: row.cause.text, y: bone.y, bone: start, tick: 0, tip, textX: tip.x, textY: tip.y + SUB_TEXT, width: row.subWidths[k] ?? 0 };
      });
      return [main, ...subs];
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
  const headW = ceilTo(Math.max(BOX_MIN_W, ruler.textWidth(model.head, 'title') + BOX_PAD), 8);
  const headX = ceilTo(Math.max(lastJoin + HEAD_GAP, boxRight), 4);
  const head = { x: headX, y: spineY - BOX_H / 2, w: headW, h: BOX_H };
  const width = Math.max(headX + headW + MARGIN, heading === undefined ? 0 : ceilTo(ruler.textWidth(heading, 'title') + 2 * MARGIN, 4));
  const spine = { x1: MARGIN, x2: headX, y: spineY };

  const lines: SceneItem[] = [{ kind: 'line', points: [{ x: spine.x1, y: spineY }, { x: spine.x2, y: spineY }], role: ['edge', 'edge--arrow'], data: { part: 'spine' } }];
  const texts: SceneItem[] = [];
  const boxes: SceneItem[] = [];
  bones.forEach((bone, bi) => {
    lines.push({ kind: 'line', points: [bone.far, bone.join], role: ['edge'], data: { part: 'bone', bone: String(bi) } });
    for (const cause of bone.causes) {
      const data = { bone: String(bi), depth: String(cause.depth) };
      if (cause.tip === undefined) {
        lines.push({ kind: 'line', points: [{ x: cause.bone.x - cause.tick, y: cause.y }, cause.bone], role: ['edge'], data: { part: 'cause', bone: String(bi) } });
        texts.push({ kind: 'text', x: cause.textX, y: cause.textY, text: cause.text, role: ['body', 'end'], data });
      } else {
        lines.push({ kind: 'line', points: [cause.bone, cause.tip], role: ['edge'], data: { part: 'sub', bone: String(bi) } });
        texts.push({ kind: 'text', x: cause.textX, y: cause.textY, text: cause.text, role: ['sub'], data });
      }
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
