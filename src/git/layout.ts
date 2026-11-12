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

export const snap4Up = (v: number): number => Math.ceil(v / 4 - 1e-9) * 4;

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

export function layoutGit(graph: GitGraph, ruler: Ruler, theme: Theme = 'solid'): GitLayout {
  const spec = SCENE_THEME_SPECS[theme];
  const radius = spec?.dotRadius ?? 5;
  const { showBranches, showCommitLabel, parallelCommits } = graph.config;
  const vertical = graph.orientation !== 'LR';
  const order = displayOrder(graph);
  const rowOf = new Map(order.map((name, i) => [name, i] as const));
  const colour = new Map(graph.branches.map((b, i) => [b.name, series(i)] as const));
  const rowCount = order.length;
  const titleOff = graph.title === undefined ? 0 : TITLE_BAND;

  // Position of each commit along the time axis, in steps.
  const pos: number[] = [];
  for (const c of graph.commits) {
    pos[c.seq] = parallelCommits ? Math.max(-1, ...c.parents.map((p) => pos[p] ?? 0)) + 1 : c.seq;
  }
  const maxPos = Math.max(0, ...pos);

  // Labels: id above or beside, tag chip beyond it.
  const idText = (c: Commit): string | undefined => (showCommitLabel ? c.id : undefined);
  const idW = (c: Commit): number => (showCommitLabel ? monoWidth(c.id, ruler) : 0);
  const chipW = (c: Commit): number => (c.tag === undefined ? 0 : Math.ceil((ruler.textWidth(c.tag, 'line') * 11) / 12) + CHIP_PAD);
  const labelW = (c: Commit): number => Math.max(idW(c), chipW(c));

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
  const firstT = vertical ? firstEdge : Math.max(firstEdge, snap4Up(firstHalf + 8));
  const timeOf = (c: Commit): number => firstT + (pos[c.seq] ?? 0) * step;
  const lastT = firstT + maxPos * step;
  const guideEnd = lastT + MARGIN;

  // Lane coordinates (y in LR, x in TB/BT) and the room labels need beside the lanes.
  const lane: number[] = [];
  let acrossSize: number;
  const side = (c: Commit): 'a' | 'b' => ((rowOf.get(c.branch) ?? 0) === 0 ? 'a' : 'b');
  const sideExtent = (c: Commit): number => (idW(c) > 0 && chipW(c) > 0 ? idW(c) + SIDE_GAP + chipW(c) : labelW(c));
  if (!vertical) {
    for (let r = 0; r < rowCount; r++) lane[r] = titleOff + TOP + r * LANE;
    acrossSize = titleOff + TOP + (rowCount - 1) * LANE + BOTTOM;
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

  // Branch lines: fork curve, then along the line to the last commit.
  const lines: SceneItem[] = [];
  for (const b of graph.branches) {
    const own = graph.commits.filter((c) => c.branch === b.name);
    const first = own[0];
    const last = own[own.length - 1];
    const l = laneOf(b.name);
    const parent = b.parent === undefined ? undefined : graph.commits[b.parent];
    if (parent !== undefined) {
      const t0 = timeOf(parent);
      const l0 = laneOf(parent.branch);
      const end = last === undefined ? t0 + REACH : Math.max(t0 + REACH, timeOf(last));
      lines.push({ kind: 'path', d: `${M(t0, l0)}${forkTo(t0, l0, l)}${end > t0 + REACH ? H(end, l) : ''}`, role: [`series-${dot(b.name)}--line`], data: { branch: b.name } });
    } else if (first !== undefined && last !== undefined && first !== last) {
      lines.push({ kind: 'path', d: `${M(timeOf(first), l)}${H(timeOf(last), l)}`, role: [`series-${dot(b.name)}--line`], data: { branch: b.name } });
    }
  }
  // Merge lines: from the head of the merged branch up to the merge commit.
  for (const c of graph.commits) {
    if (c.kind !== 'merge' || c.mergedFrom === undefined) continue;
    const srcSeq = c.parents[1];
    const src = srcSeq === undefined ? undefined : graph.commits[srcSeq];
    if (src === undefined || src.branch !== c.mergedFrom) continue;
    const ls = laneOf(src.branch);
    const lt = laneOf(c.branch);
    const ts = timeOf(src);
    const tm = timeOf(c);
    lines.push({ kind: 'path', d: `${M(ts, ls)}${tm - REACH > ts ? H(tm - REACH, ls) : ''}${joinTo(tm, ls, lt)}`, role: [`series-${dot(src.branch)}--line`], data: { branch: src.branch, merge: c.id } });
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
  items.push(...lines);

  // Commits and their labels.
  const dots: SceneItem[] = [];
  const labels: SceneItem[] = [];
  const placed: PlacedCommit[] = [];
  for (const c of graph.commits) {
    const t = timeOf(c);
    const l = laneOf(c.branch);
    const p = place([t, l]);
    const n = dot(c.branch);
    const data = { id: c.id, branch: c.branch };
    let r = radius;
    if (c.type === 'HIGHLIGHT') {
      r = radius + 3;
      dots.push({ kind: 'circle', cx: p.x, cy: p.y, r, role: ['mark-dot'], data });
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
    if (!vertical) {
      const above = side(c) === 'a';
      const idY = above ? l - ID_ABOVE : l + ID_BELOW;
      if (id !== undefined) labels.push({ kind: 'text', x: p.x, y: idY, text: id, anchor: 'middle', role: ['mono'] });
      if (tag !== undefined) {
        const w = chipW(c);
        const y = id === undefined ? idY : above ? l - TAG_ABOVE : l + TAG_BELOW;
        labels.push({ kind: 'box', style: 'label', x: p.x - w / 2, y: y - CHIP_H / 2, w, h: CHIP_H, role: ['tag'] });
        labels.push({ kind: 'text', x: p.x, y, text: tag, anchor: 'middle', role: ['tag-text'] });
      }
    } else {
      const left = side(c) === 'a';
      const dir = left ? -1 : 1;
      const edge = p.x + dir * SIDE;
      const w = idW(c);
      if (id !== undefined) labels.push({ kind: 'text', x: edge, y: p.y, text: id, anchor: left ? 'end' : 'start', role: ['mono'] });
      if (tag !== undefined) {
        const cw = chipW(c);
        const near = edge + dir * (w > 0 ? w + SIDE_GAP : 0);
        const x0 = left ? near - cw : near;
        labels.push({ kind: 'box', style: 'label', x: x0, y: p.y - CHIP_H / 2, w: cw, h: CHIP_H, role: ['tag'] });
        labels.push({ kind: 'text', x: x0 + cw / 2, y: p.y, text: tag, anchor: 'middle', role: ['tag-text'] });
      }
    }
  }
  items.push(...dots, ...labels);

  const name = graph.accTitle ?? (graph.title === undefined ? `Git graph: ${total} commits on ${rowCount} branches` : `Git graph: ${graph.title}`);
  return { scene: { width, height, title: name, items }, commits: placed, branches: placedBranches };
}
