import { cellWidth, cellWidthOf } from '../metrics.ts';
import type { Ruler, SequenceTextMetrics } from '../metrics.ts';
import { wrapWords } from '../text/wrap.ts';
import { UrsulaError } from '../types.ts';
import type { TextSpan, TextTone } from '../types.ts';
import { kindOf, legendCaptions } from './model.ts';
import type { LegendKind, MessageKind, MessageStmt, NoteStmt, ParticipantKind, Sequence, SequenceLegendOption } from './model.ts';

interface Cell {
  ch: string;
  tone: TextTone;
}

/** Character grid of terminal cells; a wide character fills two cells, the second holding ''. */
class Grid {
  readonly rows: Array<Array<Cell | undefined>> = [];

  private rowAt(y: number): Array<Cell | undefined> {
    while (this.rows.length <= y) this.rows.push([]);
    return this.rows[y] ?? [];
  }

  isSet(x: number, y: number): boolean {
    return this.rows[y]?.[x] !== undefined;
  }

  put(x: number, y: number, ch: string, tone: TextTone): void {
    if (x < 0 || y < 0) return;
    const row = this.rowAt(y);
    const wide = cellWidthOf(ch.codePointAt(0) ?? 0) === 2;
    if (row[x]?.ch === '' && x > 0) row[x - 1] = { ch: ' ', tone: row[x - 1]?.tone ?? 'normal' };
    if (row[x + 1]?.ch === '' && !wide) row[x + 1] = { ch: ' ', tone };
    if (wide) {
      if (row[x + 2]?.ch === '') row[x + 2] = { ch: ' ', tone };
      row[x + 1] = { ch: '', tone };
    }
    row[x] = { ch, tone };
  }

  text(x: number, y: number, s: string, tone: TextTone): number {
    let cx = x;
    for (const ch of s) {
      this.put(cx, y, ch, tone);
      cx += cellWidthOf(ch.codePointAt(0) ?? 0);
    }
    return cx - x;
  }
}

function spansOf(row: Array<Cell | undefined>): TextSpan[] {
  let last = -1;
  row.forEach((cell, i) => {
    if (cell !== undefined && cell.ch !== ' ') last = i;
  });
  const out: TextSpan[] = [];
  for (let i = 0; i <= last; i++) {
    const cell = row[i];
    const ch = cell === undefined ? ' ' : cell.ch;
    const tone: TextTone = cell === undefined ? 'normal' : cell.tone;
    const prev = out[out.length - 1];
    if (prev && prev.tone === tone) prev.text += ch;
    else out.push({ text: ch, tone });
  }
  return out;
}

/** The plain text of one line of spans. */
export function joinSpans(line: TextSpan[]): string {
  return line.map((s) => s.text).join('');
}

/** Greedy word wrap of a line that does not fit; a word wider than `cap` is cut only when `hard` is set. */
function wrapCells(text: string, cap: number, hard: boolean): string[] {
  return wrapWords(text, cap, cellWidth, { keepIfFits: true, longWord: hard ? 'break' : 'keep' });
}

const HEADS: Record<MessageStmt['head'], readonly [string, string]> = {
  filled: ['▶', '◀'],
  open: ['▷', '◁'],
  cross: ['×', '×'],
  none: ['', ''],
};
const LEGEND_KINDS: readonly LegendKind[] = ['call', 'reply', 'async', 'failed'];
const LEGEND_SAMPLES: Record<LegendKind, string> = { call: '─▶', reply: '┄▶', async: '┄▷', failed: '┄×' };

function toneOf(kind: MessageKind, dashed: boolean): TextTone {
  if (kind === 'call') return 'normal';
  if (kind === 'plain') return dashed ? 'dim' : 'normal';
  return 'dim';
}

interface MsgInfo {
  numText: string;
  label: string;
  /** Width of the number, the space after it and the label. */
  w: number;
  numExtra: number;
  /** Columns of the sender and the receiver. */
  a: number;
  b: number;
  /** Least distance between the lifelines for the label to sit inside the arrow. */
  need: number;
}

