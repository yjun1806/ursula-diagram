/** A value of a front-matter block: a scalar or a nested map. */
export type FrontValue = string | number | boolean | null | { [key: string]: FrontValue };

/** Index of the first and last row of a leading `---` block, or undefined when the source has none. */
export function frontMatterRows(rows: string[]): [number, number] | undefined {
  const start = rows.findIndex((r) => r.trim() !== '' && !r.trim().startsWith('%%'));
  if (start < 0 || rows[start]?.trim() !== '---') return undefined;
  const end = rows.findIndex((r, i) => i > start && r.trim() === '---');
  return end < 0 ? undefined : [start, end];
}

function scalar(text: string): FrontValue {
  const t = text.trim();
  const quoted = /^(["'])(.*)\1$/.exec(t);
  if (quoted) return quoted[2] ?? '';
  if (t === 'true') return true;
  if (t === 'false') return false;
  if (t === 'null' || t === '~' || t === '') return null;
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  return t;
}

/**
 * Reads the leading front-matter block as nested maps of scalars (the part of YAML diagram headers use: `key: value`
 * and indented child maps). Lists, anchors and multi-line strings are not read; their rows are skipped.
 */
export function readFrontMatter(src: string): Record<string, FrontValue> {
  const rows = src.split(/\r?\n/);
  const span = frontMatterRows(rows);
  const root: Record<string, FrontValue> = {};
  if (!span) return root;
  const stack: Array<{ indent: number; map: Record<string, FrontValue> }> = [{ indent: -1, map: root }];
  for (let i = span[0] + 1; i < span[1]; i++) {
    const row = rows[i] ?? '';
    if (row.trim() === '' || row.trim().startsWith('#')) continue;
    const m = /^(\s*)([^:#\s][^:]*?)\s*:(.*)$/.exec(row);
    if (!m) continue;
    const indent = (m[1] ?? '').length;
    while (stack.length > 1 && (stack[stack.length - 1]?.indent ?? -1) >= indent) stack.pop();
    const parent = stack[stack.length - 1]?.map ?? root;
    const key = (m[2] ?? '').trim().replace(/^(["'])(.*)\1$/, '$2');
    const rest = (m[3] ?? '').replace(/\s+#.*$/, '');
    if (rest.trim() === '') {
      const child: Record<string, FrontValue> = {};
      parent[key] = child;
      stack.push({ indent, map: child });
    } else {
      parent[key] = scalar(rest);
    }
  }
  return root;
}
