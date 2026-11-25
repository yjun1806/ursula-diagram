import { createAccessibilityReader } from '../front/accessibility.ts';
import { UrsulaError } from '../types.ts';
import type { ArrowDirection, BlockDiagram, BlockGroup, BlockLink, BlockNode, BlockShape, LinkStyle } from './model.ts';

function fail(message: string, line: number, code = 'syntax', column?: number): never {
  throw new UrsulaError(message, code, line, column === undefined ? {} : { column });
}

interface Bracket {
  open: string;
  close: string;
  shape: BlockShape;
}

/** Bracket pairs of a block, longest opener first. Pairs that share an opener are told apart by their closer. */
const BRACKETS: Bracket[] = [
  { open: '(((', close: ')))', shape: 'dbl-circle' },
  { open: '((', close: '))', shape: 'circle' },
  { open: '([', close: '])', shape: 'stadium' },
  { open: '[(', close: ')]', shape: 'cylinder' },
  { open: '[[', close: ']]', shape: 'subroutine' },
  { open: '{{', close: '}}', shape: 'hexagon' },
  { open: '[/', close: '/]', shape: 'parallelogram' },
  { open: '[/', close: '\\]', shape: 'trap-b' },
  { open: '[\\', close: '\\]', shape: 'lean-l' },
  { open: '[\\', close: '/]', shape: 'trap-t' },
  { open: '<[', close: ']>', shape: 'arrow' },
  { open: '>', close: ']', shape: 'asym' },
  { open: '{', close: '}', shape: 'diamond' },
  { open: '(', close: ')', shape: 'round' },
  { open: '[', close: ']', shape: 'rect' },
];

const ID = /^[\p{L}\p{N}_]+/u;
const WIDTH = /^:(\d+)/u;
const DIRECTIONS = new Set(['right', 'left', 'up', 'down']);

interface NodeToken {
  t: 'node';
  id: string;
  /** The label when the source gave a bracket pair; otherwise absent. */
  label?: string[];
  shape?: BlockShape;
  heads?: ArrowDirection[];
  span?: number;
  space: boolean;
}

interface LinkToken {
  t: 'link';
  style: LinkStyle;
  arrow: boolean;
  arrowStart: boolean;
  invisible: boolean;
  label?: string;
}

type Token = NodeToken | LinkToken;

const ENTITIES: Record<string, string> = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

/** Label text as lines: entities decoded, `<br>` a line break, a text of spaces no text at all. */
function labelLines(raw: string): string[] {
  const text = raw.replace(/&(nbsp|amp|lt|gt|quot|apos);/gu, (_, name: string) => ENTITIES[name] ?? '');
  const lines = text.split(/<br\s*\/?>/iu).map((l) => l.trim());
  return lines.every((l) => l === '') ? [''] : lines;
}

const LINK =
  /^(?:(--|==|-\.)\s*("[^"]*"|\w[\w ]*?)\s*(-->|==>|---|===|-\.->|-\.-)|(<-->|-->|---|==>|===|-\.->|-\.-|~~~))(?:\s*\|("[^"]*"|[^|]*)\|)?/u;

function unquote(text: string): string {
  const t = text.trim();
  return t.length >= 2 && t.startsWith('"') && t.endsWith('"') ? t.slice(1, -1) : t;
}

function readLink(rest: string): { token: LinkToken; length: number } | undefined {
  const m = LINK.exec(rest);
  if (m === null) return undefined;
  const op = m[3] ?? m[4] ?? '';
  const text = m[2] ?? m[5];
  const label = text === undefined ? '' : unquote(text);
  const token: LinkToken = {
    t: 'link',
    style: op.includes('=') ? 'thick' : op.includes('.') ? 'dotted' : 'normal',
    arrow: op.endsWith('>'),
    arrowStart: op.startsWith('<'),
    invisible: op === '~~~',
    ...(label === '' ? {} : { label }),
  };
  return { token, length: m[0].length };
}

