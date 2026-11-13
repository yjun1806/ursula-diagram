import { describe, expect, it } from 'vitest';
import { cellRuler, pixelRuler } from '../src/index.ts';
import { placeLabel } from '../src/layout/labels.ts';

const ruler = pixelRuler();
const size = { w: 40, h: 20 };

describe('placeLabel', () => {
  it('sits on a vertical segment, centred on it, in pixels', () => {
    const placed = placeLabel([{ x: 100, y: 0 }, { x: 100, y: 120 }], size, [], [], ruler);
    expect(placed.overlap).toBe(false);
    expect(placed.rect.x + placed.rect.w / 2).toBe(100);
  });

  it('sits beside a vertical segment and not on it in a terminal', () => {
    const placed = placeLabel([{ x: 20, y: 0 }, { x: 20, y: 12 }], { w: 6, h: 1 }, [], [], cellRuler());
    expect(placed.overlap).toBe(false);
    expect(placed.rect.x >= 20 || placed.rect.x + placed.rect.w <= 20).toBe(true);
  });

  it('sits on a horizontal segment when the space is free', () => {
    const placed = placeLabel([{ x: 0, y: 50 }, { x: 200, y: 50 }], size, [], [], ruler);
    expect(placed.overlap).toBe(false);
    expect(placed.rect.y).toBeLessThan(50);
    expect(placed.rect.y + placed.rect.h).toBeGreaterThan(50);
  });

  it('slides off a segment of another edge', () => {
    const foreign = [[{ x: 0, y: 50 }, { x: 200, y: 50 }]] as const;
    const placed = placeLabel([{ x: 100, y: 0 }, { x: 100, y: 120 }], size, [], [], ruler, [...foreign]);
    expect(placed.overlap).toBe(false);
    expect(placed.rect.y + placed.rect.h <= 50 || placed.rect.y >= 50).toBe(true);
  });

  it('reports an overlap when another edge covers every position', () => {
    const foreign = [[{ x: 60, y: -10 }, { x: 140, y: -10 }], [{ x: 60, y: -10 }, { x: 60, y: 140 }], [{ x: 140, y: -10 }, { x: 140, y: 140 }], [{ x: 60, y: 60 }, { x: 140, y: 60 }]] as const;
    const wall = Array.from({ length: 14 }, (_, k) => [{ x: 60, y: k * 10 }, { x: 140, y: k * 10 }] as const);
    const placed = placeLabel([{ x: 100, y: 0 }, { x: 100, y: 120 }], size, [], [], ruler, [...foreign, ...wall]);
    expect(placed.overlap).toBe(true);
  });
});
