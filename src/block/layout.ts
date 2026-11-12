import type { Ruler } from '../metrics.ts';
import type { Theme } from '../render/theme.ts';
import { trimToOutline } from '../render/shapes.ts';
import type { NodeShape, Point, Scene, SceneItem, SceneLine } from '../types.ts';
import { arrowBody, shapeItems } from './draw.ts';
import { measure, place } from './grid.ts';
import type { BlockDiagram, BlockLayout, PlacedBlock, PlacedLink } from './model.ts';
import { route, segmentsOf } from './route.ts';
import type { Rect, Segment } from './route.ts';
import { unitsOf } from './units.ts';
import type { Units } from './units.ts';

const TITLE_SIZE = 15;
const PORT_RADIUS = 3.25;

const rectOf = (b: PlacedBlock): Rect => ({ x: b.x, y: b.y, w: b.w, h: b.h });

/** Coordinates of the middles of the gaps between the blocks along one axis. */
function channels(rects: readonly Rect[], axis: 'x' | 'y', least: number, step: number): number[] {
  const edges = [...new Set(rects.flatMap((r) => (axis === 'x' ? [r.x, r.x + r.w] : [r.y, r.y + r.h])))].sort((a, b) => a - b);
  const out: number[] = [];
  for (let i = 0; i + 1 < edges.length; i++) {
    const a = edges[i] as number;
    const b = edges[i + 1] as number;
    if (b - a >= least) out.push(Math.floor((a + b) / 2 / step) * step);
  }
  return out;
}

/** Moves an end of a line, which leaves or enters a block with a shape that is not a rectangle, onto its outline. */
function onOutline(block: PlacedBlock, end: Point, next: Point): Point {
  const shape: NodeShape = block.shape === 'group' || block.shape === 'arrow' ? 'rect' : block.shape;
  return trimToOutline({ x: block.x, y: block.y, w: block.w, h: block.h, shape, ...(shape === 'diamond' ? { outline: rectOf(block) } : {}) }, end, next);
}

/** Moves the end of a line back from the face it points at, so the arrowhead stands off the face. */
function standOff(pts: Point[], atStart: boolean, by: number): void {
  const i = atStart ? 0 : pts.length - 1;
  const j = atStart ? 1 : pts.length - 2;
  const p = pts[i] as Point;
  const q = pts[j] as Point;
  const len = Math.hypot(q.x - p.x, q.y - p.y);
  if (len <= by) return;
  pts[i] = { x: p.x + ((q.x - p.x) / len) * by, y: p.y + ((q.y - p.y) / len) * by };
}

/** The piece of a line a label sits on, picked so the label stays clear of the blocks. */
function chipPlace(pts: readonly Point[], text: string, ruler: Ruler, u: Units, leaves: readonly Rect[]): PlacedLink['chip'] {
  const w = u.terminal ? ruler.textWidth(text, 'line') : u.snap(ruler.textWidth(text, 'line') + u.chipPad);
  const pieces = pts.slice(1).map((b, i) => ({ a: pts[i] as Point, b }));
  const ranked = [...pieces].sort((p, q) => Math.abs(q.b.x - q.a.x) + Math.abs(q.b.y - q.a.y) - (Math.abs(p.b.x - p.a.x) + Math.abs(p.b.y - p.a.y)));
  const spot = (piece: { a: Point; b: Point }): { x: number; y: number; w: number; h: number } => {
    const flat = piece.a.y === piece.b.y;
    const mx = (piece.a.x + piece.b.x) / 2;
    const my = (piece.a.y + piece.b.y) / 2;
    const x = Math.round(mx - w / 2);
    if (u.terminal) return flat ? { x, y: piece.a.y, w, h: 1 } : { x: Math.round(mx) + 2, y: Math.round(my), w, h: 1 };
    return flat ? { x: Math.round(x / 2) * 2, y: my - u.chipHeight / 2, w, h: u.chipHeight } : { x: Math.round(x / 2) * 2, y: Math.round((my - 7 - u.chipHeight / 2) / 2) * 2, w, h: u.chipHeight };
  };
  const free = (r: Rect): boolean => leaves.every((l) => r.x >= l.x + l.w || r.x + r.w <= l.x || r.y >= l.y + l.h || r.y + r.h <= l.y);
  const chosen = ranked.map(spot).find(free) ?? spot(ranked[0] as { a: Point; b: Point });
  return { ...chosen, text };
}

/**
 * Lays a block diagram out: the blocks on the grid the source wrote, then the links around them. Pixels draw a scene;
 * a terminal ruler leaves the scene empty and the text drawing reads `blocks` and `links`.
 */
