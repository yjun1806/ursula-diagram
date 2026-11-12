import { ceilTo, floorTo, roundTo } from '../chart/grid.ts';
import { cellWidth } from '../metrics.ts';
import type { Ruler } from '../metrics.ts';
import { SCENE_THEME_SPECS } from '../render/scene-theme.ts';
import type { Theme } from '../render/theme.ts';
import type { Point, Scene, SceneItem } from '../types.ts';
import type { Node, Railroad } from './model.ts';

const MARGIN = 24;
const TITLE_LINE = 18;
const TITLE_GAP = 24;
const TOKEN_H = 32;
const TOKEN_MIN_W = 48;
const TOKEN_PAD = 32;
/** Width of a monospace letter at 12px. */
const MONO_ADVANCE = 7.2;
const SEQ_GAP = 24;
const CHOICE_GAP = 8;
const RULE_GAP = 40;
/** A loop or skip line keeps this far from the box it passes. */
const RAIL_CLEAR = 24;
/** Where the vertical piece of a fork stands from the block edge, and the room a block keeps on each side. */
const FORK_X = 16;
const BLOCK_PAD = 40;
/** A zero-or-more loop stands its vertical rails this far inside the skip rails, so the two never share a line. */
const LOOP_INSET = 32;
/** Extra room on the left of an ordered choice for the order numbers. */
const ORDER_ROOM = 16;
/** The order numbers of a choice stand in one column this far left of where its widest branch starts, centred this far above their rails. */
const ORDER_DX = 12;
const ORDER_DY = 10;
const NAME_GAP = 24;
const END_STUB = 24;
const CHIP_H = 24;
const CHIP_GAP = 8;

interface Sized {
  node: Node;
  w: number;
  /** Axis height above the top edge, and the extent below the axis. */
  up: number;
  down: number;
  kids: Sized[];
  /** The text of a count chip or a mark; set for those only. */
  chip?: string;
  /** Width of the count chip of a repeat. */
  chipW?: number;
}

export interface RailroadLayout {
  scene: Scene;
  /** Axis height of every rule, in rule order. */
  axes: number[];
}

const loopInset = (min: number): number => (min === 0 ? LOOP_INSET : 0);

const chipWidth = (text: string, ruler: Ruler): number => Math.max(CHIP_H, ceilTo(ruler.textWidth(text, 'line') + 16, 4));

function tokenWidth(text: string, mono: boolean, ruler: Ruler): number {
  const proportional = ruler.textWidth(text, 'line');
  const w = mono ? Math.max(proportional, cellWidth(text) * MONO_ADVANCE) : proportional;
  return Math.max(TOKEN_MIN_W, ceilTo(w + TOKEN_PAD, 8));
}

/** A terminal that is blank is shown in quotes so it can be seen. */
export const terminalLabel = (text: string): string => (text.trim() === '' ? `"${text}"` : text);

function chipOf(text: string, ruler: Ruler): Sized {
  return { node: { k: 'special', text }, w: chipWidth(text, ruler), up: CHIP_H / 2, down: CHIP_H / 2, kids: [], chip: text };
}

/** How a count is written: `2*4`, `3`, `2*`, `*3`; absent for the plain `*` and `1*`. */
export function countText(min: number, max: number | null): string | undefined {
  if (max === null) return min >= 2 ? `${min}*` : undefined;
  return min === max ? String(min) : `${min === 0 ? '' : min}*${max}`;
}

function measure(node: Node, ruler: Ruler): Sized {
  switch (node.k) {
    case 'terminal':
      return { node, w: tokenWidth(terminalLabel(node.text), true, ruler), up: TOKEN_H / 2, down: TOKEN_H / 2, kids: [] };
    case 'special':
      return { node, w: tokenWidth(node.text, true, ruler), up: TOKEN_H / 2, down: TOKEN_H / 2, kids: [] };
    case 'nonterminal':
      return { node, w: tokenWidth(node.name, false, ruler), up: TOKEN_H / 2, down: TOKEN_H / 2, kids: [] };
    case 'seq':
      return measureRow(node, node.items.map((n) => measure(n, ruler)));
    case 'predicate':
      return measureRow(node, [chipOf(node.op === 'not' ? '!' : '&', ruler), measure(node.item, ruler)]);
    case 'except':
      return measureRow(node, [measure(node.item, ruler), chipOf('-', ruler), measure(node.except, ruler)]);
    case 'choice': {
      const kids = node.items.map((n) => measure(n, ruler));
      const inner = Math.max(...kids.map((k) => k.w));
      const total = kids.reduce((sum, k) => sum + k.up + k.down, 0) + CHOICE_GAP * (kids.length - 1);
      const up = kids[0]?.up ?? 0;
      return { node, w: inner + 2 * BLOCK_PAD + (node.ordered === true ? ORDER_ROOM : 0), up, down: total - up, kids };
    }
    case 'optional': {
      const kid = measure(node.item, ruler);
      return { node, w: kid.w + 2 * BLOCK_PAD, up: kid.up + RAIL_CLEAR, down: kid.down, kids: [kid] };
    }
    case 'repeat': {
      const kid = measure(node.item, ruler);
      const text = countText(node.min, node.max);
      const chipW = text === undefined ? 0 : chipWidth(text, ruler);
      const skip = node.min === 0 ? RAIL_CLEAR : 0;
      const chipRoom = text === undefined ? 0 : CHIP_GAP + CHIP_H;
      return {
        node,
        w: Math.max(kid.w + 2 * (BLOCK_PAD + loopInset(node.min)), chipW + 4 * FORK_X),
        up: kid.up + skip,
        down: kid.down + RAIL_CLEAR + chipRoom,
        kids: [kid],
        ...(text === undefined ? {} : { chip: text, chipW }),
      };
    }
  }
}

