import { createAccessibilityReader } from '../front/accessibility.ts';
import type { Compartment, Direction, EdgeEnd, Graph, GraphCluster, GraphEdge, GraphNode } from '../types.ts';
import { UrsulaError } from '../types.ts';

/** The graph an ER source reads as, with the title the source names for assistive technology. */
export interface ErModel {
  graph: Graph;
  title?: string;
}

const LANE = { id: '_', label: '' };

/** The marks of both sides of a relationship line, by their text. */
const SYMBOLS: Record<string, EdgeEnd> = {
  '||': 'one',
  '|o': 'zero-one',
  'o|': 'zero-one',
  '}o': 'zero-many',
  'o{': 'zero-many',
  '}|': 'one-many',
  '|{': 'one-many',
};

/** The words that stand for a mark, in the order they are tried (the longer forms first). */
const WORDS: Array<[RegExp, EdgeEnd]> = [
  [/^(?:zero or one|one or zero)$/i, 'zero-one'],
  [/^(?:only one|exactly one|1)$/i, 'one'],
  [/^(?:zero or more|zero or many|many\(0\)|0\+)$/i, 'zero-many'],
  [/^(?:one or more|one or many|many\(1\)|1\+)$/i, 'one-many'],
];

const WORD_ALTERNATIVES = 'zero or one|one or zero|only one|exactly one|zero or more|zero or many|many\\(0\\)|0\\+|one or more|one or many|many\\(1\\)|1\\+|1';

const NAME = '[\\w\\u0080-\\uFFFF][\\w\\u0080-\\uFFFF\\-]*';
const QUOTED = '"[^"]*"';
const ALIAS = '\\[[^\\]]*\\]';
const CLASS = ':::[\\w\\-]+';
const ENTITY = `(?:${QUOTED}|${NAME})(?:${ALIAS})?(?:${CLASS})?`;

const BY_SYMBOL = new RegExp(`^(${ENTITY})\\s*(\\|\\||\\|o|o\\||\\}o|o\\{|\\}\\||\\|\\{)(--|\\.\\.)(\\|\\||\\|o|o\\||\\}o|o\\{|\\}\\||\\|\\{)\\s*(${ENTITY})\\s*(?::\\s*(.*))?$`, 'u');
const BY_WORD = new RegExp(`^(${ENTITY})\\s+(${WORD_ALTERNATIVES})\\s+(optionally to|to)\\s+(${WORD_ALTERNATIVES})\\s+(${ENTITY})\\s*(?::\\s*(.*))?$`, 'iu');
const DECLARATION = new RegExp(`^(${ENTITY})$`, 'u');
const BLOCK_OPEN = new RegExp(`^(${ENTITY})\\s*\\{\\s*(.*)$`, 'u');
const ATTRIBUTE = /^(\S+)\s+(\S+)(?:\s+((?:PK|FK|UK)(?:\s*,\s*(?:PK|FK|UK))*))?(?:\s+"([^"]*)")?\s*$/;

interface Entity {
  id: string;
  label: string;
  /** Cells of each attribute line: type, name, keys, comment (a cell is empty when the line has none). */
  rows: string[][];
  cluster: string | undefined;
}

interface Group {
  id: string;
  label: string;
  parent: string | undefined;
  direction: Direction | undefined;
  mirror: 'RL' | 'BT' | undefined;
  line: number;
}

/** A direction word as the layout takes it: the layout direction and, for the reversed ones, the mirror. */
function directionOf(word: string): { direction: Direction; mirror?: 'RL' | 'BT' } | undefined {
  switch (word.toUpperCase()) {
    case 'LR':
      return { direction: 'LR' };
    case 'TB':
    case 'TD':
      return { direction: 'TD' };
    case 'RL':
      return { direction: 'LR', mirror: 'RL' };
    case 'BT':
      return { direction: 'TD', mirror: 'BT' };
    default:
      return undefined;
  }
}

/** Emphasis marks of a quoted text (`**bold**`, `_italic_`) are read as formatting and left out of the shown text. */
function plain(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/(^|[^\w*])\*(?!\s)(.+?)\*(?!\w)/g, '$1$2')
    .replace(/(^|[^\w])_(?!\s)(.+?)_(?!\w)/g, '$1$2');
}

interface Ref {
  id: string;
  label: string;
}

/** Splits an entity reference (`CAR`, `p[Person]`, `a["Customer Account"]`, `"Any text"`, `CAR:::class`) into id and shown name. */
function refOf(text: string): Ref {
  const noClass = text.replace(new RegExp(`${CLASS}$`), '');
  const quoted = /^"([^"]*)"(?:\[(.*)\])?$/.exec(noClass);
  if (quoted) {
    const alias = quoted[2];
    return { id: quoted[1] as string, label: plain(alias === undefined ? (quoted[1] as string) : unquote(alias)) };
  }
  const aliased = /^([^[]+)\[(.*)\]$/.exec(noClass);
  if (aliased) return { id: aliased[1] as string, label: unquote(aliased[2] as string) };
  return { id: noClass, label: noClass };
}

