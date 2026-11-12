import { UrsulaError } from '../types.ts';
import type { FrontValue } from '../front-matter.ts';
import type { XyChart, XyConfig, XyPoint, XyRange, XySeries } from './model.ts';

const NUMBER = String.raw`[+-]?(?:\d+\.?\d*|\.\d+)`;
const RANGE = new RegExp(String.raw`^(${NUMBER})\s*-->\s*(${NUMBER})$`);
const VALUE = new RegExp(String.raw`^(${NUMBER})\s*(?:"([^"]*)")?$`);
const HEADER = /^(xychart-beta|xychart)(?:\s+(horizontal|vertical))?$/;

function fail(message: string, line: number): never {
  throw new UrsulaError(message, 'syntax', line);
}

/** Removes a `%%` comment that is not inside quotes. */
function stripComment(row: string): string {
  let quoted = false;
  for (let i = 0; i < row.length; i++) {
    const ch = row[i];
    if (ch === '"') quoted = !quoted;
    else if (!quoted && ch === '%' && row[i + 1] === '%') return row.slice(0, i);
  }
  return row;
}

/** Number of `[` still open at the end of `text`, not counting those inside quotes. */
function openBrackets(text: string): number {
  let quoted = false;
  let depth = 0;
  for (const ch of text) {
    if (ch === '"') quoted = !quoted;
    else if (!quoted && ch === '[') depth++;
    else if (!quoted && ch === ']') depth--;
  }
  return depth;
}

