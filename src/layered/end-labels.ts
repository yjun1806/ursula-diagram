import type { Ruler } from '../metrics.ts';
import type { Rect, Segment } from '../layout/labels.ts';
import { overlaps } from '../layout/labels.ts';
import type { Diagnostic, EndLabel, LayoutEdge, LayoutNode, Point } from '../types.ts';
import { segmentToRect } from './label-spot.ts';

/** Pixels: distance along the line from its end to the text, and from the line across to the text. */
const ALONG = 16;
const ACROSS = 8;
/** Terminal cells: the same two distances. */
const ALONG_CELLS = 2;
const ACROSS_CELLS = 0;
/** How far the text is pushed along the line, per try, and how many tries there are. */
const PUSH = 8;
const PUSH_CELLS = 1;
const TRIES = 3;
/** Pixels: size of the small text (11 px against the 12 px of a line of a box). */
const SMALL = 11 / 12;
const SMALL_HEIGHT = 14;

export interface EndTexts {
  start?: string | undefined;
  end?: string | undefined;
}

const unit = (from: Point, to: Point): Point | undefined => {
  const len = Math.hypot(to.x - from.x, to.y - from.y);
  return len < 1e-9 ? undefined : { x: (to.x - from.x) / len, y: (to.y - from.y) / len };
};

const segmentsOf = (points: Point[]): Segment[] => points.slice(1).map((q, i) => [points[i] as Point, q] as Segment);

/**
 * Puts the small texts at the ends of the lines. A text stands `ALONG` from the end of its line and `ACROSS` beside
 * it, on the left of the reading direction (from the start of the line to its end) when that is free, else on the
 * right; when both sides are taken it moves along the line by `PUSH` up to three times. A text that finds no free
 * place stays at the first one and is reported. Free means: no box, no other text and no line of its own edge under
 * it; lines of other edges are avoided in a first round and given up in a second.
 */
export function placeEndLabels(edges: LayoutEdge[], texts: ReadonlyArray<EndTexts | undefined>, nodes: LayoutNode[], ruler: Ruler): Diagnostic[] {
  const cells = ruler.terminal === true;
  const boxes: Rect[] = nodes.map(({ x, y, w, h }) => ({ x, y, w, h }));
  const placed: Rect[] = edges.flatMap((e) => (e.label && !e.invisible ? [{ x: e.label.x, y: e.label.y, w: e.label.w, h: e.label.h }] : []));
  const byId = new Map(nodes.map((n) => [n.id, n] as const));
  // A terminal line is named by the cells it runs through; an end on the left or top border of a box is drawn in the cell outside it.
  const cellOf = (e: LayoutEdge, i: number): Point => {
    const p = e.points[i] as Point;
    if (!cells) return p;
    const node = byId.get(i === 0 ? e.from : e.to);
    const onEnd = i === 0 || i === e.points.length - 1;
    return {
      x: Math.floor(p.x + 1e-9) - (onEnd && node && Math.abs(p.x - node.x) < 1e-9 ? 1 : 0),
      y: Math.floor(p.y + 1e-9) - (onEnd && node && Math.abs(p.y - node.y) < 1e-9 ? 1 : 0),
    };
  };
  const wire = edges.map((e) => e.points.map((_, i) => cellOf(e, i)));
  const all = wire.map(segmentsOf);
  const diagnostics: Diagnostic[] = [];
  const size = (text: string): { w: number; h: number } =>
    cells ? { w: ruler.textWidth(text, 'edge'), h: 1 } : { w: Math.ceil(ruler.textWidth(text, 'edge') * SMALL), h: SMALL_HEIGHT };

  edges.forEach((edge, ei) => {
    const t = texts[ei];
    if (!t || edge.invisible || edge.points.length < 2) return;
    const own = all[ei] as Segment[];
    const foreign = all.flatMap((ss, k) => (k === ei ? [] : ss));
    const pts = wire[ei] as Point[];
    for (const which of ['start', 'end'] as const) {
      const text = t[which];
      if (text === undefined || text === '') continue;
      const [at, next] = which === 'start' ? [pts[0] as Point, pts[1] as Point] : [pts[pts.length - 1] as Point, pts[pts.length - 2] as Point];
      const u = unit(at, next);
      if (!u) continue;
      const travel = which === 'start' ? u : { x: -u.x, y: -u.y };
      const left = { x: travel.y, y: -travel.x };
      const { w, h } = size(text);
      const horizontal = Math.abs(u.x) > 0.5;
      const candidates: Rect[] = [];
      for (let k = 0; k <= TRIES; k++) {
        const along = (cells ? ALONG_CELLS - 1 : ALONG) + k * (cells ? PUSH_CELLS : PUSH);
        for (const side of [left, { x: -left.x, y: -left.y }]) {
          const around = cells ? ACROSS_CELLS : ACROSS;
          // The text starts after the end of the line (a cell reaches to its far edge), and stands beside the line (a cell, to its side).
          const far = (v: number, dir: number): number => (cells && dir > 0 ? v + 1 : v);
          const x = horizontal
            ? u.x > 0
              ? far(at.x, 1) + along
              : at.x - along - w
            : side.x > 0
              ? far(at.x, 1) + around
              : at.x - around - w;
          const y = horizontal
            ? side.y > 0
              ? far(at.y, 1) + around
              : at.y - around - h
            : u.y > 0
              ? far(at.y, 1) + along
              : at.y - along - h;
          candidates.push({ x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100, w, h });
        }
      }
      // A text stands on the stretch of line it belongs to: between the end and the next bend (a terminal cell reaches to its far edge).
      const reach = cells ? 1 : 0;
      const [lo, hi] = horizontal ? [Math.min(at.x, next.x), Math.max(at.x, next.x) + reach] : [Math.min(at.y, next.y), Math.max(at.y, next.y) + reach];
      const within = (r: Rect): boolean => (horizontal ? r.x >= lo - 1e-6 && r.x + r.w <= hi + 1e-6 : r.y >= lo - 1e-6 && r.y + r.h <= hi + 1e-6);
      // A terminal line is named by the cells it runs through, so a text of w cells reaches w - 1 past its first cell.
      const lineBox = (r: Rect): Rect => (cells ? { x: r.x, y: r.y, w: Math.max(0, r.w - 1), h: Math.max(0, r.h - 1) } : r);
      const clear = (r: Rect, withLines: boolean): boolean =>
        within(r) &&
        !boxes.some((b) => overlaps(r, b)) &&
        !placed.some((p) => overlaps(r, p)) &&
        !own.some((s) => segmentToRect(s, lineBox(r)) < 1e-6) &&
        (!withLines || !foreign.some((s) => segmentToRect(s, lineBox(r)) < 1e-6));
      const pick = candidates.find((r) => clear(r, true)) ?? candidates.find((r) => clear(r, false));
      const rect = pick ?? (candidates[0] as Rect);
      if (!pick) diagnostics.push({ kind: 'label-overlap', nodes: [edge.from, edge.to], message: `The text "${text}" at the ${which} of ${edge.from} -> ${edge.to} overlaps a box, another text or a line.` });
      placed.push(rect);
      const label: EndLabel = { text, x: Math.round(rect.x * 100) / 100, y: Math.round(rect.y * 100) / 100, w: rect.w, h: rect.h };
      if (which === 'start') edge.startLabel = label;
      else edge.endLabel = label;
    }
  });
  return diagnostics;
}
