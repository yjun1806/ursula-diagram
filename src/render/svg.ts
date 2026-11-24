import { withLegend } from '../layout/legend.ts';
import { pixelRuler } from '../metrics.ts';
import { ACTOR_H, ACTOR_NAME_GAP, COMPARTMENT_INSET, columnStarts, faceLineHeights, FACE_PILL_GAP, compartmentHeights, CYLINDER_CAP, END_CORE, hasCompartments, lineEmphasis, NOTE_FOLD, COMPARTMENT_LINE } from '../layout/records.ts';
import type { LegendKind } from '../sequence/model.ts';
import { asymPoints, diamondPoints, hexagonPoints, leanLeftPoints, parallelogramPoints, reachRoundedCorner, RING_GAP, roundedPolygonPath, trapBottomPoints, trapTopPoints, trimToOutline } from './shapes.ts';
import { fillColors } from './colors.ts';
import { SCENE_THEME } from './scene-theme.ts';
import { TITLE_CENTRE, TITLE_ROW, widthWithTitle } from '../front/title.ts';
import { ARROW_TRIM, flowMarker, flowRules, recordRules, THEME } from './theme.ts';
import type { EdgeEnd, EdgeStyle, EndLabel, Layout, LayoutCluster, LayoutEdge, LayoutLane, LayoutNode, Legend, Point } from '../types.ts';
import { CLUSTER_NAME_INSET } from '../layout/clusters.ts';

export interface NodeHookResult {
  attrs?: Record<string, string>;
  className?: string;
  extra?: string;
}

export type NodeHook = (node: LayoutNode) => NodeHookResult | void;

export interface SvgOptions {
  node?: NodeHook;
  /** Accessible name of the drawing; defaults to a short summary. */
  title?: string;
  /** Re-captions the legend of the layout, or removes it with `false`. Flowcharts read the edge styles, sequence diagrams the message kinds. */
  legend?: false | Partial<Record<EdgeStyle | LegendKind, string>>;
  /** Title drawn above the drawing, left-aligned with its content; the canvas grows by one title row. Absent draws none. */
  drawTitle?: string;
}

const TITLE_LINE = 18;
const BODY_LINE = 16;
const CORNER_RADIUS = 8;
/** Radius of the rounded corners of a diamond, at most; sharp corners get less. */
const DIAMOND_RADIUS = 12;
/** Height of an edge label, and the room between its text and its sides. */
const CHIP_HEIGHT = 24;
const CHIP_PAD = 10;
/** Diameter of a dot at the end of a line, and length of each stroke of a cross. */
const DOT = 8;
const CROSS = 8;

/** Height of the end caps of a cylinder, and the inset of the bars of a subroutine. */
const CAP = CYLINDER_CAP;
const BAR = 8;

export const FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', 'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif";

const FONT = FONT_STACK;

/** Rules are written once with $name placeholders and expanded per colour scheme. */
function styleSheet(rules: readonly string[]): string {
  const light = rules.map((r) => fillColors(r, 0)).join('\n');
  const dark = rules.map((r) => fillColors(r, 1)).join('\n');
  return `${light}\n@media (prefers-color-scheme: dark){\n${dark}\n}`;
}

export function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function num(v: number): string {
  const r = Math.round(v * 100) / 100;
  return String(r === 0 ? 0 : r);
}

/**
 * The path through `points` with its bends rounded by `radius`. The last point is moved back along the last piece by
 * `endTrim` (the length an arrowhead takes), and the bend before it is made smaller when the piece is too short to
 * keep that much straight.
 */
export function pathData(points: Point[], radius = CORNER_RADIUS, endTrim = 0, hops: readonly Point[] = []): string {
  const first = points[0];
  if (!first) return '';
  let d = `M${num(first.x)} ${num(first.y)}`;
  let at = { x: first.x, y: first.y };
  // A straight run to (x, y); on a level run it jumps over the crossings in `hops` by a half circle above the line.
  const line = (x: number, y: number): void => {
    if (Math.abs(y - at.y) < 0.5 && hops.length > 0) {
      const dir = Math.sign(x - at.x);
      const over = hops
        .filter((h) => Math.abs(h.y - y) < 0.5 && (h.x - at.x) * dir > HOP + 0.5 && (x - h.x) * dir > HOP + 0.5)
        .sort((p, q) => (p.x - q.x) * dir);
      for (const h of over) {
        d += ` L${num(h.x - dir * HOP)} ${num(y)} A${HOP} ${HOP} 0 0 ${dir > 0 ? 1 : 0} ${num(h.x + dir * HOP)} ${num(y)}`;
      }
    }
    d += ` L${num(x)} ${num(y)}`;
    at = { x, y };
  };
  let consumed = 0;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const cur = points[i];
    const next = points[i + 1];
    if (!prev || !cur) continue;
    const lenIn = Math.hypot(cur.x - prev.x, cur.y - prev.y);
    if (!next) {
      const cut = lenIn === 0 ? 0 : Math.min(endTrim, Math.max(0, lenIn - consumed - 1));
      line(cur.x - ((cur.x - prev.x) / (lenIn || 1)) * cut, cur.y - ((cur.y - prev.y) / (lenIn || 1)) * cut);
      continue;
    }
    const lenOut = Math.hypot(next.x - cur.x, next.y - cur.y);
    const room = i + 1 === points.length - 1 ? Math.max(0, lenOut - endTrim) : lenOut;
    const r = Math.min(radius, lenIn / 2, lenOut / 2, room);
    if (r <= 0) {
      line(cur.x, cur.y);
      consumed = 0;
      continue;
    }
    consumed = r;
    const inX = (cur.x - prev.x) / lenIn;
    const inY = (cur.y - prev.y) / lenIn;
    const outX = (next.x - cur.x) / lenOut;
    const outY = (next.y - cur.y) / lenOut;
    const sweep = inX * outY - inY * outX > 0 ? 1 : 0;
    line(cur.x - inX * r, cur.y - inY * r);
    d += ` A${num(r)} ${num(r)} 0 0 ${sweep} ${num(cur.x + outX * r)} ${num(cur.y + outY * r)}`;
    at = { x: cur.x + outX * r, y: cur.y + outY * r };
  }
  return d;
}

