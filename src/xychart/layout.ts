import { trimmedNumber } from '../chart/format.ts';
import { ceilTo, FLOAT_NOISE, floorTo, GRID, round2 } from '../chart/grid.ts';
import { anchoredBox, clashCost, pickLeastClash, trendAt } from '../chart/label-place.ts';
import type { Box, TextAnchor } from '../chart/label-place.ts';
import { monotonePath } from '../chart/monotone.ts';
import { niceTicks } from '../chart/ticks.ts';
import type { Ruler } from '../metrics.ts';
import { SCENE_THEME_SPECS } from '../render/scene-theme.ts';
import type { SceneThemeSpec } from '../render/scene-theme.ts';
import type { Theme } from '../render/theme.ts';
import { wrapWords } from '../text/wrap.ts';
import type { Point, Scene, SceneItem, SceneText } from '../types.ts';
import { UrsulaError } from '../types.ts';
import type { XyChart, XyRange, XySeries } from './model.ts';

const MARGIN = 40;
const RIGHT = 48;
const CELL = 60;
const BAND = 48;
const MIN_PLOT = 480;
const PLOT_HEIGHT = 280;
const PLOT_LENGTH = 560;
const TICK_TARGET = 40;
const LABEL_H = 12;

/** Width of `text` set at `px` pixels, from the ruler's 12px measure. */
function widthOf(ruler: Ruler, text: string, px: number, bold = false): number {
  return (ruler.textWidth(text, 'line') * px * (bold ? 1.05 : 1)) / 12;
}

const up4 = (v: number): number => ceilTo(v, GRID, FLOAT_NOISE);
const up16 = (v: number): number => ceilTo(v, 16, FLOAT_NOISE);
const down4 = (v: number): number => floorTo(v, GRID, FLOAT_NOISE);

interface TickSet {
  range: XyRange;
  ticks: number[];
}

/**
 * Value-axis ticks. A range from the source keeps both ends as ticks and adds the nice values between them;
 * without one the axis spans the nice ticks around the data. The step is the one whose spacing is closest to 40px.
 */
function chooseTicks(lo: number, hi: number, fixed: boolean, length: number, minSpacing: number, label: (v: number) => number): TickSet {
  let low = lo;
  let high = hi;
  if (!(high > low)) {
    if (fixed) throw new UrsulaError('The axis range is empty.', 'syntax');
    high = low + 1;
  }
  const target = Math.max(TICK_TARGET, minSpacing);
  let best: { score: number; ticks: number[] } | undefined;
  for (let count = 2; count <= 20; count++) {
    const raw = niceTicks(low, high, count);
    const first = raw[0];
    const second = raw[1];
    const last = raw[raw.length - 1];
    if (first === undefined || second === undefined || last === undefined) continue;
    const span = fixed ? high - low : last - first;
    const spacing = ((second - first) / span) * length;
    if (spacing < minSpacing) continue;
    const score = Math.abs(Math.log(spacing / target));
    if (best === undefined || score < best.score - 1e-9) best = { score, ticks: raw };
  }
  const raw = best?.ticks ?? niceTicks(low, high, 2);
  if (!fixed) {
    const first = raw[0] ?? low;
    const last = raw[raw.length - 1] ?? high;
    return { range: { min: first, max: last }, ticks: raw };
  }
  const px = (v: number): number => ((v - low) / (high - low)) * length;
  const inner = raw.filter((t) => t > low && t < high);
  const ticks = [low];
  for (const t of inner) {
    const prev = ticks[ticks.length - 1] ?? low;
    const gap = Math.max(minSpacing, (label(prev) + label(t)) / 2 + 8);
    if (px(t) - px(prev) >= gap && length - px(t) >= Math.max(minSpacing, (label(t) + label(high)) / 2 + 8)) ticks.push(t);
  }
  ticks.push(high);
  return { range: { min: low, max: high }, ticks };
}

const boxOf = (x: number, y: number, w: number, anchor: TextAnchor, h = LABEL_H): Box => anchoredBox(x, y, w, anchor, h);

type Anchor = TextAnchor;

interface Candidate {
  x: number;
  y: number;
  anchor: Anchor;
}