/** Reads the bracket pair at the start of `rest`: its shape, its label and the length it takes. */
function readBracket(rest: string, line: number): { shape: BlockShape; label: string[]; length: number } | undefined {
  const first = BRACKETS.find((b) => rest.startsWith(b.open));
  if (first === undefined) return undefined;
  const candidates = BRACKETS.filter((b) => b.open === first.open);
  let at = first.open.length;
  while (rest[at] === ' ') at++;
  let body: string;
  if (rest[at] === '"') {
    const end = rest.indexOf('"', at + 1);
    if (end < 0) fail('A label opened with a quote has no closing quote.', line);
    body = rest.slice(at + 1, end);
    at = end + 1;
    while (rest[at] === ' ') at++;
  } else {
    let end = -1;
    for (const c of candidates) {
      const found = rest.indexOf(c.close, at);
      if (found >= 0 && (end < 0 || found < end)) end = found;
    }
    if (end < 0) fail(`"${first.open}" has no closing "${first.close}".`, line);
    body = rest.slice(at, end).trim();
    at = end;
  }
  const closer = candidates.find((c) => rest.startsWith(c.close, at));
  if (closer === undefined) fail(`"${first.open}" has no closing "${first.close}".`, line);
  return { shape: closer.shape, label: labelLines(body), length: at + closer.close.length };
}

function readHeads(rest: string, line: number): { heads: ArrowDirection[]; length: number } {
  const m = /^\(([^)]*)\)/u.exec(rest);
  if (m === null) return fail('A block arrow names its direction: <["label"]>(right).', line, 'arrow');
  const heads: ArrowDirection[] = [];
  for (const word of (m[1] ?? '').split(',').map((w) => w.trim().toLowerCase())) {
    if (word === 'x') heads.push('left', 'right');
    else if (word === 'y') heads.push('up', 'down');
    else if (DIRECTIONS.has(word)) heads.push(word as ArrowDirection);
    else fail(`"${word}" is not a direction of a block arrow; use right, left, up, down, x or y.`, line, 'arrow');
  }
  return { heads: [...new Set(heads)], length: m[0].length };
}

function tokenize(s: string, line: number): Token[] {
  const tokens: Token[] = [];
  let pos = 0;
  while (pos < s.length) {
    while (s[pos] === ' ' || s[pos] === '\t') pos++;
    if (pos >= s.length) break;
    const rest = s.slice(pos);
    if (tokens[tokens.length - 1]?.t === 'node') {
      const link = readLink(rest);
      if (link !== undefined) {
        tokens.push(link.token);
        pos += link.length;
        continue;
      }
    }
    const id = ID.exec(rest)?.[0];
    if (id === undefined) fail(`Cannot read "${rest.trim()}"; a block is an id, optionally followed by a bracket pair and ":width".`, line);
    pos += id.length;
    const node: NodeToken = { t: 'node', id, space: id === 'space' };
    const bracket = readBracket(s.slice(pos), line);
    if (bracket !== undefined) {
      node.label = bracket.label;
      node.shape = bracket.shape;
      pos += bracket.length;
      if (bracket.shape === 'arrow') {
        const heads = readHeads(s.slice(pos), line);
        node.heads = heads.heads;
        pos += heads.length;
      }
    }
    const width = WIDTH.exec(s.slice(pos));
    if (width !== null) {
      node.span = Number(width[1]);
      pos += width[0].length;
      if (node.span < 1) fail(`The width of "${id}" is ${node.span}; a width is at least 1.`, line, 'width');
    }
    if (pos < s.length && s[pos] !== ' ' && s[pos] !== '\t' && readLink(s.slice(pos)) === undefined) {
      fail(`Cannot read "${s.slice(pos).trim()}" after "${id}".`, line);
    }
    tokens.push(node);
  }
  return tokens;
}

const IGNORED = /^(?:style|classDef|class|linkStyle|click)\b/u;

/**
 * Parses a Mermaid block diagram: `block`, then blocks in rows, `columns N`, nested `block ... end` and links.
 * `heading` is the title of a leading front-matter block.
 */