/** The radius of the half circle a level line jumps a crossing line by. */
const HOP = 6;

/** Per edge, the points where a level run of it crosses an upright run of another edge, both strictly inside: it jumps there. */
function hopsOf(edges: readonly LayoutEdge[]): Point[][] {
  const runs = edges.map((e) => (e.invisible ? [] : e.points.slice(1).map((q, i) => [e.points[i] as Point, q] as const)));
  return runs.map((mine, i) =>
    mine.flatMap(([a, b]) => {
      if (Math.abs(a.y - b.y) >= 0.5) return [];
      const [x0, x1] = [Math.min(a.x, b.x), Math.max(a.x, b.x)];
      return runs.flatMap((other, j) =>
        j === i
          ? []
          : edges[j]?.trunk !== undefined && edges[j]?.trunk?.id === edges[i]?.trunk?.id
            ? []
            : other.flatMap(([p, q]) => {
              if (Math.abs(p.x - q.x) >= 0.5) return [];
              const [y0, y1] = [Math.min(p.y, q.y), Math.max(p.y, q.y)];
              return p.x > x0 + 0.5 && p.x < x1 - 0.5 && a.y > y0 + 0.5 && a.y < y1 - 0.5 ? [{ x: p.x, y: a.y }] : [];
            }),
      );
    }),
  );
}

type Role = 'start' | 'decision';

/** What a drawing needs to know about its nodes while it draws. */
interface Paint {
  /** Role of a node: a diamond decides, a node nothing leads to starts; the others have none. */
  roles: Map<string, Role>;
  /** Nodes that stand in a lane drawn with a tint. */
  tinted: Set<string>;
}

/** Whether a node is one of the record shapes, which are coloured by their own rules and take no role. */
const isRecordNode = (n: LayoutNode): boolean => hasCompartments(n) || RECORD_SHAPES.has(n.shape);

const RECORD_SHAPES: ReadonlySet<LayoutNode['shape']> = new Set(['start-dot', 'end-dot', 'bar', 'note', 'ellipse', 'actor']);

function rolesOf(layout: Layout): Map<string, Role> {
  const led = new Set(layout.edges.filter((e) => e.from !== e.to && !e.invisible).map((e) => e.to));
  const roles = new Map<string, Role>();
  for (const n of layout.nodes) if (n.shape === 'diamond') roles.set(n.id, 'decision');
  const plain = layout.nodes.filter((n) => !isRecordNode(n));
  const starts = plain.filter((n) => !led.has(n.id));
  // A drawing with a start dot has its start there: no box is promoted when every box has a line leading to it.
  const first = layout.nodes.some(isRecordNode) ? [] : plain.slice(0, 1);
  for (const n of starts.length > 0 ? starts : first) if (!roles.has(n.id)) roles.set(n.id, 'start');
  return roles;
}

function laneSvg(lane: LayoutLane, tint: boolean, centred: boolean): string {
  if (lane.label === '') return '';
  const box = lane.labelBox;
  return (
    `<g class="ursula-lane-group" data-lane="${escapeXml(lane.id)}">` +
    `<rect class="ursula-lane${tint ? ' ursula-lane--tint' : ''}" x="${num(lane.x)}" y="${num(lane.y)}" width="${num(lane.w)}" height="${num(lane.h)}" rx="${num(THEME.boxRadius + 4)}"/>` +
    `<text class="ursula-lane-label" x="${num(centred ? box.x + box.w / 2 : box.x)}" y="${num(box.y + box.h / 2)}"${centred ? ' text-anchor="middle"' : ''} dominant-baseline="central">${escapeXml(lane.label)}</text>` +
    '</g>'
  );
}

/** The text of a cluster name: its first line stands 12 below the top of `name`, the others 16 further each, a subtitle 18. */
function nameText(cluster: LayoutCluster): string {
  const name = cluster.name;
  const x = name?.x ?? cluster.x + CLUSTER_NAME_INSET;
  const top = name?.y ?? cluster.y + 12;
  const lines = name?.lines ?? [cluster.label];
  const step = name?.subtitle === true ? 18 : 16;
  return lines.map((l, i) => `<text class="ursula-zone-name${i > 0 && name?.subtitle === true ? ' ursula-zone-sub' : ''}" x="${num(x)}" y="${num(top + 12 + step * i)}">${escapeXml(l)}</text>`).join('');
}

/** The look of a dashed boundary by depth: the outermost, then the even and the odd depths by turns. */
function tintOf(cluster: LayoutCluster): 'tint-outer' | 'tint-mid' | 'tint-inner' {
  return cluster.depth <= 1 ? 'tint-outer' : cluster.depth % 2 === 0 ? 'tint-mid' : 'tint-inner';
}

/** The fill step under the middle of a label: that of the deepest dashed boundary holding it, if any. */
function tintUnder(edge: LayoutEdge, clusters: readonly LayoutCluster[]): 'tint-outer' | 'tint-mid' | 'tint-inner' | undefined {
  const l = edge.label;
  if (l === undefined) return undefined;
  const [x, y] = [l.x + l.w / 2, l.y + l.h / 2];
  const holding = clusters.filter((c) => c.style === 'dashed' && x > c.x && x < c.x + c.w && y > c.y && y < c.y + c.h);
  if (holding.length === 0) return undefined;
  return tintOf(holding.reduce((a, b) => (b.depth > a.depth ? b : a)));
}

