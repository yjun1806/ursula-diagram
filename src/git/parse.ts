import type { FrontValue } from '../front-matter.ts';
import { createAccessibilityReader } from '../front/accessibility.ts';
import { configSection } from '../front/options.ts';
import { UrsulaError } from '../types.ts';
import type { Branch, Commit, CommitType, GitConfig, GitGraph, Orientation } from './model.ts';

function fail(message: string, line: number, code = 'syntax'): never {
  throw new UrsulaError(message, code, line);
}

const HEADER = /^gitgraph(?:\s+(LR|TB|BT))?\s*:?\s*$/iu;
const ATTR = /^\s*(id|type|tag|msg|parent|order)\s*:\s*(?:"([^"]*)"|(\S+))/iu;
const NAME = /^\s*(?:"([^"]*)"|(\S+))/u;

const DEFAULTS: GitConfig = {
  showBranches: true,
  showCommitLabel: true,
  mainBranchName: 'main',
  mainBranchOrder: 0,
  parallelCommits: false,
  rotateCommitLabel: false,
};

/** A deterministic seven-digit hex from the sequence number (FNV-1a, then a bit mixer). */
function hash7(seq: number): string {
  let h = 0x811c9dc5;
  for (const ch of `commit-${seq}`) {
    h = (h ^ (ch.codePointAt(0) ?? 0)) >>> 0;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  h = (h ^ (h >>> 16)) >>> 0;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h.toString(16).padStart(8, '0').slice(0, 7);
}

/** Reads `%%{init: {...}}%%` loosely: single quotes and bare keys are accepted; anything unreadable is ignored. */
function initDirective(src: string): Record<string, unknown> {
  const m = /%%\{\s*(?:init|initialize)\s*:\s*([\s\S]*?)\}\s*%%/u.exec(src);
  if (m === null) return {};
  const text = (m[1] ?? '').trim().replace(/'/gu, '"').replace(/([{,]\s*)([A-Za-z_][\w-]*)\s*:/gu, '$1"$2":');
  try {
    const value: unknown = JSON.parse(text);
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function readConfig(section: Record<string, unknown> | undefined): Partial<GitConfig> {
  const out: Partial<GitConfig> = {};
  if (section === undefined) return out;
  for (const key of ['showBranches', 'showCommitLabel', 'parallelCommits', 'rotateCommitLabel'] as const) {
    const v = section[key];
    if (typeof v === 'boolean') out[key] = v;
  }
  const name = section['mainBranchName'];
  if (typeof name === 'string' && name !== '') out.mainBranchName = name;
  const order = section['mainBranchOrder'];
  if (typeof order === 'number' && Number.isFinite(order)) out.mainBranchOrder = order;
  return out;
}

interface Attrs {
  id?: string;
  type?: CommitType;
  tag?: string;
  parent?: string;
  order?: number;
}

function readAttrs(rest: string, line: number): Attrs {
  const out: Attrs = {};
  let text = rest;
  while (text.trim() !== '') {
    const m = ATTR.exec(text);
    if (m === null) fail(`Cannot read "${text.trim()}"; an attribute is written key: value, for example id: "a1".`, line);
    const key = (m[1] ?? '').toLowerCase();
    const value = m[2] ?? m[3] ?? '';
    if (key === 'id') out.id = value;
    else if (key === 'tag') out.tag = value;
    else if (key === 'parent') out.parent = value;
    else if (key === 'order') {
      const n = Number(value);
      if (!Number.isFinite(n)) fail(`"${value}" is not a number; order is a number.`, line, 'value');
      out.order = n;
    } else if (key === 'type') {
      const t = value.toUpperCase();
      if (t !== 'NORMAL' && t !== 'REVERSE' && t !== 'HIGHLIGHT') fail(`Unknown commit type "${value}"; use NORMAL, REVERSE or HIGHLIGHT.`, line, 'value');
      out.type = t;
    }
    text = text.slice(m[0].length);
  }
  return out;
}

function readName(rest: string, line: number, what: string): { name: string; rest: string } {
  const m = NAME.exec(rest);
  if (m === null) fail(`${what} needs a branch name.`, line);
  return { name: m[1] ?? m[2] ?? '', rest: rest.slice(m[0].length) };
}

/**
 * Parses a Mermaid git graph: `gitGraph [LR|TB|BT]:` then `commit`, `branch`, `checkout`/`switch`, `merge` and `cherry-pick`.
 * `heading` is the title of a leading front-matter block and `config` its `config` map.
 */
export function parseGit(src: string, heading?: string, config?: Record<string, FrontValue>): GitGraph {
  const init = initDirective(src);
  const cfg: GitConfig = {
    ...DEFAULTS,
    ...readConfig(configSection(config, 'gitGraph')),
    ...readConfig(configSection(init, 'gitGraph')),
  };

  const rows = src.split(/\r?\n/);
  const branches: Branch[] = [{ name: cfg.mainBranchName, line: 1 }];
  const heads = new Map<string, number | undefined>([[cfg.mainBranchName, undefined]]);
  const commits: Commit[] = [];
  let current = cfg.mainBranchName;
  let orientation: Orientation = 'LR';
  let title: string | undefined;
  let headerSeen = false;
  const acc = createAccessibilityReader({ ignoreCase: true });

  const exists = (name: string): boolean => heads.has(name);
  const push = (c: Omit<Commit, 'seq' | 'id'> & { id?: string }): Commit => {
    const seq = commits.length;
    const commit: Commit = { ...c, seq, id: c.id ?? `${seq}-${hash7(seq)}` };
    commits.push(commit);
    heads.set(c.branch, seq);
    return commit;
  };

  for (let n = 0; n < rows.length; n++) {
    const line = n + 1;
    const s = (rows[n] ?? '').trim();
    if (acc.insideBlock(s)) continue;
    if (s === '' || s.startsWith('%%')) continue;

    if (!headerSeen) {
      const h = HEADER.exec(s);
      if (h === null) fail('A git graph starts with "gitGraph".', line, 'header');
      headerSeen = true;
      if (h[1] !== undefined) orientation = h[1].toUpperCase() as Orientation;
      continue;
    }

    if (acc.read(s)) continue;
    const t = /^title(?:\s+(.*))?$/iu.exec(s);
    if (t !== null) {
      title = (t[1] ?? '').trim() || undefined;
      continue;
    }

    const word = /^([A-Za-z][\w-]*)(?:\s+(.*))?$/u.exec(s);
    const keyword = (word?.[1] ?? '').toLowerCase();
    const rest = word?.[2] ?? '';
    const head = heads.get(current);

    if (keyword === 'commit') {
      const a = readAttrs(rest, line);
      push({ branch: current, type: a.type ?? 'NORMAL', ...(a.tag === undefined ? {} : { tag: a.tag }), ...(a.id === undefined ? {} : { id: a.id }), kind: 'commit', parents: head === undefined ? [] : [head], line });
    } else if (keyword === 'branch') {
      const { name, rest: after } = readName(rest, line, 'branch');
      if (exists(name)) fail(`The branch "${name}" already exists; a branch name must be unique.`, line, 'branch');
      const a = readAttrs(after, line);
      branches.push({ name, ...(a.order === undefined ? {} : { order: a.order }), ...(head === undefined ? {} : { parent: head }), line });
      heads.set(name, head);
      current = name;
    } else if (keyword === 'checkout' || keyword === 'switch') {
      const { name } = readName(rest, line, keyword);
      if (!exists(name)) fail(`The branch "${name}" does not exist; create it with "branch ${name}" first.`, line, 'branch');
      current = name;
    } else if (keyword === 'merge') {
      const { name, rest: after } = readName(rest, line, 'merge');
      if (!exists(name)) fail(`Cannot merge "${name}"; the branch does not exist.`, line, 'branch');
      if (name === current) fail(`Cannot merge "${name}" into itself.`, line, 'merge');
      const source = heads.get(name);
      if (head === undefined) fail(`Cannot merge into "${current}"; it has no commit yet.`, line, 'merge');
      if (source === undefined) fail(`Cannot merge "${name}"; it has no commit yet.`, line, 'merge');
      if (source === head) fail(`Cannot merge "${name}"; both branches end in the same commit.`, line, 'merge');
      const a = readAttrs(after, line);
      push({ branch: current, type: a.type ?? 'NORMAL', ...(a.tag === undefined ? {} : { tag: a.tag }), ...(a.id === undefined ? {} : { id: a.id }), kind: 'merge', parents: [head, source], mergedFrom: name, line });
    } else if (keyword === 'cherry-pick') {
      const a = readAttrs(rest, line);
      if (a.id === undefined) fail('cherry-pick needs the id of the commit to copy, for example cherry-pick id: "a1".', line, 'cherry-pick');
      if (head === undefined) fail(`Cannot cherry-pick onto "${current}"; it has no commit yet.`, line, 'cherry-pick');
      const same = commits.filter((c) => c.id === a.id);
      if (same.length === 0) fail(`Cannot cherry-pick "${a.id}"; no commit has that id.`, line, 'cherry-pick');
      const found = [...same].reverse().find((c) => c.branch !== current);
      if (found === undefined) fail(`Cannot cherry-pick "${a.id}"; it is on the current branch "${current}".`, line, 'cherry-pick');
      let parentNote = '';
      if (found.parents.length > 1) {
        const parent = a.parent === undefined ? undefined : found.parents.map((p) => commits[p]).find((c) => c?.id === a.parent);
        if (parent === undefined) fail(`Cannot cherry-pick the merge commit "${a.id}" without parent: "<id>" naming one of its parents.`, line, 'cherry-pick');
        parentNote = `|parent:${parent.id}`;
      }
      push({
        branch: current,
        type: 'NORMAL',
        tag: a.tag ?? `cherry-pick:${found.id}${parentNote}`,
        kind: 'cherry-pick',
        parents: [head],
        cherryOf: found.seq,
        line,
      });
    } else {
      fail(`Cannot read "${s}"; a git graph line is commit, branch, checkout, merge or cherry-pick.`, line);
    }
  }

  if (!headerSeen) fail('A git graph starts with "gitGraph".', 1, 'header');
  const shownTitle = title ?? (heading === undefined || heading === '' ? undefined : heading);
  return { orientation, branches, commits, config: cfg, ...(shownTitle === undefined ? {} : { title: shownTitle }), ...(acc.title === undefined || acc.title === '' ? {} : { accTitle: acc.title }) };
}