export function parseBlock(src: string, heading?: string): BlockDiagram {
  const rows = src.split(/\r?\n/);
  const acc = createAccessibilityReader();
  const root: BlockGroup = { kind: 'group', id: '', named: false, span: 1, children: [], line: 1 };
  const stack: BlockGroup[] = [root];
  const byId = new Map<string, BlockNode | BlockGroup>();
  const links: BlockLink[] = [];
  const ignored: string[] = [];
  let headerSeen = false;
  let anonymous = 0;
  const current = (): BlockGroup => stack[stack.length - 1] as BlockGroup;

  const place = (token: NodeToken, line: number): void => {
    const container = current();
    const span = Math.max(1, Math.min(token.span ?? 1, container.columns ?? Infinity));
    if (token.space) {
      container.children.push({ kind: 'space', span, line });
      return;
    }
    const known = byId.get(token.id);
    if (known !== undefined) {
      if (known.kind === 'node' && token.shape !== undefined && token.label !== undefined) {
        known.shape = token.shape;
        known.lines = token.label;
        if (token.heads !== undefined) known.heads = token.heads;
      }
      return;
    }
    const node: BlockNode = {
      kind: 'node',
      id: token.id,
      lines: token.label ?? [token.id],
      shape: token.shape ?? 'rect',
      span,
      line,
      ...(token.heads === undefined ? {} : { heads: token.heads }),
    };
    byId.set(node.id, node);
    container.children.push(node);
  };

  for (let n = 0; n < rows.length; n++) {
    const line = n + 1;
    const s = (rows[n] ?? '').trim();
    if (acc.insideBlock(s)) continue;
    if (s === '' || s.startsWith('%%')) continue;

    if (!headerSeen) {
      if (!/^block(?:-beta)?$/u.test(s)) fail('A block diagram starts with "block".', line, 'header');
      headerSeen = true;
      continue;
    }
    if (acc.read(s)) continue;
    if (s === 'end') {
      if (stack.length === 1) fail('"end" closes a block that was never opened.', line, 'block');
      stack.pop();
      continue;
    }
    const columns = /^columns\s+(\S+)$/u.exec(s);
    if (columns !== null) {
      const value = columns[1] ?? '';
      if (value === 'auto') delete current().columns;
      else if (/^[1-9]\d*$/u.test(value)) current().columns = Number(value);
      else fail(`"columns ${value}" needs a number of columns or "auto".`, line, 'columns');
      continue;
    }
    if (IGNORED.test(s)) {
      ignored.push(s);
      continue;
    }
    const open = /^block(?::([\p{L}\p{N}_]+))?(?::(\d+))?$/u.exec(s);
    if (open !== null) {
      anonymous += 1;
      const named = open[1] !== undefined;
      const parent = current();
      const group: BlockGroup = {
        kind: 'group',
        id: open[1] ?? `block-${anonymous}`,
        named,
        span: Math.max(1, Math.min(open[2] === undefined ? 1 : Number(open[2]), parent.columns ?? Infinity)),
        children: [],
        line,
      };
      if (named) byId.set(group.id, group);
      parent.children.push(group);
      stack.push(group);
      continue;
    }

    const tokens = tokenize(s, line);
    if (!tokens.some((t) => t.t === 'link')) {
      for (const t of tokens) if (t.t === 'node') place(t, line);
      continue;
    }
    if (tokens.some((t, i) => (i % 2 === 0) !== (t.t === 'node')) || tokens[tokens.length - 1]?.t !== 'node') {
      fail('A link joins two blocks: A --> B.', line, 'link', (rows[n] ?? '').trimEnd().length + 1);
    }
    for (const t of tokens) if (t.t === 'node') place(t, line);
    for (let i = 1; i + 1 < tokens.length; i += 2) {
      const link = tokens[i] as LinkToken;
      links.push({
        from: (tokens[i - 1] as NodeToken).id,
        to: (tokens[i + 1] as NodeToken).id,
        style: link.style,
        arrow: link.arrow,
        arrowStart: link.arrowStart,
        invisible: link.invisible,
        line,
        ...(link.label === undefined ? {} : { label: link.label }),
      });
    }
  }

  if (!headerSeen) fail('A block diagram starts with "block".', 1, 'header');
  if (stack.length > 1) fail('A "block" is not closed by "end".', current().line, 'block');
  for (const link of links) {
    for (const end of [link.from, link.to]) {
      if (!byId.has(end)) fail(`The link names "${end}", which is not a block.`, link.line, 'link');
    }
  }
  return {
    ...(heading === undefined ? {} : { title: heading }),
    ...(acc.title === undefined || acc.title === '' ? {} : { accTitle: acc.title }),
    ...(root.columns === undefined ? {} : { columns: root.columns }),
    children: root.children,
    links,
    ignored,
  };
}
