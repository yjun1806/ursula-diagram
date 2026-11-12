import { ceilTo, FLOAT_NOISE, GRID } from '../chart/grid.ts';
import type { Ruler } from '../metrics.ts';
import { SCENE_THEME_SPECS } from '../render/scene-theme.ts';
import type { Theme } from '../render/theme.ts';
import type { Point, Scene, SceneItem } from '../types.ts';
import { displayOrder } from './model.ts';
import type { Commit, GitGraph } from './model.ts';

/** Distance between neighbouring commits along the time axis, and between neighbouring branch lines. */
const STEP = 96;
const LANE = 64;
/** A branch leaves or joins its line this far from the commit it starts at or ends in. */
const REACH = 56;
/** From the start of the branch lines to the first commit. */
const FIRST_GAP = 40;
const MARGIN = 24;
const NAME_GAP = 20;
const GUIDE_MIN = 96;
const TOP = 60;
const BOTTOM = 56;
const ID_ABOVE = 20;
const ID_BELOW = 20;
const TAG_ABOVE = 44;
const TAG_BELOW = 44;
/** TB and BT: distance between a commit and its label. */
const SIDE = 14;
const SIDE_GAP = 8;
const CHIP_H = 20;
const CHIP_PAD = 16;
const LABEL_GAP = 12;
const TITLE_BAND = 44;
const NAME_BAND = 56;
const SERIES = 8;
/** Advance of one ASCII character of the commit id font. */
const MONO = 7.4;

/** Rounds up to the grid; float noise just above a multiple does not jump to the next one. */
const snap4Up = (v: number): number => ceilTo(v, GRID, FLOAT_NOISE);

/** Width of a commit id: the monospaced font for ASCII, the ruler for everything else. */
export function monoWidth(text: string, ruler: Ruler): number {
  let w = 0;
  for (const ch of text) w += (ch.codePointAt(0) ?? 0) < 0x80 ? MONO : ruler.textWidth(ch, 'line');
  return w;
}

export interface PlacedCommit {
  seq: number;
  id: string;
  x: number;
  y: number;
  r: number;
}

export interface PlacedBranch {
  name: string;
  /** Centre of the branch line across the time axis. */
  x: number;
  y: number;
}

export interface GitLayout {
  scene: Scene;
  commits: PlacedCommit[];
  branches: PlacedBranch[];
}

const series = (index: number): number => (index % SERIES) + 1;

/** `a` and `b` as the two parts of one `M..C..` curve in (time, lane) space. */
type Pt = readonly [number, number];

/** A curve may start (fork) or end (merge) at most this many steps away from its commit. */
const MAX_DELAY = 3;
/** Distance a curve keeps from the label boxes it passes. */
const CURVE_CLEAR = 2;
/** Turned commit ids: the end of the id sits this far below and behind the commit, and the id turns by `TURN` degrees. */
const TURN_DROP = 14;
const TURN_BACK = 4;
const TURN = -45;
const COS45 = Math.SQRT1_2;
/** Half the height of a line of label text. */
const TEXT_HALF = 8;

/**
 * Lays out the graph. A fork or merge curve that would cross the id or tag of a commit it can move away from starts
 * (fork) or ends (merge) one step later or earlier, along an empty column added for it, up to `MAX_DELAY` steps.
 */
export function layoutGit(graph: GitGraph, ruler: Ruler, theme: Theme = 'solid'): GitLayout {
  const delays = new Map<string, number>();
  for (;;) {
    const { layout, hits } = buildGit(graph, ruler, theme, delays);
    const grow = hits.filter((k) => (delays.get(k) ?? 0) < MAX_DELAY);
    if (grow.length === 0) return layout;
    for (const k of grow) delays.set(k, (delays.get(k) ?? 0) + 1);
  }
}

/** A label's box, turned by `turn` degrees around (ax, ay); `t` is the time of its commit. */
interface Shape {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  turn: number;
  ax: number;
  ay: number;
  t: number;
}

