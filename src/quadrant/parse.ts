import type { FrontValue } from '../front-matter.ts';
import { UrsulaError } from '../types.ts';

export interface AxisLabels {
  /** Left end of the x axis, bottom end of the y axis. */
  low: string;
  /** Right end of the x axis, top end of the y axis; absent when the source names one end only. */
  high?: string;
}

export interface QuadrantPoint {
  name: string;
  /** 0 to 1 from the left. */
  x: number;
  /** 0 to 1 from the bottom. */
  y: number;
  /** Radius in pixels from the point's own style or its class; absent for the default radius. */
  radius?: number;
  /** Fill colour (`#rgb` or `#rrggbb`) from the point's own style or its class; absent for the default colour. */
  color?: string;
  /** Source text of the coordinates, kept for the text table. */
  xText: string;
  yText: string;
  line: number;
}

export interface QuadrantChart {
  title?: string;
  /** Accessible title and description (`accTitle`, `accDescr`). */
  accTitle?: string;
  accDescr?: string;
  xAxis?: AxisLabels;
  yAxis?: AxisLabels;
  /** Names of quadrant-1 (top right), quadrant-2 (top left), quadrant-3 (bottom left) and quadrant-4 (bottom right); empty when not named. */
  quadrants: [string, string, string, string];
  points: QuadrantPoint[];
  /** Size of the plot square from `chartWidth` and `chartHeight` of the configuration. */
  chartWidth?: number;
  chartHeight?: number;
  /** Style and configuration entries that were read and left out of the drawing. */
  ignored: string[];
}

const POINT = /^(.+?)(?::::([A-Za-z_][\w-]*))?\s*:\s*\[\s*([-+]?(?:\d+\.?\d*|\.\d+))\s*,\s*([-+]?(?:\d+\.?\d*|\.\d+))\s*\]\s*(.*)$/u;
const STYLE_KEYS = new Set(['radius', 'color', 'stroke-color', 'stroke-width']);

function fail(message: string, line: number, code = 'syntax'): never {
  throw new UrsulaError(message, code, line);
}

function unquote(text: string): string {
  const t = text.trim();
  return t.length >= 2 && t.startsWith('"') && t.endsWith('"') ? t.slice(1, -1).trim() : t;
}

function stripComment(line: string): string {
  const at = line.indexOf('%%');
  return at < 0 ? line : line.slice(0, at);
}

interface Style {
  radius?: number;
  color?: string;
  ignoredKeys: string[];
}

/** Reads `key: value, key: value`; the radius and the fill colour shape the drawing, the stroke is left out. */
function parseStyle(text: string, line: number): Style {
  const out: Style = { ignoredKeys: [] };
  for (const part of text.split(',')) {
    const piece = part.trim();
    if (piece === '') continue;
    const at = piece.indexOf(':');
    if (at < 0) fail(`Expected "key: value" in a style, got "${piece}".`, line);
    const key = piece.slice(0, at).trim();
    const value = piece.slice(at + 1).trim();
    if (!STYLE_KEYS.has(key)) fail(`Unknown style "${key}"; use radius, color, stroke-color or stroke-width.`, line);
    if (key === 'radius') {
      const m = /^(\d+(?:\.\d+)?)(?:px)?$/u.exec(value);
      if (m === null) fail(`radius must be a number, got "${value}".`, line);
      out.radius = Number(m[1]);
    } else if (key === 'color' && /^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/iu.test(value)) {
      out.color = value;
    } else {
      out.ignoredKeys.push(key);
    }
  }
  return out;
}

function parseAxis(rest: string, what: string, line: number): AxisLabels {
  const at = rest.indexOf('-->');
  const low = unquote(at < 0 ? rest : rest.slice(0, at));
  if (low === '') fail(`${what} needs a label.`, line);
  if (at < 0) return { low };
  const high = unquote(rest.slice(at + 3));
  return high === '' ? { low } : { low, high };
}

function chartSize(text: string, key: 'chartWidth' | 'chartHeight', line: number): number | undefined {
  const m = new RegExp(`${key}"?\\s*:\\s*(\\d+(?:\\.\\d+)?)`, 'u').exec(text);
  if (m === null) return undefined;
  const v = Number(m[1]);
  if (v < 80) fail(`${key} must be at least 80, got ${v}.`, line);
  return v;
}

