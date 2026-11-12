import type { Direction, EdgeEnd, EdgeStyle, Graph, GraphCluster, GraphEdge, Lane, NodeShape } from './types.ts';
import { UrsulaError } from './types.ts';

interface NodeDraft {
  id: string;
  title: string;
  lines: string[];
  shape: NodeShape;
  shapeAsked?: string;
  lane: string | null;
}

interface State {
  direction: 'LR' | 'TD';
  mirror?: 'RL' | 'BT';
  lanes: Lane[];
  nodes: Map<string, NodeDraft>;
  edges: GraphEdge[];
  /** Source line of every edge, in the order of `edges`. */
  edgeLines: number[];
  ignored: string[];
  /** The innermost subgraph that is open. */
  openLane: string | null;
  /** Subgraphs that are open, outermost first. */
  stack: string[];
  openLine: number;
  implicitLane: string | null;
  /** What each subgraph says about itself beyond its name. */
  groups: Map<string, { parent?: string; direction?: Direction; mirror?: 'RL' | 'BT' }>;
  /** The header was `swimlane-beta`. */
  swimlane: boolean;
}

const IMPLICIT_LANE = '_';
const ID = /[\p{L}\p{N}_]+/uy;
const DIAGRAM_TYPES = /^(sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|pie|journey|gitGraph|mindmap|timeline)(\s|$)/;
const IGNORED = /^(classDef|class|style|linkStyle|click|direction|accTitle\s*:|accDescr\s*:)(\s|$)/;
const STYLING = /^(classDef|class|style|linkStyle)\s/;
/** Removes a `%%` comment, ignoring `%%` inside double quotes. */
function stripComment(line: string): string {
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') quoted = !quoted;
    else if (!quoted && ch === '%' && line[i + 1] === '%') return line.slice(0, i);
  }
  return line;
}