/** Splits at commas that are not inside quotes. */
function splitList(text: string): string[] {
  const parts: string[] = [];
  let quoted = false;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') quoted = !quoted;
    else if (!quoted && ch === ',') {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts.map((p) => p.trim());
}

const unquote = (text: string): string => (text.length >= 2 && text.startsWith('"') && text.endsWith('"') ? text.slice(1, -1) : text);

/** Reads the `xyChart` section of the options a front matter gave; values of an unexpected type are ignored. */
export function readXyConfig(config: Record<string, FrontValue> | undefined): { config: XyConfig; horizontal?: boolean } {
  const section = config?.['xyChart'];
  const raw: Record<string, FrontValue> = section !== null && typeof section === 'object' ? section : {};
  const out: XyConfig = {};
  const size = (k: string): number | undefined => {
    const v = raw[k];
    return typeof v === 'number' && v > 0 ? v : undefined;
  };
  const flag = (k: string): boolean | undefined => {
    const v = raw[k];
    return typeof v === 'boolean' ? v : undefined;
  };
  const width = size('width');
  const height = size('height');
  const labels = flag('showDataLabel');
  const outside = flag('showDataLabelOutsideBar');
  const title = flag('showTitle');
  const legend = flag('showLegend');
  if (width !== undefined) out.width = width;
  if (height !== undefined) out.height = height;
  if (labels !== undefined) out.showDataLabel = labels;
  if (outside !== undefined) out.showDataLabelOutsideBar = outside;
  if (title !== undefined) out.showTitle = title;
  if (legend !== undefined) out.showLegend = legend;
  const orientation = raw['chartOrientation'];
  return orientation === 'horizontal' ? { config: out, horizontal: true } : orientation === 'vertical' ? { config: out, horizontal: false } : { config: out };
}

/** Reads a quoted text or a bare word at the start of `text`; the rest follows. */
function readName(text: string, line: number): { name: string; rest: string } | undefined {
  const t = text.trimStart();
  if (t.startsWith('"')) {
    const close = t.indexOf('"', 1);
    if (close < 0) fail('A quoted text is not closed.', line);
    return { name: t.slice(1, close), rest: t.slice(close + 1) };
  }
  const m = /^[^\s[\]"]+/.exec(t);
  if (!m) return undefined;
  return { name: m[0], rest: t.slice(m[0].length) };
}

function parseRange(text: string, line: number): XyRange {
  const m = RANGE.exec(text.trim());
  if (!m) fail(`Expected a range such as "0 --> 100", got "${text.trim()}".`, line);
  const min = Number(m[1]);
  const max = Number(m[2]);
  if (!(max > min)) fail('The end of an axis range must be greater than its start.', line);
  return { min, max };
}

interface AxisText {
  title?: string;
  categories?: string[];
  range?: XyRange;
}

function parseAxis(rest: string, line: number, categorical: boolean): AxisText {
  const out: AxisText = {};
  let text = rest.trim();
  if (text.startsWith('[')) {
    // no title
  } else if (text.startsWith('"')) {
    const read = readName(text, line);
    if (read) {
      out.title = read.name;
      text = read.rest.trim();
    }
  } else if (text !== '' && !RANGE.test(text)) {
    const read = readName(text, line);
    if (read) {
      out.title = read.name;
      text = read.rest.trim();
    }
  }
  if (text.startsWith('[')) {
    if (!categorical) fail('The y-axis takes a range, not a list of names.', line);
    if (!text.endsWith(']')) fail('A list of names is not closed with "]".', line);
    const items = splitList(text.slice(1, -1)).map(unquote);
    if (items.some((c) => c === '')) fail('A list of names has an empty entry.', line);
    out.categories = items;
  } else if (text !== '') {
    out.range = parseRange(text, line);
  }
  return out;
}

function parseSeries(kind: 'bar' | 'line', rest: string, line: number): XySeries {
  let text = rest.trim();
  let name: string | undefined;
  if (!text.startsWith('[')) {
    const read = readName(text, line);
    if (!read) fail(`Expected a list of values after "${kind}".`, line);
    name = read.name;
    text = read.rest.trim();
  }
  if (!text.startsWith('[') || !text.endsWith(']')) fail(`Expected a list of values in brackets after "${kind}".`, line);
  const points: XyPoint[] = [];
  for (const item of splitList(text.slice(1, -1))) {
    const m = VALUE.exec(item);
    if (!m) fail(`"${item}" is not a number with an optional quoted label.`, line);
    const point: XyPoint = { value: Number(m[1]), raw: m[1] ?? '' };
    if (m[2] !== undefined) point.label = m[2];
    points.push(point);
  }
  if (points.length === 0) fail(`The ${kind} has no values.`, line);
  const series: XySeries = { kind, points, line };
  if (name !== undefined) series.name = name;
  return series;
}

/** Parses the supported Mermaid XY chart subset. */
export function parseXychart(src: string, config?: Record<string, FrontValue>, heading?: string): XyChart {
  const rows = src.split(/\r?\n/);
  const front = readXyConfig(config);
  const chart: XyChart = { horizontal: front.horizontal ?? false, series: [], config: front.config };
  if (heading !== undefined) chart.title = heading;
  let headerSeen = false;
  let buffer = '';
  let bufferLine = 0;

  const statement = (text: string, line: number): void => {
    if (!headerSeen) {
      const m = HEADER.exec(text);
      if (!m) fail(`Expected "xychart" as the first statement, got "${text}".`, line);
      headerSeen = true;
      if (m[2] === 'horizontal') chart.horizontal = true;
      if (m[2] === 'vertical') chart.horizontal = false;
      return;
    }
    const word = /^[A-Za-z-]+/.exec(text)?.[0] ?? '';
    const rest = text.slice(word.length);
    if (rest !== '' && !/^\s/.test(rest) && !rest.startsWith('[') && !rest.startsWith('"')) fail(`Unknown statement "${text}".`, line);
    switch (word) {
      case 'title': {
        const title = unquote(rest.trim());
        if (title === '') fail('The title is empty.', line);
        chart.title = title;
        return;
      }
      case 'x-axis': {
        const axis = parseAxis(rest, line, true);
        if (axis.title !== undefined) chart.xTitle = axis.title;
        if (axis.categories) chart.categories = axis.categories;
        if (axis.range) chart.xRange = axis.range;
        return;
      }
      case 'y-axis': {
        const axis = parseAxis(rest, line, false);
        if (axis.title !== undefined) chart.yTitle = axis.title;
        if (axis.range) chart.yRange = axis.range;
        return;
      }
      case 'bar':
      case 'line':
        chart.series.push(parseSeries(word, rest, line));
        return;
      default:
        fail(`Unknown statement "${text}".`, line);
    }
  };

  for (let n = 0; n < rows.length; n++) {
    const body = stripComment(rows[n] ?? '').trim();
    if (buffer === '' && body === '') continue;
    if (buffer === '') bufferLine = n + 1;
    buffer = buffer === '' ? body : `${buffer} ${body}`;
    if (openBrackets(buffer) > 0) continue;
    statement(buffer, bufferLine);
    buffer = '';
  }
  if (buffer !== '') fail('A list is not closed with "]".', bufferLine);
  if (!headerSeen) fail('Expected "xychart" as the first statement.', 1);
  if (chart.series.length === 0) fail('The chart needs at least one bar or line.', bufferLine || rows.length);
  if (chart.categories) {
    for (const s of chart.series) {
      if (s.points.length > (chart.categories.length)) fail(`The ${s.kind} has ${s.points.length} values for ${chart.categories.length} names.`, s.line);
    }
  }
  return chart;
}
