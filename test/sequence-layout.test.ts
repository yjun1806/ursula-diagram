import { describe, expect, it } from 'vitest';
import { cellRuler, layoutSequence, parseSequence, pixelRuler } from '../src/index.ts';
import type { Box, Ruler, Sequence, SequenceLayout } from '../src/index.ts';

const checkout = `sequenceDiagram
  actor Shopper as 구매자
  participant Shop as Web Shop
  participant Pay as Payment Gateway
  participant Stock as Inventory
  Shopper->>Shop: Add item to cart
  Shop->>Stock: Reserve 2 units of the selected product
  Stock-->>Shop: Reserved
  Note right of Stock: Reservation expires after 15 minutes
  Shopper->>Pay: Pay with card
  Pay-->>Shopper: 결제 승인
  alt Payment approved
    Shop->>Shop: Create order
    Shop-)Stock: Confirm reservation
  else Declined
    Shop--xStock: Release reservation
  end
  loop Until delivered
    Shopper->>Shop: Check order status
  end
  Note over Shopper,Pay: Receipt is sent by email
  Note over Shop: Done
  Note left of Shopper: Guest checkout`;

const noActivation = `sequenceDiagram
  A->>B: one
  B-->>C: two
  C->>A: three, spanning two lifelines
  A->>A: self`;

function seqOf(src: string): Sequence {
  return parseSequence(src);
}

const rulers: Array<[string, () => Ruler]> = [
  ['pixel', pixelRuler],
  ['cell', cellRuler],
];

