import { cellWidth } from '../metrics.ts';
import { clip } from '../text/fit.ts';

/** The fewest cells of a lane name worth writing when it is cut. */
const SHORT_NAME = 6;

export interface LaneNamePlace {
  /** The column the text starts in; a blank is written before it and after it. */
  at: number;
  text: string;
  /** Whether the name found no free place and is written over what crosses the rule. */
  over: boolean;
}

/**
 * Where the name of a horizontal lane is written on its rule, which runs from column `x0` to `x1`. The name stands at
 * `preferred` when the rule is bare there (`bare` says so by column); where a line crosses the rule at that place the
 * name moves to the right of a line (a cell and a blank after it), or to the first free stretch of the rule. A rule
 * too short for the name beside its lines lets the name run past its end, up to `limit`. With no room for the whole
 * name it is cut to the longest free stretch when that holds a few letters, and is written over the lines otherwise.
 */
export function placeLaneName(label: string, x0: number, x1: number, preferred: number, limit: number, bare: (x: number) => boolean): LaneNamePlace {
  const w = cellWidth(label);
  const free = (x: number): boolean => {
    for (let k = x - 1; k <= x + w; k++) if (k < x0 || k > x1 || !bare(k)) return false;
    return true;
  };
  const candidates = [preferred];
  for (let x = x0; x <= x1; x++) if (!bare(x)) candidates.push(x + 2);
  for (let x = preferred; x + w <= x1; x++) candidates.push(x);
  const past = (x: number): boolean => {
    if (x + w > limit) return false;
    for (let k = x - 1; k <= Math.min(x + w, x1); k++) if (k < x0 || !bare(k)) return false;
    return true;
  };
  const whole = candidates.find(free) ?? candidates.find(past);
  if (whole !== undefined) return { at: whole, text: label, over: false };
  let best = { from: 0, len: 0 };
  for (let x = x0, from = x0; x <= x1 + 1; x++) {
    if (x <= x1 && bare(x)) continue;
    if (x - from > best.len) best = { from, len: x - from };
    from = x + 1;
  }
  if (best.len >= SHORT_NAME + 4) return { at: best.from + 2, text: clip(label, best.len - 4), over: false };
  return { at: preferred, text: label, over: true };
}
