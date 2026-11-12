import { UrsulaError } from '../types.ts';

/** One cause: `depth` 1 is a cause of a category, 2 and deeper are causes of the cause above. */
export interface IshikawaCause {
  text: string;
  depth: number;
  line: number;
}

export interface IshikawaCategory {
  name: string;
  causes: IshikawaCause[];
  line: number;
}

export interface Ishikawa {
  head: string;
  categories: IshikawaCategory[];
  accTitle?: string;
}

function indentOf(raw: string): number {
  let n = 0;
  for (const ch of raw) {
    if (ch === ' ') n += 1;
    else if (ch === '\t') n += 4;
    else break;
  }
  return n;
}

/** Reads `ishikawa` / `ishikawa-beta`: the first line is the problem, the lines after it are categories with causes by indentation. */
export function parseIshikawa(src: string): Ishikawa {
  const rows = src.split(/\r?\n/);
  let headerSeen = false;
  let head: string | undefined;
  let accTitle: string | undefined;
  let inAccDescr = false;
  let stack: number[] = [];
  const categories: IshikawaCategory[] = [];

  rows.forEach((raw, i) => {
    const line = i + 1;
    const text = raw.trim();
    if (inAccDescr) {
      if (text.includes('}')) inAccDescr = false;
      return;
    }
    if (text === '' || text.startsWith('%%')) return;
    if (!headerSeen) {
      const word = text.split(/[\s;]+/)[0];
      if (word !== 'ishikawa' && word !== 'ishikawa-beta') throw new UrsulaError(`Expected "ishikawa-beta" but found "${text}".`, 'ishikawa-header', line);
      headerSeen = true;
      return;
    }
    const title = /^accTitle\s*:\s*(.*)$/u.exec(text);
    if (title !== null) {
      accTitle = (title[1] ?? '').trim();
      return;
    }
    if (/^accDescr\s*:/u.test(text)) return;
    if (/^accDescr\s*\{/u.test(text)) {
      inAccDescr = !text.includes('}');
      return;
    }
    if (head === undefined) {
      head = text;
      return;
    }
    const indent = indentOf(raw);
    if (stack.length === 0) stack = [indent];
    const base = stack[0] ?? indent;
    if (indent < base) throw new UrsulaError(`"${text}" is indented less than the categories above it.`, 'ishikawa-indent', line);
    while (stack.length > 1 && indent < (stack[stack.length - 1] ?? 0)) stack.pop();
    if (indent > (stack[stack.length - 1] ?? 0)) stack.push(indent);
    const depth = stack.length - 1;
    if (depth === 0) {
      categories.push({ name: text, causes: [], line });
      return;
    }
    const category = categories[categories.length - 1];
    if (category === undefined) throw new UrsulaError('A cause needs a category above it.', 'ishikawa-cause', line);
    category.causes.push({ text, depth, line });
  });

  if (!headerSeen) throw new UrsulaError('Expected "ishikawa-beta" as the first line.', 'ishikawa-header', 1);
  if (head === undefined) throw new UrsulaError('An ishikawa diagram needs the problem on the line after the header.', 'ishikawa-empty');
  return { head, categories, ...(accTitle === undefined ? {} : { accTitle }) };
}