/** Parses the Mermaid quadrant chart syntax. */
export function parseQuadrant(src: string, opts: { heading?: string; config?: Record<string, FrontValue> } = {}): QuadrantChart {
  const rows = src.split(/\r?\n/);
  const ignored = new Set<string>();
  const chart: QuadrantChart = { quadrants: ['', '', '', ''], points: [], ignored: [] };
  const classRadius = new Map<string, number | undefined>();
  const classColor = new Map<string, string | undefined>();
  const pointClass: Array<string | undefined> = [];
  let n = 0;
  if (opts.heading !== undefined) chart.title = opts.heading;
  const cfg = opts.config;
  const section = cfg?.['quadrantChart'];
  const own = section !== null && typeof section === 'object' ? section : {};
  for (const [key, value] of Object.entries(own)) {
    if ((key === 'chartWidth' || key === 'chartHeight') && typeof value === 'number' && value >= 80) chart[key] = value;
    else ignored.add(`config ${key}`);
  }
  for (const key of Object.keys(cfg ?? {})) if (key !== 'quadrantChart') ignored.add(`config ${key}`);

  let headerSeen = false;
  for (; n < rows.length; n++) {
    const lineNo = n + 1;
    const raw = rows[n] ?? '';
    if (raw.trim().startsWith('%%{')) {
      ignored.add('init directive');
      const w = chartSize(raw, 'chartWidth', lineNo);
      const h = chartSize(raw, 'chartHeight', lineNo);
      if (w !== undefined) chart.chartWidth = w;
      if (h !== undefined) chart.chartHeight = h;
      continue;
    }
    const s = stripComment(raw).trim();
    if (s === '') continue;
    if (!headerSeen) {
      if (s !== 'quadrantChart') fail(`Expected "quadrantChart" before "${s}".`, lineNo);
      headerSeen = true;
      continue;
    }

    let m: RegExpExecArray | null;
    if ((m = /^accTitle\s*:\s*(.*)$/u.exec(s)) !== null) {
      chart.accTitle = (m[1] ?? '').trim();
    } else if ((m = /^accDescr\s*:\s*(.*)$/u.exec(s)) !== null) {
      chart.accDescr = (m[1] ?? '').trim();
    } else if (/^accDescr\s*\{\s*$/u.test(s)) {
      const body: string[] = [];
      for (n++; n < rows.length && (rows[n] ?? '').trim() !== '}'; n++) body.push((rows[n] ?? '').trim());
      if (n >= rows.length) fail('accDescr block is not closed with "}".', lineNo);
      chart.accDescr = body.filter((l) => l !== '').join(' ');
    } else if ((m = /^title\s+(.+)$/u.exec(s)) !== null) {
      chart.title = unquote(m[1] ?? '');
    } else if ((m = /^x-axis\s+(.+)$/u.exec(s)) !== null) {
      chart.xAxis = parseAxis(m[1] ?? '', 'x-axis', lineNo);
    } else if ((m = /^y-axis\s+(.+)$/u.exec(s)) !== null) {
      chart.yAxis = parseAxis(m[1] ?? '', 'y-axis', lineNo);
    } else if ((m = /^quadrant-([1-4])\s+(.+)$/u.exec(s)) !== null) {
      chart.quadrants[Number(m[1]) - 1] = unquote(m[2] ?? '');
    } else if ((m = /^classDef\s+([A-Za-z_][\w-]*)\s+(.+)$/u.exec(s)) !== null) {
      const style = parseStyle(m[2] ?? '', lineNo);
      for (const k of style.ignoredKeys) ignored.add(`classDef ${k}`);
      classRadius.set(m[1] ?? '', style.radius);
      classColor.set(m[1] ?? '', style.color);
    } else if ((m = POINT.exec(s)) !== null) {
      const x = Number(m[3]);
      const y = Number(m[4]);
      if (x < 0 || x > 1 || y < 0 || y > 1) fail(`Coordinates must be between 0 and 1, got [${m[3]}, ${m[4]}].`, lineNo);
      const style = parseStyle(m[5] ?? '', lineNo);
      for (const k of style.ignoredKeys) ignored.add(`point ${k}`);
      const point: QuadrantPoint = { name: unquote(m[1] ?? ''), x, y, xText: m[3] ?? '', yText: m[4] ?? '', line: lineNo };
      if (style.radius !== undefined) point.radius = style.radius;
      if (style.color !== undefined) point.color = style.color;
      chart.points.push(point);
      pointClass.push(m[2]);
    } else {
      fail(`Unrecognised line "${s}".`, lineNo);
    }
  }
  if (!headerSeen) fail('Missing "quadrantChart" header.', 1);

  chart.points.forEach((p, i) => {
    const cls = pointClass[i];
    if (p.radius === undefined && cls !== undefined) {
      const r = classRadius.get(cls);
      if (r !== undefined) p.radius = r;
    }
    if (p.color === undefined && cls !== undefined) {
      const c = classColor.get(cls);
      if (c !== undefined) p.color = c;
    }
  });
  chart.ignored = [...ignored];
  return chart;
}

/** Quadrant number (1 top right, 2 top left, 3 bottom left, 4 bottom right) a point lies in; the middle lines belong to the upper right. */
export function quadrantOf(x: number, y: number): 1 | 2 | 3 | 4 {
  if (x >= 0.5) return y >= 0.5 ? 1 : 4;
  return y >= 0.5 ? 2 : 3;
}
