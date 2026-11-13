import type { Compartment, EdgeEnd, Graph, GraphCluster, GraphEdge, GraphNode } from '../types.ts';
import { UrsulaError } from '../types.ts';
import { jsonRows } from './json.ts';
import type { ElementMeta, UsecaseModel } from './model.ts';

const ID = '[A-Za-z0-9_]+';
const LANE = { id: '_', label: '' };

type Kind = 'actor' | 'usecase' | 'json' | 'note';

interface Element {
  id: string;
  kind: Kind;
  explicit: boolean;
  /** Label lines; absent until the source gives a label (the identifier is then the label). */
  lines?: string[];
  rect: boolean;
  variant: 'normal' | 'hollow' | 'awesome' | 'icon';
  icon?: string;
  business: boolean;
  stereotype?: string;
  rows?: string[];
  cluster?: string;
  line: number;
}

interface Statement {
  text: string;
  line: number;
}

function fail(message: string, line: number): never {
  throw new UrsulaError(message, 'parse', line);
}

/** Entity codes (`#quot;`, `#40;`) become the character they stand for. */
function decode(text: string): string {
  return text.replace(/#quot;/g, '"').replace(/#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)));
}

/** A single head band whose first `tags` lines are small tags over the name lines. */
function headOf(lines: string[], tags: number): Compartment {
  return { lines, lineEmphasis: lines.map((_, i) => (i < tags ? 'tag' : 'title')), align: 'center', emphasis: 'title' };
}

/** Takes the emphasis markers out of a Markdown string; the text of a plain string or an unquoted label stays as written. */
function unmark(text: string): string {
  return text.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/__([^_]+)__/g, '$1').replace(/\*([^*]+)\*/g, '$1');
}

/** The lines of a label token: `"plain"`, ``"`markdown`"`` or an unquoted text. */
function labelLines(token: string): string[] {
  const t = token.trim();
  let text = t;
  if (t.length >= 2 && t.startsWith('"') && t.endsWith('"')) {
    const inner = t.slice(1, -1);
    text = inner.length >= 2 && inner.startsWith('`') && inner.endsWith('`') ? unmark(inner.slice(1, -1)) : inner;
  }
  return decode(text).split(/\r?\n/).map((l) => l.trim()).filter((l, i, all) => l !== '' || (i > 0 && i < all.length - 1));
}

const joined = (lines: string[]): string => lines.join(' ');