export function layoutBlock(model: BlockDiagram, ruler: Ruler, theme?: Theme, compact = false): BlockLayout {
  const base = unitsOf(ruler, compact);
  const widest = Math.max(0, ...model.links.map((l) => (l.label === undefined ? 0 : base.textWidth(l.label))));
  const u: Units = base.terminal ? { ...base, colGap: Math.max(base.colGap, widest + 4) } : base;
  const plan = measure(model.children, model.columns, u);
  const titleW = model.title === undefined ? 0 : u.terminal ? u.textWidth(model.title) : (u.textWidth(model.title) * TITLE_SIZE) / 13;
  const top = u.margin + (model.title === undefined ? 0 : u.titleHeight);
  const width = u.snap(Math.max(plan.w, titleW) + 2 * u.margin);
  const height = plan.h + top + u.margin;
  const blocks: PlacedBlock[] = [];
  place(plan, { x: u.margin, y: top, w: plan.w, h: plan.h }, u, blocks, undefined, 0);

  const visible = model.links.filter((l) => !l.invisible);
  const leaving = new Set(visible.map((l) => l.from));
  const entered = new Set(visible.map((l) => l.to));
  const placed = blocks.map((b) => (b.kind === 'node' && leaving.has(b.id) && !entered.has(b.id) ? { ...b, start: true } : b));
  const byId = new Map(placed.map((b) => [b.id, b] as const));
  const leaves = placed.filter((b) => b.kind === 'node');
  const leafRects = leaves.map(rectOf);

  const bounds: Rect = { x: 0, y: 0, w: width, h: height };
  const used: Segment[] = [];
  const links: PlacedLink[] = [];
  for (const link of model.links) {
    const from = byId.get(link.from);
    const to = byId.get(link.to);
    if (from === undefined || to === undefined) continue;
    const base = { from: link.from, to: link.to, style: link.style, arrow: link.arrow, arrowStart: link.arrowStart, invisible: link.invisible, ...(link.label === undefined ? {} : { label: link.label }) };
    if (link.invisible) {
      links.push({ ...base, points: [] });
      continue;
    }
    const others = leaves.filter((b) => b.id !== from.id && b.id !== to.id).map(rectOf);
    const pts = route(rectOf(from), rectOf(to), link, {
      obstacles: others,
      used,
      channelsX: channels(leafRects, 'x', 2 * u.stub, u.grid),
      channelsY: channels(leafRects, 'y', 2 * u.stub, u.grid),
      bounds,
      stub: u.stub,
      clear: u.clear,
      lane: u.lane,
      around: u.around,
      step: u.terminal ? 1 : 2,
    });
    used.push(...segmentsOf(pts, link));
    const drawn = pts.map((p) => ({ ...p }));
    if (!u.terminal && pts.length >= 2) {
      drawn[0] = onOutline(from, drawn[0] as Point, drawn[1] as Point);
      drawn[drawn.length - 1] = onOutline(to, drawn[drawn.length - 1] as Point, drawn[drawn.length - 2] as Point);
      if (link.arrow) standOff(drawn, false, u.headGap);
      if (link.arrowStart) standOff(drawn, true, u.headGap);
    }
    const chip = link.label === undefined ? undefined : chipPlace(drawn, link.label, ruler, u, others.concat(rectOf(from), rectOf(to)));
    links.push({ ...base, points: drawn, ...(chip === undefined ? {} : { chip }) });
  }

  const label = model.accTitle ?? (model.title === undefined ? `Block diagram: ${leaves.length} blocks` : `Block diagram: ${model.title}`);
  const scene: Scene = { width, height, title: label, items: u.terminal ? [] : sceneItems(placed, links, model, u), ...(theme === undefined ? {} : { theme }) };
  return { scene, width, height, blocks: placed, links };
}

function sceneItems(blocks: readonly PlacedBlock[], links: readonly PlacedLink[], model: BlockDiagram, u: Units): SceneItem[] {
  const items: SceneItem[] = [];
  if (model.title !== undefined) items.push({ kind: 'text', x: u.margin, y: u.margin + 9, text: model.title, anchor: 'start', role: ['title'] });
  for (const b of blocks.filter((g) => g.kind === 'group')) {
    items.push({ kind: 'box', style: 'frame', x: b.x, y: b.y, w: b.w, h: b.h, role: b.depth % 2 === 1 ? ['zone'] : ['zone', 'zone--plain'], data: { block: b.id } });
  }
  for (const link of links) {
    if (link.invisible || link.points.length < 2) continue;
    const role = ['edge', ...(link.arrow ? ['edge--arrow'] : []), ...(link.arrowStart ? ['edge--arrow-start'] : []), ...(link.style === 'dotted' ? ['edge--pending'] : []), ...(link.style === 'thick' ? ['edge--accent'] : [])];
    const line: SceneLine = { kind: 'line', points: link.points, role, data: { from: link.from, to: link.to } };
    items.push(line);
  }
  for (const b of blocks.filter((g) => g.kind === 'node')) {
    const inZone = b.parent !== undefined;
    const role = ['box', ...(b.shape === 'round' ? ['box--round'] : []), ...(b.shape === 'diamond' ? ['box--decision'] : b.start ? ['box--start'] : []), ...(inZone ? ['box--in-zone'] : [])];
    for (const item of shapeItems(b, role)) items.push({ ...item, data: { block: b.id, shape: b.shape } });
    const nameRole = ['name', ...(b.shape === 'diamond' ? ['on-decision'] : b.start ? ['on-start'] : [])];
    const centre = b.shape === 'arrow' ? arrowBody(b, b.heads ?? ['right']) : { x: b.x + b.w / 2, y: b.y + b.h / 2 + (b.shape === 'cylinder' ? 4 : 0) };
    b.lines.forEach((text, i) => {
      if (text === '') return;
      items.push({ kind: 'text', x: centre.x, y: centre.y + (i - (b.lines.length - 1) / 2) * u.lineHeight, text, role: nameRole, data: { block: b.id } });
    });
  }
  for (const link of links) {
    if (link.chip === undefined) continue;
    const c = link.chip;
    items.push({ kind: 'box', style: 'label', x: c.x, y: c.y, w: c.w, h: c.h, role: ['chip'], data: { from: link.from, to: link.to } });
    items.push({ kind: 'text', x: c.x + c.w / 2, y: c.y + c.h / 2, text: c.text, role: ['label'], data: { from: link.from, to: link.to } });
  }
  for (const link of links) {
    const first = link.points[0];
    if (link.invisible || first === undefined) continue;
    items.push({ kind: 'circle', cx: first.x, cy: first.y, r: PORT_RADIUS, role: link.style === 'thick' ? ['port', 'port--accent'] : ['port'] });
  }
  return items;
}