/** Splits one physical line on `;` that is outside quotes and brackets. */
function splitStatements(line: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quoted = false;
  let start = 0;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') quoted = !quoted;
    else if (quoted) continue;
    else if (ch === '[' || ch === '(' || ch === '{') depth++;
    else if (ch === ']' || ch === ')' || ch === '}') depth = Math.max(0, depth - 1);
    else if (ch === ';' && depth === 0) {
      parts.push(line.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(line.slice(start));
  return parts.map((p) => p.trim()).filter((p) => p.length > 0);
}

/** An icon word such as `fa:fa-car` or `fab:fa-name`, with the one space that follows it. */
const ICON_WORD = /(?<![\w-])fa[bsr]?:fa-[\w-]+ ?/g;

/** The plain text of a markdown string (a quoted text wrapped in backticks): emphasis marks are dropped, line breaks stay. */
function unwrapMarkdown(raw: string): string {
  const t = raw.trim();
  if (t.length < 2 || !t.startsWith('`') || !t.endsWith('`')) return raw;
  return t
    .slice(1, -1)
    .replace(/\*\*(.+?)\*\*/gs, '$1')
    .replace(/__(.+?)__/gs, '$1')
    .replace(/\*(.+?)\*/gs, '$1')
    .replace(/(?<![\p{L}\p{N}_])_(.+?)_(?![\p{L}\p{N}_])/gsu, '$1')
    .replace(/~~(.+?)~~/gs, '$1');
}

function splitLabel(raw: string, fallback: string): { title: string; lines: string[] } {
  const parts = raw
    .replace(ICON_WORD, '')
    .split(/<br\s*\/?>|\r?\n/i)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  const [title, ...lines] = parts;
  return { title: title ?? fallback, lines };
}

interface Cursor {
  s: string;
  i: number;
}

function skipSpaces(c: Cursor): void {
  while (c.i < c.s.length && /\s/.test(c.s[c.i] ?? '')) c.i++;
}

type Closer = readonly [string, NodeShape];

/** Opening token and the closing tokens with the shape each one makes; longer opening tokens come first. */
const SHAPES: ReadonlyArray<readonly [string, readonly Closer[]]> = [
  ['(((', [[')))', 'dbl-circle']]],
  ['((', [['))', 'circle']]],
  ['([', [['])', 'stadium']]],
  ['(', [[')', 'round']]],
  ['[[', [[']]', 'subroutine']]],
  ['[(', [[')]', 'cylinder']]],
  [
    '[/',
    [
      ['/]', 'parallelogram'],
      ['\\]', 'trap-b'],
    ],
  ],
  [
    '[\\',
    [
      ['\\]', 'lean-l'],
      ['/]', 'trap-t'],
    ],
  ],
  ['[', [[']', 'rect']]],
  ['{{', [['}}', 'hexagon']]],
  ['{', [['}', 'diamond']]],
  ['>', [[']', 'asym']]],
];

/** Shape names of `id@{ shape: ... }` and the shape each is drawn as. */
const SHAPE_NAMES: Readonly<Record<string, NodeShape>> = {
  rect: 'rect',
  proc: 'rect',
  process: 'rect',
  rectangle: 'rect',
  rounded: 'round',
  event: 'round',
  stadium: 'stadium',
  pill: 'stadium',
  terminal: 'stadium',
  'fr-rect': 'subroutine',
  subproc: 'subroutine',
  subprocess: 'subroutine',
  subroutine: 'subroutine',
  'framed-rectangle': 'subroutine',
  cyl: 'cylinder',
  database: 'cylinder',
  db: 'cylinder',
  cylinder: 'cylinder',
  circle: 'circle',
  circ: 'circle',
  start: 'circle',
  diam: 'diamond',
  decision: 'diamond',
  diamond: 'diamond',
  question: 'diamond',
  hex: 'hexagon',
  hexagon: 'hexagon',
  prepare: 'hexagon',
  'lean-r': 'parallelogram',
  'lean-right': 'parallelogram',
  'in-out': 'parallelogram',
  'lean-l': 'lean-l',
  'lean-left': 'lean-l',
  'out-in': 'lean-l',
  'trap-b': 'trap-b',
  'trapezoid-bottom': 'trap-b',
  priority: 'trap-b',
  'trap-t': 'trap-t',
  'trapezoid-top': 'trap-t',
  manual: 'trap-t',
  'dbl-circ': 'dbl-circle',
  'double-circle': 'dbl-circle',
  odd: 'asym',
};

/** What one node mention in a statement says. */
interface NodeRead {
  id: string;
  label: string | null;
  /** The shape given, or null when the mention names the node only. */
  shape: NodeShape | null;
  shapeAsked?: string;
  /** `id@{ ... }` that sets properties of something else (an edge, a subgraph) and describes no node. */
  propsOnly?: true;
}

/** Keys of `@{ ... }` that describe a node; a block without any of them sets properties of something else. */
const NODE_KEYS = ['shape', 'label', 'icon', 'img'];

/** Reads the `key: value` pairs of `@{ ... }`; the cursor is just after the `{`. */
function readProps(c: Cursor, line: number): Map<string, string> {
  const props = new Map<string, string>();
  for (;;) {
    skipSpaces(c);
    if (c.s[c.i] === '}') {
      c.i++;
      return props;
    }
    const key = /([\p{L}\p{N}_-]+)\s*:\s*/uy;
    key.lastIndex = c.i;
    const km = key.exec(c.s);
    if (!km) throw new UrsulaError(`expected 'key: value' near '${c.s.slice(c.i, c.i + 12)}' in '@{ }'`, 'syntax', line);
    c.i += km[0].length;
    const quote = c.s[c.i];
    let value: string;
    if (quote === '"' || quote === "'") {
      const end = c.s.indexOf(quote, c.i + 1);
      if (end < 0) throw new UrsulaError("unterminated quoted value in '@{ }'", 'syntax', line);
      value = c.s.slice(c.i + 1, end);
      c.i = end + 1;
    } else {
      const bare = /[^,}]*/y;
      bare.lastIndex = c.i;
      const bm = bare.exec(c.s);
      value = (bm?.[0] ?? '').trim();
      c.i += bm?.[0].length ?? 0;
    }
    props.set(km[1] ?? '', value);
    skipSpaces(c);
    if (c.s[c.i] === ',') c.i++;
    else if (c.s[c.i] !== '}') throw new UrsulaError(`expected ',' or '}' near '${c.s.slice(c.i, c.i + 12)}' in '@{ }'`, 'syntax', line);
  }
}

function shapeOfProps(id: string, props: Map<string, string>): NodeRead {
  if (!NODE_KEYS.some((k) => props.has(k))) return { id, label: null, shape: null, propsOnly: true };
  const label = props.get('label');
  const named = props.get('shape');
  const asked = named ?? (props.has('icon') ? 'icon' : props.has('img') ? 'img' : undefined);
  const known = named === undefined ? undefined : SHAPE_NAMES[named];
  const shape: NodeShape = known ?? 'rect';
  return {
    id,
    label: label === undefined ? null : unwrapMarkdown(label),
    shape,
    ...(known === undefined && asked !== undefined ? { shapeAsked: asked } : {}),
  };
}

function readNode(c: Cursor, line: number, st: State): NodeRead {
  skipSpaces(c);
  ID.lastIndex = c.i;
  const m = ID.exec(c.s);
  if (!m) throw new UrsulaError(`expected a node id near '${c.s.slice(c.i, c.i + 12)}'`, 'syntax', line);
  const id = m[0];
  c.i += id.length;
  let read: NodeRead = { id, label: null, shape: null };
  if (c.s.startsWith('@{', c.i)) {
    c.i += 2;
    read = shapeOfProps(id, readProps(c, line));
  } else {
    const found = SHAPES.find(([open]) => c.s.startsWith(open, c.i));
    if (found) {
      const [open, closers] = found;
      c.i += open.length;
      let label: string;
      let shape: NodeShape;
      if (c.s[c.i] === '"') {
        const end = c.s.indexOf('"', c.i + 1);
        if (end < 0) throw new UrsulaError('unterminated quoted label', 'syntax', line);
        label = unwrapMarkdown(c.s.slice(c.i + 1, end));
        c.i = end + 1;
        skipSpaces(c);
        const closer = closers.find(([close]) => c.s.startsWith(close, c.i));
        if (!closer) throw new UrsulaError(`expected '${closers.map(([close]) => close).join("' or '")}' after quoted label`, 'syntax', line);
        c.i += closer[0].length;
        shape = closer[1];
      } else {
        const hits = closers.map(([close, kind]) => ({ at: c.s.indexOf(close, c.i), close, kind })).filter((h) => h.at >= 0);
        const first = hits.sort((a, b) => a.at - b.at)[0];
        if (!first) throw new UrsulaError(`missing '${closers[0]?.[0] ?? ''}'`, 'syntax', line);
        label = c.s.slice(c.i, first.at);
        c.i = first.at + first.close.length;
        shape = first.kind;
      }
      read = { id, label, shape };
    }
  }
  if (c.s.startsWith(':::', c.i)) {
    const cls = /:::([\w-]+)/y;
    cls.lastIndex = c.i;
    const cm = cls.exec(c.s);
    if (!cm) throw new UrsulaError("expected a class name after ':::'", 'syntax', line);
    c.i += cm[0].length;
    st.ignored.push(`${id}${cm[0]}`);
  }
  return read;
}

/** Nodes joined by `&`, which take part in an edge together. */
function readGroup(c: Cursor, line: number, st: State): NodeRead[] {
  const group = [readNode(c, line, st)];
  for (;;) {
    const save = c.i;
    skipSpaces(c);
    if (c.s[c.i] !== '&') {
      c.i = save;
      return group;
    }
    c.i++;
    group.push(readNode(c, line, st));
  }
}

interface EdgeRead {
  style: EdgeStyle;
  label?: string;
  id?: string;
  startEnd?: EdgeEnd;
  end: EdgeEnd;
  invisible?: true;
  minLength?: number;
}

const END_OF_WORD = '(?=\\s|$|\\|)';
const START_MARK = '([<ox])?';
const END_MARK = `(?:(>)|([ox])${END_OF_WORD})?`;
const EDGE_ID = /([\p{L}\p{N}_]+)@(?=[-=~.<ox])/uy;
/** Lines without a label: dotted, normal and thick, each with the marks at its two ends. */
const PLAIN_EDGES: ReadonlyArray<readonly [RegExp, EdgeStyle]> = [
  [new RegExp(`${START_MARK}-(\\.+)-${END_MARK}`, 'uy'), 'dotted'],
  [new RegExp(`${START_MARK}(-{2,})${END_MARK}`, 'uy'), 'normal'],
  [new RegExp(`${START_MARK}(={2,})${END_MARK}`, 'uy'), 'thick'],
];
/** Lines with the label between the two halves: `-- text -->`, `== text ==>`, `-. text .->`. */
const LABELLED_EDGES: ReadonlyArray<readonly [RegExp, EdgeStyle]> = [
  [new RegExp(`${START_MARK}--\\s+(.+?)\\s+(-{2,}(?:>|[ox]${END_OF_WORD})|-{3,})`, 'uy'), 'normal'],
  [new RegExp(`${START_MARK}==\\s+(.+?)\\s+(={2,}(?:>|[ox]${END_OF_WORD})|={3,})`, 'uy'), 'thick'],
  [new RegExp(`${START_MARK}-\\.\\s+(.+?)\\s+(\\.+-(?:>|[ox]${END_OF_WORD})?)`, 'uy'), 'dotted'],
];
const INVISIBLE_EDGE = /~{3,}/y;

const ENDS: Readonly<Record<string, EdgeEnd>> = { '>': 'arrow', o: 'circle', x: 'cross' };

/** Ends and length of a line from the mark at its start, the number of strokes of its body and the mark at its end. */
function describeLine(style: EdgeStyle, start: string | undefined, strokes: number, mark: string | undefined): Pick<EdgeRead, 'startEnd' | 'end' | 'minLength'> {
  const end: EdgeEnd = mark === undefined ? 'none' : (ENDS[mark] ?? 'none');
  const asked = style === 'dotted' ? strokes : strokes - (end === 'none' ? 2 : 1);
  return {
    ...(start === undefined ? {} : { startEnd: ENDS[start === '<' ? '>' : start] ?? 'none' }),
    end,
    ...(asked > 1 ? { minLength: asked } : {}),
  };
}

function readEdge(c: Cursor, line: number): EdgeRead | null {
  skipSpaces(c);
  if (c.i >= c.s.length) return null;
  EDGE_ID.lastIndex = c.i;
  const idMatch = EDGE_ID.exec(c.s);
  let id: string | undefined;
  if (idMatch) {
    id = idMatch[1];
    c.i += idMatch[0].length;
  }
  let found: Pick<EdgeRead, 'style' | 'startEnd' | 'end' | 'minLength' | 'invisible'> | undefined;
  let label: string | undefined;
  INVISIBLE_EDGE.lastIndex = c.i;
  const hidden = INVISIBLE_EDGE.exec(c.s);
  if (hidden) {
    found = { style: 'normal', end: 'none', invisible: true };
    c.i += hidden[0].length;
  }
  if (!found) {
    for (const [re, style] of PLAIN_EDGES) {
      re.lastIndex = c.i;
      const m = re.exec(c.s);
      if (!m) continue;
      const body = m[2] ?? '';
      const mark = m[3] ?? m[4];
      // Two strokes with nothing after them begin a label: `-- text -->`.
      if (style !== 'dotted' && mark === undefined && body.length < 3) continue;
      found = { style, ...describeLine(style, m[1], body.length, mark) };
      c.i += m[0].length;
      break;
    }
  }
  if (!found) {
    for (const [re, style] of LABELLED_EDGES) {
      re.lastIndex = c.i;
      const m = re.exec(c.s);
      if (!m) continue;
      const closing = m[3] ?? '';
      const last = closing.at(-1) ?? '';
      const mark = last === '>' || last === 'o' || last === 'x' ? last : undefined;
      const strokes = style === 'dotted' ? (closing.match(/\./g) ?? []).length : closing.replace(/[>ox]$/, '').length;
      found = { style, ...describeLine(style, m[1], strokes, mark) };
      label = (m[2] ?? '').trim();
      c.i += m[0].length;
      break;
    }
  }
  if (!found) throw new UrsulaError(`unsupported syntax near '${c.s.slice(c.i, c.i + 12)}'`, 'syntax', line);
  if (label === undefined) {
    const pipe = /\s*\|([^|]*)\|/y;
    pipe.lastIndex = c.i;
    const pm = pipe.exec(c.s);
    if (pm) {
      label = (pm[1] ?? '').trim();
      c.i += pm[0].length;
    }
  }
  const unquoted = label === undefined ? undefined : unwrapMarkdown(label.replace(/^"(.*)"$/s, '$1'));
  const cleaned = unquoted === undefined ? undefined : unquoted.replace(/<br\s*\/?>|\r?\n/gi, ' ').trim();
  return { ...found, ...(id === undefined ? {} : { id }), ...(cleaned ? { label: cleaned } : {}) };
}

function touchNode(st: State, read: NodeRead): void {
  const { id, label, shape, shapeAsked } = read;
  const prior = st.nodes.get(id);
  const lane = st.openLane;
  const text = label === null ? null : splitLabel(label, id);
  if (!prior) {
    if (lane === null && st.implicitLane === null) st.implicitLane = IMPLICIT_LANE;
    st.nodes.set(id, {
      id,
      title: text?.title ?? id,
      lines: text?.lines ?? [],
      shape: shape ?? 'rect',
      ...(shapeAsked === undefined ? {} : { shapeAsked }),
      lane: lane ?? IMPLICIT_LANE,
    });
    return;
  }
  const { shapeAsked: priorAsked, ...rest } = prior;
  const next: NodeDraft = {
    ...rest,
    ...(shape === null && priorAsked !== undefined ? { shapeAsked: priorAsked } : {}),
    ...(shape !== null && shapeAsked !== undefined ? { shapeAsked } : {}),
    ...(text ? { title: text.title, lines: text.lines } : {}),
    ...(shape === null ? {} : { shape }),
    // Membership inside a subgraph wins over earlier loose use.
    lane: lane !== null && prior.lane === IMPLICIT_LANE ? lane : prior.lane,
  };
  st.nodes.set(id, next);
}

function parseSubgraph(rest: string, line: number, st: State): void {
  let id: string;
  let label: string;
  const quoted = /^"([^"]*)"$/.exec(rest);
  const bracket = /^([\p{L}\p{N}_]+)\s*\[\s*(?:"([^"]*)"|([^\]]*))\s*\]$/u.exec(rest);
  if (quoted) {
    id = `lane${st.lanes.length + 1}`;
    label = unwrapMarkdown((quoted[1] ?? '').trim());
  } else if (bracket) {
    id = bracket[1] ?? '';
    label = unwrapMarkdown((bracket[2] ?? bracket[3] ?? '').trim()) || id;
  } else if (/^[\p{L}\p{N}_]+$/u.test(rest)) {
    id = rest;
    label = rest;
  } else {
    throw new UrsulaError(`invalid subgraph header '${rest}'`, 'syntax', line);
  }
  if (id === IMPLICIT_LANE || st.lanes.some((l) => l.id === id)) {
    throw new UrsulaError(`duplicate subgraph '${id}'`, 'syntax', line);
  }
  st.lanes.push({ id, label: label.replace(/<br\s*\/?>|\r?\n/gi, ' ') });
  st.groups.set(id, st.openLane === null ? {} : { parent: st.openLane });
  st.stack.push(id);
  st.openLane = id;
  st.openLine = line;
}

