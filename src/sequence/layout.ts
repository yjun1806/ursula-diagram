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
  if (kind === 'plain') return { tone: m.dashed ? 'muted' : 'soft', dash: m.dashed, arrow: 'none' };
  return LEGEND_LOOKS[kind];
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
  return out;
}

function build(seq: Sequence, R: Ruler, cap: number, tight: boolean, legendOption: SequenceLegendOption | undefined): SequenceLayout {
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
  const headLines = Math.max(1, ...seq.participants.map((p) => p.lines.length));
  const headH = up(S.headH + (headLines - 1) * lhT);
  const headerBottom = margin + headH;
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
        if (w > 0) fit(w + S.labelPad, Math.abs(a - b));
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
  const barItems: SceneItem[] = [];
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
  seq.participants.forEach((p, i) => {
    const lx = xs[i] ?? 0;
    const box: Box = { x: lx - half, y: margin, w: hw, h: headH };
    placed.push({ id: p.id, x: lx, box });
    span(box.x, box.x + box.w - S.stroke);
    boxItems.push({ kind: 'box', style: p.actor ? 'actor' : 'box', ...box, data: { participant: p.id } });
    const top = box.y + (headH - p.lines.length * lhT) / 2;
    p.lines.forEach((line, k) =>
      textItems.push({ kind: 'text', x: lx, y: top + k * lhT + lhT / 2, text: line, anchor: 'middle', font: 'title', tone: 'fg' }),
    );
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
    barItems.push({
      kind: 'box',
      style: 'bar',
      x: lx - hb + bar.level * S.barNest,
      y: bar.y1,
      w: S.barW,
      h: Math.max(g, up(last - bar.y1 + S.stroke)),
    });
  };
  const openBar = (c: number, y: number): void => {
    const stack = bars[c];
    if (stack) stack.push({ col: c, level: stack.length, y1: y });
  };

  const rows: PlacedRow[] = [];
  const messages: PlacedMessage[] = [];
  const notes: PlacedNote[] = [];
  const frames: PlacedFrame[] = [];
  const kindsUsed = new Set<MessageKind>();
  let messageIndex = 0;
  let frameIndex = 0;
  let cursor = headerBottom;
  let last: 'header' | 'message' | 'note' | 'open' | 'branch' | 'close' = 'header';
  const inline = S.condH === 0;

  const gapFor = (next: 'message' | 'note' | 'open' | 'branch'): number => {
    if (last === 'open' || last === 'branch') return S.gapHead;
    if (last === 'close') return S.gapFrame;
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
    backItems.push({ kind: 'box', style: 'label', x: bx, y: by, w: up(x + w + S.labelBgPad) - bx, h: up(S.condH) });
    textItems.push({ kind: 'text', x, y: cy, text, anchor: 'start', font: 'caption', tone: 'muted' });
  };

  /** A caption on the border row of a frame (cell drawings): the backing keeps a space on both sides. */
  const inlineCaption = (x: number, cy: number, text: string): void => {
    const w = Math.ceil(captionW(text));
    boxItems.push({ kind: 'box', style: 'label', x: x - S.labelBgPad, y: down(cy), w: w + 2 * S.labelBgPad, h: g });
    textItems.push({ kind: 'text', x, y: cy, text, anchor: 'start', font: 'caption', tone: 'muted' });
  };

  /** Draws a message label on a backing; `x` is its centre or its left end. */
  const emitLabel = (info: MessageText, x: number, anchor: 'middle' | 'start', top: number, tone: SceneTone, idx: number): Box => {
    const left = anchor === 'middle' ? x - info.w / 2 : x;
    const bx = down(left - S.labelBgPad);
    const box: Box = { x: bx, y: top, w: up(left + info.w + S.labelBgPad) - bx, h: info.lines.length * lhE };
    backItems.push({ kind: 'box', style: 'label', ...box });
    const data = { message: String(idx) };
    info.lines.forEach((line, k) => {
      const cy = top + k * lhE + lhE / 2;
      if (k === 0 && info.numText !== '') {
        const sx = anchor === 'middle' ? x - (info.numExtra + R.textWidth(line, 'edge')) / 2 : x;
        textItems.push({ kind: 'text', x: sx, y: cy, text: info.numText, anchor: 'start', font: 'num', tone: 'fg', data });
        if (line !== '') textItems.push({ kind: 'text', x: sx + info.numExtra, y: cy, text: line, anchor: 'start', font: 'label', tone, data });
      } else {
        textItems.push({ kind: 'text', x, y: cy, text: line, anchor, font: 'label', tone, data });
      }
    });
    return box;
  };

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
        const gap = gapFor('message');
        const loopSpan = S.loopH + S.stroke;
        let lineY = cursor + gap + (self ? 1 : Math.max(1, nl)) * lhE + S.labelDrop;
        const off = self ? down((loopSpan - nl * lhE) / 2) : 0;
        if (self && nl > 0 && off < 0) lineY = Math.max(lineY, cursor + gap - off);
        const labelTop = self ? lineY + off : lineY - S.labelDrop - nl * lhE;
        const rowTop = nl > 0 ? Math.min(labelTop, lineY) : lineY;
        for (const c of pending.splice(0)) openBar(c, lineY);
        if (s.activate) openBar(b, lineY);
        lastInvolved[a] = lineY;
        lastInvolved[b] = lineY;
        const lx1 = xs[a] ?? 0;
        const lx2 = xs[b] ?? 0;
        let label: Box | undefined;
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
            radius: S.loopR,
            arrow: look.arrow,
            data,
          });
          span(e.left, xv);
          let right = Math.max(lx1 + half, xv);
          if (nl > 0) {
            label = emitLabel(info, xv + S.stroke + S.loopGap, 'start', labelTop, look.tone, messageIndex);
            span(label.x, label.x + label.w - S.stroke);
            right = Math.max(right, label.x + label.w - S.stroke);
          }
          frameSpan(lx1 - half, right);
          after = Math.max(lineY + loopSpan, nl > 0 ? labelTop + nl * lhE : 0);
        } else {
          const dir = lx2 > lx1 ? 1 : -1;
          const ea = ext(a);
          const eb = ext(b);
          const x1 = dir > 0 ? ea.right : ea.left - S.stroke;
          let x2 = dir > 0 ? eb.left - S.stroke : eb.right;
          if (look.arrow === 'cross') x2 -= dir * S.failGap;
          lineItems.push({
            kind: 'line',
            points: [
              { x: x1, y: lineY },
              { x: x2, y: lineY },
            ],
            tone: look.tone,
            dash: look.dash,
            arrow: look.arrow,
            data,
          });
          span(Math.min(ea.left, eb.left), Math.max(ea.right, eb.right) - S.stroke);
          span(x1, x2);
          frameSpan(Math.min(lx1, lx2) - half, Math.max(lx1, lx2) + half);
          if (nl > 0) {
            const first = (lx1 + (xs[a + dir] ?? lx2)) / 2;
            const cx = info.w + S.labelPad <= pitch ? first : (lx1 + lx2) / 2;
            label = emitLabel(info, cx, 'middle', labelTop, look.tone, messageIndex);
            span(label.x, label.x + label.w - S.stroke);
          }
          after = lineY + S.stroke;
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
        boxItems.push({ kind: 'box', style: 'note', ...box, data: { note: String(notes.length) } });
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
          }),
        );
        notes.push({ statement: si, box });
        rows.push({ statement: si, y: top, h: sz.h });
        cursor = top + sz.h;
        last = 'note';
        break;
      }
      case 'activate':
        pending.push(colOf(s.who));
        break;
      case 'deactivate': {
        const c = colOf(s.who);
        const k = pending.lastIndexOf(c);
        if (k >= 0) {
          pending.splice(k, 1);
          break;
        }
        const bar = bars[c]?.pop();
        if (bar) closeBar(bar, Math.max(bar.y1, cursor - S.stroke));
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
          x: box.x,
          y: box.y,
          w: box.w,
          h: box.h,
          tab: f.tab,
          data: { block: f.block, frame: String(f.index) },
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
            role: 'divider',
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
  placed.forEach((p) => {
    lifeItems.push({
      kind: 'line',
      points: [
        { x: p.x, y: headerBottom },
        { x: p.x, y: bottom - S.stroke },
      ],
      role: 'life',
      dash: true,
      data: { participant: p.id },
    });
  });

  const items: SceneItem[] = [...lifeItems, ...barItems, ...backItems, ...frameItems, ...lineItems, ...boxItems, ...textItems];
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
    if (it.kind === 'path' || it.kind === 'circle') return it;
    return { ...it, x: it.x + dx };
  });
  let height = bottom + margin;
  if (legend.length > 0) {
    const widths = legend.map((e) => R.legendSample + R.legendCaptionGap + captionW(e.caption));
    const total = widths.reduce((a, b) => a + b, 0) + (legend.length - 1) * R.legendGap;
    width = up(Math.max(width, total + 2 * margin));
    const ruleY = bottom + S.legendTop;
    const rowY = ruleY + S.legendRow;
    sceneItems.push({
      kind: 'line',
      points: [
        { x: margin, y: ruleY },
        { x: width - margin, y: ruleY },
      ],
      role: 'rule',
    });
    let x = margin;
    legend.forEach((e, k) => {
      const look = LEGEND_LOOKS[e.kind];
      const x2 = x + R.legendSample - S.stroke;
      sceneItems.push({
        kind: 'line',
        points: [
          { x, y: rowY },
          { x: look.arrow === 'cross' ? x2 - S.failGap : x2, y: rowY },
        ],
        tone: look.tone,
        dash: look.dash,
        arrow: look.arrow,
      });
      sceneItems.push({
        kind: 'text',
        x: x + R.legendSample + R.legendCaptionGap,
        y: rowY,
        text: e.caption,
        anchor: 'start',
        font: 'caption',
        tone: 'muted',
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
  const word = Math.max(0, ...lines.flatMap((e) => e.line.split(/\s+/).map((w) => ruler.textWidth(w, e.role))));
  const capMin = Math.ceil(word / g) * g;
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
