export type TimelineDirection = 'LR' | 'TD';

/** One time period with the events that happened in it, each event as the lines a `<br>` splits it into. */
export interface TimelinePeriod {
  label: string[];
  events: string[][];
}

/** Periods under one `section`; periods before the first `section` form a group without a name. */
export interface TimelineGroup {
  name?: string[];
  periods: TimelinePeriod[];
}

export interface TimelineModel {
  direction: TimelineDirection;
  title?: string;
  groups: TimelineGroup[];
}
