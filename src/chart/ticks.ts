/** Nearest 1, 2, 5 or 10 times a power of ten to `value`. */
function niceStep(value: number): number {
  const exponent = Math.floor(Math.log10(value));
  const base = 10 ** exponent;
  const fraction = value / base;
  const nice = fraction < 1.5 ? 1 : fraction < 3 ? 2 : fraction < 7 ? 5 : 10;
  return nice * base;
}

/**
 * Tick values from the last multiple of the step at or below `min` to the first at or above `max`.
 * The step is 1, 2 or 5 times a power of ten, chosen so the number of ticks comes close to `maxCount`;
 * `maxCount` is a target, not a ceiling.
 */
export function niceTicks(min: number, max: number, maxCount = 6): number[] {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  const span = hi - lo || Math.abs(hi) || 1;
  const step = niceStep(span / Math.max(1, maxCount - 1));
  const decimals = Math.max(0, -Math.floor(Math.log10(step)));
  const first = Math.floor(lo / step + 1e-9);
  const last = Math.ceil(hi / step - 1e-9);
  const ticks: number[] = [];
  for (let i = first; i <= last; i++) ticks.push(Number((i * step).toFixed(decimals)));
  return ticks;
}
