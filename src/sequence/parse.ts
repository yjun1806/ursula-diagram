import { UrsulaError } from '../types.ts';
import { PARTICIPANT_KINDS } from './model.ts';
import type { ArrowHead, BlockKind, MessageStmt, Participant, ParticipantGroup, ParticipantKind, Sequence, Statement } from './model.ts';

const BREAK = /<br\s*\/?>/gi;
type Operator = readonly [string, boolean, ArrowHead, Pick<MessageStmt, 'half' | 'reverse'>?];
/** The half arrows: a solid and a dotted form of each, with the head as one stroke of an open head. */
const HALF: ReadonlyArray<readonly [string, string, 'top' | 'bottom', boolean]> = [
  ['-|\\', '--|\\', 'top', false],
  ['-|/', '--|/', 'bottom', false],
  ['/|-', '/|--', 'top', true],
  ['\\|-', '\\|--', 'bottom', true],
  ['-\\\\', '--\\\\', 'top', false],
  ['-//', '--//', 'bottom', false],
  ['//-', '//--', 'top', true],
  ['\\\\-', '\\\\--', 'bottom', true],
];
const OPERATORS: ReadonlyArray<Operator> = [
  ['<<-->>', true, 'filled'],
  ['<<->>', false, 'filled'],
  ['-->>', true, 'filled'],
  ['->>', false, 'filled'],
  ['--x', true, 'cross'],
  ['-x', false, 'cross'],
  ['--)', true, 'open'],
  ['-)', false, 'open'],
  ['-->', true, 'none'],
  ['->', false, 'none'],
  ...HALF.flatMap(([solid, dotted, half, reverse]): Operator[] => {
    const shape = reverse ? { half, reverse } : { half };
    return [
      [solid, false, 'open', shape],
      [dotted, true, 'open', shape],
    ];
  }),
];
/** Longer arrows are tried first, so that `/|--` is not read as `/|-` followed by a `-` mark. */
const ARROW = OPERATORS.map(([o]) => o)
  .sort((x, y) => y.length - x.length)
  .map((o) => o.replace(/[\\|/()]/g, '\\$&'))
  .join('|');
const MESSAGE = new RegExp(`^(.+?)\\s*(${ARROW})\\s*([+-]?)\\s*(.+)$`, 'u');
/** `()` written against the arrow: the message joins that lifeline at its centre. */
const CENTRE = '()';
/** Named character references the documentation shows, besides the numeric `#NNN;` form. */
const NAMED: Record<string, string> = {
  quot: '"', amp: '&', lt: '<', gt: '>', nbsp: '\u00a0', semi: ';', num: '#', infin: '\u221e', hearts: '\u2665',
  copy: '\u00a9', reg: '\u00ae', trade: '\u2122', hellip: '\u2026', mdash: '\u2014', ndash: '\u2013', deg: '\u00b0',
  larr: '\u2190', rarr: '\u2192', uarr: '\u2191', darr: '\u2193', harr: '\u2194', times: '\u00d7', check: '\u2713',
};
/** CSS colour keywords; a `box` line that starts with one takes it as the colour, not as part of the label. */
const COLOUR_WORDS: ReadonlySet<string> = new Set(
  (
    'transparent aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood ' +
    'cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen ' +
    'darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray ' +
    'darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia ' +
    'gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender ' +
    'lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink ' +
    'lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta ' +
    'maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise ' +
    'mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid ' +
    'palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red ' +
    'rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow ' +
    'springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen'
  ).split(' '),
);
const BLOCKS: ReadonlySet<string> = new Set(['loop', 'opt', 'alt', 'par', 'critical', 'break']);

type Open = { kind: BlockKind; line: number } | { kind: 'ignored' | 'zone'; line: number } | { kind: 'group'; line: number; group: ParticipantGroup };

/** Replaces `#NNN;` and `#name;` with the characters they stand for; unknown names stay as written. */
function decodeEntities(text: string): string {
  return text.replace(/#(\d+|[a-z]+);/gi, (whole, code: string) => {
    if (/^\d+$/.test(code)) {
      const n = Number(code);
      return n <= 0x10ffff ? String.fromCodePoint(n) : whole;
    }
    return NAMED[code.toLowerCase()] ?? whole;
  });
}

/** Label of a `box` line: a leading colour (a keyword or an `rgb(...)`-style function) is dropped. */
function groupLabel(rest: string): string {
  const fn = /^(?:rgba?|hsla?)\s*\([^)]*\)\s*/i.exec(rest);
  if (fn) return rest.slice(fn[0].length).trim();
  const first = rest.split(/\s+/)[0] ?? '';
  return COLOUR_WORDS.has(first.toLowerCase()) ? rest.slice(first.length).trim() : rest.trim();
}

function textLines(text: string): string[] {
  return decodeEntities(text)
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

interface Declaration {
  id: string;
  label: string | undefined;
  kind: ParticipantKind | undefined;
}

/** End of the `{...}` object that starts at `start`, skipping braces inside strings; -1 when it never closes. */
function objectEnd(text: string, start: number): number {
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === '\\') i++;
      else if (ch === '"') inString = false;
    } else if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) return i;
  }
  return -1;
}

/**
 * Reads what follows `participant` or `actor`: `id`, `id as label`, `id@{ "type": ..., "alias": ... }` and the
 * combination of the last two. An `as` label wins over an `alias` inside the object.
 */