/** Reads `direction X` inside a subgraph. */
function parseGroupDirection(stmt: string, line: number, st: State): void {
  const word = /^direction\s+(\S+)$/.exec(stmt)?.[1];
  const group = st.openLane === null ? undefined : st.groups.get(st.openLane);
  if (group === undefined) return;
  if (word === 'LR') group.direction = 'LR';
  else if (word === 'TD' || word === 'TB') group.direction = 'TD';
  else if (word === 'RL') {
    group.direction = 'LR';
    group.mirror = 'RL';
  } else if (word === 'BT') {
    group.direction = 'TD';
    group.mirror = 'BT';
  } else throw new UrsulaError(`unknown direction '${word ?? ''}'`, 'syntax', line);
}

function parseChain(stmt: string, line: number, st: State): void {
  const c: Cursor = { s: stmt, i: 0 };
  let prev = readGroup(c, line, st);
  if (prev.every((n) => n.propsOnly)) {
    skipSpaces(c);
    if (c.i < c.s.length) throw new UrsulaError(`unexpected text '${c.s.slice(c.i, c.i + 12)}'`, 'syntax', line);
    st.ignored.push(stmt);
    return;
  }
  for (const n of prev) touchNode(st, n);
  for (;;) {
    const edge = readEdge(c, line);
    if (!edge) break;
    const next = readGroup(c, line, st);
    for (const n of next) touchNode(st, n);
    const { id, label, ...ends } = edge;
    let first = true;
    for (const a of prev) {
      for (const b of next) {
        st.edges.push({
          from: a.id,
          to: b.id,
          ...ends,
          ...(first && id !== undefined ? { id } : {}),
          ...(label ? { label } : {}),
        });
        st.edgeLines.push(line);
        first = false;
      }
    }
    prev = next;
  }
  skipSpaces(c);
  if (c.i < c.s.length) {
    throw new UrsulaError(`unexpected text '${c.s.slice(c.i, c.i + 12)}'`, 'syntax', line);
  }
}

