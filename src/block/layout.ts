import type { Ruler } from '../metrics.ts';
import { trimToOutline } from '../render/shapes.ts';
import type { NodeShape, Point, Scene, SceneItem, SceneLine } from '../types.ts';
import { arrowBody, shapeItems } from './draw.ts';
import { measure, place } from './grid.ts';
import type { GapWants } from './grid.ts';
import { arrowThickness } from './size.ts';
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

/**
 * Cost of the pieces of a route that run along the border of a group, closer than `near`: such a line reads as part
 * of the border.
 */
function alongBorders(pts: readonly Point[], zones: readonly Rect[], near: number): number {
  let cost = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i] as Point;
    const b = pts[i + 1] as Point;
    const flat = a.y === b.y;
    for (const z of zones) {
      const lines = flat ? [z.y, z.y + z.h] : [z.x, z.x + z.w];
      const at = flat ? a.y : a.x;
      const lo = flat ? Math.min(a.x, b.x) : Math.min(a.y, b.y);
      const hi = flat ? Math.max(a.x, b.x) : Math.max(a.y, b.y);
      const span = Math.min(hi, flat ? z.x + z.w : z.y + z.h) - Math.max(lo, flat ? z.x : z.y);
      if (span > 0 && lines.some((v) => Math.abs(v - at) < near)) cost += 800 + span;
    }
  }
  return cost;
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
function chipPlace(pts: readonly Point[], text: string, ruler: Ruler, u: Units, leaves: readonly Rect[]): NonNullable<PlacedLink['chip']> & { free: boolean } {
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
  const m = u.terminal ? 0 : CHIP_CLEAR;
  const free = (r: Rect): boolean => leaves.every((l) => r.x >= l.x + l.w + m || r.x + r.w + m <= l.x || r.y >= l.y + l.h + m || r.y + r.h + m <= l.y);
  const found = ranked.map(spot).find(free);
  return { ...(found ?? spot(ranked[0] as { a: Point; b: Point })), text, free: found !== undefined };
}

/** Room a gap needs between the boxes on both sides of a label chip, and the least size of a gap that holds one. */
const CHIP_SIDE = 24;
const CHIP_GAP = 80;
/** A line closer than this to a group border, and along it, reads as part of the border. */
const BORDER_NEAR = 8;
/** Clear distance a chip keeps from every block. */
const CHIP_CLEAR = 8;

/**
 * The gaps a labelled link runs straight through, widened so its chip fits between the two blocks with room for the
 * line on both sides. Only a link between two blocks of one grid that face each other across empty cells counts;
 * any other link bends and its chip finds its own place.
 */
function chipGaps(blocks: readonly PlacedBlock[], model: BlockDiagram, ruler: Ruler, u: Units): Map<string, GapWants> {
  const out = new Map<string, GapWants>();
  const byId = new Map(blocks.map((b) => [b.id, b] as const));
  const want = (key: string, axis: 'cols' | 'rows', from: number, to: number, room: number): void => {
    const g = out.get(key) ?? { cols: new Map<number, number>(), rows: new Map<number, number>() };
    out.set(key, g);
    const each = u.snap(room / (to - from));
    for (let i = from; i < to; i++) g[axis].set(i, Math.max(g[axis].get(i) ?? 0, each));
  };
  for (const link of model.links) {
    if (link.label === undefined || link.invisible) continue;
    const a = byId.get(link.from);
    const b = byId.get(link.to);
    if (a === undefined || b === undefined || a.parent !== b.parent) continue;
    const siblings = blocks.filter((x) => x.parent === a.parent && x.id !== a.id && x.id !== b.id);
    const key = a.parent ?? '';
    const chipW = u.snap(ruler.textWidth(link.label, 'line') + u.chipPad);
    if (a.row === b.row) {
      const [l, r] = a.column < b.column ? [a, b] : [b, a];
      const c0 = l.column + l.span - 1;
      if (r.column <= c0 || siblings.some((x) => x.row === a.row && x.column > c0 && x.column < r.column)) continue;
      const cellL = l.x + l.w;
      const between = r.x - cellL;
      const need = Math.max(CHIP_GAP, chipW + 2 * CHIP_SIDE);
      if (between >= need) continue;
      const gapsNow = r.column - c0;
      const room = need - (between - gapsNow * u.colGap);
      want(key, 'cols', c0, r.column, room);
      continue;
    }
    const overlap = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    if (overlap <= 0) continue;
    const [t, d] = a.row < b.row ? [a, b] : [b, a];
    const x0 = Math.max(a.x, b.x);
    const x1 = Math.min(a.x + a.w, b.x + b.w);
    if (siblings.some((x) => x.row > t.row && x.row < d.row && x.x < x1 && x.x + x.w > x0)) continue;
    const between = d.y - (t.y + t.h);
    if (between >= CHIP_GAP) continue;
    want(key, 'rows', t.row, d.row, CHIP_GAP - (between - (d.row - t.row) * u.rowGap));
  }
  return out;
}

