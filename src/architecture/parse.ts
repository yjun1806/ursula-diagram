import { createAccessibilityReader } from '../front/accessibility.ts';
import { fail } from '../errors/fail.ts';
import type { ArchAlign, ArchEdge, ArchGroup, ArchNode, Architecture, Side } from './model.ts';

const ID = '[\\w-]+';
const DECLARATION = (word: string): RegExp =>
  new RegExp(`^${word}\\s+(${ID})\\s*(?:\\(([^)]*)\\))?\\s*(?:\\[([^\\]]*)\\])?\\s*(?:in\\s+(${ID}))?$`, 'u');
const GROUP = DECLARATION('group');
const SERVICE = DECLARATION('service');
const JUNCTION = new RegExp(`^junction\\s+(${ID})(?:\\s+in\\s+(${ID}))?$`, 'u');
const EDGE = new RegExp(`^(${ID})(\\{group\\})?:([TBLR])\\s*(<)?--(>)?\\s*([TBLR]):(${ID})(\\{group\\})?$`, 'u');
const ALIGN = /^align\s+(row|column)\s+(.+)$/u;

/**
 * Parses `architecture-beta`: groups, services, junctions, edges between sides, and `align` lines.
 * `heading` is the title of a leading front-matter block.
 */
export function parseArchitecture(src: string, heading?: string): Architecture {
  const rows = src.split(/\r?\n/);
  const groups: ArchGroup[] = [];
  const nodes: ArchNode[] = [];
  const edges: ArchEdge[] = [];
  const aligns: ArchAlign[] = [];
  let title: string | undefined;
  let headerSeen = false;
  const acc = createAccessibilityReader();

  const groupById = (id: string): ArchGroup | undefined => groups.find((g) => g.id === id);
  const nodeById = (id: string): ArchNode | undefined => nodes.find((n) => n.id === id);
  const claim = (id: string, line: number): void => {
    if (groupById(id) !== undefined || nodeById(id) !== undefined) fail(`The id "${id}" is already used.`, line, 'duplicate');
  };
  const parentOf = (id: string | undefined, line: number): string | undefined => {
    if (id === undefined) return undefined;
    if (groupById(id) === undefined) fail(`"${id}" is not a group declared above; a service or group goes "in" a group.`, line, 'parent');
    return id;
  };
  const endpoint = (id: string, group: boolean, line: number): void => {
    const node = nodeById(id);
    if (node === undefined) {
      if (groupById(id) !== undefined) fail(`"${id}" is a group; an edge names services or junctions.`, line, 'edge');
      fail(`"${id}" is not declared above.`, line, 'edge');
    }
    if (group && node.parent === undefined) fail(`"${id}" stands in no group, so "{group}" has nothing to name.`, line, 'edge');
  };

  rows.forEach((raw, i) => {
    const line = i + 1;
    const s = raw.trim();
    if (acc.insideBlock(s)) return;
    if (s === '' || s.startsWith('%%')) return;
    if (!headerSeen) {
      if (s !== 'architecture-beta' && s !== 'architecture') fail(`Expected "architecture-beta" but found "${s}".`, line, 'header');
      headerSeen = true;
      return;
    }
    const t = /^title\s+(.+)$/u.exec(s);
    if (t !== null) {
      title = (t[1] ?? '').trim();
      return;
    }
    if (acc.read(s)) return;

    const g = GROUP.exec(s);
    if (g !== null) {
      const id = g[1] ?? '';
      claim(id, line);
      const parent = parentOf(g[4], line);
      groups.push({ id, ...(g[2] === undefined || g[2] === '' ? {} : { icon: g[2] }), label: g[3] ?? id, ...(parent === undefined ? {} : { parent }), line });
      return;
    }
    const sv = SERVICE.exec(s);
    if (sv !== null) {
      const id = sv[1] ?? '';
      claim(id, line);
      const parent = parentOf(sv[4], line);
      nodes.push({ id, kind: 'service', ...(sv[2] === undefined || sv[2] === '' ? {} : { icon: sv[2] }), label: sv[3] ?? id, ...(parent === undefined ? {} : { parent }), line });
      return;
    }
    const j = JUNCTION.exec(s);
    if (j !== null) {
      const id = j[1] ?? '';
      claim(id, line);
      const parent = parentOf(j[2], line);
      nodes.push({ id, kind: 'junction', label: id, ...(parent === undefined ? {} : { parent }), line });
      return;
    }
    const e = EDGE.exec(s);
    if (e !== null) {
      const [from, to] = [e[1] ?? '', e[7] ?? ''];
      endpoint(from, e[2] !== undefined, line);
      endpoint(to, e[8] !== undefined, line);
      edges.push({
        from,
        fromSide: (e[3] ?? 'R') as Side,
        fromGroup: e[2] !== undefined,
        to,
        toSide: (e[6] ?? 'L') as Side,
        toGroup: e[8] !== undefined,
        startArrow: e[4] !== undefined,
        endArrow: e[5] !== undefined,
        line,
      });
      return;
    }
    const a = ALIGN.exec(s);
    if (a !== null) {
      const members = (a[2] ?? '').split(/\s+/u).filter((m) => m !== '');
      if (members.length < 2) fail('An "align" line needs at least two members.', line, 'align');
      for (const m of members) if (nodeById(m) === undefined) fail(`"${m}" is not a service or junction declared above.`, line, 'align');
      aligns.push({ axis: a[1] === 'row' ? 'row' : 'column', members, line });
      return;
    }
    fail(`Cannot read "${s}"; use group, service, junction, an edge such as "a:R -- L:b", or align.`, line);
  });

  if (!headerSeen) fail('Expected "architecture-beta" as the first line.', 1, 'header');
  if (nodes.length === 0 && groups.length === 0) fail('An architecture diagram needs at least one service.', rows.length, 'empty');
  if (title === undefined && heading !== undefined && heading !== '') title = heading;
  return { ...(title === undefined ? {} : { title }), ...(acc.title === undefined || acc.title === '' ? {} : { accTitle: acc.title }), groups, nodes, edges, aligns };
}