function parseHeader(stmt: string, line: number): { direction: 'LR' | 'TD'; mirror?: 'RL' | 'BT'; swimlane: boolean } {
  const m = /^(flowchart|graph|swimlane-beta)(?:\s+(\S+))?$/.exec(stmt);
  if (!m) {
    const word = stmt.split(/\s+/)[0] ?? stmt;
    if (DIAGRAM_TYPES.test(stmt)) {
      throw new UrsulaError(`unsupported diagram type '${word}'`, 'unsupported-diagram', line);
    }
    throw new UrsulaError("expected a 'flowchart' or 'graph' header", 'syntax', line);
  }
  const dir = m[2];
  const swimlane = m[1] === 'swimlane-beta';
  if (dir === undefined) return { direction: 'TD', swimlane };
  if (dir === 'LR') return { direction: 'LR', swimlane };
  if (dir === 'TD' || dir === 'TB') return { direction: 'TD', swimlane };
  if (dir === 'RL') return { direction: 'LR', mirror: 'RL', swimlane };
  if (dir === 'BT') return { direction: 'TD', mirror: 'BT', swimlane };
  throw new UrsulaError(`unknown direction '${dir}'`, 'syntax', line);
}

/** Joins the lines of a quoted text that runs over several lines into one statement line. */
function logicalLines(src: string): Array<{ text: string; line: number }> {
  const out: Array<{ text: string; line: number }> = [];
  const quotes = (t: string): number => t.split('"').length - 1;
  let open: { text: string; line: number } | null = null;
  src.split(/\r?\n/).forEach((row, n) => {
    if (open) {
      open.text += `\n${row}`;
      if (quotes(open.text) % 2 === 0) {
        out.push(open);
        open = null;
      }
      return;
    }
    const text = stripComment(row);
    if (quotes(text) % 2 === 1) open = { text, line: n + 1 };
    else out.push({ text, line: n + 1 });
  });
  if (open) out.push(open);
  return out;
}

