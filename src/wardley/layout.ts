import { anchoredBox, clashCost, pickLeastClash } from '../chart/label-place.ts';
import type { Box, ClashContext } from '../chart/label-place.ts';
import { ceilTo, round2 } from '../chart/grid.ts';
import type { Ruler } from '../metrics.ts';
import { SCENE_THEME } from '../render/scene-theme.ts';
import { wrapWords } from '../text/wrap.ts';
import type { Point, Scene, SceneItem } from '../types.ts';
import type { Sourcing, WardleyMap, WardleyNode } from './parse.ts';

const MARGIN = 40;
const TOP_TITLE = 80;
const TOP_BARE = 56;
const BOTTOM = 62;
const DEFAULT_PLOT_W = 1000;
const DEFAULT_PLOT_H = 640;
const LINE_H = 16;
const LABEL_GAP = 8;
const ARROW_GAP = 3;
const EVOLVE_R = 5;
const RING_R = 9;
const MARKER_R = 9;
const NOTE_PAD = 12;
/** The narrowest a note's text is wrapped to. */
const NOTE_WRAP = 156;
/** Radius of the ring on a component that evolves, where its evolve line starts. */
const PORT_R = 4;
/** The baseline a label offset names stands this far below the middle of the text. */
const BASELINE_DROP = 4;
const FORCE_W = 64;
const FORCE_H = 24;
const PIPE_PAD = 12;
const PIPE_HALF = 16;
const TICK_PAD = 8;
const LIST_PAD = 8;
/** How far right of a component's edge its inertia bar reaches. */
const INERTIA_REACH = 8;
/** Extra cost of a name crossing a stage line: less than any real clash, so it only breaks ties. */
const STAGE_LINE_COST = 0.5;

export type LabelSide = 'right' | 'left' | 'above' | 'below' | 'above-left' | 'above-right' | 'below-left' | 'below-right';

/** The text anchor of a name on that side of its point. */
const anchorOfSide = (side: LabelSide): 'start' | 'middle' | 'end' => (side.endsWith('left') ? 'end' : side.endsWith('right') ? 'start' : 'middle');

export interface PlacedNode {
  name: string;
  kind: 'component' | 'anchor';
  visibility: number;
  evolution: number;
  cx: number;
  cy: number;
  /** Distance from the centre to the edge of what is drawn for the node. */
  reach: number;
  sourcing?: Sourcing;
  inertia: boolean;
  label: Box & { side: LabelSide; text: string };
}

export interface PlacedNote {
  text: string;
  box: Box;
  lines: string[];
}

export interface WardleyLayout {
  scene: Scene;
  plot: Box;
  /** x of the lines between stages, left to right. */
  boundaries: number[];
  nodes: PlacedNode[];
  notes: PlacedNote[];
  ignored: string[];
}

const inflate = (b: Box, by: number): Box => ({ x0: b.x0 - by, x1: b.x1 + by, y0: b.y0 - by, y1: b.y1 + by });

function reachOf(node: WardleyNode, dot: number): number {
  switch (node.sourcing) {
    case 'market':
      return RING_R;
    case 'build':
    case 'buy':
      return 8;
    case 'outsource':
      return 6;
    default:
      return dot;
  }
}

/** Points along a polyline, one every 4 along each piece, for the clash test. */
function samplesOf(a: Point, b: Point): Point[] {
  const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 4));
  return Array.from({ length: n + 1 }, (_, i) => ({ x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n }));
}

/** The point `by` short of `to` on the way from `from`; `to` itself when the pieces are too short. */
function shortened(from: Point, to: Point, by: number): Point {
  const len = Math.hypot(to.x - from.x, to.y - from.y);
  if (len <= by + 1) return to;
  return { x: to.x - ((to.x - from.x) / len) * by, y: to.y - ((to.y - from.y) / len) * by };
}

/**
 * The ways a note's text can be wrapped, fewest lines first, up to as many lines as wrapping it to `NOTE_WRAP` takes:
 * each one as narrow as it can be for its number of lines, so the lines are evenly filled.
 */
function noteWraps(note: string, text: (s: string) => number): string[][] {
  const most = wrapWords(note, NOTE_WRAP, text, { blank: true }).length;
  const byCount = new Map<number, string[]>();
  for (let limit = Math.ceil(text(note)); limit > 0; limit -= 4) {
    const lines = wrapWords(note, limit, text, { blank: true, longWord: 'keep' });
    if (lines.length > most) break;
    byCount.set(lines.length, lines);
  }
  return [...byCount.keys()].sort((a, b) => a - b).map((k) => byCount.get(k) ?? []);
}