interface Ctx {
  seq: Sequence;
  T: SequenceTextMetrics;
  R: Ruler;
  limit: number;
  list: boolean;
  legend: SequenceLegendOption | undefined;
  headLines: string[][];
  half: number[];
  boxW: number[];
  headRows: number;
  mins: number[];
  ideal: number[];
  x0: number;
  col: Map<string, number>;
  info: Map<number, MsgInfo>;
  /** Messages in source order with their numbers, for the footnotes of the list form. */
  footnotes: Array<{ numText: string; label: string }>;
}

interface FrameDraft {
  op: string;
  cond: string;
  top: number;
  bottom: number;
  dividers: Array<{ row: number; text: string }>;
  lo: number;
  hi: number;
}

interface Rendered {
  lines: TextSpan[][];
  width: number;
}

/** Short tag written before the name of a participant that is not drawn as a plain box. */
const KIND_TAGS: Partial<Record<ParticipantKind, string>> = {
  actor: '[actor]',
  boundary: '[boundary]',
  control: '[control]',
  entity: '[entity]',
  database: '[db]',
  collections: '[coll]',
  queue: '[queue]',
};

function prepare(
  seq: Sequence,
  R: Ruler,
  limit: number,
  headWrap: boolean,
  list: boolean,
  legend: SequenceLegendOption | undefined,
  tagged: boolean,
): Ctx {
  const T = R.sequence.text;
  if (!T) throw new Error('the ruler has no text metrics');
  const S = R.sequence;
  const n = seq.participants.length;
  const col = new Map(seq.participants.map((p, i) => [p.id, i] as const));
  const colOf = (id: string): number => col.get(id) ?? 0;

  const headLines = seq.participants.map((p) => {
    const tag = tagged ? KIND_TAGS[p.kind] : undefined;
    const named = tag === undefined ? p.lines : p.lines.map((l, k) => (k === 0 ? `${tag} ${l}` : l));
    if (!headWrap) return named;
    return named.flatMap((l) => {
      const words = l.split(/\s+/).filter((w) => w !== '');
      const longest = Math.max(0, ...words.map((w) => cellWidth(w)));
      return wrapCells(l, Math.max(Math.ceil(cellWidth(l) / 2), longest), false);
    });
  });
  const boxW = headLines.map((lines) => {
    const w = Math.max(0, ...lines.map(cellWidth)) + T.headPad + 2 * R.nodeBorder;
    return w % 2 === 0 ? w + 1 : w;
  });
  const half = boxW.map((w) => (w - 1) / 2);
  const headRows = S.headH + Math.max(1, ...headLines.map((l) => l.length)) - 1;

  const info = new Map<number, MsgInfo>();
  const footnotes: Ctx['footnotes'] = [];
  let count = 0;
  seq.statements.forEach((s, i) => {
    if (s.kind !== 'message') return;
    count++;
    const label = s.lines.join(' ').trim();
    const num = s.number ?? (list ? count : undefined);
    const numText = num === undefined ? '' : String(num).padStart(2, '0');
    const shown = list ? '' : label;
    const numExtra = numText === '' ? 0 : cellWidth(numText) + 1;
    const w = shown === '' ? numExtra - (numText === '' ? 0 : 1) : numExtra + cellWidth(shown);
    const a = colOf(s.from);
    const b = colOf(s.to);
    info.set(i, { numText, label: shown, w, numExtra, a, b, need: w === 0 ? 0 : w + 2 * T.labelSpace + 2 * T.labelRun });
    if (list && (numText !== '' || label !== '')) footnotes.push({ numText, label });
  });

  const mins = Array.from({ length: Math.max(0, n - 1) }, (_, i) =>
    Math.max((half[i] ?? 0) + (half[i + 1] ?? 0) + T.headGap, T.pitchMin),
  );
  const ideal = mins.slice();
  for (const m of info.values()) {
    if (Math.abs(m.a - m.b) !== 1) continue;
    const i = Math.min(m.a, m.b);
    ideal[i] = Math.max(ideal[i] ?? 0, m.need);
  }

  let depth = 0;
  let maxDepth = 0;
  for (const s of seq.statements) {
    if (s.kind === 'open') maxDepth = Math.max(maxDepth, ++depth);
    else if (s.kind === 'close') depth--;
  }
  const x0 = Math.max(half[0] ?? 0, maxDepth * T.frameOutset);
  return { seq, T, R, limit, list, legend, headLines, half, boxW, headRows, mins, ideal, x0, col, info, footnotes };
}

