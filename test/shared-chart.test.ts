import { describe, expect, it } from 'vitest';
import { trimmedNumber } from '../src/chart/format.ts';
import { ceilTo, FLOAT_NOISE, floorTo, round2, roundTo } from '../src/chart/grid.ts';
import { anchoredBox, boxesOverlap, clashCost, pickLeastClash, trendAt } from '../src/chart/label-place.ts';
import type { Box } from '../src/chart/label-place.ts';
import { nearestSeries } from '../src/chart/series-color.ts';
import { readdirSync } from 'node:fs';

describe('grid', () => {
  it('rounds to multiples of 4 by default', () => {
    expect(ceilTo(5)).toBe(8);
    expect(ceilTo(8)).toBe(8);
    expect(floorTo(7)).toBe(4);
    expect(roundTo(6)).toBe(8);
    expect(roundTo(5.9)).toBe(4);
  });

  it('takes another step', () => {
    expect(ceilTo(17, 8)).toBe(24);
    expect(ceilTo(1, 16)).toBe(16);
  });

  it('forgives float noise only when asked', () => {
    expect(ceilTo(8 + 1e-12)).toBe(12);
    expect(ceilTo(8 + 1e-12, 4, FLOAT_NOISE)).toBe(8);
    expect(floorTo(8 - 1e-12)).toBe(4);
    expect(floorTo(8 - 1e-12, 4, FLOAT_NOISE)).toBe(8);
  });

  it('rounds to two decimals', () => {
    expect(round2(1.005 + 0.2349)).toBe(1.24);
  });
});

describe('trimmedNumber', () => {
  it('drops float noise and trailing zeros', () => {
    expect(trimmedNumber(0.1 + 0.2, 10)).toBe('0.3');
    expect(trimmedNumber(2.5, 2)).toBe('2.5');
    expect(trimmedNumber(3.14159, 2)).toBe('3.14');
    expect(trimmedNumber(10, 2)).toBe('10');
  });
});

describe('label placement', () => {
  const box = (x0: number, y0: number, x1: number, y1: number): Box => ({ x0, x1, y0, y1 });

  it('builds a text box around its anchor', () => {
    expect(anchoredBox(10, 20, 6, 'start', 4)).toEqual(box(10, 18, 16, 22));
    expect(anchoredBox(10, 20, 6, 'middle', 4)).toEqual(box(7, 18, 13, 22));
    expect(anchoredBox(10, 20, 6, 'end', 4)).toEqual(box(4, 18, 10, 22));
  });

  it('counts boxes closer than the pad as overlapping', () => {
    expect(boxesOverlap(box(0, 0, 10, 10), box(11, 0, 20, 10), 0)).toBe(false);
    expect(boxesOverlap(box(0, 0, 10, 10), box(11, 0, 20, 10), 2)).toBe(true);
    expect(boxesOverlap(box(0, 0, 10, 10), box(0, 12, 10, 20), 1)).toBe(false);
  });

  const bounds = box(0, 0, 100, 100);

  it('scores a collision by what it touches', () => {
    const ctx = { bounds, fixed: [box(0, 0, 10, 10)], placed: [box(50, 50, 60, 60)], samples: [{ x: 80, y: 80 }] };
    expect(clashCost(box(30, 30, 40, 40), ctx)).toBe(0);
    expect(clashCost(box(0, 0, 10, 10), ctx)).toBe(1);
    expect(clashCost(box(61, 50, 70, 60), ctx)).toBe(2);
    expect(clashCost(box(75, 75, 85, 85), ctx)).toBe(1);
    expect(clashCost(box(95, 95, 105, 105), ctx)).toBe(100);
  });

  it('picks the first free candidate, else the first cheapest', () => {
    const ctx = { bounds, fixed: [box(0, 0, 20, 20)], placed: [], samples: [] };
    const cost = (b: Box): number => clashCost(b, ctx);
    const at = (x: number): Box => box(x, 0, x + 5, 5);
    expect(pickLeastClash([0, 10, 40, 50], at, cost)?.candidate).toBe(40);
    expect(pickLeastClash([0, 2, 4], at, cost)?.candidate).toBe(0);
    expect(pickLeastClash<number>([], at, cost)).toBeUndefined();
  });

  it('names the shape of a line at a point', () => {
    expect(trendAt(3, 1, 2)).toBe('peak');
    expect(trendAt(1, 3, 2)).toBe('valley');
    expect(trendAt(2, 1, 3)).toBe('rising');
    expect(trendAt(2, 3, 1)).toBe('falling');
    expect(trendAt(2, undefined, undefined)).toBe('peak');
    expect(trendAt(5, undefined, 2)).toBe('falling');
    expect(trendAt(5, 2, undefined)).toBe('rising');
  });
});

describe('nearest series colour', () => {
  // [asked colour, series, series when the first is left out], as the three chart types drew them before sharing one function.
  const table: [string, number, number][] = [["#ff0000",6,6],["#f00",6,6],["#00ff00",5,5],["#0000ff",1,4],["#ffff00",7,7],["#ff00ff",1,6],["#00ffff",2,2],["#808080",8,8],["#7447c8",1,4],["#0f9b95",2,2],["#d58d25",3,3],["#1f7dcf",4,4],["#399d57",5,5],["#dd5847",6,6],["#9ca73e",7,7],["#6b727e",8,8],["#ff9900",3,3],["#123456",4,4],["#abcdef",4,4],["#663399",1,4],["#ffffff",8,8],["#000000",8,8],["#ff7f50",6,6],["#8a2be2",1,4]];

  it('picks the series nearest in hue, the neutral last for a grey, and can leave out the first', () => {
    for (const [hex, any, notFirst] of table) {
      expect(nearestSeries(hex), hex).toBe(any);
      expect(nearestSeries(hex, { skipFirst: true }), hex).toBe(notFirst);
    }
  });

  it('is the one copy: the chart types keep no colour module of their own', () => {
    for (const dir of ['sankey', 'radar', 'quadrant']) expect(readdirSync(new URL(`../src/${dir}/`, import.meta.url))).not.toContain('colors.ts');
  });
});
