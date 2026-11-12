import { nearestSeries } from '../chart/series-color.ts';
import { configSection } from '../front/options.ts';
import { UrsulaError } from '../types.ts';
import type { Graticule, Radar, RadarAxis, RadarCurve } from './model.ts';

const NUMBER = /^[-+]?(?:\d+\.?\d*|\.\d+)$/u;
const ID = /^[\w-]+/u;

function fail(message: string, line: number, code = 'syntax'): never {
  throw new UrsulaError(message, code, line);
}

/** Removes a `%%` comment. */
function stripComment(line: string): string {
  const at = line.indexOf('%%');
  return at < 0 ? line : line.slice(0, at);
}

function unquote(text: string): string {
  const t = text.trim();
  const q = t[0];
  return t.length >= 2 && (q === '"' || q === "'") && t.endsWith(q) ? t.slice(1, -1) : t;
}

interface Entry {
  id: string;
  label?: string;
  /** Text between the braces of a curve. */
  body?: string;
}

/** Reads `id["label"]{body}, id2 ...` from `text`; the braces are required when `withBody` is set. */
function readEntries(text: string, withBody: boolean, line: number): Entry[] {
  const entries: Entry[] = [];
  let i = 0;
  const skip = (): void => {
    while (i < text.length && /\s/u.test(text[i] ?? '')) i++;
  };
  for (;;) {
    skip();
    const id = ID.exec(text.slice(i))?.[0];
    if (id === undefined) fail(`expected an id, found "${text.slice(i, i + 12)}"`, line);
    i += id.length;
    const entry: Entry = { id };
    skip();
    if (text[i] === '[') {
      i++;
      skip();
      const q = text[i];
      let label: string;
      if (q === '"' || q === "'") {
        const end = text.indexOf(q, i + 1);
        if (end < 0) fail(`unterminated label of "${id}"`, line);
        label = text.slice(i + 1, end);
        i = end + 1;
        skip();
        if (text[i] !== ']') fail(`expected "]" after the label of "${id}"`, line);
        i++;
      } else {
        const end = text.indexOf(']', i);
        if (end < 0) fail(`unterminated label of "${id}"`, line);
        label = text.slice(i, end).trim();
        i = end + 1;
      }
      entry.label = label;
      skip();
    }
    if (withBody) {
      if (text[i] !== '{') fail(`curve "${id}" needs its values in braces`, line);
      const end = text.indexOf('}', i);
      if (end < 0) fail(`unterminated values of "${id}"`, line);
      entry.body = text.slice(i + 1, end);
      i = end + 1;
      skip();
    }
    entries.push(entry);
    if (i >= text.length) return entries;
    if (text[i] !== ',') fail(`expected "," after "${id}", found "${text.slice(i, i + 12)}"`, line);
    i++;
  }
}

function parseNumber(text: string, what: string, line: number): number {
  const t = text.trim();
  if (!NUMBER.test(t)) fail(`${what} must be a number, found "${t}"`, line);
  return Number(t);
}

interface RawCurve {
  id: string;
  label: string;
  positional: number[];
  keyed: Map<string, number>;
  line: number;
}

function readValues(entry: Entry, line: number): RawCurve {
  const positional: number[] = [];
  const keyed = new Map<string, number>();
  for (const part of (entry.body ?? '').split(',')) {
    const colon = part.indexOf(':');
    if (colon < 0) {
      positional.push(parseNumber(part, `value of "${entry.id}"`, line));
    } else {
      const key = part.slice(0, colon).trim();
      if (keyed.has(key)) fail(`curve "${entry.id}" gives axis "${key}" twice`, line);
      keyed.set(key, parseNumber(part.slice(colon + 1), `value of "${entry.id}" on "${key}"`, line));
    }
  }
  if (positional.length > 0 && keyed.size > 0) fail(`curve "${entry.id}" mixes plain and "axis: value" entries`, line);
  return { id: entry.id, label: entry.label ?? entry.id, positional, keyed, line };
}

/** Parses the Mermaid `radar-beta` diagram; `heading` is the title of a front matter block, used when the body has none. */
/** Curve colours (`cScale<i>`) and the curve opacity (`radar.curveOpacity`) of the theme variables of a front-matter `config` map. */
function readThemeVariables(config: unknown): Pick<Radar, 'colors' | 'filled'> {
  const vars = configSection(config, 'themeVariables');
  if (vars === undefined) return { filled: true };
  const colors: Array<number | undefined> = [];
  for (const [key, value] of Object.entries(vars)) {
    const m = /^cScale(\d+)$/u.exec(key);
    if (m === null || typeof value !== 'string' || !/^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/iu.test(value.trim())) continue;
    colors[Number(m[1])] = nearestSeries(value.trim());
  }
  const opacity = configSection(vars, 'radar')?.['curveOpacity'];
  return { ...(colors.length > 0 ? { colors } : {}), filled: opacity !== 0 };
}

