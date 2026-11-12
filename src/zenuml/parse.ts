import { createAccessibilityReader } from '../front/accessibility.ts';
import type { BlockKind, MessageStmt, Participant, ParticipantKind, Sequence, Statement } from '../sequence/model.ts';
import { UrsulaError } from '../types.ts';

/** What the ZenUML text says, in the vocabulary of the sequence engine. */
export interface ZenumlModel {
  sequence: Sequence;
  title?: string;
  accTitle?: string;
  /** Label of a frame's tag, the keyword as written, by the statement index of its opening line. */
  tags: Map<number, string>;
}

const STARTER_ID = '_STARTER_';
const STARTER_LABEL = 'Starter';

/** Annotators that have a symbol in the sequence engine. */
const CORE_KINDS: Readonly<Record<string, ParticipantKind>> = {
  actor: 'actor',
  database: 'database',
  boundary: 'boundary',
  control: 'control',
  entity: 'entity',
  queue: 'queue',
};

/** Service annotators drawn with the nearest symbol, plus a stereotype line that keeps the name. */
const NEAREST_KINDS: Readonly<Record<string, ParticipantKind>> = {
  s3: 'database',
  dynamodb: 'database',
  rds: 'database',
  aurora: 'database',
  redshift: 'database',
  sqs: 'queue',
  sns: 'queue',
  kinesis: 'queue',
  eventbridge: 'queue',
};

const KEYWORDS: ReadonlySet<string> = new Set(['return', 'else', 'catch', 'finally', 'title', 'new', 'if', 'while', 'for', 'foreach', 'loop', 'opt', 'par', 'critical', 'try']);

