import { createAccessibilityReader } from '../front/accessibility.ts';
import { UrsulaError } from '../types.ts';
import type { Direction, Graph, GraphCluster, GraphEdge, GraphNode } from '../types.ts';

export interface StateParsed {
  graph: Graph;
  /** Text of an `accTitle:` line, when the source has one. */
  accTitle?: string;
}

const LANE = '_';

/** A statement of the source; a composite state carries the statements between its braces. */
interface Item {
  no: number;
  text: string;
  /** Lines of a multi-line note. */
  body?: string[];
  block?: Item[];
}

type Kind = 'choice' | 'fork' | 'join';

interface NodeDraft {
  id: string;
  cluster: string | undefined;
  shape?: GraphNode['shape'];
}

const IGNORED = /^(classDef|class|style|click|cssClass|link|callback)\b/;
const ID = '[^\\s:{}"<>]+';
const TOKEN = new RegExp(`^(\\[\\*\\]|${ID}?)(?::::${ID})?$`);

const stripClass = (token: string): string => token.replace(/:::[^\s:]+$/, '');

/** Splits the source into statements: comments, blank lines and accessibility lines are gone, braces nest, notes gather their text. */
function readItems(src: string): { items: Item[]; accTitle: string | undefined } {
  const rows = src.split(/\r?\n/);
  const acc = createAccessibilityReader();
  const root: Item[] = [];
  const stack: Item[][] = [root];
  let header = false;
  for (let i = 0; i < rows.length; i++) {
    const no = i + 1;
    const raw = rows[i] ?? '';
    if (acc.insideBlock(raw)) continue;
    const text = raw.replace(/%%.*$/, '').trim();
    if (text === '') continue;
    if (!header) {
      if (!/^stateDiagram(-v2)?$/.test(text)) throw new UrsulaError(`expected "stateDiagram" or "stateDiagram-v2" but found "${text}"`, 'state-header', no);
      header = true;
      continue;
    }
    if (acc.read(text)) continue;
    const top = stack[stack.length - 1] as Item[];
    if (text === '}') {
      if (stack.length === 1) throw new UrsulaError('"}" has no matching "{"', 'state-brace', no);
      stack.pop();
      continue;
    }
    const open = /^state\s+(.+?)\s*\{$/.exec(text);
    if (open !== null) {
      const block: Item[] = [];
      top.push({ no, text: `state ${open[1] as string}`, block });
      stack.push(block);
      continue;
    }
    if (/^note\s+(left|right)\s+of\s+\S+\s*$/.test(text)) {
      const body: string[] = [];
      let closed = false;
      for (i++; i < rows.length; i++) {
        const line = (rows[i] ?? '').trim();
        if (/^end\s+note$/.test(line)) {
          closed = true;
          break;
        }
        if (line !== '') body.push(line);
      }
      if (!closed) throw new UrsulaError('note is not closed with "end note"', 'state-note', no);
      top.push({ no, text, body });
      continue;
    }
    top.push({ no, text });
  }
  if (!header) throw new UrsulaError('expected "stateDiagram" or "stateDiagram-v2"', 'state-header', 1);
  if (stack.length > 1) throw new UrsulaError('"{" is never closed', 'state-brace', rows.length);
  return { items: root, accTitle: acc.title };
}

const unquote = (s: string): string => (s.startsWith('"') && s.endsWith('"') ? s.slice(1, -1) : s);

/** Ids that open a block anywhere in the source: they are composite states and stand as cluster boxes. */
function compositeIds(items: Item[], out: Map<string, string | undefined> = new Map()): Map<string, string | undefined> {
  for (const it of items) {
    if (it.block === undefined) continue;
    const named = /^state\s+"(.*)"\s+as\s+(\S+)$/.exec(it.text);
    const id = named === null ? it.text.replace(/^state\s+/, '') : (named[2] as string);
    out.set(id, named === null ? undefined : (named[1] as string));
    compositeIds(it.block, out);
  }
  return out;
}

function directionOf(word: string, no: number): { direction: Direction; mirror?: 'RL' | 'BT' } {
  switch (word.toUpperCase()) {
    case 'TB':
    case 'TD':
      return { direction: 'TD' };
    case 'LR':
      return { direction: 'LR' };
    case 'RL':
      return { direction: 'LR', mirror: 'RL' };
    case 'BT':
      return { direction: 'TD', mirror: 'BT' };
    default:
      throw new UrsulaError(`unknown direction "${word}"`, 'state-direction', no);
  }
}

export function parseState(src: string): StateParsed {
  const { items, accTitle } = readItems(src);
  const composites = compositeIds(items);
  const nodes = new Map<string, NodeDraft>();
  const labels = new Map<string, string>();
  const descs = new Map<string, string[]>();
  const kinds = new Map<string, Kind>();
  const edges: GraphEdge[] = [];
  const clusters = new Map<string, GraphCluster>();
  const notes: { id: string; target: string; side: 'left' | 'right'; lines: string[]; cluster: string | undefined }[] = [];
  const ignored: string[] = [];
  let top: { direction: Direction; mirror?: 'RL' | 'BT' } = { direction: 'TD' };

  /** The id a token stands for in `scope`; creates the state on first mention. */
  const ref = (token: string, scope: string | undefined, role: 'from' | 'to' | 'plain', no: number): string => {
    const m = TOKEN.exec(token);
    if (m === null) throw new UrsulaError(`cannot read "${token}" as a state`, 'state-name', no);
    const id = stripClass(token);
    if (id === '[*]') {
      if (role === 'plain') throw new UrsulaError('"[*]" needs a transition', 'state-name', no);
      const mark = role === 'from' ? 'start' : 'end';
      const key = `[*]${mark}:${scope ?? ''}`;
      if (!nodes.has(key)) nodes.set(key, { id: key, cluster: scope, shape: mark === 'start' ? 'start-dot' : 'end-dot' });
      return key;
    }
    if (!composites.has(id) && !nodes.has(id)) nodes.set(id, { id, cluster: scope });
    return id;
  };

  const describe = (id: string, text: string): void => {
    if (composites.has(id)) labels.set(id, text);
    else descs.set(id, [...(descs.get(id) ?? []), text]);
  };

  const walk = (list: Item[], scope: string | undefined): void => {
    for (const it of list) statement(it, scope);
  };

  const statement = (it: Item, scope: string | undefined): void => {
    const { text, no } = it;
    let m: RegExpExecArray | null;
    if ((m = /^direction\s+(\S+)$/.exec(text)) !== null) {
      const d = directionOf(m[1] as string, no);
      if (scope === undefined) top = d;
      else {
        const c = clusters.get(scope);
        if (c !== undefined) clusters.set(scope, { ...c, direction: d.direction, ...(d.mirror === undefined ? {} : { mirror: d.mirror }) });
      }
      return;
    }
    if (IGNORED.test(text)) {
      ignored.push(text);
      return;
    }
    if (it.block !== undefined || /^state\s/.test(text)) {
      stateStatement(it, scope);
      return;
    }
    if ((m = /^note\s+(left|right)\s+of\s+(\S+?)\s*(?::\s*(.*))?$/.exec(text)) !== null) {
      const target = ref(m[2] as string, scope, 'plain', no);
      const lines = it.body ?? [(m[3] ?? '').trim()];
      if (lines.length === 0 || lines.every((l) => l === '')) throw new UrsulaError('a note needs text', 'state-note', no);
      notes.push({ id: `note:${notes.length + 1}`, target, side: m[1] as 'left' | 'right', lines, cluster: scope });
      return;
    }
    const arrow = text.indexOf('-->');
    if (arrow >= 0) {
      const left = text.slice(0, arrow).trim();
      const rest = text.slice(arrow + 3).trim();
      const colon = rest.search(/(?<!:):(?!:)/);
      const right = (colon < 0 ? rest : rest.slice(0, colon)).trim();
      const label = colon < 0 ? '' : rest.slice(colon + 1).trim();
      if (left === '' || right === '') throw new UrsulaError('a transition needs a state on both sides of "-->"', 'state-transition', no);
      const from = ref(left, scope, 'from', no);
      const to = ref(right, scope, 'to', no);
      edges.push({ from, to, style: 'normal', end: 'arrow', ...(label === '' ? {} : { label }) });
      return;
    }
    if ((m = /^(\S+?)\s*(?<!:):(?!:)\s*(.*)$/.exec(text)) !== null) {
      const id = ref(m[1] as string, scope, 'plain', no);
      if ((m[2] as string).trim() !== '') describe(id, (m[2] as string).trim());
      return;
    }
    if (TOKEN.test(text) && text !== '[*]') {
      ref(text, scope, 'plain', no);
      return;
    }
    throw new UrsulaError(`cannot read "${text}"`, 'state-statement', no);
  };

  const stateStatement = (it: Item, scope: string | undefined): void => {
    const { text, no } = it;
    let m: RegExpExecArray | null;
    let id: string;
    if ((m = /^state\s+"(.*)"\s+as\s+(\S+)$/.exec(text)) !== null) {
      id = m[2] as string;
      labels.set(id, m[1] as string);
      if (it.block === undefined) ref(id, scope, 'plain', no);
    } else if ((m = /^state\s+(\S+)\s+<<\s*(choice|fork|join)\s*>>$/.exec(text)) !== null) {
      id = m[1] as string;
      kinds.set(id, m[2] as Kind);
      ref(id, scope, 'plain', no);
    } else if ((m = /^state\s+(\S+)$/.exec(text)) !== null) {
      id = m[1] as string;
      if (it.block === undefined) ref(id, scope, 'plain', no);
    } else throw new UrsulaError(`cannot read "${text}"`, 'state-statement', no);
    if (it.block === undefined) return;
    const drafted = clusters.get(id);
    if (drafted === undefined) clusters.set(id, { id, label: '', ...(scope === undefined ? {} : { parent: scope }) });
    const parts: Item[][] = [[]];
    for (const inner of it.block) {
      if (inner.block === undefined && /^-{2,}$/.test(inner.text)) parts.push([]);
      else (parts[parts.length - 1] as Item[]).push(inner);
    }
    if (parts.length === 1) {
      walk(it.block, id);
      return;
    }
    parts.forEach((part, i) => {
      const region = `${id}:region${i + 1}`;
      clusters.set(region, { id: region, label: '', parent: id });
      walk(part, region);
    });
  };

  walk(items, undefined);

  // A composite state with no state inside draws as a plain state.
  const alive = new Set<string>();
  const parentOf = (id: string): string | undefined => clusters.get(id)?.parent;
  for (const n of nodes.values()) for (let c = n.cluster; c !== undefined && !alive.has(c); c = parentOf(c)) alive.add(c);
  for (const n of notes) for (let c = n.cluster; c !== undefined && !alive.has(c); c = parentOf(c)) alive.add(c);
  const dead = [...clusters.keys()].filter((id) => !alive.has(id));
  const deadComposites = dead.filter((id) => composites.has(id));
  const finished: GraphNode[] = [];
  const titleOf = (id: string): string => labels.get(id) ?? id;
  for (const n of nodes.values()) {
    const kind = kinds.get(n.id);
    const shape = n.shape ?? (kind === 'choice' ? 'diamond' : kind !== undefined ? 'bar' : 'round');
    const bare = n.shape !== undefined || kind !== undefined;
    finished.push({
      id: n.id,
      title: bare ? '' : titleOf(n.id),
      lines: bare ? [] : (descs.get(n.id) ?? []),
      shape,
      lane: LANE,
      ...(n.cluster === undefined ? {} : { cluster: n.cluster }),
    });
  }
  for (const id of deadComposites) {
    const cluster = parentOf(id);
    finished.push({ id, title: titleOf(id), lines: [], shape: 'round', lane: LANE, ...(cluster === undefined ? {} : { cluster }) });
  }
  const boxes = new Set(finished.map((n) => n.id));
  for (const n of notes) {
    // A note stands beside its state, on the side it names. A note on a composite state that is drawn as a box around others has no box to stand beside, so it is joined by a line.
    const beside = boxes.has(n.target);
    finished.push({ id: n.id, title: '', lines: n.lines, shape: 'note', lane: LANE, ...(n.cluster === undefined ? {} : { cluster: n.cluster }), ...(beside ? { attach: { to: n.target, side: n.side } } : {}) });
    if (!beside) edges.push(n.side === 'left' ? { from: n.id, to: n.target, style: 'dotted', end: 'none' } : { from: n.target, to: n.id, style: 'dotted', end: 'none' });
  }
  const liveClusters = [...clusters.values()]
    .filter((c) => alive.has(c.id))
    .map((c) => ({ ...c, label: c.label === '' && composites.has(c.id) ? titleOf(c.id) : c.label }));
  const graph: Graph = {
    direction: top.direction,
    ...(top.mirror === undefined ? {} : { mirror: top.mirror }),
    ...(ignored.length === 0 ? {} : { ignored }),
    lanes: [{ id: LANE, label: '' }],
    ...(liveClusters.length === 0 ? {} : { clusters: liveClusters }),
    nodes: finished,
    edges,
  };
  return { graph, ...(accTitle === undefined || accTitle === '' ? {} : { accTitle }) };
}
