import { cellWidth } from '../metrics.ts';
import { shrinkToFit } from '../text/fit.ts';
import { spansOf, trimEndSpans } from '../text/terminal.ts';
import type { TextSpan } from '../types.ts';
import { splitFields } from './model.ts';
import type { Packet } from './model.ts';

const MAX_CELLS_PER_BIT = 4;

/** Cells a bit takes and bits a row holds: a row of 32 bits folds to 16, 8, ... until a bit gets two cells. */
function plan(bitsPerRow: number, maxWidth: number | undefined): { cells: number; bits: number } {
  if (maxWidth === undefined) return { cells: MAX_CELLS_PER_BIT, bits: bitsPerRow };
  let bits = bitsPerRow;
  for (;;) {
    const cells = Math.min(MAX_CELLS_PER_BIT, Math.floor((maxWidth - 1) / bits));
    if (cells >= 2 || bits === 1) return { cells: Math.max(1, cells), bits };
    bits = Math.ceil(bits / 2);
  }
}

function put(row: string[], at: number, text: string): void {
  [...text].forEach((ch, i) => {
    if (at + i < row.length) row[at + i] = ch;
  });
}

/** A row of cells as spans of one tone, without trailing blanks. */
const rowOf = (cells: readonly string[], tone: TextSpan['tone']): TextSpan[] => trimEndSpans(spansOf([cells.join(''), tone]));

/**
 * Draws the packet with box characters: the left bit number above each box, the name inside. The title and the field
 * names are bold, the bit numbers dim.
 */
export function layoutPacketText(packet: Packet, maxWidth: number | undefined): TextSpan[][] {
  const { cells: k, bits } = plan(packet.bitsPerRow, maxWidth);
  const pieces = splitFields({ ...packet, bitsPerRow: bits });
  const rows = Math.max(...pieces.map((p) => p.row)) + 1;
  const total = bits * k + 1;
  const out: TextSpan[][] = [];
  if (packet.title !== undefined) out.push(spansOf([packet.title, 'bold']), []);

  for (let r = 0; r < rows; r++) {
    const mine = pieces.filter((p) => p.row === r).sort((a, b) => a.c0 - b.c0);
    const numbers = new Array<string>(total).fill(' ');
    const top = new Array<string>(total).fill(' ');
    const mid = new Array<string>(total).fill(' ');
    const named = new Array<boolean>(total).fill(false);
    const bottom = new Array<string>(total).fill(' ');
    mine.forEach((p, i) => {
      const x0 = p.c0 * k;
      const x1 = (p.c1 + 1) * k;
      for (let x = x0 + 1; x < x1; x++) {
        top[x] = '─';
        bottom[x] = '─';
      }
      const joined = mine[i - 1] !== undefined && (mine[i - 1]?.c1 ?? -2) + 1 === p.c0;
      top[x0] = joined ? '┬' : '┌';
      bottom[x0] = joined ? '┴' : '└';
      mid[x0] = '│';
      const nextJoined = mine[i + 1] !== undefined && (mine[i + 1]?.c0 ?? -2) === p.c1 + 1;
      top[x1] = nextJoined ? '┬' : '┐';
      bottom[x1] = nextJoined ? '┴' : '┘';
      mid[x1] = '│';
      const room = x1 - x0 - 1;
      const name = shrinkToFit(p.label, room, cellWidth) ?? '…';
      const at = x0 + 1 + Math.floor((room - cellWidth(name)) / 2);
      put(mid, at, name);
      [...name].forEach((_, j) => {
        if (at + j < total) named[at + j] = true;
      });
      const num = String(p.left);
      const nextAt = mine[i + 1] === undefined ? total : (mine[i + 1]?.c0 ?? 0) * k;
      if (x0 + num.length < nextAt) put(numbers, x0, num);
    });
    if (packet.showBits) out.push(rowOf(numbers, 'dim'));
    const middle = spansOf(...mid.map((ch, x) => [ch, named[x] === true ? 'bold' : 'normal'] as const));
    out.push(rowOf(top, 'normal'), trimEndSpans(middle), rowOf(bottom, 'normal'));
  }
  return out;
}
