import { createAccessibilityReader } from '../front/accessibility.ts';
import { fail } from '../errors/fail.ts';
import type { MindNode, MindRun, MindShape, Mindmap } from './model.ts';

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

/** `**bold**`, `*italic*` and `_italic_` of a markdown string; an underscore inside a word is a letter. */
const EMPHASIS = /\*\*([^*]+)\*\*|\*([^*]+)\*|(?<![\p{L}\p{N}])_([^_]+)_(?![\p{L}\p{N}])/gu;

/** A paragraph of a markdown string as runs, its emphasis marks dropped. */
function runsOf(paragraph: string): MindRun[] {
  const runs: MindRun[] = [];
  let at = 0;
  for (const m of paragraph.matchAll(EMPHASIS)) {
    if (m.index > at) runs.push({ text: paragraph.slice(at, m.index) });
    if (m[1] !== undefined) runs.push({ text: m[1], bold: true });
    else runs.push({ text: m[2] ?? m[3] ?? '', italic: true });
    at = m.index + m[0].length;
  }
  if (at < paragraph.length) runs.push({ text: paragraph.slice(at) });
  return runs;
}

function paragraphsOf(text: string): string[] {
  const out = text
    .replace(/<br\s*\/?>/giu, '\n')
    .split('\n')
    .map((p) => p.trim().replace(/\s+/gu, ' '))
    .filter((p) => p !== '');
  return out;
}

interface Label {
  paragraphs: string[];
  runs?: MindRun[][];
}

/** The label of a shape's inside: a quoted string loses its quotes, a markdown string its marks, which become runs. */
function labelOf(inside: string): Label {
  const t = inside.trim();
  if (t.startsWith(MD_OPEN) && t.endsWith(MD_CLOSE) && t.length >= 4) {
    const runs = paragraphsOf(t.slice(2, -2)).map(runsOf);
    const paragraphs = runs.map((r) => r.map((run) => run.text).join(''));
    return runs.some((r) => r.some((run) => run.bold === true || run.italic === true)) ? { paragraphs, runs } : { paragraphs };
  }
  const quoted = /^"([\s\S]*)"$/u.exec(t);
  return { paragraphs: paragraphsOf(quoted === null ? t : (quoted[1] ?? '')) };
}

/** Drops a trailing `:::class` list; the classes are not drawn. */
function withoutClasses(text: string): string {
  return text.replace(/\s*:::[^\]})"`]*$/u, '');
}

function readNode(content: string, line: number): { id: string; paragraphs: string[]; runs?: MindRun[][]; shape: MindShape } {
  const text = withoutClasses(content.trim());
  for (const [shape, re] of SHAPES) {
    const m = re.exec(text);
    if (m === null) continue;
    const label = labelOf(m[2] ?? '');
    if (label.paragraphs.length === 0) fail('A node needs text between its shape delimiters.', line, 'empty');
    return { id: m[1] ?? '', ...label, shape };
  }
  const label = labelOf(text);
  if (label.paragraphs.length === 0) fail('A node needs text.', line, 'empty');
  return { id: text, ...label, shape: 'default' };
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
