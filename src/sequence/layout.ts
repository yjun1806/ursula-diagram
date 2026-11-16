import type { Ruler, TextRole } from '../metrics.ts';
import type { Diagnostic, SceneArrow, SceneItem, SceneTone } from '../types.ts';
import { kindOf } from './model.ts';
import type {
  Box,
  LegendKind,
  MessageKind,
  MessageStmt,
  NoteStmt,
  PlacedFrame,
  PlacedMessage,
  PlacedNote,
  PlacedParticipant,
  PlacedRow,
  ParticipantKind,
  Sequence,
  SequenceLayout,
  SequenceLegendOption,
  Statement,
} from './model.ts';

export interface SequenceLayoutOptions {
  maxWidth?: number;
  /** `false` removes the legend; an object renames the captions of the message kinds. */
  legend?: SequenceLegendOption;
}

interface Bar {
  col: number;
  level: number;
  y1: number;
}

interface FrameDraft {
  statement: number;
  index: number;
  block: PlacedFrame['block'];
  top: number;
  condition: string;
  tab: { text: string; w: number; h: number };
  /** Horizontal extent of everything inside, as inclusive coordinates. */
  lo: number;
  hi: number;
  dividers: Array<{ y: number; text: string }>;
}

interface MessageText {
  lines: string[];
  numText: string;
  /** Width of the number and the space after it. */
  numExtra: number;
  /** Width of the widest line, the first one including the number. */
  w: number;
}

interface Look {
  tone: SceneTone;
  dash: boolean;
  arrow: SceneArrow;
}

/** Radius of the ring at the start of a message line, which only the card theme shows. */
const PORT_R = 3.25;
/** Distance of a frame's label tag from the corner of the frame. */
const TAG_INSET = 8;

const LEGEND_KINDS: readonly LegendKind[] = ['call', 'reply', 'async', 'failed'];
const LEGEND_CAPTIONS: Record<LegendKind, string> = { call: 'Call', reply: 'Reply', async: 'Async', failed: 'Failed' };
const LEGEND_LOOKS: Record<LegendKind, Look> = {
  call: { tone: 'soft', dash: false, arrow: 'filled' },
  reply: { tone: 'muted', dash: true, arrow: 'filled' },
  async: { tone: 'muted', dash: true, arrow: 'open' },
  failed: { tone: 'muted', dash: true, arrow: 'cross' },
};

function lookOf(m: MessageStmt): Look {
  const kind: MessageKind = kindOf(m);
  if (kind === 'failed') return { tone: 'muted', dash: m.dashed, arrow: 'cross' };
  if (kind === 'async') return { tone: 'muted', dash: m.dashed, arrow: 'open' };
  if (kind === 'plain') return { tone: m.dashed ? 'muted' : 'soft', dash: m.dashed, arrow: 'none' };
  return LEGEND_LOOKS[kind];
}

/**
 * Roles of a message line in the themed drawing. Only a filled head comes from the theme; the open head of an
 * async message is drawn by {@link openHead}, so that it differs from the head of a call in every theme that fills heads.
 */
function lineRoles(look: Look, both = false): string[] {
  const filled = look.arrow === 'filled';
  return ['edge', 'edge--msg', ...(filled ? ['edge--arrow'] : []), ...(filled && both ? ['edge--arrow-start'] : []), ...(look.dash ? ['edge--pending'] : [])];
}

/** Length and half width of the open head of an async message. */
const OPEN_HEAD_L = 8;
const OPEN_HEAD_W = 4;

/** The two strokes of an open head whose tip is at `x`, pointing in direction `dir` (1 right, -1 left). */
function openHead(x: number, y: number, dir: number): SceneItem {
  return {
    kind: 'line',
    points: [
      { x: x - dir * OPEN_HEAD_L, y: y - OPEN_HEAD_W },
      { x, y },
      { x: x - dir * OPEN_HEAD_L, y: y + OPEN_HEAD_W },
    ],
    radius: 0,
    role: ['edge', 'edge--msg'],
  };
}

/**
 * The one stroke of a half head whose tip is at `x`, pointing in direction `dir`: the stroke of {@link openHead} that
 * bends above the line (`top`, smaller y) or below it (`bottom`).
 */
function halfHead(x: number, y: number, dir: number, side: 'top' | 'bottom'): SceneItem {
  return {
    kind: 'line',
    points: [
      { x, y },
      { x: x - dir * OPEN_HEAD_L, y: side === 'top' ? y - OPEN_HEAD_W : y + OPEN_HEAD_W },
    ],
    role: ['edge', 'edge--msg'],
  };
}

/** The open head of a message, or its single stroke for a half arrow. */
function openOrHalf(x: number, y: number, dir: number, half: MessageStmt['half']): SceneItem {
  return half === undefined ? openHead(x, y, dir) : halfHead(x, y, dir, half);
}

/** Radius of the dot where a `()` message joins a lifeline. */
const DOT_R = 4;
/** Half size of the cross that ends a destroyed lifeline. */
const DESTROY_HALF = 8;

/** The two strokes of a cross that ends a failed message, centred on `x`, the end of the line. */
function crossMark(x: number, y: number, half = 4): SceneItem[] {
  const stroke = (y1: number, y2: number): SceneItem => ({
    kind: 'line',
    points: [
      { x: x - half, y: y + y1 },
      { x: x + half, y: y + y2 },
    ],
    role: ['edge', 'edge--msg'],
  });
  return [stroke(-half, half), stroke(half, -half)];
}

/** Sizes of the participant symbols, in pixels. A symbol sits above its name, {@link NAME_GAP} apart. */
const NAME_GAP = 8;
const CIRCLE = 32;
/** Height of each symbol that has a name below it. */
const SYMBOL_HEIGHT: Partial<Record<ParticipantKind, number>> = {
  actor: 48,
  boundary: CIRCLE,
  control: CIRCLE + 4,
  entity: CIRCLE,
  database: 44,
};
/** Horizontal reach of each symbol from its lifeline, to the left and to the right. */
const SYMBOL_REACH: Partial<Record<ParticipantKind, readonly [number, number]>> = {
  actor: [12, 12],
  boundary: [CIRCLE / 2 + 12, CIRCLE / 2],
  control: [CIRCLE / 2, CIRCLE / 2],
  entity: [CIRCLE / 2, CIRCLE / 2],
  database: [20, 20],
};
/** The back box of `collections` is shifted right and up by this much. */
const STACK_STEP = 8;
/** Padding of a `box` group around its participants, and the height of the band that holds its label. */
const GROUP_PAD = 12;
const GROUP_FOOT = 12;

const DATABASE_W = 40;
const DATABASE_CAP = 8;
const QUEUE_CAP = 8;

const fmt = (v: number): string => String(Math.round(v * 100) / 100);

/** Path data of an actor's body, arms and legs below a head circle of diameter 16; `y` is the top of the figure. */
function actorStrokes(cx: number, y: number): string {
  return [
    `M${fmt(cx)} ${fmt(y + 16)}V${fmt(y + 32)}`,
    `M${fmt(cx - 12)} ${fmt(y + 20)}H${fmt(cx + 12)}`,
    `M${fmt(cx)} ${fmt(y + 32)}L${fmt(cx - 8)} ${fmt(y + 48)}`,
    `M${fmt(cx)} ${fmt(y + 32)}L${fmt(cx + 8)} ${fmt(y + 48)}`,
  ].join('');
}