/** Messages whose label does not sit inside its arrow at these gaps. */
function overflow(c: Ctx, gaps: number[]): number {
  let count = 0;
  for (const m of c.info.values()) {
    if (m.a === m.b || m.need === 0) continue;
    let span = 0;
    for (let i = Math.min(m.a, m.b); i < Math.max(m.a, m.b); i++) span += gaps[i] ?? 0;
    if (span < m.need) count++;
  }
  return count;
}

/**
 * Picks gaps that add up to at most `budget` and leave the fewest single-span labels outside their arrows, then
 * gives what is left over back to the gaps that lost the most; undefined when even the least gaps are too wide.
 */
function solveGaps(c: Ctx, budget: number): number[] | undefined {
  const sum = (v: number[]): number => v.reduce((a, b) => a + b, 0);
  if (budget < sum(c.mins)) return undefined;
  if (budget >= sum(c.ideal)) return c.ideal.slice();
  const needs = c.mins.map(() => [] as number[]);
  for (const m of c.info.values()) if (Math.abs(m.a - m.b) === 1 && m.need > 0) needs[Math.min(m.a, m.b)]?.push(m.need);
  const options = c.mins.map((lo, i) => {
    const hi = c.ideal[i] ?? lo;
    const values = [...new Set([lo, ...(needs[i] ?? []).filter((v) => v > lo && v <= hi)])].sort((p, q) => p - q);
    return values.map((v) => ({ v, cost: (needs[i] ?? []).filter((need) => need > v).length }));
  });
  // dp[i][used]: fewest unplaced labels in the first i gaps that use exactly `used` cells.
  const dp: number[][] = [[0, ...new Array<number>(budget).fill(Infinity)]];
  const pick: number[][] = [];
  options.forEach((opts, i) => {
    const prev = dp[i] ?? [];
    const next = new Array<number>(budget + 1).fill(Infinity);
    const chosen = new Array<number>(budget + 1).fill(-1);
    for (let used = 0; used <= budget; used++) {
      opts.forEach((o, k) => {
        const before = prev[used - o.v] ?? Infinity;
        if (used - o.v >= 0 && before + o.cost < (next[used] ?? Infinity)) {
          next[used] = before + o.cost;
          chosen[used] = k;
        }
      });
    }
    dp.push(next);
    pick.push(chosen);
  });
  const last = dp[options.length] ?? [];
  let used = 0;
  for (let u = 0; u <= budget; u++) if ((last[u] ?? Infinity) <= (last[used] ?? Infinity)) used = u;
  const gaps = new Array<number>(options.length).fill(0);
  for (let i = options.length - 1; i >= 0; i--) {
    const o = options[i]?.[pick[i]?.[used] ?? 0];
    gaps[i] = o?.v ?? 0;
    used -= o?.v ?? 0;
  }
  for (let left = budget - sum(gaps); left > 0; left--) {
    let best = -1;
    let bestCost = Infinity;
    let bestDeficit = 0;
    gaps.forEach((d, i) => {
      const deficit = (c.ideal[i] ?? 0) - d;
      if (deficit <= 0) return;
      const trial = gaps.slice();
      trial[i] = d + 1;
      const cost = overflow(c, trial);
      if (cost < bestCost || (cost === bestCost && deficit > bestDeficit)) {
        best = i;
        bestCost = cost;
        bestDeficit = deficit;
      }
    });
    if (best < 0) break;
    gaps[best] = (gaps[best] ?? 0) + 1;
  }
  return gaps;
}

