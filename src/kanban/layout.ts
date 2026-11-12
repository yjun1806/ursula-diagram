import type { Ruler } from '../metrics.ts';
import type { Scene, SceneItem } from '../types.ts';
import type { Theme } from '../render/theme.ts';
import type { Kanban, KanbanCard, KanbanLayout, PlacedCard, PlacedColumn, PlacedTag } from './model.ts';

const MARGIN = 24;
const ZONE_GAP = 16;
const ZONE_PAD = 16;
const ZONE_TOP = 44;
const CARD_GAP = 8;
const CARD_PAD = 16;
const MIN_INNER = 224;
const LINE_H = 20;
const TAG_GAP = 4;
const TAG_ROW = 24;
const TAG_KEYS = ['ticket', 'assigned', 'priority'] as const;

const ceil4 = (v: number): number => Math.ceil(v / 4) * 4;

/** Breaks `text` into lines no wider than `limit`, at spaces; a word wider than a line is cut between characters. */
export function wrapTitle(text: string, limit: number, width: (s: string) => number): string[] {
  const lines: string[] = [];
  let current = '';
  const push = (word: string): void => {
    const joined = current === '' ? word : `${current} ${word}`;
    if (width(joined) <= limit) {
      current = joined;
      return;
    }
    if (current !== '') {
      lines.push(current);
      current = '';
    }
    if (width(word) <= limit) {
      current = word;
      return;
    }
    for (const ch of word) {
      if (current !== '' && width(current + ch) > limit) {
        lines.push(current);
        current = '';
      }
      current += ch;
    }
  };
  for (const word of text.split(/\s+/).filter((w) => w !== '')) push(word);
  if (current !== '') lines.push(current);
  return lines;
}

function tagsOf(card: KanbanCard): Array<{ key: PlacedTag['key']; text: string }> {
  return TAG_KEYS.flatMap((key) => {
    const text = card[key];
    return text === undefined ? [] : [{ key, text }];
  });
}

export function ticketHref(base: string | undefined, ticket: string): string | undefined {
  return base !== undefined && base.includes('#TICKET#') ? base.replaceAll('#TICKET#', ticket) : undefined;
}

export function layoutKanban(model: Kanban, ruler: Ruler, theme?: Theme): KanbanLayout {
  const tagWidth = (text: string): number => ceil4(ruler.textWidth(text, 'line') + 16);
  const widestTag = Math.max(0, ...model.columns.flatMap((c) => c.cards.flatMap((card) => tagsOf(card).map((t) => tagWidth(t.text)))));
  const inner = Math.max(MIN_INNER, widestTag);
  const cardW = inner + 2 * CARD_PAD;
  const zoneW = cardW + 2 * ZONE_PAD;
  const titleWidth = (s: string): number => ruler.textWidth(s, 'title');

  const cards: PlacedCard[] = [];
  const columns: PlacedColumn[] = [];
  const items: SceneItem[] = [];
  const cardItems: SceneItem[] = [];
  const stacks = model.columns.map((column, ci) => {
    const x = MARGIN + ci * (zoneW + ZONE_GAP);
    let y = MARGIN + ZONE_TOP;
    column.cards.forEach((card, index) => {
      const titleLines = wrapTitle(card.title, inner, titleWidth);
      const tags = tagsOf(card);
      const cx = x + ZONE_PAD;
      // Tags flow left to right and start a new row when the next one does not fit.
      const flowed: Array<{ key: PlacedTag['key']; text: string; w: number; dx: number; row: number }> = [];
      let tx = 0;
      let row = 0;
      for (const tag of tags) {
        const w = tagWidth(tag.text);
        if (tx > 0 && tx + w > inner) {
          tx = 0;
          row += 1;
        }
        flowed.push({ ...tag, w, dx: tx, row });
        tx += w + TAG_GAP;
      }
      const rows = tags.length === 0 ? 0 : row + 1;
      const extra = LINE_H * (titleLines.length - 1);
      const h = (tags.length === 0 ? 48 : 68) + extra + TAG_ROW * Math.max(0, rows - 1);
      const firstBaseline = y + (tags.length === 0 ? 24 : 25);
      cards.push({
        column: ci,
        index,
        x: cx,
        y,
        w: cardW,
        h,
        lines: titleLines.map((text, li) => ({ text, x: cx + CARD_PAD, y: firstBaseline + LINE_H * li })),
        tags: flowed.map((t) => ({
          key: t.key,
          text: t.text,
          x: cx + CARD_PAD + t.dx,
          y: y + 38 + extra + TAG_ROW * t.row,
          w: t.w,
          h: 20,
          ...hrefOf(model, t.key, t.text),
        })),
      });
      y += h + CARD_GAP;
    });
    const bottom = column.cards.length === 0 ? MARGIN + ZONE_TOP : y - CARD_GAP;
    return { x, bottom: bottom + ZONE_PAD };
  });

  const zoneBottom = Math.max(...stacks.map((s) => s.bottom));
  const zoneH = zoneBottom - MARGIN;
  model.columns.forEach((column, ci) => {
    const x = stacks[ci]?.x ?? 0;
    columns.push({ title: column.title, x, y: MARGIN, w: zoneW, h: zoneH });
    items.push({ kind: 'box', style: 'frame', x, y: MARGIN, w: zoneW, h: zoneH, role: ['zone'], data: { column: String(ci) } });
    items.push({ kind: 'text', x: x + ZONE_PAD, y: MARGIN + 24, text: column.title, role: ['zone-name'] });
  });
  for (const card of cards) {
    cardItems.push({ kind: 'box', style: 'box', x: card.x, y: card.y, w: card.w, h: card.h, role: ['tile', 'tile--in-zone'], data: { column: String(card.column), card: String(card.index) } });
    for (const line of card.lines) cardItems.push({ kind: 'text', x: line.x, y: line.y, text: line.text, role: ['name', 'start'] });
    for (const tag of card.tags) {
      const data = { tag: tag.key, ...(tag.href === undefined ? {} : { href: tag.href }) };
      cardItems.push({ kind: 'box', style: 'label', x: tag.x, y: tag.y, w: tag.w, h: tag.h, role: ['tag'], data });
      cardItems.push({ kind: 'text', x: tag.x + tag.w / 2, y: tag.y + 10, text: tag.text, role: ['tag-text'], data });
    }
  }

  const width = 2 * MARGIN + model.columns.length * zoneW + (model.columns.length - 1) * ZONE_GAP;
  const height = zoneH + 2 * MARGIN;
  const scene: Scene = {
    width,
    height,
    title: `kanban — ${model.columns.map((c) => c.title).join(', ')}`,
    items: [...items, ...cardItems],
    ...(theme === undefined ? {} : { theme }),
  };
  return { scene, columns, cards };
}

function hrefOf(model: Kanban, key: PlacedTag['key'], text: string): { href?: string } {
  if (key !== 'ticket') return {};
  const href = ticketHref(model.ticketBaseUrl, text);
  return href === undefined ? {} : { href };
}
