import type { FrontValue } from '../front-matter.ts';
import { configSection } from '../front/options.ts';
import { UrsulaError } from '../types.ts';
import type { BitOrder, Packet, PacketField } from './model.ts';

const MAX_ROWS = 2000;
const FIELD = /^(\+\s*\d+|\d+(?:\s*-\s*\d+)?)\s*:\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)')\s*;?$/u;

function fail(message: string, line: number): never {
  throw new UrsulaError(message, 'syntax', line);
}

function unquote(value: string): string {
  const v = value.trim();
  const q = v[0];
  return v.length >= 2 && (q === '"' || q === "'") && v.endsWith(q) ? v.slice(1, -1) : v;
}

/** Removes a `%%` comment that stands outside quotes. */
function stripComment(line: string): string {
  let quote = '';
  for (let i = 0; i < line.length; i++) {
    const ch = line[i] ?? '';
    if (quote !== '') {
      if (ch === '\\') i++;
      else if (ch === quote) quote = '';
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '%' && line[i + 1] === '%') return line.slice(0, i);
  }
  return line;
}

/** The drawing options a front matter or an init directive gives. */
export interface PacketOptions {
  /** Title from the front matter; a `title` line of the diagram wins. */
  heading?: string;
  config?: Record<string, FrontValue>;
}

interface Settings {
  bitsPerRow?: number;
  showBits?: boolean;
  bitOrder?: BitOrder;
}

/** Reads the packet keys of a config map; values of another type are ignored. */
function readSettings(config: unknown): Settings {
  const c = configSection(config, 'packet');
  if (c === undefined) return {};
  const out: Settings = {};
  if (typeof c['showBits'] === 'boolean') out.showBits = c['showBits'];
  if (c['bitOrder'] === 'ascending' || c['bitOrder'] === 'descending') out.bitOrder = c['bitOrder'];
  const n = c['bitsPerRow'];
  if (typeof n === 'number' && Number.isInteger(n) && n >= 1) out.bitsPerRow = n;
  return out;
}

/** The `config` of a `%%{init: {...}}%%` directive in the source, which wins over the front matter. */
function readInit(src: string): Settings {
  let found: Settings = {};
  for (const m of src.matchAll(/%%\{\s*(?:init|initialize)\s*:(.*?)\}%%/gsu)) {
    try {
      const json = JSON.parse(`{${(m[1] ?? '').trim().replace(/^\{/u, '').replace(/'/gu, '"')}`) as unknown;
      found = { ...found, ...readSettings(json) };
    } catch {
      // A directive that is not readable is ignored like any other setting.
    }
  }
  return found;
}

/** Parses the Mermaid packet diagram: `start: "name"`, `start-end: "name"` and `+count: "name"`. */
export function parsePacket(src: string, opts: PacketOptions = {}): Packet {
  const rows = src.split(/\r?\n/);
  const settings: Settings = { ...readSettings(opts.config), ...readInit(src) };
  const fields: PacketField[] = [];
  let title: string | undefined;
  let seenHeader = false;
  let lastBit = -1;
  let inDescription = false;

  for (let n = 0; n < rows.length; n++) {
    const line = n + 1;
    const s = stripComment(rows[n] ?? '').trim();
    if (s === '') continue;
    if (inDescription) {
      if (s.includes('}')) inDescription = false;
      continue;
    }
    if (!seenHeader) {
      if (s !== 'packet' && s !== 'packet-beta') fail("expected a 'packet' header", line);
      seenHeader = true;
      continue;
    }
    const word = /^[A-Za-z]+/u.exec(s)?.[0] ?? '';
    if (word === 'title') {
      title = unquote(s.slice(5).replace(/^\s*:?\s*/u, ''));
      continue;
    }
    if (word === 'accTitle') continue;
    if (word === 'accDescr') {
      if (/^accDescr\s*\{/u.test(s) && !s.includes('}')) inDescription = true;
      continue;
    }
    const m = FIELD.exec(s);
    if (!m) fail(`cannot read '${s}'; a field is written 0-15: "Name", 7: "Name" or +8: "Name"`, line);
    const spec = (m[1] ?? '').replace(/\s+/gu, '');
    const label = m[2] ?? m[3] ?? '';
    let start: number;
    let end: number;
    if (spec.startsWith('+')) {
      const count = Number(spec.slice(1));
      if (count === 0) fail('a field cannot have 0 bits', line);
      start = lastBit + 1;
      end = start + count - 1;
    } else if (spec.includes('-')) {
      const [a, b] = spec.split('-');
      start = Number(a);
      end = Number(b);
      if (end < start) fail(`bits ${start}-${end}: the end must not be smaller than the start`, line);
    } else {
      start = Number(spec);
      end = start;
    }
    if (start !== lastBit + 1) fail(`bits ${start}-${end} are not contiguous; the next field must start at bit ${lastBit + 1}`, line);
    lastBit = end;
    fields.push({ start, end, label, line });
  }
  if (!seenHeader) fail("expected a 'packet' header", rows.length === 0 ? 1 : rows.length);
  if (fields.length === 0) fail('the packet has no fields', rows.length);
  const bitsPerRow = settings.bitsPerRow ?? 32;
  title ??= opts.heading;
  if (Math.ceil((lastBit + 1) / bitsPerRow) > MAX_ROWS) fail(`the packet needs more than ${MAX_ROWS} rows`, fields[fields.length - 1]?.line ?? 1);
  return {
    ...(title === undefined || title === '' ? {} : { title }),
    fields,
    bitsPerRow,
    showBits: settings.showBits ?? true,
    bitOrder: settings.bitOrder ?? 'ascending',
  };
}
