import { UrsulaError } from '../types.ts';

type Json =
  | { t: 'obj'; entries: Array<[string, Json]> }
  | { t: 'arr'; items: Json[] }
  | { t: 'str'; v: string }
  | { t: 'lit'; v: string };

/** Reads strict JSON and keeps object properties in source order (a JavaScript object would put integer-like keys first). */
function readJson(text: string, line: number): Json {
  let i = 0;
  const fail = (what: string): never => {
    throw new UrsulaError(`Invalid JSON in table: ${what}`, 'parse', line);
  };
  const skip = (): void => {
    while (i < text.length && /\s/.test(text[i] ?? '')) i++;
  };
  const string = (): string => {
    let out = '';
    i++;
    for (;;) {
      const c = text[i];
      if (c === undefined) return fail('unterminated string');
      i++;
      if (c === '"') return out;
      if (c === '\\') {
        const e = text[i++];
        const simple: Record<string, string> = { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' };
        if (e !== undefined && simple[e] !== undefined) out += simple[e];
        else if (e === 'u' && /^[0-9a-fA-F]{4}$/.test(text.slice(i, i + 4))) {
          out += String.fromCharCode(parseInt(text.slice(i, i + 4), 16));
          i += 4;
        } else fail('bad escape');
      } else out += c;
    }
  };
  const value = (): Json => {
    skip();
    const c = text[i];
    if (c === '{') {
      i++;
      const entries: Array<[string, Json]> = [];
      skip();
      if (text[i] === '}') {
        i++;
        return { t: 'obj', entries };
      }
      for (;;) {
        skip();
        if (text[i] !== '"') return fail('expected a property name');
        const key = string();
        skip();
        if (text[i++] !== ':') return fail('expected ":"');
        const v = value();
        const at = entries.findIndex(([k]) => k === key);
        // A repeated property keeps its first position and takes the last value.
        if (at >= 0) entries[at] = [key, v];
        else entries.push([key, v]);
        skip();
        const d = text[i++];
        if (d === '}') return { t: 'obj', entries };
        if (d !== ',') return fail('expected "," or "}"');
      }
    }
    if (c === '[') {
      i++;
      const items: Json[] = [];
      skip();
      if (text[i] === ']') {
        i++;
        return { t: 'arr', items };
      }
      for (;;) {
        items.push(value());
        skip();
        const d = text[i++];
        if (d === ']') return { t: 'arr', items };
        if (d !== ',') return fail('expected "," or "]"');
      }
    }
    if (c === '"') return { t: 'str', v: string() };
    const rest = text.slice(i);
    const lit = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(rest);
    if (!lit) return fail('unexpected token');
    i += lit[0].length;
    return { t: 'lit', v: lit[0] };
  };
  const root = value();
  skip();
  if (i < text.length) fail('unexpected text after the object');
  return root;
}

/**
 * The rows of a JSON table: one `path: value` row per leaf, in source order; nested leaves use paths such as
 * `address.city` and `items[0].name`, and an empty object or array gets one row.
 */
export function jsonRows(text: string, line: number): string[] {
  const root = readJson(text, line);
  if (root.t !== 'obj') throw new UrsulaError('A JSON table needs an object', 'parse', line);
  const rows: string[] = [];
  const walk = (node: Json, path: string): void => {
    if (node.t === 'obj') {
      if (node.entries.length === 0 && path !== '') rows.push(`${path}: {}`);
      for (const [k, v] of node.entries) walk(v, path === '' ? k : `${path}.${k}`);
    } else if (node.t === 'arr') {
      if (node.items.length === 0) rows.push(`${path}: []`);
      node.items.forEach((v, n) => walk(v, `${path}[${n}]`));
    } else rows.push(`${path}: ${node.v}`);
  };
  walk(root, '');
  return rows;
}
