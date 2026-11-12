import type { FrontValue } from '../front-matter.ts';
import { createAccessibilityReader } from '../front/accessibility.ts';
import { configSection } from '../front/options.ts';
import { UrsulaError } from '../types.ts';
import type { Sankey, SankeyLink, SankeyNode } from './model.ts';

const HEADERS = new Set(['sankey-beta', 'sankey']);
const NUMBER = /^(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/u;

function fail(message: string, line: number, code = 'syntax'): never {
  throw new UrsulaError(message, code, line);
}

export interface SankeySettings {
  showValues?: boolean;
  outlined?: boolean;
  nodeWidth?: number;
  nodePadding?: number;
}

/** Reads the `sankey` section of a front-matter `config` map; values of the wrong type are ignored. */
export function readSankeyConfig(config: Record<string, FrontValue> | undefined): SankeySettings {
  const section = configSection(config, 'sankey');
  if (section === undefined) return {};
  const out: SankeySettings = {};
  if (typeof section['showValues'] === 'boolean') out.showValues = section['showValues'];
  if (typeof section['labelStyle'] === 'string') out.outlined = section['labelStyle'].trim() === 'outlined';
  const width = section['nodeWidth'];
  if (typeof width === 'number' && Number.isFinite(width) && width > 0) out.nodeWidth = width;
  const pad = section['nodePadding'];
  if (typeof pad === 'number' && Number.isFinite(pad) && pad >= 0) out.nodePadding = pad;
  return out;
}

/** Settings written in a `%%{init: ...}%%` directive; they win over the front matter. */
function readInit(text: string): SankeySettings {
  const out: SankeySettings = {};
  const show = /showValues["']?\s*:\s*(true|false)/u.exec(text);
  if (show?.[1] !== undefined) out.showValues = show[1] === 'true';
  const style = /labelStyle["']?\s*:\s*["']?(\w+)/u.exec(text);
  if (style?.[1] !== undefined) out.outlined = style[1] === 'outlined';
  const width = /nodeWidth["']?\s*:\s*(\d+(?:\.\d+)?)/u.exec(text);
  if (width?.[1] !== undefined && Number(width[1]) > 0) out.nodeWidth = Number(width[1]);
  const pad = /nodePadding["']?\s*:\s*(\d+(?:\.\d+)?)/u.exec(text);
  if (pad?.[1] !== undefined) out.nodePadding = Number(pad[1]);
  return out;
}

/** Splits one CSV row into fields: a field is plain text, or text in double quotes where a pair of quotes is one quote. */
function csvFields(row: string, lineNo: number): string[] {
  const fields: string[] = [];
  let i = 0;
  for (;;) {
    while (row[i] === ' ' || row[i] === '\t') i++;
    if (row[i] === '"') {
      let text = '';
      i++;
      for (;;) {
        if (i >= row.length) fail('A quoted field is not closed.', lineNo, 'quote');
        if (row[i] === '"') {
          if (row[i + 1] === '"') {
            text += '"';
            i += 2;
            continue;
          }
          i++;
          break;
        }
        text += row[i];
        i++;
      }
      while (row[i] === ' ' || row[i] === '\t') i++;
      if (i < row.length && row[i] !== ',') fail(`Unexpected text after a quoted field: "${row.slice(i)}".`, lineNo, 'quote');
      fields.push(text);
    } else {
      const end = row.indexOf(',', i);
      const stop = end < 0 ? row.length : end;
      fields.push(row.slice(i, stop).trim());
      i = stop;
    }
    if (i >= row.length) return fields;
    i++;
  }
}

/**
 * Parses a Mermaid sankey: a `sankey-beta` or `sankey` header, then CSV rows `source,target,value`.
 * Blank lines and `%%` comments are skipped. `heading` is the title of a leading front-matter block; `config` is its `config` map.
 */
export function parseSankey(src: string, heading?: string, config?: Record<string, FrontValue>): Sankey {
  const rows = src.split(/\r?\n/);
  const nodes: SankeyNode[] = [];
  const index = new Map<string, number>();
  const links: SankeyLink[] = [];
  const acc = createAccessibilityReader({ emptyTitle: 'keep' });
  let headerSeen = false;
  let directive = '';
  let inDirective = false;
  let init: SankeySettings = {};

  const nodeOf = (name: string, line: number): number => {
    const found = index.get(name);
    if (found !== undefined) return found;
    index.set(name, nodes.length);
    nodes.push({ name, line });
    return nodes.length - 1;
  };

  for (let n = 0; n < rows.length; n++) {
    const lineNo = n + 1;
    const s = (rows[n] ?? '').trim();
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
      if (!HEADERS.has(s)) fail(`Expected "sankey-beta" or "sankey" but found "${s}".`, lineNo, 'header');
      headerSeen = true;
      continue;
    }
    if (acc.read(s)) continue;

    const fields = csvFields(s, lineNo);
    if (fields.length !== 3) fail(`A row has three fields (source,target,value) but this one has ${fields.length}.`, lineNo, 'fields');
    const [from = '', to = '', amount = ''] = fields;
    if (from === '' || to === '') fail('A row needs a source and a target name.', lineNo, 'name');
    if (!NUMBER.test(amount)) fail(`"${amount}" is not a number; the third field is the value.`, lineNo, 'value');
    const value = Number(amount);
    if (value <= 0) fail(`The value ${amount} must be greater than zero.`, lineNo, 'value');
    if (from === to) fail(`"${from}" flows into itself.`, lineNo, 'cycle');
    const source = nodeOf(from, lineNo);
    const target = nodeOf(to, lineNo);
    links.push({ source, target, value, line: lineNo });
  }

  if (!headerSeen) fail('Expected "sankey-beta" or "sankey" as the first line.', 1, 'header');
  if (links.length === 0) fail('A sankey needs at least one row source,target,value.', rows.length, 'empty');
  assertAcyclic(nodes, links);

  const settings = { ...readSankeyConfig(config), ...init };
  return {
    ...(heading !== undefined && heading !== '' ? { title: heading } : {}),
    ...(acc.title === undefined ? {} : { accTitle: acc.title }),
    nodes,
    links,
    showValues: settings.showValues ?? true,
    outlined: settings.outlined ?? false,
    ...(settings.nodeWidth === undefined ? {} : { nodeWidth: settings.nodeWidth }),
    ...(settings.nodePadding === undefined ? {} : { nodePadding: settings.nodePadding }),
  };
}

/** Throws on the line of a row that closes a circle of flows. */
function assertAcyclic(nodes: SankeyNode[], links: SankeyLink[]): void {
  const state = new Array<number>(nodes.length).fill(0);
  const out = nodes.map(() => [] as SankeyLink[]);
  for (const l of links) out[l.source]?.push(l);
  const visit = (i: number): void => {
    state[i] = 1;
    for (const l of out[i] ?? []) {
      if (state[l.target] === 1) fail(`"${nodes[l.source]?.name}" to "${nodes[l.target]?.name}" closes a circle of flows; a sankey cannot loop.`, l.line, 'cycle');
      if (state[l.target] === 0) visit(l.target);
    }
    state[i] = 2;
  };
  for (let i = 0; i < nodes.length; i++) if (state[i] === 0) visit(i);
}