function overlap(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

function closeOf(seq: Sequence, open: number): number {
  let depth = 0;
  for (let i = open; i < seq.statements.length; i++) {
    const s = seq.statements[i];
    if (s?.kind === 'open') depth++;
    if (s?.kind === 'close' && --depth === 0) return i;
  }
  throw new Error('unclosed');
}

describe.each(rulers)('layoutSequence invariants (%s ruler)', (_, make) => {
  const ruler = make();
  const seq = seqOf(checkout);
  const l: SequenceLayout = layoutSequence(seq, ruler);

  it('places headers in source order without overlap and at one height', () => {
    expect(l.participants.map((p) => p.id)).toEqual(['Shopper', 'Shop', 'Pay', 'Stock']);
    for (let i = 0; i + 1 < l.participants.length; i++) {
      const a = l.participants[i]?.box;
      const b = l.participants[i + 1]?.box;
      if (!a || !b) throw new Error('missing');
      expect(a.x + a.w).toBeLessThanOrEqual(b.x);
    }
    expect(new Set(l.participants.map((p) => p.box.h)).size).toBe(1);
    expect(new Set(l.participants.map((p) => p.box.y)).size).toBe(1);
  });

  it('puts the lifeline in the middle of every header', () => {
    for (const p of l.participants) {
      expect(p.x).toBeGreaterThanOrEqual(p.box.x);
      expect(p.x).toBeLessThan(p.box.x + p.box.w);
      expect(p.x - p.box.x).toBe(p.box.x + p.box.w - ruler.sequence.stroke - p.x);
    }
  });

  it('ties every message endpoint to the lifeline of its participant', () => {
    const x = new Map(l.participants.map((p) => [p.id, p.x] as const));
    for (const m of l.messages) {
      expect(m.fromX).toBe(x.get(m.from));
      expect(m.toX).toBe(x.get(m.to));
    }
  });

  it('keeps rows strictly increasing in source order', () => {
    const ys = l.rows.map((r) => r.y);
    for (let i = 0; i + 1 < ys.length; i++) expect(ys[i]).toBeLessThan(ys[i + 1] ?? 0);
    for (let i = 0; i + 1 < l.rows.length; i++) {
      const r = l.rows[i];
      const next = l.rows[i + 1];
      expect((r?.y ?? 0) + (r?.h ?? 0)).toBeLessThanOrEqual(next?.y ?? 0);
      expect(r?.statement).toBeLessThan(next?.statement ?? 0);
    }
    const lines = l.messages.map((m) => m.y);
    for (let i = 0; i + 1 < lines.length; i++) expect(lines[i]).toBeLessThan(lines[i + 1] ?? 0);
  });

  it('keeps labels clear of headers and of each other', () => {
    const headerBottom = Math.max(...l.participants.map((p) => p.box.y + p.box.h));
    const boxes = [...l.messages.flatMap((m) => (m.label ? [m.label] : [])), ...l.notes.map((n) => n.box)];
    for (const b of boxes) expect(b.y).toBeGreaterThanOrEqual(headerBottom);
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i];
        const b = boxes[j];
        if (a && b) expect(overlap(a, b)).toBe(false);
      }
    }
  });

  it('keeps a message label between the two lifelines it connects', () => {
    for (const m of l.messages) {
      if (!m.label || m.self) continue;
      const lo = Math.min(m.fromX, m.toX);
      const hi = Math.max(m.fromX, m.toX);
      expect(m.label.x).toBeGreaterThan(lo);
      expect(m.label.x + m.label.w).toBeLessThanOrEqual(hi + ruler.sequence.stroke);
    }
  });

  it('wraps every frame around its rows', () => {
    expect(l.frames).toHaveLength(2);
    for (const f of l.frames) {
      const close = closeOf(seq, f.statement);
      const inside = l.rows.filter((r) => r.statement >= f.statement && r.statement <= close);
      for (const r of inside) {
        expect(r.y).toBeGreaterThanOrEqual(f.y);
        expect(r.y + r.h).toBeLessThanOrEqual(f.y + f.h);
      }
      for (const m of l.messages) {
        const stmt = l.rows.find((r) => r.y <= m.y && m.y <= r.y + r.h)?.statement ?? -1;
        if (stmt > f.statement && stmt < close) {
          expect(Math.min(m.fromX, m.toX)).toBeGreaterThan(f.x);
          expect(Math.max(m.fromX, m.toX)).toBeLessThan(f.x + f.w);
        }
      }
    }
    const alt = l.frames.find((f) => f.block === 'alt');
    expect(alt?.dividers).toHaveLength(1);
    const altDivider = alt?.dividers[0] ?? 0;
    expect(altDivider).toBeGreaterThan(alt?.y ?? 0);
    expect(altDivider).toBeLessThan((alt?.y ?? 0) + (alt?.h ?? 0));
  });

  it('nests frames inside their parent on every side', () => {
    const nested = layoutSequence(
      seqOf('sequenceDiagram\nA->>B: x\nloop Outer\nopt Inner\nA->>B: y\nend\nB->>A: z\nend'),
      ruler,
    );
    const outer = nested.frames.find((f) => f.block === 'loop');
    const inner = nested.frames.find((f) => f.block === 'opt');
    if (!outer || !inner) throw new Error('missing frames');
    expect(inner.x).toBeGreaterThan(outer.x);
    expect(inner.x + inner.w).toBeLessThan(outer.x + outer.w);
    expect(inner.y).toBeGreaterThan(outer.y);
    expect(inner.y + inner.h).toBeLessThan(outer.y + outer.h);
  });

  it('keeps everything inside the canvas', () => {
    for (const p of l.participants) {
      expect(p.box.x).toBeGreaterThanOrEqual(0);
      expect(p.box.x + p.box.w).toBeLessThanOrEqual(l.width);
    }
    for (const f of l.frames) {
      expect(f.x).toBeGreaterThanOrEqual(0);
      expect(f.x + f.w).toBeLessThanOrEqual(l.width);
      expect(f.y + f.h).toBeLessThanOrEqual(l.height);
    }
    for (const n of l.notes) {
      expect(n.box.x).toBeGreaterThanOrEqual(0);
      expect(n.box.x + n.box.w).toBeLessThanOrEqual(l.width);
    }
  });

  it('puts every box and line coordinate on the ruler grid', () => {
    const on = (v: number): boolean => Math.abs(v / ruler.grid - Math.round(v / ruler.grid)) < 1e-9;
    for (const item of l.scene.items) {
      if (item.kind === 'box') for (const v of [item.x, item.y, item.w, item.h]) expect(on(v)).toBe(true);
      if (item.kind === 'line') for (const p of item.points) expect(on(p.x) && on(p.y)).toBe(true);
    }
    expect(on(l.width) && on(l.height)).toBe(true);
  });

  it('is deterministic', () => {
    expect(JSON.stringify(layoutSequence(seqOf(checkout), make()))).toBe(JSON.stringify(l));
  });
});

