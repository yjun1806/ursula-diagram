import { configSection } from '../front/options.ts';
import { UrsulaError } from '../types.ts';
import type { Gantt, GanttTask, TickUnit } from './model.ts';
import { addDuration, compileDateFormat, DAY, floorDiv, lengthLabel, parseDuration, skipExcluded, stretchOverExcluded, weekdayIndex } from './time.ts';
import type { DateFormat, Excludes } from './time.ts';

const TAGS = ['active', 'done', 'crit', 'milestone', 'vert'] as const;
type Tag = (typeof TAGS)[number];

const TICK_UNITS: Record<string, TickUnit> = { millisecond: 'ms', second: 's', minute: 'min', hour: 'h', day: 'd', week: 'w', month: 'M' };
const TICK_INTERVAL = /^([1-9][0-9]*)(millisecond|second|minute|hour|day|week|month)$/;
const KEYWORDS = new Set(['title', 'dateFormat', 'axisFormat', 'tickInterval', 'weekday', 'weekend', 'excludes', 'includes', 'section', 'todayMarker', 'inclusiveEndDates', 'topAxis', 'click', 'accTitle', 'accDescr']);

function fail(message: string, line: number, code: string): never {
  throw new UrsulaError(message, code, line);
}

type StartSpec = { kind: 'prev' } | { kind: 'after'; ids: string[] } | { kind: 'date'; text: string };
type EndSpec = { kind: 'until'; ids: string[] } | { kind: 'text'; text: string };

interface RawTask {
  line: number;
  label: string;
  section: number;
  id: string;
  tags: Set<Tag>;
  start: StartSpec;
  end: EndSpec;
}

function tickIntervalOf(text: string): Gantt['tickInterval'] {
  const m = TICK_INTERVAL.exec(text.trim());
  const unit = m === null ? undefined : TICK_UNITS[m[2] ?? ''];
  return m === null || unit === undefined ? undefined : { step: Number(m[1]), unit };
}

const stringOf = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined);

/**
 * Reads a Mermaid Gantt chart and works out every task's dates. `heading` is the title of a leading front-matter block
 * (a `title` line wins over it); `config` is its `config` map, of which only the `gantt` section is read.
 */