const FRAME_HEADER = /^(if|while|for|foreach|loop|opt|par|critical|try)\b\s*(\(.*\))?\s*\{$/i;
const ELSE_HEADER = /^else\b\s*(?:if\s*(\(.*\)))?\s*\{$/i;
const CATCH_HEADER = /^catch\b\s*(\(.*\))?\s*\{$/i;
const FINALLY_HEADER = /^finally\s*\{$/i;
const IDENT = String.raw`"[^"]+"|[A-Za-z_$][\w$-]*`;
const DECLARATION = new RegExp(String.raw`^(${IDENT})(?:\s+as\s+(.+))?$`, 'u');

interface CallEntry {
  kind: 'call';
  owner: string;
  caller: string;
  variable: string | undefined;
  returned: boolean;
  /** Index of the reply statement that is the last thing in the call's body at its own level. */
  lastReply: number | undefined;
  line: number;
}

interface FrameEntry {
  kind: 'frame';
  family: 'if' | 'try' | 'plain';
  line: number;
}

type Entry = CallEntry | FrameEntry;

function fail(message: string, line: number, code = 'syntax'): never {
  throw new UrsulaError(message, code, line);
}

const unquote = (id: string): string => (id.startsWith('"') && id.endsWith('"') && id.length >= 2 ? id.slice(1, -1) : id);

/** Plain text of a comment line: the emphasis marks of Markdown are dropped, the words stay. */
function commentText(raw: string): string {
  return raw
    .trim()
    .replace(/\*\*(.+?)\*\*/gu, '$1')
    .replace(/`([^`]+)`/gu, '$1')
    .replace(/(^|\s)\*(\S[^*]*?)\*(?=\s|$)/gu, '$1$2');
}

/** The text between the first `(` and the last `)` of a header, trimmed; empty when there is none. */
function inner(parens: string | undefined): string {
  if (parens === undefined) return '';
  return parens.slice(1, parens.lastIndexOf(')')).trim();
}

/** Parses the supported ZenUML subset into a sequence model. */
export function parseZenuml(src: string, heading?: string): ZenumlModel {
  const participants = new Map<string, Participant>();
  const statements: Statement[] = [];
  const tags = new Map<number, string>();
  const stack: Entry[] = [];
  const acc = createAccessibilityReader();
  let title: string | undefined;
  let starter: string | undefined;
  let implicitStarter = false;
  let held: FrameEntry | undefined;
  let comment: string[] = [];
  let replyNext = false;
  let headerSeen = false;

  const touch = (id: string): string => {
    if (!participants.has(id)) participants.set(id, { id, lines: [id], kind: 'participant' });
    return id;
  };
  const owner = (): string | undefined => {
    for (let i = stack.length - 1; i >= 0; i--) {
      const e = stack[i];
      if (e?.kind === 'call') return e.owner;
    }
    return undefined;
  };
  const callerFor = (): string => {
    const o = owner();
    if (o !== undefined) return o;
    if (starter !== undefined) return starter;
    implicitStarter = true;
    participants.set(STARTER_ID, { id: STARTER_ID, lines: [STARTER_LABEL], kind: 'actor' });
    return STARTER_ID;
  };
  /** A note above the next message or frame; `from`/`to` are the lifelines it spans, empty when not known yet. */
  const flushComment = (anchors: string[], line: number): void => {
    if (comment.length === 0) return;
    statements.push({ kind: 'note', side: 'over', anchors, lines: comment, line });
    comment = [];
  };
  const push = (s: Statement): number => statements.push(s) - 1;
  const flushHeld = (): void => {
    if (held === undefined) return;
    push({ kind: 'close', line: held.line });
    held = undefined;
  };
  const message = (from: string, to: string, label: string, look: Pick<MessageStmt, 'dashed' | 'head'>, activate: boolean, line: number): number => {
    touch(from);
    touch(to);
    flushComment(from === to ? [from] : [from, to], line);
    return push({ kind: 'message', from, to, lines: label === '' ? [] : [label], dashed: look.dashed, head: look.head, activate, deactivate: false, line });
  };
  const closeCall = (entry: CallEntry, line: number): void => {
    if (entry.variable !== undefined && !entry.returned) {
      entry.lastReply = message(entry.owner, entry.caller, entry.variable, { dashed: true, head: 'filled' }, false, line);
    }
    const last = statements[statements.length - 1];
    if (entry.lastReply !== undefined && entry.lastReply === statements.length - 1 && last?.kind === 'message') {
      last.deactivate = true;
    } else {
      push({ kind: 'deactivate', who: entry.owner, line });
    }
  };
  const handleClose = (line: number): void => {
    flushHeld();
    const top = stack.pop();
    if (!top) fail("'}' without an open block", line);
    if (top.kind === 'call') closeCall(top, line);
    else {
      held = top;
    }
  };
  const place = (id: string, label: string | undefined, kind: ParticipantKind, extra: string | undefined): void => {
    const name = unquote(id);
    const lines = [label === undefined ? name : unquote(label.trim())];
    if (extra !== undefined) lines.push(extra);
    participants.set(name, { id: name, lines, kind });
  };

  const rows = src.split(/\r?\n/);
  for (let n = 0; n < rows.length; n++) {
    const lineNo = n + 1;
    let s = (rows[n] ?? '').trim();
    if (acc.insideBlock(s)) continue;
    if (s === '') continue;
    if (s.startsWith('//')) {
      comment.push(commentText(s.slice(2)));
      continue;
    }
    if (s.startsWith('%%')) continue;
    if (!headerSeen) {
      if (s !== 'zenuml') fail("expected a 'zenuml' header", lineNo, 'header');
      headerSeen = true;
      continue;
    }
    if (acc.read(s)) continue;

    while (s.startsWith('}')) {
      handleClose(lineNo);
      comment = [];
      s = s.slice(1).trim();
    }
    if (s === '') continue;

    const titleM = /^title\s+(.+)$/iu.exec(s);
    if (titleM) {
      title = (titleM[1] ?? '').trim();
      comment = [];
      continue;
    }
    const lower = s.toLowerCase();
    const elseM = ELSE_HEADER.exec(s);
    const catchM = CATCH_HEADER.exec(s);
    if (elseM || catchM || FINALLY_HEADER.test(s)) {
      const want = elseM ? 'if' : 'try';
      if (held?.family !== want) fail(`'${s.split(/[\s({]/u)[0] ?? s}' without a matching '${want === 'if' ? 'if' : 'try'}'`, lineNo);
      const text = elseM ? (elseM[1] === undefined ? 'else' : inner(elseM[1])) : catchM ? `catch${inner(catchM[1]) === '' ? '' : ` (${inner(catchM[1])})`}` : 'finally';
      stack.push(held);
      held = undefined;
      comment = [];
      push({ kind: 'branch', lines: [text], line: lineNo });
      continue;
    }
    flushHeld();

    const frame = FRAME_HEADER.exec(s);
    if (frame) {
      const word = (frame[1] ?? '').toLowerCase();
      const block: BlockKind = word === 'if' || word === 'try' ? 'alt' : word === 'opt' ? 'opt' : word === 'par' ? 'par' : word === 'critical' ? 'critical' : 'loop';
      const cond = inner(frame[2]);
      flushComment([''], lineNo);
      const at = push({ kind: 'open', block, lines: cond === '' ? [] : [cond], line: lineNo });
      tags.set(at, frame[1] ?? word);
      stack.push({ kind: 'frame', family: word === 'if' ? 'if' : word === 'try' ? 'try' : 'plain', line: lineNo });
      continue;
    }

    const starterM = /^@starter\s*\(\s*([^)]+?)\s*\)$/i.exec(s);
    if (starterM) {
      starter = touch(unquote(starterM[1] ?? ''));
      comment = [];
      continue;
    }
    if (lower === '@return' || lower === '@reply') {
      replyNext = true;
      continue;
    }
    const annotated = /^@(\w+)\s+(.+)$/u.exec(s);
    if (annotated) {
      const word = (annotated[1] ?? '').toLowerCase();
      const decl = DECLARATION.exec((annotated[2] ?? '').trim());
      if (!decl) fail(`expected a participant name after '@${annotated[1] ?? ''}'`, lineNo);
      const core = CORE_KINDS[word];
      const near = NEAREST_KINDS[word];
      place(decl[1] ?? '', decl[2], core ?? near ?? 'participant', core ? undefined : `«${annotated[1] ?? ''}»`);
      comment = [];
      continue;
    }

    const ret = /^return\b\s*(.*)$/u.exec(s);
    if (ret) {
      let at = stack.length - 1;
      while (at >= 0 && stack[at]?.kind !== 'call') at--;
      const entry = stack[at];
      if (entry?.kind !== 'call') fail("'return' outside a call", lineNo);
      const index = message(entry.owner, entry.caller, (ret[1] ?? '').trim(), { dashed: true, head: 'filled' }, false, lineNo);
      entry.returned = true;
      entry.lastReply = at === stack.length - 1 ? index : undefined;
      continue;
    }

    // A statement with a sender, a creation or a call, optionally assigned to a variable.
    let rest = s;
    let variable: string | undefined;
    const assign = /^((?:[\w<>[\],]+\s+)?[\w$]+)\s*=\s*(.+)$/u.exec(rest);
    if (assign && !rest.includes('->')) {
      variable = (assign[1] ?? '').trim();
      rest = (assign[2] ?? '').trim();
    }
    let sender: string | undefined;
    const arrow = new RegExp(String.raw`^(${IDENT})\s*->\s*(.+)$`, 'u').exec(rest);
    if (arrow) {
      sender = unquote(arrow[1] ?? '');
      rest = (arrow[2] ?? '').trim();
      const asyncM = /^([^\s:(){}]+)\s*(?::\s*(.*))?$/u.exec(rest);
      if (asyncM && !/[.(]/u.test(asyncM[1] ?? '')) {
        // An async message is a solid line with an open head; only a reply (`@return`, `@reply`) is dashed with a filled head.
        const dashed = replyNext;
        replyNext = false;
        message(sender, unquote(asyncM[1] ?? ''), (asyncM[2] ?? '').trim(), { dashed, head: dashed ? 'filled' : 'open' }, false, lineNo);
        continue;
      }
    }

    const braced = rest.endsWith('{');
    const call = braced ? rest.slice(0, -1).trim() : rest;
    const create = /^new\s+(.+)$/u.exec(call);
    if (create) {
      const body = (create[1] ?? '').trim();
      const target = unquote((/^(?:"[^"]+"|[^\s(]+)/u.exec(body)?.[0] ?? ''));
      if (target === '') fail("'new' needs a class name", lineNo);
      const from = sender ?? callerFor();
      const label = `${variable === undefined ? '' : `${variable} = `}new ${body}`;
      message(from, target, label, { dashed: false, head: 'filled' }, braced, lineNo);
      if (braced) stack.push({ kind: 'call', owner: target, caller: from, variable: undefined, returned: false, lastReply: undefined, line: lineNo });
      continue;
    }

    const open = call.indexOf('(');
    const head = open < 0 ? call : call.slice(0, open);
    const dot = head.lastIndexOf('.');
    if (call !== '' && (dot > 0 || open > 0) && !/\s/u.test(head.trim()) && !KEYWORDS.has(head.trim().toLowerCase())) {
      const to = dot > 0 ? unquote(head.slice(0, dot)) : (owner() ?? callerFor());
      const label = dot > 0 ? call.slice(dot + 1) : call;
      if (label === '' || to === '') fail(`unsupported syntax '${s}'`, lineNo);
      const from = sender ?? callerFor();
      message(from, to, label, { dashed: false, head: 'filled' }, braced, lineNo);
      replyNext = false;
      if (braced) {
        stack.push({ kind: 'call', owner: to, caller: from, variable, returned: false, lastReply: undefined, line: lineNo });
      } else if (variable !== undefined) {
        message(to, from, variable, { dashed: true, head: 'filled' }, false, lineNo);
      }
      continue;
    }

    if (sender === undefined && variable === undefined && !braced) {
      const decl = DECLARATION.exec(s);
      if (decl && !KEYWORDS.has((decl[1] ?? '').toLowerCase())) {
        place(decl[1] ?? '', decl[2], 'participant', undefined);
        comment = [];
        continue;
      }
    }
    const shown = s.length > 24 ? `${s.slice(0, 24)}...` : s;
    fail(`unsupported syntax '${shown}'`, lineNo);
  }

  if (!headerSeen) fail("expected a 'zenuml' header", 1, 'header');
  flushHeld();
  const unclosed = stack[stack.length - 1];
  if (unclosed) fail(unclosed.kind === 'frame' ? 'a block is never closed' : 'a call block is never closed', unclosed.line);

  title ??= heading;

  const anchor = [...participants.keys()][0];
  const order = implicitStarter ? [STARTER_ID, ...[...participants.keys()].filter((k) => k !== STARTER_ID)] : [...participants.keys()];
  const first = order[0] ?? anchor;
  if (first === undefined) fail('the diagram has no participants', 1, 'empty');
  const resolved = statements.map((st): Statement => (st.kind === 'note' ? { ...st, anchors: st.anchors.map((a) => (a === '' ? first : a)) } : st));
  const list = order.map((id) => participants.get(id)).filter((p): p is Participant => p !== undefined);
  return {
    sequence: { participants: list, statements: resolved },
    ...(title === undefined ? {} : { title }),
    ...(acc.title === undefined || acc.title === '' ? {} : { accTitle: acc.title }),
    tags,
  };
}
