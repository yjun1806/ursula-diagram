// Node only. Reads the little a PNG needs from a font file without loading it: the family names of each face, from
// the name table, and which characters the first face has, from the cmap table. Both read a few kilobytes at most,
// however large the file.
import { closeSync, openSync, readSync } from 'node:fs';

/** Reads `length` bytes at `offset`; fewer at the end of the file. */
function bytesAt(fd: number, offset: number, length: number): Buffer {
  const buf = Buffer.alloc(Math.max(0, length));
  const got = length > 0 ? readSync(fd, buf, 0, length, offset) : 0;
  return buf.subarray(0, got);
}

/** Opens `path`, runs `read` and closes it; undefined when the file cannot be read or is not a font. */
function withFile<T>(path: string, read: (fd: number) => T | undefined): T | undefined {
  let fd: number;
  try {
    fd = openSync(path, 'r');
  } catch {
    return undefined;
  }
  try {
    return read(fd);
  } catch {
    return undefined;
  } finally {
    closeSync(fd);
  }
}

/** Where the table directory of each face starts: one face, or each face of a collection (ttc, otc). */
function faceOffsets(fd: number): number[] {
  const head = bytesAt(fd, 0, 12);
  if (head.length < 12) return [];
  if (head.toString('latin1', 0, 4) !== 'ttcf') return [0];
  const faces = Math.min(head.readUInt32BE(8), 256);
  const offsets = bytesAt(fd, 12, faces * 4);
  const out: number[] = [];
  for (let i = 0; i + 4 <= offsets.length; i += 4) out.push(offsets.readUInt32BE(i));
  return out;
}

/** The offset and length of the table `tag` of the face at `at`. */
function tableOf(fd: number, at: number, tag: string): { offset: number; length: number } | undefined {
  const head = bytesAt(fd, at, 12);
  if (head.length < 12) return undefined;
  const dir = bytesAt(fd, at + 12, head.readUInt16BE(4) * 16);
  for (let i = 0; i + 16 <= dir.length; i += 16)
    if (dir.toString('latin1', i, i + 4) === tag) return { offset: dir.readUInt32BE(i + 8), length: dir.readUInt32BE(i + 12) };
  return undefined;
}

const TYPOGRAPHIC_FAMILY = 16;
const FAMILY = 1;

/** A name record as text: UTF-16 for the Unicode and Windows platforms, Latin-1 for the old Mac one. */
function nameText(platform: number, raw: Buffer): string | undefined {
  if (platform === 0 || platform === 3) {
    const swapped = Buffer.from(raw);
    swapped.swap16();
    return swapped.toString('utf16le');
  }
  return platform === 1 ? raw.toString('latin1') : undefined;
}

/**
 * The family names of a face, as the renderer's font list reads them: the typographic family (name 16) when the
 * face has one, else the family (name 1).
 */
function faceFamilies(fd: number, at: number): string[] {
  const table = tableOf(fd, at, 'name');
  if (table === undefined) return [];
  const name = bytesAt(fd, table.offset, Math.min(table.length, 1 << 18));
  if (name.length < 6) return [];
  const count = name.readUInt16BE(2);
  const strings = name.readUInt16BE(4);
  // English (United States) names on the Windows platform first: the renderer takes the first name as the face's own.
  const records: Array<{ id: number; english: boolean; text: string }> = [];
  for (let r = 0; r < count && 6 + r * 12 + 12 <= name.length; r++) {
    const rec = 6 + r * 12;
    const id = name.readUInt16BE(rec + 6);
    if (id !== FAMILY && id !== TYPOGRAPHIC_FAMILY) continue;
    const len = name.readUInt16BE(rec + 8);
    const off = strings + name.readUInt16BE(rec + 10);
    if (len === 0 || off + len > name.length) continue;
    const platform = name.readUInt16BE(rec);
    const text = nameText(platform, name.subarray(off, off + len))?.trim();
    if (text === undefined || text === '') continue;
    records.push({ id, english: platform === 3 && name.readUInt16BE(rec + 4) === 0x409, text });
  }
  const typographic = records.some((r) => r.id === TYPOGRAPHIC_FAMILY);
  const chosen = records.filter((r) => r.id === (typographic ? TYPOGRAPHIC_FAMILY : FAMILY));
  return [...new Set([...chosen.filter((r) => r.english), ...chosen.filter((r) => !r.english)].map((r) => r.text))];
}

