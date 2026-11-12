/**
 * A colour the source asks for is never painted as it is: it takes the nearest of the theme's eight series colours, so
 * that it stays in harmony in the dark scheme and in all three themes.
 */
import { SCENE_THEME_SPECS } from '../render/scene-theme.ts';

const SERIES = 8;
/** Below this saturation a colour reads as grey and takes the neutral last series. */
const GREY = 0.18;

function hsl(hex: string): { h: number; s: number } {
  const full = hex.length === 4 ? `#${[...hex.slice(1)].map((c) => c + c).join('')}` : hex;
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(full.slice(i, i + 2), 16) / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d > 0) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s };
}

/**
 * One-based series whose palette colour is nearest in hue to `hex`; a greyish colour takes the neutral last series.
 * With `skipFirst` the first series is never chosen, for charts where it is the colour of an unstyled mark.
 */
export function nearestSeries(hex: string, opts: { skipFirst?: boolean } = {}): number {
  const want = hsl(hex);
  if (want.s < GREY) return SERIES;
  const first = opts.skipFirst === true ? 2 : 1;
  let best = first;
  let bestGap = Infinity;
  for (let n = first; n < SERIES; n++) {
    const pair = SCENE_THEME_SPECS.solid.colors[`s${n}`];
    if (pair === undefined) continue;
    const gap = Math.abs(((hsl(pair[0]).h - want.h + 540) % 360) - 180);
    if (gap < bestGap) {
      best = n;
      bestGap = gap;
    }
  }
  return best;
}
