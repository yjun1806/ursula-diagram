import { describe, expect, it } from 'vitest';
import { themeValues } from '../src/render/theme.ts';

function luminance(hex: string): number {
  const channel = (i: number): number => {
    const c = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const values = themeValues('band');
const of = (name: string, mode: 0 | 1): string => {
  const pair = values[name];
  if (pair === undefined) throw new Error(`no token ${name}`);
  const v = pair[mode];
  if (v === 'transparent') return of('surface', mode);
  return v;
};

describe.each([
  ['light', 0],
  ['dark', 1],
] as const)('band theme contrast (%s)', (_name, mode) => {
  it.each([
    ['fg', 'surface', 4.5],
    ['muted', 'surface', 4.5],
    ['fg', 'chip-fill', 4.5],
    ['on-accent', 'start-fill', 4.5],
    ['line', 'surface', 3],
    ['border', 'surface', 3],
  ] as const)('%s on %s is at least %d', (fg, bg, min) => {
    expect(contrast(of(fg, mode), of(bg, mode))).toBeGreaterThanOrEqual(min);
  });
});