function measureRow(node: Node, kids: Sized[]): Sized {
  return {
    node,
    w: kids.reduce((sum, k) => sum + k.w, 0) + SEQ_GAP * (kids.length - 1),
    up: Math.max(...kids.map((k) => k.up)),
    down: Math.max(...kids.map((k) => k.down)),
    kids,
  };
}

interface Out {
  lines: SceneItem[];
  marks: SceneItem[];
  bend: number;
  arrowLength: number;
}

function line(out: Out, points: Point[], arrow = false): void {
  out.lines.push({ kind: 'line', points, role: arrow ? ['edge', 'edge--arrow'] : ['edge'], radius: out.bend });
}

const pt = (x: number, y: number): Point => ({ x, y });

function token(out: Out, x: number, ay: number, w: number, text: string, kind: 'terminal' | 'nonterminal' | 'special'): void {
  const role = kind === 'terminal' ? ['token', 'token--terminal'] : kind === 'special' ? ['token', 'box--pending'] : ['token'];
  out.marks.push({ kind: 'box', style: 'box', x, y: ay - TOKEN_H / 2, w, h: TOKEN_H, role });
  out.marks.push({ kind: 'text', x: x + w / 2, y: ay, text, anchor: 'middle', role: [kind === 'nonterminal' ? 'body' : 'mono'] });
}

function chip(out: Out, x: number, cy: number, w: number, text: string): void {
  out.marks.push({ kind: 'box', style: 'label', x, y: cy - CHIP_H / 2, w, h: CHIP_H, radius: CHIP_H / 2, role: ['tag'] });
  out.marks.push({ kind: 'text', x: x + w / 2, y: cy, text, anchor: 'middle', role: ['tag-text'] });
}

