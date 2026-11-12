import { createAccessibilityReader } from '../front/accessibility.ts';
import { UrsulaError } from '../types.ts';
import type { Venn, VennSet, VennText, VennUnion } from './model.ts';

const ID = String.raw`"[^"]*"|[^\s,\[\]:"]+`;
const LABEL = String.raw`(?:\s*\[\s*(?:"([^"]*)"|([^\]]*?))\s*\])?`;
const SIZE = String.raw`(?:\s*:\s*(\S+))?`;
const SET = new RegExp(String.raw`^set\s+(${ID})${LABEL}${SIZE}\s*$`, 'u');
const UNION = new RegExp(String.raw`^union\s+((?:${ID})(?:\s*,\s*(?:${ID}))+)${LABEL}${SIZE}\s*$`, 'u');
const TEXT = new RegExp(String.raw`^text\s+(${ID})${LABEL}\s*$`, 'u');
const STYLE = new RegExp(String.raw`^style\s+((?:${ID})(?:\s*,\s*(?:${ID}))*)\s+(.+)$`, 'u');
const NUMBER = /^\d+(?:\.\d+)?$/u;

function fail(message: string, line: number, code = 'syntax'): never {
  throw new UrsulaError(message, code, line);
}

const unquote = (id: string): string => (id.startsWith('"') ? id.slice(1, -1) : id);

function splitIds(list: string): string[] {
  return [...list.matchAll(new RegExp(ID, 'gu'))].map((m) => unquote(m[0]));
}

function sizeOf(raw: string | undefined, line: number): { size?: number; sizeText?: string } {
  if (raw === undefined) return {};
  if (!NUMBER.test(raw)) fail(`"${raw}" is not a size; a size is a number greater than zero.`, line, 'value');
  const size = Number(raw);
  if (size <= 0) fail(`The size ${raw} must be greater than zero.`, line, 'value');
  return { size, sizeText: raw };
}

/** Parses a Mermaid Venn diagram (`venn-beta`): `title`, `set`, `union`, `text` and `style` statements. */
export function parseVenn(src: string, heading?: string): Venn {
  const rows = src.split(/\r?\n/);
  const sets: VennSet[] = [];
  const unions: VennUnion[] = [];
  const texts = new Map<string, VennText>();
  const styleLines: Array<{ ids: string[]; props: string; line: number }> = [];
  let title: string | undefined;
  let headerSeen = false;
  const acc = createAccessibilityReader();
  let current: VennSet | VennUnion | undefined;

  for (let n = 0; n < rows.length; n++) {
    const line = n + 1;
    const s = (rows[n] ?? '').trim();
    if (acc.insideBlock(s)) continue;
    if (s === '' || s.startsWith('%%')) continue;
    if (!headerSeen) {
      if (!/^venn-beta\s*$/u.test(s)) fail('A Venn diagram starts with "venn-beta".', line, 'header');
      headerSeen = true;
      continue;
    }

    const t = /^title(?:\s+(.*))?$/u.exec(s);
    if (t !== null) {
      const text = unquote((t[1] ?? '').trim());
      if (text !== '') title = text;
      continue;
    }
    if (acc.read(s)) continue;

    const set = SET.exec(s);
    if (set !== null) {
      const id = unquote(set[1] ?? '');
      if (sets.some((x) => x.id === id)) fail(`The set "${id}" is defined twice.`, line, 'duplicate');
      const label = set[2] ?? set[3];
      current = { id, label: label === undefined || label === '' ? id : label, ...sizeOf(set[4], line), texts: [], line };
      sets.push(current);
      continue;
    }

    const union = UNION.exec(s);
    if (union !== null) {
      const ids = splitIds(union[1] ?? '');
      for (const id of ids) if (!sets.some((x) => x.id === id)) fail(`The union uses "${id}", which no earlier set defines.`, line, 'reference');
      if (new Set(ids).size !== ids.length) fail('A union names each set once.', line);
      const key = [...ids].sort().join('\u0000');
      if (unions.some((u) => [...u.ids].sort().join('\u0000') === key)) fail(`The union ${ids.join(',')} is defined twice.`, line, 'duplicate');
      const label = union[2] ?? union[3];
      current = { ids, ...(label === undefined ? {} : { label }), ...sizeOf(union[4], line), texts: [], line };
      unions.push(current);
      continue;
    }

    const text = TEXT.exec(s);
    if (text !== null) {
      if (current === undefined) fail('A text node belongs to the set or union above it.', line, 'reference');
      const id = unquote(text[1] ?? '');
      if (texts.has(id)) fail(`The text node "${id}" is defined twice.`, line, 'duplicate');
      const label = text[2] ?? text[3];
      const node: VennText = { id, label: label === undefined || label === '' ? id : label, line };
      texts.set(id, node);
      current.texts.push(node);
      continue;
    }

    const style = STYLE.exec(s);
    if (style !== null) {
      styleLines.push({ ids: splitIds(style[1] ?? ''), props: style[2] ?? '', line });
      continue;
    }

    fail(`Cannot read "${s}"; a line is title, set, union, text or style.`, line);
  }

  if (!headerSeen) fail('A Venn diagram starts with "venn-beta".', 1, 'header');
  if (sets.length === 0) fail('A Venn diagram needs at least one set.', rows.length, 'empty');

  const ignored: string[] = [];
  for (const { ids, props, line } of styleLines) {
    for (const id of ids) {
      if (!sets.some((x) => x.id === id) && !texts.has(id) && ids.length === 1) fail(`The style names "${id}", which is no set, union or text node.`, line, 'reference');
    }
    ignored.push(`style ${ids.join(',')} ${props.trim()}`);
  }

  const finalTitle = title ?? (heading !== undefined && heading !== '' ? heading : undefined);
  return { ...(finalTitle === undefined ? {} : { title: finalTitle }), ...(acc.title === undefined || acc.title === '' ? {} : { accTitle: acc.title }), sets, unions, ignored };
}
