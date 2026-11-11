import type { EdgeStyle, Graph, GraphEdge, Lane } from './types.ts';
import { UrsulaError } from './types.ts';

interface NodeDraft {
  id: string;
  title: string;
  lines: string[];
  lane: string | null;
}

interface State {
  direction: 'LR' | 'TD';
  lanes: Lane[];
  nodes: Map<string, NodeDraft>;
  edges: GraphEdge[];
  openLane: string | null;
  openLine: number;
  implicitLane: string | null;
}

const IMPLICIT_LANE = '_';
const ID = /[\p{L}\p{N}_]+/uy;
const DIAGRAM_TYPES = /^(sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|pie|journey|gitGraph|mindmap|timeline)(\s|$)/;
const IGNORED = /^(classDef|class|style|linkStyle|click|direction)(\s|$)/;
const PLAIN_OPS: ReadonlyArray<readonly [string, EdgeStyle]> = [
  ['-.->', 'dotted'],
  ['-.-', 'dotted'],
  ['-->', 'normal'],
  ['---', 'normal'],
  ['==>', 'thick'],
];
const LABELLED_OPS: ReadonlyArray<readonly [RegExp, EdgeStyle]> = [
  [/--\s+(.+?)\s+(?:-->|---)/y, 'normal'],
  [/==\s+(.+?)\s+==>/y, 'thick'],
  [/-\.\s+(.+?)\s+\.->/y, 'dotted'],
  [/-\.\s+(.+?)\s+\.-(?![>.])/y, 'dotted'],
];

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

function splitLabel(raw: string, fallback: string): { title: string; lines: string[] } {
  const parts = raw
    .split(/<br\s*\/?>/i)
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

const SHAPES: ReadonlyArray<readonly [string, string]> = [
  ['((', '))'],
  ['[', ']'],
  ['(', ')'],
  ['{', '}'],
];

const BAD_SHAPE_STARTS: Record<string, string> = { '[': '[(/\\', '(': '([', '((': '(', '{': '{' };

function readNode(c: Cursor, line: number): { id: string; label: string | null } {
  skipSpaces(c);
  ID.lastIndex = c.i;
  const m = ID.exec(c.s);
  if (!m) throw new UrsulaError(`expected a node id near '${c.s.slice(c.i, c.i + 12)}'`, 'syntax', line);
  const id = m[0];
  c.i += id.length;
  const shape = SHAPES.find(([open]) => c.s.startsWith(open, c.i));
  let label: string | null = null;
  if (shape) {
    const [open, close] = shape;
    c.i += open.length;
    const next = c.s[c.i] ?? '';
    if (next !== '' && BAD_SHAPE_STARTS[open]?.includes(next)) {
      throw new UrsulaError(`unsupported node shape '${open}${next}'`, 'unsupported', line);
    }
    if (next === '"') {
      const end = c.s.indexOf('"', c.i + 1);
      if (end < 0) throw new UrsulaError('unterminated quoted label', 'syntax', line);
      label = c.s.slice(c.i + 1, end);
      c.i = end + 1;
      skipSpaces(c);
      if (!c.s.startsWith(close, c.i)) throw new UrsulaError(`expected '${close}' after quoted label`, 'syntax', line);
      c.i += close.length;
    } else {
      const end = c.s.indexOf(close, c.i);
      if (end < 0) throw new UrsulaError(`missing '${close}'`, 'syntax', line);
      label = c.s.slice(c.i, end);
      c.i = end + close.length;
    }
  }
  const save = c.i;
  skipSpaces(c);
  if (c.s[c.i] === '&') throw new UrsulaError("'&' node lists are not supported", 'unsupported', line);
  if (c.s.startsWith(':::', c.i)) throw new UrsulaError("':::' class shorthand is not supported", 'unsupported', line);
  c.i = save;
  return { id, label };
}

function readEdge(c: Cursor, line: number): { style: EdgeStyle; label?: string } | null {
  skipSpaces(c);
  if (c.i >= c.s.length) return null;
  let style: EdgeStyle | null = null;
  let label: string | undefined;
  const plain = PLAIN_OPS.find(([op]) => c.s.startsWith(op, c.i));
  if (plain) {
    style = plain[1];
    c.i += plain[0].length;
    const pipe = /\s*\|([^|]*)\|/y;
    pipe.lastIndex = c.i;
    const pm = pipe.exec(c.s);
    if (pm) {
      label = (pm[1] ?? '').trim().replace(/^"(.*)"$/, '$1');
      c.i += pm[0].length;
    }
  } else {
    for (const [re, st] of LABELLED_OPS) {
      re.lastIndex = c.i;
      const m = re.exec(c.s);
      if (m) {
        style = st;
        label = (m[1] ?? '').trim().replace(/^"(.*)"$/, '$1');
        c.i += m[0].length;
        break;
      }
    }
  }
  if (!style) throw new UrsulaError(`unsupported syntax near '${c.s.slice(c.i, c.i + 12)}'`, 'syntax', line);
  const cleaned = label === undefined ? undefined : label.replace(/<br\s*\/?>/gi, ' ').trim();
  return cleaned ? { style, label: cleaned } : { style };
}

function touchNode(st: State, id: string, label: string | null): void {
  const prior = st.nodes.get(id);
  const lane = st.openLane;
  const text = label === null ? null : splitLabel(label, id);
  if (!prior) {
    if (lane === null && st.implicitLane === null) st.implicitLane = IMPLICIT_LANE;
    st.nodes.set(id, {
      id,
      title: text?.title ?? id,
      lines: text?.lines ?? [],
      lane: lane ?? IMPLICIT_LANE,
    });
    return;
  }
  const next: NodeDraft = {
    ...prior,
    ...(text ? { title: text.title, lines: text.lines } : {}),
    // Membership inside a subgraph wins over earlier loose use.
    lane: lane !== null && prior.lane === IMPLICIT_LANE ? lane : prior.lane,
  };
  st.nodes.set(id, next);
}

function parseSubgraph(rest: string, line: number, st: State): void {
  if (st.openLane !== null) throw new UrsulaError('nested subgraphs are not supported', 'nested-subgraph', line);
  let id: string;
  let label: string;
  const quoted = /^"([^"]*)"$/.exec(rest);
  const bracket = /^([\p{L}\p{N}_]+)\s*\[\s*(?:"([^"]*)"|([^\]]*))\s*\]$/u.exec(rest);
  if (quoted) {
    id = `lane${st.lanes.length + 1}`;
    label = (quoted[1] ?? '').trim();
  } else if (bracket) {
    id = bracket[1] ?? '';
    label = (bracket[2] ?? bracket[3] ?? '').trim() || id;
  } else if (/^[\p{L}\p{N}_]+$/u.test(rest)) {
    id = rest;
    label = rest;
  } else {
    throw new UrsulaError(`invalid subgraph header '${rest}'`, 'syntax', line);
  }
  if (id === IMPLICIT_LANE || st.lanes.some((l) => l.id === id)) {
    throw new UrsulaError(`duplicate subgraph '${id}'`, 'syntax', line);
  }
  st.lanes.push({ id, label: label.replace(/<br\s*\/?>/gi, ' ') });
  st.openLane = id;
  st.openLine = line;
}

