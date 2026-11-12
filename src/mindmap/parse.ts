import { createAccessibilityReader } from '../front/accessibility.ts';
import { UrsulaError } from '../types.ts';
import type { MindNode, MindShape, Mindmap } from './model.ts';

function fail(message: string, line: number, code = 'syntax'): never {
  throw new UrsulaError(message, code, line);
}

/** Shape delimiters tried in order; the id is the run of characters before the opening delimiter. */
const SHAPES: Array<[MindShape, RegExp]> = [
  ['circle', /^([^\s()[\]{}]*)\(\(([\s\S]*)\)\)$/u],
  ['bang', /^([^\s()[\]{}]*)\)\)([\s\S]*)\(\($/u],
  ['hexagon', /^([^\s()[\]{}]*)\{\{([\s\S]*)\}\}$/u],
  ['square', /^([^\s()[\]{}]*)\[([\s\S]*)\]$/u],
  ['round', /^([^\s()[\]{}]*)\(([\s\S]*)\)$/u],
  ['cloud', /^([^\s()[\]{}]*)\)([\s\S]*)\($/u],
];

const MD_OPEN = '"`';
const MD_CLOSE = '`"';

/** Bold and italic markers of a markdown string carry no shape of their own here; the words stay. */
function stripMarkdown(text: string): string {
  return text.replace(/\*\*([^*]+)\*\*/gu, '$1').replace(/\*([^*]+)\*/gu, '$1');
}

function paragraphsOf(text: string): string[] {
  const out = text
    .replace(/<br\s*\/?>/giu, '\n')
    .split('\n')
    .map((p) => p.trim().replace(/\s+/gu, ' '))
    .filter((p) => p !== '');
  return out;
}

/** The label text of a shape's inside: a quoted string loses its quotes, a markdown string its marks. */
function labelOf(inside: string): string[] {
  const t = inside.trim();
  if (t.startsWith(MD_OPEN) && t.endsWith(MD_CLOSE) && t.length >= 4) return paragraphsOf(stripMarkdown(t.slice(2, -2)));
  const quoted = /^"([\s\S]*)"$/u.exec(t);
  return paragraphsOf(quoted === null ? t : (quoted[1] ?? ''));
}

/** Drops a trailing `:::class` list; the classes are not drawn. */
function withoutClasses(text: string): string {
  return text.replace(/\s*:::[^\]})"`]*$/u, '');
}

function readNode(content: string, line: number): { id: string; paragraphs: string[]; shape: MindShape } {
  const text = withoutClasses(content.trim());
  for (const [shape, re] of SHAPES) {
    const m = re.exec(text);
    if (m === null) continue;
    const paragraphs = labelOf(m[2] ?? '');
    if (paragraphs.length === 0) fail('A node needs text between its shape delimiters.', line, 'empty');
    return { id: m[1] ?? '', paragraphs, shape };
  }
  const paragraphs = labelOf(text);
  if (paragraphs.length === 0) fail('A node needs text.', line, 'empty');
  return { id: text, paragraphs, shape: 'default' };
}

interface Open {
  indent: number;
  node: MindNode;
}

/** Parses a Mermaid mindmap: the `mindmap` header, then one node per line, nested by indentation. */
export function parseMindmap(src: string): Mindmap {
  const rows = src.split(/\r?\n/);
  let root: MindNode | undefined;
  let headerSeen = false;
  const acc = createAccessibilityReader();
  const stack: Open[] = [];

  for (let n = 0; n < rows.length; n++) {
    const lineNo = n + 1;
    const raw = rows[n] ?? '';
    const s = raw.trim();
    if (acc.insideBlock(s)) continue;
    if (s === '' || s.startsWith('%%')) continue;
    if (!headerSeen) {
      if (s !== 'mindmap') fail('A mindmap starts with "mindmap".', lineNo, 'header');
      headerSeen = true;
      continue;
    }
    if (acc.read(s)) continue;
    // Icon and class lines belong to the node above them and draw nothing.
    if (s.startsWith('::icon(') || s.startsWith(':::')) continue;

    let content = raw;
    // A markdown string may run over several source lines until its closing mark.
    const open = content.indexOf(MD_OPEN);
    if (open >= 0 && !content.includes(MD_CLOSE, open + 2)) {
      let m = n + 1;
      for (; m < rows.length; m++) {
        content += `\n${(rows[m] ?? '').trim()}`;
        if (content.includes(MD_CLOSE, open + 2)) break;
      }
      if (m >= rows.length) fail('A markdown string is never closed.', lineNo, 'string');
      n = m;
    }

    const indent = raw.length - raw.trimStart().length;
    const read = readNode(content, lineNo);
    const node: MindNode = { ...read, line: lineNo, children: [] };
    while (stack.length > 0 && (stack[stack.length - 1]?.indent ?? -1) >= indent) stack.pop();
    const parent = stack[stack.length - 1];
    if (parent === undefined) {
      if (root !== undefined) fail('A mindmap has one root; this node is indented no deeper than it.', lineNo, 'root');
      root = node;
    } else {
      parent.node.children.push(node);
    }
    stack.push({ indent, node });
  }

  if (!headerSeen) fail('A mindmap starts with "mindmap".', 1, 'header');
  if (root === undefined) fail('A mindmap needs a root node.', rows.length, 'empty');
  return { root, ...(acc.title === undefined ? {} : { accTitle: acc.title }) };
}