function render(c: Ctx, gaps: number[]): Rendered {
  const { seq, T, R, limit } = c;
  const n = seq.participants.length;
  const g = new Grid();
  const xs: number[] = [c.x0];
  for (const d of gaps) xs.push((xs[xs.length - 1] ?? 0) + d);
  const xOf = (col: number): number => xs[col] ?? 0;

  // Headers.
  seq.participants.forEach((p, i) => {
    const lx = xOf(i);
    const half = c.half[i] ?? 0;
    const lines = c.headLines[i] ?? [];
    const rows = c.headRows;
    const left = lx - half;
    const right = lx + half;
    for (let y = 0; y < rows; y++) {
      for (let x = left; x <= right; x++) {
        const top = y === 0;
        const bottom = y === rows - 1;
        const edgeX = x === left || x === right;
        let ch = ' ';
        if (top && x === left) ch = '╭';
        else if (top && x === right) ch = '╮';
        else if (bottom && x === left) ch = '╰';
        else if (bottom && x === right) ch = '╯';
        else if (top || bottom) ch = '─';
        else if (edgeX) ch = '│';
        g.put(x, y, ch, 'normal');
      }
    }
    const inner = rows - 2 * R.nodeBorder;
    const first = R.nodeBorder + Math.floor((inner - lines.length) / 2);
    lines.forEach((line, k) => {
      const w = cellWidth(line);
      g.text(lx - Math.floor(w / 2), first + k, line, 'bold');
    });
  });

  const depth = new Array<number>(n).fill(0);
  const acts: number[][] = [];
  let y = c.headRows;
  const newRow = (): number => {
    acts[y] = depth.slice();
    return y++;
  };
  const open: FrameDraft[] = [];
  const done: FrameDraft[] = [];
  let lastKind: 'header' | 'blank' | 'open' | 'branch' | 'content' | 'close' = 'header';
  const kindsUsed = new Set<MessageKind>();
  const extend = (x1: number, x2: number): void => {
    const f = open[open.length - 1];
    if (!f) return;
    f.lo = Math.min(f.lo, x1, x2);
    f.hi = Math.max(f.hi, x1, x2);
  };
  const low = (): number => open.length * T.frameOutset;
  const bound = (): number => limit - 1 - open.length * T.frameOutset;
  const blank = (): void => {
    newRow();
    lastKind = 'blank';
  };
  const content = (): number => {
    if (lastKind === 'close') blank();
    lastKind = 'content';
    return newRow();
  };

  /** Writes a label block whose first line carries the number; returns the cells it covers. */
  const writeBlock = (x: number, row: number, k: number, m: MsgInfo, line: string, tone: TextTone): void => {
    if (k === 0 && m.numText !== '') g.text(x, row, m.numText, 'bold');
    if (line !== '') g.text(x + m.numExtra, row, line, tone);
  };

  seq.statements.forEach((s, i) => {
    if (s.kind === 'activate') {
      depth[c.col.get(s.who) ?? 0] = (depth[c.col.get(s.who) ?? 0] ?? 0) + 1;
    } else if (s.kind === 'deactivate') {
      const k = c.col.get(s.who) ?? 0;
      depth[k] = Math.max(0, (depth[k] ?? 0) - 1);
    } else if (s.kind === 'open') {
      if (lastKind !== 'blank' && lastKind !== 'open' && lastKind !== 'branch') blank();
      const top = newRow();
      lastKind = 'open';
      open.push({ op: s.block.toUpperCase(), cond: s.lines.join(' ').trim(), top, bottom: top, dividers: [], lo: Infinity, hi: -Infinity });
    } else if (s.kind === 'branch') {
      const f = open[open.length - 1];
      const row = newRow();
      lastKind = 'branch';
      f?.dividers.push({ row, text: s.lines.join(' ').trim() });
    } else if (s.kind === 'close') {
      const f = open.pop();
      const row = newRow();
      lastKind = 'close';
      if (!f) return;
      f.bottom = row;
      if (!Number.isFinite(f.lo)) {
        f.lo = xOf(0);
        f.hi = xOf(n - 1);
      }
      f.lo -= T.frameOutset;
      f.hi += T.frameOutset;
      const titles = [`${f.op}${f.cond === '' ? '' : ` [${f.cond}]`}`, ...f.dividers.map((d) => (d.text === '' ? '' : `[${d.text}]`))];
      const titleW = Math.max(...titles.map(cellWidth));
      const minW = 2 + T.frameLead + 2 * T.frameTitlePad + titleW + T.frameTrail;
      f.hi = Math.max(f.hi, f.lo + minW - 1);
      done.push(f);
      extend(f.lo, f.hi);
    } else if (s.kind === 'note') {
      drawNote(s);
    } else if (s.kind === 'message') {
      drawMessage(s, i);
    }
  });

  function drawNote(s: NoteStmt): void {
    const text = s.lines.join(' ').trim();
    const anchors = s.anchors.map((id) => xOf(c.col.get(id) ?? 0));
    const ax = anchors[0] ?? 0;
    const lo = low();
    const hi = bound();
    const region: [number, number] =
      s.side === 'right' ? [ax + T.noteOffset, hi] : s.side === 'left' ? [lo, ax - T.noteOffset] : [lo, hi];
    const useRegion = region[1] - region[0] + 1 >= T.wrapMin ? region : ([lo, hi] as [number, number]);
    const regionW = useRegion[1] - useRegion[0] + 1;
    const place = (w: number): number => {
      let start: number;
      if (s.side === 'right') start = ax + T.noteOffset;
      else if (s.side === 'left') start = ax - T.noteOffset - w + 1;
      else start = Math.floor(((anchors[0] ?? 0) + (anchors[anchors.length - 1] ?? 0)) / 2) - Math.floor(w / 2);
      start = Math.min(start, hi - w + 1);
      return Math.max(start, lo);
    };
    const oneLine = 1 + cellWidth(text);
    const row0 = content();
    if (oneLine <= regionW) {
      const x = place(oneLine);
      g.put(x, row0, '▏', 'normal');
      g.text(x + 1, row0, text, 'normal');
      for (const a of anchors) extend(a, a);
      extend(x, x + oneLine - 1);
      return;
    }
    const pad = T.noteBoxPad;
    const lines = wrapCells(text, regionW - 2 * R.nodeBorder - 2 * pad, true);
    const inner = Math.max(...lines.map(cellWidth)) + 2 * pad;
    const w = inner + 2 * R.nodeBorder;
    const x = place(w);
    for (let k = 0; k < lines.length + 2; k++) {
      const row = k === 0 ? row0 : content();
      const top = k === 0;
      const bottom = k === lines.length + 1;
      g.put(x, row, top ? '┌' : bottom ? '└' : '│', 'normal');
      g.put(x + w - 1, row, top ? '┐' : bottom ? '┘' : '│', 'normal');
      for (let cx = x + 1; cx < x + w - 1; cx++) g.put(cx, row, top || bottom ? '─' : ' ', 'normal');
      const line = lines[k - 1];
      if (!top && !bottom && line !== undefined) g.text(x + R.nodeBorder + pad, row, line, 'normal');
    }
    for (const a of anchors) extend(a, a);
    extend(x, x + w - 1);
  }

  function drawMessage(s: MessageStmt, idx: number): void {
    const m = c.info.get(idx);
    if (!m) return;
    const kind = kindOf(s);
    kindsUsed.add(kind);
    const tone = toneOf(kind, s.dashed);
    const dash = s.dashed ? '┄' : '─';
    const a = xOf(m.a);
    const b = xOf(m.b);
    const [headR, headL] = HEADS[s.head];
    const hi = bound();
    const lo = low();
    const act = (col: number): boolean => (depth[col] ?? 0) > 0;
    const lines = (cap: number): string[] => wrapCells(m.label, cap - m.numExtra, true);
    const blockW = (ls: string[]): number => m.numExtra + Math.max(0, ...ls.map(cellWidth));

    if (m.a === m.b) {
      const start = a + T.selfReach + 1 + T.selfGap;
      let ls = [m.label];
      if (start + m.w - 1 > hi) ls = lines(Math.max(T.wrapMin, hi - start + 1));
      const shift = Math.min(0, hi - (start + blockW(ls) - 1));
      const x = Math.max(start, start + shift);
      const rows = Math.max(2, ls.length);
      if (s.activate) depth[m.b] = (depth[m.b] ?? 0) + 1;
      for (let k = 0; k < rows; k++) {
        const row = content();
        const first = k === 0;
        const last = k === rows - 1;
        if (first) {
          if (!act(m.a)) g.put(a, row, '├', tone);
          g.put(a + 1, row, s.reverse ? headL : dash, tone);
          g.put(a + 2, row, dash, tone);
          g.put(a + T.selfReach, row, '┐', tone);
        } else if (last) {
          if (!act(m.a)) g.put(a, row, '┤', tone);
          g.put(a + 1, row, headL === '' || s.reverse ? dash : headL, tone);
          g.put(a + 2, row, dash, tone);
          g.put(a + T.selfReach, row, '┘', tone);
        } else {
          g.put(a + T.selfReach, row, '│', tone);
        }
        const line = ls[k];
        if (line !== undefined) writeBlock(x, row, k, m, line, tone);
      }
      extend(a, Math.max(a + T.selfReach, x + blockW(ls) - 1));
      if (s.deactivate) depth[m.a] = Math.max(0, (depth[m.a] ?? 0) - 1);
      return;
    }

    const left = Math.min(a, b);
    const right = Math.max(a, b);
    const ltr = b > a;
    const inline = m.need === 0 || right - left >= m.need;
    extend(left, right);
    if (!inline) {
      // The label gets a row of its own above the arrow and may run over lifelines that take no part.
      let ls = [m.label];
      const w0 = m.w;
      let x: number;
      if (ltr) {
        x = a + T.noteOffset;
        if (x + w0 - 1 > hi) {
          ls = lines(Math.max(T.wrapMin, hi - x + 1));
          x = Math.min(x, hi - blockW(ls) + 1);
        }
      } else {
        const end = a - T.noteOffset;
        x = end - w0 + 1;
        if (x < lo) {
          x = lo;
          if (x + w0 - 1 > hi) ls = lines(Math.max(T.wrapMin, hi - lo + 1));
        }
      }
      ls.forEach((line, k) => {
        const row = content();
        writeBlock(x, row, k, m, line, tone);
      });
      extend(x, x + blockW(ls) - 1);
    }
    if (s.activate) depth[m.b] = (depth[m.b] ?? 0) + 1;
    const row = content();
    if (!act(m.a)) g.put(a, row, ltr ? '├' : '┤', tone);
    const headX = ltr ? b - 1 : b + 1;
    const from = ltr ? a + 1 : b + 2;
    const to = ltr ? b - 2 : a - 1;
    for (let x = from; x <= to; x++) g.put(x, row, dash, tone);
    for (const lx of xs) if (lx > left && lx < right) g.put(lx, row, '┼', tone);
    g.put(headX, row, (ltr ? headR : headL) || dash, tone);
    if (!ltr) for (let x = headX + 1; x < from; x++) g.put(x, row, dash, tone);
    // A reversed half arrow carries its head at the sender's end, pointing at the sender.
    if (s.reverse) {
      g.put(headX, row, dash, tone);
      g.put(ltr ? a + 1 : a - 1, row, ltr ? headL : headR, tone);
    }
    if (inline && m.w > 0) {
      const dashes = right - left - 2;
      const block = m.w + 2 * T.labelSpace;
      const lead = Math.floor((dashes - block) / 2);
      const start = (ltr ? left + 1 : left + 2) + lead;
      for (let k = 0; k < block; k++) g.put(start + k, row, ' ', tone);
      writeBlock(start + T.labelSpace, row, 0, m, m.label, tone);
    }
    if (s.deactivate) depth[m.a] = Math.max(0, (depth[m.a] ?? 0) - 1);
  }

  // Lifelines fill every cell nothing else took.
  for (let row = c.headRows; row < y; row++) {
    seq.participants.forEach((_, k) => {
      if (!g.isSet(xOf(k), row)) g.put(xOf(k), row, (acts[row]?.[k] ?? 0) > 0 ? '┃' : '┆', 'dim');
    });
  }

  // Frames.
  for (const f of done) {
    const line = (row: number, l: string, r: string, fill: string): void => {
      g.put(f.lo, row, l, 'dim');
      g.put(f.hi, row, r, 'dim');
      for (let x = f.lo + 1; x < f.hi; x++) g.put(x, row, xs.includes(x) ? '┼' : fill, 'dim');
    };
    for (let row = f.top + 1; row < f.bottom; row++) {
      g.put(f.lo, row, '│', 'dim');
      g.put(f.hi, row, '│', 'dim');
    }
    line(f.top, '┌', '┐', '─');
    line(f.bottom, '└', '┘', '─');
    const title = (row: number, parts: Array<[string, TextTone]>): void => {
      let x = f.lo + 1 + T.frameLead;
      g.put(x, row, ' ', 'dim');
      x += T.frameTitlePad;
      for (const [text, tone] of parts) x += g.text(x, row, text, tone);
      g.put(x, row, ' ', 'dim');
    };
    title(f.top, f.cond === '' ? [[f.op, 'bold']] : [[f.op, 'bold'], [` [${f.cond}]`, 'normal']]);
    for (const d of f.dividers) {
      line(d.row, '├', '┤', '┄');
      if (d.text !== '') title(d.row, [[`[${d.text}]`, 'normal']]);
    }
  }

  const lines: TextSpan[][] = g.rows.map(spansOf);
  let width = 0;
  for (const row of g.rows) {
    let last = -1;
    row.forEach((cell, i) => {
      if (cell !== undefined && cell.ch !== ' ') last = i;
    });
    width = Math.max(width, last + 1);
  }

  // Footnotes of the list form, then the legend.
  const cap = limit;
  const pad = '';
  if (c.list && c.footnotes.length > 0) {
    lines.push([]);
    for (const f of c.footnotes) {
      const numExtra = f.numText === '' ? 0 : cellWidth(f.numText) + 1;
      wrapCells(f.label, cap - numExtra, true).forEach((l, k) => {
        const row: TextSpan[] = [];
        if (pad !== '') row.push({ text: pad, tone: 'normal' });
        if (k === 0 && f.numText !== '') row.push({ text: f.numText, tone: 'bold' }, { text: ' ', tone: 'normal' });
        else if (numExtra > 0) row.push({ text: ' '.repeat(numExtra), tone: 'normal' });
        row.push({ text: l, tone: 'normal' });
        lines.push(row);
      });
    }
  }
  const used = LEGEND_KINDS.filter((k) => kindsUsed.has(k));
  if (c.legend !== false && used.length >= 2) {
    lines.push([]);
    let cur = '';
    const flush = (): void => {
      if (cur !== '') lines.push([{ text: pad + cur, tone: 'dim' }]);
      cur = '';
    };
    const words = legendCaptions(c.seq);
    for (const k of used) {
      const item = `${LEGEND_SAMPLES[k]} ${c.legend?.[k] ?? words[k]}`;
      const next = cur === '' ? item : `${cur}${' '.repeat(T.legendGap)}${item}`;
      if (cur !== '' && cellWidth(pad + next) > limit) {
        flush();
        cur = item;
      } else cur = next;
    }
    flush();
  }
  for (const l of lines) width = Math.max(width, cellWidth(joinSpans(l)));
  while (lines.length > 0 && (lines[lines.length - 1]?.length ?? 0) === 0) lines.pop();
  return { lines, width };
}