function parseChain(stmt: string, line: number, st: State): void {
  const c: Cursor = { s: stmt, i: 0 };
  let prev = readNode(c, line);
  touchNode(st, prev.id, prev.label);
  for (;;) {
    const edge = readEdge(c, line);
    if (!edge) break;
    const next = readNode(c, line);
    touchNode(st, next.id, next.label);
    st.edges.push({
      from: prev.id,
      to: next.id,
      style: edge.style,
      ...(edge.label ? { label: edge.label } : {}),
    });
    prev = next;
  }
  skipSpaces(c);
  if (c.i < c.s.length) {
    throw new UrsulaError(`unexpected text '${c.s.slice(c.i, c.i + 12)}'`, 'syntax', line);
  }
}

function parseHeader(stmt: string, line: number): 'LR' | 'TD' {
  const m = /^(flowchart|graph)(?:\s+(\S+))?$/.exec(stmt);
  if (!m) {
    const word = stmt.split(/\s+/)[0] ?? stmt;
    if (DIAGRAM_TYPES.test(stmt)) {
      throw new UrsulaError(`unsupported diagram type '${word}'`, 'unsupported-diagram', line);
    }
    throw new UrsulaError("expected a 'flowchart' or 'graph' header", 'syntax', line);
  }
  const dir = m[2];
  if (dir === undefined) return 'TD';
  if (dir === 'LR') return 'LR';
  if (dir === 'TD' || dir === 'TB') return 'TD';
  if (dir === 'RL' || dir === 'BT') {
    throw new UrsulaError(`direction '${dir}' is not supported`, 'unsupported-direction', line);
  }
  throw new UrsulaError(`unknown direction '${dir}'`, 'syntax', line);
}

export function parse(src: string): Graph {
  const st: State = {
    direction: 'TD',
    lanes: [],
    nodes: new Map(),
    edges: [],
    openLane: null,
    openLine: 0,
    implicitLane: null,
  };
  let headerSeen = false;
  const rows = src.split(/\r?\n/);
  for (let n = 0; n < rows.length; n++) {
    const lineNo = n + 1;
    const text = stripComment(rows[n] ?? '');
    for (const stmt of splitStatements(text)) {
      if (!headerSeen) {
        st.direction = parseHeader(stmt, lineNo);
        headerSeen = true;
      } else if (DIAGRAM_TYPES.test(stmt)) {
        throw new UrsulaError(`unsupported diagram type '${stmt.split(/\s+/)[0]}'`, 'unsupported-diagram', lineNo);
      } else if (IGNORED.test(stmt)) {
        continue;
      } else if (stmt === 'end') {
        if (st.openLane === null) throw new UrsulaError("'end' without a matching 'subgraph'", 'syntax', lineNo);
        st.openLane = null;
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

function finish(st: State): Graph {
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
    lanes,
    nodes: nodes.map((n) => ({ id: n.id, title: n.title, lines: n.lines, lane: n.lane ?? IMPLICIT_LANE })),
    edges: st.edges,
  };
}

function firstExplicitIndex(nodes: NodeDraft[], explicit: Lane[]): number {
  const ids = new Set(explicit.map((l) => l.id));
  const idx = nodes.findIndex((n) => n.lane !== null && ids.has(n.lane));
  return idx < 0 ? Number.MAX_SAFE_INTEGER : idx;
}