describe('layoutSequence geometry in pixels', () => {
  const ruler = pixelRuler();

  it('ends every message line exactly on the lifelines when nothing is activated', () => {
    const l = layoutSequence(seqOf(noActivation), ruler);
    const lines = l.scene.items.filter((i) => i.kind === 'line' && i.data?.message !== undefined);
    expect(lines).toHaveLength(4);
    for (const m of l.messages) {
      const line = lines.find((i) => i.kind === 'line' && i.data?.message === String(m.index));
      if (line?.kind !== 'line') throw new Error('missing line');
      const first = line.points[0];
      const last = line.points[line.points.length - 1];
      expect(first?.x).toBe(m.fromX);
      expect(last?.x).toBe(m.toX);
      expect(first?.y).toBe(m.y);
    }
  });

  it('draws a self message as a loop to the right of its lifeline', () => {
    const l = layoutSequence(seqOf('sequenceDiagram\nA->>B: x\nB->>B: think about it\nB->>A: y'), ruler);
    const self = l.messages.find((m) => m.self);
    const line = l.scene.items.find((i) => i.kind === 'line' && i.data?.message === '1');
    if (line?.kind !== 'line' || !self) throw new Error('missing self message');
    expect(line.points).toHaveLength(4);
    expect(Math.max(...line.points.map((p) => p.x))).toBeGreaterThan(self.fromX + ruler.sequence.loopW - 1);
    expect(self.label?.x).toBeGreaterThan(Math.max(...line.points.map((p) => p.x)));
  });

  it('grows a row for every extra label line', () => {
    const one = layoutSequence(seqOf('sequenceDiagram\nA->>B: one'), ruler);
    const three = layoutSequence(seqOf('sequenceDiagram\nA->>B: one<br/>two<br/>three'), ruler);
    expect(three.rows[0]?.h).toBe((one.rows[0]?.h ?? 0) + 2 * ruler.lineHeight('edge'));
    expect(three.messages[0]?.label?.h).toBe(3 * ruler.lineHeight('edge'));
  });

  it('draws activations as bars on the lifeline and offsets nested ones', () => {
    const l = layoutSequence(
      seqOf('sequenceDiagram\nA->>+B: x\nB->>+B: again\nB-->>-B: inner done\nB-->>-A: done'),
      ruler,
    );
    const bars = l.scene.items.filter((i) => i.kind === 'box' && i.role?.includes('active'));
    expect(bars).toHaveLength(2);
    const [a, b] = bars;
    if (a?.kind !== 'box' || b?.kind !== 'box') throw new Error('missing bars');
    const lifeline = l.participants[1]?.x ?? 0;
    const outer = [a, b].reduce((p, q) => (p.h > q.h ? p : q));
    const inner = outer === a ? b : a;
    expect(outer.x).toBe(lifeline - ruler.sequence.barW / 2);
    expect(inner.x).toBe(outer.x + ruler.sequence.barNest);
    expect(inner.y).toBeGreaterThan(outer.y);
    expect(inner.y + inner.h).toBeLessThan(outer.y + outer.h);
  });

  it('lets explicit activate and deactivate span the messages between them', () => {
    const l = layoutSequence(seqOf('sequenceDiagram\nactivate A\nA->>B: x\nB->>A: y\ndeactivate A'), ruler);
    const bar = l.scene.items.find((i) => i.kind === 'box' && i.role?.includes('active'));
    if (bar?.kind !== 'box') throw new Error('missing bar');
    expect(bar.y).toBe(l.messages[0]?.y);
    expect(bar.y + bar.h).toBe(l.messages[1]?.y);
  });

  it('spaces all lifelines by one pitch that fits the widest label between neighbours', () => {
    const narrow = layoutSequence(seqOf('sequenceDiagram\nA->>B: ok\nB->>C: ok'), ruler);
    const wide = layoutSequence(seqOf('sequenceDiagram\nA->>B: ok\nB->>C: a much longer label than the minimum span'), ruler);
    const gaps = (l: SequenceLayout): number[] => l.participants.slice(1).map((p, i) => p.x - (l.participants[i]?.x ?? 0));
    expect(new Set(gaps(narrow)).size).toBe(1);
    expect(new Set(gaps(wide)).size).toBe(1);
    expect(narrow.pitch).toBe(narrow.headerWidth + ruler.sequence.pitchGap);
    expect(wide.pitch).toBeGreaterThan(narrow.pitch);
    const label = wide.messages[1]?.label;
    expect((label?.w ?? 0) + ruler.sequence.labelPad).toBeLessThanOrEqual(wide.pitch + 2 * ruler.sequence.labelBgPad);
    expect(narrow.headerWidth).toBe(120);
    expect(narrow.pitch).toBe(168);
  });

  it('shares one header width and sizes it by the widest name', () => {
    const l = layoutSequence(seqOf('sequenceDiagram\nparticipant A\nparticipant Very Long Participant Name Here\nA->>Very Long Participant Name Here: x'), ruler);
    expect(new Set(l.participants.map((p) => p.box.w))).toEqual(new Set([l.headerWidth]));
    expect(l.headerWidth).toBeGreaterThan(120);
    expect(l.headerWidth % ruler.grid).toBe(0);
  });

  it('only needs a label that spans several columns to fit its own span', () => {
    const one = layoutSequence(seqOf('sequenceDiagram\nA->>B: ok\nB->>C: ok'), ruler);
    const spanning = layoutSequence(seqOf('sequenceDiagram\nA->>B: ok\nB->>C: ok\nA->>C: a label wider than one column, not two'), ruler);
    expect(spanning.pitch).toBe(one.pitch);
  });

  it('centres the label of a multi-column message in the first column from the sender', () => {
    const l = layoutSequence(seqOf('sequenceDiagram\nA->>B: ok\nB->>C: ok\nA->>C: short\nC-->>A: back'), ruler);
    const forth = l.messages[2];
    const back = l.messages[3];
    const [a, b, c] = l.participants.map((p) => p.x);
    const centre = (box: Box | undefined): number => (box?.x ?? 0) + (box?.w ?? 0) / 2;
    expect(centre(forth?.label)).toBe(((a ?? 0) + (b ?? 0)) / 2);
    expect(centre(back?.label)).toBe(((c ?? 0) + (b ?? 0)) / 2);
  });

  it('draws bars with message lines starting and ending at the bar edge', () => {
    const l = layoutSequence(seqOf('sequenceDiagram\nA->>+B: x\nB->>A: y\nB-->>-A: z'), ruler);
    const b = l.participants[1]?.x ?? 0;
    const line = (i: number) => l.scene.items.find((it) => it.kind === 'line' && it.data?.message === String(i));
    const first = line(0);
    const second = line(1);
    if (first?.kind !== 'line' || second?.kind !== 'line') throw new Error('missing lines');
    expect(first.points[1]?.x).toBe(b - ruler.sequence.barW / 2);
    expect(second.points[0]?.x).toBe(b - ruler.sequence.barW / 2);
  });

  it('ends a bar that is never deactivated 16 below the last message that involves its participant', () => {
    const l = layoutSequence(seqOf('sequenceDiagram\nA->>+B: x\nB-->>A: y\nA->>C: z\nC->>A: w'), ruler);
    const bar = l.scene.items.find((i) => i.kind === 'box' && i.role?.includes('active'));
    if (bar?.kind !== 'box') throw new Error('missing bar');
    expect(bar.y + bar.h).toBe((l.messages[1]?.y ?? 0) + ruler.sequence.barTail + ruler.sequence.stroke);
    expect(bar.y + bar.h).toBeLessThan(l.height - ruler.sequence.margin - ruler.sequence.tail);
  });

  it('draws a nested bar over the bar it sits on, shifted right', () => {
    const l = layoutSequence(seqOf('sequenceDiagram\nA->>+B: one\nA->>+B: two\nB-->>-A: three\nB-->>-A: four'), ruler);
    const bars = l.scene.items.filter((i) => i.kind === 'box' && i.role?.includes('active'));
    if (bars[0]?.kind !== 'box' || bars[1]?.kind !== 'box') throw new Error('missing bars');
    expect(bars[1].x - bars[0].x).toBe(ruler.sequence.barNest);
    expect(bars[1].y).toBeGreaterThan(bars[0].y);
  });

  it('keeps the longest label clear of the lifelines by half the label pad on each side', () => {
    const l = layoutSequence(seqOf('sequenceDiagram\nA->>B: Hello John, how are you?'), ruler);
    const w = ruler.textWidth('Hello John, how are you?', 'edge');
    expect(l.pitch).toBeGreaterThanOrEqual(w + ruler.sequence.labelPad);
  });

  it('continues a bar that ends where a frame closes past the frame bottom', () => {
    const l = layoutSequence(seqOf('sequenceDiagram\nA->>B: x\nactivate B\nopt c\nB->>A: y\nend\ndeactivate B\nA->>B: z'), ruler);
    const bar = l.scene.items.find((i) => i.kind === 'box' && i.role?.includes('active'));
    const frame = l.frames[0];
    if (bar?.kind !== 'box' || frame === undefined) throw new Error('missing bar or frame');
    expect(bar.y + bar.h).toBe(frame.y + frame.h + ruler.sequence.barPastFrame);
  });

  it('puts a note right above the label of the message below it', () => {
    const l = layoutSequence(seqOf('sequenceDiagram\nA->>B: x\nNote over A: n\nB->>A: y'), ruler);
    const note = l.notes[0];
    const label = l.messages[1]?.label;
    expect((label?.y ?? 0) - ((note?.box.y ?? 0) + (note?.box.h ?? 0))).toBe(ruler.sequence.gapNote);
  });

  it('spans a frame over the lifelines inside it, a pad wide on each side', () => {
    const l = layoutSequence(seqOf('sequenceDiagram\nparticipant A\nparticipant B\nparticipant C\nparticipant D\nA->>B: x\nloop L\nB->>C: y\nend'), ruler);
    const frame = l.frames[0];
    const pad = ruler.sequence.framePad;
    expect(frame?.x).toBe((l.participants[1]?.x ?? 0) - pad);
    expect((frame?.x ?? 0) + (frame?.w ?? 0)).toBe((l.participants[2]?.x ?? 0) + pad);
  });

  it('keeps a note that can wrap inside the first and last header edges', () => {
    const src = 'sequenceDiagram\nA->>B: x\nNote over A: a long note about the first participant that has to wrap\nNote over B: another long note about the last participant that wraps too';
    const l = layoutSequence(seqOf(src), ruler);
    const first = l.participants[0]?.box;
    const last = l.participants[1]?.box;
    for (const n of l.notes) {
      expect(n.box.x).toBeGreaterThanOrEqual(first?.x ?? 0);
      expect(n.box.x + n.box.w).toBeLessThanOrEqual((last?.x ?? 0) + (last?.w ?? 0));
    }
    expect(l.notes.map((n) => n.box.h).every((h) => h > ruler.lineHeight('line') + 2 * ruler.sequence.notePadY)).toBe(true);
  });

  it('maps arrows to message kinds', () => {
    const l = layoutSequence(seqOf('sequenceDiagram\nA->>B: a\nA-->>B: b\nA-)B: c\nA--)B: d\nA-xB: e\nA--xB: f\nA->B: g\nA-->B: h'), ruler);
    expect(l.messages.map((m) => m.kind)).toEqual(['call', 'reply', 'async', 'async', 'failed', 'failed', 'plain', 'plain']);
    const kinds = l.scene.items.flatMap((i) => (i.kind === 'line' && i.data?.kind ? [i.data.kind] : []));
    expect(kinds).toEqual(l.messages.map((m) => m.kind));
  });

  it('adds a legend with the kinds in use, renamed or removed on request', () => {
    const src = 'sequenceDiagram\nA->>B: a\nB-->>A: b\nA-xB: c';
    const texts = (l: SequenceLayout): string[] => l.scene.items.flatMap((i) => (i.kind === 'text' && i.role?.includes('legend') ? [i.text] : []));
    const l = layoutSequence(seqOf(src), ruler);
    expect(l.legend.map((e) => e.kind)).toEqual(['call', 'reply', 'failed']);
    expect(texts(l)).toEqual(['Call', 'Reply', 'Failed']);
    const renamed = layoutSequence(seqOf(src), ruler, { legend: { call: 'Request', failed: 'Error' } });
    expect(texts(renamed)).toEqual(['Request', 'Reply', 'Error']);
    const off = layoutSequence(seqOf(src), ruler, { legend: false });
    expect(off.legend).toEqual([]);
    expect(texts(off)).toEqual([]);
    expect(off.height).toBeLessThan(l.height);
    expect(layoutSequence(seqOf('sequenceDiagram\nA->>B: a\nB->>A: b'), ruler).legend).toEqual([]);
  });

  it('makes a note over two participants cover both lifelines', () => {
    const l = layoutSequence(seqOf('sequenceDiagram\nA->>B: x\nNote over A,B: a note that is rather wide for two neighbours'), ruler);
    const box = l.notes[0]?.box;
    expect(box?.x).toBeLessThan(l.participants[0]?.x ?? 0);
    expect((box?.x ?? 0) + (box?.w ?? 0)).toBeGreaterThan(l.participants[1]?.x ?? 0);
  });

  it('keeps the margin on the left when a note sits left of the first participant', () => {
    const l = layoutSequence(seqOf('sequenceDiagram\nA->>B: x\nNote left of A: left side note'), ruler);
    expect(l.notes[0]?.box.x).toBeGreaterThanOrEqual(0);
    expect((l.notes[0]?.box.x ?? 0) + (l.notes[0]?.box.w ?? 0)).toBeLessThan(l.participants[0]?.x ?? 0);
  });

  it('handles a diagram without participants', () => {
    const l = layoutSequence(seqOf('sequenceDiagram'), ruler);
    expect(l.scene.items).toEqual([]);
    expect(l.width).toBeGreaterThan(0);
  });
});