function hits(shape: Shape, p: Point): boolean {
  const r = (-shape.turn * Math.PI) / 180;
  const dx = p.x - shape.ax;
  const dy = p.y - shape.ay;
  const x = shape.ax + dx * Math.cos(r) - dy * Math.sin(r);
  const y = shape.ay + dx * Math.sin(r) + dy * Math.cos(r);
  return x > shape.x0 - CURVE_CLEAR && x < shape.x1 + CURVE_CLEAR && y > shape.y0 - CURVE_CLEAR && y < shape.y1 + CURVE_CLEAR;
}

/** Points along a cubic curve from p0, without its ends. */
function sample(p0: Point, p1: Point, p2: Point, p3: Point): Point[] {
  const out: Point[] = [];
  for (let i = 1; i < 32; i++) {
    const s = i / 32;
    const u = 1 - s;
    const a = u * u * u;
    const b = 3 * u * u * s;
    const c = 3 * u * s * s;
    const d = s * s * s;
    out.push({ x: a * p0.x + b * p1.x + c * p2.x + d * p3.x, y: a * p0.y + b * p1.y + c * p2.y + d * p3.y });
  }
  return out;
}

/** A fork or merge curve: its key in the delay map, the curve's points, and which labels a delay can move it off. */
interface Connector {
  key: string;
  points: Point[];
  /** Labels of commits at or before this time (fork) or at or after it (merge) are ones a delay moves away from. */
  escapes: (t: number) => boolean;
}

