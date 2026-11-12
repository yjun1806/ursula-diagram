import type { FrontValue } from '../front-matter.ts';
import { createAccessibilityReader } from '../front/accessibility.ts';
import { configSection } from '../front/options.ts';
import type { Compartment, Direction, EdgeEnd, Graph, GraphCluster, GraphEdge, GraphNode } from '../types.ts';
import { UrsulaError } from '../types.ts';

/** Settings of a class diagram that change the drawing. */
export interface ClassConfig {
  /** Each segment of a dotted namespace name is a cluster of its own (default true). */
  hierarchicalNamespaces: boolean;
  /** A class with no attributes or no methods draws no empty band for them (default false). */
  hideEmptyMembersBox: boolean;
}

export const DEFAULT_CLASS_CONFIG: ClassConfig = { hierarchicalNamespaces: true, hideEmptyMembersBox: false };

const LANE = '_';
const NAME = String.raw`(?:` + '`[^`]+`' + String.raw`|[^\s"` + '`' + String.raw`:]+)(?::::[\w-]+)?`;
const REL = String.raw`(?:<\||\*|o|<|\(\))?(?:--|\.\.)(?:\|>|\*|o|>|\(\))?`;
const RELATION = new RegExp(`^(${NAME})(?:\\s+"([^"]*)")?\\s+(${REL})\\s+(?:"([^"]*)"\\s+)?(${NAME})(?:\\s*:\\s*(.*))?$`, 'u');
const CLASS_DECL = new RegExp(
  String.raw`^class\s+(` + '`[^`]+`' + String.raw`|[^\s"` + '`' + String.raw`:{\[<]+)\s*(?:\[\s*"([^"]*)"\s*\])?\s*(?::::[\w-]+)?\s*(?:<<\s*([^>]*?)\s*>>)?\s*(\{)?\s*(\})?\s*$`,
  'u',
);
const ANNOTATION_LINE = /^<<\s*([^>]*?)\s*>>\s*(\S.*)?$/u;
const MEMBER = new RegExp(`^(${NAME})\\s*:(?!:)\\s*(.+)$`, 'u');
const NAMESPACE = /^namespace\s+([^\s["{]+)\s*(?:\[\s*"([^"]*)"\s*\])?\s*\{\s*(\})?\s*$/u;
const NOTE_FOR = new RegExp(`^note\\s+for\\s+(${NAME})\\s+"(.*)"\\s*$`, 'u');
const NOTE = /^note\s+"(.*)"\s*$/u;
const DIRECTION = /^direction\s+(LR|RL|TB|TD|BT)\s*$/u;
const IGNORED = /^(click|link|callback|style|classDef|cssClass)(\s|$)/u;

const START_ENDS: Readonly<Record<string, EdgeEnd>> = { '<|': 'triangle-open', '*': 'diamond-filled', o: 'diamond-open', '<': 'arrow-open', '()': 'circle' };
const FINISH_ENDS: Readonly<Record<string, EdgeEnd>> = { '|>': 'triangle-open', '*': 'diamond-filled', o: 'diamond-open', '>': 'arrow-open', '()': 'circle' };

const isWord = (ch: string | undefined): boolean => ch !== undefined && /[\p{L}\p{N}_]/u.test(ch);

/** `List~List~int~~` becomes `List<List<int>>`. A tilde opens a type argument when a word stands on both sides of it. */
export function genericsOf(text: string): string {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i] as string;
    if (ch !== '~') out += ch;
    else out += isWord(text[i - 1]) && isWord(text[i + 1]) ? '<' : isWord(text[i - 1]) || text[i - 1] === '~' || text[i - 1] === '>' ? '>' : '~';
  }
  return out;
}

const unquote = (name: string): string => {
  const bare = name.replace(/:::[\w-]+$/u, '');
  return bare.startsWith('`') && bare.endsWith('`') ? bare.slice(1, -1) : bare;
};

/** The id of a class: its name without type arguments, quotes and style class. */
const idOf = (name: string): string => unquote(name).replace(/~.*$/u, '');

const stripComment = (line: string): string => (line.trim().startsWith('%%') ? '' : line);

/** The class settings of a front-matter `config` map, overridden by an `%%{init: ...}%%` directive of the source. */
export function readClassConfig(src: string, config?: Record<string, FrontValue>): ClassConfig {
  const out = { ...DEFAULT_CLASS_CONFIG };
  const apply = (section: Record<string, unknown> | undefined): void => {
    if (section === undefined) return;
    if (typeof section['hierarchicalNamespaces'] === 'boolean') out.hierarchicalNamespaces = section['hierarchicalNamespaces'];
    if (typeof section['hideEmptyMembersBox'] === 'boolean') out.hideEmptyMembersBox = section['hideEmptyMembersBox'];
  };
  apply(configSection(config, 'class'));
  for (const found of src.matchAll(/%%\{\s*(?:init|initialize)\s*:\s*([\s\S]*?\})\s*\}%%/gu)) {
    try {
      apply(configSection(JSON.parse((found[1] ?? '').replace(/'/gu, '"')), 'class'));
    } catch {
      // A directive that is not JSON changes nothing.
    }
  }
  return out;
}

interface ClassDraft {
  id: string;
  title: string;
  annotations: string[];
  attributes: string[];
  methods: string[];
  cluster?: string;
}

interface Frame {
  kind: 'namespace' | 'class';
  line: number;
  /** For a namespace: the cluster that is the innermost one inside it. */
  cluster?: string;
  /** For a class: the class being filled. */
  draft?: ClassDraft;
}

const compartmentsOf = (c: ClassDraft, hideEmpty: boolean): Compartment[] => {
  const head: Compartment = { lines: [...c.annotations.map((a) => `«${a}»`), c.title], align: 'center', emphasis: 'title' };
  const body = (lines: string[]): Compartment => ({ lines, align: 'left', emphasis: 'body' });
  const parts = [c.attributes, c.methods].filter((lines) => !hideEmpty || lines.length > 0).map(body);
  return [head, ...parts];
};

const splitNote = (text: string): string[] => text.split(/<br\s*\/?>/iu).map((t) => t.trim()).filter((t) => t !== '');

/** Reads a class diagram into a graph: classes are boxes divided into three bands, relations are lines with marks at their ends. */
export function parseClass(src: string, config: ClassConfig = DEFAULT_CLASS_CONFIG): Graph {
  const rows = src.split(/\r?\n/u);
  const classes = new Map<string, ClassDraft>();
  const clusters = new Map<string, GraphCluster>();
  const notes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const ignored: string[] = [];
  const stack: Frame[] = [];
  const accessibility = createAccessibilityReader();
  let direction: Direction = 'TD';
  let mirror: 'RL' | 'BT' | undefined;
  let header = false;

  const classOf = (name: string): ClassDraft => {
    const id = idOf(name);
    let draft = classes.get(id);
    if (!draft) {
      draft = { id, title: id, annotations: [], attributes: [], methods: [] };
      classes.set(id, draft);
    }
    return draft;
  };
  const innermost = (): string | undefined => {
    for (let i = stack.length - 1; i >= 0; i--) {
      const f = stack[i] as Frame;
      if (f.kind === 'namespace') return f.cluster;
    }
    return undefined;
  };
  const addMember = (draft: ClassDraft, text: string): void => {
    const member = genericsOf(text.trim());
    if (member === '') return;
    (/\(.*\)/u.test(member) ? draft.methods : draft.attributes).push(member);
  };
  const openNamespace = (name: string, label: string | undefined, line: number): string => {
    const parent = stack.map((f) => f.cluster).filter((c): c is string => c !== undefined).at(-1);
    const segments = config.hierarchicalNamespaces ? name.split('.').filter((s) => s !== '') : [name];
    let id = parent;
    segments.forEach((segment, k) => {
      const at = id === undefined ? segment : `${id}.${segment}`;
      const last = k === segments.length - 1;
      const existing = clusters.get(at);
      const shown = last && label !== undefined ? label : segment;
      if (!existing) clusters.set(at, { id: at, label: shown, ...(id === undefined ? {} : { parent: id }) });
      else if (last && label !== undefined) clusters.set(at, { ...existing, label });
      id = at;
    });
    if (id === undefined) throw new UrsulaError('A namespace needs a name.', 'class.namespace', line);
    return id;
  };

  rows.forEach((raw, index) => {
    const line = index + 1;
    const text = stripComment(raw).trim();
    if (text === '') return;
    if (accessibility.insideBlock(text)) return;
    if (!header) {
      if (!/^classDiagram(-v2)?(\s|$)/u.test(text)) throw new UrsulaError(`A class diagram starts with "classDiagram", not "${text}".`, 'class.header', line);
      header = true;
      return;
    }
    if (accessibility.read(text)) return;
    const open = stack.at(-1);
    if (open?.kind === 'class' && open.draft) {
      if (text === '}') {
        stack.pop();
        return;
      }
      const note = ANNOTATION_LINE.exec(text);
      if (note && note[2] === undefined) open.draft.annotations.push(note[1] ?? '');
      else addMember(open.draft, text);
      return;
    }
    if (text === '}') {
      if (open?.kind !== 'namespace') throw new UrsulaError('A "}" closes nothing.', 'class.brace', line);
      stack.pop();
      return;
    }
    const dir = DIRECTION.exec(text);
    if (dir) {
      const d = dir[1] as string;
      direction = d === 'LR' || d === 'RL' ? 'LR' : 'TD';
      if (d === 'RL' || d === 'BT') mirror = d;
      else mirror = undefined;
      return;
    }
    if (IGNORED.test(text)) {
      ignored.push(text);
      return;
    }
    const ns = NAMESPACE.exec(text);
    if (ns) {
      const id = openNamespace(ns[1] as string, ns[2], line);
      if (ns[3] === undefined) stack.push({ kind: 'namespace', line, cluster: id });
      return;
    }
    const decl = CLASS_DECL.exec(text);
    if (decl) {
      const draft = classOf(decl[1] as string);
      const bare = unquote(decl[1] as string);
      draft.title = decl[2] ?? genericsOf(bare);
      if (decl[3] !== undefined) draft.annotations.push(decl[3]);
      const cluster = innermost();
      if (cluster !== undefined) draft.cluster = cluster;
      if (decl[4] !== undefined && decl[5] === undefined) stack.push({ kind: 'class', line, draft });
      return;
    }
    const annotation = ANNOTATION_LINE.exec(text);
    if (annotation && annotation[2] !== undefined) {
      classOf(annotation[2]).annotations.push(annotation[1] ?? '');
      return;
    }
    const noteFor = NOTE_FOR.exec(text);
    if (noteFor) {
      const target = classOf(noteFor[1] as string);
      const lines = splitNote(noteFor[2] ?? '');
      const id = `__note${notes.length + 1}`;
      notes.push({ id, title: lines[0] ?? '', lines: lines.slice(1), shape: 'note', lane: LANE });
      edges.push({ from: id, to: target.id, style: 'dotted', end: 'none' });
      return;
    }
    const note = NOTE.exec(text);
    if (note) {
      const lines = splitNote(note[1] ?? '');
      notes.push({ id: `__note${notes.length + 1}`, title: lines[0] ?? '', lines: lines.slice(1), shape: 'note', lane: LANE });
      return;
    }
    const rel = RELATION.exec(text);
    if (rel) {
      const [, left, fromCount, mark, toCount, right, label] = rel;
      const from = classOf(left as string);
      const to = classOf(right as string);
      const m = /^(<\||\*|o|<|\(\))?(--|\.\.)(\|>|\*|o|>|\(\))?$/u.exec(mark as string);
      const startEnd = m?.[1] === undefined ? undefined : START_ENDS[m[1]];
      const end = m?.[3] === undefined ? 'none' : (FINISH_ENDS[m[3]] ?? 'none');
      edges.push({
        from: from.id,
        to: to.id,
        style: m?.[2] === '..' ? 'dotted' : 'normal',
        end,
        ...(startEnd === undefined ? {} : { startEnd }),
        ...(label === undefined || label.trim() === '' ? {} : { label: genericsOf(label.trim()) }),
        ...(fromCount === undefined ? {} : { startLabel: fromCount }),
        ...(toCount === undefined ? {} : { endLabel: toCount }),
      });
      return;
    }
    const member = MEMBER.exec(text);
    if (member) {
      addMember(classOf(member[1] as string), member[2] as string);
      return;
    }
    throw new UrsulaError(`Unrecognized class diagram statement "${text}".`, 'class.statement', line);
  });

  if (!header) throw new UrsulaError('A class diagram starts with "classDiagram".', 'class.header', 1);
  const unclosed = stack.at(-1);
  if (unclosed) throw new UrsulaError(`The ${unclosed.kind} opened here is never closed.`, 'class.unclosed', unclosed.line);

  const nodes: GraphNode[] = [...classes.values()].map((c) => ({
    id: c.id,
    title: c.title,
    lines: [],
    shape: 'rect',
    lane: LANE,
    ...(c.cluster === undefined ? {} : { cluster: c.cluster }),
    compartments: compartmentsOf(c, config.hideEmptyMembersBox),
  }));
  return {
    direction,
    ...(mirror === undefined ? {} : { mirror }),
    ...(ignored.length === 0 ? {} : { ignored }),
    lanes: [{ id: LANE, label: '' }],
    ...(clusters.size === 0 ? {} : { clusters: [...clusters.values()] }),
    nodes: [...nodes, ...notes],
    edges,
  };
}
