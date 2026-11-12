import { boxesOverlap } from '../chart/label-place.ts';
import type { Box } from '../chart/label-place.ts';
import { ceilTo, floorTo, round2 } from '../chart/grid.ts';
import type { Ruler } from '../metrics.ts';
import { shrinkToFit } from '../text/fit.ts';
import type { Scene, SceneItem } from '../types.ts';
import { nearestSeries } from './colors.ts';
import { valueText } from './model.ts';
import type { Sankey } from './model.ts';

const MARGIN = 24;
const NODE_W = 12;
const NODE_PAD = 16;
/** A label above a node stands in the gap between two nodes, so a gap is never narrower than a label line. */
const LABEL_H = 16;
const LABEL_GAP = 8;
const VALUE_GAP = 6;
const TARGET_W = 840;
const MIN_PLOT_H = 400;
const MIN_STEP = 64;
const SERIES = 8;
const TITLE_H = 18;
const TITLE_GAP = 16;
const TITLE_SIZE = 15;
const SWEEPS = 8;
/** Rounds of swapping neighbours in a column while that removes crossings. */
const SWAP_ROUNDS = 6;
const MAX_STEP = 1200;
/** Two boxes that only touch, within float noise, do not overlap. */
const TOUCH = -0.01;

export interface PlacedSankeyNode {
  name: string;
  /** The larger of what flows in and what flows out. */
  value: number;
  valueText: string;
  /** Zero-based column: 0 for a node nothing flows into, otherwise the longest chain of flows leading to it plus one. */
  column: number;
  /** One-based colour family, in order of first appearance. */
  series: number;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Where the name and the value are written and the box both take. */
  label: { side: 'left' | 'right' | 'above'; nameX: number; valueX: number; y: number; nameAnchor: 'start' | 'end'; box: Box };
}

export interface PlacedBand {
  source: string;
  target: string;
  value: number;
  series: number;
  /** Height of the band at both ends. */
  thickness: number;
  /** Top of the band where it leaves the source and where it enters the target. */
  fromY: number;
  toY: number;
  d: string;
}

export interface SankeyLayout {
  scene: Scene;
  nodes: PlacedSankeyNode[];
  bands: PlacedBand[];
  /** Pixels of height per unit of value. */
  scale: number;
  columns: number;
}

/** Column of every node: 0 when nothing flows in, else the longest chain of flows leading in, plus one. */
function columnsOf(map: Sankey): number[] {
  const incoming = map.nodes.map(() => [] as number[]);
  for (const l of map.links) incoming[l.target]?.push(l.source);
  const memo = new Array<number | undefined>(map.nodes.length).fill(undefined);
  const depth = (i: number): number => {
    const known = memo[i];
    if (known !== undefined) return known;
    const d = Math.max(-1, ...(incoming[i] ?? []).map(depth)) + 1;
    memo[i] = d;
    return d;
  };
  return map.nodes.map((_, i) => depth(i));
}

/** Top of every node when each column is centred on the plot and holds its nodes in `order`, `pad` apart. */
function stackY(order: number[][], height: number[], pad: number, plotTop: number, plotH: number): number[] {
  const y = new Array<number>(height.length).fill(0);
  for (const col of order) {
    const colH = col.reduce((a, i) => a + (height[i] ?? 0), 0) + pad * Math.max(0, col.length - 1);
    let cy = plotTop + floorTo((plotH - colH) / 2);
    for (const i of col) {
      y[i] = cy;
      cy += (height[i] ?? 0) + pad;
    }
  }
  return y;
}

interface Centreline {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  weight: number;
}