/** Splits the source into statements; a statement goes on while a string or a brace is open. */
function statements(src: string): { items: Statement[]; accTitle?: string; accDescr?: string } {
  const rows = src.split(/\r?\n/);
  const items: Statement[] = [];
  let accTitle: string | undefined;
  let accDescr: string | undefined;
  let pending: Statement | undefined;
  const open = (text: string): boolean => {
    let quotes = 0;
    let depth = 0;
    for (const c of text) {
      if (c === '"') quotes++;
      else if (quotes % 2 === 0 && c === '{') depth++;
      else if (quotes % 2 === 0 && c === '}') depth--;
    }
    return quotes % 2 === 1 || depth > 0;
  };
  for (let n = 0; n < rows.length; n++) {
    const row = rows[n] ?? '';
    const trimmed = row.trim();
    if (pending) {
      pending.text += `\n${row}`;
      if (!open(pending.text)) {
        items.push(pending);
        pending = undefined;
      }
      continue;
    }
    if (trimmed === '' || trimmed.startsWith('%%')) continue;
    const title = /^accTitle\s*:\s*(.*)$/.exec(trimmed);
    if (title) {
      accTitle = (title[1] ?? '').trim();
      continue;
    }
    const block = /^accDescr\s*\{(.*)$/.exec(trimmed);
    if (block) {
      const parts: string[] = [];
      let rest = block[1] ?? '';
      let m = n;
      for (;;) {
        const end = rest.indexOf('}');
        const piece = (end < 0 ? rest : rest.slice(0, end)).trim();
        if (piece !== '') parts.push(piece);
        if (end >= 0) break;
        m++;
        if (m >= rows.length) fail('accDescr block is not closed', n + 1);
        rest = rows[m] ?? '';
      }
      accDescr = parts.join(' ');
      n = m;
      continue;
    }
    const single = /^accDescr\s*:\s*(.*)$/.exec(trimmed);
    if (single) {
      accDescr = (single[1] ?? '').trim();
      continue;
    }
    const st: Statement = { text: trimmed, line: n + 1 };
    if (open(trimmed)) pending = st;
    else items.push(st);
  }
  if (pending) fail('Unterminated string or brace', pending.line);
  return { items, ...(accTitle === undefined ? {} : { accTitle }), ...(accDescr === undefined ? {} : { accDescr }) };
}

interface Scanned {
  id: string;
  label?: string[];
  bracket?: '(' | '[';
  meta: Record<string, string>;
  stereotype?: string;
}

/** Index of the `}` that closes the `{` at `from`, past strings. */
function closeBrace(s: string, from: number, line: number): number {
  let depth = 0;
  let quoted = false;
  for (let i = from; i < s.length; i++) {
    const c = s[i];
    if (c === '"') quoted = !quoted;
    else if (!quoted && c === '{') depth++;
    else if (!quoted && c === '}' && --depth === 0) return i;
  }
  return fail('Metadata block is not closed', line);
}

function readMeta(body: string, line: number): Record<string, string> {
  const out: Record<string, string> = {};
  const parts: string[] = [];
  let cur = '';
  let quoted = false;
  for (const c of body) {
    if (c === '"') quoted = !quoted;
    if (c === ',' && !quoted) {
      parts.push(cur);
      cur = '';
    } else cur += c;
  }
  parts.push(cur);
  for (const part of parts) {
    if (part.trim() === '') continue;
    const m = /^\s*([A-Za-z_]+)\s*:\s*(.*?)\s*$/s.exec(part);
    if (!m) fail(`Cannot read metadata "${part.trim()}"`, line);
    const value = (m?.[2] ?? '').replace(/^"(.*)"$/s, '$1');
    out[m?.[1] ?? ''] = value;
  }
  return out;
}

/**
 * Reads `ID`, a quoted title, an optional `(label)` or `[label]`, an optional `@{ metadata }`, an optional
 * `<<stereotype>>` and an optional `:::classes`, in that order.
 */
function scan(s: string, line: number, quotedId: boolean): Scanned {
  let i = 0;
  const skip = (): void => {
    while (i < s.length && /\s/.test(s[i] ?? '')) i++;
  };
  skip();
  let id: string;
  let label: string[] | undefined;
  let bracket: '(' | '[' | undefined;
  if (s[i] === '"') {
    if (!quotedId) fail('A quoted name is not allowed here', line);
    const end = s.indexOf('"', i + 1);
    if (end < 0) fail('Unterminated string', line);
    label = labelLines(s.slice(i, end + 1));
    id = joined(label).replace(/\W/g, '_');
    i = end + 1;
  } else {
    const m = new RegExp(`^${ID}`).exec(s.slice(i));
    if (!m) return fail(`Expected an identifier, found "${s.slice(i, i + 12)}"`, line);
    id = m[0];
    i += id.length;
    skip();
    if (s[i] === '(' || s[i] === '[') {
      bracket = s[i] as '(' | '[';
      const close = bracket === '(' ? ')' : ']';
      let j = i + 1;
      while (s[j] === ' ' || s[j] === '\t') j++;
      let content: string;
      let after: number;
      if (s[j] === '"') {
        const end = s.indexOf('"', j + 1);
        if (end < 0) fail('Unterminated string', line);
        content = s.slice(j, end + 1);
        after = end + 1;
        while (s[after] === ' ' || s[after] === '\t') after++;
        if (s[after] !== close) fail(`Expected "${close}" after the label`, line);
      } else {
        after = s.indexOf(close, j);
        if (after < 0) fail(`Expected "${close}" after the label`, line);
        content = s.slice(j, after);
      }
      label = labelLines(content);
      i = after + 1;
    }
  }
  skip();
  let meta: Record<string, string> = {};
  if (s.startsWith('@{', i)) {
    const end = closeBrace(s, i + 1, line);
    meta = readMeta(s.slice(i + 2, end), line);
    i = end + 1;
    skip();
  }
  let stereotype: string | undefined;
  if (s.startsWith('<<', i)) {
    const end = s.indexOf('>>', i + 2);
    if (end < 0) fail('Stereotype is not closed with ">>"', line);
    stereotype = s.slice(i + 2, end).trim();
    i = end + 2;
  }
  if (s.startsWith(':::', i)) {
    const m = /^:::[\w-]+(?:,[\w-]+)*/.exec(s.slice(i));
    if (!m) fail('Expected a class name after ":::"', line);
    i += m?.[0].length ?? 0;
  }
  skip();
  if (i < s.length) fail(`Unexpected text "${s.slice(i, i + 20)}"`, line);
  return { id, ...(label === undefined ? {} : { label }), ...(bracket === undefined ? {} : { bracket }), meta, ...(stereotype === undefined ? {} : { stereotype }) };
}

interface Operator {
  start?: EdgeEnd;
  end: EdgeEnd;
  /** The arrow reads from the right-hand endpoint to the left-hand one. */
  reversed?: true;
  dashes: number;
}

function operatorOf(token: string): Operator {
  const dashes = (token.match(/-/g) ?? []).length;
  if (token.startsWith('<')) return { end: 'arrow', reversed: true, dashes };
  if (token.endsWith('|>')) return { end: 'triangle-open', dashes };
  if (token.endsWith('>')) return { end: 'arrow', dashes };
  if (token.endsWith('o') && token.startsWith('-')) return { end: 'circle', dashes };
  if (token.endsWith('x') && token.startsWith('-')) return { end: 'cross', dashes };
  if (token.startsWith('o')) return { start: 'circle', end: 'none', dashes };
  if (token.startsWith('x')) return { start: 'cross', end: 'none', dashes };
  return { end: 'none', dashes };
}

interface Link {
  from: string;
  to: string;
  op: string;
  kind: 'association' | 'include' | 'extend' | 'generalization';
  edge: GraphEdge;
  line: number;
}

const RIGHT = String.raw`(-{2,}>|-{2,}o|-{2,}x|-{2,})`;
const PLAIN = new RegExp(String.raw`^(${ID})\s+(?:(${ID})@)?(<-{2,}|-{2,}>|-{2,}\|>|-{2,}o|o-{2,}|-{2,}x|x-{2,}|-{2,})\s+(${ID})$`);
const LABELLED = new RegExp(String.raw`^(${ID})\s+(?:(${ID})@)?(<--|--|o--|x--)\s+("[\s\S]*?"|[^"]+?)\s+${RIGHT}\s+(${ID})$`);
const INCLUDE = new RegExp(String.raw`^(${ID})\s+(?:(${ID})@)?\.\.>\s*:\s*(include|extend)\s+(${ID})$`);

/** Reads a usecase diagram into the graph the layered engine draws. */
export function parseUsecase(src: string): UsecaseModel {
  const { items, accTitle, accDescr } = statements(src);
  const head = items[0];
  if (!head || head.text.split(/[\s;]+/)[0] !== 'usecase-beta') fail('A usecase diagram starts with "usecase-beta"', head?.line ?? 1);

  const elements = new Map<string, Element>();
  const boundaries = new Map<string, GraphCluster & { line: number }>();
  const links: Link[] = [];
  const notes: Array<{ target: string; lines: string[]; line: number }> = [];
  const edgeIds = new Set<string>();
  const ignored: string[] = [];
  const packages = new Set<string>();
  let direction: Graph['direction'] = 'LR';
  let mirror: Graph['mirror'];

  const claim = (id: string, line: number): void => {
    if (boundaries.has(id)) fail(`"${id}" is already a system boundary`, line);
  };
  const ensure = (id: string, line: number): Element => {
    claim(id, line);
    let e = elements.get(id);
    if (!e) {
      e = { id, kind: 'usecase', explicit: false, rect: false, variant: 'normal', business: false, line };
      elements.set(id, e);
    }
    return e;
  };

  const addElement = (kind: 'actor' | 'usecase', s: string, line: number, cluster: string | undefined): void => {
    const sc = scan(s, line, kind === 'usecase');
    const e = ensure(sc.id, line);
    if (e.explicit && e.kind !== kind) fail(`"${sc.id}" is declared as both an actor and a use case`, line);
    if (e.explicit && e.cluster !== undefined && cluster !== undefined && e.cluster !== cluster) fail(`"${sc.id}" is in two system boundaries`, line);
    e.kind = kind;
    e.explicit = true;
    if (sc.label) e.lines = sc.label;
    if (sc.bracket) e.rect = sc.bracket === '[';
    if (sc.stereotype !== undefined) e.stereotype = sc.stereotype;
    if (cluster !== undefined) e.cluster = cluster;
    applyMeta(e, sc.meta, line);
  };

  const applyMeta = (e: Element, meta: Record<string, string>, line: number): void => {
    for (const [key, value] of Object.entries(meta)) {
      if (key === 'business') {
        if (value !== 'true' && value !== 'false') fail('business must be true or false', line);
        e.business = value === 'true';
      } else if (key === 'type' && e.kind === 'actor') {
        if (value !== 'normal' && value !== 'hollow' && value !== 'awesome') fail(`Unknown actor type "${value}"`, line);
        e.variant = value;
      } else if (key === 'icon' && e.kind === 'actor') {
        e.icon = value;
        e.variant = 'icon';
      } else fail(`Metadata "${key}" is not allowed on ${e.kind === 'actor' ? 'an actor' : 'a use case'}`, line);
    }
    if (e.variant === 'icon' && (e.business || e.icon === undefined)) fail('An icon actor cannot be a business element or have a type', line);
    if (e.business && (e.variant === 'awesome' || (e.kind === 'usecase' && e.rect))) fail('This element cannot be a business element', line);
  };

  let inside: string | undefined;
  for (const st of items.slice(1)) {
    const { text, line } = st;
    const word = /^(\w+)/.exec(text)?.[1] ?? '';
    if (inside !== undefined) {
      if (text === 'end') {
        inside = undefined;
      } else if (word === 'actor' && /^actor\s/.test(text)) addElement('actor', text.slice(5), line, inside);
      else if (/^(systemBoundary|note|json|direction|class|classDef|style)\b/.test(text) || PLAIN.test(text) || INCLUDE.test(text)) {
        fail('A system boundary holds only actor and use case declarations', line);
      } else addElement('usecase', text, line, inside);
      continue;
    }
    if (text === 'end') fail('"end" without a system boundary', line);
    if (/^direction\s/.test(text)) {
      const d = /^direction\s+(TD|TB|BT|LR|RL)$/.exec(text)?.[1];
      if (!d) fail('direction takes TD, TB, BT, LR or RL', line);
      direction = d === 'LR' || d === 'RL' ? 'LR' : 'TD';
      mirror = d === 'RL' || d === 'BT' ? d : undefined;
    } else if (/^(classDef|class|style)\s/.test(text)) {
      ignored.push(word);
    } else if (/^systemBoundary\s/.test(text)) {
      const sc = scan(text.slice('systemBoundary'.length), line, true);
      claim(sc.id, line);
      if (elements.has(sc.id) || boundaries.has(sc.id)) fail(`"${sc.id}" is already used`, line);
      for (const [k, v] of Object.entries(sc.meta)) {
        if (k !== 'type' || (v !== 'rect' && v !== 'package')) fail(`Boundary metadata "${k}: ${v}" is not allowed`, line);
        if (v === 'package') packages.add(sc.id);
      }
      boundaries.set(sc.id, { id: sc.id, label: joined(sc.label ?? [sc.id]), line });
      inside = sc.id;
    } else if (/^actor\s/.test(text)) { addElement('actor', text.slice(5), line, undefined); }
    else if (/^note\s+for\s/.test(text)) {
      const m = new RegExp(`^note\\s+for\\s+(${ID})\\s+("[\\s\\S]*")$`).exec(text);
      if (!m) fail('A note reads: note for <id> "<text>"', line);
      notes.push({ target: m?.[1] ?? '', lines: labelLines(m?.[2] ?? ''), line });
    } else if (/^json\s/.test(text)) {
      const m = new RegExp(`^json\\s+(${ID})\\s*@\\{`).exec(text);
      if (!m) fail('A JSON table reads: json <id>@{ ... }', line);
      const id = m?.[1] ?? '';
      const open = text.indexOf('@{') + 1;
      const end = closeBrace(text, open, line);
      const rest = text.slice(end + 1).trim();
      if (rest !== '' && !/^:::[\w-]+(?:,[\w-]+)*$/.test(rest)) fail(`Unexpected text "${rest.slice(0, 20)}"`, line);
      const e = ensure(id, line);
      if (e.explicit) fail(`"${id}" is already declared`, line);
      e.kind = 'json';
      e.explicit = true;
      e.rows = jsonRows(text.slice(open, end + 1), line);
    } else if (new RegExp(`^${ID}@\\{`).test(text)) {
      const id = /^[^@]+/.exec(text)?.[0] ?? '';
      const open = text.indexOf('@{') + 1;
      const end = closeBrace(text, open, line);
      if (text.slice(end + 1).trim() !== '') fail('Unexpected text after the metadata block', line);
      const body = text.slice(open + 1, end);
      if (edgeIds.has(id)) continue;
      const e = elements.get(id);
      const b = boundaries.get(id);
      if (e && (e.kind === 'actor' || e.kind === 'usecase')) applyMeta(e, readMeta(body, line), line);
      else if (b) {
        const meta = readMeta(body, line);
        for (const [k, v] of Object.entries(meta)) {
          if (k !== 'type' || (v !== 'rect' && v !== 'package')) fail(`Boundary metadata "${k}: ${v}" is not allowed`, line);
          if (v === 'package') packages.add(id);
          else packages.delete(id);
        }
      } else fail(`"${id}" is not declared`, line);
    } else {
      const inc = INCLUDE.exec(text);
      const plain = PLAIN.exec(text);
      const lab = plain ? null : LABELLED.exec(text);
      if (inc || plain || lab) {
        let from: string;
        let to: string;
        let id: string | undefined;
        let edge: Omit<GraphEdge, 'from' | 'to'>;
        let kind: Link['kind'] = 'association';
        let opText: string;
        if (inc) {
          from = inc[1] ?? '';
          to = inc[4] ?? '';
          id = inc[2];
          kind = inc[3] === 'include' ? 'include' : 'extend';
          opText = '..>';
          edge = { style: 'dotted', end: 'arrow-open', label: `«${inc[3] ?? ''}»` };
        } else {
          const left = plain ? plain[3] ?? '' : lab?.[3] ?? '';
          const right = plain ? left : lab?.[5] ?? '';
          const a = plain ? from2(plain[1], plain[4]) : from2(lab?.[1], lab?.[6]);
          id = plain ? plain[2] : lab?.[2];
          opText = plain ? left : `${left} … ${right}`;
          const op = plain ? operatorOf(left) : combine(operatorOf(left), operatorOf(right));
          if (op.end === 'triangle-open') kind = 'generalization';
          const label = lab ? joined(labelLines(lab[4] ?? '')) : undefined;
          from = op.reversed ? a[1] : a[0];
          to = op.reversed ? a[0] : a[1];
          edge = {
            style: 'normal',
            end: op.end,
            ...(op.start === undefined ? {} : { startEnd: op.start }),
            ...(label === undefined || label === '' ? {} : { label }),
            ...(op.dashes > 2 ? { minLength: op.dashes - 1 } : {}),
          };
        }
        if (id !== undefined) {
          if (edgeIds.has(id) || elements.has(id) || boundaries.has(id)) fail(`"${id}" is already used`, line);
          edgeIds.add(id);
          edge = { ...edge, id };
        }
        ensure(from, line);
        ensure(to, line);
        links.push({ from, to, op: opText, kind, edge: { from, to, ...edge }, line });
      } else {
        addElement('usecase', text, line, undefined);
      }
    }
  }
  if (inside !== undefined) fail(`System boundary "${inside}" is not closed with "end"`, items.at(-1)?.line ?? 1);

  // Kinds are known only now, since an endpoint may be declared after the relationship that names it.
  const kindOf = (id: string): Kind => elements.get(id)?.kind ?? 'usecase';
  const isUsecase = (id: string): boolean => kindOf(id) === 'usecase';
  for (const l of links) {
    const a = kindOf(l.from);
    const b = kindOf(l.to);
    if (a === 'note' || b === 'note') fail('A note is attached with "note for"', l.line);
    if ((l.kind === 'include' || l.kind === 'extend') && !(isUsecase(l.from) && isUsecase(l.to))) fail(`${l.kind} needs use cases at both ends`, l.line);
    if (l.kind === 'generalization' && a !== b) fail('Generalization joins two actors or two use cases', l.line);
    if ((a === 'json' || b === 'json') && (l.kind !== 'association' || l.edge.end === 'circle' || l.edge.end === 'cross' || l.edge.startEnd !== undefined)) {
      fail('A JSON table takes only plain association lines', l.line);
    }
  }
  for (const n of notes) {
    const t = elements.get(n.target);
    if (!t || (t.kind !== 'actor' && t.kind !== 'usecase')) fail(`A note can only target an actor or a use case, not "${n.target}"`, n.line);
  }

  const nodes: GraphNode[] = [];
  const meta = new Map<string, ElementMeta>();
  const used = new Set(elements.keys());
  for (const e of elements.values()) {
    const lines = e.lines ?? [e.id];
    const stereo = e.stereotype === undefined ? [] : [`«${e.stereotype}»`];
    const m: ElementMeta = {
      kind: e.kind,
      ...(e.kind === 'actor' ? { variant: e.variant } : {}),
      ...(e.icon === undefined ? {} : { icon: e.icon }),
      ...(e.business ? { business: true } : {}),
      ...(e.stereotype === undefined ? {} : { stereotype: e.stereotype }),
    };
    meta.set(e.id, m);
    if (e.kind === 'json') {
      nodes.push({
        id: e.id,
        title: e.id,
        lines: [],
        shape: 'rect',
        lane: LANE.id,
        ...(e.cluster === undefined ? {} : { cluster: e.cluster }),
        compartments: [{ lines: [e.id] }, { lines: e.rows ?? [], align: 'left' }],
      });
      continue;
    }
    // An actor shows one line of text, so its stereotype and label lines share it.
    const actor = e.kind === 'actor';
    const all = actor ? [joined([...stereo, ...lines])] : [...stereo, ...lines];
    nodes.push({
      id: e.id,
      title: all[0] ?? e.id,
      lines: all.slice(1),
      shape: actor ? 'actor' : e.rect ? 'rect' : 'ellipse',
      lane: LANE.id,
      ...(e.cluster === undefined ? {} : { cluster: e.cluster }),
      // A box can hold the stereotype as a small tag line over its name; an ellipse has no band to put it in.
      ...(!actor && e.rect && stereo.length > 0 ? { compartments: [headOf(all, stereo.length)] } : {}),
    });
  }
  // Lines from one actor to use cases that end alike share a trunk that splits at a dot, when no mark stands at the actor.
  const trunked = (l: Link): GraphEdge => {
    const actorEnd = kindOf(l.from) === 'actor' ? 'from' : kindOf(l.to) === 'actor' ? 'to' : undefined;
    const mark = actorEnd === 'from' ? l.edge.startEnd : l.edge.end;
    const plain = mark === undefined || mark === 'none';
    return l.kind === 'association' && actorEnd !== undefined && plain && isUsecase(actorEnd === 'from' ? l.to : l.from) ? { ...l.edge, trunk: { end: actorEnd, kind: `actor|${l.edge.end ?? 'arrow'}`, dot: true } } : l.edge;
  };
  const noteEdges: GraphEdge[] = [];
  for (const n of notes) {
    let id = `${n.target}__note`;
    for (let k = 2; used.has(id); k++) id = `${n.target}__note${k}`;
    used.add(id);
    const target = elements.get(n.target);
    nodes.push({
      id,
      title: n.lines[0] ?? '',
      lines: n.lines.slice(1),
      shape: 'note',
      lane: LANE.id,
      ...(target?.cluster === undefined ? {} : { cluster: target.cluster }),
    });
    meta.set(id, { kind: 'note' });
    noteEdges.push({ from: id, to: n.target, style: 'dotted', end: 'none' });
  }
  const clusters: GraphCluster[] = [...boundaries.values()].map(({ id, label }) => ({ id, label }));
  const graph: Graph = {
    direction,
    ...(mirror === undefined ? {} : { mirror }),
    ...(ignored.length === 0 ? {} : { ignored }),
    lanes: [LANE],
    ...(clusters.length === 0 ? {} : { clusters }),
    nodes,
    edges: [...links.map(trunked), ...noteEdges],
  };
  return { graph, meta, packages, ...(accTitle === undefined || accTitle === '' ? {} : { accTitle }), ...(accDescr === undefined ? {} : { accDescr }) };
}

function from2(a: string | undefined, b: string | undefined): [string, string] {
  return [a ?? '', b ?? ''];
}

/** The operator of a labelled line: the left token can start a mark, the right token can end one. */
function combine(left: Operator, right: Operator): Operator {
  const reversed = left.reversed === true;
  return {
    ...(left.start === undefined ? {} : { start: left.start }),
    end: reversed ? 'arrow' : right.end,
    ...(reversed ? { reversed: true as const } : {}),
    dashes: right.dashes,
  };
}