function buildGit(graph: GitGraph, ruler: Ruler, theme: Theme, delays: ReadonlyMap<string, number>): { layout: GitLayout; hits: string[] } {
  const spec = SCENE_THEME_SPECS[theme];
  const radius = spec?.dotRadius ?? 5;
  const { showBranches, showCommitLabel, parallelCommits } = graph.config;
  const vertical = graph.orientation !== 'LR';
  const order = displayOrder(graph);
  const rowOf = new Map(order.map((name, i) => [name, i] as const));
  const colour = new Map(graph.branches.map((b, i) => [b.name, series(i)] as const));
  const rowCount = order.length;
  const titleOff = graph.title === undefined ? 0 : TITLE_BAND;

  // Position of each commit along the time axis, in steps; delayed curves add empty columns.
  const base: number[] = [];
  for (const c of graph.commits) {
    base[c.seq] = parallelCommits ? Math.max(-1, ...c.parents.map((p) => base[p] ?? 0)) + 1 : c.seq;
  }
  /** Empty columns added just before a base position. */
  const gaps = new Map<number, number>();
  const needGap = (slot: number, k: number): void => {
    if (k > 0) gaps.set(slot, Math.max(gaps.get(slot) ?? 0, k));
  };
  for (const b of graph.branches) if (b.parent !== undefined) needGap((base[b.parent] ?? 0) + 1, delays.get(`fork:${b.name}`) ?? 0);
  for (const c of graph.commits) if (c.kind === 'merge') needGap(base[c.seq] ?? 0, delays.get(`merge:${c.seq}`) ?? 0);
  const shiftAt = (p: number): number => [...gaps].reduce((sum, [slot, k]) => (slot <= p ? sum + k : sum), 0);
  const pos = base.map((p) => p + shiftAt(p));
  const maxPos = Math.max(0, ...pos);

  // Labels: id above or beside, tag chip beyond it.
  const turned = !vertical && showCommitLabel && graph.config.rotateCommitLabel;
  const idText = (c: Commit): string | undefined => (showCommitLabel ? c.id : undefined);
  const idW = (c: Commit): number => (showCommitLabel ? monoWidth(c.id, ruler) : 0);
  const chipW = (c: Commit): number => (c.tag === undefined ? 0 : Math.ceil((ruler.textWidth(c.tag, 'line') * 11) / 12) + CHIP_PAD);
  /** Width the labels of a commit take along the time axis; a turned id takes none to the right of its commit. */
  const labelW = (c: Commit): number => (turned ? chipW(c) : Math.max(idW(c), chipW(c)));
  /** A turned id: how far it reaches below its commit and back along the time axis. */
  const turnedDown = (c: Commit): number => (turned ? TURN_DROP + idW(c) * COS45 + TEXT_HALF * COS45 : 0);
  const turnedBack = (c: Commit): number => (turned ? TURN_BACK + idW(c) * COS45 + TEXT_HALF * COS45 : 0);

  const nameW = Math.max(0, ...order.map((n) => ruler.textWidth(n, 'lane')));

  // Time step: wide enough that the labels of neighbouring commits on one line keep apart (LR only).
  let step = STEP;
  if (!vertical) {
    for (const name of order) {
      const own = graph.commits.filter((c) => c.branch === name && labelW(c) > 0).sort((a, b) => (pos[a.seq] ?? 0) - (pos[b.seq] ?? 0));
      for (let i = 1; i < own.length; i++) {
        const a = own[i - 1];
        const b = own[i];
        if (a === undefined || b === undefined) continue;
        const dist = (pos[b.seq] ?? 0) - (pos[a.seq] ?? 0);
        step = Math.max(step, snap4Up(((labelW(a) + labelW(b)) / 2 + LABEL_GAP) / Math.max(1, dist)));
      }
    }
  }

  // Start of the branch lines along the time axis and across it.
  const guideStart = vertical ? titleOff + NAME_BAND : showBranches ? Math.max(GUIDE_MIN, snap4Up(MARGIN + nameW + NAME_GAP)) : MARGIN;
  const firstEdge = guideStart + FIRST_GAP;
  const firstHalf = Math.max(0, ...graph.commits.filter((c) => pos[c.seq] === 0).map((c) => labelW(c) / 2));
  let firstT = vertical ? firstEdge : Math.max(firstEdge, snap4Up(firstHalf + 8));
  for (const c of graph.commits) firstT = Math.max(firstT, snap4Up(MARGIN + turnedBack(c) - (pos[c.seq] ?? 0) * step));
  const timeOf = (c: Commit): number => firstT + (pos[c.seq] ?? 0) * step;
  const delayOf = (key: string): number => delays.get(key) ?? 0;
  const forkEnds = graph.branches.map((b) => {
    const parent = b.parent === undefined ? undefined : graph.commits[b.parent];
    return parent === undefined ? 0 : timeOf(parent) + delayOf(`fork:${b.name}`) * step + REACH;
  });
  const lastT = Math.max(firstT + maxPos * step, ...forkEnds);
  const guideEnd = lastT + MARGIN;

  // Lane coordinates (y in LR, x in TB/BT) and the room labels need beside the lanes.
  const lane: number[] = [];
  let acrossSize: number;
  const side = (c: Commit): 'a' | 'b' => ((rowOf.get(c.branch) ?? 0) === 0 ? 'a' : 'b');
  const sideExtent = (c: Commit): number => (idW(c) > 0 && chipW(c) > 0 ? idW(c) + SIDE_GAP + chipW(c) : labelW(c));
  if (!vertical) {
    const below = (r: number): number => Math.max(0, ...graph.commits.filter((c) => rowOf.get(c.branch) === r).map(turnedDown));
    const above = (r: number): number => (turned && graph.commits.some((c) => rowOf.get(c.branch) === r && c.tag !== undefined) ? ID_ABOVE + 4 + CHIP_H / 2 : 0);
    lane[0] = titleOff + TOP;
    for (let r = 1; r < rowCount; r++) lane[r] = (lane[r - 1] ?? 0) + Math.max(LANE, snap4Up(below(r - 1) + above(r) + LABEL_GAP));
    acrossSize = (lane[rowCount - 1] ?? 0) + Math.max(BOTTOM, snap4Up(below(rowCount - 1) + MARGIN));
  } else {
    const left = Math.max(0, ...graph.commits.filter((c) => side(c) === 'a').map(sideExtent));
    const right = Math.max(0, ...graph.commits.filter((c) => side(c) === 'b').map(sideExtent));
    const gap = Math.max(GUIDE_MIN, snap4Up(right + SIDE + 24), snap4Up(nameW + 16));
    const x0 = snap4Up(Math.max(MARGIN, left + SIDE + 16));
    for (let r = 0; r < rowCount; r++) lane[r] = x0 + r * gap;
    const lastRow = lane[rowCount - 1] ?? x0;
    const lastRight = Math.max(0, ...graph.commits.filter((c) => (rowOf.get(c.branch) ?? 0) === rowCount - 1 && side(c) === 'b').map((c) => SIDE + sideExtent(c)));
    acrossSize = snap4Up(Math.max(lastRow + MARGIN, lastRow + lastRight + MARGIN, lastRow + nameW / 2 + 16));
  }
  const laneOf = (name: string): number => lane[rowOf.get(name) ?? 0] ?? 0;

  // Size of the drawing and the map from (time, lane) to the picture.
  let timeSize: number;
  if (!vertical) {
    const reach = Math.max(0, ...graph.commits.map((c) => timeOf(c) + Math.max(labelW(c) / 2 + 16, MARGIN * 2)));
    timeSize = snap4Up(Math.max(guideEnd + MARGIN, reach));
  } else {
    timeSize = snap4Up(lastT + 2 * MARGIN);
  }
  const width = vertical ? acrossSize : timeSize;
  const height = vertical ? timeSize : snap4Up(acrossSize);
  const flip = graph.orientation === 'BT';
  /** Time runs along x in LR and down y in TB; BT mirrors the area below the title. */
  const place = ([t, l]: Pt): Point => (!vertical ? { x: t, y: l } : { x: l, y: flip ? titleOff + timeSize - t : t });
  const fmt = (p: Point): string => `${p.x} ${p.y}`;
  const M = (t: number, l: number): string => `M${fmt(place([t, l]))}`;
  const H = (t: number, l: number): string => `L${fmt(place([t, l]))}`;
  const C = (a: Pt, b: Pt, c: Pt): string => `C${fmt(place(a))} ${fmt(place(b))} ${fmt(place(c))}`;
  /** Branch leaving (t0, l0) for the line at l1, reaching it `REACH` later. */
  const forkTo = (t0: number, l0: number, l1: number): string => C([t0 + 20, l0 + (l1 - l0) * 0.5], [t0 + 24, l1], [t0 + REACH, l1]);
  /** Branch joining the line at l1 from the line at l0, starting `REACH` before t1. */
  const joinTo = (t1: number, l0: number, l1: number): string => C([t1 - 24, l0], [t1 - 20, l0 + (l1 - l0) * 0.5], [t1, l1]);

  const items: SceneItem[] = [];
  const dot = (name: string): number => colour.get(name) ?? 1;
  const total = graph.commits.length;

  if (graph.title !== undefined) {
    items.push({ kind: 'text', x: MARGIN, y: MARGIN + 4, text: graph.title, anchor: 'start', role: ['title'] });
  }

  // Branch names and their guide lines.
  const placedBranches: PlacedBranch[] = [];
  for (const name of order) {
    const l = laneOf(name);
    const c = place([guideStart, l]);
    placedBranches.push({ name, x: c.x, y: c.y });
    if (!showBranches) continue;
    if (vertical) {
      items.push({ kind: 'text', x: l, y: place([guideStart - NAME_BAND / 2, l]).y, text: name, anchor: 'middle', role: ['label'] });
    } else {
      items.push({ kind: 'text', x: MARGIN, y: l, text: name, anchor: 'start', role: ['label'] });
    }
    items.push({ kind: 'path', d: `${M(guideStart, l)}${H(guideEnd, l)}`, role: ['guide'] });
  }

  // Fork and merge curves first, then the branch lines over them: a delayed curve runs along a line it shares.
  const curves: SceneItem[] = [];
  const lines: SceneItem[] = [];
  const connectors: Connector[] = [];
  const curvePoints = (a: Pt, b: Pt, c: Pt, d: Pt): Point[] => sample(place(a), place(b), place(c), place(d));
  for (const b of graph.branches) {
    const own = graph.commits.filter((c) => c.branch === b.name);
    const first = own[0];
    const last = own[own.length - 1];
    const l = laneOf(b.name);
    const parent = b.parent === undefined ? undefined : graph.commits[b.parent];
    const role = [`series-${dot(b.name)}--line`];
    if (parent !== undefined) {
      const t0 = timeOf(parent);
      const l0 = laneOf(parent.branch);
      const ts = t0 + delayOf(`fork:${b.name}`) * step;
      const mid = l0 + (l - l0) * 0.5;
      curves.push({ kind: 'path', d: `${M(t0, l0)}${ts > t0 ? H(ts, l0) : ''}${C([ts + 20, mid], [ts + 24, l], [ts + REACH, l])}`, role, data: { branch: b.name, fork: b.name } });
      connectors.push({ key: `fork:${b.name}`, points: curvePoints([ts, l0], [ts + 20, mid], [ts + 24, l], [ts + REACH, l]), escapes: (t) => t <= ts });
      const end = last === undefined ? ts + REACH : timeOf(last);
      if (end > ts + REACH) lines.push({ kind: 'path', d: `${M(ts + REACH, l)}${H(end, l)}`, role, data: { branch: b.name } });
    } else if (first !== undefined && last !== undefined && first !== last) {
      lines.push({ kind: 'path', d: `${M(timeOf(first), l)}${H(timeOf(last), l)}`, role, data: { branch: b.name } });
    }
  }
  // Merge curves: from the head of the merged branch along its line, then up or down to the merge commit.
  for (const c of graph.commits) {
    if (c.kind !== 'merge' || c.mergedFrom === undefined) continue;
    const srcSeq = c.parents[1];
    const src = srcSeq === undefined ? undefined : graph.commits[srcSeq];
    if (src === undefined || src.branch !== c.mergedFrom) continue;
    const ls = laneOf(src.branch);
    const lt = laneOf(c.branch);
    const ts = timeOf(src);
    const tm = timeOf(c);
    const te = tm - delayOf(`merge:${c.seq}`) * step;
    const mid = ls + (lt - ls) * 0.5;
    const d = `${M(ts, ls)}${te - REACH > ts ? H(te - REACH, ls) : ''}${C([te - 24, ls], [te - 20, mid], [te, lt])}${te < tm ? H(tm, lt) : ''}`;
    curves.push({ kind: 'path', d, role: [`series-${dot(src.branch)}--line`], data: { branch: src.branch, merge: c.id } });
    connectors.push({ key: `merge:${c.seq}`, points: curvePoints([te - REACH, ls], [te - 24, ls], [te - 20, mid], [te, lt]), escapes: (t) => t >= te });
  }
  // Cherry-picks: a dotted link from the copied commit.
  for (const c of graph.commits) {
    if (c.kind !== 'cherry-pick' || c.cherryOf === undefined) continue;
    const src = graph.commits[c.cherryOf];
    if (src === undefined) continue;
    const t0 = timeOf(src);
    const t1 = timeOf(c);
    const l0 = laneOf(src.branch);
    const l1 = laneOf(c.branch);
    const mid = (t0 + t1) / 2;
    const d = `${M(t0, l0)}${C([mid, l0], [mid, l1], [t1, l1])}`;
    lines.push({ kind: 'path', d, role: ['edge', 'edge--pending'], data: { cherry: c.id } });
  }
  items.push(...curves, ...lines);

  // Commits and their labels.
  const dots: SceneItem[] = [];
  const labels: SceneItem[] = [];
  const placed: PlacedCommit[] = [];
  const shapes: Shape[] = [];
  const flat = (x0: number, x1: number, y0: number, y1: number, t: number): Shape => ({ x0, x1, y0, y1, turn: 0, ax: 0, ay: 0, t });
  const chip = (x0: number, y: number, w: number, tag: string, t: number): void => {
    labels.push({ kind: 'box', style: 'label', x: x0, y: y - CHIP_H / 2, w, h: CHIP_H, role: ['tag'] });
    labels.push({ kind: 'text', x: x0 + w / 2, y, text: tag, anchor: 'middle', role: ['tag-text'] });
    shapes.push(flat(x0, x0 + w, y - CHIP_H / 2, y + CHIP_H / 2, t));
  };
  for (const c of graph.commits) {
    const t = timeOf(c);
    const l = laneOf(c.branch);
    const p = place([t, l]);
    const n = dot(c.branch);
    const data = { id: c.id, branch: c.branch };
    let r = radius;
    if (c.type === 'HIGHLIGHT') {
      // A filled square in the colour of the branch.
      r = radius + 2;
      dots.push({ kind: 'box', style: 'label', x: p.x - r, y: p.y - r, w: 2 * r, h: 2 * r, radius: 2, role: [`series-${n}--dot`], data });
    } else if (c.type === 'REVERSE') {
      r = radius + 2;
      dots.push({ kind: 'circle', cx: p.x, cy: p.y, r, role: ['end-ring'], data });
      const k = r * 0.5;
      dots.push({ kind: 'line', points: [{ x: p.x - k, y: p.y - k }, { x: p.x + k, y: p.y + k }], role: ['mark-line'], radius: 0 });
      dots.push({ kind: 'line', points: [{ x: p.x - k, y: p.y + k }, { x: p.x + k, y: p.y - k }], role: ['mark-line'], radius: 0 });
    } else if (c.kind === 'merge') {
      dots.push({ kind: 'circle', cx: p.x, cy: p.y, r, role: ['bg'], data });
      dots.push({ kind: 'circle', cx: p.x, cy: p.y, r, role: [`series-${n}`, 'line'], data });
    } else {
      dots.push({ kind: 'circle', cx: p.x, cy: p.y, r, role: [`series-${n}--dot`], data });
    }
    placed.push({ seq: c.seq, id: c.id, x: p.x, y: p.y, r });

    const id = idText(c);
    const tag = c.tag;
    if (turned) {
      // The id ends just under the commit and runs back and down at 45 degrees; the tag sits above the commit.
      const ax = p.x - TURN_BACK;
      const ay = l + TURN_DROP;
      if (id !== undefined) {
        labels.push({ kind: 'text', x: ax, y: ay, text: id, anchor: 'end', role: ['mono'], data: { rotate: String(TURN) } });
        shapes.push({ x0: ax - idW(c), x1: ax, y0: ay - TEXT_HALF, y1: ay + TEXT_HALF, turn: TURN, ax, ay, t });
      }
      if (tag !== undefined) chip(p.x - chipW(c) / 2, l - ID_ABOVE - 4, chipW(c), tag, t);
    } else if (!vertical) {
      const above = side(c) === 'a';
      const idY = above ? l - ID_ABOVE : l + ID_BELOW;
      if (id !== undefined) {
        labels.push({ kind: 'text', x: p.x, y: idY, text: id, anchor: 'middle', role: ['mono'] });
        shapes.push(flat(p.x - idW(c) / 2, p.x + idW(c) / 2, idY - TEXT_HALF, idY + TEXT_HALF, t));
      }
      if (tag !== undefined) chip(p.x - chipW(c) / 2, id === undefined ? idY : above ? l - TAG_ABOVE : l + TAG_BELOW, chipW(c), tag, t);
    } else {
      const left = side(c) === 'a';
      const dir = left ? -1 : 1;
      const edge = p.x + dir * SIDE;
      const w = idW(c);
      if (id !== undefined) {
        labels.push({ kind: 'text', x: edge, y: p.y, text: id, anchor: left ? 'end' : 'start', role: ['mono'] });
        shapes.push(flat(left ? edge - w : edge, left ? edge : edge + w, p.y - TEXT_HALF, p.y + TEXT_HALF, t));
      }
      if (tag !== undefined) {
        const cw = chipW(c);
        const near = edge + dir * (w > 0 ? w + SIDE_GAP : 0);
        chip(left ? near - cw : near, p.y, cw, tag, t);
      }
    }
  }
  items.push(...dots, ...labels);

  // Curves that pass through a label they could move away from.
  const crossing = connectors.filter((k) => shapes.some((sh) => k.escapes(sh.t) && k.points.some((pt) => hits(sh, pt)))).map((k) => k.key);

  const name = graph.accTitle ?? (graph.title === undefined ? `Git graph: ${total} commits on ${rowCount} branches` : `Git graph: ${graph.title}`);
  return { layout: { scene: { width, height, title: name, items }, commits: placed, branches: placedBranches }, hits: crossing };
}