/** A cluster box: tinted at odd depths, plain at even ones, or a dashed outline without a fill; its name stands in the gap of the top row the lines leave. */
function clusterSvg(cluster: LayoutCluster): string {
  const look = cluster.style === 'dashed' ? ` ursula-zone--dashed ursula-zone--${tintOf(cluster)}` : cluster.depth % 2 === 0 ? ' ursula-zone--plain' : '';
  return (
    `<g class="ursula-cluster" data-cluster="${escapeXml(cluster.id)}">` +
    `<rect class="ursula-zone${look}" x="${num(cluster.x)}" y="${num(cluster.y)}" width="${num(cluster.w)}" height="${num(cluster.h)}" rx="${num(THEME.boxRadius + 4)}"/>` +
    (cluster.name?.knockout ? '' : nameText(cluster)) +
    '</g>'
  );
}

/** A name a line passes behind: drawn over the lines on a knockout of the fill, so that the line is seen to stop at it. */
function knockoutSvg(cluster: LayoutCluster): string {
  const name = cluster.name;
  if (!name?.knockout) return '';
  const look = cluster.style === 'dashed' ? ` ursula-zone-knock--dashed ursula-zone--${tintOf(cluster)}` : cluster.depth % 2 === 0 ? ' ursula-zone-knock--plain' : '';
  return `<g class="ursula-cluster-name" data-cluster="${escapeXml(cluster.id)}"><rect class="ursula-zone-knock${look}" x="${num(name.x - 4)}" y="${num(name.y - 2)}" width="${num(name.w + 8)}" height="${num(name.h + 4)}"/>${nameText(cluster)}</g>`;
}

/**
 * The rules of what only a C4 drawing has: a boundary name stands in ink over its muted subtitle, the description of
 * an element is muted under its name, and the technology of a relation is fainter than its label.
 */
function faceRules(layout: Layout): string[] {
  const faced = layout.nodes.some((n) => n.compartments?.some((c) => c.face === true));
  return [
    ...(faced ? ['.ursula-zone-name{fill:$fg;font-size:13px}', '.ursula-zone-sub{fill:$muted;font-size:12px;font-weight:500;opacity:1}', '.ursula-cell-body{fill:$muted}'] : []),
    ...(layout.edges.some((e) => e.label?.text.includes('\u2003')) ? ['.ursula-edge-label-tech{font-weight:400;opacity:.7}'] : []),
  ];
}

/**
 * A dashed boundary by depth: its fill, the fill of a label chip on it, and the outline that replaces the dashes. The
 * outermost keeps its dashes, the next is the face of the page in a thin solid line, the innermost a fill in a hairline.
 */
const TINTS = [
  ['outer', '$tint-outer', '$tint-chip', ''],
  ['mid', '$surface', '$chip-fill', ';stroke:$line;stroke-width:1;stroke-dasharray:none'],
  ['inner', '$tint-inner', '$tint-chip', ';stroke:$hair;stroke-width:1;stroke-dasharray:none'],
] as const;

/** Rules for the cluster boxes, added only to a drawing that has some; the dashed zone takes the width and the dashes of its stroke from the scene measures. */
function clusterRules(clusters: readonly LayoutCluster[]): string[] {
  if (clusters.length === 0) return [];
  const m = SCENE_THEME.metrics;
  return [
    '.ursula-zone{fill:$lane;stroke:$hair;stroke-width:1}',
    '.ursula-zone--plain{fill:$surface}',
    ...(clusters.some((c) => c.style === 'dashed')
      ? [`.ursula-zone--dashed{fill:none;stroke:$faint;stroke-width:${m['zone-dash-w'] ?? '1'};stroke-dasharray:${m['dash'] ?? 'none'};stroke-linecap:round}`]
      : []),
    // The dashed boundaries take a fill by depth, a knockout of a name too.
    ...(clusters.some((c) => c.style === 'dashed')
      ? TINTS.flatMap(([t, fill, chip, stroke]) => [`.ursula-zone--dashed.ursula-zone--tint-${t}{fill:${fill}${stroke}}`, `.ursula-zone-knock--dashed.ursula-zone--tint-${t}{fill:${fill}}`, `.ursula-edge-label--on-tint-${t} .ursula-edge-label-bg{fill:${chip}}`])
      : []),
    '.ursula-zone-name{fill:$muted;font-size:12px;font-weight:600}',
    ...(clusters.some((c) => c.name?.subtitle === true) ? ['.ursula-zone-sub{font-weight:400;opacity:.75}'] : []),
    ...(clusters.some((c) => c.name?.knockout) ? ['.ursula-zone-knock{fill:$lane}', '.ursula-zone-knock--plain{fill:$surface}', '.ursula-zone-knock--dashed{fill:$surface}'] : []),
  ];
}

/** The edge with both ends moved onto the outline of shapes that do not fill their box. */
function trimmedPoints(edge: LayoutEdge, nodes: Map<string, LayoutNode>): Point[] {
  const pts = edge.points;
  if (pts.length < 2) return pts;
  const from = nodes.get(edge.from);
  const to = nodes.get(edge.to);
  const out = [...pts];
  if (from) out[0] = trimToOutline(from, pts[0] as Point, pts[1] as Point);
  if (to) out[pts.length - 1] = trimToOutline(to, pts[pts.length - 1] as Point, pts[pts.length - 2] as Point);
  // A diamond is drawn with rounded corners; an end on a corner continues to the rounded end.
  if (from?.outline) out[0] = reachRoundedCorner(diamondPoints(from.outline), DIAMOND_RADIUS, out[0] as Point, out[1] as Point);
  if (to?.outline) out[pts.length - 1] = reachRoundedCorner(diamondPoints(to.outline), DIAMOND_RADIUS, out[pts.length - 1] as Point, out[pts.length - 2] as Point);
  return out;
}

/** Whether a line is drawn in the accent colour: a thick one, or one that leaves a decision. */
const accented = (edge: LayoutEdge, paint: Paint): boolean => edge.style === 'thick' || paint.roles.get(edge.from) === 'decision';

/** Length of the marks of relation lines (triangle, diamonds, open arrow, crow's feet): the line stops this far short of its end. */
const MARK = 12;

