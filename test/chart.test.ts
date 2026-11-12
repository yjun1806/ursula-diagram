import { describe, expect, it } from 'vitest';
import { arcPath } from '../src/chart/arc.ts';
import { monotonePath } from '../src/chart/monotone.ts';
import { niceTicks } from '../src/chart/ticks.ts';

describe('niceTicks', () => {
  it('steps by 1000 from 4000 to 11000', () => {
    expect(niceTicks(4000, 11000)).toEqual([4000, 5000, 6000, 7000, 8000, 9000, 10000, 11000]);
  });

  it('starts at or below min and ends at or above max', () => {
    expect(niceTicks(3, 97)).toEqual([0, 20, 40, 60, 80, 100]);
    expect(niceTicks(-15, 40)).toEqual([-20, -10, 0, 10, 20, 30, 40]);
  });

  it('uses steps of 1, 2 or 5 times a power of ten', () => {
    for (const [lo, hi] of [[0, 7], [0, 12], [0, 45], [0, 0.9], [120, 730]] as const) {
      const t = niceTicks(lo, hi);
      const step = (t[1] ?? 0) - (t[0] ?? 0);
      const mantissa = step / 10 ** Math.floor(Math.log10(step));
      expect([1, 2, 5]).toContain(Math.round(mantissa * 1e6) / 1e6);
    }
  });

  it('keeps fractional ticks free of float noise', () => {
    expect(niceTicks(0, 0.5)).toEqual([0, 0.1, 0.2, 0.3, 0.4, 0.5]);
  });

  it('gives the one value when min equals max', () => {
    expect(niceTicks(5, 5)).toEqual([5]);
  });

  it('takes the count as a target', () => {
    expect(niceTicks(0, 100, 11)).toEqual([0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
  });
});

/** Cubic segments of a monotone path as [p0, c1, c2, p1]. */
function segments(d: string): [number, number][][] {
  const nums = (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
  const out: [number, number][][] = [];
  let prev: [number, number] = [nums[0] ?? 0, nums[1] ?? 0];
  for (let i = 2; i + 5 < nums.length + 0; i += 6) {
    const c1: [number, number] = [nums[i] ?? 0, nums[i + 1] ?? 0];
    const c2: [number, number] = [nums[i + 2] ?? 0, nums[i + 3] ?? 0];
    const p: [number, number] = [nums[i + 4] ?? 0, nums[i + 5] ?? 0];
    out.push([prev, c1, c2, p]);
    prev = p;
  }
  return out;
}

function bezierY(s: [number, number][], t: number): number {
  const [p0, p1, p2, p3] = s.map((p) => p[1]) as [number, number, number, number];
  const u = 1 - t;
  return u ** 3 * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t ** 3 * p3;
}

describe('monotonePath', () => {
  it('is empty for one point and a straight line for two', () => {
    expect(monotonePath([])).toBe('');
    expect(monotonePath([{ x: 1, y: 2 }])).toBe('');
    expect(monotonePath([{ x: 0, y: 0 }, { x: 10, y: 5 }])).toBe('M0 0 L10 5');
  });

  it('matches the control points of curveMonotoneX for three points', () => {
    // Middle tangent 0 (the slopes differ in sign); end tangents (3 * 1 - 0) / 2 = 1.5, so the first control point is 3.33 * 1.5 = 5 high.
    const d = monotonePath([{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 20, y: 0 }]);
    expect(d).toBe('M0 0 C3.33 5 6.67 10 10 10 C13.33 10 16.67 5 20 0');
  });

  it('passes through every point', () => {
    const pts = [{ x: 0, y: 5 }, { x: 10, y: 20 }, { x: 25, y: 12 }, { x: 40, y: 12 }, { x: 50, y: 30 }];
    const segs = segments(monotonePath(pts));
    expect(segs).toHaveLength(pts.length - 1);
    segs.forEach((s, i) => {
      expect(s[0]).toEqual([pts[i]?.x, pts[i]?.y]);
      expect(s[3]).toEqual([pts[i + 1]?.x, pts[i + 1]?.y]);
    });
  });

  it('never leaves the y range of two neighbouring points', () => {
    const sets = [
      [{ x: 0, y: 5 }, { x: 10, y: 20 }, { x: 25, y: 12 }, { x: 40, y: 12 }, { x: 50, y: 30 }],
      [{ x: 0, y: 0 }, { x: 1, y: 100 }, { x: 2, y: 101 }, { x: 3, y: 0 }],
      [{ x: 0, y: 10 }, { x: 5, y: 10 }, { x: 6, y: 50 }, { x: 30, y: 52 }],
    ];
    for (const pts of sets) {
      segments(monotonePath(pts)).forEach((s, i) => {
        const lo = Math.min(pts[i]?.y ?? 0, pts[i + 1]?.y ?? 0);
        const hi = Math.max(pts[i]?.y ?? 0, pts[i + 1]?.y ?? 0);
        for (let k = 0; k <= 50; k++) {
          const y = bezierY(s, k / 50);
          expect(y).toBeGreaterThanOrEqual(lo - 0.02);
          expect(y).toBeLessThanOrEqual(hi + 0.02);
        }
      });
    }
  });
});

const TAU = Math.PI * 2;

describe('arcPath', () => {
  it('starts at the centre and ends on the circle for a plain slice', () => {
    expect(arcPath(100, 100, 50, 0, Math.PI / 2)).toBe('M100 100L100 50A50 50 0 0 1 150 100Z');
  });

  it('measures angles clockwise from 12 o\'clock and flags a slice over half the circle', () => {
    expect(arcPath(0, 0, 10, Math.PI, TAU * 0.9)).toContain(' 0 0 1 ');
    expect(arcPath(0, 0, 10, 0, TAU * 0.75)).toContain(' 0 1 1 ');
  });

  it('is a circle for the whole turn', () => {
    const d = arcPath(10, 10, 5, 0, TAU);
    expect(d).toBe('M10 5A5 5 0 1 1 10 15A5 5 0 1 1 10 5Z');
  });

  it('moves the straight sides inward so neighbours are `gap` apart', () => {
    const a = 1;
    const first = arcPath(0, 0, 100, 0, a, { gap: 6 });
    const second = arcPath(0, 0, 100, a, 2, { gap: 6 });
    const pts = (d: string): number[] => (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
    // first: M apex L start A ... end Z; end point is the last pair before Z.
    const f = pts(first);
    const s = pts(second);
    const endOfFirst: [number, number] = [f[f.length - 2] ?? 0, f[f.length - 1] ?? 0];
    const startOfSecond: [number, number] = [s[2] ?? 0, s[3] ?? 0];
    expect(Math.hypot(endOfFirst[0] - startOfSecond[0], endOfFirst[1] - startOfSecond[1])).toBeCloseTo(6, 1);
    // The apex of a slice with a gap is off the centre along the bisector.
    expect(Math.hypot(f[0] ?? 0, f[1] ?? 0)).toBeCloseTo(3 / Math.sin(a / 2), 1);
  });

  it('rounds the two outer corners with arcs of the corner radius', () => {
    const d = arcPath(0, 0, 100, 0, 1.2, { gap: 4, corner: 4 });
    expect(d.match(/A4 4 0 0 1/g)).toHaveLength(2);
    expect(d.match(/A100 100/g)).toHaveLength(1);
  });

  it('keeps every arc end on the circle or the rounded corner', () => {
    const d = arcPath(50, 50, 40, 0.3, 2.9, { gap: 3, corner: 4 });
    const nums = (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
    // Points after each arc command: tangent point on the circle at index of first big arc.
    const big = d.indexOf('A40 40');
    const before = d.slice(0, big).match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
    const x = before[before.length - 2] ?? 0;
    const y = before[before.length - 1] ?? 0;
    expect(Math.hypot(x - 50, y - 50)).toBeCloseTo(40, 1);
    expect(nums.length).toBeGreaterThan(10);
  });

  it('drops the rounding when the slice is too thin for it', () => {
    const d = arcPath(0, 0, 100, 0, 0.02, { gap: 0, corner: 4 });
    expect(d).not.toContain('A4 4');
  });
});
