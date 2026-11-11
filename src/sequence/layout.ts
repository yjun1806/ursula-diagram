import type { Ruler, TextRole } from '../metrics.ts';
import type { Diagnostic, SceneItem } from '../types.ts';
import type {
  Box,
  MessageStmt,
  PlacedFrame,
  PlacedMessage,
  PlacedNote,
  PlacedParticipant,
  PlacedRow,
  Sequence,
  SequenceLayout,
  Statement,
} from './model.ts';

export interface SequenceLayoutOptions {
  maxWidth?: number;
}

interface Bar {
  col: number;
  level: number;
  y1: number;
}

interface FrameDraft {
  statement: number;
  block: PlacedFrame['block'];
  y: number;
  condition: string;
  minX: number;
  maxX: number;
  dividers: Array<{ y: number; text: string }>;
}

interface Constraint {
  lo: number;
  hi: number;
  need: number;
}

function messageLines(m: MessageStmt): string[] {
  if (m.number === undefined) return m.lines;
  const [first, ...rest] = m.lines;
  return [`${m.number}.${first === undefined ? '' : ` ${first}`}`, ...rest];
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
    if (s.kind === 'message') for (const line of messageLines(s)) out.push({ line, role: 'edge' });
    else if (s.kind === 'note') for (const line of s.lines) out.push({ line, role: 'line' });
  }
  return out;
}

