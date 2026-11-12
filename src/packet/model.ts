/** One field of a packet: the bits `start` to `end` (both included) and its name. */
export interface PacketField {
  start: number;
  end: number;
  label: string;
  /** 1-based source line. */
  line: number;
}

export type BitOrder = 'ascending' | 'descending';

export interface Packet {
  title?: string;
  fields: PacketField[];
  bitsPerRow: number;
  showBits: boolean;
  bitOrder: BitOrder;
}

/** The part of one field that lies in one row, in drawing columns (0 is the left edge of the row). */
export interface Piece {
  field: number;
  row: number;
  c0: number;
  c1: number;
  /** Bit number at the left and at the right edge of the piece as drawn. */
  left: number;
  right: number;
  label: string;
}

/** Cuts every field at the row boundaries and places the parts by column, mirroring each row when the order is descending. */
export function splitFields(packet: Packet): Piece[] {
  const n = packet.bitsPerRow;
  const out: Piece[] = [];
  packet.fields.forEach((f, field) => {
    for (let row = Math.floor(f.start / n); row <= Math.floor(f.end / n); row++) {
      const a = Math.max(f.start, row * n);
      const b = Math.min(f.end, row * n + n - 1);
      const ia = a - row * n;
      const ib = b - row * n;
      const asc = packet.bitOrder === 'ascending';
      out.push({
        field,
        row,
        c0: asc ? ia : n - 1 - ib,
        c1: asc ? ib : n - 1 - ia,
        left: asc ? a : b,
        right: asc ? b : a,
        label: f.label,
      });
    }
  });
  return out;
}