/** Draws `s` with its left edge at `x` and its axis at height `ay`. */
function emit(out: Out, s: Sized, x: number, ay: number): void {
  const node = s.node;
  const right = x + s.w;
  switch (node.k) {
    case 'terminal':
      token(out, x, ay, s.w, terminalLabel(node.text), 'terminal');
      return;
    case 'special':
      if (s.chip !== undefined) chip(out, x, ay, s.w, s.chip);
      else token(out, x, ay, s.w, node.text, 'special');
      return;
    case 'nonterminal':
      token(out, x, ay, s.w, node.name, 'nonterminal');
      return;
    case 'seq':
    case 'predicate':
    case 'except': {
      let cx = x;
      s.kids.forEach((kid, i) => {
        if (i > 0) line(out, [pt(cx, ay), pt(cx + SEQ_GAP, ay)]);
        if (i > 0) cx += SEQ_GAP;
        emit(out, kid, cx, ay);
        cx += kid.w;
      });
      return;
    }
    case 'choice': {
      const room = node.ordered === true ? ORDER_ROOM : 0;
      const inner = s.w - 2 * BLOCK_PAD - room;
      const xl = x + FORK_X;
      const xr = right - FORK_X;
      let top = ay - s.up;
      s.kids.forEach((kid, i) => {
        const by = top + kid.up;
        const kx = x + BLOCK_PAD + room + floorTo((inner - kid.w) / 2, 4);
        if (room > 0) out.marks.push({ kind: 'text', x: x + BLOCK_PAD + room - ORDER_DX, y: by - ORDER_DY, text: String(i + 1), anchor: 'middle', role: ['tag-text'] });
        if (i === 0) {
          line(out, [pt(x, by), pt(kx, by)]);
          line(out, [pt(kx + kid.w, by), pt(right, by)]);
        } else {
          line(out, [pt(x, ay), pt(xl, ay), pt(xl, by), pt(kx, by)]);
          line(out, [pt(kx + kid.w, by), pt(xr, by), pt(xr, ay), pt(right, ay)]);
        }
        emit(out, kid, kx, by);
        top += kid.up + kid.down + CHOICE_GAP;
      });
      return;
    }
    case 'optional': {
      const kid = s.kids[0] as Sized;
      const kx = x + floorTo((s.w - kid.w) / 2, 4);
      const yb = ay - kid.up - RAIL_CLEAR;
      line(out, [pt(x, ay), pt(kx, ay)]);
      line(out, [pt(kx + kid.w, ay), pt(right, ay)]);
      line(out, [pt(x, ay), pt(x + FORK_X, ay), pt(x + FORK_X, yb), pt(right - FORK_X, yb), pt(right - FORK_X, ay), pt(right, ay)]);
      emit(out, kid, kx, ay);
      return;
    }
    case 'repeat': {
      const kid = s.kids[0] as Sized;
      const kx = x + floorTo((s.w - kid.w) / 2, 4);
      const inset = loopInset(node.min);
      const xl = x + FORK_X + inset;
      const xr = right - FORK_X - inset;
      const yl = ay + kid.down + RAIL_CLEAR;
      const mid = (x + right) / 2;
      const tip = roundTo(mid - out.arrowLength / 2, 2);
      line(out, [pt(x, ay), pt(kx, ay)]);
      line(out, [pt(kx + kid.w, ay), pt(right, ay)]);
      line(out, [pt(xr - FORK_X, ay), pt(xr, ay), pt(xr, yl), pt(tip, yl)], true);
      line(out, [pt(tip, yl), pt(xl, yl), pt(xl, ay), pt(xl + FORK_X, ay)]);
      if (node.min === 0) {
        const yb = ay - kid.up - RAIL_CLEAR;
        line(out, [pt(x, ay), pt(x + FORK_X, ay), pt(x + FORK_X, yb), pt(right - FORK_X, yb), pt(right - FORK_X, ay), pt(right, ay)]);
      }
      if (s.chip !== undefined) {
        const w = s.chipW ?? CHIP_H;
        chip(out, roundTo(mid - w / 2, 4), yl + CHIP_GAP + CHIP_H / 2, w, s.chip);
      }
      emit(out, kid, kx, ay);
      return;
    }
  }
}

/** Places every rule: its name at the left, then its rail from the start dot to the end dot; rules stand one under the other. */
export function layoutRailroad(model: Railroad, ruler: Ruler, theme: Theme = 'solid'): RailroadLayout {
  const spec = SCENE_THEME_SPECS[theme];
  const out: Out = { lines: [], marks: [], bend: spec.bend, arrowLength: spec.arrow.length };
  const sized = model.rules.map((r) => measure(r.body, ruler));
  const nameW = Math.max(...model.rules.map((r) => ruler.textWidth(r.name, 'title')));
  const railX = ceilTo(MARGIN + nameW + NAME_GAP, 4);
  const dots: SceneItem[] = [];
  const names: SceneItem[] = [];
  const axes: number[] = [];
  const titleW = model.title === undefined ? 0 : (ruler.textWidth(model.title, 'title') * 15) / 13;
  const items: SceneItem[] = [];
  let y = MARGIN;
  if (model.title !== undefined) {
    items.push({ kind: 'text', x: MARGIN, y: y + TITLE_LINE / 2, text: model.title, anchor: 'start', role: ['title'] });
    y = ceilTo(y + TITLE_LINE + TITLE_GAP, 4);
  }
  let right = MARGIN + titleW;
  sized.forEach((s, i) => {
    const rule = model.rules[i];
    if (rule === undefined) return;
    const ay = y + s.up;
    axes.push(ay);
    const bx = railX + END_STUB;
    names.push({ kind: 'text', x: MARGIN, y: ay, text: rule.name, anchor: 'start', role: ['zone-name'] });
    out.lines.push({ kind: 'line', points: [pt(railX, ay), pt(bx, ay)], role: ['edge'], radius: out.bend });
    out.lines.push({ kind: 'line', points: [pt(bx + s.w, ay), pt(bx + s.w + END_STUB, ay)], role: ['edge'], radius: out.bend });
    dots.push({ kind: 'circle', cx: railX, cy: ay, r: spec.dotRadius, role: ['dot'] });
    dots.push({ kind: 'circle', cx: bx + s.w + END_STUB, cy: ay, r: spec.dotRadius, role: ['dot'] });
    emit(out, s, bx, ay);
    right = Math.max(right, bx + s.w + END_STUB + spec.dotRadius);
    y += s.up + s.down + RULE_GAP;
  });
  const width = ceilTo(right + MARGIN, 4);
  const height = ceilTo(y - RULE_GAP + MARGIN, 4);
  const scene: Scene = {
    width,
    height,
    title: model.accTitle ?? model.title ?? 'railroad',
    theme,
    items: [...items, ...names, ...out.lines, ...dots, ...out.marks],
  };
  return { scene, axes };
}