function build(seq: Sequence, R: Ruler, cap: number): SequenceLayout {
  const S = R.sequence;
  const g = R.grid;
  const up = (v: number): number => Math.ceil(v / g - 1e-9) * g;
  const up2 = (v: number): number => Math.ceil(v / (2 * g) - 1e-9) * (2 * g);
  const down = (v: number): number => Math.floor(v / g + 1e-9) * g;
  const widest = (lines: string[], role: TextRole): number => Math.max(0, ...lines.map((l) => R.textWidth(l, role)));
  const margin = R.lanePad;
  const n = seq.participants.length;
  const col = new Map(seq.participants.map((p, i) => [p.id, i] as const));
  const colOf = (id: string): number => col.get(id) ?? 0;

  // Header boxes.
  const headW = seq.participants.map((p) => up2(widest(p.lines, 'title') + 2 * R.nodePadX + 2 * R.nodeBorder) + S.stroke);
  const headLines = Math.max(1, ...seq.participants.map((p) => p.lines.length));
  const headH = up(headLines * R.lineHeight('title') + 2 * S.headerPadY + 2 * R.nodeBorder);
  const halfHead = headW.map((w) => (w - S.stroke) / 2);

  // Wrapped texts per statement.
  const wrapped = new Map<number, string[]>();
  seq.statements.forEach((s, i) => {
    if (s.kind === 'message') {
      const role: TextRole = 'edge';
      wrapped.set(i, messageLines(s).flatMap((l) => wrapLine(l, cap, (t) => R.textWidth(t, role))));
    } else if (s.kind === 'note') {
      const role: TextRole = 'line';
      wrapped.set(i, s.lines.flatMap((l) => wrapLine(l, cap, (t) => R.textWidth(t, role))));
    }
  });

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

  const noteSize = (lines: string[], extra: number): { w: number; h: number; textW: number } => {
    const textW = widest(lines, 'line');
    return {
      w: textW + 2 * (S.notePadX + R.nodeBorder) + extra,
      h: up(Math.max(1, lines.length) * R.lineHeight('line') + 2 * S.notePadY + 2 * R.nodeBorder),
      textW,
    };
  };

  // Lifeline distances.
  const gaps: number[] = [];
  for (let i = 0; i + 1 < n; i++) {
    gaps.push(up(Math.max(S.minSpan, (halfHead[i] ?? 0) + (halfHead[i + 1] ?? 0) + S.stroke + S.headerGap)));
  }
  const constraints: Constraint[] = [];
  seq.statements.forEach((s, i) => {
    const lines = wrapped.get(i) ?? [];
    if (s.kind === 'message') {
      const a = colOf(s.from);
      const b = colOf(s.to);
      const labelW = widest(lines, 'edge');
      if (a !== b) {
        if (lines.length > 0) constraints.push({ lo: Math.min(a, b), hi: Math.max(a, b), need: labelW + S.labelPad });
      } else if (a + 1 < n) {
        constraints.push({ lo: a, hi: a + 1, need: barExtra + S.loopW + (lines.length > 0 ? S.loopGap + labelW : 0) + S.labelPad });
      }
    } else if (s.kind === 'note') {
      const a = colOf(s.anchors[0] ?? '');
      const sz = noteSize(lines, 0);
      const w = up(sz.w);
      if (s.side === 'right' && a + 1 < n) constraints.push({ lo: a, hi: a + 1, need: S.stroke + S.noteGap + w + S.noteGap });
      else if (s.side === 'left' && a > 0) constraints.push({ lo: a - 1, hi: a, need: S.noteGap + w + S.noteGap });
      else if (s.side === 'over' && s.anchors.length === 1) {
        const half = up2(sz.w) / 2 + S.stroke + S.noteGap;
        if (a > 0) constraints.push({ lo: a - 1, hi: a, need: half });
        if (a + 1 < n) constraints.push({ lo: a, hi: a + 1, need: half });
      } else if (s.side === 'over') {
        const b = colOf(s.anchors[1] ?? '');
        const lo = Math.min(a, b);
        const hi = Math.max(a, b);
        if (hi > lo) constraints.push({ lo, hi, need: w - 2 * S.notePadX - S.stroke });
      }
    }
  });
  constraints
    .map((c, order) => ({ c, order }))
    .sort((p, q) => p.c.hi - p.c.lo - (q.c.hi - q.c.lo) || p.order - q.order)
    .forEach(({ c }) => {
      let cur = 0;
      for (let k = c.lo; k < c.hi; k++) cur += gaps[k] ?? 0;
      if (cur >= c.need) return;
      const add = up(c.need - cur);
      const count = c.hi - c.lo;
      const each = down(add / count);
      let rest = Math.round((add - each * count) / g);
      for (let k = c.lo; k < c.hi; k++) {
        gaps[k] = (gaps[k] ?? 0) + each + (rest > 0 ? g : 0);
        if (rest > 0) rest--;
      }
    });
  const xs: number[] = [];
  seq.participants.forEach((_, i) => xs.push(i === 0 ? 0 : (xs[i - 1] ?? 0) + (gaps[i - 1] ?? 0)));

  // Item layers: paint order is lifelines, bars, frames, lines, boxes, texts.
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
    const lo = Math.min(x1, x2);
    const hi = Math.max(x1, x2);
    minX = Math.min(minX, lo);
    maxX = Math.max(maxX, hi);
    for (const f of open) {
      f.minX = Math.min(f.minX, lo);
      f.maxX = Math.max(f.maxX, hi);
    }
  };

  const placed: PlacedParticipant[] = [];
  seq.participants.forEach((p, i) => {
    const lx = xs[i] ?? 0;
    const w = headW[i] ?? 0;
    const box: Box = { x: lx - (halfHead[i] ?? 0), y: margin, w, h: headH };
    placed.push({ id: p.id, x: lx, box });
    span(box.x, box.x + box.w - S.stroke);
    boxItems.push({ kind: 'box', style: 'box', ...box, data: { participant: p.id } });
    const lh = R.lineHeight('title');
    const top = box.y + (headH - p.lines.length * lh) / 2;
    p.lines.forEach((line, k) =>
      textItems.push({ kind: 'text', x: lx, y: top + k * lh + lh / 2, text: line, anchor: 'middle', font: 'title', tone: 'fg' }),
    );
  });

  const bars: Bar[][] = seq.participants.map(() => []);
  const hb = down(S.barW / 2);
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
      h: Math.max(g, last - bar.y1 + S.stroke),
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
  let messageIndex = 0;
  const headerBottom = margin + headH;
  let y = headerBottom + S.firstGap;
  const lhEdge = R.lineHeight('edge');
  const lhLine = R.lineHeight('line');

  const frameTab = (text: string): { text: string; w: number; h: number } => ({
    text,
    w: up(R.textWidth(text, 'lane') + 2 * S.tabPad),
    h: S.tabH,
  });

  seq.statements.forEach((s: Statement, si) => {
    switch (s.kind) {
      case 'message': {
        const a = colOf(s.from);
        const b = colOf(s.to);
        const lines = wrapped.get(si) ?? [];
        const nl = lines.length;
        const self = a === b;
        const pt = S.msgPadTop;
        let rowH: number;
        let lineY: number;
        let labelTop: number;
        const labelW = widest(lines, 'edge');
        if (self) {
          const loopSpan = S.loopH + S.stroke;
          const occ = Math.max(loopSpan, nl * lhEdge);
          lineY = y + pt + down((occ - loopSpan) / 2);
          labelTop = y + pt + down((occ - nl * lhEdge) / 2);
          rowH = up(pt + occ + S.selfPadBottom);
        } else {
          lineY = y + pt + nl * lhEdge + S.msgDrop;
          labelTop = y + pt;
          rowH = up(pt + nl * lhEdge + S.msgDrop + S.msgPadBottom);
        }
        if (s.activate) openBar(b, lineY);
        const lx1 = xs[a] ?? 0;
        const lx2 = xs[b] ?? 0;
        let label: Box | undefined;
        const data = { message: String(messageIndex), from: s.from, to: s.to };
        if (self) {
          const e = ext(a);
          const xv = e.right + S.loopW - S.stroke;
          const pts = [
            { x: e.right, y: lineY },
            { x: xv, y: lineY },
            { x: xv, y: lineY + S.loopH },
            { x: e.right, y: lineY + S.loopH },
          ];
          lineItems.push({ kind: 'line', points: pts, dash: s.dashed, arrow: s.head, data });
          span(e.left, xv);
          if (nl > 0) {
            const lx = xv + S.stroke + S.loopGap;
            lines.forEach((line, k) =>
              textItems.push({
                kind: 'text',
                x: lx,
                y: labelTop + k * lhEdge + lhEdge / 2,
                text: line,
                anchor: 'start',
                font: 'label',
                tone: 'muted',
                halo: true,
                data: { message: String(messageIndex) },
              }),
            );
            label = { x: lx, y: labelTop, w: up(labelW), h: nl * lhEdge };
            span(lx, lx + label.w - S.stroke);
          }
        } else {
          const right = lx2 > lx1;
          const ea = ext(a);
          const eb = ext(b);
          const x1 = right ? ea.right : ea.left - S.stroke;
          const x2 = right ? eb.left - S.stroke : eb.right;
          lineItems.push({
            kind: 'line',
            points: [
              { x: x1, y: lineY },
              { x: x2, y: lineY },
            ],
            dash: s.dashed,
            arrow: s.head,
            data,
          });
          span(Math.min(ea.left, eb.left), Math.max(ea.right, eb.right) - S.stroke);
          span(x1, x2);
          if (nl > 0) {
            const c = Math.round((lx1 + lx2) / 2 / g) * g;
            lines.forEach((line, k) =>
              textItems.push({
                kind: 'text',
                x: c,
                y: labelTop + k * lhEdge + lhEdge / 2,
                text: line,
                anchor: 'middle',
                font: 'label',
                tone: 'muted',
                halo: true,
                data: { message: String(messageIndex) },
              }),
            );
            label = { x: c - down(labelW / 2), y: labelTop, w: up(labelW), h: nl * lhEdge };
            span(label.x, label.x + label.w - S.stroke);
          }
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
          y: lineY,
          self,
          ...(label ? { label } : {}),
        });
        messageIndex++;
        rows.push({ statement: si, y, h: rowH });
        y += rowH;
        break;
      }
      case 'note': {
        const lines = wrapped.get(si) ?? [];
        const a = colOf(s.anchors[0] ?? '');
        const lx = xs[a] ?? 0;
        const sz = noteSize(lines, 0);
        let bx: number;
        let bw: number;
        if (s.side === 'right') {
          bw = up(sz.w);
          bx = lx + S.stroke + S.noteGap;
        } else if (s.side === 'left') {
          bw = up(sz.w);
          bx = lx - S.noteGap - bw;
        } else if (s.anchors.length === 1) {
          bw = up2(sz.w) + S.stroke;
          bx = lx - (bw - S.stroke) / 2;
        } else {
          const lo = Math.min(a, colOf(s.anchors[1] ?? ''));
          const hi = Math.max(a, colOf(s.anchors[1] ?? ''));
          bx = (xs[lo] ?? 0) - S.notePadX;
          bw = (xs[hi] ?? 0) - (xs[lo] ?? 0) + S.stroke + 2 * S.notePadX;
        }
        const rowH = up(sz.h + S.rowGap);
        const box: Box = { x: bx, y: y + down(S.rowGap / 2), w: bw, h: sz.h };
        boxItems.push({ kind: 'box', style: 'note', ...box, data: { note: String(notes.length) } });
        span(box.x, box.x + box.w - S.stroke);
        const nl = Math.max(1, lines.length);
        const top = box.y + R.nodeBorder + S.notePadY + (sz.h - 2 * R.nodeBorder - 2 * S.notePadY - nl * lhLine) / 2;
        lines.forEach((line, k) => {
          const centred = s.side === 'over';
          textItems.push({
            kind: 'text',
            x: centred ? box.x + down(box.w / 2) : box.x + R.nodeBorder + S.notePadX,
            y: top + k * lhLine + lhLine / 2,
            text: line,
            anchor: centred ? 'middle' : 'start',
            font: 'body',
            tone: 'muted',
          });
        });
        notes.push({ statement: si, box });
        rows.push({ statement: si, y, h: rowH });
        y += rowH;
        break;
      }
      case 'activate':
        openBar(colOf(s.who), y);
        break;
      case 'deactivate': {
        const bar = bars[colOf(s.who)]?.pop();
        if (bar) closeBar(bar, y - S.stroke);
        break;
      }
      case 'open': {
        const text = s.lines.join(' ');
        open.push({
          statement: si,
          block: s.block,
          y,
          condition: text === '' ? '' : `[${text}]`,
          minX: Infinity,
          maxX: -Infinity,
          dividers: [],
        });
        rows.push({ statement: si, y, h: S.frameHeadH });
        y += S.frameHeadH;
        break;
      }
      case 'branch': {
        const f = open[open.length - 1];
        const text = s.lines.join(' ');
        f?.dividers.push({ y, text: text === '' ? '' : `[${text}]` });
        rows.push({ statement: si, y, h: S.dividerH });
        y += S.dividerH;
        break;
      }
      case 'close': {
        const f = open.pop();
        if (!f) break;
        rows.push({ statement: si, y, h: S.frameFootH });
        y += S.frameFootH;
        const tab = frameTab(f.block);
        const condW = f.condition === '' ? 0 : R.textWidth(f.condition, 'edge');
        let lo = f.minX;
        let hi = f.maxX;
        if (!Number.isFinite(lo)) {
          lo = xs[0] ?? 0;
          hi = xs[n - 1] ?? 0;
        }
        const left = lo - S.framePad;
        let right = hi + S.framePad;
        const dividerNeed = Math.max(0, ...f.dividers.map((d) => S.tabPad + S.stroke + R.textWidth(d.text, 'edge') + S.tabGap));
        const headNeed = tab.w + (condW > 0 ? S.tabGap + condW : 0) + S.tabPad;
        right = Math.max(right, left + headNeed - S.stroke, left + dividerNeed - S.stroke);
        right = left + up(right - left + S.stroke) - S.stroke;
        const box: PlacedFrame = {
          block: f.block,
          statement: f.statement,
          x: left,
          y: f.y,
          w: right - left + S.stroke,
          h: y - f.y,
          dividers: f.dividers.map((d) => d.y),
        };
        frames.push(box);
        frameItems.push({
          kind: 'box',
          style: 'frame',
          x: box.x,
          y: box.y,
          w: box.w,
          h: box.h,
          tab,
          data: { block: f.block },
        });
        if (condW > 0) {
          textItems.push({
            kind: 'text',
            x: box.x + tab.w + S.tabGap,
            y: box.y + S.tabH / 2,
            text: f.condition,
            anchor: 'start',
            font: 'label',
            tone: 'muted',
            halo: true,
          });
        }
        for (const d of f.dividers) {
          lineItems.push({
            kind: 'line',
            points: [
              { x: box.x, y: d.y },
              { x: right, y: d.y },
            ],
            dash: true,
            weak: true,
          });
          if (d.text !== '') {
            textItems.push({
              kind: 'text',
              x: box.x + S.tabPad + S.stroke,
              y: d.y + S.dividerH / 2,
              text: d.text,
              anchor: 'start',
              font: 'label',
              tone: 'muted',
              halo: true,
            });
          }
        }
        span(left, right);
        break;
      }
    }
  });

  seq.participants.forEach((_, c) => {
    for (const bar of (bars[c] ?? []).reverse()) closeBar(bar, y - S.stroke);
  });

  const bottom = y + S.tail;
  placed.forEach((p) => {
    lifeItems.push({
      kind: 'line',
      points: [
        { x: p.x, y: headerBottom },
        { x: p.x, y: bottom - S.stroke },
      ],
      dash: true,
      weak: true,
      data: { participant: p.id },
    });
  });

  const items: SceneItem[] = [...lifeItems, ...barItems, ...frameItems, ...lineItems, ...boxItems, ...textItems];
  const left = Number.isFinite(minX) ? minX : 0;
  const right = Number.isFinite(maxX) ? maxX : 0;
  const dx = margin - left;
  const width = right - left + S.stroke + 2 * margin;
  const height = bottom + margin;

  const sh = (b: Box): Box => ({ ...b, x: b.x + dx });
  const scene = {
    width,
    height,
    title: `Sequence diagram: ${n} participants, ${messages.length} messages`,
    items: items.map((it): SceneItem => {
      if (it.kind === 'line') return { ...it, points: it.points.map((p) => ({ x: p.x + dx, y: p.y })) };
      return { ...it, x: it.x + dx };
    }),
  };
  return {
    width,
    height,
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
 * drawing is wider than the limit, texts are wrapped at word boundaries at the widest cap that
 * fits; if even the narrowest cap does not fit, the narrowest drawing is returned together with
 * an `overflow` diagnostic.
 */
export function layoutSequence(seq: Sequence, ruler: Ruler, opts: SequenceLayoutOptions = {}): SequenceLayout {
  const limit = opts.maxWidth ?? ruler.defaultWidth;
  const natural = build(seq, ruler, Infinity);
  if (limit === undefined || !Number.isFinite(limit) || natural.width <= limit) return natural;

  const g = ruler.grid;
  const lines = wrappable(seq);
  const measure = (e: { line: string; role: TextRole }): number => ruler.textWidth(e.line, e.role);
  const longest = Math.max(0, ...lines.map(measure));
  const word = Math.max(
    0,
    ...lines.flatMap((e) => e.line.split(/\s+/).map((w) => ruler.textWidth(w, e.role))),
  );
  const capMin = Math.ceil(word / g) * g;
  const narrowest = build(seq, ruler, capMin);
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
    const trial = build(seq, ruler, capMin + mid * g);
    if (trial.width <= limit) {
      best = trial;
      lo = mid;
    } else hi = mid - 1;
  }
  return best;
}