/** The marks of relation lines. */
const MARKS: ReadonlySet<EdgeEnd> = new Set<EdgeEnd>(['triangle-open', 'diamond-filled', 'diamond-open', 'arrow-open', 'one', 'zero-one', 'many', 'one-many', 'zero-many', 'circle-plus', 'lollipop']);

/** Id of the marker that ends a line in `end`, or undefined when nothing sits there. */
function endMarkerId(end: EdgeEnd, accent: boolean, atStart: boolean): string | undefined {
  switch (end) {
    case 'none':
      return undefined;
    case 'arrow':
      return `${accent ? 'ursula-arrow-accent' : 'ursula-arrow'}${atStart ? '-start' : ''}`;
    case 'circle':
      return accent ? 'ursula-dot-accent' : 'ursula-dot';
    case 'cross':
      return accent ? 'ursula-cross-accent' : 'ursula-cross';
    default:
      return `ursula-end-${end}${accent ? '-accent' : ''}`;
  }
}

/** How far a line stops short of its end so that the mark there is not drawn over a line. */
function endTrim(end: EdgeEnd): number {
  return end === 'arrow' ? ARROW_TRIM : end === 'none' ? 0 : MARKS.has(end) ? MARK : DOT / 2;
}

/**
 * The drawing of a relation mark. The marker's x axis runs from the end of the line (0) to the box (12), so that one
 * marker serves both ends of a line. Every mark carries a stem, which keeps the line whole up to the box.
 */
function markBody(end: EdgeEnd, accent: boolean): string {
  const cls = (base: string): string => (accent ? `ursula-end-${base} ursula-end-${base}--accent` : `ursula-end-${base}`);
  const stroke = (d: string): string => `<path class="${cls('stroke')}" d="${d}"/>`;
  const foot = 'M12 -5L4 0L12 5';
  const ring = (cx: number): string => `<circle class="${cls('hollow')}" cx="${cx}" cy="0" r="2.5"/>`;
  switch (end) {
    case 'triangle-open':
      return `<polygon class="${cls('hollow')}" points="0,-6 12,0 0,6"/>`;
    case 'diamond-filled':
      return `<polygon class="${cls('solid')}" points="0,0 6,-5 12,0 6,5"/>`;
    case 'diamond-open':
      return `<polygon class="${cls('hollow')}" points="0,0 6,-5 12,0 6,5"/>`;
    case 'arrow-open':
      return stroke('M0 0H12M4 -5L12 0L4 5');
    case 'one':
      return stroke('M0 0H12M9 -5V5M4 -5V5');
    case 'zero-one':
      return stroke('M0 0H12M9 -5V5') + ring(2.5);
    case 'many':
      return stroke(`M0 0H12${foot}`);
    case 'one-many':
      return stroke(`M0 0H12${foot}M1 -5V5`);
    case 'zero-many':
      return stroke(`M0 0H12${foot}`) + ring(1.5);
    case 'circle-plus':
      return `<circle class="${cls('hollow')}" cx="6" cy="0" r="6"/>` + stroke('M6 -6V6M0 0H12');
    case 'lollipop':
      return `<circle class="${cls('hollow')}" cx="6" cy="0" r="6"/>`;
    default:
      return '';
  }
}

/** The points with the first one moved along the first piece by `amount`, keeping at least 1 of it. */
function trimStart(pts: Point[], amount: number): Point[] {
  const [a, b] = pts;
  if (amount <= 0 || !a || !b) return pts;
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (len === 0) return pts;
  const cut = Math.min(amount, Math.max(0, len - 1));
  return [{ x: a.x + ((b.x - a.x) / len) * cut, y: a.y + ((b.y - a.y) / len) * cut }, ...pts.slice(1)];
}

function edgeSvg(edge: LayoutEdge, nodes: Map<string, LayoutNode>, paint: Paint, hops: readonly Point[] = []): string {
  if (edge.invisible) return '';
  const branch = paint.roles.get(edge.from) === 'decision' && edge.style !== 'thick';
  const accent = accented(edge, paint);
  const end = edge.end ?? 'arrow';
  const start = edge.startEnd ?? 'none';
  const endId = endMarkerId(end, accent, false);
  const startId = endMarkerId(start, accent, true);
  const points = trimStart(trimmedPoints(edge, nodes), endTrim(start));
  const junction = edge.trunk?.dot;
  return (
    `<path class="ursula-edge ursula-edge--${edge.style}${branch ? ' ursula-edge--branch' : ''}" data-style="${edge.style}" data-from="${escapeXml(edge.from)}" data-to="${escapeXml(edge.to)}" ` +
    `d="${pathData(points, edge.trunk?.square ? 0 : THEME.bend, endTrim(end), hops)}"${startId === undefined ? '' : ` marker-start="url(#${startId})"`}${endId === undefined ? '' : ` marker-end="url(#${endId})"`}/>` +
    (junction === undefined ? '' : `<circle class="ursula-end-dot" cx="${num(junction.x)}" cy="${num(junction.y)}" r="${DOT / 2}"/>`)
  );
}

/** Radius of the ring where a line leaves its box. */
const PORT_RING_R = 4;

/**
 * Rings where a line leaves its box: on the bare end of every visible line that has a mark at one end only (a line
 * drawn against its meaning carries its mark at the start, and its ring at the last point); lines that share an end share one ring,
 * and the lines of a trunk count the mark its lead line draws.
 */
function portRings(layout: Layout, nodes: Map<string, LayoutNode>): string {
  const seen: Point[] = [];
  const marksOf = (edge: LayoutEdge): boolean[] => [(edge.startEnd ?? 'none') !== 'none', (edge.end ?? 'arrow') !== 'none'];
  // The lines of one trunk share the mark of its lead line, which alone draws it.
  const leads = new Map(layout.edges.filter((e) => e.trunk?.lead === true).map((e) => [e.trunk?.id, marksOf(e)] as const));
  for (const edge of layout.edges) {
    const marked = (edge.trunk === undefined ? undefined : leads.get(edge.trunk.id)) ?? marksOf(edge);
    if (edge.invisible || marked[0] === marked[1]) continue;
    const points = trimmedPoints(edge, nodes);
    const at = marked[1] ? points[0] : points[points.length - 1];
    if (at === undefined || seen.some((p) => Math.abs(p.x - at.x) <= 0.5 && Math.abs(p.y - at.y) <= 0.5)) continue;
    seen.push(at);
  }
  return seen.map((p) => `<circle class="ursula-port" cx="${num(p.x)}" cy="${num(p.y)}" r="${PORT_RING_R}"/>`).join('');
}