/** Boundary: a bar 12 to the left of the circle, joined to it by a short line. */
function boundaryStrokes(cx: number, y: number): string {
  const bar = cx - CIRCLE / 2 - 12;
  return `M${fmt(bar)} ${fmt(y)}V${fmt(y + CIRCLE)}M${fmt(bar)} ${fmt(y + CIRCLE / 2)}H${fmt(cx - CIRCLE / 2)}`;
}

/** Control: an arrowhead 8 wide on top of the circle, pointing left; the circle starts 4 below `y`. */
function controlStrokes(cx: number, y: number): string {
  return `M${fmt(cx + 4)} ${fmt(y)}L${fmt(cx - 4)} ${fmt(y + 4)}L${fmt(cx + 4)} ${fmt(y + 8)}`;
}

/** Entity: a line as wide as the circle directly below it. */
function entityStrokes(cx: number, y: number): string {
  return `M${fmt(cx - CIRCLE / 2)} ${fmt(y + CIRCLE)}H${fmt(cx + CIRCLE / 2)}`;
}

/** Database: a cylinder with a lid, drawn as one closed outline plus the front edge of the lid. */
function databasePath(cx: number, y: number, h: number): string {
  const rx = DATABASE_W / 2;
  const ry = DATABASE_CAP / 2;
  const [x0, x1] = [cx - rx, cx + rx];
  return (
    `M${fmt(x0)} ${fmt(y + ry)}A${rx} ${ry} 0 0 1 ${fmt(x1)} ${fmt(y + ry)}V${fmt(y + h - ry)}` +
    `A${rx} ${ry} 0 0 1 ${fmt(x0)} ${fmt(y + h - ry)}Z` +
    `M${fmt(x0)} ${fmt(y + ry)}A${rx} ${ry} 0 0 0 ${fmt(x1)} ${fmt(y + ry)}`
  );
}

/** Queue: a cylinder lying on its side between `x0` and `x1`, its lid on the right. */
function queuePath(x0: number, x1: number, y: number, h: number): string {
  const rx = QUEUE_CAP / 2;
  const ry = h / 2;
  return (
    `M${fmt(x0 + rx)} ${fmt(y)}H${fmt(x1 - rx)}A${rx} ${ry} 0 0 1 ${fmt(x1 - rx)} ${fmt(y + h)}` +
    `H${fmt(x0 + rx)}A${rx} ${ry} 0 0 1 ${fmt(x0 + rx)} ${fmt(y)}Z` +
    `M${fmt(x1 - rx)} ${fmt(y)}A${rx} ${ry} 0 0 0 ${fmt(x1 - rx)} ${fmt(y + h)}`
  );
}

function wrapLine(line: string, cap: number, measure: (s: string) => number): string[] {
  if (cap === Infinity || measure(line) <= cap) return [line];
  const out: string[] = [];
  let cur = '';
  for (const word of line.split(/\s+/).filter((w) => w !== '')) {
    const next = cur === '' ? word : `${cur} ${word}`;
    if (cur === '' || measure(next) <= cap) cur = next;
    else {
      out.push(cur);
      cur = word;
    }
  }
  if (cur !== '') out.push(cur);
  return out;
}

/** All lines that may be wrapped, with the text role they are measured in. */
function wrappable(seq: Sequence): Array<{ line: string; role: TextRole }> {
  const out: Array<{ line: string; role: TextRole }> = [];
  for (const s of seq.statements) {
    if (s.kind === 'message') for (const line of s.lines) out.push({ line, role: 'edge' });
    else if (s.kind === 'note') for (const line of s.lines) out.push({ line, role: 'line' });
  }
  for (const p of seq.participants) for (const line of p.lines) out.push({ line, role: 'title' });
  return out;
}

