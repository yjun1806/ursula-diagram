import type { FrontValue } from '../front-matter.ts';
import { createAccessibilityReader } from '../front/accessibility.ts';
import { UrsulaError } from '../types.ts';

export type Sourcing = 'build' | 'buy' | 'outsource' | 'market';

/** One thing placed on the map: a component, an anchor, or a child of a pipeline. */
export interface WardleyNode {
  name: string;
  kind: 'component' | 'anchor';
  /** 0 to 1 from the bottom. */
  visibility: number;
  /** 0 to 1 from the left. */
  evolution: number;
  /** Source text of the two numbers, kept for the text table. */
  visibilityText: string;
  evolutionText: string;
  sourcing?: Sourcing;
  inertia: boolean;
  /** `label [dx, dy]`: the name moves to that side and down by `dy`. */
  labelOffset?: { dx: number; dy: number };
  /** Name of the pipeline this node is a child of. */
  pipeline?: string;
  line: number;
}

export type LinkKind = 'plain' | 'dashed' | 'flow' | 'flow-back' | 'flow-both' | 'flow-labeled';

export interface WardleyLink {
  from: string;
  to: string;
  kind: LinkKind;
  label?: string;
  line: number;
}

export interface Evolve {
  name: string;
  target: number;
  targetText: string;
  line: number;
}

/** `A -.- (x, y)`: where a component is expected to be. */
export interface Trend {
  name: string;
  /** Evolution and visibility of the predicted place. */
  evolution: number;
  visibility: number;
  line: number;
}

export interface Stage {
  /** One or two lines of the stage name (`A / B` gives two). */
  names: string[];
  /** End of the stage along the evolution axis, 0 to 1. */
  end: number;
}

export interface WardleyNote {
  text: string;
  visibility: number;
  evolution: number;
  line: number;
}

export interface Annotation {
  number: number;
  text: string;
  visibility: number;
  evolution: number;
  line: number;
}

export interface Force {
  kind: 'accelerator' | 'deaccelerator';
  name: string;
  visibility: number;
  evolution: number;
  line: number;
}

export interface Pipeline {
  name: string;
  children: string[];
  line: number;
}

export interface WardleyMap {
  title?: string;
  accTitle?: string;
  accDescr?: string;
  /** Canvas size from `size [width, height]`. */
  size?: { w: number; h: number };
  stages: Stage[];
  nodes: WardleyNode[];
  links: WardleyLink[];
  evolves: Evolve[];
  trends: Trend[];
  notes: WardleyNote[];
  annotations: Annotation[];
  /** Where the list of numbered annotations starts (visibility, evolution). */
  annotationsAt?: { visibility: number; evolution: number };
  forces: Force[];
  pipelines: Pipeline[];
  /** Configuration entries and directives that were read and left out of the drawing. */
  ignored: string[];
}

const NUM = String.raw`[-+]?(?:\d+\.?\d*|\.\d+)`;
const PAIR = String.raw`\[\s*(${NUM})\s*,\s*(${NUM})\s*\]`;
const DEFAULT_STAGES = ['Genesis', 'Custom Built', 'Product', 'Commodity'];

const LINK_OP = /\s+(-\.->|-->|->|\+<>|\+<|\+>|\+'[^']*'>)\s+/u;

function fail(message: string, line: number, code = 'syntax'): never {
  throw new UrsulaError(message, code, line);
}

function stripComment(line: string): string {
  const at = line.indexOf('%%');
  return at < 0 ? line : line.slice(0, at);
}

function unquote(text: string): string {
  const t = text.trim();
  return t.length >= 2 && t.startsWith('"') && t.endsWith('"') ? t.slice(1, -1) : t;
}

function unit(text: string, what: string, line: number): number {
  const v = Number(text);
  if (v < 0 || v > 1) fail(`${what} must be between 0 and 1, got ${text}.`, line);
  return v;
}