export function parse(src: string): Graph {
  const st: State = {
    direction: 'TD',
    lanes: [],
    nodes: new Map(),
    edges: [],
    edgeLines: [],
    ignored: [],
    openLane: null,
    stack: [],
    openLine: 0,
    implicitLane: null,
    groups: new Map(),
    swimlane: false,
  };
  let headerSeen = false;
  for (const { text, line: lineNo } of logicalLines(src)) {
    for (const stmt of splitStatements(text)) {
      if (!headerSeen) {
        const header = parseHeader(stmt, lineNo);
        st.direction = header.direction;
        st.swimlane = header.swimlane;
        if (header.mirror) st.mirror = header.mirror;
        headerSeen = true;
      } else if (DIAGRAM_TYPES.test(stmt)) {
        throw new UrsulaError(`unsupported diagram type '${stmt.split(/\s+/)[0]}'`, 'unsupported-diagram', lineNo);
      } else if (/^direction(\s|$)/.test(stmt) && st.openLane !== null) {
        parseGroupDirection(stmt, lineNo, st);
      } else if (IGNORED.test(stmt)) {
        if (STYLING.test(stmt)) st.ignored.push(stmt);
      } else if (stmt === 'end') {
        if (st.openLane === null) throw new UrsulaError("'end' without a matching 'subgraph'", 'syntax', lineNo);
        st.stack.pop();
        st.openLane = st.stack.at(-1) ?? null;
      } else if (/^subgraph(\s|$)/.test(stmt)) {
        parseSubgraph(stmt.slice('subgraph'.length).trim(), lineNo, st);
      } else {
        parseChain(stmt, lineNo, st);
      }
    }
  }
  if (!headerSeen) throw new UrsulaError("expected a 'flowchart' or 'graph' header", 'syntax', 1);
  if (st.openLane !== null) throw new UrsulaError(`subgraph '${st.openLane}' is never closed`, 'syntax', st.openLine);
  return finish(st);
}