function build(source: Sequence, R: Ruler, cap: number, tight: boolean, legendOption: SequenceLegendOption | undefined): SequenceLayout {
  // Participant names wrap at the same cap as the texts, so one long name does not hold every lifeline apart.
  const seq: Sequence = Number.isFinite(cap)
    ? { ...source, participants: source.participants.map((p) => ({ ...p, lines: p.lines.flatMap((l) => wrapLine(l, cap, (t) => R.textWidth(t, 'title'))) })) }
    : source;
  const S = R.sequence;
  const g = R.grid;
  const up = (v: number): number => Math.ceil(v / g - 1e-9) * g;
  const up2 = (v: number): number => Math.ceil(v / (2 * g) - 1e-9) * (2 * g);
  const down = (v: number): number => Math.floor(v / g + 1e-9) * g;
  const widest = (lines: string[], role: TextRole): number => Math.max(0, ...lines.map((l) => R.textWidth(l, role)));
  const margin = S.margin;
  const n = seq.participants.length;
  const col = new Map(seq.participants.map((p, i) => [p.id, i] as const));
  const colOf = (id: string): number => col.get(id) ?? 0;
  const lhE = R.lineHeight('edge');
  const lhL = R.lineHeight('line');
  const lhT = R.lineHeight('title');

  // Header boxes share one width.
  const headerLabelW = Math.max(0, ...seq.participants.map((p) => widest(p.lines, 'title')));
  const hw = up2(Math.max(S.headMinW, headerLabelW + S.headPadX)) + S.stroke;
  const half = (hw - S.stroke) / 2;
  // Symbols (actor, boundary, ...) exist only in the pixel drawing; the terminal ruler keeps boxes.
  const symbols = !R.terminal;
  const symbolOf = (k: ParticipantKind): number | undefined => (symbols ? SYMBOL_HEIGHT[k] : undefined);
  const boxLines = Math.max(1, ...seq.participants.filter((p) => symbolOf(p.kind) === undefined).map((p) => p.lines.length));
  const boxH = up(S.headH + (boxLines - 1) * lhT);
  // The header area is as high as the tallest participant; every lifeline starts at its bottom.
  const extentOf = (p: (typeof seq.participants)[number]): number => {
    const sym = symbolOf(p.kind);
    if (sym !== undefined) return sym + NAME_GAP + p.lines.length * lhT;
    return symbols && p.kind === 'collections' ? boxH + STACK_STEP : boxH;
  };
  const created = new Set(seq.statements.flatMap((st) => (st.kind === 'message' && st.creates ? [st.to] : [])));
  const headH = up(Math.max(boxH, ...seq.participants.filter((p) => !created.has(p.id)).map(extentOf)));
  // `box` groups: a band above the headers holds their labels. The terminal ruler draws no groups.
  const groups = symbols ? (seq.groups ?? []).filter((gr) => gr.members.some((m) => col.has(m))) : [];
  const groupOf = new Map(groups.flatMap((gr, k) => gr.members.map((m) => [m, k] as const)));
  const groupBand = groups.length > 0 ? up(GROUP_PAD + lhT + NAME_GAP) : 0;
  const headerTop = margin + groupBand;
  const headerBottom = headerTop + headH;
  const hb = down(S.barW / 2);

  // Deepest activation, for the room a self message needs beside its lifeline.
  let maxDepth = 0;
  {
    const d = new Array<number>(n).fill(0);
    const bump = (c: number, by: number): void => {
      d[c] = Math.max(0, (d[c] ?? 0) + by);
      maxDepth = Math.max(maxDepth, d[c] ?? 0);
    };
    for (const s of seq.statements) {
      if (s.kind === 'activate') bump(colOf(s.who), 1);
      else if (s.kind === 'deactivate') bump(colOf(s.who), -1);
      else if (s.kind === 'message') {
        if (s.activate) bump(colOf(s.to), 1);
        if (s.deactivate) bump(colOf(s.from), -1);
      }
    }
  }
  const barExtra = maxDepth > 0 ? S.barW + (maxDepth - 1) * S.barNest : S.stroke;

  // Texts, wrapped.
  const messageText = new Map<number, MessageText>();
  const noteLines = new Map<number, string[]>();
  const notePad = 2 * (S.notePadX + R.nodeBorder);
  const noteBoxCap = (s: NoteStmt): number => {
    const a = colOf(s.anchors[0] ?? '');
    const edge = (s.side === 'right' && a === n - 1) || (s.side === 'left' && a === 0);
    if (edge) return Math.max(S.noteMinW, half - S.noteGap - hb);
    if (s.side === 'over' && s.anchors.length === 1 && (a === 0 || a === n - 1)) return Math.max(S.noteMinW, hw);
    return Infinity;
  };
  const wrapNote = (s: NoteStmt, boxCap: number): string[] =>
    s.lines.flatMap((l) => wrapLine(l, Math.min(cap, boxCap - notePad), (t) => R.textWidth(t, 'line')));
  seq.statements.forEach((s, i) => {
    if (s.kind === 'message') {
      const lines = s.lines.flatMap((l) => wrapLine(l, cap, (t) => R.textWidth(t, 'edge')));
      const numText = s.number === undefined ? '' : String(s.number).padStart(2, '0');
      if (lines.length === 0 && numText !== '') lines.push('');
      const numExtra = numText === '' ? 0 : R.textWidth(numText, 'edge') + S.numGap;
      const w = Math.max(0, ...lines.map((l, k) => R.textWidth(l, 'edge') + (k === 0 ? numExtra : 0)));
      messageText.set(i, { lines, numText, numExtra, w });
    } else if (s.kind === 'note' && !(s.side === 'over' && s.anchors.length === 2)) {
      noteLines.set(i, wrapNote(s, noteBoxCap(s)));
    }
  });
  const noteSize = (lines: string[]): { w: number; h: number } => ({
    w: widest(lines, 'line') + notePad,
    h: up(Math.max(1, lines.length) * lhL + 2 * S.notePadY + 2 * R.nodeBorder),
  });

  // One pitch for all lifelines: wide enough for the headers and for every label inside its own span.
  let pitch = hw + (tight ? S.pitchGapTight : S.pitchGap);
  const fit = (need: number, span: number): void => {
    pitch = Math.max(pitch, Math.ceil(need / span - 1e-9));
  };
  seq.statements.forEach((s, i) => {
    if (s.kind === 'message') {
      const a = colOf(s.from);
      const b = colOf(s.to);
      const w = messageText.get(i)?.w ?? 0;
      if (a !== b) {
        // A created header takes half a header of the span; the label sits in what is left.
        if (w > 0) fit(w + S.labelPad + (s.creates ? half : 0), Math.abs(a - b));
      } else if (a + 1 < n) {
        fit(barExtra + S.loopW + (w > 0 ? S.loopGap + w + S.labelPad / 2 : 0), 1);
      }
    } else if (s.kind === 'note') {
      const a = colOf(s.anchors[0] ?? '');
      const lines = noteLines.get(i);
      if (!lines) return;
      const w = up(noteSize(lines).w);
      if ((s.side === 'right' && a + 1 < n) || (s.side === 'left' && a > 0)) fit(barExtra + 2 * S.noteGap + w, 1);
    }
  });
  // Neighbours in different groups keep a gap between the two bands.
  for (let i = 0; i + 1 < n; i++) {
    const ga = groupOf.get(seq.participants[i]?.id ?? '');
    const gb = groupOf.get(seq.participants[i + 1]?.id ?? '');
    if (ga !== gb) fit(hw + (ga === undefined || gb === undefined ? 1 : 2) * GROUP_PAD + S.pitchGapTight, 1);
  }
  pitch = up2(pitch);
  const xs = seq.participants.map((_, i) => i * pitch);
  const mid = (a: number, b: number): number => ((xs[a] ?? 0) + (xs[b] ?? 0)) / 2;

  // Notes over two participants wrap against the header extent, which is known now.
  seq.statements.forEach((s, i) => {
    if (s.kind !== 'note' || !(s.side === 'over' && s.anchors.length === 2)) return;
    const m = mid(colOf(s.anchors[0] ?? ''), colOf(s.anchors[1] ?? ''));
    const lo = (xs[0] ?? 0) - half;
    const hi = (xs[n - 1] ?? 0) + half;
    noteLines.set(i, wrapNote(s, Math.max(S.noteMinW, 2 * Math.min(m - lo, hi - m))));
  });

  // Item layers: paint order is lifelines, bars, label backings, frames, lines, boxes, texts.
  // Frames tint what lies under them, so a backing inside a frame takes on the tint.
  const backItems: SceneItem[] = [];
  const frameItems: SceneItem[] = [];
  const lifeItems: SceneItem[] = [];
  /** Bars with their nesting level; a nested bar is drawn over the one it sits on. */
  const barDrafts: Array<{ level: number; item: SceneItem }> = [];
  const lineItems: SceneItem[] = [];
  const boxItems: SceneItem[] = [];
  const textItems: SceneItem[] = [];

  let minX = Infinity;
  let maxX = -Infinity;
  const open: FrameDraft[] = [];
  const span = (x1: number, x2: number): void => {
    minX = Math.min(minX, x1, x2);
    maxX = Math.max(maxX, x1, x2);
  };
  const frameSpan = (x1: number, x2: number): void => {
    for (const f of open) {
      f.lo = Math.min(f.lo, x1, x2);
      f.hi = Math.max(f.hi, x1, x2);
    }
  };

  const placed: PlacedParticipant[] = [];
  // Paths are shifted by the final offset, which is only known at the end.
  const shifted = new Map<SceneItem, (dx: number) => SceneItem>();
  const later = (items: SceneItem[], make: (dx: number) => SceneItem): void => {
    const slot: SceneItem = { kind: 'path', d: '', role: [] };
    shifted.set(slot, make);
    items.push(slot);
  };
  /** Participants whose header appears with the message that creates them, instead of at the top. */
  const createdIds = created;
  const lifeStart = seq.participants.map(() => headerBottom);
  const lifeEnd: Array<number | undefined> = seq.participants.map(() => undefined);
  /** Draws the header of participant `i` with its bottom line at `bottomY`; returns the box it takes. */
  const drawHeader = (i: number, bottomY: number): Box => {
    const p = seq.participants[i];
    if (!p) return { x: 0, y: 0, w: 0, h: 0 };
    const lx = xs[i] ?? 0;
    const zoned = groupOf.has(p.id);
    const boxRole = zoned ? ['box', 'box--in-zone'] : ['box'];
    const data = { participant: p.id };
    const nameH = p.lines.length * lhT;
    const sym = symbolOf(p.kind);
    const line = (top: number, k: number, text: string): SceneItem => ({
      kind: 'text', x: lx, y: top + k * lhT + lhT / 2, text, anchor: 'middle', font: 'title', tone: 'fg', role: ['name'],
    });
    if (sym !== undefined) {
      // Symbol above, name below on the bottom line.
      const nameTop = bottomY - nameH;
      const top = nameTop - NAME_GAP - sym;
      span(lx - half, lx + half - S.stroke);
      const ring = (cy: number): SceneItem => ({ kind: 'circle', cx: lx, cy, r: CIRCLE / 2, role: ['edge'], data });
      const strokes = (d: (dx: number) => string): void =>
        later(boxItems, (dx) => ({ kind: 'path', d: d(dx), role: ['edge'], data }));
      if (p.kind === 'actor') {
        boxItems.push({ kind: 'circle', cx: lx, cy: top + 8, r: 8, role: ['edge'], data });
        strokes((dx) => actorStrokes(lx + dx, top));
      } else if (p.kind === 'boundary') {
        boxItems.push(ring(top + CIRCLE / 2));
        strokes((dx) => boundaryStrokes(lx + dx, top));
      } else if (p.kind === 'control') {
        boxItems.push(ring(top + 4 + CIRCLE / 2));
        strokes((dx) => controlStrokes(lx + dx, top));
      } else if (p.kind === 'entity') {
        boxItems.push(ring(top + CIRCLE / 2));
        strokes((dx) => entityStrokes(lx + dx, top));
      } else {
        later(boxItems, (dx) => ({ kind: 'path', d: databasePath(lx + dx, top, sym), role: boxRole, data }));
      }
      p.lines.forEach((l, k) => textItems.push(line(nameTop, k, l)));
      return { x: lx - half, y: top, w: hw, h: bottomY - top };
    }
    // Boxes sit on the bottom line, so that they touch their lifeline.
    const front: Box = { x: lx - half, y: bottomY - boxH, w: hw, h: boxH };
    const style = p.kind === 'actor' ? 'actor' : 'box';
    if (symbols && p.kind === 'collections') {
      span(front.x, front.x + hw - S.stroke + STACK_STEP);
      // The back box takes a dashed edge, so that the stack shows in the themes whose boxes have no edge.
      boxItems.push({ kind: 'box', style: 'box', x: front.x + STACK_STEP, y: front.y - STACK_STEP, w: hw, h: boxH, role: [...boxRole, 'box--pending'], data });
      boxItems.push({ kind: 'box', style: 'box', ...front, role: boxRole, data });
    } else if (symbols && p.kind === 'queue') {
      span(front.x, front.x + hw - S.stroke);
      later(boxItems, (dx) => ({ kind: 'path', d: queuePath(front.x + dx, front.x + dx + hw, front.y, boxH), role: boxRole, data }));
    } else {
      span(front.x, front.x + hw - S.stroke);
      boxItems.push({ kind: 'box', style, ...front, role: boxRole, data });
    }
    p.lines.forEach((l, k) => textItems.push(line(front.y + (boxH - nameH) / 2, k, l)));
    return front;
  };
  /** How far a created header reaches from its lifeline towards a message coming from the left (`dir` 1) or the right. */
  const reachOf = (i: number, dir: number): number => {
    const k = seq.participants[i]?.kind ?? 'participant';
    const sym = symbolOf(k);
    if (sym !== undefined) return SYMBOL_REACH[k]?.[dir > 0 ? 0 : 1] ?? half;
    return dir < 0 && symbols && k === 'collections' ? half + STACK_STEP : half;
  };
  seq.participants.forEach((p, i) => {
    const lx = xs[i] ?? 0;
    if (createdIds.has(p.id)) {
      placed.push({ id: p.id, x: lx, box: { x: lx - half, y: headerTop, w: hw, h: 0 } });
      return;
    }
    drawHeader(i, headerBottom);
    placed.push({ id: p.id, x: lx, box: { x: lx - half, y: headerTop, w: hw, h: headH } });
  });

  const bars: Bar[][] = seq.participants.map(() => []);
  const lastInvolved = new Array<number>(n).fill(-Infinity);
  const pending: number[] = [];
  const ext = (c: number): { left: number; right: number } => {
    const lx = xs[c] ?? 0;
    const d = bars[c]?.length ?? 0;
    if (d === 0) return { left: lx, right: lx + S.stroke };
    return { left: lx - hb, right: lx - hb + (d - 1) * S.barNest + S.barW };
  };
  /** Closes a bar; `last` is the last coordinate it covers. */
  const closeBar = (bar: Bar, last: number): void => {
    const lx = xs[bar.col] ?? 0;
    barDrafts.push({
      level: bar.level,
      item: {
        kind: 'box',
        style: 'bar',
        role: ['active'],
        x: lx - hb + bar.level * S.barNest,
        y: bar.y1,
        w: S.barW,
        h: Math.max(g, up(last - bar.y1 + S.stroke)),
      },
    });
  };
  const openBar = (c: number, y: number): void => {
    const stack = bars[c];
    if (stack) stack.push({ col: c, level: stack.length, y1: y });
  };

  // Highlight zones (`rect` blocks): each runs from where it opens to where it closes, across the whole drawing.
  const zoneOpen: number[] = [];
  const zones: Array<{ top: number; bottom: number; depth: number }> = [];
  const zonePad = Math.min(8, Math.floor(S.gapMsg / 2));
  let zoneEnd = -Infinity;
  /** A label backing takes the colour of the zone it lies in, or the page. */
  // A nested highlight is painted in the plain zone colour, which is the page colour in every theme.
  const groupSpans = groups.map((gr) => {
    const cols = gr.members.flatMap((m) => (col.has(m) ? [colOf(m)] : []));
    const lo = Math.min(...cols.map((c) => xs[c] ?? 0)) - half - GROUP_PAD;
    const stacked = cols.some((c) => seq.participants[c]?.kind === 'collections');
    let hi = Math.max(...cols.map((c) => xs[c] ?? 0)) + half - S.stroke + GROUP_PAD + (stacked ? STACK_STEP : 0);
    // The label stays inside its band.
    hi = Math.max(hi, lo + up(R.textWidth(gr.label, 'title') + 2 * GROUP_PAD));
    return { lo, hi, label: gr.label };
  });
  for (const gs of groupSpans) span(gs.lo, gs.hi);
  const onZone = (x: number): boolean => (zoneOpen.length > 0 ? (zoneOpen.length - 1) % 2 === 0 : groupSpans.some((gs) => x >= gs.lo && x <= gs.hi));
  const backRole = (x: number): string[] => (onZone(x) ? ['zone-face'] : ['bg']);

  const rows: PlacedRow[] = [];
  const messages: PlacedMessage[] = [];
  const notes: PlacedNote[] = [];
  const frames: PlacedFrame[] = [];
  const kindsUsed = new Set<MessageKind>();
  /** Whether the first message of each kind is dashed; the legend sample follows it. */
  const kindDash = new Map<MessageKind, boolean>();
  /** The head of the first message of each kind, when it is a half arrow; the legend sample follows it. */
  const kindHalf = new Map<MessageKind, Pick<MessageStmt, 'half' | 'reverse'>>();
  let messageIndex = 0;
  let frameIndex = 0;
  let cursor = headerBottom;
  let last: 'header' | 'message' | 'note' | 'open' | 'branch' | 'close' = 'header';
  const inline = S.condH === 0;

  const gapFor = (next: 'message' | 'note' | 'open' | 'branch'): number => {
    if (last === 'open' || last === 'branch') return S.gapHead;
    if (last === 'close') return S.gapFrame;
    if (last === 'note' && next === 'message') return S.gapNote;
    if (next === 'open' || next === 'branch') return S.gapFrame;
    return last === 'header' ? S.gapFirst : S.gapMsg;
  };
  const tabOf = (text: string): FrameDraft['tab'] => ({
    text,
    w: Math.max(S.tabW, up(R.textWidth(text, 'lane') * S.tabScale + text.length * S.tabSpacing + 2 * S.tabPad)),
    h: S.tabH,
  });
  const captionW = (text: string): number => R.textWidth(text, 'edge') * S.captionScale;
  /** A caption line with a backing so that lifelines never strike through it. */
  const caption = (x: number, cy: number, text: string): void => {
    const w = captionW(text);
    const bx = down(x - S.labelBgPad);
    const by = down(cy - S.condH / 2);
    backItems.push({ kind: 'box', style: 'label', role: backRole(x + w / 2), x: bx, y: by, w: up(x + w + S.labelBgPad) - bx, h: up(S.condH) });
    textItems.push({ kind: 'text', x, y: cy, text, anchor: 'start', font: 'caption', tone: 'muted', role: ['label'] });
  };

  /** A caption on the border row of a frame (cell drawings): the backing keeps a space on both sides. */
  const inlineCaption = (x: number, cy: number, text: string): void => {
    const w = Math.ceil(captionW(text));
    boxItems.push({ kind: 'box', style: 'label', role: backRole(x + w / 2), x: x - S.labelBgPad, y: down(cy), w: w + 2 * S.labelBgPad, h: g });
    textItems.push({ kind: 'text', x, y: cy, text, anchor: 'start', font: 'caption', tone: 'muted', role: ['label'] });
  };

  /** Draws a message label on a backing; `x` is its centre or its left end. */
  const emitLabel = (info: MessageText, x: number, anchor: 'middle' | 'start', top: number, tone: SceneTone, idx: number): Box => {
    const left = anchor === 'middle' ? x - info.w / 2 : x;
    const bx = down(left - S.labelBgPad);
    const box: Box = { x: bx, y: top, w: up(left + info.w + S.labelBgPad) - bx, h: info.lines.length * lhE };
    backItems.push({ kind: 'box', style: 'label', role: backRole(box.x + box.w / 2), ...box });
    const data = { message: String(idx) };
    info.lines.forEach((line, k) => {
      const cy = top + k * lhE + lhE / 2;
      if (k === 0 && info.numText !== '') {
        const sx = anchor === 'middle' ? x - (info.numExtra + R.textWidth(line, 'edge')) / 2 : x;
        textItems.push({ kind: 'text', x: sx, y: cy, text: info.numText, anchor: 'start', font: 'num', tone: 'fg', role: ['label'], data });
        if (line !== '') textItems.push({ kind: 'text', x: sx + info.numExtra, y: cy, text: line, anchor: 'start', font: 'label', tone, role: ['body'], data });
      } else {
        textItems.push({ kind: 'text', x, y: cy, text: line, anchor, font: 'label', tone, role: ['body'], data });
      }
    });
    return box;
  };

  // An `activate` right after a message that involves the participant starts the bar at that message, like `+`.
  const attached = new Map<number, number[]>();
  const attachedAt = new Set<number>();
  seq.statements.forEach((st, i) => {
    if (st.kind !== 'message') return;
    for (let j = i + 1; j < seq.statements.length; j++) {
      const next = seq.statements[j];
      if (next?.kind !== 'activate' || (next.who !== st.from && next.who !== st.to)) break;
      attachedAt.add(j);
      attached.set(i, [...(attached.get(i) ?? []), colOf(next.who)]);
    }
  });

  seq.statements.forEach((s: Statement, si) => {
    switch (s.kind) {
      case 'message': {
        const info = messageText.get(si) ?? { lines: [], numText: '', numExtra: 0, w: 0 };
        const a = colOf(s.from);
        const b = colOf(s.to);
        const nl = info.lines.length;
        const self = a === b;
        const look = lookOf(s);
        const kind = kindOf(s);
        kindsUsed.add(kind);
        if (!kindDash.has(kind)) {
          kindDash.set(kind, look.dash);
          if (s.half !== undefined) kindHalf.set(kind, { half: s.half, ...(s.reverse ? { reverse: true } : {}) });
        }
        const gap = gapFor('message');
        const loopSpan = S.loopH + S.stroke;
        let lineY = cursor + gap + (self ? 1 : Math.max(1, nl)) * lhE + S.labelDrop;
        const off = self ? down((loopSpan - nl * lhE) / 2) : 0;
        if (self && nl > 0 && off < 0) lineY = Math.max(lineY, cursor + gap - off);
        // A created header is centred on the message line, so the line goes down far enough to make room for it.
        const createdSym = s.creates && !self ? symbolOf(seq.participants[b]?.kind ?? 'participant') : undefined;
        const createdUpper = !s.creates || self ? 0 : createdSym !== undefined ? createdSym / 2 : boxH / 2;
        if (createdUpper > 0 && lineY - createdUpper < cursor + gap) {
          const lift = up(cursor + gap + createdUpper) - lineY;
          lineY += lift;
        }
        const labelTop = self ? lineY + off : lineY - S.labelDrop - nl * lhE;
        let rowTop = nl > 0 ? Math.min(labelTop, lineY) : lineY;
        for (const c of pending.splice(0)) openBar(c, lineY);
        if (s.activate) openBar(b, lineY);
        for (const c of attached.get(si) ?? []) openBar(c, lineY);
        lastInvolved[a] = lineY;
        lastInvolved[b] = lineY;
        const lx1 = xs[a] ?? 0;
        const lx2 = xs[b] ?? 0;
        let label: Box | undefined;
        let createdBottom = -Infinity;
        const data = { message: String(messageIndex), from: s.from, to: s.to, kind };
        let after: number;
        if (self) {
          const e = ext(a);
          const xv = e.right + S.loopW - S.stroke;
          lineItems.push({
            kind: 'line',
            points: [
              { x: e.right, y: lineY },
              { x: xv, y: lineY },
              { x: xv, y: lineY + S.loopH },
              { x: e.right, y: lineY + S.loopH },
            ],
            tone: look.tone,
            dash: look.dash,
            // The corner radius comes from the theme, except in the cell drawing, which has none.
            ...(S.loopR === 0 ? { radius: 0 } : {}),
            arrow: s.reverse ? 'none' : look.arrow,
            role: lineRoles(look),
            data,
          });
          // A reversed half arrow ends at its start, where the head takes the place of the ring.
          if (!s.reverse) lineItems.push({ kind: 'circle', cx: e.right, cy: lineY, r: PORT_R, role: ['port', 'port--msg'] });
          if (look.arrow === 'cross') lineItems.push(...crossMark(e.right, lineY + S.loopH));
          if (look.arrow === 'open') lineItems.push(openOrHalf(e.right, s.reverse ? lineY : lineY + S.loopH, -1, s.half));
          span(e.left, xv);
          let right = Math.max(lx1 + half, xv);
          if (nl > 0) {
            label = emitLabel(info, xv + S.stroke + S.loopGap, 'start', labelTop, look.tone, messageIndex);
            span(label.x, label.x + label.w - S.stroke);
            right = Math.max(right, label.x + label.w - S.stroke);
          }
          frameSpan(lx1 - S.framePad, right);
          after = Math.max(lineY + loopSpan, nl > 0 ? labelTop + nl * lhE : 0);
        } else {
          const dir = lx2 > lx1 ? 1 : -1;
          const ea = ext(a);
          const eb = ext(b);
          let x1 = dir > 0 ? ea.right : ea.left - S.stroke;
          let x2 = dir > 0 ? eb.left - S.stroke : eb.right;
          // What ends the line at the receiver: a created header, a destroy cross, a centre dot, or the lifeline.
          const endsAtCross = !!s.destroysTo;
          if (createdUpper > 0) x2 = lx2 - dir * reachOf(b, dir);
          else if (endsAtCross) x2 = lx2 - dir * (DESTROY_HALF + 4);
          else if (s.centreTo) x2 = lx2 - dir * DOT_R;
          else if (look.arrow === 'cross') x2 -= dir * S.failGap;
          if (s.destroysFrom) x1 = lx1 + dir * (DESTROY_HALF + 4);
          else if (s.centreFrom) x1 = lx1 + dir * DOT_R;
          lineItems.push({
            kind: 'line',
            points: [
              { x: x1, y: lineY },
              { x: x2, y: lineY },
            ],
            tone: look.tone,
            dash: look.dash,
            arrow: s.reverse ? 'none' : look.arrow,
            role: lineRoles(look, s.both),
            data,
          });
          if (!s.centreFrom && !s.destroysFrom && !s.reverse) lineItems.push({ kind: 'circle', cx: x1, cy: lineY, r: PORT_R, role: ['port', 'port--msg'] });
          if (look.arrow === 'cross' && !endsAtCross) lineItems.push(...crossMark(x2, lineY));
          if (look.arrow === 'open') lineItems.push(s.reverse ? openOrHalf(x1, lineY, -dir, s.half) : openOrHalf(x2, lineY, dir, s.half));
          if (s.centreFrom) lineItems.push({ kind: 'circle', cx: lx1, cy: lineY, r: DOT_R, role: ['dot'], data });
          if (s.centreTo) lineItems.push({ kind: 'circle', cx: lx2, cy: lineY, r: DOT_R, role: ['dot'], data });
          const ends: Array<[boolean | undefined, number, number]> = [
            [s.destroysFrom, a, lx1],
            [s.destroysTo, b, lx2],
          ];
          for (const [gone, c, x] of ends) {
            if (!gone) continue;
            lineItems.push(...crossMark(x, lineY, DESTROY_HALF));
            lifeEnd[c] = lineY;
          }
          if (createdUpper > 0) {
            const nameH = (seq.participants[b]?.lines.length ?? 1) * lhT;
            const bottomY = createdSym !== undefined ? lineY + createdSym / 2 + NAME_GAP + nameH : lineY + boxH / 2;
            const head = drawHeader(b, bottomY);
            const at = placed[b];
            if (at) placed[b] = { ...at, box: head };
            lifeStart[b] = bottomY;
            frameSpan(head.x, head.x + head.w - S.stroke);
            rowTop = Math.min(rowTop, head.y);
            createdBottom = bottomY;
          }
          span(Math.min(ea.left, eb.left), Math.max(ea.right, eb.right) - S.stroke);
          span(x1, x2);
          frameSpan(Math.min(lx1, lx2) - S.framePad, Math.max(lx1, lx2) + S.framePad);
          if (nl > 0) {
            const first = (lx1 + (xs[a + dir] ?? lx2)) / 2;
            const cx = createdUpper > 0 && a + dir === b ? (x1 + x2) / 2 : info.w + S.labelPad <= pitch ? first : (lx1 + lx2) / 2;
            label = emitLabel(info, cx, 'middle', labelTop, look.tone, messageIndex);
            span(label.x, label.x + label.w - S.stroke);
          }
          after = Math.max(lineY + S.stroke, createdBottom);
        }
        if (s.deactivate) {
          const bar = bars[a]?.pop();
          if (bar) closeBar(bar, lineY);
        }
        messages.push({
          index: messageIndex,
          from: s.from,
          to: s.to,
          fromX: lx1,
          toX: lx2,
          kind,
          y: lineY,
          self,
          ...(label ? { label } : {}),
        });
        messageIndex++;
        rows.push({ statement: si, y: rowTop, h: after - rowTop });
        cursor = after;
        last = 'message';
        break;
      }
      case 'note': {
        const lines = noteLines.get(si) ?? [];
        const a = colOf(s.anchors[0] ?? '');
        const lx = xs[a] ?? 0;
        const sz = noteSize(lines);
        let bx: number;
        let bw: number;
        if (s.side === 'right') {
          bw = up(sz.w);
          bx = ext(a).right + S.noteGap;
        } else if (s.side === 'left') {
          bw = up(sz.w);
          bx = ext(a).left - S.noteGap - bw;
        } else if (s.anchors.length === 1) {
          bw = up2(sz.w) + S.stroke;
          bx = lx - (bw - S.stroke) / 2;
        } else {
          const b = colOf(s.anchors[1] ?? '');
          const dist = Math.abs((xs[b] ?? 0) - lx);
          bw = up2(Math.max(sz.w, dist + 2 * S.noteGap)) + S.stroke;
          bx = mid(a, b) - (bw - S.stroke) / 2;
        }
        const top = cursor + gapFor('note');
        const box: Box = { x: bx, y: top, w: bw, h: sz.h };
        boxItems.push({ kind: 'box', style: 'note', role: onZone(box.x + box.w / 2) ? ['note', 'note--in-zone'] : ['note'], ...box, data: { note: String(notes.length) } });
        span(box.x, box.x + box.w - S.stroke);
        frameSpan(box.x, box.x + box.w - S.stroke);
        const nl = Math.max(1, lines.length);
        const textTop = box.y + R.nodeBorder + S.notePadY + (sz.h - 2 * R.nodeBorder - 2 * S.notePadY - nl * lhL) / 2;
        const centred = s.side === 'over';
        lines.forEach((line, k) =>
          textItems.push({
            kind: 'text',
            x: centred ? box.x + down(box.w / 2) : box.x + R.nodeBorder + S.notePadX,
            y: textTop + k * lhL + lhL / 2,
            text: line,
            anchor: centred ? 'middle' : 'start',
            font: 'body',
            tone: 'fg',
            role: ['sub'],
          }),
        );
        notes.push({ statement: si, box });
        rows.push({ statement: si, y: top, h: sz.h });
        cursor = top + sz.h;
        last = 'note';
        break;
      }
      case 'activate':
        if (!attachedAt.has(si)) pending.push(colOf(s.who));
        break;
      case 'deactivate': {
        const c = colOf(s.who);
        const k = pending.lastIndexOf(c);
        if (k >= 0) {
          pending.splice(k, 1);
          break;
        }
        const bar = bars[c]?.pop();
        // A bar that ends where a frame closes continues past the frame's bottom border.
        const past = last === 'close' ? S.barPastFrame : 0;
        if (bar) closeBar(bar, Math.max(bar.y1, cursor - S.stroke + past));
        break;
      }
      case 'open': {
        const top = cursor + gapFor('open');
        const text = s.lines.join(' ');
        const condition = text === '' ? '' : `[${text}]`;
        open.push({
          statement: si,
          index: frameIndex++,
          block: s.block,
          top,
          condition,
          tab: tabOf(s.block.toUpperCase()),
          lo: Infinity,
          hi: -Infinity,
          dividers: [],
        });
        const after = up(top + S.tabH + (condition !== '' && !inline ? S.condGap + S.condH : 0));
        rows.push({ statement: si, y: top, h: after - top });
        cursor = after;
        last = 'open';
        break;
      }
      case 'branch': {
        const f = open[open.length - 1];
        const y = cursor + gapFor('branch');
        const text = s.lines.join(' ');
        const condition = text === '' ? '' : `[${text}]`;
        f?.dividers.push({ y, text: condition });
        const after = up(y + S.stroke + (condition !== '' && !inline ? S.condGap + S.condH : 0));
        rows.push({ statement: si, y, h: after - y });
        cursor = after;
        last = 'branch';
        break;
      }
      case 'zoneOpen': {
        // A highlight starts in the gap below what comes before it; one that opens right inside another steps down.
        const parentTop = zoneOpen[zoneOpen.length - 1];
        let top = Math.max(cursor + zonePad, zoneEnd + 4);
        if (parentTop !== undefined && parentTop > cursor) {
          top = Math.max(top, parentTop + zonePad);
          cursor = top - zonePad;
        }
        zoneOpen.push(top);
        break;
      }
      case 'zoneClose': {
        const top = zoneOpen.pop();
        if (top === undefined) break;
        // A highlight that closes right after a nested one ends a step below it.
        let bottom = cursor + zonePad;
        if (zoneEnd >= bottom) {
          bottom = zoneEnd + zonePad;
          cursor = bottom - zonePad;
        }
        zones.unshift({ top, bottom, depth: zoneOpen.length });
        zoneEnd = Math.max(zoneEnd, bottom);
        break;
      }
      case 'close': {
        const f = open.pop();
        if (!f) break;
        const bottom = cursor + (last === 'close' ? S.frameInset : S.frameFoot);
        rows.push({ statement: si, y: cursor, h: bottom - cursor });
        cursor = bottom;
        last = 'close';
        let lo = f.lo;
        let hi = f.hi;
        if (!Number.isFinite(lo)) {
          lo = (xs[0] ?? 0) - half;
          hi = (xs[n - 1] ?? 0) + half;
        }
        const condW = f.condition === '' ? 0 : captionW(f.condition);
        const condNeed =
          condW === 0 ? 0 : inline ? S.tabGap + condW + S.tabPad : 2 * S.condInset + condW;
        const dividerNeed = Math.max(
          0,
          ...f.dividers.map((d) => (d.text === '' ? 0 : 2 * S.condInset + captionW(d.text) + (inline ? S.stroke : 0))),
        );
        const need = Math.max(inline ? f.tab.w + condNeed : Math.max(f.tab.w, condNeed), dividerNeed);
        const left = lo;
        const right = left + up(Math.max(hi, left + need - S.stroke) - left + S.stroke) - S.stroke;
        const box: PlacedFrame = {
          block: f.block,
          statement: f.statement,
          index: f.index,
          x: left,
          y: f.top,
          w: right - left + S.stroke,
          h: bottom - f.top,
          dividers: f.dividers.map((d) => d.y),
        };
        frames.push(box);
        frameItems.unshift({
          kind: 'box',
          style: 'frame',
          role: ['frame'],
          x: box.x,
          y: box.y,
          w: box.w,
          h: box.h,
          tab: f.tab,
          data: { block: f.block, frame: String(f.index) },
        });
        // The tag is as high as the grid allows: 20 on the pixel grid, where the layout reserves 18.
        const tagH = up(f.tab.h);
        boxItems.push({ kind: 'box', style: 'label', role: ['tag'], x: box.x + TAG_INSET, y: box.y + TAG_INSET, w: f.tab.w, h: tagH });
        textItems.push({
          kind: 'text',
          x: box.x + TAG_INSET + f.tab.w / 2,
          y: box.y + TAG_INSET + tagH / 2,
          text: f.tab.text,
          anchor: 'middle',
          font: 'caption',
          tone: 'muted',
          role: ['tag-text'],
        });
        if (f.condition !== '') {
          if (inline) inlineCaption(box.x + f.tab.w + S.tabGap, box.y + S.tabH / 2, f.condition);
          else caption(box.x + S.condInset, box.y + S.tabH + S.condGap + S.condH / 2, f.condition);
        }
        for (const d of f.dividers) {
          lineItems.push({
            kind: 'line',
            points: [
              { x: box.x + S.dividerInset, y: d.y },
              { x: right - S.dividerInset, y: d.y },
            ],
            role: ['frame-split'],
            dash: true,
          });
          if (d.text === '') continue;
          if (inline) inlineCaption(box.x + S.condInset, d.y + S.stroke / 2, d.text);
          else caption(box.x + S.condInset, d.y + S.condGap + S.condH / 2, d.text);
        }
        span(left, right);
        const parent = open[open.length - 1];
        if (parent) {
          parent.lo = Math.min(parent.lo, left - S.frameInset);
          parent.hi = Math.max(parent.hi, right + S.frameInset);
        }
        break;
      }
    }
  });

  for (const c of pending.splice(0)) openBar(c, cursor);
  seq.participants.forEach((_, c) => {
    for (const bar of (bars[c] ?? []).reverse()) closeBar(bar, Math.max(bar.y1, lastInvolved[c] ?? bar.y1) + S.barTail);
  });

  const bottom = cursor + S.tail;
  placed.forEach((p, i) => {
    lifeItems.push({
      kind: 'line',
      points: [
        { x: p.x, y: lifeStart[i] ?? headerBottom },
        { x: p.x, y: lifeEnd[i] ?? bottom - S.stroke },
      ],
      role: ['lifeline'],
      dash: true,
      data: { participant: p.id },
    });
  });

  // Highlights: a tinted band with a dashed edge, so that it reads apart from frames and notes in every theme.
  // Nested ones step in from both sides and alternate with the page colour.
  const zoneItems: SceneItem[] = zones.flatMap((z): SceneItem[] => {
    const inset = z.depth * zonePad;
    const rect = {
      x: (Number.isFinite(minX) ? minX : 0) + inset,
      y: z.top,
      w: Math.max(0, (Number.isFinite(minX) ? maxX - minX + S.stroke : 0) - 2 * inset),
      h: z.bottom - z.top,
    };
    return [
      { kind: 'box', style: 'frame', role: z.depth % 2 === 0 ? ['zone'] : ['zone', 'zone--plain'], ...rect },
      { kind: 'box', style: 'frame', role: ['zone', 'zone--dashed'], ...rect },
    ];
  });
  // `box` groups: a tinted band from the top margin to below the lifelines, its label in the band above the headers.
  const groupFoot = groups.length > 0 ? GROUP_FOOT : 0;
  const groupItems: SceneItem[] = groupSpans.flatMap((gs): SceneItem[] => [
    { kind: 'box', style: 'frame', role: ['zone'], x: gs.lo, y: margin, w: gs.hi - gs.lo + S.stroke, h: bottom + groupFoot - margin },
    ...(gs.label === ''
      ? []
      : [{ kind: 'text', x: gs.lo + GROUP_PAD, y: margin + GROUP_PAD + lhT / 2, text: gs.label, anchor: 'start', font: 'title', tone: 'fg', role: ['zone-name'] } satisfies SceneItem]),
  ]);
  const barItems = [...barDrafts].sort((a, b) => a.level - b.level).map((d) => d.item);
  const items: SceneItem[] = [...groupItems, ...zoneItems, ...lifeItems, ...barItems, ...backItems, ...frameItems, ...lineItems, ...boxItems, ...textItems];
  const left = Number.isFinite(minX) ? minX : 0;
  const right = Number.isFinite(maxX) ? maxX : 0;
  const dx = margin - left;
  let width = up(right - left + S.stroke + 2 * margin);

  // Legend: the kinds in use, when two or more are.
  const legend: SequenceLayout['legend'] = [];
  if (legendOption !== false) {
    const used = LEGEND_KINDS.filter((k) => kindsUsed.has(k));
    if (used.length >= 2) {
      for (const k of used) legend.push({ kind: k, caption: legendOption?.[k] ?? LEGEND_CAPTIONS[k] });
    }
  }
  const sceneItems: SceneItem[] = items.map((it): SceneItem => {
    if (it.kind === 'line') return { ...it, points: it.points.map((p) => ({ x: p.x + dx, y: p.y })) };
    if (it.kind === 'circle') return { ...it, cx: it.cx + dx };
    if (it.kind === 'path') return shifted.get(it)?.(dx) ?? it;
    return { ...it, x: it.x + dx };
  });
  let height = bottom + groupFoot + margin;
  if (legend.length > 0) {
    const widths = legend.map((e) => R.legendSample + R.legendCaptionGap + captionW(e.caption));
    const total = widths.reduce((a, b) => a + b, 0) + (legend.length - 1) * R.legendGap;
    width = up(Math.max(width, total + 2 * margin));
    const ruleY = bottom + groupFoot + S.legendTop;
    const rowY = ruleY + S.legendRow;
    sceneItems.push({
      kind: 'line',
      points: [
        { x: margin, y: ruleY },
        { x: width - margin, y: ruleY },
      ],
      role: ['rule'],
    });
    let x = margin;
    legend.forEach((e, k) => {
      const look = { ...LEGEND_LOOKS[e.kind], dash: kindDash.get(e.kind) ?? LEGEND_LOOKS[e.kind].dash };
      const shape = kindHalf.get(e.kind);
      const x2 = x + R.legendSample - S.stroke;
      sceneItems.push({
        kind: 'line',
        points: [
          { x, y: rowY },
          { x: look.arrow === 'cross' ? x2 - S.failGap : x2, y: rowY },
        ],
        tone: look.tone,
        dash: look.dash,
        arrow: shape?.reverse ? 'none' : look.arrow,
        role: lineRoles(look),
      });
      if (look.arrow === 'cross') sceneItems.push(...crossMark(x2 - S.failGap, rowY));
      if (look.arrow === 'open') sceneItems.push(shape?.reverse ? openOrHalf(x, rowY, -1, shape.half) : openOrHalf(x2, rowY, 1, shape?.half));
      sceneItems.push({
        kind: 'text',
        x: x + R.legendSample + R.legendCaptionGap,
        y: rowY,
        text: e.caption,
        anchor: 'start',
        font: 'caption',
        tone: 'muted',
        role: ['legend'],
      });
      x = up(x + (widths[k] ?? 0) + R.legendGap);
    });
    height = rowY + S.legendBelow + margin;
  }

  const sh = (b: Box): Box => ({ ...b, x: b.x + dx });
  const scene = {
    width,
    height,
    title: `Sequence diagram: ${n} participants, ${messages.length} messages`,
    items: sceneItems,
  };
  return {
    width,
    height,
    pitch,
    headerWidth: hw,
    legend,
    participants: placed.map((p) => ({ ...p, x: p.x + dx, box: sh(p.box) })),
    rows,
    messages: messages.map((m) => ({ ...m, fromX: m.fromX + dx, toX: m.toX + dx, ...(m.label ? { label: sh(m.label) } : {}) })),
    notes: notes.map((nt) => ({ ...nt, box: sh(nt.box) })),
    frames: frames.map((f) => ({ ...f, x: f.x + dx })),
    diagnostics: [],
    scene,
  };
}