/**
 * Lays a block diagram out: the blocks on the grid the source wrote, then the links around them. Pixels draw a scene;
 * a terminal ruler leaves the scene empty and the text drawing reads `blocks` and `links`.
 */
export function layoutBlock(model: BlockDiagram, ruler: Ruler, compact = false): BlockLayout {
  const base = unitsOf(ruler, compact);
  const widest = Math.max(0, ...model.links.map((l) => (l.label === undefined ? 0 : base.textWidth(l.label))));
  const u: Units = base.terminal ? { ...base, colGap: Math.max(base.colGap, widest + 4) } : base;
  const arrows = arrowThickness(model.children, u);
  const first = measure(model.children, model.columns, u, { arrows });
  const firstBlocks: PlacedBlock[] = [];
  place(first, { x: u.margin, y: 0, w: first.w, h: first.h }, u, firstBlocks, undefined, 0);
  const wants = u.terminal ? new Map<string, GapWants>() : chipGaps(firstBlocks, model, ruler, u);
  const plan = wants.size === 0 ? first : measure(model.children, model.columns, u, { arrows, wants });
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
  const zones = placed.filter((b) => b.kind === 'group').map(rectOf);

  // A picture grows to hold a line that goes around the outer blocks; a terminal drawing keeps its size.
  const bounds: Rect = u.terminal ? { x: 0, y: 0, w: width, h: height } : { x: -width, y: -height, w: 3 * width, h: 3 * height };
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
    const text = link.label;
    const chipCost = (p: Point[]): number => (text === undefined || chipPlace(p, text, ruler, u, others.concat(rectOf(from), rectOf(to))).free ? 0 : 1000);
    const pts = route(rectOf(from), rectOf(to), link, {
      ...(u.terminal ? {} : { score: (p: Point[]): number => chipCost(p) + alongBorders(p, zones, BORDER_NEAR) }),
      ...(text === undefined || u.terminal ? {} : { farthest: 2 + Math.ceil(u.snap(ruler.textWidth(text, 'line') + u.chipPad) / 2 / u.lane) }),
      obstacles: others,
      used,
      channelsX: channels(leafRects.concat(zones), 'x', 2 * u.stub, u.grid),
      channelsY: channels(leafRects.concat(zones), 'y', 2 * u.stub, u.grid),
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
    const placedChip = link.label === undefined ? undefined : chipPlace(drawn, link.label, ruler, u, others.concat(rectOf(from), rectOf(to)));
    const chip = placedChip === undefined ? undefined : { x: placedChip.x, y: placedChip.y, w: placedChip.w, h: placedChip.h, text: placedChip.text };
    links.push({ ...base, points: drawn, ...(chip === undefined ? {} : { chip }) });
  }

  const label = model.accTitle ?? (model.title === undefined ? `Block diagram: ${leaves.length} blocks` : `Block diagram: ${model.title}`);
  const fit = u.terminal ? { dx: 0, dy: 0, width, height } : keepMargin(links, width, height, u);
  const shifted = fit.dx === 0 && fit.dy === 0 ? { blocks: placed, links } : shift(placed, links, fit.dx, fit.dy);
  const scene: Scene = { width: fit.width, height: fit.height, title: label, items: u.terminal ? [] : sceneItems(shifted.blocks, shifted.links, model, u) };
  return { scene, width: fit.width, height: fit.height, blocks: shifted.blocks, links: shifted.links };
}

/**
 * How far to move the drawing and how large to make it so the lines that run around the outer blocks, and their
 * chips, keep the outer margin too.
 */
function keepMargin(links: readonly PlacedLink[], width: number, height: number, u: Units): { dx: number; dy: number; width: number; height: number } {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const l of links) {
    for (const p of l.points) {
      xs.push(p.x);
      ys.push(p.y);
    }
    if (l.chip !== undefined) {
      xs.push(l.chip.x, l.chip.x + l.chip.w);
      ys.push(l.chip.y, l.chip.y + l.chip.h);
    }
  }
  if (xs.length === 0) return { dx: 0, dy: 0, width, height };
  const dx = u.snap(Math.max(0, u.margin - Math.min(...xs)));
  const dy = u.snap(Math.max(0, u.margin - Math.min(...ys)));
  return { dx, dy, width: u.snap(Math.max(width + dx, Math.max(...xs) + dx + u.margin)), height: u.snap(Math.max(height + dy, Math.max(...ys) + dy + u.margin)) };
}