export function parseRadar(src: string, heading?: string, config?: unknown): Radar {
  const rows = src.split(/\r?\n/);
  let title = heading;
  const axes: RadarAxis[] = [];
  const raws: RawCurve[] = [];
  const out: Omit<Radar, 'axes' | 'curves' | 'filled'> = { graticule: 'circle', showLegend: true };
  let max: number | undefined;
  let min: number | undefined;
  let ticks: number | undefined;
  let headerSeen = false;
  let block = false;

  for (let n = 0; n < rows.length; n++) {
    const lineNo = n + 1;
    const s = stripComment(rows[n] ?? '').trim();
    if (s === '') continue;
    if (block) {
      if (s.includes('}')) block = false;
      continue;
    }
    if (!headerSeen) {
      if (!/^radar(?:-beta)?$/u.test(s)) fail(`a radar diagram starts with "radar-beta", found "${s}"`, lineNo, 'header');
      headerSeen = true;
      continue;
    }
    const m = /^([A-Za-z]+)\b\s*(.*)$/u.exec(s);
    const keyword = m?.[1] ?? '';
    const rest = (m?.[2] ?? '').trim();
    switch (keyword) {
      case 'title':
        if (rest === '') fail('title needs a text', lineNo);
        title = unquote(rest);
        break;
      case 'accTitle':
        break;
      case 'accDescr':
        if (rest.startsWith('{') && !rest.includes('}')) block = true;
        break;
      case 'axis':
        for (const e of readEntries(rest, false, lineNo)) {
          if (axes.some((a) => a.id === e.id)) fail(`axis "${e.id}" is defined twice`, lineNo);
          axes.push({ id: e.id, label: e.label ?? e.id });
        }
        break;
      case 'curve':
        for (const e of readEntries(rest, true, lineNo)) {
          if (raws.some((c) => c.id === e.id)) fail(`curve "${e.id}" is defined twice`, lineNo);
          raws.push(readValues(e, lineNo));
        }
        break;
      case 'max':
        max = parseNumber(rest, 'max', lineNo);
        break;
      case 'min':
        min = parseNumber(rest, 'min', lineNo);
        break;
      case 'ticks': {
        const t = parseNumber(rest, 'ticks', lineNo);
        if (!Number.isInteger(t) || t < 1) fail(`ticks must be a whole number of at least 1, found "${rest}"`, lineNo);
        ticks = t;
        break;
      }
      case 'graticule':
        if (rest !== 'circle' && rest !== 'polygon') fail(`graticule is "circle" or "polygon", found "${rest}"`, lineNo);
        out.graticule = rest as Graticule;
        break;
      case 'showLegend':
        if (rest !== 'true' && rest !== 'false') fail(`showLegend is "true" or "false", found "${rest}"`, lineNo);
        out.showLegend = rest === 'true';
        break;
      default:
        fail(`unknown statement "${s}"`, lineNo);
    }
  }
  if (!headerSeen) fail('empty diagram; a radar diagram starts with "radar-beta"', Math.max(1, rows.length), 'header');
  if (axes.length === 0) fail('a radar diagram needs at least one axis', rows.length);

  const curves: RadarCurve[] = raws.map((raw) => {
    if (raw.keyed.size > 0) {
      const values = axes.map((a) => {
        const v = raw.keyed.get(a.id);
        if (v === undefined) fail(`curve "${raw.id}" has no value for axis "${a.id}"`, raw.line);
        return v;
      });
      for (const key of raw.keyed.keys()) if (!axes.some((a) => a.id === key)) fail(`curve "${raw.id}" names the unknown axis "${key}"`, raw.line);
      return { id: raw.id, label: raw.label, values };
    }
    if (raw.positional.length !== axes.length) {
      fail(`curve "${raw.id}" has ${raw.positional.length} values for ${axes.length} axes`, raw.line);
    }
    return { id: raw.id, label: raw.label, values: raw.positional };
  });

  return {
    ...out,
    ...readThemeVariables(config),
    ...(title === undefined ? {} : { title }),
    axes,
    curves,
    ...(max === undefined ? {} : { max }),
    ...(min === undefined ? {} : { min }),
    ...(ticks === undefined ? {} : { ticks }),
  };
}