/**
 * Places a sequence diagram. Without a limit every text stays on one line. When the natural
 * drawing is wider than the limit, the lifelines first move closer together, then texts are
 * wrapped at word boundaries at the widest cap that fits; if even the narrowest cap does not
 * fit, the narrowest drawing is returned together with an `overflow` diagnostic.
 */
export function layoutSequence(seq: Sequence, ruler: Ruler, opts: SequenceLayoutOptions = {}): SequenceLayout {
  const limit = opts.maxWidth ?? ruler.defaultWidth;
  const natural = build(seq, ruler, Infinity, false, opts.legend);
  if (limit === undefined || !Number.isFinite(limit) || natural.width <= limit) return natural;
  const close = build(seq, ruler, Infinity, true, opts.legend);
  if (close.width <= limit) return close;

  const g = ruler.grid;
  const lines = wrappable(seq);
  const measure = (e: { line: string; role: TextRole }): number => ruler.textWidth(e.line, e.role);
  const longest = Math.max(0, ...lines.map(measure));
  // A word wider than the cap keeps its own line, so the cap may go below the widest word: a long word on a
  // message that spans several lifelines must not stop the short labels between neighbours from wrapping.
  const capMin = g;
  const narrowest = build(seq, ruler, capMin, true, opts.legend);
  if (narrowest.width > limit) {
    const diagnostic: Diagnostic = {
      kind: 'overflow',
      nodes: seq.participants.map((p) => p.id),
      message: `Drawing is ${narrowest.width} wide at its narrowest; the limit is ${limit}.`,
      suggestion: 'Shorten participant names or message texts, or split the diagram.',
    };
    return { ...narrowest, diagnostics: [diagnostic] };
  }
  let lo = 0;
  let hi = Math.max(0, Math.ceil((longest - capMin) / g));
  let best = narrowest;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const trial = build(seq, ruler, capMin + mid * g, true, opts.legend);
    if (trial.width <= limit) {
      best = trial;
      lo = mid;
    } else hi = mid - 1;
  }
  return best;
}
