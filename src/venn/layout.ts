import { ceilTo } from '../chart/grid.ts';
import type { Ruler } from '../metrics.ts';
import type { Scene, SceneItem } from '../types.ts';
import type { Venn } from './model.ts';

const MARGIN = 40;
const TITLE_SIZE = 15;
const TITLE_BLOCK = 48;
const PANEL_INSET = 16;
const LINE = 16;
/** Radius of a set when every set has the same size, and the distance of two centres in radii. */
const BASE_RADIUS = 208;
const SMALL_RADIUS = 160;
const DEFAULT_GAP = 224 / 208;
/** Share of the smaller set that an overlap takes when the text names the overlap but gives no size. */
const DEFAULT_SHARE = 0.2;
const SERIES = 8;
const SAMPLE = 2;
/** Semi-bold names run a little wider than the ruler's regular face. */
const NAME_SLACK = 1.06;
const OUTSIDE_GAP = 8;
/** A set's name stands this share of the way from its circle's centre to the middle of the part only it covers, when it fits there. */
const SET_PULL = 0.8;

export interface PlacedCircle {
  id: string;
  label: string;
  cx: number;
  cy: number;
  r: number;
}

export interface PlacedLabel {
  /** `set:<id>` or `union:<ids>`. */
  key: string;
  x: number;
  y: number;
  w: number;
  h: number;
  lines: string[];
  /** False when the lines are wider than the region they stand in. */
  fits: boolean;
}

export interface VennLayout {
  scene: Scene;
  circles: PlacedCircle[];
  labels: PlacedLabel[];
  /** True when the circles only approximate the sizes (four or more sets). */
  approximate: boolean;
  notes: string[];
}

interface Circle {
  cx: number;
  cy: number;
  r: number;
}

interface Pt {
  x: number;
  y: number;
}


/** Area of the lens where two circles of radii `r1`, `r2` at distance `d` overlap. */
export function lensArea(r1: number, r2: number, d: number): number {
  if (d >= r1 + r2) return 0;
  if (d <= Math.abs(r1 - r2)) return Math.PI * Math.min(r1, r2) ** 2;
  const a1 = Math.acos((d * d + r1 * r1 - r2 * r2) / (2 * d * r1));
  const a2 = Math.acos((d * d + r2 * r2 - r1 * r1) / (2 * d * r2));
  return r1 * r1 * (a1 - Math.sin(2 * a1) / 2) + r2 * r2 * (a2 - Math.sin(2 * a2) / 2);
}

