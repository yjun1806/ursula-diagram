import { UrsulaError } from '../types.ts';
import type { TimelineGroup, TimelineModel, TimelinePeriod } from './model.ts';

const BREAK = /<br\s*\/?>/i;

/** Splits a text at `<br>` into trimmed, non-empty lines (at least one). */
function lines(text: string): string[] {
  const parts = text
    .split(BREAK)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter((p) => p !== '');
  return parts.length === 0 ? [''] : parts;
}

/** Source rows with their 1-based numbers; `%%` comments and `%%{ ... }%%` directives are dropped. */
function rows(src: string): { text: string; line: number }[] {
  const all = src.split(/\r?\n/);
  const out: { text: string; line: number }[] = [];
  let directive = false;
  for (let i = 0; i < all.length; i++) {
    const text = (all[i] ?? '').trim();
    if (directive) {
      if (text.includes('}%%')) directive = false;
      continue;
    }
    if (text.startsWith('%%{') && !text.includes('}%%')) {
      directive = true;
      continue;
    }
    if (text === '' || text.startsWith('%%')) continue;
    out.push({ text, line: i + 1 });
  }
  return out;
}

/** Reads a Mermaid `timeline` source into periods grouped by section. */
export function parseTimeline(src: string, heading?: string): TimelineModel {
  const all = rows(src);
  const head = all[0];
  if (head === undefined) throw new UrsulaError('Empty source; start with "timeline".', 'timeline-header');
  const header = /^timeline(?:\s+(LR|TD|TB))?$/i.exec(head.text);
  if (header === null) throw new UrsulaError(`Expected "timeline" (optionally followed by LR or TD), found "${head.text}".`, 'timeline-header', head.line);
  const direction = (header[1] ?? 'LR').toUpperCase() === 'LR' ? 'LR' : 'TD';

  let title: string | undefined = heading === undefined || heading.trim() === '' ? undefined : heading.trim();
  const groups: TimelineGroup[] = [];
  let group: TimelineGroup | undefined;
  let period: TimelinePeriod | undefined;
  const startGroup = (name?: string[]): TimelineGroup => {
    const g: TimelineGroup = name === undefined ? { periods: [] } : { name, periods: [] };
    groups.push(g);
    period = undefined;
    return g;
  };

  for (const { text, line } of all.slice(1)) {
    const word = /^(\S+)\s*(.*)$/.exec(text);
    const key = word?.[1] ?? '';
    const rest = word?.[2] ?? '';
    if (key === 'title') {
      title = rest.replace(/\s+/g, ' ').trim();
      continue;
    }
    if (key === 'section') {
      group = startGroup(lines(rest));
      continue;
    }
    if (/^(accTitle|accDescr)\b/.test(key)) continue;
    const parts = text.split(':').map((p) => p.trim());
    const [first = '', ...events] = parts;
    const found = events.filter((e) => e !== '').map(lines);
    if (first === '') {
      if (period === undefined) throw new UrsulaError('An event line needs a time period before it.', 'timeline-event', line);
      period.events.push(...found);
      continue;
    }
    group ??= startGroup();
    period = { label: lines(first), events: found };
    group.periods.push(period);
  }

  const kept = groups.filter((g) => g.periods.length > 0);
  if (kept.length === 0) throw new UrsulaError('The timeline has no time periods.', 'timeline-empty');
  return { direction, ...(title === undefined || title === '' ? {} : { title }), groups: kept };
}