function fit(c: Ctx): Rendered | undefined {
  if (c.limit === Infinity) return render(c, c.ideal.slice());
  const n = c.seq.participants.length;
  for (let budget = c.limit - c.x0 - (c.half[n - 1] ?? 0) - 1; ; budget--) {
    const gaps = solveGaps(c, budget);
    if (!gaps) return undefined;
    const r = render(c, gaps);
    if (r.width <= c.limit) return r;
  }
}

/**
 * Draws a sequence diagram for a terminal as lines of toned spans, using the text rules of the cell ruler:
 * lifelines sit as close as what is between them allows, labels ride inside their arrows, and a diagram too
 * wide for `maxWidth` first wraps its headers, then numbers its arrows with a list of the labels beneath.
 */
export function layoutSequenceText(
  seq: Sequence,
  ruler: Ruler,
  maxWidth: number | undefined,
  legend: SequenceLegendOption | undefined,
): TextSpan[][] {
  if (seq.participants.length === 0) return [];
  const limit = maxWidth ?? Infinity;
  const tries: Array<{ wrap: boolean; list: boolean }> = [
    { wrap: false, list: false },
    { wrap: true, list: false },
    { wrap: false, list: true },
    { wrap: true, list: true },
  ];
  for (const t of tries) {
    const plain = fit(prepare(seq, ruler, limit, t.wrap, t.list, legend, false));
    if (plain) {
      // The kind tags widen the headers; they stay only when that costs the drawing no rows at this limit.
      if (!seq.participants.some((p) => KIND_TAGS[p.kind] !== undefined)) return plain.lines;
      const tagged = fit(prepare(seq, ruler, limit, t.wrap, t.list, legend, true));
      return tagged && tagged.lines.length <= plain.lines.length ? tagged.lines : plain.lines;
    }
    if (limit === Infinity) break;
  }
  throw new UrsulaError(`Sequence diagram does not fit in ${limit} columns.`, 'width');
}