/** Distance of two centres at which the circles overlap by `target` area; found by bisection. */
export function distanceFor(r1: number, r2: number, target: number): number {
  const max = r1 + r2;
  const min = Math.abs(r1 - r2);
  if (target <= 0) return max;
  if (target >= Math.PI * Math.min(r1, r2) ** 2) return min;
  let lo = min;
  let hi = max;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (lensArea(r1, r2, mid) > target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

interface Geometry {
  circles: Circle[];
  approximate: boolean;
  notes: string[];
}

/** Radii and centres of the sets: sizes give areas, overlaps give distances, three sets sit at a triangle. */
function arrange(venn: Venn): Geometry {
  const n = venn.sets.length;
  const notes: string[] = [];
  const maxR = n <= 3 ? BASE_RADIUS : SMALL_RADIUS;
  const sized = venn.sets.some((s) => s.size !== undefined);
  const known = venn.sets.flatMap((s) => (s.size === undefined ? [] : [s.size]));
  const fallback = known.length === 0 ? 1 : known.reduce((a, b) => a + b, 0) / known.length;
  const sizes = venn.sets.map((s) => s.size ?? fallback);
  const biggest = Math.max(...sizes);
  const unit = (Math.PI * maxR * maxR) / biggest;
  const radii = sized ? sizes.map((v) => Math.sqrt((unit * v) / Math.PI)) : sizes.map(() => maxR);
  if (!sized && venn.unions.some((u) => u.size !== undefined)) notes.push('Union sizes need set sizes; they are not drawn to scale.');
  if (sized) {
    for (const u of venn.unions) if (u.ids.length > 2 && u.size !== undefined) notes.push(`The size of the union ${u.ids.join(',')} is not drawn to scale; only pairs are.`);
  }

  const dist: number[][] = Array.from({ length: n }, () => Array.from({ length: n }, () => 0));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const ri = radii[i] ?? 0;
      const rj = radii[j] ?? 0;
      let d: number;
      if (!sized) {
        d = DEFAULT_GAP * ri;
      } else {
        const share = DEFAULT_SHARE * Math.PI * Math.min(ri, rj) ** 2;
        const holding = venn.unions.filter((u) => u.ids.includes(venn.sets[i]?.id ?? '') && u.ids.includes(venn.sets[j]?.id ?? ''));
        const exact = holding.find((u) => u.ids.length === 2);
        let target = 0;
        if (exact !== undefined) target = exact.size === undefined ? share : unit * exact.size;
        else if (holding.length > 0) {
          const withSize = holding.flatMap((u) => (u.size === undefined ? [] : [unit * u.size]));
          target = withSize.length > 0 ? Math.max(...withSize) : share;
        }
        d = distanceFor(ri, rj, target);
      }
      (dist[i] as number[])[j] = d;
      (dist[j] as number[])[i] = d;
    }
  }

  const centres: Pt[] = [];
  let approximate = false;
  if (n === 1) {
    centres.push({ x: 0, y: 0 });
  } else if (n === 2) {
    centres.push({ x: 0, y: 0 }, { x: dist[0]?.[1] ?? 0, y: 0 });
  } else if (n === 3) {
    const d01 = dist[0]?.[1] ?? 0;
    const d02 = dist[0]?.[2] ?? 0;
    const d12 = dist[1]?.[2] ?? 0;
    const x = (d01 * d01 + d02 * d02 - d12 * d12) / (2 * d01);
    const y2 = d02 * d02 - x * x;
    if (y2 < 0) notes.push('The three distances cannot form a triangle; the third circle sits on the line of the first two, as near as it can.');
    centres.push({ x: 0, y: 0 }, { x: d01, y: 0 }, { x, y: Math.sqrt(Math.max(0, y2)) });
  } else {
    approximate = true;
    notes.push(`${n} sets: the circles are placed by least squares on the pair distances and are only approximate.`);
    const mean = dist.flat().filter((v) => v > 0).reduce((a, b) => a + b, 0) / Math.max(1, n * (n - 1));
    const ring = mean / (2 * Math.sin(Math.PI / n));
    for (let i = 0; i < n; i++) centres.push({ x: ring * Math.cos((2 * Math.PI * i) / n - Math.PI / 2 - Math.PI / n), y: ring * Math.sin((2 * Math.PI * i) / n - Math.PI / 2 - Math.PI / n) });
    for (let step = 0; step < 1200; step++) {
      const move = centres.map(() => ({ x: 0, y: 0 }));
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          const a = centres[i] as Pt;
          const b = centres[j] as Pt;
          const len = Math.hypot(b.x - a.x, b.y - a.y) || 1e-6;
          const k = (0.25 * (len - (dist[i]?.[j] ?? 0))) / len;
          const mi = move[i] as Pt;
          const mj = move[j] as Pt;
          mi.x += (b.x - a.x) * k;
          mi.y += (b.y - a.y) * k;
          mj.x -= (b.x - a.x) * k;
          mj.y -= (b.y - a.y) * k;
        }
      }
      centres.forEach((c, i) => {
        c.x += (move[i] as Pt).x;
        c.y += (move[i] as Pt).y;
      });
    }
  }
  return { circles: centres.map((c, i) => ({ cx: c.x, cy: c.y, r: radii[i] ?? maxR })), approximate, notes };
}

/** Points of the set `inside` all circles and `outside` none of them: the region a label belongs to. */
interface Region {
  inside: Circle[];
  outside: Circle[];
}

const within = (c: Circle, x: number, y: number): boolean => (x - c.cx) ** 2 + (y - c.cy) ** 2 < c.r * c.r;

