import { cellWidth } from '../metrics.ts';
import type { Layout, LayoutEdge, LayoutNode, Point } from '../types.ts';
import { renderTextLayout } from '../render/text.ts';
import { cellOf } from './text-tidy.ts';

/** What a reader of a terminal drawing pays for it, counted on the finished drawing. Less is better in every field. */
export interface TextCost {
  /** Columns and rows of the drawing as it is written out: empty rows at its end and blanks at the end of a row are not written. */
  width: number;
  rows: number;
  /** Corners of the lines. */
  bends: number;
  /** Places where two lines cross. */
  crossings: number;
  /** Corners of a line that stand on another line: the two read as joined. Lines that share a port do not count against one another. */
  touches: number;
  /** Labels whose text is cut short or has less room than it needs. */
  cut: number;
  /** Rows inside boxes that hold no text. */
  blank: number;
  /** Lines of which no cell shows, because boxes and labels cover all of them. */
  hidden: number;
  /** Labels with the line of another edge under their text. */
  crossed: number;
}

const EPS = 1e-6;
const between = (v: number, a: number, b: number): boolean => v > Math.min(a, b) + EPS && v < Math.max(a, b) - EPS;
const upright = (a: Point, b: Point): boolean => Math.abs(a.x - b.x) < EPS;

/** The cells a line is drawn in, from its first to its last; cut where a stretch is neither level nor upright. */
function cellsOf(e: LayoutEdge, nodes: Map<string, LayoutNode>): Array<[number, number]> {
  const corners = e.points.map((_, i) => cellOf(e, nodes, i));
  const first = corners[0];
  if (first === undefined) return [];
  const out: Array<[number, number]> = [first];
  let [x, y] = first;
  for (const [x2, y2] of corners.slice(1)) {
    const dx = Math.sign(x2 - x);
    const dy = Math.sign(y2 - y);
    if (dx !== 0 && dy !== 0) return out;
    while (x !== x2 || y !== y2) {
      x += dx;
      y += dy;
      out.push([x, y]);
    }
  }
  return out;
}

const inside = (r: { x: number; y: number; w: number; h: number }, [x, y]: [number, number]): boolean =>
  x >= Math.round(r.x) && x < Math.round(r.x) + Math.round(r.w) && y >= Math.round(r.y) && y < Math.round(r.y) + Math.round(r.h);

function blankRows(n: LayoutNode): number {
  if (n.shape === 'bar') return 0;
  if (n.compartments !== undefined) return n.compartments.slice(1).reduce((sum, c) => sum + (c.lines.every((t) => t === '') ? Math.max(1, c.lines.length) : 0), 0);
  return Math.max(0, Math.round(n.h) - 2 - (1 + (n.lines?.length ?? 0)));
}

export function textCost(l: Layout): TextCost {
  const nodes = new Map(l.nodes.map((n) => [n.id, n] as const));
  const drawn = l.edges.filter((e) => e.invisible !== true && e.points.length >= 2);
  const cells = drawn.map((e) => cellsOf(e, nodes));
  const labels = drawn.flatMap((e) => (e.label === undefined ? [] : [e.label]));
  const segments = drawn.map((e) => e.points.slice(1).map((p, i) => [e.points[i] as Point, p] as const));
  let crossings = 0;
  let touches = 0;
  for (let i = 0; i < drawn.length; i++) {
    for (let j = 0; j < drawn.length; j++) {
      if (i === j) continue;
      const [a, b] = [drawn[i] as LayoutEdge, drawn[j] as LayoutEdge];
      const together = a.sharedPort !== undefined && a.sharedPort.id === b.sharedPort?.id;
      for (const [p, q] of segments[j] ?? []) {
        if (!together) for (const c of a.points.slice(1, -1)) if (upright(p, q) ? Math.abs(c.x - p.x) < EPS && between(c.y, p.y, q.y) : Math.abs(c.y - p.y) < EPS && between(c.x, p.x, q.x)) touches++;
        if (i > j) continue;
        for (const [r, s] of segments[i] ?? []) {
          if (upright(p, q) === upright(r, s)) continue;
          const [v, h] = upright(p, q) ? [[p, q] as const, [r, s] as const] : [[r, s] as const, [p, q] as const];
          if (between(v[0].x, h[0].x, h[1].x) && between(h[0].y, v[0].y, v[1].y)) crossings++;
        }
      }
    }
  }
  const short = (t: { text: string; w: number; lines?: string[] }): boolean => t.text.includes('…') || Math.round(t.w) < Math.max(...(t.lines ?? [t.text]).map(cellWidth));
  const crossed = drawn.filter((e, i) => {
    const t = e.label;
    if (t === undefined) return false;
    const [x0, x1, y] = [Math.round(t.x) + 1, Math.round(t.x) + Math.round(t.w) - 2, Math.round(t.y)];
    return cells.some((cs, k) => k !== i && cs.some(([x, cy]) => cy === y && x >= x0 && x <= x1));
  }).length;
  const hidden = cells.filter((cs) => {
    // The last cell holds the arrowhead, not the line.
    const line = cs.slice(0, -1);
    return line.length > 0 && line.every((c) => labels.some((r) => inside(r, c)) || l.nodes.some((n) => inside(n, c)));
  }).length;
  const written = renderTextLayout(l);
  return {
    width: Math.max(0, ...written.map(cellWidth)),
    rows: written.length,
    bends: drawn.reduce((sum, e) => sum + e.points.length - 2, 0),
    crossings,
    touches,
    cut: labels.filter(short).length,
    blank: l.nodes.reduce((sum, n) => sum + blankRows(n), 0),
    hidden,
    crossed,
  };
}

/** Whether drawing `a` costs more than drawing `b` in some respect. */
export function costsMore(a: TextCost, b: TextCost): boolean {
  return (Object.keys(a) as Array<keyof TextCost>).some((k) => a[k] > b[k] + EPS);
}
