import { ceilTo } from '../chart/grid.ts';
import type { Ruler } from '../metrics.ts';
import { shrinkToFit } from '../text/fit.ts';
import type { Scene, SceneItem } from '../types.ts';
import { splitFields } from './model.ts';
import type { Packet } from './model.ts';

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
  const rows = Math.max(...cells.map((c) => c.row1)) + 1;
  const bits = packet.showBits;

  const firstTop = (packet.title === undefined ? MARGIN : 56) + (bits ? 28 : 0);
  const tops: number[] = [];
  for (let r = 0; r < rows; r++) tops.push(r === 0 ? firstTop : (tops[r - 1] ?? 0) + ROW_PITCH);

  const titleW = packet.title === undefined ? 0 : Math.ceil(ruler.textWidth(packet.title, 'title') * TITLE_SCALE);
  const width = ceilTo(Math.max(n * BIT_W + MARGIN * 2, titleW + MARGIN * 2));
  const bottom = Math.max(...cells.map((c) => (tops[c.row0] ?? 0) + (c.row1 - c.row0 + 1) * ROW_H));
  const tailNumber = bits && cells.some((c) => c.row1 > c.row0 && (tops[c.row0] ?? 0) + (c.row1 - c.row0 + 1) * ROW_H === bottom);
  const height = bottom + MARGIN + (tailNumber ? TALL_EXTRA : 0);

  const items: SceneItem[] = [];
  if (packet.title !== undefined) items.push({ kind: 'text', x: MARGIN, y: TITLE_Y, text: packet.title, role: ['title'] });
  const nameWidth = (s: string): number => ruler.textWidth(s, 'line') * NAME_SCALE;

  for (const c of cells) {
    const x = MARGIN + c.c0 * BIT_W + INSET;
    const w = (c.c1 - c.c0 + 1) * BIT_W - INSET * 2;
    const y = tops[c.row0] ?? 0;
    const h = (c.row1 - c.row0 + 1) * ROW_H;
    const range = c.left === c.right ? `${c.left}` : `${Math.min(c.left, c.right)}-${Math.max(c.left, c.right)}`;
    const data = { field: String(c.field), bits: range };
    items.push({ kind: 'box', style: 'box', x, y, w, h, role: ['box', 'tile'], data });
    if (bits) {
      if (c.left === c.right) {
        items.push({ kind: 'text', x: x + w / 2, y: y - NUMBER_RISE, text: String(c.left), anchor: 'middle', role: ['mono'], data });
      } else {
        items.push({ kind: 'text', x: x + INSET, y: y - NUMBER_RISE, text: String(c.left), anchor: 'start', role: ['mono'], data });
        const dropY = c.row1 > c.row0 ? y + h + TALL_NUMBER_DROP : y - NUMBER_RISE;
        items.push({ kind: 'text', x: x + w - INSET, y: dropY, text: String(c.right), anchor: 'end', role: ['mono'], data });
      }
    }
    items.push({ kind: 'text', x: x + w / 2, y: y + h / 2, text: shrinkToFit(c.label, w - 4, nameWidth) ?? '…', anchor: 'middle', role: ['name'], data });
  }

  const label = packet.title === undefined ? `packet — ${packet.fields.length} fields` : `packet — ${packet.title}`;
  return { scene: { width, height, title: label, items }, rowTops: tops };
}