/** The markers (beyond the two arrowheads every drawing has) and style rules that the visible edges of a layout need. */
function extraEnds(layout: Layout, paint: Paint): { markers: string[]; rules: string[] } {
  const wanted = new Map<string, string>();
  const reversed = (m: string): string => m.replace('orient="auto"', 'orient="auto-start-reverse"');
  let rules = false;
  const want = (end: EdgeEnd, accent: boolean, atStart: boolean): void => {
    const id = endMarkerId(end, accent, atStart);
    if (id === undefined || wanted.has(id)) return;
    const mod = accent ? '--accent' : '';
    if (end === 'arrow') {
      if (atStart) wanted.set(id, reversed(flowMarker(id, accent ? 'ursula-arrow ursula-arrow--accent' : 'ursula-arrow')));
      return;
    }
    if (MARKS.has(end)) {
      wanted.set(id, `<marker id="${id}" viewBox="0 -7 14 14" refX="0" refY="0" markerWidth="14" markerHeight="14" markerUnits="userSpaceOnUse" orient="auto-start-reverse" overflow="visible">${markBody(end, accent)}</marker>`);
      return;
    }
    rules = true;
    const body =
      end === 'circle'
        ? `<circle class="ursula-end-dot${accent ? ` ursula-end-dot${mod}` : ''}" cx="${DOT / 2}" cy="${DOT / 2}" r="${DOT / 2}"/>`
        : `<path class="ursula-end-cross${accent ? ` ursula-end-cross${mod}` : ''}" d="${crossPath()}"/>`;
    wanted.set(id, `<marker id="${id}" viewBox="0 0 ${DOT} ${DOT}" refX="${DOT}" refY="${DOT / 2}" markerWidth="${DOT}" markerHeight="${DOT}" markerUnits="userSpaceOnUse" orient="auto-start-reverse" overflow="visible">${body}</marker>`);
  };
  for (const edge of layout.edges) {
    if (edge.invisible) continue;
    if (edge.trunk?.dot !== undefined) rules = true;
    const accent = accented(edge, paint);
    want(edge.end ?? 'arrow', accent, false);
    want(edge.startEnd ?? 'none', accent, true);
  }
  const w = THEME.lineWidth;
  return {
    markers: [...wanted.values()],
    rules: rules
      ? [
          '.ursula-end-dot{fill:$line}',
          '.ursula-end-dot--accent{fill:$accent}',
          `.ursula-end-cross{fill:none;stroke:$line;stroke-width:${w};stroke-linecap:round}`,
          '.ursula-end-cross--accent{stroke:$accent}',
        ]
      : [],
  };
}

/** Two strokes, each `CROSS` long, crossing at the middle of the mark. */
function crossPath(): string {
  const mid = DOT / 2;
  const reach = CROSS / 2 / Math.SQRT2;
  const [lo, hi] = [num(mid - reach), num(mid + reach)];
  return `M${lo} ${lo}L${hi} ${hi}M${hi} ${lo}L${lo} ${hi}`;
}

/** The text of an edge label; what follows an em space is a technology, a span of its own so that it is painted fainter. */
function labelText(line: string): string {
  const at = line.indexOf('\u2003');
  if (at < 0) return escapeXml(line);
  return `${escapeXml(line.slice(0, at))}<tspan class="ursula-edge-label-tech" role="note">${escapeXml(line.slice(at))}</tspan>`;
}

function labelSvg(edge: LayoutEdge, paint: Paint, on?: 'tint-outer' | 'tint-mid' | 'tint-inner'): string {
  const l = edge.label;
  if (!l || edge.invisible) return '';
  const lines = l.lines ?? [l.text];
  const ruler = pixelRuler();
  const w = Math.max(0, ...lines.map((line) => ruler.textWidth(line, 'edge'))) + 2 * CHIP_PAD;
  const h = CHIP_HEIGHT + (lines.length - 1) * BODY_LINE;
  const cx = l.x + l.w / 2;
  const cy = l.y + l.h / 2;
  const chip = `<rect class="ursula-edge-label-bg" x="${num(cx - w / 2)}" y="${num(cy - h / 2)}" width="${num(w)}" height="${num(h)}" rx="${num(CHIP_HEIGHT / 2)}"/>`;
  const emphasis = edge.style === 'thick' ? ' ursula-edge-label--thick' : paint.roles.get(edge.from) === 'decision' ? ' ursula-edge-label--branch' : '';
  return (
    `<g class="ursula-edge-label-group${on === undefined ? '' : ` ursula-edge-label--on-${on}`}" data-from="${escapeXml(edge.from)}" data-to="${escapeXml(edge.to)}">` +
    chip +
    lines
      .map(
        (line, i, all) =>
          `<text class="ursula-edge-label${emphasis}" x="${num(cx)}" y="${num(cy + (i - (all.length - 1) / 2) * BODY_LINE)}" text-anchor="middle" dominant-baseline="central">${labelText(line)}</text>`,
      )
      .join('') +
    '</g>'
  );
}

function endLabelSvg(edge: LayoutEdge): string {
  const one = (label: EndLabel | undefined, which: 'start' | 'end'): string =>
    label === undefined
      ? ''
      : `<text class="ursula-end-label" data-from="${escapeXml(edge.from)}" data-to="${escapeXml(edge.to)}" data-end="${which}" x="${num(label.x + label.w / 2)}" y="${num(label.y + label.h / 2)}" text-anchor="middle" dominant-baseline="central">${escapeXml(label.text)}</text>`;
  return edge.invisible ? '' : one(edge.startLabel, 'start') + one(edge.endLabel, 'end');
}