function shift(blocks: readonly PlacedBlock[], links: readonly PlacedLink[], dx: number, dy: number): { blocks: PlacedBlock[]; links: PlacedLink[] } {
  return {
    blocks: blocks.map((b) => ({ ...b, x: b.x + dx, y: b.y + dy })),
    links: links.map((l) => ({
      ...l,
      points: l.points.map((p) => ({ x: p.x + dx, y: p.y + dy })),
      ...(l.chip === undefined ? {} : { chip: { ...l.chip, x: l.chip.x + dx, y: l.chip.y + dy } }),
    })),
  };
}

function sceneItems(blocks: readonly PlacedBlock[], links: readonly PlacedLink[], model: BlockDiagram, u: Units): SceneItem[] {
  const items: SceneItem[] = [];
  const depthOf = new Map(blocks.filter((g) => g.kind === 'group').map((g) => [g.id, g.depth] as const));
  if (model.title !== undefined) items.push({ kind: 'text', x: u.margin, y: u.margin + 9, text: model.title, anchor: 'start', role: ['title'] });
  for (const b of blocks.filter((g) => g.kind === 'group')) {
    items.push({ kind: 'box', x: b.x, y: b.y, w: b.w, h: b.h, role: b.depth % 2 === 1 ? ['zone'] : ['zone', 'zone--plain'], data: { block: b.id } });
  }
  for (const link of links) {
    if (link.invisible || link.points.length < 2) continue;
    const role = ['edge', ...(link.arrow ? ['edge--arrow'] : []), ...(link.arrowStart ? ['edge--arrow-start'] : []), ...(link.style === 'dotted' ? ['edge--pending'] : []), ...(link.style === 'thick' ? ['edge--accent'] : [])];
    const line: SceneLine = { kind: 'line', points: link.points, role, data: { from: link.from, to: link.to } };
    items.push(line);
  }
  for (const b of blocks.filter((g) => g.kind === 'node')) {
    // A box in a filled zone turns white; one in a plain (white) zone keeps the box fill so it still shows.
    const inZone = b.parent !== undefined && (depthOf.get(b.parent) ?? 1) % 2 === 1;
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
    items.push({ kind: 'box', x: c.x, y: c.y, w: c.w, h: c.h, role: ['chip'], data: { from: link.from, to: link.to } });
    items.push({ kind: 'text', x: c.x + c.w / 2, y: c.y + c.h / 2, text: c.text, role: ['label'], data: { from: link.from, to: link.to } });
  }
  for (const link of links) {
    const first = link.points[0];
    if (link.invisible || first === undefined) continue;
    items.push({ kind: 'circle', cx: first.x, cy: first.y, r: PORT_RADIUS, role: link.style === 'thick' ? ['port', 'port--accent'] : ['port'] });
  }
  return items;
}