function readDeclaration(rest: string, line: number): Declaration {
  const at = rest.indexOf('@{');
  if (at < 0) {
    const m = /^(.+?)(?:\s+as\s+(.+))?$/i.exec(rest);
    return { id: (m?.[1] ?? '').trim(), label: m?.[2], kind: undefined };
  }
  const id = rest.slice(0, at).trim();
  const end = objectEnd(rest, at + 1);
  if (id === '') fail("'@{' needs a participant name before it", line);
  if (end < 0) fail("missing '}' after '@{'", line);
  let config: unknown;
  try {
    config = JSON.parse(rest.slice(at + 1, end + 1));
  } catch {
    return fail('the participant settings after the name are not valid JSON', line);
  }
  if (config === null || typeof config !== 'object' || Array.isArray(config)) fail('the participant settings must be an object', line);
  const { type, alias } = config as { type?: unknown; alias?: unknown };
  let kind: ParticipantKind | undefined;
  if (type !== undefined) {
    const found = PARTICIPANT_KINDS.find((k) => k === type);
    if (!found) fail(`unknown participant type '${String(type)}'; use ${PARTICIPANT_KINDS.join(', ')}`, line);
    kind = found;
  }
  const tail = /^\s+as\s+(.+)$/i.exec(rest.slice(end + 1));
  if (rest.slice(end + 1).trim() !== '' && !tail) fail("expected 'as <label>' after the participant settings", line);
  return { id, label: tail?.[1] ?? (typeof alias === 'string' ? alias : undefined), kind };
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
    if (!participants.has(id)) participants.set(id, { id, lines: textLines(id), kind: 'participant' });
    return id;
  };
  const groups: ParticipantGroup[] = [];
  const created = new Set<string>();
  const destroyed = new Set<string>();
  const declare = (d: Declaration, keyword: ParticipantKind): void => {
    if (declared.has(d.id)) return;
    declared.add(d.id);
    participants.set(d.id, { id: d.id, lines: textLines(d.label ?? d.id), kind: d.kind ?? keyword });
    const top = open[open.length - 1];
    if (top?.kind === 'group') top.group.members.push(d.id);
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
      if (rest === '') fail(`'${word}' needs a name`, lineNo);
      declare(readDeclaration(rest, lineNo), word);
      continue;
    }
    if (word === 'create') {
      const m = /^(participant|actor)\s+(.+)$/i.exec(rest);
      if (!m) fail("'create' must be followed by 'participant' or 'actor' and a name", lineNo);
      const d = readDeclaration(m[2] ?? '', lineNo);
      declare(d, (m[1] ?? '').toLowerCase() === 'actor' ? 'actor' : 'participant');
      created.add(d.id);
      continue;
    }
    if (word === 'destroy') {
      if (rest === '') fail("'destroy' needs a participant", lineNo);
      destroyed.add(touch(rest));
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
    if (word === 'rect') {
      open.push({ kind: 'zone', line: lineNo });
      statements.push({ kind: 'zoneOpen', line: lineNo });
      continue;
    }
    if (word === 'box') {
      const group: ParticipantGroup = { label: decodeEntities(groupLabel(rest)), members: [] };
      groups.push(group);
      open.push({ kind: 'group', line: lineNo, group });
      continue;
    }
    if (word === 'else' || word === 'and' || word === 'option') {
      const top = open[open.length - 1];
      const wanted = word === 'else' ? 'alt' : word === 'option' ? 'critical' : 'par';
      if (top?.kind !== wanted) fail(`'${word}' outside '${wanted}'`, lineNo);
      statements.push({ kind: 'branch', lines: rest === '' ? [] : textLines(rest), line: lineNo });
      continue;
    }
    if (s === 'end') {
      const top = open.pop();
      if (!top) fail("'end' without an open block", lineNo);
      if (top.kind === 'zone') statements.push({ kind: 'zoneClose', line: lineNo });
      else if (top.kind !== 'ignored' && top.kind !== 'group') statements.push({ kind: 'close', line: lineNo });
      continue;
    }

    const colon = s.indexOf(':');
    const head = colon < 0 ? s : s.slice(0, colon);
    const m = MESSAGE.exec(head);
    if (!m) fail(`unsupported syntax '${s.length > 24 ? `${s.slice(0, 24)}...` : s}'`, lineNo);
    const op = OPERATORS.find(([o]) => o === m[2]);
    if (!op) fail('unknown arrow', lineNo);
    let from = (m[1] ?? '').trim();
    let to = (m[4] ?? '').trim();
    const centreFrom = from.endsWith(CENTRE);
    const centreTo = to.startsWith(CENTRE);
    if (centreFrom) from = from.slice(0, -CENTRE.length).trim();
    if (centreTo) to = to.slice(CENTRE.length).trim();
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
      ...op[3],
      line: lineNo,
    };
    if (op[0].startsWith('<<')) msg.both = true;
    if (centreFrom) msg.centreFrom = true;
    if (centreTo) msg.centreTo = true;
    if (created.delete(to)) msg.creates = true;
    if (destroyed.delete(from)) msg.destroysFrom = true;
    if (destroyed.delete(to)) msg.destroysTo = true;
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
  return { participants: [...participants.values()], statements, ...(groups.length > 0 ? { groups } : {}) };
}