/** Whether a layout uses the record shapes, the marks of relation lines or the small texts at the ends of lines. */
function usesRecords(layout: Layout): boolean {
  return (
    layout.nodes.some(isRecordNode) ||
    layout.edges.some((e) => (e.end !== undefined && MARKS.has(e.end)) || (e.startEnd !== undefined && MARKS.has(e.startEnd)) || e.startLabel !== undefined || e.endLabel !== undefined)
  );
}

const points = (pts: Point[]): string => pts.map((q) => `${num(q.x)},${num(q.y)}`).join(' ');

function boxSvg(node: LayoutNode, rx: number): string {
  return `<rect class="ursula-node-box" x="${num(node.x)}" y="${num(node.y)}" width="${num(node.w)}" height="${num(node.h)}" rx="${num(rx)}"/>`;
}

/** The outline of a node inside its box. */
function shapeSvg(node: LayoutNode): string {
  const { x, y, w, h } = node;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const radius = THEME.boxRadius;
  switch (node.shape) {
    case 'round':
      return boxSvg(node, Math.min(radius + 8, h / 2));
    case 'stadium':
      return boxSvg(node, h / 2);
    case 'circle':
    case 'ellipse':
      return `<ellipse class="ursula-node-box" cx="${num(cx)}" cy="${num(cy)}" rx="${num(w / 2)}" ry="${num(h / 2)}"/>`;
    case 'start-dot':
      return `<circle class="ursula-start-dot" cx="${num(cx)}" cy="${num(cy)}" r="${num(Math.min(w, h) / 2)}"/>`;
    case 'end-dot': {
      const outer = Math.min(w, h) / 2;
      return (
        `<circle class="ursula-end-ring" cx="${num(cx)}" cy="${num(cy)}" r="${num(outer - THEME.lineWidth / 2)}"/>` +
        `<circle class="ursula-end-core" cx="${num(cx)}" cy="${num(cy)}" r="${num(END_CORE / 2)}"/>`
      );
    }
    case 'bar':
      return `<rect class="ursula-bar" x="${num(x)}" y="${num(y)}" width="${num(w)}" height="${num(h)}" rx="${num(Math.min(2, w / 2, h / 2))}"/>`;
    case 'note': {
      const fold = Math.min(NOTE_FOLD, w / 2, h / 2);
      return (
        `<path class="ursula-note" d="M${num(x)} ${num(y)}H${num(x + w - fold)}L${num(x + w)} ${num(y + fold)}V${num(y + h)}H${num(x)}Z"/>` +
        `<path class="ursula-note-fold" d="M${num(x + w - fold)} ${num(y)}V${num(y + fold)}H${num(x + w)}"/>`
      );
    }
    case 'actor': {
      const top = y;
      return (
        `<circle class="ursula-actor" cx="${num(cx)}" cy="${num(top + 8)}" r="8"/>` +
        `<path class="ursula-actor" d="M${num(cx)} ${num(top + 16)}V${num(top + 32)}M${num(x)} ${num(top + 24)}H${num(x + w)}M${num(cx)} ${num(top + 32)}L${num(cx - 10)} ${num(y + h)}M${num(cx)} ${num(top + 32)}L${num(cx + 10)} ${num(y + h)}"/>`
      );
    }
    case 'hexagon':
      return `<polygon class="ursula-node-box" points="${points(hexagonPoints(node))}"/>`;
    case 'parallelogram':
      return `<polygon class="ursula-node-box" points="${points(parallelogramPoints(node))}"/>`;
    case 'lean-l':
      return `<polygon class="ursula-node-box" points="${points(leanLeftPoints(node))}"/>`;
    case 'trap-b':
      return `<polygon class="ursula-node-box" points="${points(trapBottomPoints(node))}"/>`;
    case 'trap-t':
      return `<polygon class="ursula-node-box" points="${points(trapTopPoints(node))}"/>`;
    case 'asym':
      return `<polygon class="ursula-node-box" points="${points(asymPoints(node))}"/>`;
    case 'dbl-circle':
      return (
        `<ellipse class="ursula-node-box" cx="${num(cx)}" cy="${num(cy)}" rx="${num(w / 2)}" ry="${num(h / 2)}"/>` +
        `<ellipse class="ursula-node-box ursula-node-box--lined" cx="${num(cx)}" cy="${num(cy)}" rx="${num(Math.max(0, w / 2 - RING_GAP))}" ry="${num(Math.max(0, h / 2 - RING_GAP))}"/>`
      );
    case 'subroutine':
      return (
        boxSvg(node, BAR) +
        [x + BAR, x + w - BAR].map((bx) => `<line class="ursula-node-box ursula-node-box--lined" x1="${num(bx)}" y1="${num(y)}" x2="${num(bx)}" y2="${num(y + h)}"/>`).join('')
      );
    case 'cylinder': {
      const arc = `A${num(w / 2)} ${CAP} 0 0`;
      const top = y + CAP;
      const bottom = y + h - CAP;
      return (
        `<path class="ursula-node-box ursula-node-box--lined" d="M${num(x)} ${num(top)} ${arc} 1 ${num(x + w)} ${num(top)} ${arc} 1 ${num(x)} ${num(top)} ` +
        `M${num(x)} ${num(top)} V${num(bottom)} ${arc} 0 ${num(x + w)} ${num(bottom)} V${num(top)}"/>`
      );
    }
    case 'diamond':
      return node.outline
        ? `<path class="ursula-node-box" d="${roundedPolygonPath(diamondPoints(node.outline), DIAMOND_RADIUS)}"/>`
        : boxSvg(node, radius);
    case 'rect':
      return boxSvg(node, radius);
  }
}

/** A band along the top of a box, cut to the corners of the box's outline so that the outline's stroke stays whole. */
/** Height of the head band of a C4 element, and the room between the band and the name under it. */
const HEAD_BAND = 28;
const HEAD_BAND_GAP = 10;

