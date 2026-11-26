import { cellWidth } from '../metrics.ts';
import { UrsulaError } from '../types.ts';

/** An attempt at one width: the widest line drawn, or the least width a front-end asked for when it refused. */
export interface Attempt {
  fits: boolean;
  widest?: number;
  minWidth?: number;
}

/** Errors about room, not about the text. */
export const isTooNarrow = (err: UrsulaError): boolean => /width$/.test(err.code);

export const widestOf = (rows: readonly string[]): number => Math.max(0, ...rows.map(cellWidth));

/** Draws at `width` with `draw`, which returns the rows; a width error becomes an attempt that does not fit. */
export function attemptWith(draw: (width: number) => readonly string[]): (width: number) => Attempt {
  return (width) => {
    try {
      const widest = widestOf(draw(width));
      return { fits: widest <= width, widest };
    } catch (err) {
      if (err instanceof UrsulaError && isTooNarrow(err)) return { fits: false, ...(err.minWidth === undefined ? {} : { minWidth: err.minWidth }) };
      throw err;
    }
  };
}

const MOST = 8;

/**
 * The narrowest width above `limit` at which `attempt` fits, found with at most eight more drawings: grow from what
 * the first attempt says until a width fits, then halve the gap down to the limit. The search takes wider to mean
 * easier to fit, so the width is one that fits; a narrower one may fit too. `sure` is false when no width fitted.
 */
export function neededWidth(limit: number, first: Attempt, attempt: (width: number) => Attempt): { width: number; sure: boolean } {
  let draws = 0;
  let hi = Math.max(limit + 1, first.widest ?? 0, first.minWidth ?? 0);
  let fit: number | undefined;
  while (draws < MOST) {
    const a = attempt(hi);
    draws++;
    if (a.fits) {
      fit = hi;
      break;
    }
    hi = Math.max(hi + 1, a.widest ?? 0, a.minWidth ?? 0, a.widest === undefined && a.minWidth === undefined ? Math.ceil(hi * 1.5) : 0);
  }
  if (fit === undefined) return { width: hi, sure: false };
  let lo = limit + 1;
  while (lo < fit && draws < MOST) {
    const mid = Math.floor((lo + fit) / 2);
    draws++;
    if (attempt(mid).fits) fit = mid;
    else lo = mid + 1;
  }
  return { width: fit, sure: true };
}

/** The hint that goes with a width that fits. */
export const widthHint = (width: number): string => `hint: run again with --width ${width}, or shorten the names, or split the diagram`;
