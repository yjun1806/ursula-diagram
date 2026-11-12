import { createAccessibilityReader } from '../front/accessibility.ts';
import { UrsulaError } from '../types.ts';
import { DOMAINS } from './model.ts';
import type { Cynefin, CynefinTransition, Domain } from './model.ts';

function fail(message: string, line: number, code = 'syntax'): never {
  throw new UrsulaError(message, code, line);
}

const ITEM = /^"([^"]*)"$/u;
const TRANSITION = /^([A-Za-z]+)\s*-->\s*([A-Za-z]+)\s*(?::\s*(.*))?$/u;

function domainOf(word: string): Domain | undefined {
  const lower = word.toLowerCase();
  return DOMAINS.find((d) => d === lower);
}

/** The text of a transition label: a quoted string, or the bare text when it has no quotes. */
function labelOf(raw: string, line: number): string | undefined {
  const text = raw.trim();
  if (text === '') return undefined;
  if (text.startsWith('"')) {
    const m = ITEM.exec(text);
    if (m === null) fail(`Cannot read the label ${text}; a label is written "text".`, line, 'label');
    return m[1] === '' ? undefined : m[1];
  }
  return text;
}

/**
 * Parses a Mermaid Cynefin diagram: `cynefin-beta`, an optional `title`, domain blocks of quoted items,
 * and `from --> to : "label"` transitions. `heading` is the title of a leading front-matter block;
 * a title line in the body wins over it.
 */
export function parseCynefin(src: string, heading?: string): Cynefin {
  const rows = src.split(/\r?\n/);
  const items: Cynefin['items'] = { complex: [], complicated: [], chaotic: [], clear: [], confusion: [] };
  const transitions: CynefinTransition[] = [];
  let title: string | undefined;
  let bodyTitle = false;
  let headerSeen = false;
  const acc = createAccessibilityReader({ emptyTitle: 'keep' });
  let current: Domain | undefined;

  for (let n = 0; n < rows.length; n++) {
    const lineNo = n + 1;
    const s = (rows[n] ?? '').trim();
    if (acc.insideBlock(s)) continue;
    if (s === '' || s.startsWith('%%')) continue;

    if (!headerSeen) {
      if (s !== 'cynefin-beta') fail('A Cynefin diagram starts with "cynefin-beta".', lineNo, 'header');
      headerSeen = true;
      continue;
    }

    const t = /^title(?:\s+(.*))?$/u.exec(s);
    if (t !== null) {
      const text = (t[1] ?? '').trim();
      if (text !== '') {
        title = text;
        bodyTitle = true;
      }
      continue;
    }
    if (acc.read(s)) continue;

    const item = ITEM.exec(s);
    if (item !== null) {
      if (current === undefined) fail('An item belongs to a domain; write the domain name above it.', lineNo, 'item');
      items[current].push(item[1] ?? '');
      continue;
    }
    if (s.startsWith('"')) fail(`Cannot read ${s}; an item is a quoted label on its own line.`, lineNo, 'item');

    const domain = domainOf(s);
    if (domain !== undefined) {
      current = domain;
      continue;
    }

    const tr = TRANSITION.exec(s);
    if (tr !== null) {
      const from = domainOf(tr[1] ?? '');
      const to = domainOf(tr[2] ?? '');
      if (from === undefined) fail(`"${tr[1] ?? ''}" is not a domain; use ${DOMAINS.join(', ')}.`, lineNo, 'domain');
      if (to === undefined) fail(`"${tr[2] ?? ''}" is not a domain; use ${DOMAINS.join(', ')}.`, lineNo, 'domain');
      current = undefined;
      // A transition from a domain to itself moves nothing; it is dropped.
      if (from === to) continue;
      const label = labelOf(tr[3] ?? '', lineNo);
      transitions.push({ from, to, ...(label === undefined ? {} : { label }), line: lineNo });
      continue;
    }

    fail(`Cannot read "${s}"; write a domain name, a quoted item, or "from --> to : \\"label\\"".`, lineNo);
  }

  if (!headerSeen) fail('A Cynefin diagram starts with "cynefin-beta".', 1, 'header');
  if (!bodyTitle && heading !== undefined && heading !== '') title = heading;
  return { ...(title === undefined ? {} : { title }), ...(acc.title === undefined ? {} : { accTitle: acc.title }), items, transitions };
}