/** Computes the scene of a Wardley map. */
export function layoutWardley(map: WardleyMap, ruler: Ruler): WardleyLayout {
  const dot = SCENE_THEME.neutralDotRadius;
  const text = (s: string): number => ruler.textWidth(s, 'line');
  const strong = (s: string): number => ruler.textWidth(s, 'title');
  const items: SceneItem[] = [];

  const top = map.title === undefined ? TOP_BARE : TOP_TITLE;
  const plotW = map.size === undefined ? DEFAULT_PLOT_W : Math.max(240, map.size.w - 2 * MARGIN);
  const plotH = map.size === undefined ? DEFAULT_PLOT_H : Math.max(120, map.size.h - top - BOTTOM);
  const plotX = MARGIN;
  const bottom = top + plotH;
  const xOf = (evo: number): number => round2(plotX + evo * plotW);
  const yOf = (vis: number): number => round2(bottom - vis * plotH);

  // Stage names: a `/` splits one into two lines; a name wider than its stage wraps.
  let from = 0;
  const stageRows = map.stages.map((st) => {
    const room = Math.max(24, (st.end - from) * plotW - 2 * TICK_PAD);
    const x0 = xOf(from);
    from = st.end;
    return { x: (x0 + xOf(st.end)) / 2, lines: st.names.flatMap((n) => wrapWords(n, room, text, { longWord: 'break' })) };
  });
  const tickLines = Math.max(1, ...stageRows.map((r) => r.lines.length));
  let width = plotX + plotW + MARGIN;
  let height = bottom + BOTTOM + (tickLines - 1) * LINE_H;
  const tickTop = bottom + 22;

  const nodes: PlacedNode[] = map.nodes.map((n) => ({
    name: n.name,
    kind: n.kind,
    visibility: n.visibility,
    evolution: n.evolution,
    cx: xOf(n.evolution),
    cy: yOf(n.visibility),
    reach: n.kind === 'anchor' ? 0 : reachOf(n, dot),
    ...(n.sourcing === undefined ? {} : { sourcing: n.sourcing }),
    inertia: n.inertia,
    label: { x0: 0, x1: 0, y0: 0, y1: 0, side: 'right', text: n.name },
  }));
  const byName = new Map(nodes.map((n) => [n.name, n]));
  const at = (name: string): PlacedNode => {
    const found = byName.get(name);
    if (found === undefined) throw new Error(`unknown component ${name}`);
    return found;
  };

  // Shapes that stay where they are, as boxes the names keep off.
  const fixed: Box[] = [];
  const samples: Point[] = [];
  const placed: Box[] = [];

  if (map.title !== undefined) fixed.push({ x0: MARGIN, x1: MARGIN + strong(map.title) * (15 / 13), y0: 56 - 10, y1: 56 + 10 });
  for (const n of nodes) {
    if (n.kind === 'component') {
      const right = n.reach + (n.inertia ? 8 : 0);
      fixed.push({ x0: n.cx - n.reach, x1: n.cx + right, y0: n.cy - Math.max(n.reach, n.inertia ? 10 : 0), y1: n.cy + Math.max(n.reach, n.inertia ? 10 : 0) });
    }
  }

  // Pipelines: a dashed box around the children, kept off by the names through four thin strips on its border.
  const pipeBoxes = map.pipelines.map((p) => {
    const xs = p.children.map((c) => at(c).cx);
    const parent = at(p.name);
    const box = { x0: Math.min(...xs) - PIPE_PAD, x1: Math.max(...xs) + PIPE_PAD, y0: parent.cy - PIPE_HALF, y1: parent.cy + PIPE_HALF };
    fixed.push(
      { x0: box.x0 - 1, x1: box.x1 + 1, y0: box.y0 - 1, y1: box.y0 + 1 },
      { x0: box.x0 - 1, x1: box.x1 + 1, y0: box.y1 - 1, y1: box.y1 + 1 },
      { x0: box.x0 - 1, x1: box.x0 + 1, y0: box.y0, y1: box.y1 },
      { x0: box.x1 - 1, x1: box.x1 + 1, y0: box.y0, y1: box.y1 },
    );
    return box;
  });

  // Links run straight between the two points; an arrow stops at the edge of the dot it points at.
  interface Seg {
    a: Point;
    b: Point;
    kind: WardleyMap['links'][number]['kind'];
    label?: string;
  }
  const segs: Seg[] = map.links.map((l) => {
    const a = at(l.from);
    const b = at(l.to);
    return { a: { x: a.cx, y: a.cy }, b: { x: b.cx, y: b.cy }, kind: l.kind, ...(l.label === undefined ? {} : { label: l.label }) };
  });
  const linkItems: SceneItem[] = [];
  map.links.forEach((l, i) => {
    const s = segs[i];
    if (s === undefined) return;
    const startArrow = l.kind === 'flow-back' || l.kind === 'flow-both';
    const endArrow = l.kind === 'flow' || l.kind === 'flow-both' || l.kind === 'flow-labeled';
    const na = at(l.from);
    const nb = at(l.to);
    const p0 = startArrow ? shortened(s.b, s.a, na.reach + ARROW_GAP) : s.a;
    const p1 = endArrow ? shortened(s.a, s.b, nb.reach + ARROW_GAP) : s.b;
    const role = ['edge', ...(l.kind === 'dashed' ? ['edge--pending'] : []), ...(endArrow ? ['edge--arrow'] : []), ...(startArrow ? ['edge--arrow-start'] : [])];
    linkItems.push({ kind: 'line', points: [p0, p1], role, data: { from: l.from, to: l.to, link: l.kind } });
    samples.push(...samplesOf(s.a, s.b));
  });

  // Evolution arrows run along the row of the component to the evolved place, which is a hollow circle.
  const evolveItems: SceneItem[] = [];
  const ports: SceneItem[] = [];
  for (const e of map.evolves) {
    const n = at(e.name);
    const tx = xOf(e.target);
    const dir = tx >= n.cx ? 1 : -1;
    // The line leaves the component itself, or the far side of its inertia bar, with a ring where it starts.
    const barred = dir > 0 && n.inertia;
    const start = { x: barred ? n.cx + n.reach + INERTIA_REACH + ARROW_GAP : n.cx, y: n.cy };
    const tip = { x: tx - dir * (EVOLVE_R + 4), y: n.cy };
    if ((tip.x - start.x) * dir > 20 + (barred ? 0 : n.reach)) {
      evolveItems.push({ kind: 'line', points: [start, tip], role: ['edge', 'edge--arrow'], data: { evolve: e.name } });
      ports.push({ kind: 'circle', cx: start.x, cy: start.y, r: PORT_R, role: ['port'], data: { evolve: e.name } });
    }
    evolveItems.push({ kind: 'circle', cx: tx, cy: n.cy, r: EVOLVE_R, role: ['end-open'], data: { evolve: e.name } });
    samples.push(...samplesOf({ x: n.cx, y: n.cy }, { x: tx, y: n.cy }));
    fixed.push({ x0: tx - EVOLVE_R, x1: tx + EVOLVE_R, y0: n.cy - EVOLVE_R, y1: n.cy + EVOLVE_R });
  }
  for (const t of map.trends) {
    const n = at(t.name);
    const target = { x: xOf(t.evolution), y: yOf(t.visibility) };
    const start = shortened(target, { x: n.cx, y: n.cy }, 0);
    const tip = shortened(start, target, EVOLVE_R + 4);
    linkItems.push({ kind: 'line', points: [start, tip], role: ['edge', 'edge--pending', 'edge--arrow'], data: { trend: t.name } });
    evolveItems.push({ kind: 'circle', cx: target.x, cy: target.y, r: EVOLVE_R, role: ['end-open'], data: { trend: t.name } });
    samples.push(...samplesOf(start, target));
    fixed.push({ x0: target.x - EVOLVE_R, x1: target.x + EVOLVE_R, y0: target.y - EVOLVE_R, y1: target.y + EVOLVE_R });
  }

  // Stage lines, which names keep off when another side is as free.
  const boundaries = map.stages.slice(0, -1).map((st) => xOf(st.end));
  const stageLineCost = (b: Box): number => (b.y1 > top && b.y0 < bottom && boundaries.some((x) => x > b.x0 - 1 && x < b.x1 + 1) ? STAGE_LINE_COST : 0);

  // Anchor names: above the point, or on another side or corner of it when a line crosses there. Lines that end at
  // the anchor itself start at the name, so they do not count against it.
  const anchorSides: LabelSide[] = ['above', 'above-left', 'above-right', 'below', 'below-left', 'below-right', 'left', 'right'];
  for (const n of nodes) {
    if (n.kind !== 'anchor') continue;
    const w = strong(n.name);
    const boxOf = (side: LabelSide): Box => {
      // A corner keeps 2 off the point so a line through the point clears the name.
      const corner = side.includes('-') ? 2 : 0;
      const y = side.startsWith('below') ? n.cy + LINE_H / 2 + corner : side === 'left' || side === 'right' ? n.cy : n.cy - LINE_H / 2 - corner;
      const x = side === 'left' ? n.cx - LABEL_GAP : side === 'right' ? n.cx + LABEL_GAP : n.cx + (side.endsWith('left') ? -corner : side.endsWith('right') ? corner : 0);
      return anchoredBox(x, y, w, anchorOfSide(side), LINE_H);
    };
    const own = samples.filter((p) => Math.hypot(p.x - n.cx, p.y - n.cy) >= 4);
    const ctx: ClashContext = { bounds: { x0: 16, x1: width - 16, y0: 16, y1: height - 16 }, fixed, placed: [], samples: own };
    const pick = pickLeastClash(anchorSides, boxOf, (b) => clashCost(b, ctx) + stageLineCost(b));
    const side = pick?.candidate ?? 'above';
    n.label = { ...(pick?.box ?? boxOf('above')), side, text: n.name };
    fixed.push(n.label);
  }

  // Forces: a block arrow pointing the way evolution is pushed.
  const forceItems: SceneItem[] = [];
  const forces = map.forces.map((f) => {
    const cx = xOf(f.evolution);
    const cy = yOf(f.visibility);
    const dir = f.kind === 'accelerator' ? 1 : -1;
    const x0 = cx - dir * (FORCE_W / 2);
    const x1 = cx + dir * (FORCE_W / 2);
    const neck = x1 - dir * 24;
    const d = `M${x0} ${cy - 6}L${neck} ${cy - 6}L${neck} ${cy - FORCE_H / 2}L${x1} ${cy}L${neck} ${cy + FORCE_H / 2}L${neck} ${cy + 6}L${x0} ${cy + 6}Z`;
    forceItems.push({ kind: 'path', d, role: [f.kind === 'accelerator' ? 'series-5--tint' : 'series-6--tint'], data: { force: f.kind, name: f.name } });
    const box = { x0: cx - FORCE_W / 2, x1: cx + FORCE_W / 2, y0: cy - FORCE_H / 2, y1: cy + FORCE_H / 2 };
    fixed.push(box);
    return { f, cx, cy };
  });

  // Numbered annotations: a marker on the map and a row in a list.
  const annItems: SceneItem[] = [];
  const annSorted = [...map.annotations].sort((a, b) => a.number - b.number);
  for (const a of annSorted) {
    const cx = xOf(a.evolution);
    const cy = yOf(a.visibility);
    annItems.push({ kind: 'circle', cx, cy, r: MARKER_R, role: ['end-ring'], data: { annotation: String(a.number) } });
    annItems.push({ kind: 'text', x: cx, y: cy, text: String(a.number), anchor: 'middle', role: ['tick'] });
    fixed.push({ x0: cx - MARKER_R - 1, x1: cx + MARKER_R + 1, y0: cy - MARKER_R - 1, y1: cy + MARKER_R + 1 });
  }
  const ROW = 24;
  const listW = annSorted.length === 0 ? 0 : MARKER_R * 2 + 8 + Math.max(...annSorted.map((a) => text(a.text)));
  const listH = annSorted.length * ROW;
  if (annSorted.length > 0) {
    const plotBox: Box = { x0: plotX, x1: plotX + plotW, y0: top, y1: bottom };
    const boxAt = (x: number, y: number): Box => ({ x0: x - MARKER_R, x1: x - MARKER_R + listW, y0: y - ROW / 2, y1: y - ROW / 2 + listH });
    let list: Box;
    if (map.annotationsAt !== undefined) {
      const raw = boxAt(xOf(map.annotationsAt.evolution), yOf(map.annotationsAt.visibility));
      const dx = Math.min(0, plotBox.x1 - raw.x1 - LIST_PAD);
      const dy = Math.min(0, plotBox.y1 - raw.y1 - LIST_PAD);
      list = { x0: raw.x0 + dx, x1: raw.x1 + dx, y0: raw.y0 + dy, y1: raw.y1 + dy };
    } else {
      const corners: Box[] = [
        boxAt(plotX + 24, bottom - listH + ROW / 2 - 16),
        boxAt(plotX + plotW - listW - 8 + MARKER_R, bottom - listH + ROW / 2 - 16),
        boxAt(plotX + 24, top + 16 + ROW / 2),
        boxAt(plotX + plotW - listW - 8 + MARKER_R, top + 16 + ROW / 2),
      ];
      const ctx: ClashContext = { bounds: inflate(plotBox, 0), fixed, placed: [], samples };
      list = pickLeastClash(corners, (b) => b, (b) => clashCost(b, ctx))?.box ?? (corners[0] as Box);
    }
    // The list sits on a note panel, so stage lines and links behind it do not run through its text.
    const panel = inflate(list, LIST_PAD);
    annItems.push({ kind: 'box', style: 'note', x: panel.x0, y: panel.y0, w: panel.x1 - panel.x0, h: panel.y1 - panel.y0, role: ['note'], data: { annotations: 'list' } });
    annSorted.forEach((a, i) => {
      const cy = list.y0 + ROW / 2 + i * ROW;
      annItems.push({ kind: 'circle', cx: list.x0 + MARKER_R, cy, r: MARKER_R, role: ['end-ring'], data: { annotation: String(a.number), list: 'true' } });
      annItems.push({ kind: 'text', x: list.x0 + MARKER_R, y: cy, text: String(a.number), anchor: 'middle', role: ['tick'] });
      annItems.push({ kind: 'text', x: list.x0 + MARKER_R * 2 + 8, y: cy, text: a.text, anchor: 'start', role: ['body'] });
    });
    fixed.push(panel);
  }

  // Names of components: an asked-for side first, then right, left, below and above, taking the first that touches nothing.
  // An offset puts the start of the text `dx` from the point with its baseline `dy` below it: a text that would then
  // run across the point is centred under it (or over it), any other one stands at the side it falls on.
  const sidesFor = (offset: WardleyNode['labelOffset'], w: number): LabelSide[] => {
    const base: LabelSide[] = ['right', 'left', 'below', 'above'];
    if (offset === undefined || offset.dx === 0) return base;
    const across = offset.dx < 0 && offset.dx + w > 0;
    const asked: LabelSide = across ? (offset.dy < 0 ? 'above' : 'below') : offset.dx < 0 ? 'left' : 'right';
    return [asked, ...base.filter((s) => s !== asked)];
  };
  const pictureBox = (): Box => ({ x0: 16, x1: width - 16, y0: 16, y1: height - 16 });
  const ctxNow = (): ClashContext => ({ bounds: pictureBox(), fixed, placed, samples });
  map.nodes.forEach((src, i) => {
    const n = nodes[i];
    if (n === undefined) return;
    if (n.kind === 'anchor') return;
    const w = text(n.name);
    // The owner of a pipeline is named above the pipeline box, apart from the names inside it.
    const pipeIndex = map.pipelines.findIndex((p) => p.name === n.name);
    const pipe = pipeBoxes[pipeIndex];
    if (pipe !== undefined) {
      n.label = { ...anchoredBox(n.cx, pipe.y0 - 4 - LINE_H / 2, w, 'middle', LINE_H), side: 'above', text: n.name };
      placed.push(n.label);
      return;
    }
    const rightReach = n.reach + (n.inertia ? 8 : 0);
    const dy = (src.labelOffset?.dy ?? 0) - BASELINE_DROP;
    const sides = sidesFor(src.labelOffset, w);
    const boxOf = (side: LabelSide): Box => {
      const shift = side === sides[0] && src.labelOffset !== undefined ? dy : 0;
      if (side === 'right') return anchoredBox(n.cx + rightReach + LABEL_GAP, n.cy + shift, w, 'start', LINE_H);
      if (side === 'left') return anchoredBox(n.cx - n.reach - LABEL_GAP, n.cy + shift, w, 'end', LINE_H);
      if (side === 'below') return anchoredBox(n.cx, n.cy + n.reach + LABEL_GAP + LINE_H / 2, w, 'middle', LINE_H);
      return anchoredBox(n.cx, n.cy - n.reach - LABEL_GAP - LINE_H / 2, w, 'middle', LINE_H);
    };
    const ctx = ctxNow();
    const pick = pickLeastClash(sides, boxOf, (b) => clashCost(b, ctx) + stageLineCost(b));
    const side = pick?.candidate ?? 'right';
    const box = pick?.box ?? boxOf('right');
    n.label = { ...box, side, text: n.name };
    placed.push(box);
  });

  // Names of forces: below the arrow or above it.
  const forceLabels = forces.map(({ f, cx, cy }) => {
    const w = text(f.name);
    const below = anchoredBox(cx, cy + FORCE_H / 2 + LABEL_GAP + LINE_H / 2, w, 'middle', LINE_H);
    const above = anchoredBox(cx, cy - FORCE_H / 2 - LABEL_GAP - LINE_H / 2, w, 'middle', LINE_H);
    const ctx = ctxNow();
    const pick = pickLeastClash([below, above], (b) => b, (b) => clashCost(b, ctx));
    const box = pick?.box ?? below;
    placed.push(box);
    return { f, box };
  });

  // Notes sit with their left edge on the asked place and move sideways until clear of lines, dots and names. A note is
  // as wide as its text on one line; it wraps into more, evenly filled lines only when that lets it stand nearer the place.
  const noteItems: SceneItem[] = [];
  const notes: PlacedNote[] = [];
  for (const nt of map.notes) {
    const x = xOf(nt.evolution);
    const y = yOf(nt.visibility);
    const room = 8;
    const ctx: ClashContext = { bounds: inflate({ x0: plotX, x1: plotX + plotW, y0: top, y1: bottom }, room), fixed, placed, samples };
    let best: { lines: string[]; box: Box; dist: number } | undefined;
    for (const lines of noteWraps(nt.text, text)) {
      const w = ceilTo(Math.max(...lines.map(text)) + 2 * NOTE_PAD);
      const h = lines.length * LINE_H + LINE_H;
      // Candidates by distance from the asked place: sideways with the left edge or the right edge on it, and a little up or down.
      const shifts: Array<{ s: number; dy: number; dist: number }> = [];
      for (let t = 0; t <= plotW; t += 4) {
        for (let dy = -64; dy <= 64; dy += 8) {
          shifts.push({ s: t, dy, dist: Math.hypot(t, dy) }, { s: -t - w, dy, dist: Math.hypot(t, dy) + 0.5 });
        }
      }
      shifts.sort((a, b) => a.dist - b.dist);
      const boxOf = (c: { s: number; dy: number }): Box => ({ x0: x + c.s, x1: x + c.s + w, y0: y + c.dy - h / 2, y1: y + c.dy + h / 2 });
      const pick = pickLeastClash(shifts, (c) => inflate(boxOf(c), room), (b) => clashCost(b, ctx));
      const chosen = pick?.candidate ?? { s: 0, dy: 0, dist: Infinity };
      const free = clashCost(inflate(boxOf(chosen), room), ctx) === 0;
      const dist = free ? chosen.dist : Infinity;
      if (best === undefined || dist < best.dist) best = { lines, box: boxOf(chosen), dist };
      if (dist === 0) break;
    }
    if (best === undefined) continue;
    const { lines, box } = best;
    placed.push(box);
    notes.push({ text: nt.text, box, lines });
    noteItems.push({ kind: 'box', style: 'note', x: box.x0, y: box.y0, w: box.x1 - box.x0, h: box.y1 - box.y0, role: ['note'] });
    const cx = (box.x0 + box.x1) / 2;
    lines.forEach((l, i) => noteItems.push({ kind: 'text', x: cx, y: box.y0 + LINE_H + i * LINE_H, text: l, anchor: 'middle', role: ['sub'] }));
  }

  // Text on a link sits on it, on the first point along it that touches no name.
  const linkLabelItems: SceneItem[] = [];
  segs.forEach((s) => {
    if (s.label === undefined) return;
    const w = text(s.label);
    const cands = [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8];
    const ctx = ctxNow();
    const boxOf = (t: number): Box => anchoredBox(s.a.x + (s.b.x - s.a.x) * t, s.a.y + (s.b.y - s.a.y) * t, w, 'middle', LINE_H);
    const pick = pickLeastClash(cands, boxOf, (b) => clashCost(b, { ...ctx, samples: [] }));
    const box = pick?.box ?? boxOf(0.5);
    placed.push(box);
    linkLabelItems.push({ kind: 'text', x: (box.x0 + box.x1) / 2, y: (box.y0 + box.y1) / 2, text: s.label, anchor: 'middle', role: ['tick', 'tick--halo'] });
  });

  // Assemble in paint order.
  if (map.title !== undefined) items.push({ kind: 'text', x: MARGIN, y: 56, text: map.title, anchor: 'start', role: ['title'] });
  for (const bx of boundaries) items.push({ kind: 'line', points: [{ x: bx, y: top }, { x: bx, y: bottom }], role: ['grid'] });
  items.push({ kind: 'line', points: [{ x: plotX, y: bottom }, { x: plotX + plotW, y: bottom }], role: ['axis'] });
  stageRows.forEach((r) => r.lines.forEach((l, i) => items.push({ kind: 'text', x: r.x, y: tickTop + i * LINE_H, text: l, anchor: 'middle', role: ['tick'] })));
  items.push(...linkItems);
  pipeBoxes.forEach((b, i) => items.push({ kind: 'box', style: 'frame', x: b.x0, y: b.y0, w: b.x1 - b.x0, h: b.y1 - b.y0, radius: 8, role: ['zone--dashed'], data: { pipeline: map.pipelines[i]?.name ?? '' } }));
  items.push(...evolveItems.filter((it) => it.kind === 'line'), ...forceItems, ...noteItems);
  for (const n of nodes) {
    if (n.kind === 'anchor') continue;
    const d = { name: n.name, ...(n.sourcing === undefined ? {} : { sourcing: n.sourcing }), ...(n.inertia ? { inertia: 'true' } : {}) };
    const { cx, cy } = n;
    // The symbols the syntax documentation names: build a triangle, buy a diamond, outsource a square, market a circle.
    if (n.sourcing === 'market') {
      items.push({ kind: 'circle', cx, cy, r: RING_R, role: ['end-open'], data: d }, { kind: 'circle', cx, cy, r: dot, role: ['dot'] });
    } else if (n.sourcing === 'buy') {
      items.push({ kind: 'path', d: `M${cx} ${cy - 8}L${cx + 8} ${cy}L${cx} ${cy + 8}L${cx - 8} ${cy}Z`, role: ['dot'], data: d });
    } else if (n.sourcing === 'build') {
      items.push({ kind: 'path', d: `M${cx} ${cy - 8}L${cx + 8} ${cy + 6}L${cx - 8} ${cy + 6}Z`, role: ['dot'], data: d });
    } else if (n.sourcing === 'outsource') {
      items.push({ kind: 'path', d: `M${cx - 6} ${cy - 6}H${cx + 6}V${cy + 6}H${cx - 6}Z`, role: ['dot'], data: d });
    } else {
      items.push({ kind: 'circle', cx, cy, r: dot, role: ['dot'], data: d });
    }
    if (n.inertia) items.push({ kind: 'line', points: [{ x: cx + n.reach + 6, y: cy - 10 }, { x: cx + n.reach + 6, y: cy + 10 }], role: ['mark-line'], data: { inertia: n.name } });
  }
  items.push(...evolveItems.filter((it) => it.kind === 'circle'), ...ports, ...annItems);
  for (const n of nodes) {
    const l = n.label;
    const anchor = anchorOfSide(l.side);
    const x = anchor === 'start' ? l.x0 : anchor === 'end' ? l.x1 : (l.x0 + l.x1) / 2;
    if (n.kind === 'anchor') items.push({ kind: 'text', x, y: (l.y0 + l.y1) / 2, text: n.name, anchor, role: ['name'], data: { anchor: n.name } });
    else items.push({ kind: 'text', x, y: (l.y0 + l.y1) / 2, text: n.name, anchor, role: ['body'] });
    width = Math.max(width, ceilTo(l.x1 + MARGIN));
    height = Math.max(height, ceilTo(l.y1 + MARGIN / 2));
  }
  for (const { f, box } of forceLabels) items.push({ kind: 'text', x: (box.x0 + box.x1) / 2, y: (box.y0 + box.y1) / 2, text: f.name, anchor: 'middle', role: ['label'] });
  items.push(...linkLabelItems);
  for (const b of placed) width = Math.max(width, ceilTo(b.x1 + MARGIN / 2));

  items.unshift({ kind: 'box', style: 'frame', x: 16, y: 16, w: width - 32, h: height - 32, role: ['panel'] });
  const scene: Scene = { width, height, title: map.accTitle ?? map.title ?? 'Wardley map', items };
  return { scene, plot: { x0: plotX, x1: plotX + plotW, y0: top, y1: bottom }, boundaries, nodes, notes, ignored: map.ignored };
}