/**
 * Whether the subgraphs are drawn as boxes. In a `flowchart` or `graph` every subgraph is a box. In a `swimlane-beta`
 * they are boxes only when some subgraph holds another, has a direction of its own, or is the end of an edge;
 * otherwise they are bands (lanes).
 */
function needsBoxes(st: State): boolean {
  if (!st.swimlane) return st.lanes.length > 0;
  const ids = new Set(st.lanes.map((l) => l.id));
  return [...st.groups.values()].some((g) => g.parent !== undefined || g.direction !== undefined) || st.edges.some((e) => ids.has(e.from) || ids.has(e.to));
}

/** The graph with every subgraph as a cluster; a subgraph with nothing in it, and the edges that end at it, are left out. */
function finishClusters(st: State): Graph {
  const parentOf = (id: string): string | undefined => st.groups.get(id)?.parent;
  const filled = new Set<string>();
  for (const n of st.nodes.values()) {
    for (let g = n.lane === null || n.lane === IMPLICIT_LANE ? undefined : n.lane; g !== undefined; g = parentOf(g)) filled.add(g);
  }
  const clusters: GraphCluster[] = st.lanes
    .filter((l) => filled.has(l.id))
    .map((l) => {
      const g = st.groups.get(l.id) ?? {};
      const parent = g.parent;
      return { id: l.id, label: l.label, ...(parent === undefined ? {} : { parent }), ...(g.direction === undefined ? {} : { direction: g.direction }), ...(g.mirror === undefined ? {} : { mirror: g.mirror }) };
    });
  const empty = new Set(st.lanes.filter((l) => !filled.has(l.id)).map((l) => l.id));
  const home = { id: IMPLICIT_LANE, label: '' };
  return {
    direction: st.direction,
    ...(st.mirror === undefined ? {} : { mirror: st.mirror }),
    ...(st.ignored.length === 0 ? {} : { ignored: st.ignored }),
    lanes: [home],
    clusters,
    nodes: [...st.nodes.values()].map((n) => ({
      id: n.id,
      title: n.title,
      lines: n.lines,
      shape: n.shape,
      lane: IMPLICIT_LANE,
      ...(n.lane === null || n.lane === IMPLICIT_LANE ? {} : { cluster: n.lane }),
      ...(n.shapeAsked === undefined ? {} : { shapeAsked: n.shapeAsked }),
    })),
    edges: st.edges.filter((e) => !empty.has(e.from) && !empty.has(e.to)),
  };
}