function centroid(region: Region): Pt | undefined {
  const first = region.inside[0];
  if (first === undefined) return undefined;
  let sx = 0;
  let sy = 0;
  let count = 0;
  let nearest: Pt | undefined;
  const pts: Pt[] = [];
  for (let y = first.cy - first.r; y <= first.cy + first.r; y += SAMPLE) {
    for (let x = first.cx - first.r; x <= first.cx + first.r; x += SAMPLE) {
      if (!region.inside.every((c) => within(c, x, y)) || region.outside.some((c) => within(c, x, y))) continue;
      sx += x;
      sy += y;
      count++;
      pts.push({ x, y });
    }
  }
  if (count === 0) return undefined;
  const mid = { x: sx / count, y: sy / count };
  if (region.inside.every((c) => within(c, mid.x, mid.y)) && !region.outside.some((c) => within(c, mid.x, mid.y))) return mid;
  let best = Infinity;
  for (const p of pts) {
    const d = (p.x - mid.x) ** 2 + (p.y - mid.y) ** 2;
    if (d < best) {
      best = d;
      nearest = p;
    }
  }
  return nearest;
}

/** The stretch of row `y` that lies in the region and contains (or is nearest to) `x0`. */
function rowSpan(region: Region, y: number, x0: number): [number, number] | undefined {
  let lo = -Infinity;
  let hi = Infinity;
  for (const c of region.inside) {
    const dy = y - c.cy;
    if (Math.abs(dy) >= c.r) return undefined;
    const h = Math.sqrt(c.r * c.r - dy * dy);
    lo = Math.max(lo, c.cx - h);
    hi = Math.min(hi, c.cx + h);
  }
  if (lo >= hi) return undefined;
  let pieces: Array<[number, number]> = [[lo, hi]];
  for (const c of region.outside) {
    const dy = y - c.cy;
    if (Math.abs(dy) >= c.r) continue;
    const h = Math.sqrt(c.r * c.r - dy * dy);
    const cut: [number, number] = [c.cx - h, c.cx + h];
    pieces = pieces.flatMap(([a, b]): Array<[number, number]> => {
      if (cut[1] <= a || cut[0] >= b) return [[a, b]];
      const out: Array<[number, number]> = [];
      if (cut[0] > a) out.push([a, cut[0]]);
      if (cut[1] < b) out.push([cut[1], b]);
      return out;
    });
  }
  let best: [number, number] | undefined;
  let bestGap = Infinity;
  for (const p of pieces) {
    const gap = x0 < p[0] ? p[0] - x0 : x0 > p[1] ? x0 - p[1] : 0;
    if (gap < bestGap) {
      bestGap = gap;
      best = p;
    }
  }
  return best;
}

/** Breaks `text` into the fewest lines no wider than `limit`, the lines as even as the words allow. */
function wrap(text: string, limit: number, measure: (s: string) => number): string[] {
  const greedy = (cap: number): string[] => {
    const out: string[] = [];
    let row = '';
    const push = (piece: string): void => {
      const joined = row === '' ? piece : `${row} ${piece}`;
      if (row === '' || measure(joined) <= cap) row = joined;
      else {
        out.push(row);
        row = piece;
      }
    };
    for (const word of text.split(/\s+/u).filter((w) => w !== '')) {
      if (measure(word) <= cap) {
        push(word);
        continue;
      }
      for (const ch of word) {
        const joined = row === '' ? ch : `${row}${ch}`;
        if (row === '' || measure(joined) <= cap) row = joined;
        else {
          out.push(row);
          row = ch;
        }
      }
    }
    if (row !== '') out.push(row);
    return out;
  };
  const base = greedy(limit);
  let lo = 0;
  let hi = limit;
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    if (greedy(mid).length <= base.length) hi = mid;
    else lo = mid;
  }
  return greedy(hi + 0.5).length === base.length ? greedy(hi + 0.5) : base;
}

interface Row {
  text: string;
  role: string[];
  font: 'title' | 'line';
}

interface Block {
  key: string;
  rows: Row[];
  region: Region;
  /** A set name that cannot fit its region stands above the circle instead. */
  home?: Circle;
}