export function parseGantt(src: string, opts: { heading?: string; config?: unknown; frontMatter?: unknown } = {}): Gantt {
  const rows = src.split(/\r?\n/);
  const fromConfig = configSection(opts.config, 'gantt') ?? {};
  let title: string | undefined;
  let accTitle: string | undefined;
  let dateFormat = 'YYYY-MM-DD';
  let axisFormat = stringOf(fromConfig['axisFormat']);
  let tickInterval = tickIntervalOf(stringOf(fromConfig['tickInterval']) ?? '');
  const configWeekday = stringOf(fromConfig['weekday']);
  let weekday = configWeekday === undefined || weekdayIndex(configWeekday) < 0 ? undefined : weekdayIndex(configWeekday);
  let weekend: 'friday' | 'saturday' = 'saturday';
  const excludeTokens: Array<{ text: string; line: number }> = [];
  const sections: string[] = [];
  const raws: RawTask[] = [];
  let headerSeen = false;
  let inDescription = false;
  let autoId = 0;

  for (let n = 0; n < rows.length; n++) {
    const line = n + 1;
    const row = (rows[n] ?? '').replace(/%%(?!\{).*$/, '').trim();
    if (inDescription) {
      if (row.includes('}')) inDescription = false;
      continue;
    }
    if (row === '' || row.startsWith('%%')) continue;
    for (const piece of row.split(';')) {
      const s = piece.trim();
      if (s === '') continue;
      if (!headerSeen) {
        if (s !== 'gantt') fail('A Gantt chart starts with "gantt".', line, 'header');
        headerSeen = true;
        continue;
      }
      const word = /^([A-Za-z]+)(?=:|\s|$)/.exec(s)?.[1] ?? '';
      const rest = s.slice(word.length).replace(/^:/, '').trim();
      if (word === 'accDescr') {
        if (s.slice(word.length).trim().startsWith('{') && !s.includes('}')) inDescription = true;
        continue;
      }
      if (KEYWORDS.has(word)) {
        switch (word) {
          case 'accTitle':
            if (rest !== '') accTitle = rest;
            break;
          case 'title':
            if (rest === '') fail('A title needs text.', line, 'gantt-title');
            title = rest;
            break;
          case 'dateFormat':
            if (rest !== '') dateFormat = rest;
            break;
          case 'axisFormat':
            if (rest !== '') axisFormat = rest;
            break;
          case 'tickInterval':
            tickInterval = tickIntervalOf(rest) ?? tickInterval;
            break;
          case 'weekday': {
            const day = weekdayIndex(rest);
            if (day < 0) fail(`"${rest}" is not a day of the week.`, line, 'gantt-weekday');
            weekday = day;
            break;
          }
          case 'weekend':
            if (rest !== 'friday' && rest !== 'saturday') fail('weekend takes "friday" or "saturday".', line, 'gantt-weekend');
            weekend = rest;
            break;
          case 'excludes':
            for (const text of rest.split(/[\s,]+/)) if (text !== '') excludeTokens.push({ text, line });
            break;
          case 'section':
            if (rest === '') fail('A section needs a name.', line, 'gantt-section');
            sections.push(rest);
            break;
          default:
            // includes, todayMarker, inclusiveEndDates, topAxis and click are read and left out of the drawing.
            break;
        }
        continue;
      }

      const colon = s.indexOf(':');
      if (colon < 0) fail(`Cannot read "${s}"; a task is written "name : start, end".`, line, 'syntax');
      const label = s.slice(0, colon).trim();
      const items = s
        .slice(colon + 1)
        .split(',')
        .map((i) => i.trim());
      const tags = new Set<Tag>();
      for (;;) {
        const first = items[0];
        const tag = TAGS.find((t) => t === first);
        if (tag === undefined) break;
        tags.add(tag);
        items.shift();
      }
      if (items.some((i) => i === '')) fail(`"${s}" has an empty item between commas.`, line, 'syntax');
      if (sections.length === 0) sections.push('');
      const section = sections.length - 1;
      autoId += 1;
      const startOf = (text: string): StartSpec => {
        const after = /^after\s+(.+)$/.exec(text);
        return after === null ? { kind: 'date', text } : { kind: 'after', ids: (after[1] ?? '').split(/\s+/) };
      };
      const endOf = (text: string): EndSpec => {
        const until = /^until\s+(.+)$/.exec(text);
        return until === null ? { kind: 'text', text } : { kind: 'until', ids: (until[1] ?? '').split(/\s+/) };
      };
      const make = (id: string | undefined, start: StartSpec, end: EndSpec): void => {
        raws.push({ line, label, section, id: id ?? `task${autoId}`, tags, start, end });
      };
      const [a, b, c] = items;
      if (items.length === 1 && a !== undefined) make(undefined, { kind: 'prev' }, endOf(a));
      else if (items.length === 2 && a !== undefined && b !== undefined) make(undefined, startOf(a), endOf(b));
      else if (items.length === 3 && a !== undefined && b !== undefined && c !== undefined) make(a, startOf(b), endOf(c));
      else fail(`"${s}" needs one to three items after the colon (an end, "start, end" or "id, start, end").`, line, 'syntax');
    }
  }

  if (!headerSeen) fail('A Gantt chart starts with "gantt".', 1, 'header');

  const format = compileDateFormat(dateFormat);
  const excludes = readExcludes(excludeTokens, weekend, format);
  const tasks = resolve(raws, format, excludes);

  // Sections without a task would leave a gap in the colour order.
  const used = [...new Set(tasks.map((t) => t.section))].sort((x, y) => x - y);
  const renumber = new Map(used.map((old, i) => [old, i]));
  const kept: GanttTask[] = tasks.map((t) => ({ ...t, section: renumber.get(t.section) ?? 0 }));

  const heading = opts.heading;
  const topMode = typeof opts.frontMatter === 'object' && opts.frontMatter !== null && 'displayMode' in opts.frontMatter ? opts.frontMatter.displayMode : undefined;
  const compact = topMode === 'compact' || stringOf(fromConfig['displayMode']) === 'compact';
  return {
    ...(title !== undefined ? { title } : heading !== undefined && heading !== '' ? { title: heading } : {}),
    ...(accTitle === undefined ? {} : { accTitle }),
    sections: used.map((i) => sections[i] ?? ''),
    tasks: kept,
    excludes,
    dateFormat,
    ...(axisFormat === undefined ? {} : { axisFormat }),
    ...(tickInterval === undefined ? {} : { tickInterval }),
    ...(weekday === undefined ? {} : { weekday }),
    ...(compact ? { compact: true as const } : {}),
  };
}

function readExcludes(tokens: Array<{ text: string; line: number }>, weekend: 'friday' | 'saturday', format: DateFormat): Excludes {
  const weekdays = new Set<number>();
  const days = new Set<number>();
  const iso = compileDateFormat('YYYY-MM-DD');
  for (const { text } of tokens) {
    const lower = text.toLowerCase();
    if (lower === 'weekends') {
      for (const d of weekend === 'friday' ? [5, 6] : [6, 0]) weekdays.add(d);
      continue;
    }
    const day = weekdayIndex(lower);
    if (day >= 0) {
      weekdays.add(day);
      continue;
    }
    const t = format.parse(text) ?? iso.parse(text);
    if (t !== undefined) days.add(floorDiv(t, DAY));
  }
  return { weekdays: [...weekdays].sort((a, b) => a - b), days: [...days].sort((a, b) => a - b) };
}

interface Resolved {
  start: number;
  end: number;
  durationText: string;
  after: number[];
}

/** Works out start and end of every task; a task can follow one written later, so it repeats until nothing is left. */
function resolve(raws: RawTask[], format: DateFormat, excludes: Excludes): GanttTask[] {
  const byId = new Map<string, number>();
  raws.forEach((r, i) => byId.set(r.id, i));
  const done: Array<Resolved | undefined> = raws.map(() => undefined);

  const idsToIndexes = (ids: string[], line: number): number[] =>
    ids.map((id) => {
      const i = byId.get(id);
      if (i === undefined) fail(`"${id}" names no task.`, line, 'gantt-reference');
      return i;
    });

  const attempt = (i: number): boolean => {
    const raw = raws[i];
    if (raw === undefined) return false;
    let start: number;
    let after: number[] = [];
    if (raw.start.kind === 'prev') {
      if (i === 0) fail('The first task needs a start date; write "name : start, end" or "name : id, start, end".', raw.line, 'gantt-no-start');
      const prev = done[i - 1];
      if (prev === undefined) return false;
      start = skipExcluded(prev.end, excludes);
    } else if (raw.start.kind === 'after') {
      after = idsToIndexes(raw.start.ids, raw.line);
      const preds = after.map((p) => done[p]);
      if (preds.some((p) => p === undefined)) return false;
      start = skipExcluded(Math.max(...preds.map((p) => p?.end ?? 0)), excludes);
    } else {
      const t = format.parse(raw.start.text);
      if (t === undefined) fail(`"${raw.start.text}" is not a date in the format ${format.source}.`, raw.line, 'gantt-date');
      start = t;
    }

    let end: number;
    let durationText: string | undefined;
    if (raw.end.kind === 'until') {
      const targets = idsToIndexes(raw.end.ids, raw.line).map((p) => done[p]);
      if (targets.some((p) => p === undefined)) return false;
      end = Math.min(...targets.map((p) => p?.start ?? 0));
    } else {
      const text = raw.end.text;
      const date = format.parse(text);
      const duration = parseDuration(text);
      if (date !== undefined) end = date;
      else if (duration !== undefined) {
        end = stretchOverExcluded(start, addDuration(start, duration), excludes);
        durationText = text;
      } else if (/^[\d.]/.test(text)) {
        // A malformed length such as "3dX" counts as no length.
        end = start;
      } else fail(`"${text}" is neither a date in the format ${format.source} nor a length such as 3d.`, raw.line, 'gantt-date');
    }
    if (end < start) fail(`"${raw.label}" ends before it starts.`, raw.line, 'gantt-order');
    done[i] = { start, end, durationText: durationText ?? lengthLabel(start, end), after };
    return true;
  };

  let left = raws.length;
  while (left > 0) {
    let progress = false;
    raws.forEach((_, i) => {
      if (done[i] === undefined && attempt(i)) {
        progress = true;
        left -= 1;
      }
    });
    if (!progress) {
      const stuck = raws.findIndex((_, i) => done[i] === undefined);
      fail(`"${raws[stuck]?.label ?? ''}" waits on a task that waits on it.`, raws[stuck]?.line ?? 1, 'gantt-cycle');
    }
  }

  return raws.map((raw, i): GanttTask => {
    const r = done[i];
    if (r === undefined) throw new UrsulaError('Unresolved task.', 'gantt-cycle', raw.line);
    return {
      id: raw.id,
      label: raw.label,
      section: raw.section,
      line: raw.line,
      start: r.start,
      end: r.end,
      active: raw.tags.has('active'),
      done: raw.tags.has('done'),
      crit: raw.tags.has('crit'),
      milestone: raw.tags.has('milestone'),
      vert: raw.tags.has('vert'),
      durationText: r.durationText,
      after: r.after,
    };
  });
}
