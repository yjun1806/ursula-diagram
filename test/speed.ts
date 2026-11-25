// Time limits in the speed tests are set on a developer machine. Shared CI runners are slower and noisier, so
// there the limits are three times as wide: the tests still catch a change that makes the engine much slower.
export const slack = process.env.CI ? 3 : 1;
export const within = (ms: number): number => ms * slack;