function headBandSvg(node: LayoutNode, radius: number, height: number): string {
  const inset = THEME.boxBorder / 2;
  const id = `ursula-band-${node.id.replace(/[^A-Za-z0-9_-]/g, '_')}-${num(node.x)}-${num(node.y)}-${num(node.w)}-${num(node.h)}`.replace(/\./g, '_');
  return (
    `<clipPath id="${id}"><rect x="${num(node.x + inset)}" y="${num(node.y + inset)}" width="${num(node.w - 2 * inset)}" height="${num(node.h - 2 * inset)}" rx="${num(Math.max(0, radius - inset))}"/></clipPath>` +
    `<rect class="ursula-head-band" x="${num(node.x)}" y="${num(node.y)}" width="${num(node.w)}" height="${num(height)}" clip-path="url(#${id})"/>`
  );
}

/** The rules and texts of a box divided into compartments; the box is as tall as they are. */
function compartmentsSvg(node: LayoutNode): string {
  const cells = node.compartments ?? [];
  const ruler = pixelRuler();
  const heights = compartmentHeights(cells, ruler);
  // A cylinder draws its own outline, and its head starts under the top cap; a rounded box rounds its corners more.
  const cylinder = node.shape === 'cylinder';
  const caps = cylinder ? 2 * CAP : 0;
  const spare = Math.max(0, node.h - caps - heights.reduce((a, b) => a + b, 0));
  heights[heights.length - 1] = (heights[heights.length - 1] ?? 0) + spare;
  const outline = cylinder || node.shape === 'round' ? shapeSvg(node) : boxSvg(node, THEME.boxRadius);
  const parts = [outline];
  // The band follows the corners of the outline, rounded further on a rounded box.
  const bandRadius = node.shape === 'round' ? Math.min(THEME.boxRadius + 8, node.h / 2) : THEME.boxRadius;
  const banded = !cylinder;
  const hasFace = cells.some((c) => c.face === true);
  if (banded && !hasFace && cells.length > 1) parts.push(headBandSvg(node, bandRadius, heights[0] ?? 0));
  let top = node.y + caps;
  cells.forEach((cell, i) => {
    if (i > 0) parts.push(`<path class="ursula-rule" d="M${num(node.x)} ${num(top)}H${num(node.x + node.w)}"/>`);
    const centred = (cell.align ?? (i === 0 ? 'center' : 'left')) === 'center' && cell.columns === undefined;
    // A face is one group in the middle of the box: its first line stands in a pill and the next is a little further down.
    const rows = faceLineHeights(cell.lines.length);
    const content = rows.reduce((a, b) => a + b, 0) + FACE_PILL_GAP;
    const rowTop = (k: number): number => rows.slice(0, k).reduce((a, b) => a + b, 0) + (k > 0 ? FACE_PILL_GAP : 0);
    const faceTop = top + ((heights[i] ?? 0) - content) / 2;
    // On a head band the kind stands in the middle of a band of one height in every box, and the lines under it start
    // right below the band instead of sharing the middle of the box: every box of a drawing shows the same band.
    const onBand = banded && cell.face === true;
    const faceY = (k: number): number =>
      onBand ? (k === 0 ? top + HEAD_BAND / 2 : top + HEAD_BAND + HEAD_BAND_GAP + rowTop(k) - (rows[0] ?? 0) - FACE_PILL_GAP + (rows[k] ?? 0) / 2) : faceTop + rowTop(k) + (rows[k] ?? 0) / 2;
    const first = cell.face === true ? faceTop + (rows[0] ?? 0) / 2 : top + (i === 0 ? 10 : 8) + COMPARTMENT_LINE / 2;
    const starts = cell.columns === undefined ? [] : columnStarts(cell, ruler);
    cell.lines.forEach((line, k) => {
      const emphasis = lineEmphasis(cell, k, i);
      const y = num(cell.face === true ? faceY(k) : first + k * COMPARTMENT_LINE);
      if (cell.face === true && k === 0 && banded) parts.push(headBandSvg(node, bandRadius, top + HEAD_BAND - node.y));
      const row = cell.columns?.[k];
      if (row === undefined) {
        if (line === '') return;
        const x = centred ? node.x + node.w / 2 : node.x + COMPARTMENT_INSET;
        parts.push(`<text class="ursula-cell-${emphasis}" x="${num(x)}" y="${y}"${centred ? ' text-anchor="middle"' : ''} dominant-baseline="central">${escapeXml(line)}</text>`);
        return;
      }
      row.forEach((text, c) => {
        if (text === '') return;
        parts.push(`<text class="ursula-cell-${cell.columnEmphasis?.[c] ?? emphasis}" x="${num(node.x + COMPARTMENT_INSET + (starts[c] ?? 0))}" y="${y}" dominant-baseline="central">${escapeXml(text)}</text>`);
      });
    });
    top += heights[i] ?? 0;
  });
  return parts.join('');
}

