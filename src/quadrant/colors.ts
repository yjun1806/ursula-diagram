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
 * One-based series for a point that asks for `hex`: the palette colour nearest in hue, never the first series, which is
 * the colour of an unstyled point; a greyish colour takes the neutral last series.
 */
export function styledSeries(hex: string): number {
  const want = hsl(hex);
  if (want.s < GREY) return SERIES;
  let best = 2;
  let bestGap = Infinity;
  for (let n = 2; n < SERIES; n++) {
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