interface PlacedRow {
  row: Row;
  x: number;
  y: number;
  w: number;
}

function placeBlock(block: Block, ruler: Ruler, notes: string[]): { rows: PlacedRow[]; label: PlacedLabel } {
  const measure = (row: Row) => (s: string): number => ruler.textWidth(s, row.font) * (row.font === 'title' ? NAME_SLACK : 1);
  const mid = centroid(block.region) ?? centroid({ inside: block.region.inside, outside: [] }) ?? {
    x: block.region.inside.reduce((a, c) => a + c.cx, 0) / block.region.inside.length,
    y: block.region.inside.reduce((a, c) => a + c.cy, 0) / block.region.inside.length,
  };

  const attempt = (rows: Row[], x0: number, y0: number): { x: number; y: number; ok: boolean } => {
    const h = rows.length * LINE;
    const top = y0 - h / 2;
    const widest = Math.max(...rows.map((r) => measure(r)(r.text)));
    let lo = -Infinity;
    let hi = Infinity;
    for (let k = 0; k < rows.length; k++) {
      const yc = top + LINE * k + LINE / 2;
      for (const y of [yc - LINE / 2 + 1, yc, yc + LINE / 2 - 1]) {
        const span = rowSpan(block.region, y, x0);
        if (span === undefined) return { x: x0, y: y0, ok: false };
        lo = Math.max(lo, span[0]);
        hi = Math.min(hi, span[1]);
      }
    }
    if (widest > hi - lo) return { x: x0, y: y0, ok: false };
    return { x: Math.min(Math.max(x0, lo + widest / 2), hi - widest / 2), y: y0, ok: true };
  };

  let rows = block.rows;
  let found = attempt(rows, mid.x, mid.y);
  const home = block.home;
  if (home !== undefined && found.ok) {
    const pulled = attempt(rows, home.cx + SET_PULL * (mid.x - home.cx), home.cy + SET_PULL * (mid.y - home.cy));
    if (pulled.ok) found = pulled;
  }
  for (let pass = 0; pass < 4 && !found.ok; pass++) {
    // Wrap to the width the region offers at the block's middle row, then look again with the taller block.
    const span = rowSpan(block.region, mid.y, mid.x);
    if (span === undefined) break;
    const limit = Math.max(24, span[1] - span[0] - 8 - pass * 8);
    const next = rows.flatMap((r) => (measure(r)(r.text) <= limit ? [r] : wrap(r.text, limit, measure(r)).map((text): Row => ({ ...r, text }))));
    if (next.length === rows.length && next.every((r, i) => r.text === rows[i]?.text)) break;
    rows = next;
    found = attempt(rows, mid.x, mid.y);
  }

  let x = found.x;
  let y = found.y;
  let fits = found.ok;
  if (!fits) {
    if (block.home !== undefined) {
      rows = block.rows;
      x = block.home.cx;
      y = block.home.cy - block.home.r - OUTSIDE_GAP - (rows.length * LINE) / 2;
      fits = true;
    } else {
      rows = block.rows;
      notes.push(`The text of ${block.key} is wider than its region.`);
    }
  }
  const h = rows.length * LINE;
  const top = y - h / 2;
  const placed = rows.map((row, k): PlacedRow => ({ row, x: Math.round(x), y: Math.round(top + LINE * k + LINE / 2), w: measure(row)(row.text) }));
  const w = Math.max(...placed.map((p) => p.w));
  return { rows: placed, label: { key: block.key, x: Math.round(x), y: Math.round(y), w, h, lines: rows.map((r) => r.text), fits } };
}