/** Height of a band's centre line at `x`: the curve leaves and enters level, with both control points at the middle x. */
function centreAt(c: Centreline, x: number): number {
  const mx = (c.x0 + c.x1) / 2;
  let lo = 0;
  let hi = 1;
  for (let k = 0; k < 30; k++) {
    const t = (lo + hi) / 2;
    const u = 1 - t;
    const xt = c.x0 * u * u * u + 3 * mx * u * t + c.x1 * t * t * t;
    if (xt < x) lo = t;
    else hi = t;
  }
  const t = (lo + hi) / 2;
  const u = 1 - t;
  return c.y0 * (u * u * u + 3 * u * u * t) + c.y1 * (3 * u * t * t + t * t * t);
}

/** Sum over every pair of bands that swap their up-down order inside their common span, weighted by the thinner band. */
export function crossingWeight(lines: Centreline[]): number {
  let total = 0;
  for (let a = 0; a < lines.length; a++) {
    const p = lines[a] as Centreline;
    for (let b = a + 1; b < lines.length; b++) {
      const q = lines[b] as Centreline;
      const lo = Math.max(p.x0, q.x0);
      const hi = Math.min(p.x1, q.x1);
      if (hi - lo < 1e-6) continue;
      const before = centreAt(p, lo) - centreAt(q, lo);
      const after = centreAt(p, hi) - centreAt(q, hi);
      if (before * after < -1e-9) total += Math.min(p.weight, q.weight);
    }
  }
  return total;
}

/**
 * Lays a sankey out. Nodes sit in columns by depth; the height of a node follows the larger of what flows in and out,
 * and the order inside a column is settled by sweeping the value-weighted mean position of each node's neighbours.
 * Bands leave the right face of a node and enter the left face of the next, stacked in the order of the node at the other end.
 */