/** The leading name (quoted or running up to `stop`) of `text` and the rest after it. */
function takeName(text: string, stop: RegExp, line: number): { name: string; rest: string } {
  const t = text.trimStart();
  if (t.startsWith('"')) {
    const end = t.indexOf('"', 1);
    if (end < 0) fail('A quoted name is not closed.', line);
    return { name: t.slice(1, end), rest: t.slice(end + 1) };
  }
  const m = stop.exec(t);
  if (m === null) fail(`Cannot find where the name ends in "${text.trim()}".`, line);
  return { name: t.slice(0, m.index).trim(), rest: t.slice(m.index) };
}

function parseStages(rest: string, line: number): Stage[] {
  const parts = rest.split('->').map((p) => p.trim());
  if (parts.length < 2 || parts.some((p) => p === '')) fail('evolution needs at least two stages joined by "->".', line);
  const raw = parts.map((p) => {
    const at = p.lastIndexOf('@');
    const label = (at < 0 ? p : p.slice(0, at)).trim();
    const end = at < 0 ? undefined : Number(p.slice(at + 1));
    if (end !== undefined && (!Number.isFinite(end) || end <= 0 || end > 1)) fail(`A stage boundary must be above 0 and at most 1, got "${p.slice(at + 1)}".`, line);
    if (label === '') fail('A stage needs a name.', line);
    return { names: label.split('/').map((s) => s.trim()).filter((s) => s !== ''), end };
  });
  // A stage with no boundary shares the room up to the next given boundary (or 1) with the stages before it that have none.
  const ends: number[] = [];
  let from = 0;
  for (let i = 0; i < raw.length; ) {
    let j = i;
    while (j < raw.length && raw[j]?.end === undefined) j++;
    const stop = j < raw.length ? (raw[j]?.end ?? 1) : 1;
    if (stop <= from) fail('Stage boundaries must increase.', line);
    const gap = j < raw.length ? j - i + 1 : j - i;
    for (let k = 0; k < gap; k++) ends.push(from + ((stop - from) * (k + 1)) / gap);
    from = stop;
    i = j + 1;
  }
  const last = ends.length - 1;
  if (last >= 0) ends[last] = 1;
  return raw.map((r, i) => ({ names: r.names, end: ends[i] ?? 1 }));
}