/**
 * A text spot next to the point `p`: `cat` is the side along the category axis (-1 before, 1 after) and `val` the
 * side along the value axis (1 toward larger values). `off` is the clear distance to the point.
 */
function spot(p: Point, cat: -1 | 0 | 1, val: -1 | 0 | 1, off: number, horizontal: boolean): Candidate {
  const extra = cat === 0 ? 4 : 0;
  if (!horizontal) {
    const anchor: Anchor = cat < 0 ? 'end' : cat > 0 ? 'start' : 'middle';
    const x = p.x + cat * off;
    if (val > 0) return { x, y: p.y - off - extra - 4, anchor };
    if (val < 0) return { x, y: p.y + off + extra + 6, anchor };
    return { x, y: p.y, anchor };
  }
  const anchor: Anchor = val > 0 ? 'start' : val < 0 ? 'end' : 'middle';
  const x = p.x + val * (off + (cat === 0 ? 4 : 0));
  if (cat < 0) return { x, y: p.y - off - 4, anchor };
  if (cat > 0) return { x, y: p.y + off + 6, anchor };
  return { x, y: p.y, anchor };
}

interface Mark {
  /** Point on the plot, per category index. */
  at: (Point | undefined)[];
}

interface LabelJob {
  text: string;
  /** Point the label belongs to. */
  p: Point;
  cat: number;
  /** Preferred sides, from the shape of the line. */
  side: [-1 | 0 | 1, -1 | 0 | 1];
  /** Clear distance for the first try. */
  off: number;
  kind: 'line' | 'bar' | 'text';
  /** For a text label of a point: the value label goes to the other side. */
  swap?: boolean;
}

export interface XyLayout {
  scene: Scene;
  /** Left of the plot, width of one category and the pixel position of the value axis ends. */
  plot: { left: number; top: number; width: number; height: number; band: number };
  range: XyRange;
  ticks: number[];
}

