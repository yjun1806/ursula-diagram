import { describe, expect, it } from 'vitest';
import { layeredRuler } from '../src/layered/index.ts';
import { chooseSpot } from '../src/layered/label-spot.ts';
import type { SpotQuery } from '../src/layered/label-spot.ts';
import { pixelRuler } from '../src/index.ts';
import { overlaps } from '../src/layout/labels.ts';

const ruler = layeredRuler(pixelRuler());
const own: SpotQuery['own'] = [[{ x: 0, y: 100 }, { x: 400, y: 100 }]];
const size = { w: 80, h: 24 };
const query = (extra: Partial<SpotQuery>): SpotQuery => ({
  own,
  foreign: [],
  nodes: [],
  placed: [],
  size,
  style: 'normal',
  ruler,
  basic: { x: 160, y: 88, w: size.w, h: size.h },
  basicSeg: 0,
  ...extra,
});

describe('chooseSpot with boxes to avoid and marks to keep clear', () => {
  it('keeps the basic place when nothing is in the way', () => {
    expect(chooseSpot(query({})).moved).toBe(false);
  });

  it('moves a label off a cluster border it would stand on', () => {
    const border = { x: 196, y: 0, w: 8, h: 300 };
    const spot = chooseSpot(query({ avoid: [border] }));
    expect(spot.moved).toBe(true);
    expect(overlaps(spot.rect, border)).toBe(false);
  });

  it('keeps a label 8 or more from the arrowhead at the end of its line', () => {
    const spot = chooseSpot(query({ basic: { x: 330, y: 88, w: size.w, h: size.h }, marks: [{ x: 400, y: 100 }] }));
    const gap = Math.max(400 - (spot.rect.x + spot.rect.w), spot.rect.x - 400, 0);
    expect(gap).toBeGreaterThanOrEqual(8);
  });
});