export function layoutSankey(map: Sankey, ruler: Ruler): SankeyLayout {
  const count = map.nodes.length;
  const nodeW = map.nodeWidth ?? NODE_W;
  const pad = Math.max(NODE_PAD, map.nodePadding ?? NODE_PAD);
  const column = columnsOf(map);
  const columns = Math.max(...column) + 1;

  const inSum = new Array<number>(count).fill(0);
  const outSum = new Array<number>(count).fill(0);
  const degree = new Array<number>(count).fill(0);
  for (const l of map.links) {
    outSum[l.source] = (outSum[l.source] ?? 0) + l.value;
    inSum[l.target] = (inSum[l.target] ?? 0) + l.value;
    degree[l.source] = (degree[l.source] ?? 0) + 1;
    degree[l.target] = (degree[l.target] ?? 0) + 1;
  }
  const value = map.nodes.map((_, i) => Math.max(inSum[i] ?? 0, outSum[i] ?? 0));

  let order: number[][] = Array.from({ length: columns }, () => []);
  column.forEach((c, i) => order[c]?.push(i));

  // One scale for the whole drawing: the fullest column, gaps included, fills the plot height.
  const plotH = Math.max(MIN_PLOT_H, ceilTo(Math.max(...order.map((c) => c.length)) * (pad + LABEL_H)));
  const scale = Math.min(...order.map((c) => (plotH - pad * (c.length - 1)) / c.reduce((a, i) => a + (value[i] ?? 0), 0)));
  const height = value.map((v) => v * scale);

  const titleBlock = map.title === undefined ? 0 : TITLE_H + TITLE_GAP;
  const plotTop = MARGIN + titleBlock + (columns >= 3 ? LABEL_H : 0);

  // Centre lines of every band for an order, one unit of x per column; the bands stack at a node in the order of the other end.
  const linesOf = (ord: number[][]): Centreline[] => {
    const y = stackY(ord, height, pad, plotTop, plotH);
    const mid = (i: number): number => (y[i] ?? 0) + (height[i] ?? 0) / 2;
    const outAt = new Array<number>(map.links.length).fill(0);
    const inAt = new Array<number>(map.links.length).fill(0);
    for (let i = 0; i < count; i++) {
      let o = 0;
      for (const k of linkIds.filter((k) => map.links[k]?.source === i).sort((a, b) => mid(map.links[a]?.target ?? 0) - mid(map.links[b]?.target ?? 0) || a - b)) {
        outAt[k] = o;
        o += (map.links[k]?.value ?? 0) * scale;
      }
      let n = 0;
      for (const k of linkIds.filter((k) => map.links[k]?.target === i).sort((a, b) => mid(map.links[a]?.source ?? 0) - mid(map.links[b]?.source ?? 0) || a - b)) {
        inAt[k] = n;
        n += (map.links[k]?.value ?? 0) * scale;
      }
    }
    return map.links.map((l, k) => {
      const t = l.value * scale;
      return { x0: column[l.source] ?? 0, x1: column[l.target] ?? 0, y0: (y[l.source] ?? 0) + (outAt[k] ?? 0) + t / 2, y1: (y[l.target] ?? 0) + (inAt[k] ?? 0) + t / 2, weight: t };
    });
  };
  const linkIds = map.links.map((_, k) => k);
  const cost = (ord: number[][]): number => crossingWeight(linesOf(ord));

  // Sweep the columns by the value-weighted mean position of their neighbours, forward and backward, and keep the order
  // that crosses least; then swap neighbours inside a column while a swap removes crossings.
  const neighbours = map.nodes.map(() => [] as Array<{ other: number; value: number }>);
  for (const l of map.links) {
    neighbours[l.source]?.push({ other: l.target, value: l.value });
    neighbours[l.target]?.push({ other: l.source, value: l.value });
  }
  let best = order;
  let bestCost = cost(order);
  for (let s = 0; s < SWEEPS && bestCost > 0; s++) {
    const forward = s % 2 === 0;
    const cols = forward ? Array.from({ length: columns - 1 }, (_, k) => k + 1) : Array.from({ length: columns - 1 }, (_, k) => columns - 2 - k);
    for (const c of cols) {
      const y = stackY(order, height, pad, plotTop, plotH);
      const centre = (i: number): number => (y[i] ?? 0) + (height[i] ?? 0) / 2;
      const key = new Map<number, number>();
      for (const i of order[c] ?? []) {
        const near = neighbours[i] ?? [];
        const weight = near.reduce((a, n) => a + n.value, 0);
        key.set(i, near.reduce((a, n) => a + n.value * centre(n.other), 0) / weight);
      }
      const before = new Map((order[c] ?? []).map((i, at) => [i, at]));
      const sorted = [...(order[c] ?? [])].sort((a, b) => {
        const d = (key.get(a) ?? 0) - (key.get(b) ?? 0);
        return Math.abs(d) > 1e-6 ? d : (before.get(a) ?? 0) - (before.get(b) ?? 0);
      });
      order = order.map((col, k) => (k === c ? sorted : col));
    }
    const now = cost(order);
    if (now < bestCost - 1e-9) {
      best = order;
      bestCost = now;
    }
  }
  order = best;
  for (let round = 0; round < SWAP_ROUNDS && bestCost > 0; round++) {
    let improved = false;
    for (let c = 0; c < columns; c++) {
      for (let at = 0; at + 1 < (order[c]?.length ?? 0); at++) {
        const col = [...(order[c] ?? [])];
        [col[at], col[at + 1]] = [col[at + 1] as number, col[at] as number];
        const trial = order.map((old, k) => (k === c ? col : old));
        const now = cost(trial);
        if (now < bestCost - 1e-9) {
          order = trial;
          bestCost = now;
          improved = true;
        }
      }
    }
    if (!improved) break;
  }
  const top = stackY(order, height, pad, plotTop, plotH);

  // Labels: the first column writes to the left of its nodes, the last to the right, the others above.
  const nameW = (t: string): number => ruler.textWidth(t, 'title');
  const numW = (t: string): number => ruler.textWidth(t, 'line');
  const shown = map.nodes.map((nd, i) => ({ name: nd.name, nameW: nameW(nd.name), text: valueText(value[i] ?? 0), ...(map.showValues ? {} : { hide: true }) }));
  const labelW = (i: number): number => {
    const s = shown[i];
    if (s === undefined) return 0;
    return s.nameW + ('hide' in s ? 0 : VALUE_GAP + numW(s.text));
  };
  const widest = (c: number): number => Math.max(0, ...(order[c] ?? []).map(labelW));
  const left = ceilTo(MARGIN + widest(0) + LABEL_GAP);
  const rightRoom = nodeW + LABEL_GAP + widest(columns - 1) + MARGIN;

  const seriesOf = (i: number, name: string): number => {
    const asked = map.nodeColors?.[name];
    return asked === undefined ? (i % SERIES) + 1 : nearestSeries(asked);
  };

  const build = (step: number) => {
    const width = ceilTo(left + (columns - 1) * step + rightRoom);
    const placed: PlacedSankeyNode[] = map.nodes.map((nd, i) => {
      const c = column[i] ?? 0;
      const x = left + c * step;
      const y = top[i] ?? 0;
      const h = height[i] ?? 0;
      const w = labelW(i);
      const s = shown[i];
      const hasValue = s !== undefined && !('hide' in s);
      const vW = hasValue ? numW(s.text) : 0;
      const nW = s?.nameW ?? 0;
      let side: 'left' | 'right' | 'above';
      let box: Box;
      let nameX: number;
      let valueX: number;
      let cy = y + h / 2;
      let nameAnchor: 'start' | 'end' = 'start';
      if (c === 0) {
        side = 'left';
        const right = x - LABEL_GAP;
        nameAnchor = 'end';
        valueX = right;
        nameX = hasValue ? right - vW - VALUE_GAP : right;
        box = { x0: right - w, x1: right, y0: cy - LABEL_H / 2, y1: cy + LABEL_H / 2 };
      } else if (c === columns - 1) {
        side = 'right';
        const start = x + nodeW + LABEL_GAP;
        nameX = start;
        valueX = start + nW + VALUE_GAP;
        box = { x0: start, x1: start + w, y0: cy - LABEL_H / 2, y1: cy + LABEL_H / 2 };
      } else {
        side = 'above';
        const start = x + nodeW / 2 - w / 2;
        cy = y - LABEL_H / 2;
        nameX = start;
        valueX = start + nW + VALUE_GAP;
        box = { x0: start, x1: start + w, y0: y - LABEL_H, y1: y };
      }
      return { name: nd.name, value: value[i] ?? 0, valueText: hasValue ? s.text : valueText(value[i] ?? 0), column: c, series: seriesOf(i, nd.name), x, y, w: nodeW, h, label: { side, nameX, valueX, y: cy, nameAnchor, box } };
    });
    return { width, placed };
  };

  const clashes = (width: number, placed: PlacedSankeyNode[], height_: number): boolean => {
    const canvas: Box = { x0: 0, x1: width, y0: 0, y1: height_ };
    return placed.some((a, i) => {
      const b = a.label.box;
      if (b.x0 < canvas.x0 || b.x1 > canvas.x1 || b.y0 < canvas.y0 || b.y1 > canvas.y1) return true;
      return placed.some((o, k) => {
        if (k === i) return false;
        if (k > i && boxesOverlap(b, o.label.box, TOUCH)) return true;
        return boxesOverlap(b, { x0: o.x, x1: o.x + o.w, y0: o.y, y1: o.y + o.h }, TOUCH);
      });
    });
  };

  const height_ = ceilTo(plotTop + plotH + MARGIN);
  let step = Math.max(MIN_STEP, floorTo((TARGET_W - left - rightRoom - 0) / (columns - 1)));
  let built = build(step);
  while (clashes(built.width, built.placed, height_) && step < MAX_STEP) {
    step += 4;
    built = build(step);
  }
  const { width, placed } = built;

  // Bands: the ones leaving a node stack in the vertical order of their targets, the ones entering in the order of their sources.
  const byLink = map.links.map((l, k) => ({ l, k }));
  const centreOf = (i: number): number => (placed[i]?.y ?? 0) + (placed[i]?.h ?? 0) / 2;
  const outAt = new Array<number>(map.links.length).fill(0);
  const inAt = new Array<number>(map.links.length).fill(0);
  for (let i = 0; i < count; i++) {
    let o = 0;
    for (const { l, k } of byLink.filter((e) => e.l.source === i).sort((a, b) => centreOf(a.l.target) - centreOf(b.l.target) || a.k - b.k)) {
      outAt[k] = o;
      o += l.value * scale;
    }
    let n = 0;
    for (const { l, k } of byLink.filter((e) => e.l.target === i).sort((a, b) => centreOf(a.l.source) - centreOf(b.l.source) || a.k - b.k)) {
      inAt[k] = n;
      n += l.value * scale;
    }
  }
  const bands: PlacedBand[] = map.links.map((l, k) => {
    const from = placed[l.source] as PlacedSankeyNode;
    const to = placed[l.target] as PlacedSankeyNode;
    const t = l.value * scale;
    const fromY = from.y + (outAt[k] ?? 0);
    const toY = to.y + (inAt[k] ?? 0);
    const x0 = from.x + from.w;
    const x1 = to.x;
    const mx = (x0 + x1) / 2;
    const r = round2;
    const d = `M${r(x0)} ${r(fromY)} C${r(mx)} ${r(fromY)} ${r(mx)} ${r(toY)} ${r(x1)} ${r(toY)} V${r(toY + t)} C${r(mx)} ${r(toY + t)} ${r(mx)} ${r(fromY + t)} ${r(x0)} ${r(fromY + t)} Z`;
    // A band takes the colour of the end with fewer links, so a hub does not paint everything around it.
    const series = (degree[l.source] ?? 0) <= (degree[l.target] ?? 0) ? from.series : to.series;
    return { source: from.name, target: to.name, value: l.value, series, thickness: t, fromY, toY, d };
  });

  const items: SceneItem[] = [{ kind: 'box', style: 'frame', x: 16, y: 16, w: width - 32, h: height_ - 32, role: ['panel'] }];
  if (map.title !== undefined) {
    const t = shrinkToFit(map.title, width - 2 * MARGIN, (s) => (nameW(s) * TITLE_SIZE) / 13);
    if (t !== undefined) items.push({ kind: 'text', x: MARGIN, y: MARGIN + TITLE_H / 2, text: t, anchor: 'start', role: ['title'] });
  }
  for (const b of bands) {
    items.push({ kind: 'path', d: b.d, role: [`series-${b.series}--tint`], data: { source: b.source, target: b.target, value: valueText(b.value) } });
  }
  for (const n of placed) {
    items.push({ kind: 'box', style: 'bar', x: n.x, y: round2(n.y), w: n.w, h: round2(n.h), radius: 0, role: [`series-${n.series}`], data: { name: n.name, value: n.valueText } });
  }
  for (const n of placed) {
    const anchor = n.label.nameAnchor;
    items.push({ kind: 'text', x: round2(n.label.nameX), y: round2(n.label.y), text: n.name, anchor, role: map.outlined ? ['name', 'tick--halo'] : ['name'], data: { node: n.name } });
    if (map.showValues) {
      items.push({ kind: 'text', x: round2(n.label.valueX), y: round2(n.label.y), text: n.valueText, anchor, role: map.outlined ? ['value'] : ['value', 'value--plain'], data: { node: n.name } });
    }
  }

  const label = map.accTitle ?? (map.title !== undefined ? `Sankey: ${map.title}` : `Sankey: ${count} nodes, ${map.links.length} flows`);
  return { scene: { width, height: height_, title: label, items }, nodes: placed, bands, scale, columns };
}
