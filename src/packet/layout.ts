import { ceilTo } from '../chart/grid.ts';
import type { Ruler } from '../metrics.ts';
import type { Scene, SceneItem } from '../types.ts';
import { splitFields } from './model.ts';
import type { Packet } from './model.ts';

/** Width of one bit when every name fits; a name that fits in no two lines widens every bit alike. */
export const BIT_W = 36;
export const ROW_H = 48;
export const ROW_PITCH = 72;
const MARGIN = 24;
const INSET = 2;
const NUMBER_RISE = 8;
const TALL_NUMBER_DROP = 18;
const TALL_EXTRA = 20;
const TITLE_Y = 40;
const NAME_SCALE = 13 / 12;
const TITLE_SCALE = 15 / 13;
/** Room left on each side of a name inside its box, and the distance between two lines of a name. */
const NAME_PAD = 2;
const NAME_LINE = 16;

/** The ways to set a name: whole on one line, or broken at one space into two lines. */
function settings(label: string): string[][] {
  const words = label.split(' ');
  const out: string[][] = [[label]];
  for (let k = 1; k < words.length; k++) out.push([words.slice(0, k).join(' '), words.slice(k).join(' ')]);
  return out;
}

/** The narrowest width a name needs, over its settings. */
function nameNeed(label: string, width: (s: string) => number): number {
  return Math.min(...settings(label).map((lines) => Math.max(...lines.map(width))));
}

/** One line when the name fits `room`, else the two-line setting with the narrowest longer line. */
function nameLines(label: string, room: number, width: (s: string) => number): string[] {
  if (width(label) <= room) return [label];
  const two = settings(label).slice(1);
  if (two.length === 0) return [label];
  return two.reduce((best, s) => (Math.max(...s.map(width)) < Math.max(...best.map(width)) ? s : best));
}

interface Cell {
  field: number;
  row0: number;
  row1: number;
  c0: number;
  c1: number;
  left: number;
  right: number;
  label: string;
}

/** Fields that fill whole rows become one tall cell; every other piece is a cell of one row. */
function cellsOf(packet: Packet): Cell[] {
  const n = packet.bitsPerRow;
  const pieces = splitFields(packet);
  const cells: Cell[] = [];
  for (let i = 0; i < pieces.length; ) {
    const first = pieces[i];
    if (first === undefined) break;
    const group = pieces.filter((p) => p.field === first.field);
    const full = group.length >= 2 && group.every((p) => p.c0 === 0 && p.c1 === n - 1);
    if (full) {
      const last = group[group.length - 1] ?? first;
      cells.push({ field: first.field, row0: first.row, row1: last.row, c0: 0, c1: n - 1, left: first.left, right: last.right, label: first.label });
      i += group.length;
    } else {
      cells.push({ field: first.field, row0: first.row, row1: first.row, c0: first.c0, c1: first.c1, left: first.left, right: first.right, label: first.label });
      i += 1;
    }
  }
  return cells;
}

export interface PacketLayout {
  scene: Scene;
  /** Left edge of each row's boxes, for checks. */
  rowTops: number[];
}

export function layoutPacket(packet: Packet, ruler: Ruler): PacketLayout {
  const n = packet.bitsPerRow;
  const cells = cellsOf(packet);
  const nameWidth = (s: string): number => ruler.textWidth(s, 'line') * NAME_SCALE;
  // Every bit takes one width, so field widths stay proportional to their bits.
  const bitW = Math.max(BIT_W, ...cells.map((c) => ceilTo((nameNeed(c.label, nameWidth) + 2 * NAME_PAD + 2 * INSET) / (c.c1 - c.c0 + 1))));
  const rows = Math.max(...cells.map((c) => c.row1)) + 1;
  const bits = packet.showBits;

  const firstTop = (packet.title === undefined ? MARGIN : 56) + (bits ? 28 : 0);
  const tops: number[] = [];
  for (let r = 0; r < rows; r++) tops.push(r === 0 ? firstTop : (tops[r - 1] ?? 0) + ROW_PITCH);

  const titleW = packet.title === undefined ? 0 : Math.ceil(ruler.textWidth(packet.title, 'title') * TITLE_SCALE);
  const width = ceilTo(Math.max(n * bitW + MARGIN * 2, titleW + MARGIN * 2));
  const bottom = Math.max(...cells.map((c) => (tops[c.row0] ?? 0) + (c.row1 - c.row0 + 1) * ROW_H));
  const tailNumber = bits && cells.some((c) => c.row1 > c.row0 && (tops[c.row0] ?? 0) + (c.row1 - c.row0 + 1) * ROW_H === bottom);
  const height = bottom + MARGIN + (tailNumber ? TALL_EXTRA : 0);

  const items: SceneItem[] = [];
  if (packet.title !== undefined) items.push({ kind: 'text', x: MARGIN, y: TITLE_Y, text: packet.title, role: ['title'], baseline: 'alphabetic' });

  for (const c of cells) {
    const x = MARGIN + c.c0 * bitW + INSET;
    const w = (c.c1 - c.c0 + 1) * bitW - INSET * 2;
    const y = tops[c.row0] ?? 0;
    const h = (c.row1 - c.row0 + 1) * ROW_H;
    const range = c.left === c.right ? `${c.left}` : `${Math.min(c.left, c.right)}-${Math.max(c.left, c.right)}`;
    const data = { field: String(c.field), bits: range };
    items.push({ kind: 'box', style: 'box', x, y, w, h, role: ['box', 'tile'], data });
    if (bits) {
      if (c.left === c.right) {
        items.push({ kind: 'text', x: x + w / 2, y: y - NUMBER_RISE, text: String(c.left), anchor: 'middle', role: ['mono'], data, baseline: 'alphabetic' });
      } else {
        items.push({ kind: 'text', x: x + INSET, y: y - NUMBER_RISE, text: String(c.left), anchor: 'start', role: ['mono'], data, baseline: 'alphabetic' });
        const dropY = c.row1 > c.row0 ? y + h + TALL_NUMBER_DROP : y - NUMBER_RISE;
        items.push({ kind: 'text', x: x + w - INSET, y: dropY, text: String(c.right), anchor: 'end', role: ['mono'], data, baseline: 'alphabetic' });
      }
    }
    const lines = nameLines(c.label, w - 2 * NAME_PAD, nameWidth);
    lines.forEach((text, i) =>
      items.push({ kind: 'text', x: x + w / 2, y: y + h / 2 + NAME_LINE * (i - (lines.length - 1) / 2), text, anchor: 'middle', role: ['name'], data }),
    );
  }

  const label = packet.title === undefined ? `packet — ${packet.fields.length} fields` : `packet — ${packet.title}`;
  return { scene: { width, height, title: label, items }, rowTops: tops };
}