/** Parses the Mermaid Wardley map syntax. */
export function parseWardley(src: string, opts: { heading?: string; config?: Record<string, FrontValue> } = {}): WardleyMap {
  const rows = src.split(/\r?\n/);
  const map: WardleyMap = {
    stages: DEFAULT_STAGES.map((n, i) => ({ names: [n], end: (i + 1) / DEFAULT_STAGES.length })),
    nodes: [],
    links: [],
    evolves: [],
    trends: [],
    notes: [],
    annotations: [],
    forces: [],
    pipelines: [],
    ignored: [],
  };
  const ignored = new Set<string>();
  if (opts.heading !== undefined) map.title = opts.heading;
  for (const key of Object.keys(opts.config ?? {})) ignored.add(`config ${key}`);
  const acc = createAccessibilityReader({ ignoreCase: true });
  const accDescr: string[] = [];
  let descBlock = false;
  let pipeline: Pipeline | undefined;
  let headerSeen = false;

  const find = (name: string): WardleyNode | undefined => map.nodes.find((n) => n.name === name);
  const addNode = (node: WardleyNode): void => {
    if (find(node.name) !== undefined) fail(`"${node.name}" is declared twice.`, node.line);
    map.nodes.push(node);
  };

  rows.forEach((raw, index) => {
    const lineNo = index + 1;
    const trimmed = raw.trim();
    if (trimmed.startsWith('%%{')) {
      ignored.add('init directive');
      return;
    }
    const s = stripComment(raw).trim();
    if (descBlock) {
      if (s.includes('}')) descBlock = false;
      else if (s !== '') accDescr.push(s);
      return;
    }
    if (s === '') return;
    if (!headerSeen) {
      if (s !== 'wardley-beta' && s !== 'wardley') fail(`Expected "wardley-beta" before "${s}".`, lineNo);
      headerSeen = true;
      return;
    }
    const one = /^accDescr\s*:\s*(.*)$/iu.exec(s);
    if (one !== null) {
      accDescr.push((one[1] ?? '').trim());
      return;
    }
    if (/^accDescr\s*\{/iu.test(s)) {
      const body = s.replace(/^accDescr\s*\{/iu, '');
      if (body.includes('}')) accDescr.push(body.replace('}', '').trim());
      else {
        descBlock = true;
        if (body.trim() !== '') accDescr.push(body.trim());
      }
      return;
    }
    if (acc.read(s)) return;

    if (pipeline !== undefined) {
      if (s === '}') {
        pipeline = undefined;
        return;
      }
      const child = /^component\s+(.+)$/u.exec(s);
      const parent = find(pipeline.name);
      if (child === null || parent === undefined) fail(`Expected a "component" inside the pipeline, got "${s}".`, lineNo);
      const { name, rest } = takeName(child[1] ?? '', /\s\[|\[/u, lineNo);
      const m = new RegExp(String.raw`^\s*\[\s*(${NUM})\s*\]\s*$`, 'u').exec(rest);
      if (m === null) fail(`A pipeline component takes only its evolution, like [0.25]; got "${rest.trim()}".`, lineNo);
      addNode({
        name,
        kind: 'component',
        visibility: parent.visibility,
        evolution: unit(m[1] ?? '', 'Evolution', lineNo),
        visibilityText: parent.visibilityText,
        evolutionText: m[1] ?? '',
        inertia: false,
        pipeline: pipeline.name,
        line: lineNo,
      });
      pipeline.children.push(name);
      return;
    }

    let m: RegExpExecArray | null;
    if ((m = /^title\s+(.+)$/u.exec(s)) !== null) {
      map.title = unquote(m[1] ?? '');
    } else if ((m = /^size\s*\[\s*(\d+)\s*,\s*(\d+)\s*\]$/u.exec(s)) !== null) {
      map.size = { w: Number(m[1]), h: Number(m[2]) };
    } else if ((m = /^evolution\s+(.+)$/u.exec(s)) !== null) {
      map.stages = parseStages(m[1] ?? '', lineNo);
    } else if ((m = /^(anchor|component)\s+(.+)$/u.exec(s)) !== null) {
      const kind = m[1] === 'anchor' ? 'anchor' : 'component';
      const { name, rest } = takeName(m[2] ?? '', /\s\[|\[/u, lineNo);
      const at = new RegExp(String.raw`^\s*${PAIR}(.*)$`, 'u').exec(rest);
      if (at === null) fail(`Expected "[visibility, evolution]" after "${name}".`, lineNo);
      const node: WardleyNode = {
        name,
        kind,
        visibility: unit(at[1] ?? '', 'Visibility', lineNo),
        evolution: unit(at[2] ?? '', 'Evolution', lineNo),
        visibilityText: at[1] ?? '',
        evolutionText: at[2] ?? '',
        inertia: false,
        line: lineNo,
      };
      let tail = (at[3] ?? '').trim();
      while (tail !== '') {
        let t: RegExpExecArray | null;
        if ((t = new RegExp(String.raw`^label\s*\[\s*(${NUM})\s*,\s*(${NUM})\s*\]\s*`, 'u').exec(tail)) !== null) {
          node.labelOffset = { dx: Number(t[1]), dy: Number(t[2]) };
        } else if ((t = /^\(\s*([A-Za-z]+)\s*\)\s*/u.exec(tail)) !== null) {
          const word = t[1] ?? '';
          if (word === 'inertia') node.inertia = true;
          else if (word === 'build' || word === 'buy' || word === 'outsource' || word === 'market') node.sourcing = word;
          else fail(`Unknown decorator "(${word})"; use inertia, build, buy, outsource or market.`, lineNo);
        } else {
          fail(`Unexpected "${tail}" after the position of "${name}".`, lineNo);
        }
        tail = tail.slice(t[0].length).trim();
      }
      addNode(node);
    } else if ((m = /^pipeline\s+(.+?)\s*\{\s*$/u.exec(s)) !== null) {
      const name = unquote(m[1] ?? '');
      if (find(name) === undefined) fail(`pipeline "${name}" needs a component of that name declared before it.`, lineNo);
      pipeline = { name, children: [], line: lineNo };
      map.pipelines.push(pipeline);
    } else if ((m = new RegExp(String.raw`^evolve\s+(.+?)\s+(${NUM})$`, 'u').exec(s)) !== null) {
      map.evolves.push({ name: unquote(m[1] ?? ''), target: unit(m[2] ?? '', 'The evolve target', lineNo), targetText: m[2] ?? '', line: lineNo });
    } else if ((m = new RegExp(String.raw`^note\s+"(.*)"\s*${PAIR}$`, 'u').exec(s)) !== null) {
      map.notes.push({ text: m[1] ?? '', visibility: unit(m[2] ?? '', 'Visibility', lineNo), evolution: unit(m[3] ?? '', 'Evolution', lineNo), line: lineNo });
    } else if ((m = new RegExp(String.raw`^annotations\s*${PAIR}$`, 'u').exec(s)) !== null) {
      map.annotationsAt = { visibility: unit(m[1] ?? '', 'Visibility', lineNo), evolution: unit(m[2] ?? '', 'Evolution', lineNo) };
    } else if ((m = new RegExp(String.raw`^annotation\s+(\d+)\s*,\s*${PAIR}\s*"(.*)"$`, 'u').exec(s)) !== null) {
      map.annotations.push({
        number: Number(m[1]),
        visibility: unit(m[2] ?? '', 'Visibility', lineNo),
        evolution: unit(m[3] ?? '', 'Evolution', lineNo),
        text: m[4] ?? '',
        line: lineNo,
      });
    } else if ((m = new RegExp(String.raw`^(accelerator|deaccelerator)\s+(.+?)\s*${PAIR}$`, 'u').exec(s)) !== null) {
      map.forces.push({
        kind: m[1] === 'accelerator' ? 'accelerator' : 'deaccelerator',
        name: unquote(m[2] ?? ''),
        visibility: unit(m[3] ?? '', 'Visibility', lineNo),
        evolution: unit(m[4] ?? '', 'Evolution', lineNo),
        line: lineNo,
      });
    } else if ((m = new RegExp(String.raw`^(.+?)\s+-\.-\s+\(\s*(${NUM})\s*,\s*(${NUM})\s*\)$`, 'u').exec(s)) !== null) {
      map.trends.push({ name: unquote(m[1] ?? ''), evolution: unit(m[2] ?? '', 'Evolution', lineNo), visibility: unit(m[3] ?? '', 'Visibility', lineNo), line: lineNo });
    } else if ((m = LINK_OP.exec(s)) !== null) {
      const op = m[1] ?? '';
      const from = unquote(s.slice(0, m.index));
      let to = s.slice(m.index + m[0].length);
      let label: string | undefined;
      const semi = to.indexOf(';');
      if (semi >= 0) {
        label = to.slice(semi + 1).trim();
        to = to.slice(0, semi);
      }
      const kind: LinkKind =
        op === '-.->' ? 'dashed' : op === '+>' ? 'flow' : op === '+<' ? 'flow-back' : op === '+<>' ? 'flow-both' : op.startsWith('+') ? 'flow-labeled' : 'plain';
      if (kind === 'flow-labeled') label = op.slice(2, -2);
      const link: WardleyLink = { from, to: unquote(to), kind, line: lineNo };
      if (label !== undefined && label !== '') link.label = label;
      map.links.push(link);
    } else {
      fail(`Unrecognised line "${s}".`, lineNo);
    }
  });
  if (!headerSeen) fail('Missing "wardley-beta" header.', 1);
  if (pipeline !== undefined) fail(`pipeline "${pipeline.name}" is not closed with "}".`, pipeline.line);

  for (const link of map.links) {
    if (find(link.from) === undefined) fail(`Unknown component "${link.from}" in a link.`, link.line);
    if (find(link.to) === undefined) fail(`Unknown component "${link.to}" in a link.`, link.line);
  }
  for (const e of map.evolves) if (find(e.name) === undefined) fail(`Unknown component "${e.name}" in evolve.`, e.line);
  for (const t of map.trends) if (find(t.name) === undefined) fail(`Unknown component "${t.name}" in a trend.`, t.line);

  if (acc.title !== undefined && acc.title !== '') map.accTitle = acc.title;
  if (accDescr.length > 0) map.accDescr = accDescr.join(' ');
  map.ignored = [...ignored];
  return map;
}
