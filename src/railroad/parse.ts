import { createAccessibilityReader } from '../front/accessibility.ts';
import { fail } from '../errors/fail.ts';
import type { Node, Notation, Railroad, Rule } from './model.ts';

const HEADERS: Record<string, Notation> = {
  'railroad-beta': 'ir',
  'railroad-ebnf-beta': 'ebnf',
  'railroad-abnf-beta': 'abnf',
  'railroad-peg-beta': 'peg',
};

interface Tok {
  k: 'str' | 'id' | 'num' | 'val' | 'prose' | 'class' | 'sym';
  /** The text of a string without its quotes; the text as written for the other kinds. */
  v: string;
  /** The token as written. */
  raw: string;
  line: number;
  /** Whitespace stands before the token. */
  sp: boolean;
}

const SYMBOLS = new Set([...'|/,()[]{}?*+!&.-;=:']);
const ID_START = /[A-Za-z_]/u;
const ID = /[A-Za-z_][A-Za-z0-9_]*(?:-[A-Za-z0-9_]+)*/uy;
const NUM_VAL = /%[xXdDbB][0-9A-Fa-f]+(?:-[0-9A-Fa-f]+|(?:\.[0-9A-Fa-f]+)*)/uy;

function unescape(body: string): string {
  return body.replace(/\\(["'\\])/gu, '$1');
}

/** Splits the text into tokens. Comments are dropped; `line` is 1-based. */
function lex(text: string, notation: Notation, firstLine: number): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  let line = firstLine;
  let sp = true;
  let sinceEnd = 0;
  const push = (k: Tok['k'], v: string, raw: string, at: number): void => {
    toks.push({ k, v, raw, line: at, sp });
    sp = false;
    sinceEnd = k === 'sym' && v === ';' ? 0 : sinceEnd + 1;
  };
  const stringAt = (start: number, prefix: string): void => {
    const quote = text[start] as string;
    let j = start + 1;
    while (j < text.length && text[j] !== quote && text[j] !== '\n') j += text[j] === '\\' ? 2 : 1;
    if (text[j] !== quote) fail('A string is not closed.', line);
    const body = text.slice(start + 1, j);
    const raw = text.slice(start - prefix.length, j + 1);
    if (prefix === '') push('str', unescape(body), raw, line);
    else push('val', raw, raw, line);
    i = j + 1;
  };
  while (i < text.length) {
    const ch = text[i] as string;
    if (ch === '\n') {
      line++;
      i++;
      sp = true;
      continue;
    }
    if (/\s/u.test(ch)) {
      i++;
      sp = true;
      continue;
    }
    if (notation === 'ebnf' && (text.startsWith('/*', i) || text.startsWith('(*', i))) {
      const close = text.startsWith('/*', i) ? '*/' : '*)';
      const end = text.indexOf(close, i + 2);
      if (end < 0) fail('A comment is not closed.', line);
      line += text.slice(i, end).split('\n').length - 1;
      i = end + 2;
      sp = true;
      continue;
    }
    if ((notation === 'peg' && ch === '#') || (notation === 'abnf' && ch === ';' && sinceEnd === 0)) {
      while (i < text.length && text[i] !== '\n') i++;
      sp = true;
      continue;
    }
    if (ch === '"' || ch === "'") {
      stringAt(i, '');
      continue;
    }
    if (notation === 'abnf' && ch === '%' && /[sSiI]/u.test(text[i + 1] ?? '') && (text[i + 2] === '"' || text[i + 2] === "'")) {
      stringAt(i + 2, text.slice(i, i + 2));
      continue;
    }
    if (notation === 'abnf' && ch === '%') {
      NUM_VAL.lastIndex = i;
      const m = NUM_VAL.exec(text);
      if (m === null) fail('A numeric value is written %x41, %d65 or %b1000001.', line);
      push('val', m[0], m[0], line);
      i += m[0].length;
      continue;
    }
    if (notation === 'abnf' && ch === '<') {
      const end = text.indexOf('>', i);
      if (end < 0 || text.slice(i, end).includes('\n')) fail('A prose value is not closed.', line);
      push('prose', text.slice(i, end + 1), text.slice(i, end + 1), line);
      i = end + 1;
      continue;
    }
    if (notation === 'peg' && ch === '[') {
      let j = i + 1;
      while (j < text.length && text[j] !== ']' && text[j] !== '\n') j += text[j] === '\\' ? 2 : 1;
      if (text[j] !== ']') fail('A character class is not closed.', line);
      push('class', text.slice(i, j + 1), text.slice(i, j + 1), line);
      i = j + 1;
      continue;
    }
    if (ID_START.test(ch)) {
      ID.lastIndex = i;
      const m = ID.exec(text) as RegExpExecArray;
      push('id', m[0], m[0], line);
      i += m[0].length;
      continue;
    }
    if (/\d/u.test(ch)) {
      let j = i;
      while (/\d/u.test(text[j] ?? '')) j++;
      push('num', text.slice(i, j), text.slice(i, j), line);
      i = j;
      continue;
    }
    const op = (['::=', '<-', '=/'] as const).find((o) => text.startsWith(o, i));
    if (op !== undefined && op === ({ ebnf: '::=', peg: '<-', abnf: '=/', ir: '' } as const)[notation]) {
      push('sym', op, op, line);
      i += op.length;
      continue;
    }
    if (SYMBOLS.has(ch)) {
      push('sym', ch, ch, line);
      i++;
      continue;
    }
    fail(`Unexpected character "${ch}".`, line);
  }
  return toks;
}

class Cursor {
  pos = 0;
  readonly toks: Tok[];
  readonly endLine: number;
  constructor(toks: Tok[], endLine: number) {
    this.toks = toks;
    this.endLine = endLine;
  }
  peek(): Tok | undefined {
    return this.toks[this.pos];
  }
  next(): Tok | undefined {
    return this.toks[this.pos++];
  }
  isSym(v: string): boolean {
    const t = this.peek();
    return t !== undefined && t.k === 'sym' && t.v === v;
  }
  line(): number {
    return this.peek()?.line ?? this.endLine;
  }
  expectSym(v: string, what: string): void {
    if (!this.isSym(v)) fail(`Expected "${v}" ${what}.`, this.line());
    this.pos++;
  }
}

const seqOf = (items: Node[]): Node => (items.length === 1 ? (items[0] as Node) : { k: 'seq', items });
const choiceOf = (items: Node[]): Node => (items.length === 1 ? (items[0] as Node) : { k: 'choice', items });

/** `min`..`max` times: the item itself, `optional`, or a `repeat`. */
function counted(item: Node, min: number, max: number | null, line: number): Node {
  if (max !== null && max < min) fail(`The repeat count ${min}*${max} runs backwards.`, line);
  if (max === 0) fail('A repeat of at most 0 times matches nothing.', line);
  if (min === 1 && max === 1) return item;
  if (min === 0 && max === 1) return { k: 'optional', item };
  return { k: 'repeat', item, min, max };
}

function suffixes(c: Cursor, base: Node, adjacentQuestion: boolean): Node {
  let node = base;
  for (;;) {
    const t = c.peek();
    if (t === undefined || t.k !== 'sym') return node;
    if (t.v === '?' && (!adjacentQuestion || !t.sp)) node = { k: 'optional', item: node };
    else if (t.v === '*') node = { k: 'repeat', item: node, min: 0, max: null };
    else if (t.v === '+') node = { k: 'repeat', item: node, min: 1, max: null };
    else return node;
    c.pos++;
  }
}

function group(c: Cursor, close: string, inner: () => Node): Node {
  const open = c.next() as Tok;
  const node = inner();
  if (!c.isSym(close)) fail(`"${open.v}" opened here is not closed with "${close}".`, c.line() === c.endLine ? open.line : c.line());
  c.pos++;
  return node;
}

// ---- EBNF ----

function ebnfChoice(c: Cursor): Node {
  const alts = [ebnfSeq(c)];
  while (c.isSym('|')) {
    c.pos++;
    alts.push(ebnfSeq(c));
  }
  return choiceOf(alts);
}

function ebnfStarts(t: Tok | undefined): boolean {
  if (t === undefined) return false;
  if (t.k === 'str' || t.k === 'id') return true;
  return t.k === 'sym' && ['(', '[', '{', '?'].includes(t.v);
}

function ebnfSeq(c: Cursor): Node {
  const items: Node[] = [];
  const at = c.line();
  for (;;) {
    if (items.length > 0 && c.isSym(',')) {
      c.pos++;
      if (!ebnfStarts(c.peek())) fail('A "," must be followed by an element.', c.line());
    }
    if (!ebnfStarts(c.peek())) break;
    items.push(ebnfExcept(c));
  }
  if (items.length === 0) fail('An empty alternative; write an element between the separators.', at);
  return seqOf(items);
}

function ebnfExcept(c: Cursor): Node {
  const item = suffixes(c, ebnfPrimary(c), true);
  if (!c.isSym('-')) return item;
  c.pos++;
  if (!ebnfStarts(c.peek())) fail('A "-" must be followed by the element to exclude.', c.line());
  return { k: 'except', item, except: suffixes(c, ebnfPrimary(c), true) };
}

function ebnfPrimary(c: Cursor): Node {
  const t = c.peek() as Tok;
  if (t.k === 'str') {
    c.pos++;
    return { k: 'terminal', text: t.v };
  }
  if (t.k === 'id') {
    c.pos++;
    return { k: 'nonterminal', name: t.v };
  }
  if (t.v === '(') return group(c, ')', () => ebnfChoice(c));
  if (t.v === '[') return { k: 'optional', item: group(c, ']', () => ebnfChoice(c)) };
  if (t.v === '{') return { k: 'repeat', item: group(c, '}', () => ebnfChoice(c)), min: 0, max: null };
  c.pos++;
  const words: Tok[] = [];
  while (c.peek() !== undefined && !c.isSym('?')) words.push(c.next() as Tok);
  if (!c.isSym('?')) fail('A special sequence "? ... ?" is not closed.', t.line);
  c.pos++;
  const text = words.map((w, i) => (i > 0 && w.sp ? ' ' : '') + w.raw).join('');
  return { k: 'special', text };
}

// ---- ABNF ----

function abnfAlt(c: Cursor): Node {
  const alts = [abnfConcat(c)];
  while (c.isSym('/')) {
    c.pos++;
    alts.push(abnfConcat(c));
  }
  return choiceOf(alts);
}

function abnfStarts(t: Tok | undefined): boolean {
  if (t === undefined) return false;
  if (['str', 'id', 'num', 'val', 'prose'].includes(t.k)) return true;
  return t.k === 'sym' && ['(', '[', '*'].includes(t.v);
}

function abnfConcat(c: Cursor): Node {
  const items: Node[] = [];
  const at = c.line();
  while (abnfStarts(c.peek())) items.push(abnfRepetition(c));
  if (items.length === 0) fail('An empty alternative; write an element between the separators.', at);
  return seqOf(items);
}

function abnfRepetition(c: Cursor): Node {
  const line = c.line();
  let min = 1;
  let max: number | null = 1;
  const first = c.peek() as Tok;
  if (first.k === 'num') {
    c.pos++;
    min = Number(first.v);
    max = min;
  }
  if (c.isSym('*')) {
    c.pos++;
    if (first.k !== 'num') min = 0;
    max = null;
    const upper = c.peek();
    if (upper !== undefined && upper.k === 'num' && !upper.sp) {
      c.pos++;
      max = Number(upper.v);
    }
  }
  if (!abnfStarts(c.peek()) || c.peek()?.k === 'num' || c.isSym('*')) fail('A repeat count must be followed by an element.', line);
  return counted(abnfElement(c), min, max, line);
}

function abnfElement(c: Cursor): Node {
  const t = c.peek() as Tok;
  if (t.k === 'id') {
    c.pos++;
    return { k: 'nonterminal', name: t.v };
  }
  if (t.k === 'str' || t.k === 'val') {
    c.pos++;
    return { k: 'terminal', text: t.v };
  }
  if (t.k === 'prose') {
    c.pos++;
    return { k: 'special', text: t.v };
  }
  if (t.v === '(') return group(c, ')', () => abnfAlt(c));
  return { k: 'optional', item: group(c, ']', () => abnfAlt(c)) };
}

// ---- PEG ----

function pegChoice(c: Cursor): Node {
  const alts = [pegSeq(c)];
  while (c.isSym('/')) {
    c.pos++;
    alts.push(pegSeq(c));
  }
  return alts.length === 1 ? (alts[0] as Node) : { k: 'choice', items: alts, ordered: true };
}

function pegStarts(t: Tok | undefined): boolean {
  if (t === undefined) return false;
  if (['str', 'id', 'class'].includes(t.k)) return true;
  return t.k === 'sym' && ['(', '.', '!', '&'].includes(t.v);
}

function pegSeq(c: Cursor): Node {
  const items: Node[] = [];
  const at = c.line();
  while (pegStarts(c.peek())) items.push(pegPrefix(c));
  if (items.length === 0) fail('An empty alternative; write an element between the separators.', at);
  return seqOf(items);
}

function pegPrefix(c: Cursor): Node {
  const t = c.peek() as Tok;
  if (t.k === 'sym' && (t.v === '!' || t.v === '&')) {
    c.pos++;
    if (!pegStarts(c.peek())) fail(`A "${t.v}" must be followed by an element.`, c.line());
    return { k: 'predicate', op: t.v === '!' ? 'not' : 'and', item: pegPrefix(c) };
  }
  return suffixes(c, pegPrimary(c), false);
}

function pegPrimary(c: Cursor): Node {
  const t = c.peek() as Tok;
  if (t.k === 'id') {
    c.pos++;
    return { k: 'nonterminal', name: t.v };
  }
  if (t.k === 'str' || t.k === 'class') {
    c.pos++;
    return { k: 'terminal', text: t.k === 'str' ? t.v : t.raw };
  }
  if (t.v === '.') {
    c.pos++;
    return { k: 'special', text: '.' };
  }
  return group(c, ')', () => pegChoice(c));
}

// ---- IR ----

const IR_ONE = ['optional', 'zeroOrMore', 'oneOrMore'];
const IR_TEXT = ['terminal', 'nonterminal', 'special'];
const IR_MANY = ['sequence', 'choice'];

function irCall(c: Cursor): Node {
  const t = c.next();
  if (t === undefined || t.k !== 'id') fail('Expected a constructor such as terminal("x") or sequence(a, b).', t?.line ?? c.endLine);
  const name = t.v;
  if (![...IR_ONE, ...IR_TEXT, ...IR_MANY].includes(name)) fail(`"${name}" is not a constructor; use terminal, nonterminal, special, sequence, choice, optional, zeroOrMore or oneOrMore.`, t.line);
  c.expectSym('(', `after ${name}`);
  let node: Node;
  if (IR_TEXT.includes(name)) {
    const s = c.next();
    if (s === undefined || s.k !== 'str') fail(`${name}( ) takes one quoted string.`, s?.line ?? t.line);
    node = name === 'terminal' ? { k: 'terminal', text: s.v } : name === 'nonterminal' ? { k: 'nonterminal', name: s.v } : { k: 'special', text: s.v };
  } else if (IR_ONE.includes(name)) {
    const item = irCall(c);
    node = name === 'optional' ? { k: 'optional', item } : { k: 'repeat', item, min: name === 'oneOrMore' ? 1 : 0, max: null };
  } else {
    const items = [irCall(c)];
    while (c.isSym(',')) {
      c.pos++;
      items.push(irCall(c));
    }
    node = name === 'sequence' ? { k: 'seq', items } : { k: 'choice', items };
  }
  c.expectSym(')', `to close ${name}(`);
  return node;
}

const ASSIGN: Record<Notation, string[]> = { ir: ['='], ebnf: ['=', '::='], abnf: ['=', '=/'], peg: ['<-'] };

/** Parses the railroad family: the header keyword picks the notation. `heading` is the title of a front matter block. */
export function parseRailroad(src: string, heading?: string): Railroad {
  const rows = src.split(/\r?\n/);
  let headerAt = -1;
  for (let n = 0; n < rows.length; n++) {
    const s = (rows[n] ?? '').trim();
    if (s === '' || s.startsWith('%%')) continue;
    headerAt = n;
    break;
  }
  const word = headerAt < 0 ? '' : ((rows[headerAt] ?? '').trim().split(/[\s;]+/)[0] ?? '');
  const notation = HEADERS[word];
  if (notation === undefined) fail('A railroad diagram starts with railroad-beta, railroad-ebnf-beta, railroad-abnf-beta or railroad-peg-beta.', headerAt + 1 || 1, 'header');

  let title: string | undefined;
  const acc = createAccessibilityReader();
  const body: string[] = rows.map(() => '');
  let pending = false;
  for (let n = headerAt + 1; n < rows.length; n++) {
    const s = (rows[n] ?? '').trim();
    if (s === '' || s.startsWith('%%')) continue;
    if (!pending) {
      if (acc.insideBlock(s) || acc.read(s)) continue;
      const t = /^title(?:\s+(.*))?$/u.exec(s);
      if (t !== null && !/^title\s*(?:=|<-|::=)/u.test(s)) {
        const text = (t[1] ?? '').trim().replace(/^"(.*)"$/u, '$1');
        if (text !== '') title = text;
        continue;
      }
      if (notation === 'abnf' && s.startsWith(';')) continue;
    }
    body[n] = rows[n] ?? '';
    pending = !s.endsWith(';');
  }

  const toks = lex(body.join('\n'), notation, 1);
  const rules: Rule[] = [];
  const c = new Cursor(toks, rows.length);
  while (c.peek() !== undefined) {
    const name = c.next() as Tok;
    if (name.k !== 'id') fail(`Expected a rule name, found "${name.raw}".`, name.line);
    const op = c.next();
    if (op === undefined || op.k !== 'sym' || !ASSIGN[notation].includes(op.v)) fail(`Expected "${ASSIGN[notation].join('" or "')}" after the rule name "${name.v}".`, op?.line ?? name.line);
    let end = c.pos;
    while (end < toks.length && !(toks[end]?.k === 'sym' && toks[end]?.v === ';')) end++;
    if (end >= toks.length) fail(`The rule "${name.v}" does not end with ";".`, name.line);
    const inner = new Cursor(toks.slice(c.pos, end), toks[end]?.line ?? name.line);
    if (inner.peek() === undefined) fail(`The rule "${name.v}" has no definition.`, name.line);
    const bodyNode = notation === 'ir' ? irCall(inner) : notation === 'ebnf' ? ebnfChoice(inner) : notation === 'abnf' ? abnfAlt(inner) : pegChoice(inner);
    const extra = inner.peek();
    if (extra !== undefined) fail(`Unexpected "${extra.raw}" in the rule "${name.v}".`, extra.line);
    c.pos = end + 1;
    const known = rules.findIndex((r) => r.name === name.v);
    if (op.v === '=/') {
      const old = rules[known];
      if (old === undefined) fail(`"${name.v}" is extended with "=/" before it is defined.`, name.line);
      const first: Node[] = old.body.k === 'choice' ? old.body.items : [old.body];
      rules[known] = { ...old, body: { k: 'choice', items: [...first, ...(bodyNode.k === 'choice' ? bodyNode.items : [bodyNode])] } };
      continue;
    }
    if (known >= 0) fail(`The rule "${name.v}" is defined twice.`, name.line);
    rules.push({ name: name.v, body: bodyNode, line: name.line });
  }
  if (rules.length === 0) fail('A railroad diagram needs at least one rule.', rows.length, 'empty');
  const final = title ?? (heading !== undefined && heading !== '' ? heading : undefined);
  const accTitle = acc.title;
  return { notation, ...(final === undefined ? {} : { title: final }), ...(accTitle === undefined || accTitle === '' ? {} : { accTitle }), rules };
}
