/** Counters for tests and measuring: how many drawings the engine made. Not part of any output. */
export const stats = {
  /** Layouts routed to the end (every call of `route`). */
  draws: 0,
  /** Placements that started from the rows (rows, ladder, order, alignment). */
  placements: 0,
  reset(): void {
    this.draws = 0;
    this.placements = 0;
  },
};