function nodeSvg(node: LayoutNode, hook: NodeHook | undefined, paint: Paint): string {
  const extra = hook?.(node) ?? {};
  const attrs = Object.entries(extra.attrs ?? {})
    .map(([k, v]) => ` ${k.replace(/[^A-Za-z0-9:_-]/g, '')}="${escapeXml(v)}"`)
    .join('');
  const role = paint.roles.get(node.id);
  const className = ['ursula-node', role === undefined && paint.tinted.has(node.id) ? 'ursula-node--on-lane' : '', extra.className ?? ''].filter((c) => c !== '').join(' ');
  const block = TITLE_LINE + node.lines.length * BODY_LINE;
  let y = node.y + (node.h - block) / 2 + (node.shape === 'cylinder' ? CAP / 2 : 0);
  const cx = node.x + node.w / 2;
  const texts = [
    `<text class="ursula-node-title" x="${num(cx)}" y="${num(y + TITLE_LINE / 2)}" text-anchor="middle" dominant-baseline="central">${escapeXml(node.title)}</text>`,
  ];
  y += TITLE_LINE;
  for (const line of node.lines) {
    texts.push(
      `<text class="ursula-node-line" x="${num(cx)}" y="${num(y + BODY_LINE / 2)}" text-anchor="middle" dominant-baseline="central">${escapeXml(line)}</text>`,
    );
    y += BODY_LINE;
  }
  const bare = node.shape === 'start-dot' || node.shape === 'end-dot' || node.shape === 'bar';
  const body = hasCompartments(node)
    ? compartmentsSvg(node)
    : shapeSvg(node) +
      (node.shape === 'actor'
        ? `<text class="ursula-actor-name" x="${num(cx)}" y="${num(node.y + ACTOR_H + ACTOR_NAME_GAP - 4)}" text-anchor="middle" dominant-baseline="central">${escapeXml(node.title)}</text>`
        : bare
          ? ''
          : texts.join(''));
  return (
    `<g class="${escapeXml(className)}" data-node="${escapeXml(node.id)}"${attrs}${role === undefined ? '' : ` data-role="${role}"`}>` +
    body +
    (extra.extra ?? '') +
    '</g>'
  );
}

function markerId(style: string): string {
  return style === 'thick' ? 'ursula-arrow-accent' : 'ursula-arrow';
}

function legendSvg(legend: Legend, margin: number): string {
  const parts = [
    `<line class="ursula-legend-rule" x1="${num(margin)}" y1="${num(legend.y)}" x2="${num(legend.w - margin)}" y2="${num(legend.y)}"/>`,
  ];
  for (const item of legend.items) {
    const sample = pathData([{ x: item.x, y: item.y }, { x: item.x + item.sampleW, y: item.y }], 0, ARROW_TRIM);
    parts.push(
      `<path class="ursula-edge ursula-edge--${item.style}" d="${sample}" marker-end="url(#${markerId(item.style)})"/>` +
        `<text class="ursula-legend-text" x="${num(item.captionX)}" y="${num(item.y)}" dominant-baseline="central">${escapeXml(item.caption)}</text>`,
    );
  }
  return `<g class="ursula-legend">${parts.join('')}</g>`;
}

export function renderSvg(input: Layout, opts: SvgOptions = {}): string {
  const layout = opts.legend === undefined ? input : withLegend(input, pixelRuler(), opts.legend);
  const heading = opts.drawTitle === undefined || opts.drawTitle === '' ? undefined : opts.drawTitle;
  const rowH = heading === undefined ? 0 : TITLE_ROW;
  const title = opts.title ?? `Flowchart: ${layout.nodes.length} nodes, ${layout.edges.length} edges`;
  const byId = new Map(layout.nodes.map((n) => [n.id, n] as const));
  const depthOf = new Map((layout.clusters ?? []).map((c) => [c.id, c.depth] as const));
  const dashed = new Set((layout.clusters ?? []).filter((c) => c.style === 'dashed').map((c) => c.id));
  const labelled = layout.lanes.filter((l) => l.label !== '');
  // Named lanes take the light fill and the face of the page by turns, the first one filled.
  const tinted = (lane: LayoutLane): boolean => labelled.indexOf(lane) % 2 === 0;
  const paint: Paint = {
    roles: rolesOf(layout),
    tinted: new Set([
      ...labelled.filter(tinted).flatMap((lane) => layout.nodes.filter((n) => n.lane === lane.id).map((n) => n.id)),
      ...layout.nodes.filter((n) => n.cluster !== undefined && !dashed.has(n.cluster) && (depthOf.get(n.cluster) ?? 0) % 2 === 1).map((n) => n.id),
    ]),
  };
  // A boundary drawn as a dashed outline stands out to the left of its boxes: the title starts at its border.
  const margin = Math.min(...layout.lanes.map((l) => l.x), ...layout.nodes.map((n) => n.x), ...(layout.clusters ?? []).filter((c) => c.style === 'dashed').map((c) => c.x), layout.width);
  const w = num(heading === undefined ? layout.width : widthWithTitle(layout.width, margin, heading));
  const h = num(layout.height + rowH);
  const ends = extraEnds(layout, paint);
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" class="ursula" data-theme="band" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img">`,
    `<title>${escapeXml(title)}</title>`,
    `<style>${styleSheet([...flowRules(FONT), ...clusterRules(layout.clusters ?? []), ...ends.rules, ...(usesRecords(layout) ? recordRules() : []), ...faceRules(layout), ...(heading === undefined ? [] : ['.ursula-title{fill:$fg;font-size:15px;font-weight:600}'])])}</style>`,
    `<defs>${flowMarker('ursula-arrow', 'ursula-arrow')}${flowMarker('ursula-arrow-accent', 'ursula-arrow ursula-arrow--accent')}${ends.markers.join('')}</defs>`,
    ...(heading === undefined ? [] : [`<text class="ursula-title ursula-diagram-title" x="${num(margin)}" y="${num(TITLE_CENTRE)}" dominant-baseline="central">${escapeXml(heading)}</text>`, `<g transform="translate(0 ${rowH})">`]),
    ...layout.lanes.map((lane) => laneSvg(lane, tinted(lane), layout.laneAxis === 'along' && (layout.direction === 'LR' || layout.direction === 'RL'))),
    ...(layout.clusters ?? []).map(clusterSvg),
    ...((hops) => layout.edges.map((e, i) => edgeSvg(e, byId, paint, hops[i])))(hopsOf(layout.edges)),
    ...layout.nodes.map((n) => nodeSvg(n, opts.node, paint)),
    portRings(layout, byId),
    ...(layout.clusters ?? []).map(knockoutSvg),
    ...layout.edges.map((e) => labelSvg(e, paint, tintUnder(e, layout.clusters ?? []))),
    ...layout.edges.map(endLabelSvg),
    ...(layout.legend ? [legendSvg(layout.legend, margin)] : []),
    ...(heading === undefined ? [] : ['</g>']),
    '</svg>',
  ].join('');
}
