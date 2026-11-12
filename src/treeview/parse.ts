import { cellWidth } from '../metrics.ts';
import { UrsulaError } from '../types.ts';

export interface TreeItem {
  /** Zero for a top-level item; one more than the parent otherwise. */
  depth: number;
  label: string;
  /** The label ends with `/`, which marks a directory. */
  folder: boolean;
  /** Carries the `highlight` class. */
  highlight: boolean;
  /** Every `:::name` class, in order. */
  classes: string[];
  /** The `icon(...)` argument; icons are not drawn. */
  icon?: string;
  /** The text after `##`. */
  description?: string;
  /** One-based source line. */
  line: number;
}

export interface TreeView {
  items: TreeItem[];
  /** Indent per level from `config.treeView.rowIndent`; set by the front-end, not by the parser. */
  rowIndent?: number;
}

const HEADERS = new Set(['treeView-beta', 'treeView']);
const BRANCH = /[├└┣┗┠┖┝┕╠╚]/u;
const RAIL = /[│┃║]/u;
const DASHES = /^[─━═-]+/u;

function fail(message: string, line: number, code = 'syntax'): never {
  throw new UrsulaError(message, code, line);
}

/** Removes a `%%` comment. */
function stripComment(line: string): string {
  const at = line.indexOf('%%');
  return at < 0 ? line : line.slice(0, at);
}

interface Body {
  /** Source lines after the header, with their one-based numbers. */
  rows: Array<{ no: number; text: string }>;
}

/** Splits the source into the header check and the item lines; `%%` lines are dropped. */
function bodyOf(src: string): Body {
  const all = src.split(/\r?\n/).map((l) => l.replace(/\t/gu, '    '));
  let n = 0;
  let header = false;
  const rows: Body['rows'] = [];
  let directive = false;
  for (; n < all.length; n++) {
    const raw = all[n] ?? '';
    const trimmed = raw.trim();
    if (directive) {
      if (trimmed.includes('}%%')) directive = false;
      continue;
    }
    if (trimmed.startsWith('%%{') && !trimmed.includes('}%%')) {
      directive = true;
      continue;
    }
    if (trimmed === '' || trimmed.startsWith('%%')) continue;
    if (!header) {
      if (!HEADERS.has(trimmed)) fail(`Expected "treeView-beta" but found "${trimmed}".`, n + 1);
      header = true;
      continue;
    }
    rows.push({ no: n + 1, text: raw });
  }
  if (!header) fail('Expected "treeView-beta" but the source is empty.', Math.max(1, all.length));
  return { rows };
}

interface Annotated {
  label: string;
  classes: string[];
  icon?: string;
  description?: string;
}

/** Reads `label :::class icon(pack:name) ## description` with the annotations in any order. */
function annotated(text: string, line: number): Annotated {
  let head = text.trim();
  let description: string | undefined;
  let label: string;
  if (head.startsWith('"')) {
    const close = head.indexOf('"', 1);
    if (close < 0) fail('A quoted name is never closed.', line);
    label = head.slice(1, close).trim();
    head = head.slice(close + 1);
  } else {
    const at = head.search(/\s(?::::|icon\(|##)|^(?:##|:::|icon\()/u);
    if (at < 0) {
      label = head;
      head = '';
    } else {
      label = head.slice(0, at).trim();
      head = head.slice(at);
    }
  }
  const hash = head.indexOf('##');
  if (hash >= 0) {
    description = head.slice(hash + 2).trim();
    head = head.slice(0, hash);
  }
  const classes: string[] = [];
  let icon: string | undefined;
  for (const token of head.split(/\s+/u).filter((t) => t !== '')) {
    if (token.startsWith(':::') && token.length > 3) classes.push(token.slice(3));
    else if (/^icon\([^()]*\)$/u.test(token)) icon = token.slice(5, -1);
    else fail(`Cannot read "${token}" after the name.`, line);
  }
  if (label === '') fail('An item has no name.', line);
  return { label, classes, ...(icon === undefined ? {} : { icon }), ...(description === undefined || description === '' ? {} : { description }) };
}

interface Located {
  no: number;
  col: number;
  text: string;
}

/** Box-drawing lines: the column of the branch character gives the depth, four cells to a level. */
function boxRows(rows: Body['rows']): Located[] {
  const out: Located[] = [];
  for (const { no, text } of rows) {
    let col = 0;
    let i = 0;
    const chars = [...text];
    while (i < chars.length && (chars[i] === ' ' || RAIL.test(chars[i] ?? ''))) {
      col += cellWidth(chars[i] ?? '');
      i++;
    }
    let rest = chars.slice(i).join('');
    if (rest === '') continue;
    if (BRANCH.test(rest[0] ?? '')) rest = rest.slice(1).replace(DASHES, '').trim();
    if (rest === '') fail('A branch has no name.', no);
    out.push({ no, col, text: rest });
  }
  return out;
}

/** Indented lines: each level is one step wider than the level above it. */
function indentRows(rows: Body['rows']): Located[] {
  return rows.map(({ no, text }) => ({ no, col: text.length - text.trimStart().length, text: text.trim() }));
}

/** Parses the supported Mermaid tree view subset. */
export function parseTreeView(src: string): TreeView {
  const body = bodyOf(src);
  const boxed = body.rows.some((r) => BRANCH.test(r.text));
  const located = boxed ? boxRows(body.rows) : indentRows(body.rows);
  if (located.length === 0) fail('The tree has no items.', 1, 'empty');
  const items: TreeItem[] = [];
  const stack: number[] = [];
  let unit = 0;
  for (const row of located) {
    const { label, classes, icon, description } = annotated(row.text, row.no);
    let depth: number;
    if (boxed) {
      depth = Math.floor(row.col / 4);
      const above = items[items.length - 1];
      if (above === undefined ? depth !== 0 : depth > above.depth + 1) fail('This item is indented more than one level below the line above.', row.no, 'indent');
    } else {
      const top = stack[stack.length - 1];
      if (top === undefined) {
        stack.push(row.col);
        depth = 0;
      } else if (row.col > top) {
        const step = row.col - top;
        if (unit === 0) unit = step;
        else if (step >= 2 * unit) fail('This item is indented two levels or more below the line above.', row.no, 'indent');
        stack.push(row.col);
        depth = stack.length - 1;
      } else {
        while (stack.length > 0 && (stack[stack.length - 1] ?? 0) > row.col) stack.pop();
        if (stack[stack.length - 1] !== row.col) fail('This item lines up with no level above it.', row.no, 'indent');
        depth = stack.length - 1;
      }
    }
    items.push({
      depth,
      label,
      folder: label.endsWith('/'),
      highlight: classes.includes('highlight'),
      classes,
      ...(icon === undefined ? {} : { icon }),
      ...(description === undefined ? {} : { description }),
      line: row.no,
    });
  }
  return { items };
}
