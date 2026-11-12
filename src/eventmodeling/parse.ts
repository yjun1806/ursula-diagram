import { createAccessibilityReader } from '../front/accessibility.ts';
import { UrsulaError } from '../types.ts';
import type { EventModel, Frame, FrameKind, Relation } from './model.ts';

function fail(message: string, line: number, code = 'syntax'): never {
  throw new UrsulaError(message, `eventmodeling-${code}`, line);
}

const KINDS: Record<string, FrameKind> = {
  ui: 'ui',
  pcr: 'pcr',
  processor: 'pcr',
  cmd: 'cmd',
  command: 'cmd',
  rmo: 'rmo',
  readmodel: 'rmo',
  evt: 'evt',
  event: 'evt',
};

/** Which kind may open an inferred relation into a kind. */
const INFERS_INTO: Record<FrameKind, FrameKind[]> = {
  ui: ['rmo'],
  pcr: ['evt', 'rmo'],
  cmd: ['ui', 'pcr'],
  rmo: ['evt'],
  evt: ['cmd'],
};

const FRAME = /^(tf|timeframe|rf|resetframe)\s+(\d+)\s+([A-Za-z]+)\s+(\S+)\s*(.*)$/u;
const DATA_HEAD = /^data\s+([^\s{`]+)\s*(.*)$/u;

/** Source rows with a cursor, so a brace body can run over several rows. */
interface Cursor {
  rows: string[];
  row: number;
}

/**
 * Reads a `{ ... }` body that starts at `rest` (which begins with `{`) on the row the cursor is on.
 * The body may close on a later row; the cursor then moves to that row. Returns the text between the braces
 * and what follows the closing brace on its row.
 */
function readBraces(cursor: Cursor, rest: string): { body: string; after: string } {
  const startRow = cursor.row;
  let depth = 0;
  let quote = '';
  let body = '';
  let text = rest;
  for (;;) {
    for (let i = 0; i < text.length; i++) {
      const ch = text[i] ?? '';
      if (quote !== '') {
        if (ch === quote) quote = '';
      } else if (ch === '"' || ch === "'") quote = ch;
      else if (ch === '{') {
        depth += 1;
        if (depth === 1) continue;
      } else if (ch === '}') {
        depth -= 1;
        if (depth === 0) return { body, after: text.slice(i + 1).trim() };
      }
      body += ch;
    }
    cursor.row += 1;
    if (cursor.row >= cursor.rows.length) fail('Data opened with "{" is not closed with "}".', startRow + 1, 'data');
    body += '\n';
    text = cursor.rows[cursor.row] ?? '';
    quote = '';
  }
}

/** Splits `a: 1, b: 'x, y'` at the commas outside quotes and brackets. */
function splitTop(body: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote = '';
  let current = '';
  for (const ch of body) {
    if (quote !== '') {
      if (ch === quote) quote = '';
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '{' || ch === '[') depth += 1;
    else if (ch === '}' || ch === ']') depth -= 1;
    else if (ch === ',' && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  parts.push(current);
  return parts.map((p) => p.trim()).filter((p) => p !== '');
}

/** The rows of a data body: one per line when the body spans lines, else one per top-level comma. */
function dataRows(body: string): string[] {
  const lines = body.includes('\n')
    ? body
        .split('\n')
        .map((l) => l.trim().replace(/,$/u, ''))
        .filter((l) => l !== '')
    : splitTop(body);
  return lines;
}

interface Pending {
  frame: Omit<Frame, 'data'>;
  inline: string[];
  refs: string[];
  links: Array<{ to: number; line: number }>;
}

/** Reads an `eventmodeling` source into frames in text order and the relations between them. */
export function parseEventModeling(src: string, heading?: string): EventModel {
  const cursor: Cursor = { rows: src.split(/\r?\n/), row: 0 };
  const acc = createAccessibilityReader();
  let headerSeen = false;
  let directive = false;
  const pending: Pending[] = [];
  const blocks = new Map<string, { rows: string[]; type?: string }>();

  for (; cursor.row < cursor.rows.length; cursor.row++) {
    const line = cursor.row + 1;
    const s = (cursor.rows[cursor.row] ?? '').trim();
    if (acc.insideBlock(s)) continue;
    if (directive) {
      if (s.includes('}%%')) directive = false;
      continue;
    }
    if (s.startsWith('%%{') && !s.includes('}%%')) {
      directive = true;
      continue;
    }
    if (s === '' || s.startsWith('%%')) continue;
    if (!headerSeen) {
      if (s !== 'eventmodeling') fail(`Expected "eventmodeling" before "${s}".`, line, 'header');
      headerSeen = true;
      continue;
    }
    if (acc.read(s)) continue;

    const head = DATA_HEAD.exec(s);
    if (head !== null && !FRAME.test(s)) {
      const id = head[1] ?? '';
      let rest = (head[2] ?? '').trim();
      let type: string | undefined;
      const typed = /^`([^`]*)`\s*(.*)$/u.exec(rest);
      if (typed !== null) {
        type = typed[1] ?? '';
        rest = typed[2] ?? '';
      }
      if (!rest.startsWith('{')) fail(`Data "${id}" needs a "{ ... }" body.`, line, 'data');
      if (blocks.has(id)) fail(`Data "${id}" is defined twice.`, line, 'data');
      const { body, after } = readBraces(cursor, rest);
      if (after !== '') fail(`Unexpected text "${after}" after the data body.`, line, 'data');
      blocks.set(id, { rows: dataRows(body), ...(type === undefined ? {} : { type }) });
      continue;
    }

    const m = FRAME.exec(s);
    if (m === null) fail(`Cannot read "${s}"; expected a frame such as "tf 01 ui CartUI".`, line);
    const kind = KINDS[(m[3] ?? '').toLowerCase()];
    if (kind === undefined) fail(`Unknown element type "${m[3] ?? ''}"; use ui, pcr, cmd, rmo or evt.`, line, 'kind');
    const label = m[2] ?? '';
    const identifier = m[4] ?? '';
    const dot = identifier.lastIndexOf('.');
    const namespace = dot > 0 ? identifier.slice(0, dot) : undefined;
    const name = dot > 0 ? identifier.slice(dot + 1) : identifier;
    if (name === '') fail(`The identifier "${identifier}" has no name after the dot.`, line, 'name');

    const entry: Pending = {
      frame: {
        number: Number(label),
        label,
        kind,
        name,
        ...(namespace === undefined ? {} : { namespace }),
        reset: (m[1] ?? '').startsWith('r'),
        line,
      },
      inline: [],
      refs: [],
      links: [],
    };
    let rest = (m[5] ?? '').trim();
    while (rest !== '') {
      let t: RegExpExecArray | null;
      if ((t = /^->>\s*(.*)$/u.exec(rest)) !== null) {
        const num = /^(\d+)\s*(.*)$/u.exec(t[1] ?? '');
        if (num === null) fail('"->>" needs a frame number after it.', line, 'relation');
        entry.links.push({ to: Number(num[1]), line });
        rest = (num[2] ?? '').trim();
      } else if ((t = /^\[\[([^\]]+)\]\]\s*(.*)$/u.exec(rest)) !== null) {
        entry.refs.push((t[1] ?? '').trim());
        rest = (t[2] ?? '').trim();
      } else if ((t = /^`([^`]*)`\s*(.*)$/u.exec(rest)) !== null) {
        entry.frame.dataType = t[1] ?? '';
        rest = (t[2] ?? '').trim();
      } else if (rest.startsWith('{')) {
        const { body, after } = readBraces(cursor, rest);
        entry.inline.push(...dataRows(body));
        rest = after;
      } else fail(`Unexpected text "${rest}" after the frame.`, line);
    }
    pending.push(entry);
  }

  if (!headerSeen) fail('Expected "eventmodeling" as the first line.', 1, 'header');

  const seen = new Map<number, number>();
  for (const p of pending) {
    const first = seen.get(p.frame.number);
    if (first !== undefined) fail(`Frame number ${p.frame.label} is already used on line ${first}.`, p.frame.line, 'duplicate');
    seen.set(p.frame.number, p.frame.line);
  }

  const frames: Frame[] = pending.map((p) => {
    const referenced = p.refs.flatMap((id) => {
      const block = blocks.get(id);
      if (block === undefined) fail(`Data "${id}" is not defined.`, p.frame.line, 'data');
      if (block.type !== undefined && p.frame.dataType === undefined) p.frame.dataType = block.type;
      return block.rows;
    });
    return { ...p.frame, data: [...referenced, ...p.inline] };
  });

  const relations: Relation[] = [];
  const add = (from: number, to: number, inferred: boolean, line: number): void => {
    if (from === to) fail(`Frame ${String(to).padStart(2, '0')} cannot relate to itself.`, line, 'relation');
    if (!relations.some((r) => r.from === from && r.to === to)) relations.push({ from, to, inferred });
  };
  pending.forEach((p, i) => {
    const previous = frames[i - 1];
    if (!p.frame.reset && previous !== undefined && INFERS_INTO[p.frame.kind].includes(previous.kind)) add(previous.number, p.frame.number, true, p.frame.line);
    for (const link of p.links) {
      if (!seen.has(link.to)) fail(`Frame ${link.to} is not defined.`, link.line, 'relation');
      add(link.to, p.frame.number, false, link.line);
    }
  });

  const title = heading === undefined || heading.trim() === '' ? undefined : heading.trim();
  return { frames, relations, ...(title === undefined ? {} : { title }), ...(acc.title === undefined || acc.title === '' ? {} : { accTitle: acc.title }) };
}
