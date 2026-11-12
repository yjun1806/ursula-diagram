/** Spacing every drawn coordinate and size is a multiple of. */
export const GRID = 4;

/** Slack that keeps a value a hair above a multiple from jumping to the next one. */
export const FLOAT_NOISE = 1e-9;

/** The smallest multiple of `step` at or above `v`; a `tolerance` (in steps) forgives float noise above a multiple. */
export const ceilTo = (v: number, step: number = GRID, tolerance = 0): number => Math.ceil(v / step - tolerance) * step;

/** The largest multiple of `step` at or below `v`; a `tolerance` (in steps) forgives float noise below a multiple. */
export const floorTo = (v: number, step: number = GRID, tolerance = 0): number => Math.floor(v / step + tolerance) * step;

/** The multiple of `step` nearest to `v`. */
export const roundTo = (v: number, step: number = GRID): number => Math.round(v / step) * step;

/** `v` rounded to two decimals. */
export const round2 = (v: number): number => Math.round(v * 100) / 100;
