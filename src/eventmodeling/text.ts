import { cellWidth } from '../metrics.ts';
import { span } from '../text/terminal.ts';
import { wrapWords } from '../text/wrap.ts';
import type { TextSpan } from '../types.ts';
import { ZONE_NAMES, ZONE_ORDER, zoneOf } from './model.ts';
import type { EventModel, Frame } from './model.ts';

type Row = TextSpan[];

const INDENT = 2;

/** Wraps `text` into rows of at most `limit` cells; later rows are indented by `hang` cells. */
function wrapRow(lead: Row, text: string, tone: TextSpan['tone'], hang: number, limit: number): Row[] {
  const used = lead.reduce((n, s) => n + cellWidth(s.text), 0);
  const first = wrapWords(text, Math.max(1, limit - used), cellWidth, { longWord: 'break' });
  if (first.length <= 1) return [[...lead, span(first[0] ?? '', tone)]];
  const head = first[0] ?? '';
  const rest = wrapWords(text.slice(head.length).trim(), Math.max(1, limit - hang), cellWidth, { longWord: 'break' });
  return [[...lead, span(head, tone)], ...rest.map((r): Row => [span(' '.repeat(hang)), span(r, tone)])];
}

/**
 * Draws the model as terminal rows: one block per swimlane in the order they stand in the picture, the frames of a
 * lane in time order, then the relations.
 */
export function layoutEventModelText(model: EventModel, maxWidth: number | undefined): Row[] {
  const limit = maxWidth ?? Number.POSITIVE_INFINITY;
  const byNumber = new Map(model.frames.map((f) => [f.number, f]));
  const identifier = (f: Frame): string => (f.namespace === undefined ? f.name : `${f.namespace}.${f.name}`);
  const rows: Row[] = [[span(model.title ?? 'Event Modeling', 'bold')]];

  const laneKeys: Array<{ zone: (typeof ZONE_ORDER)[number]; namespace?: string }> = [];
  for (const f of model.frames) {
    const zone = zoneOf(f.kind);
    if (!laneKeys.some((k) => k.zone === zone && k.namespace === f.namespace)) laneKeys.push({ zone, ...(f.namespace === undefined ? {} : { namespace: f.namespace }) });
  }
  const ordered = ZONE_ORDER.flatMap((zone) => laneKeys.filter((k) => k.zone === zone));
  const numberWidth = Math.max(...model.frames.map((f) => f.label.length));

  for (const lane of ordered) {
    rows.push([]);
    rows.push([span(lane.namespace === undefined ? ZONE_NAMES[lane.zone] : `${ZONE_NAMES[lane.zone]} / ${lane.namespace}`, 'bold')]);
    const members = model.frames.filter((f) => zoneOf(f.kind) === lane.zone && f.namespace === lane.namespace).sort((a, b) => a.number - b.number);
    for (const f of members) {
      const lead: Row = [span(' '.repeat(INDENT)), span(f.label.padStart(numberWidth), 'dim'), span('  '), span(f.kind.padEnd(3), 'dim'), span('  ')];
      const leadWidth = INDENT + numberWidth + 2 + 3 + 2;
      rows.push(...wrapRow(lead, f.name, 'normal', leadWidth, limit));
      for (const data of f.data) rows.push(...wrapRow([span(' '.repeat(leadWidth + INDENT))], data, 'dim', leadWidth + INDENT, limit));
    }
  }

  if (model.relations.length > 0) {
    rows.push([]);
    rows.push([span('Relations', 'bold')]);
    for (const r of model.relations) {
      const from = byNumber.get(r.from);
      const to = byNumber.get(r.to);
      if (from === undefined || to === undefined) continue;
      const text = `${from.label} ${identifier(from)} -> ${to.label} ${identifier(to)}`;
      rows.push(...wrapRow([span(' '.repeat(INDENT))], text, 'normal', INDENT * 2, limit));
    }
  }
  return rows;
}
