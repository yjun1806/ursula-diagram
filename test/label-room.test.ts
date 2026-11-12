import { describe, expect, it } from 'vitest';
import { layout, parse, pixelRuler } from '../src/index.ts';
import { labelBox, labelLines, lineBeside, roomAround, splitLabel } from '../src/layered/label-room.ts';

const ruler = pixelRuler();

describe('room around a label', () => {
  it('keeps 16px of line beside a solid label and 24px beside a dotted one, and 8px more at the arrowhead', () => {
    expect(lineBeside('normal')).toBe(16);
    expect(lineBeside('thick')).toBe(16);
    expect(lineBeside('dotted')).toBe(24);
    expect(roomAround('normal')).toBe(40);
    expect(roomAround('dotted')).toBe(56);
  });

  it('wraps a label at the space that leaves two lines nearest in width', () => {
    const lines = splitLabel('one two three four', ruler);
    expect(lines).toEqual(['one two', 'three four']);
    expect(splitLabel('single', ruler)).toBeUndefined();
  });

  it('wraps only when two lines need fewer places than one', () => {
    const text = 'profile violation confirmed';
    const one = labelBox([text], ruler).w + roomAround('normal');
    expect(one).toBeGreaterThan(40);
    const unit = 60;
    expect(labelLines(text, 'normal', ruler, 400, unit)).toEqual([text]);
    const wrapped = labelLines(text, 'normal', ruler, 40, unit);
    expect(wrapped).toHaveLength(2);
    expect(labelLines('short', 'normal', ruler, 200, unit)).toEqual(['short']);
  });
});

describe('labels on straight edges between neighbours', () => {
  const src = 'flowchart LR\n  A[Start] -->|a fairly long label for it| B[Next]\n  B -.->|dotted one| C[Last]';

  it('leave the line visible on both sides, more of it at the arrowhead', () => {
    const l = layout(parse(src), pixelRuler());
    expect(l.diagnostics.filter((d) => d.kind === 'label-tight')).toEqual([]);
    for (const e of l.edges) {
      const label = e.label;
      expect(label).toBeDefined();
      if (!label) continue;
      const [a, z] = e.points as [{ x: number }, { x: number }];
      const tail = label.x - a.x;
      const head = z.x - (label.x + label.w);
      const keep = e.style === 'dotted' ? 24 : 16;
      expect(tail).toBeGreaterThanOrEqual(keep - 0.5);
      expect(head).toBeGreaterThanOrEqual(keep + 8 - 0.5);
    }
  });

  it('record the gap the drawing used and the default one', () => {
    const l = layout(parse(src), pixelRuler());
    expect(l.gap).toBeGreaterThan(0);
    expect(l.gapDefault).toBeGreaterThan(0);
  });
});