const unquote = (t: string): string => {
  const s = t.trim();
  return s.length >= 2 && s.startsWith('"') && s.endsWith('"') ? plain(s.slice(1, -1)) : s;
};

function wordEnd(text: string): EdgeEnd {
  const t = text.trim().replace(/\s+/g, ' ');
  for (const [pattern, end] of WORDS) if (pattern.test(t)) return end;
  throw new Error(`unreachable cardinality ${text}`);
}

/** Two no-break spaces: the gap between the cells of an attribute line where the cells are drawn as one text. */
const GAP = '\u00A0\u00A0';

/** One line of an entity block as cells: the type, the name, the keys and the comment in quotes (an empty cell where there is none). */
function attributeRow(text: string, line: number): string[] {
  const found = ATTRIBUTE.exec(text);
  if (!found) throw new UrsulaError(`Cannot read the attribute "${text}"; expected "type name [PK, FK, UK] [\\"comment\\"]".`, 'er-attribute', line);
  const [, type, rawName, keys, comment] = found;
  const name = (rawName as string).startsWith('*') ? (rawName as string).slice(1) : (rawName as string);
  const star = (rawName as string).startsWith('*') && keys === undefined ? 'PK' : undefined;
  const marks = keys === undefined ? star : (keys as string).split(',').map((k) => k.trim()).join(', ');
  return [type as string, name, marks ?? '', comment === undefined || comment === '' ? '' : `"${comment}"`];
}

