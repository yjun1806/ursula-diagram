import { describe, expect, it } from 'vitest';
import { layoutSequence, parseSequence, pixelRuler, sequenceCheckLines } from '../src/index.ts';
import type { SequenceLayout } from '../src/index.ts';

const laid = (src: string, maxWidth?: number): SequenceLayout =>
  layoutSequence(parseSequence(src), pixelRuler(), maxWidth === undefined ? {} : { maxWidth });

const box = (x: number, y: number, w: number, h: number) => ({ x, y, w, h });

/** A drawing with nothing in it but what a test adds. */
function blank(over: Partial<SequenceLayout>): SequenceLayout {
  return { ...laid('sequenceDiagram\nA->>B: x'), participants: [], messages: [], notes: [], diagnostics: [], ...over };
}

describe('sequenceCheckLines', () => {
  it('reports a clean drawing in one line', () => {
    const l = laid('sequenceDiagram\nA->>B: hello\nB-->>A: hi\nNote right of B: a note');
    expect(sequenceCheckLines(l)).toEqual([`width ${l.width} · overflow none · text overlaps 0 · labels on lines 0`]);
  });

  it('reports overflow with the width it needs', () => {
    const src = `sequenceDiagram\n${Array.from({ length: 6 }, (_, i) => `P${i}->>P${i + 1}: m`).join('\n')}`;
    const l = laid(src, 300);
    const lines = sequenceCheckLines(l);
    expect(lines[0]).toContain('overflow yes');
    expect(lines).toContain(`overflow: Drawing is ${l.width} wide at its narrowest; the limit is 300.`);
  });

  it('counts two label boxes that share area, and names them', () => {
    const l = blank({
      messages: [
        { index: 0, from: 'A', to: 'B', fromX: 0, toX: 200, kind: 'call', y: 100, self: false, label: box(20, 80, 100, 16) },
        { index: 1, from: 'B', to: 'C', fromX: 200, toX: 400, kind: 'call', y: 100, self: false, label: box(110, 84, 100, 16) },
      ],
    });
    const lines = sequenceCheckLines(l);
    expect(lines[0]).toContain('text overlaps 1');
    expect(lines).toContain('overlap: message 1 label and message 2 label');
  });

  it('does not count boxes that only touch', () => {
    const l = blank({ notes: [{ statement: 0, box: box(0, 0, 50, 20) }, { statement: 1, box: box(50, 0, 50, 20) }] });
    expect(sequenceCheckLines(l)[0]).toContain('text overlaps 0');
  });

  it('counts a message line that crosses another label or a note, but not its own label', () => {
    const l = blank({
      messages: [
        { index: 0, from: 'A', to: 'B', fromX: 0, toX: 300, kind: 'call', y: 100, self: false, label: box(100, 92, 80, 16) },
        { index: 1, from: 'B', to: 'C', fromX: 300, toX: 600, kind: 'call', y: 60, self: false, label: box(350, 44, 80, 16) },
      ],
      notes: [{ statement: 2, box: box(380, 40, 60, 40) }],
    });
    const lines = sequenceCheckLines(l);
    expect(lines[0]).toContain('labels on lines 1');
    expect(lines).toContain('on line: note 1 under message 2');
  });

  it('ignores self messages as lines', () => {
    const l = blank({
      messages: [{ index: 0, from: 'A', to: 'A', fromX: 100, toX: 100, kind: 'call', y: 50, self: true, label: box(120, 40, 60, 16) }],
      notes: [{ statement: 1, box: box(90, 40, 40, 30) }],
    });
    expect(sequenceCheckLines(l)[0]).toContain('labels on lines 0');
  });
});
