import { UrsulaError } from '../types.ts';
import type { ArrowHead, BlockKind, MessageStmt, Participant, Sequence, Statement } from './model.ts';

const BREAK = /<br\s*\/?>/gi;
const OPERATORS: ReadonlyArray<readonly [string, boolean, ArrowHead]> = [
  ['-->>', true, 'filled'],
  ['->>', false, 'filled'],
  ['--x', true, 'cross'],
  ['-x', false, 'cross'],
  ['--)', true, 'open'],
  ['-)', false, 'open'],
  ['-->', true, 'none'],
  ['->', false, 'none'],
];
const MESSAGE = /^(.+?)\s*(-->>|->>|--x|-x|--\)|-\)|-->|->)\s*([+-]?)\s*(.+)$/u;
const BLOCKS: ReadonlySet<string> = new Set(['loop', 'opt', 'alt', 'par']);

type Open = { kind: BlockKind; line: number } | { kind: 'ignored'; line: number };

function textLines(text: string): string[] {
  return text
    .trim()
    .split(BREAK)
    .map((l) => l.trim());
}

function fail(message: string, line: number, code = 'syntax'): never {
  throw new UrsulaError(message, code, line);
}

/** Removes a `%%` comment. */
function stripComment(line: string): string {
  const at = line.indexOf('%%');
  return at < 0 ? line : line.slice(0, at);
}