function finish(st: State): Graph {
  if (needsBoxes(st)) {
    // A subgraph named in an edge before it was opened was read as a node; it is a cluster.
    for (const l of st.lanes) st.nodes.delete(l.id);
    return finishClusters(st);
  }
  const nodes = [...st.nodes.values()];
  const used = new Set(nodes.map((n) => n.lane));
  // The implicit lane sits where its first node appears relative to the subgraphs.
  const firstLoose = nodes.findIndex((n) => n.lane === IMPLICIT_LANE);
  const lanes: Lane[] = [];
  const explicit = st.lanes.filter((l) => used.has(l.id));
  if (explicit.length === 0) {
    lanes.push({ id: IMPLICIT_LANE, label: '' });
  } else {
    const looseFirst = firstLoose >= 0 && firstLoose < firstExplicitIndex(nodes, explicit);
    if (used.has(IMPLICIT_LANE) && looseFirst) lanes.push({ id: IMPLICIT_LANE, label: '' });
    lanes.push(...explicit);
    if (used.has(IMPLICIT_LANE) && !looseFirst) lanes.push({ id: IMPLICIT_LANE, label: '' });
  }
  return {
    direction: st.direction,
    ...(st.mirror === undefined ? {} : { mirror: st.mirror }),
    ...(st.ignored.length === 0 ? {} : { ignored: st.ignored }),
    lanes,
    nodes: nodes.map((n) => ({
      id: n.id,
      title: n.title,
      lines: n.lines,
      shape: n.shape,
      lane: n.lane ?? IMPLICIT_LANE,
      ...(n.shapeAsked === undefined ? {} : { shapeAsked: n.shapeAsked }),
    })),
    edges: st.edges,
  };
}

function firstExplicitIndex(nodes: NodeDraft[], explicit: Lane[]): number {
  const ids = new Set(explicit.map((l) => l.id));
  const idx = nodes.findIndex((n) => n.lane !== null && ids.has(n.lane));
  return idx < 0 ? Number.MAX_SAFE_INTEGER : idx;
}