/**
 * The family names of every face of a font file, the first face's own name first; empty when it is not a font this
 * reader knows.
 */
export function fontFamilies(path: string): string[] {
  return (
    withFile(path, (fd) => {
      const names = new Set<string>();
      for (const at of faceOffsets(fd)) for (const n of faceFamilies(fd, at)) names.add(n);
      return [...names];
    }) ?? []
  );
}

/** Whether a character has a glyph. */
export type Coverage = (codePoint: number) => boolean;

const NOTHING: Coverage = () => false;

/** Format 4: segments of 16-bit codes, with a delta or an offset into the glyph array. */
function format4(t: Buffer): Coverage {
  const segs = t.readUInt16BE(6) / 2;
  const ends = 14;
  const starts = ends + segs * 2 + 2;
  const deltas = starts + segs * 2;
  const ranges = deltas + segs * 2;
  return (cp) => {
    if (cp > 0xffff) return false;
    for (let s = 0; s < segs; s++) {
      if (cp > t.readUInt16BE(ends + s * 2)) continue;
      const start = t.readUInt16BE(starts + s * 2);
      if (cp < start) return false;
      const delta = t.readUInt16BE(deltas + s * 2);
      const rangeOffset = t.readUInt16BE(ranges + s * 2);
      if (rangeOffset === 0) return ((cp + delta) & 0xffff) !== 0;
      const at = ranges + s * 2 + rangeOffset + (cp - start) * 2;
      if (at + 2 > t.length) return false;
      const glyph = t.readUInt16BE(at);
      return glyph !== 0 && ((glyph + delta) & 0xffff) !== 0;
    }
    return false;
  };
}

/** Format 12: groups of 32-bit codes mapped to consecutive glyphs; format 13 (`same`): each group to one glyph. */
function format12(t: Buffer, same = false): Coverage {
  const groups = t.readUInt32BE(12);
  return (cp) => {
    let lo = 0;
    let hi = groups - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const at = 16 + mid * 12;
      if (at + 12 > t.length) return false;
      if (cp < t.readUInt32BE(at)) hi = mid - 1;
      else if (cp > t.readUInt32BE(at + 4)) lo = mid + 1;
      else return t.readUInt32BE(at + 8) + (same ? 0 : cp - t.readUInt32BE(at)) !== 0;
    }
    return false;
  };
}

/** The Unicode subtables a font may carry, best first: full Unicode before the 16-bit ones. */
const PREFERRED: ReadonlyArray<readonly [number, number]> = [
  [3, 10],
  [0, 6],
  [0, 4],
  [3, 1],
  [0, 3],
  [0, 2],
  [0, 1],
  [0, 0],
];

/** The characters the first face of a font file has glyphs for; none when the file has no Unicode cmap. */
export function fontCoverage(path: string): Coverage {
  return (
    withFile(path, (fd) => {
      const at = faceOffsets(fd)[0];
      if (at === undefined) return undefined;
      const table = tableOf(fd, at, 'cmap');
      if (table === undefined) return undefined;
      const head = bytesAt(fd, table.offset, 4);
      if (head.length < 4) return undefined;
      const records = bytesAt(fd, table.offset + 4, head.readUInt16BE(2) * 8);
      const subtables: Array<{ platform: number; encoding: number; offset: number }> = [];
      for (let i = 0; i + 8 <= records.length; i += 8) subtables.push({ platform: records.readUInt16BE(i), encoding: records.readUInt16BE(i + 2), offset: records.readUInt32BE(i + 4) });
      for (const [platform, encoding] of PREFERRED) {
        const sub = subtables.find((s) => s.platform === platform && s.encoding === encoding);
        if (sub === undefined) continue;
        const start = table.offset + sub.offset;
        const kind = bytesAt(fd, start, 8);
        const format = kind.length < 8 ? 0 : kind.readUInt16BE(0);
        // 4: 16-bit segments; 12: full Unicode; 13: whole ranges to one glyph, as a last-resort font has.
        if (format !== 4 && format !== 12 && format !== 13) continue;
        // A large format 4 subtable outgrows its 16-bit length field; read to the end of the table instead.
        const length = format === 4 ? Math.min(table.length - sub.offset, 1 << 20) : kind.readUInt32BE(4);
        const body = bytesAt(fd, start, length);
        return format === 4 ? format4(body) : format12(body, format === 13);
      }
      return undefined;
    }) ?? NOTHING
  );
}