/** Parses the supported Mermaid sequence diagram subset. */
export function parseSequence(src: string): Sequence {
  const participants = new Map<string, Participant>();
  const declared = new Set<string>();
  const statements: Statement[] = [];
  const open: Open[] = [];
  const depth = new Map<string, number>();
  let numbering: { next: number; step: number } | null = null;
  let headerSeen = false;

  const touch = (id: string): string => {
    if (!participants.has(id)) participants.set(id, { id, lines: textLines(id), actor: false });
    return id;
  };
  const declare = (id: string, label: string | undefined, actor: boolean): void => {
    if (declared.has(id)) return;
    declared.add(id);
    participants.set(id, { id, lines: textLines(label ?? id), actor });
  };

  const rows = src.split(/\r?\n/);
  for (let n = 0; n < rows.length; n++) {
    const lineNo = n + 1;
    const s = stripComment(rows[n] ?? '').trim();
    if (s === '') continue;
    if (!headerSeen) {
      if (s !== 'sequenceDiagram') fail("expected a 'sequenceDiagram' header", lineNo);
      headerSeen = true;
      continue;
    }
    const word = s.split(/\s+/)[0]?.toLowerCase() ?? '';
    const rest = s.slice(word.length).trim();

    if (word === 'participant' || word === 'actor') {
      const m = /^(.+?)(?:\s+as\s+(.+))?$/i.exec(rest);
      if (rest === '' || !m) fail(`'${word}' needs a name`, lineNo);
      declare((m[1] ?? '').trim(), m[2], word === 'actor');
      continue;
    }
    if (word === 'create') {
      const m = /^(?:participant|actor)\s+(.+?)(?:\s+as\s+(.+))?$/i.exec(rest);
      if (!m) fail("'create' must be followed by 'participant' or 'actor' and a name", lineNo);
      declare((m[1] ?? '').trim(), m[2], /^actor/i.test(rest));
      continue;
    }
    if (word === 'destroy') {
      if (rest === '') fail("'destroy' needs a participant", lineNo);
      touch(rest);
      continue;
    }
    if (word === 'title' || word === 'link' || word === 'links') continue;
    if (word === 'autonumber') {
      const args = rest.split(/\s+/).filter((a) => a !== '');
      if (args[0]?.toLowerCase() === 'off') {
        numbering = null;
      } else {
        const nums = args.map(Number);
        if (nums.some((v) => !Number.isInteger(v)) || nums.length > 2) fail("invalid 'autonumber' arguments", lineNo);
        numbering = { next: nums[0] ?? 1, step: nums[1] ?? 1 };
      }
      continue;
    }
    if (word === 'activate' || word === 'deactivate') {
      if (rest === '') fail(`'${word}' needs a participant`, lineNo);
      const who = touch(rest);
      const d = depth.get(who) ?? 0;
      if (word === 'deactivate' && d === 0) fail(`'${rest}' is not active`, lineNo);
      depth.set(who, word === 'activate' ? d + 1 : d - 1);
      statements.push({ kind: word, who, line: lineNo });
      continue;
    }
    if (word === 'note') {
      const m = /^(left of|right of|over)\s+([^:]+?)\s*:\s*(.*)$/i.exec(rest);
      if (!m) fail("expected 'Note left of|right of|over <participant>: text'", lineNo);
      const side = (m[1] ?? '').toLowerCase().startsWith('left') ? 'left' : (m[1] ?? '').toLowerCase().startsWith('right') ? 'right' : 'over';
      const anchors = (m[2] ?? '').split(',').map((a) => a.trim());
      if (anchors.some((a) => a === '') || anchors.length > (side === 'over' ? 2 : 1)) fail('wrong number of participants in note', lineNo);
      statements.push({ kind: 'note', side, anchors: anchors.map(touch), lines: textLines(m[3] ?? ''), line: lineNo });
      continue;
    }
    if (BLOCKS.has(word)) {
      open.push({ kind: word as BlockKind, line: lineNo });
      statements.push({ kind: 'open', block: word as BlockKind, lines: rest === '' ? [] : textLines(rest), line: lineNo });
      continue;
    }
    if (word === 'rect' || word === 'box') {
      open.push({ kind: 'ignored', line: lineNo });
      continue;
    }
    if (word === 'else' || word === 'and') {
      const top = open[open.length - 1];
      const wanted = word === 'else' ? 'alt' : 'par';
      if (top?.kind !== wanted) fail(`'${word}' outside '${wanted}'`, lineNo);
      statements.push({ kind: 'branch', lines: rest === '' ? [] : textLines(rest), line: lineNo });
      continue;
    }
    if (s === 'end') {
      const top = open.pop();
      if (!top) fail("'end' without an open block", lineNo);
      if (top.kind !== 'ignored') statements.push({ kind: 'close', line: lineNo });
      continue;
    }

    const colon = s.indexOf(':');
    const head = colon < 0 ? s : s.slice(0, colon);
    const m = MESSAGE.exec(head);
    if (!m) fail(`unsupported syntax '${s.length > 24 ? `${s.slice(0, 24)}...` : s}'`, lineNo);
    const op = OPERATORS.find(([o]) => o === m[2]);
    if (!op) fail('unknown arrow', lineNo);
    const from = (m[1] ?? '').trim();
    const to = (m[4] ?? '').trim();
    if (from === '' || to === '') fail('message needs a sender and a receiver', lineNo);
    const mark = m[3];
    touch(from);
    touch(to);
    const msg: MessageStmt = {
      kind: 'message',
      from,
      to,
      lines: colon < 0 ? [] : textLines(s.slice(colon + 1)).filter((l, i, all) => all.length > 1 || l !== ''),
      dashed: op[1],
      head: op[2],
      activate: mark === '+',
      deactivate: mark === '-',
      line: lineNo,
    };
    const counter = numbering as { next: number; step: number } | null;
    if (counter) {
      msg.number = counter.next;
      numbering = { next: counter.next + counter.step, step: counter.step };
    }
    if (msg.activate) depth.set(to, (depth.get(to) ?? 0) + 1);
    if (msg.deactivate) {
      const d = depth.get(from) ?? 0;
      if (d === 0) fail(`'${from}' is not active`, lineNo);
      depth.set(from, d - 1);
    }
    statements.push(msg);
  }

  if (!headerSeen) fail("expected a 'sequenceDiagram' header", 1);
  const unclosed = open[open.length - 1];
  if (unclosed) fail(`'${unclosed.kind}' block is never closed`, unclosed.line);
  return { participants: [...participants.values()], statements };
}