export function layoutXychart(chart: XyChart, ruler: Ruler, theme: Theme): XyLayout {
  const spec: SceneThemeSpec = SCENE_THEME_SPECS[theme];
  const horizontal = chart.horizontal;
  const cfg = chart.config;
  const px = (text: string, size: number, bold = false): number => widthOf(ruler, text, size, bold);

  // categories
  const longest = Math.max(...chart.series.map((s) => s.points.length));
  let labels: string[] | undefined;
  let n: number;
  if (chart.categories) {
    labels = chart.categories;
    n = labels.length;
  } else {
    n = longest;
    if (chart.xRange) {
      const step = n > 1 ? (chart.xRange.max - chart.xRange.min) / (n - 1) : 0;
      labels = Array.from({ length: n }, (_, i) => trimmedNumber(chart.xRange!.min + i * step, 10));
    }
  }

  // series styling: equal data is one series
  const distinct = new Set(chart.series.map((s) => s.points.map((p) => p.value).join(','))).size;
  const single = distinct === 1;
  const colour = (i: number): number => Math.min(i, 7) + 1;
  const barSeries = chart.series.map((s, i) => ({ s, i })).filter((e) => e.s.kind === 'bar');
  const lineSeries = chart.series.map((s, i) => ({ s, i })).filter((e) => e.s.kind === 'line');
  const strongBars = !single;

  // value range
  const values = chart.series.flatMap((s) => s.points.map((p) => p.value));
  const dataLo = Math.min(...values);
  const dataHi = Math.max(...values);
  const fixed = chart.yRange !== undefined;
  const wantLo = chart.yRange?.min ?? (barSeries.length > 0 ? Math.min(0, dataLo) : dataLo);
  const wantHi = chart.yRange?.max ?? dataHi;

  // header
  const title = cfg.showTitle === false ? undefined : chart.title;
  const sideName = horizontal ? chart.xTitle : chart.yTitle; // axis name placed under the title
  const footName = horizontal ? chart.yTitle : chart.xTitle; // axis name placed below the plot
  let headCenter = 0;
  const rows: { text: string; role: string[]; y: number }[] = [];
  if (title !== undefined) {
    rows.push({ text: title, role: ['title'], y: 52 });
    headCenter = 52;
  }
  if (sideName !== undefined) {
    headCenter = title !== undefined ? 74 : 52;
    rows.push({ text: sideName, role: ['axis-name'], y: headCenter });
  }
  const plotTop = rows.length > 0 ? up4(headCenter + 54) : 64;
  const titleNeed = title === undefined ? 0 : MARGIN + px(title, 15, true) + MARGIN;

  // value labels shown? Several different series share one value colour, so their values are written only on request.
  const showValues = single ? cfg.showDataLabel !== false : cfg.showDataLabel === true;
  const valueText = (raw: string): number => px(raw, 11, true);
  const maxValueW = Math.max(...chart.series.flatMap((s) => s.points.map((p) => valueText(p.raw))));

  // legend entries
  const named = chart.series.map((s, i) => ({ s, i })).filter((e) => e.s.name !== undefined);
  const legend = !single && named.length > 0 && cfg.showLegend !== false ? named : [];

  let plotLeft = horizontal ? up16(MARGIN + Math.max(0, ...(labels ?? []).map((l) => px(l, 11))) + 16) : 64;
  let attempt: ReturnType<typeof build> | undefined;
  for (let pass = 0; pass < 5; pass++) {
    attempt = build(plotLeft);
    if (attempt.need <= plotLeft) break;
    plotLeft = attempt.need;
  }
  if (attempt === undefined) throw new UrsulaError('The chart could not be laid out.', 'layout');
  return attempt.result;

  function build(left: number): { need: number; result: XyLayout } {
    const items: SceneItem[] = [];
    const obstacles: Box[] = [];
    const text = (t: SceneText): void => {
      items.push(t);
    };

    // sizes along the category axis
    let band: number;
    let plotW: number; // extent on screen, x
    let plotH: number; // extent on screen, y
    let width: number;
    let height: number;
    const catWrapped = (cell: number): string[][] => (labels ?? []).map((l) => {
      const lines = wrapWords(l, cell - 8, (t) => widthOf(ruler, t, 11), { longWord: 'keep' });
      return lines.length === 0 ? [l] : lines;
    });
    const tickLabelW = (v: number): number => px(trimmedNumber(v, 10), 11);
    let ticks: TickSet;
    let footLines = 1;

    if (!horizontal) {
      const barNeed = barSeries.length >= 2 && showValues ? barSeries.length * (maxValueW + 6) + 20 : 0;
      const wordNeed = Math.max(0, ...(labels ?? []).flatMap((l) => l.split(/\s+/).map((w) => px(w, 11) + 12)));
      if (cfg.width !== undefined) {
        const avail = down4(cfg.width - left - RIGHT);
        band = Math.max(4, down4(avail / Math.max(1, n)));
        plotW = band * n;
        width = cfg.width;
      } else {
        band = Math.max(CELL, up4(wordNeed), up4(barNeed), up4(MIN_PLOT / Math.max(1, n)));
        const needW = Math.max(titleNeed, ...legendWidth(), 0);
        if (left + band * n + RIGHT < needW) band = up4((needW - left - RIGHT) / Math.max(1, n));
        plotW = band * n;
        width = left + plotW + RIGHT;
      }
      footLines = Math.max(1, ...catWrapped(band).map((l) => l.length));
      const bottomExtra = 14 * (footLines - 1) + (footName !== undefined ? 24 : 0);
      const legendRows = legendRowCount(width);
      const bottomFixed = 24 + bottomExtra + (legendRows > 0 ? 8 + legendRows * 24 : 0) + 32;
      plotH = cfg.height !== undefined ? Math.max(80, down4(cfg.height - plotTop - bottomFixed)) : PLOT_HEIGHT;
      ticks = chooseTicks(wantLo, wantHi, fixed, plotH, 16, () => 0);
      height = plotTop + plotH + bottomFixed;
    } else {
      band = BAND;
      plotH = band * n;
      const bottomExtra = footName !== undefined ? 24 : 0;
      width = cfg.width ?? Math.max(left + PLOT_LENGTH + RIGHT, titleNeed, ...legendWidth());
      plotW = down4(width - left - RIGHT);
      const maxTickW = Math.max(tickLabelW(wantLo), tickLabelW(wantHi), 36);
      ticks = chooseTicks(wantLo, wantHi, fixed, plotW, maxTickW + 12, tickLabelW);
      const legendRows = legendRowCount(width);
      const bottomFixed = 24 + bottomExtra + (legendRows > 0 ? 8 + legendRows * 24 : 0) + 32;
      height = cfg.height ?? plotTop + plotH + bottomFixed;
      if (cfg.height !== undefined) {
        band = Math.max(4, down4((cfg.height - plotTop - bottomFixed) / Math.max(1, n)));
        plotH = band * n;
        height = cfg.height;
      }
    }
    const range = ticks.range;
    const base = horizontal ? left : plotTop + plotH;
    const length = horizontal ? plotW : plotH;
    const valPos = (v: number): number => {
      const t = (Math.min(range.max, Math.max(range.min, v)) - range.min) / (range.max - range.min);
      return horizontal ? left + t * length : plotTop + plotH - t * length;
    };
    const catPos = (i: number): number => (horizontal ? plotTop + i * band + band / 2 : left + i * band + band / 2);
    const pt = (i: number, v: number): Point => (horizontal ? { x: valPos(v), y: catPos(i) } : { x: catPos(i), y: valPos(v) });

    // panel and header
    items.push({ kind: 'box', style: 'frame', x: 16, y: 16, w: width - 32, h: height - 32, role: ['panel'] });
    for (const r of rows) {
      text({ kind: 'text', x: MARGIN, y: r.y, text: r.text, anchor: 'start', role: r.role });
      obstacles.push(boxOf(MARGIN, r.y, px(r.text, r.role[0] === 'title' ? 15 : 12, true), 'start', 20));
    }

    // grid and ticks
    const rule = (a: Point, b: Point, role: string): void => {
      items.push({ kind: 'line', points: [a, b], role: [role], radius: 0 });
    };
    for (const t of ticks.ticks) {
      const v = valPos(t);
      const first = t === range.min;
      if (!first) rule(horizontal ? { x: v, y: plotTop } : { x: left, y: v }, horizontal ? { x: v, y: plotTop + plotH } : { x: left + plotW, y: v }, 'grid');
      const label = trimmedNumber(t, 10);
      const w = px(label, 11);
      if (!horizontal) {
        text({ kind: 'text', x: left - 16, y: v, text: label, anchor: 'end', role: ['tick'] });
        obstacles.push(boxOf(left - 16, v, w, 'end'));
      } else {
        text({ kind: 'text', x: v, y: plotTop + plotH + 18, text: label, anchor: 'middle', role: ['tick'] });
        obstacles.push(boxOf(v, plotTop + plotH + 18, w, 'middle'));
      }
    }

    // marks
    const k = barSeries.length;
    const avail = horizontal ? band - 8 : band - 20;
    const gap = 4;
    const barW = Math.max(4, Math.min(horizontal ? Math.min(spec.barWidth, 40) : spec.barWidth, 2 * Math.floor((avail - gap * (k - 1)) / k / 2)));
    const groupW = k * barW + (k - 1) * gap;
    const barRects: { box: Box; len: number; series: number; i: number; end: number; centre: number }[] = [];
    barSeries.forEach(({ s, i: sIdx }, slot) => {
      const role = strongBars ? [`series-${colour(sIdx)}`] : ['mark'];
      s.points.forEach((p, i) => {
        const c = catPos(i) - groupW / 2 + slot * (barW + gap) + barW / 2;
        const end = valPos(p.value);
        const len = Math.abs(end - base);
        const radius = Math.min(spec.barTop, barW / 2, len);
        const x0 = c - barW / 2;
        const x1 = c + barW / 2;
        if (len >= 0.5) {
          const d = horizontal
            ? `M${round2(base)} ${round2(x0)}H${round2(end - radius)}Q${round2(end)} ${round2(x0)} ${round2(end)} ${round2(x0 + radius)}V${round2(x1 - radius)}Q${round2(end)} ${round2(x1)} ${round2(end - radius)} ${round2(x1)}H${round2(base)}Z`
            : `M${round2(x0)} ${round2(base)}V${round2(end + radius)}Q${round2(x0)} ${round2(end)} ${round2(x0 + radius)} ${round2(end)}H${round2(x1 - radius)}Q${round2(x1)} ${round2(end)} ${round2(x1)} ${round2(end + radius)}V${round2(base)}Z`;
          items.push({ kind: 'path', d, role });
        }
        barRects.push({
          box: horizontal ? { x0: base, x1: end, y0: x0, y1: x1 } : { x0, x1, y0: end, y1: base },
          len,
          series: sIdx,
          i,
          end,
          centre: c,
        });
      });
    });
    rule(horizontal ? { x: left, y: plotTop } : { x: left, y: base }, horizontal ? { x: left, y: plotTop + plotH } : { x: left + plotW, y: base }, 'axis');

    const marks: Mark[] = [];
    const polylines: Point[][] = [];
    lineSeries.forEach(({ s, i: sIdx }) => {
      const at = s.points.map((p, i) => pt(i, p.value));
      marks.push({ at });
      const pts = at.filter((p): p is Point => p !== undefined);
      polylines.push(pts);
      if (pts.length >= 2) {
        let d: string;
        if (spec.interpolation === 'linear') d = pts.map((p, j) => `${j === 0 ? 'M' : 'L'}${round2(p.x)} ${round2(p.y)}`).join('');
        else if (horizontal) {
          const swapped = monotonePath(pts.map((p) => ({ x: p.y, y: p.x })));
          d = swapped.replace(/(-?[\d.]+)[ ,](-?[\d.]+)/g, '$2 $1');
        } else d = monotonePath(pts);
        items.push({ kind: 'path', d, role: [single ? 'mark-line' : `series-${colour(sIdx)}--line`] });
      }
      for (const p of pts) items.push({ kind: 'circle', cx: p.x, cy: p.y, r: spec.dotRadius, role: [single ? 'mark-dot' : `series-${colour(sIdx)}--dot`] });
    });

    // category names
    const nameLines = horizontal ? (labels ?? []).map((l) => [l]) : catWrapped(band);
    (labels ?? []).forEach((_, i) => {
      const lines = nameLines[i] ?? [];
      lines.forEach((line, j) => {
        if (horizontal) {
          const y = catPos(i);
          text({ kind: 'text', x: left - 16, y, text: line, anchor: 'end', role: ['tick'] });
          obstacles.push(boxOf(left - 16, y, px(line, 11), 'end'));
        } else {
          const y = base + 18 + 14 * j;
          text({ kind: 'text', x: catPos(i), y, text: line, anchor: 'middle', role: ['tick'] });
          obstacles.push(boxOf(catPos(i), y, px(line, 11), 'middle'));
        }
      });
    });
    let cursor = (horizontal ? base + plotH : base) + 24 + (horizontal ? 0 : 14 * (footLines - 1));
    if (horizontal) cursor = plotTop + plotH + 24;
    if (footName !== undefined) {
      const y = cursor + 16;
      const cx = left + plotW / 2;
      text({ kind: 'text', x: cx, y, text: footName, anchor: 'middle', role: ['axis-name'] });
      obstacles.push(boxOf(cx, y, px(footName, 12, true), 'middle', 16));
      cursor += 24;
    }

    // legend
    if (legend.length > 0) {
      let x = MARGIN;
      let row = 0;
      const top = cursor + 8;
      for (const { s, i } of legend) {
        const name = s.name ?? '';
        const w = 12 + 8 + px(name, 12, true);
        if (x > MARGIN && x + w > width - MARGIN) {
          x = MARGIN;
          row++;
        }
        const cy = top + row * 24 + 12;
        items.push({ kind: 'box', style: 'frame', x, y: cy - 6, w: 12, h: 12, role: ['swatch', `series-${colour(i)}`] });
        text({ kind: 'text', x: x + 20, y: cy, text: name, anchor: 'start', role: ['legend'] });
        x += w + 24;
      }
      cursor = top + (row + 1) * 24;
    }

    // value labels
    const dotBoxes: Box[] = lineSeries.flatMap((_, li) =>
      (marks[li]?.at ?? []).filter((p): p is Point => p !== undefined).map((p) => ({ x0: p.x - spec.dotRadius, x1: p.x + spec.dotRadius, y0: p.y - spec.dotRadius, y1: p.y + spec.dotRadius })),
    );
    const lineSamples: Point[] = polylines.flatMap((pts) => {
      const out: Point[] = [];
      for (let j = 1; j < pts.length; j++) {
        const a = pts[j - 1];
        const b = pts[j];
        if (a === undefined || b === undefined) continue;
        const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 3));
        for (let s = 0; s <= steps; s++) out.push({ x: a.x + ((b.x - a.x) * s) / steps, y: a.y + ((b.y - a.y) * s) / steps });
      }
      return out;
    });
    const solidBars = strongBars ? barRects.map((b) => b.box) : [];
    const fixedObstacles = [...obstacles, ...dotBoxes, ...solidBars];
    const placed: Box[] = [];
    const bounds: Box = horizontal ? { x0: left + 1, x1: width - 24, y0: 24, y1: height - 24 } : { x0: 24, x1: width - 24, y0: 24, y1: base - 1 };
    const clash = (b: Box): number => clashCost(b, { bounds, fixed: fixedObstacles, placed, samples: lineSamples });
    const emit = (job: LabelJob, cand: Candidate, roles: string[]): void => {
      text({ kind: 'text', x: round2(cand.x), y: round2(cand.y), text: job.text, anchor: cand.anchor, role: roles });
    };
    const place = (job: LabelJob, roles: string[], w: number, preferInside?: Candidate): void => {
      const [pc, pv] = job.side;
      const tries: Candidate[] = [];
      if (preferInside) tries.push(preferInside);
      const flip = job.swap === true;
      const order: [-1 | 0 | 1, -1 | 0 | 1][] = flip
        ? [[-pc as -1 | 0 | 1, -pv as -1 | 0 | 1], [pc, pv]]
        : [[pc, pv], [-pc as -1 | 0 | 1, -pv as -1 | 0 | 1]];
      const extras: [-1 | 0 | 1, -1 | 0 | 1][] = [[0, 1], [0, -1], [-1, 1], [1, 1], [-1, -1], [1, -1]];
      for (const off of [job.off, job.off + 12, job.off + 24, job.off + 36]) {
        for (const [c, v] of [...order, ...extras]) tries.push(spot(job.p, c, v, off, horizontal));
      }
      const best = pickLeastClash(tries, (cand) => boxOf(cand.x, cand.y, w, cand.anchor), clash);
      if (best === undefined) return;
      placed.push(best.box);
      emit(job, best.candidate, roles);
    };

    const hasPointLabels = lineSeries.some(({ s }) => s.points.some((p) => p.label !== undefined));
    if (showValues || hasPointLabels) {
      // text labels of line points first, then the values
      const pointLabels: { job: LabelJob; w: number }[] = [];
      const valueJobs: { job: LabelJob; w: number; roles: string[]; inner?: Candidate[] }[] = [];
      const lineJobs = new Map<string, true>();
      const sideOf = (s: XySeries, i: number): [-1 | 0 | 1, -1 | 0 | 1] => {
        const trend = trendAt(s.points[i]?.value ?? 0, s.points[i - 1]?.value, s.points[i + 1]?.value);
        return trend === 'peak' ? [0, 1] : trend === 'valley' ? [0, -1] : trend === 'rising' ? [-1, 1] : [1, 1];
      };
      const lineOff = Math.round(spec.dotRadius + 4);
      lineSeries.forEach(({ s }, li) => {
        s.points.forEach((p, i) => {
          const at = marks[li]?.at[i];
          if (at === undefined) return;
          const side = sideOf(s, i);
          if (p.label !== undefined) {
            pointLabels.push({ job: { text: p.label, p: at, cat: i, side, off: lineOff, kind: 'text' }, w: px(p.label, 12, true) });
          }
          if (!showValues) return;
          const key = `${i}:${p.value}`;
          const hasBar = barSeries.some(({ s: b }) => b.points[i]?.value === p.value);
          if (hasBar && single && spec.valueLabel === 'inside') return; // the bar of the same series carries the value
          if (lineJobs.has(key) && !strongBars) return;
          lineJobs.set(key, true);
          const job: LabelJob = { text: p.raw, p: at, cat: i, side, off: lineOff, kind: 'line' };
          if (p.label !== undefined) job.swap = true;
          valueJobs.push({ job, w: valueText(p.raw), roles: ['value'] });
        });
      });
      if (showValues) barSeries.forEach(({ s }) => {
        s.points.forEach((p, i) => {
          const r = barRects.find((b) => b.series === chart.series.indexOf(s) && b.i === i);
          if (r === undefined) return;
          const hasLine = lineSeries.some(({ s: l }) => l.points[i]?.value === p.value);
          if (hasLine && single && spec.valueLabel !== 'inside') return; // the line of the same series carries the value
          const w = valueText(p.raw);
          const wantOutside = cfg.showDataLabelOutsideBar === true;
          const wantInside = cfg.showDataLabelOutsideBar !== true && (cfg.showDataLabel === true || spec.valueLabel === 'inside');
          const thickness = horizontal ? r.box.y1 - r.box.y0 : r.box.x1 - r.box.x0;
          const fits = !strongBars && (horizontal ? r.len >= w + 24 : r.len >= 24 && thickness >= w + 8);
          const tip: Point = horizontal ? { x: r.end, y: r.centre } : { x: r.centre, y: r.end };
          const off = hasLine ? Math.round(spec.dotRadius + 4) : 4;
          const job: LabelJob = { text: p.raw, p: tip, cat: i, side: [0, 1], off, kind: 'bar' };
          if (!wantOutside && wantInside && fits) {
            const inner: Candidate[] = [0, 12, 24, 36].map((k) => (horizontal ? { x: r.end - 12 - k, y: r.centre, anchor: 'end' } : { x: r.centre, y: r.end + 20 + k, anchor: 'middle' }));
            valueJobs.push({ job, w, roles: ['value', 'value--plain'], inner });
          } else valueJobs.push({ job, w, roles: ['value'] });
        });
      });
      for (const { job, w } of pointLabels) place(job, ['label', 'tick--halo'], w);
      for (const { job, w, roles, inner } of valueJobs) {
        const fit = inner?.find((c) => {
          const box = boxOf(c.x, c.y, w, c.anchor);
          const within = horizontal ? box.x0 >= base + 2 : box.y1 <= base - 2;
          return within && clash(box) === 0;
        });
        if (fit) {
          placed.push(boxOf(fit.x, fit.y, w, fit.anchor));
          emit(job, fit, roles);
        } else place(job, inner ? ['value'] : roles, w);
      }
    }

    const need = horizontal ? left : up16(MARGIN + Math.max(0, ...ticks.ticks.map(tickLabelW)) + 16);
    const scene: Scene = {
      width,
      height: cursor + 32,
      title: chart.title === undefined ? 'xychart' : `xychart — ${chart.title}`,
      items,
      theme,
    };
    // the panel and the size follow the content
    const panel = items[0];
    if (panel?.kind === 'box') panel.h = scene.height - 32;
    return { need, result: { scene, plot: { left, top: plotTop, width: plotW, height: plotH, band }, range, ticks: ticks.ticks } };
  }

  function legendItemsWidth(): number {
    return legend.reduce((sum, { s }) => sum + 12 + 8 + px(s.name ?? '', 12, true) + 24, MARGIN * 2 - 24);
  }

  function legendWidth(): number[] {
    return legend.length === 0 ? [] : [Math.min(legendItemsWidth(), 640)];
  }

  function legendRowCount(width: number): number {
    if (legend.length === 0) return 0;
    let x = MARGIN;
    let rows = 1;
    for (const { s } of legend) {
      const w = 12 + 8 + px(s.name ?? '', 12, true);
      if (x > MARGIN && x + w > width - MARGIN) {
        x = MARGIN;
        rows++;
      }
      x += w + 24;
    }
    return rows;
  }
}