/** Reads an ER source into entities (boxes with a head and a body), relationships and subgraphs. */
export function parseEr(src: string, heading?: string): ErModel {
  const rows = src.split(/\r?\n/);
  const acc = createAccessibilityReader();
  const entities = new Map<string, Entity>();
  const groups = new Map<string, Group>();
  const edges: GraphEdge[] = [];
  const ignored: string[] = [];
  const stack: Group[] = [];
  let direction: Direction = 'LR';
  let mirror: 'RL' | 'BT' | undefined;
  let seenHeader = false;
  let block: Entity | undefined;

  const touch = (ref: Ref): Entity => {
    let e = entities.get(ref.id);
    const here = stack[stack.length - 1]?.id;
    if (!e) {
      e = { id: ref.id, label: ref.label, rows: [], cluster: here };
      entities.set(ref.id, e);
    } else {
      if (ref.label !== ref.id) e.label = ref.label;
      if (here !== undefined && e.cluster === undefined) e.cluster = here;
    }
    return e;
  };

  for (let i = 0; i < rows.length; i++) {
    const lineNo = i + 1;
    const text = (rows[i] as string).trim().replace(/;$/, '').trim();
    if (acc.insideBlock(text)) continue;
    if (text === '' || text.startsWith('%%')) continue;
    if (block) {
      if (text === '}') {
        block = undefined;
        continue;
      }
      if (text.endsWith('}')) {
        const inner = text.slice(0, -1).trim();
        if (inner !== '') block.rows.push(attributeRow(inner, lineNo));
        block = undefined;
        continue;
      }
      block.rows.push(attributeRow(text, lineNo));
      continue;
    }
    if (!seenHeader) {
      if (!/^erDiagram\b/.test(text)) throw new UrsulaError(`Expected "erDiagram" but found "${text}".`, 'er-header', lineNo);
      seenHeader = true;
      continue;
    }
    if (acc.read(text)) continue;

    const dir = /^direction\s+(\w+)$/.exec(text);
    if (dir) {
      const d = directionOf(dir[1] as string);
      if (!d) throw new UrsulaError(`Unknown direction "${dir[1] as string}"; use TB, BT, LR or RL.`, 'er-direction', lineNo);
      const top = stack[stack.length - 1];
      if (top) {
        top.direction = d.direction;
        top.mirror = d.mirror;
      } else {
        direction = d.direction;
        mirror = d.mirror;
      }
      continue;
    }
    if (/^(style|classDef|class|click|linkStyle)\b/.test(text)) {
      ignored.push(text);
      continue;
    }
    const sub = /^subgraph\s+(.+)$/.exec(text);
    if (sub) {
      const body = (sub[1] as string).trim();
      const quoted = /^"([^"]*)"$/.exec(body);
      const bracket = /^([^\s[]+)\s*\[(.*)\]$/.exec(body);
      const id = quoted ? (quoted[1] as string) : bracket ? (bracket[1] as string) : body;
      const label = quoted ? (quoted[1] as string) : bracket ? unquote(bracket[2] as string) : body;
      if (groups.has(id)) throw new UrsulaError(`The subgraph "${id}" is declared twice.`, 'er-subgraph', lineNo);
      const g: Group = { id, label, parent: stack[stack.length - 1]?.id, direction: undefined, mirror: undefined, line: lineNo };
      groups.set(id, g);
      stack.push(g);
      continue;
    }
    if (text === 'end') {
      if (stack.pop() === undefined) throw new UrsulaError('"end" closes no subgraph.', 'er-subgraph', lineNo);
      continue;
    }

    const bySymbol = BY_SYMBOL.exec(text);
    const byWord = bySymbol ? null : BY_WORD.exec(text);
    if (bySymbol || byWord) {
      const left = bySymbol ? (bySymbol[1] as string) : (byWord?.[1] as string);
      const right = bySymbol ? (bySymbol[5] as string) : (byWord?.[5] as string);
      const startEnd = bySymbol ? (SYMBOLS[bySymbol[2] as string] as EdgeEnd) : wordEnd(byWord?.[2] as string);
      const end = bySymbol ? (SYMBOLS[bySymbol[4] as string] as EdgeEnd) : wordEnd(byWord?.[4] as string);
      const dashed = bySymbol ? bySymbol[3] === '..' : (byWord?.[3] as string).toLowerCase().startsWith('optionally');
      const rawLabel = (bySymbol ? bySymbol[6] : byWord?.[6]) as string | undefined;
      const label = rawLabel === undefined ? '' : unquote(rawLabel);
      const a = refOf(left);
      const b = refOf(right);
      touch(a);
      touch(b);
      // The side of one stands before the side of many: a line written from the many side is kept from the one side.
      const many = (v: EdgeEnd): boolean => v === 'zero-many' || v === 'one-many';
      const turned = many(startEnd) && !many(end);
      edges.push({ from: turned ? b.id : a.id, to: turned ? a.id : b.id, style: dashed ? 'dotted' : 'normal', startEnd: turned ? end : startEnd, end: turned ? startEnd : end, ...(label === '' ? {} : { label }) });
      continue;
    }
    const open = BLOCK_OPEN.exec(text);
    if (open) {
      const e = touch(refOf(open[1] as string));
      const rest = (open[2] as string).trim();
      if (rest === '') block = e;
      else if (rest.endsWith('}')) {
        const inner = rest.slice(0, -1).trim();
        if (inner !== '') e.rows.push(attributeRow(inner, lineNo));
      } else {
        e.rows.push(attributeRow(rest, lineNo));
        block = e;
      }
      continue;
    }
    if (DECLARATION.test(text)) {
      touch(refOf(text));
      continue;
    }
    throw new UrsulaError(`Cannot read "${text}".`, 'er-syntax', lineNo);
  }
  if (!seenHeader) throw new UrsulaError('Expected "erDiagram" but found nothing.', 'er-header');
  if (block) throw new UrsulaError(`The block of "${block.id}" is not closed with "}".`, 'er-block');
  const open = stack[stack.length - 1];
  if (open) throw new UrsulaError(`The subgraph "${open.id}" is not closed with "end".`, 'er-subgraph', open.line);

  // A name that an edge uses before its subgraph is opened was read as an entity; it is the subgraph.
  for (const id of groups.keys()) entities.delete(id);
  const filled = new Set<string>();
  for (const e of entities.values()) {
    for (let g = e.cluster; g !== undefined; g = groups.get(g)?.parent) filled.add(g);
  }
  const clusters: GraphCluster[] = [...groups.values()]
    .filter((g) => filled.has(g.id))
    .map((g) => ({
      id: g.id,
      label: g.label,
      ...(g.parent === undefined ? {} : { parent: g.parent }),
      ...(g.direction === undefined ? {} : { direction: g.direction }),
      ...(g.mirror === undefined ? {} : { mirror: g.mirror }),
    }));
  const empty = new Set([...groups.keys()].filter((id) => !filled.has(id)));
  const nodes: GraphNode[] = [...entities.values()].map((e) => {
    const compartments: Compartment[] = [
      { lines: [e.label] },
      { lines: e.rows.map((cells) => cells.filter((c) => c !== '').join(GAP)), columns: e.rows, columnEmphasis: ['tag', 'body', 'body', 'tag'] },
    ];
    return { id: e.id, title: e.label, lines: [], shape: 'rect', lane: LANE.id, ...(e.cluster === undefined ? {} : { cluster: e.cluster }), compartments };
  });
  const graph: Graph = {
    direction,
    ...(mirror === undefined ? {} : { mirror }),
    ...(ignored.length === 0 ? {} : { ignored }),
    lanes: [LANE],
    ...(clusters.length === 0 ? {} : { clusters }),
    nodes,
    edges: edges.filter((e) => !empty.has(e.from) && !empty.has(e.to)),
  };
  const title = acc.title ?? heading;
  return { graph, ...(title === undefined || title === '' ? {} : { title }) };
}
