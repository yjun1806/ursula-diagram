import { UrsulaError } from '../types.ts';
import type { Kanban, KanbanCard, KanbanColumn } from './model.ts';

const TICKET_URL = /ticketBaseUrl["']?\s*:\s*(?:"([^"]+)"|'([^']+)')/;
const ITEM = /^(?:([^\s[\]@]*)\s*)?\[(.*?)\]\s*(?:@\{(.*)\})?$/;
const BARE = /^(.*?)\s*(?:@\{(.*)\})?$/;

function indentOf(raw: string): number {
  let n = 0;
  for (const ch of raw) {
    if (ch === ' ') n += 1;
    else if (ch === '\t') n += 4;
    else break;
  }
  return n;
}

/** Splits `a: 1, b: 'x, y'` at the commas outside quotes. */
function splitPairs(body: string): string[] {
  const parts: string[] = [];
  let quote = '';
  let current = '';
  for (const ch of body) {
    if (quote !== '') {
      if (ch === quote) quote = '';
      current += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
    } else if (ch === ',') {
      parts.push(current);
      current = '';
    } else current += ch;
  }
  parts.push(current);
  return parts.map((p) => p.trim()).filter((p) => p !== '');
}

function unquote(value: string): string {
  const first = value[0];
  if (value.length >= 2 && (first === '"' || first === "'") && value.endsWith(first)) return value.slice(1, -1);
  return value;
}

function parseMetadata(body: string, line: number): Partial<Pick<KanbanCard, 'ticket' | 'assigned' | 'priority'>> {
  const found: Partial<Pick<KanbanCard, 'ticket' | 'assigned' | 'priority'>> = {};
  for (const pair of splitPairs(body)) {
    const colon = pair.indexOf(':');
    if (colon < 0) throw new UrsulaError(`Metadata entry "${pair}" needs a "key: value" form.`, 'kanban-metadata', line);
    const key = pair.slice(0, colon).trim();
    const value = unquote(pair.slice(colon + 1).trim());
    if (key === 'ticket' || key === 'assigned' || key === 'priority') found[key] = value;
  }
  return found;
}

interface Item {
  id: string;
  title: string;
  meta: Partial<Pick<KanbanCard, 'ticket' | 'assigned' | 'priority'>>;
}

function parseItem(text: string, line: number): Item {
  if (text.includes('@{') && !text.endsWith('}')) throw new UrsulaError('Metadata opened with "@{" is not closed with "}".', 'kanban-metadata', line);
  const withBrackets = ITEM.exec(text);
  const [id, title, meta] = withBrackets
    ? [withBrackets[1] ?? '', withBrackets[2] ?? '', withBrackets[3]]
    : (() => {
        const bare = BARE.exec(text);
        return [bare?.[1] ?? text, bare?.[1] ?? text, bare?.[2]] as const;
      })();
  if (title.trim() === '') throw new UrsulaError('A column or card needs a title.', 'kanban-title', line);
  return { id: id === '' ? title.trim() : id, title: title.trim(), meta: meta === undefined ? {} : parseMetadata(meta, line) };
}

/** `ticketBaseUrl` is the front-matter setting; a `%%{init}%%` directive in the source overrides it. */
export function parseKanban(src: string, ticketBaseUrl?: string): Kanban {
  const rows = src.split(/\r?\n/);
  let fromInit: string | undefined;
  let headerSeen = false;
  let columnIndent: number | undefined;
  const columns: KanbanColumn[] = [];

  rows.forEach((raw, i) => {
    const line = i + 1;
    const text = raw.trim();
    if (text === '') return;
    if (text.startsWith('%%')) {
      const m = TICKET_URL.exec(raw);
      if (m) fromInit = m[1] ?? m[2];
      return;
    }
    if (!headerSeen) {
      if (text.split(/\s+/)[0] !== 'kanban') throw new UrsulaError(`Expected "kanban" but found "${text}".`, 'kanban-header', line);
      headerSeen = true;
      return;
    }
    const indent = indentOf(raw);
    columnIndent ??= indent;
    const item = parseItem(text, line);
    if (indent <= columnIndent) {
      columns.push({ id: item.id, title: item.title, cards: [], line });
      return;
    }
    const column = columns[columns.length - 1];
    if (column === undefined) throw new UrsulaError('A card needs a column above it.', 'kanban-card', line);
    column.cards.push({ id: item.id, title: item.title, ...item.meta, line });
  });

  if (!headerSeen) throw new UrsulaError('Expected "kanban" as the first line.', 'kanban-header', 1);
  if (columns.length === 0) throw new UrsulaError('A kanban board needs at least one column.', 'kanban-empty');
  const base = fromInit ?? ticketBaseUrl;
  return { columns, ...(base === undefined ? {} : { ticketBaseUrl: base }) };
}