describe('layoutSequence fit', () => {
  const long = `sequenceDiagram
  participant A as Browser
  participant B as Gateway
  participant C as Worker
  A->>B: Upload the quarterly report with all attachments included
  B->>C: Queue a conversion job for the uploaded report
  C-->>A: Notify the browser that the conversion has finished successfully`;

  it('fits the width when wrapping texts makes that possible', () => {
    const natural = layoutSequence(seqOf(long), pixelRuler());
    expect(natural.width).toBeGreaterThan(700);
    const fitted = layoutSequence(seqOf(long), pixelRuler(), { maxWidth: 600 });
    expect(fitted.width).toBeLessThanOrEqual(600);
    expect(fitted.diagnostics).toEqual([]);
    expect(fitted.messages[0]?.label?.h).toBeGreaterThan(pixelRuler().lineHeight('edge'));
  });

  it('uses the ruler default width for pixels and none for cells', () => {
    const wide = `sequenceDiagram\n${Array.from({ length: 7 }, (_, i) => `P${i}->>P${i + 1}: a message with a fairly long text to need room`).join('\n')}`;
    expect(layoutSequence(seqOf(wide), pixelRuler()).width).toBeLessThanOrEqual(1280);
    expect(layoutSequence(seqOf(wide), cellRuler()).width).toBeGreaterThan(300);
  });

  it('keeps the natural drawing when it fits', () => {
    const natural = layoutSequence(seqOf(long), pixelRuler());
    expect(layoutSequence(seqOf(long), pixelRuler(), { maxWidth: natural.width })).toEqual(natural);
  });

  it('reports overflow when even the narrowest drawing does not fit', () => {
    const l = layoutSequence(seqOf(long), pixelRuler(), { maxWidth: 200 });
    expect(l.width).toBeGreaterThan(200);
    expect(l.diagnostics).toHaveLength(1);
    expect(l.diagnostics[0]).toMatchObject({ kind: 'overflow', nodes: ['A', 'B', 'C'] });
  });

  it('wraps participant names at word boundaries when the headers alone are too wide', () => {
    const heads = `sequenceDiagram
  participant A as Browser extension background
  participant B as Payment gateway service
  participant C as Conversion worker pool
  participant D as Notification delivery queue
  A->>B: a
  B->>C: b
  C->>D: c`;
    const natural = layoutSequence(seqOf(heads), pixelRuler(), { maxWidth: Infinity });
    expect(natural.width).toBeGreaterThan(700);
    const fitted = layoutSequence(seqOf(heads), pixelRuler(), { maxWidth: 700 });
    expect(fitted.width).toBeLessThanOrEqual(700);
    expect(fitted.diagnostics).toEqual([]);
    const texts = fitted.scene.items.flatMap((item) => ('text' in item && typeof item.text === 'string' ? [item.text] : []));
    expect(texts).toContain('background');
    expect(texts).not.toContain('Browser extension background');
  });

  it('fits a cell drawing to the terminal width', () => {
    const l = layoutSequence(seqOf(long), cellRuler(), { maxWidth: 70 });
    expect(l.width).toBeLessThanOrEqual(70);
    expect(l.diagnostics).toEqual([]);
  });
});
