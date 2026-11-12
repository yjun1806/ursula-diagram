import type { FrontValue } from '../front-matter.ts';
import { createAccessibilityReader } from '../front/accessibility.ts';
import { configSection } from '../front/options.ts';
import { UrsulaError } from '../types.ts';
import type { TreeNode, Treemap } from './model.ts';

const HEADERS = new Set(['treemap-beta', 'treemap']);
const NODE = /^(?:"([^"]*)"|'([^']*)')\s*(?::\s*(-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)\s*)?(?::::([A-Za-z_][\w-]*))?\s*;?$/u;
const LOOSE = /^(?:"([^"]*)"|'([^']*)')\s*:\s*(.+?)\s*;?$/u;
const CLASS_DEF = /^classDef\s+(\S+)\s+(.*?)\s*;?$/u;

function fail(message: string, line: number, code = 'syntax'): never {
  throw new UrsulaError(message, code, line);
}

export interface TreemapSettings {
  valueFormat?: string;
  diagramPadding?: number;
}

/** Reads the `treemap` section of a front-matter `config` map; values of the wrong type are ignored. */
export function readTreemapConfig(config: Record<string, FrontValue> | undefined): TreemapSettings {
  const section = configSection(config, 'treemap');
  if (section === undefined) return {};
  const out: TreemapSettings = {};
  const format = section['valueFormat'];
  if (typeof format === 'string' && format.trim() !== '') out.valueFormat = format.trim();
  const pad = section['diagramPadding'];
  if (typeof pad === 'number' && Number.isFinite(pad) && pad >= 0) out.diagramPadding = pad;
  return out;
}

/** Settings written in a `%%{init: ...}%%` directive; they win over the front matter. */
function readInit(text: string): TreemapSettings {
  const out: TreemapSettings = {};
  const format = /valueFormat["']?\s*:\s*(["'])(.*?)\1/u.exec(text);
  if (format?.[2] !== undefined && format[2].trim() !== '') out.valueFormat = format[2].trim();
  const pad = /diagramPadding["']?\s*:\s*(\d+(?:\.\d+)?)/u.exec(text);
  if (pad?.[1] !== undefined) out.diagramPadding = Number(pad[1]);
  return out;
}

interface Open {
  indent: number;
  node: TreeNode;
}

/**
 * Parses a Mermaid treemap: a `treemap-beta` header, quoted names nested by indentation (a name alone is a section,
 * `"name": value` is a leaf), `:::class` suffixes and `classDef` lines.
 * `heading` is the title of a leading front-matter block; `config` is its `config` map.
 */
export function parseTreemap(src: string, heading?: string, config?: Record<string, FrontValue>): Treemap {
  const rows = src.split(/\r?\n/).map((r) => r.replace(/\t/gu, '    '));
  const roots: TreeNode[] = [];
  const classDefs: Record<string, string> = {};
  const stack: Open[] = [];
  let headerSeen = false;
  let title: string | undefined;
  const acc = createAccessibilityReader({ emptyTitle: 'keep' });
  let directive = '';
  let inDirective = false;
  let init: TreemapSettings = {};

  for (let n = 0; n < rows.length; n++) {
    const lineNo = n + 1;
    const raw = rows[n] ?? '';
    const s = raw.trim();
    if (inDirective) {
      directive += ` ${s}`;
      if (s.includes('}%%')) {
        inDirective = false;
        init = { ...init, ...readInit(directive) };
      }
      continue;
    }
    if (acc.insideBlock(s)) continue;
    if (s === '') continue;
    if (s.startsWith('%%{') && !s.includes('}%%')) {
      inDirective = true;
      directive = s;
      continue;
    }
    if (s.startsWith('%%')) {
      if (s.startsWith('%%{')) init = { ...init, ...readInit(s) };
      continue;
    }

    if (!headerSeen) {
      if (!HEADERS.has(s)) fail(`Expected "treemap-beta" but found "${s}".`, lineNo, 'header');
      headerSeen = true;
      continue;
    }

    if (acc.read(s)) continue;
    const t = /^title\s+(.+)$/u.exec(s);
    if (t !== null) {
      title = (t[1] ?? '').trim();
      continue;
    }
    const def = CLASS_DEF.exec(s);
    if (def !== null) {
      classDefs[def[1] ?? ''] = def[2] ?? '';
      continue;
    }

    const m = NODE.exec(s);
    if (m === null) {
      const loose = LOOSE.exec(s);
      if (loose !== null) fail(`"${(loose[3] ?? '').replace(/:::.*$/u, '')}" is not a number; a leaf is written "name": value.`, lineNo, 'value');
      fail(`Cannot read "${s}"; a node is written "name" or "name": value.`, lineNo);
    }
    const label = m[1] ?? m[2] ?? '';
    const node: TreeNode = { label, line: lineNo, children: [] };
    if (m[3] !== undefined) {
      const value = Number(m[3]);
      if (value <= 0) fail(`"${label}" has the value ${m[3]}; values must be greater than zero.`, lineNo, 'value');
      node.value = value;
    }
    if (m[4] !== undefined) node.cls = m[4];

    const indent = raw.length - raw.trimStart().length;
    while (stack.length > 0 && (stack[stack.length - 1]?.indent ?? -1) >= indent) stack.pop();
    const parent = stack[stack.length - 1]?.node;
    if (parent === undefined) roots.push(node);
    else {
      if (parent.value !== undefined) fail(`"${parent.label}" has a value, so it cannot hold "${label}" below it.`, lineNo, 'nesting');
      parent.children.push(node);
    }
    stack.push({ indent, node });
  }

  if (!headerSeen) fail('Expected "treemap-beta" as the first line.', 1, 'header');
  const check = (nodes: TreeNode[]): void => {
    for (const nd of nodes) {
      if (nd.value === undefined && nd.children.length === 0) fail(`"${nd.label}" has nothing below it; give it a leaf "name": value.`, nd.line, 'empty');
      check(nd.children);
    }
  };
  check(roots);
  if (roots.length === 0) fail('A treemap needs at least one node.', rows.length, 'empty');

  const settings = { ...readTreemapConfig(config), ...init };
  const shownTitle = title ?? (heading !== undefined && heading !== '' ? heading : undefined);
  return {
    ...(shownTitle === undefined ? {} : { title: shownTitle }),
    ...(acc.title === undefined ? {} : { accTitle: acc.title }),
    roots,
    classDefs,
    valueFormat: settings.valueFormat ?? ',',
    ...(settings.diagramPadding === undefined ? {} : { diagramPadding: settings.diagramPadding }),
  };
}