/** Places a Venn diagram: circles by sizes and overlaps, labels at the middle of their regions. */
export function layoutVenn(venn: Venn, ruler: Ruler): VennLayout {
  const geo = arrange(venn);
  const { circles } = geo;
  const notes = [...geo.notes, ...venn.ignored.map((i) => `Ignored: ${i}`)];
  const circleOf = (id: string): Circle => circles[venn.sets.findIndex((s) => s.id === id)] as Circle;

  const blocks: Block[] = [];
  for (const set of venn.sets) {
    const me = circleOf(set.id);
    const rows: Row[] = [
      { text: set.label, role: ['name'], font: 'title' },
      ...set.texts.map((t): Row => ({ text: t.label, role: ['sub'], font: 'line' })),
    ];
    blocks.push({ key: `set:${set.id}`, rows, region: { inside: [me], outside: venn.sets.filter((s) => s.id !== set.id).map((s) => circleOf(s.id)) }, home: me });
  }
  for (const union of venn.unions) {
    const rows: Row[] = [
      ...(union.label === undefined ? [] : [{ text: union.label, role: ['body', 'middle'], font: 'line' as const }]),
      ...union.texts.map((t): Row => ({ text: t.label, role: ['sub'], font: 'line' })),
    ];
    if (rows.length === 0) continue;
    const inside = union.ids.map(circleOf);
    const outside = venn.sets.filter((s) => !union.ids.includes(s.id)).map((s) => circleOf(s.id));
    const exclusive = centroid({ inside, outside }) !== undefined;
    blocks.push({ key: `union:${union.ids.join(',')}`, rows, region: { inside, outside: exclusive ? outside : [] } });
  }

  const placed = blocks.map((b) => placeBlock(b, ruler, notes));

  // Extent of everything drawn around the first circle's centre.
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const c of circles) {
    minX = Math.min(minX, c.cx - c.r);
    maxX = Math.max(maxX, c.cx + c.r);
    minY = Math.min(minY, c.cy - c.r);
    maxY = Math.max(maxY, c.cy + c.r);
  }
  for (const p of placed) {
    minX = Math.min(minX, p.label.x - p.label.w / 2);
    maxX = Math.max(maxX, p.label.x + p.label.w / 2);
    minY = Math.min(minY, p.label.y - p.label.h / 2);
    maxY = Math.max(maxY, p.label.y + p.label.h / 2);
  }

  const titleW = venn.title === undefined ? 0 : (ruler.textWidth(venn.title, 'title') * TITLE_SIZE) / 13;
  const bodyW = maxX - minX;
  const innerW = Math.max(bodyW, titleW);
  const ox = ceilTo(MARGIN + (innerW - bodyW) / 2 - minX);
  const top = MARGIN + (venn.title === undefined ? 0 : TITLE_BLOCK);
  const oy = ceilTo(top - minY);
  const width = ceilTo(Math.max(ox + maxX, MARGIN + titleW) + MARGIN);
  const height = ceilTo(oy + maxY + MARGIN);

  const items: SceneItem[] = [
    { kind: 'box', x: PANEL_INSET, y: PANEL_INSET, w: width - 2 * PANEL_INSET, h: height - 2 * PANEL_INSET, role: ['panel'] },
  ];
  if (venn.title !== undefined) items.push({ kind: 'text', x: MARGIN, y: MARGIN + 9, text: venn.title, anchor: 'start', role: ['title'] });

  const placedCircles: PlacedCircle[] = venn.sets.map((s, i) => {
    const c = circles[i] as Circle;
    const out = { id: s.id, label: s.label, cx: c.cx + ox, cy: c.cy + oy, r: c.r };
    items.push({ kind: 'circle', cx: out.cx, cy: out.cy, r: out.r, role: [`series-${(i % SERIES) + 1}--overlap`], data: { set: s.id } });
    return out;
  });
  const labels: PlacedLabel[] = [];
  for (const p of placed) {
    const label = { ...p.label, x: p.label.x + ox, y: p.label.y + oy };
    labels.push(label);
    for (const r of p.rows) {
      items.push({ kind: 'text', x: r.x + ox, y: r.y + oy, text: r.row.text, anchor: 'middle', role: r.row.role, data: { region: p.label.key } });
    }
  }

  const name = venn.accTitle ?? (venn.title === undefined ? `Venn diagram: ${venn.sets.length} sets` : `Venn diagram: ${venn.title}`);
  return { scene: { width, height, title: name, items }, circles: placedCircles, labels, approximate: geo.approximate, notes };
}
